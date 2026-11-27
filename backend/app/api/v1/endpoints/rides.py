"""
Rides & Delivery Partner API Endpoints (/api/v1/rides/...).
Covers Dynamic Fare Quotes, Ride Request & Dispatch Matching,
Rider Online/Offline & GPS Telemetry Ingestion (with Bangladesh bbox & velocity validation),
OTP Start Verification, Parcel Delivery Job Claiming & Proof-of-Delivery,
Double-Entry Earnings Ledger & Payout Requests.
"""

import logging
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, require_admin_permission
from app.schemas.ride import (
    DeliveryJobResponse,
    DeliveryOtpVerifyRequest,
    DeliveryPodSubmitRequest,
    DispatchClaimRequest,
    RideCancelRequest,
    RideCompleteRequest,
    RideLocationPingRequest,
    RideLocationPingResponse,
    RideOtpRevealResponse,
    RideOtpVerifyRequest,
    RideQuoteRequest,
    RideQuoteResponse,
    RideRequestCreate,
    RideRequestResponse,
    RiderAdminVerifyRequest,
    RiderDutyUpdateRequest,
    RiderEarningsEntryResponse,
    RiderEarningsSummaryResponse,
    RiderPayoutCreateRequest,
    RiderPayoutResponse,
    RiderProfileCreateRequest,
    RiderProfileResponse,
    RiderProfileUpdateRequest,
    RiderVehicleCreateRequest,
    RiderVehicleResponse,
    RideSosRequest,
    RideTripResponse,
)
from app.schemas.user import CurrentUser
from app.services.ride_service import RideService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rides", tags=["Rides & Delivery Partner"])


# ============================================================================
# 1. FARE QUOTE & RIDE REQUEST DISPATCH
# ============================================================================

@router.post(
    "/quote",
    response_model=RideQuoteResponse,
    status_code=status.HTTP_200_OK,
    summary="Compute dynamic ride fare quote with distance, vehicle tier, and surge/weather ceiling",
)
async def get_fare_quote(
    request: RideQuoteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Calculates deterministic upfront fare quote with weather/surge capping."""
    service = RideService(db)
    return service.calculate_fare_quote(request)


@router.post(
    "/requests",
    response_model=RideRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new on-demand or pre-scheduled ride request",
)
async def create_ride_request(
    request: RideRequestCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Creates a ride request and initiates nearby driver discovery."""
    service = RideService(db)
    return await service.create_ride_request(current_user.id, request)


@router.get(
    "/requests",
    response_model=List[RideRequestResponse],
    status_code=status.HTTP_200_OK,
    summary="List active or recent ride requests for current passenger",
)
async def list_my_ride_requests(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves all ride requests created by the current authenticated passenger."""
    service = RideService(db)
    return await service.list_my_ride_requests(current_user.id)


@router.post(
    "/requests/{request_id}/cancel",
    response_model=RideRequestResponse,
    status_code=status.HTTP_200_OK,
    summary="Cancel a pending or accepted ride request",
)
async def cancel_ride_request(
    request_id: uuid.UUID,
    payload: RideCancelRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Passenger cancels a ride request before trip start."""
    service = RideService(db)
    return await service.cancel_ride_request(
        request_id=request_id,
        caller_id=current_user.id,
        reason=payload.reason,
    )


# ============================================================================
# 2. DISPATCH RADAR & DRIVER CLAIMING
# ============================================================================

@router.get(
    "/dispatch/radar",
    status_code=status.HTTP_200_OK,
    summary="Discover open ride requests and marketplace delivery jobs",
)
async def get_available_dispatch(
    vehicle_mode: Optional[str] = Query(None, description="Optional vehicle mode filter or 'all'"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Retrieves open rides and open delivery jobs waiting for rider assignment."""
    service = RideService(db)
    res = await service.get_available_dispatch(
        user_id=current_user.id,
        vehicle_mode=vehicle_mode,
    )
    return {
        "ride_requests": [RideRequestResponse.model_validate(r) for r in res["ride_requests"]],
        "delivery_jobs": [DeliveryJobResponse.model_validate(d) for d in res["delivery_jobs"]],
    }


@router.post(
    "/dispatch/claim",
    status_code=status.HTTP_200_OK,
    summary="Driver claims an open ride request or delivery job atomically",
)
async def claim_dispatch(
    payload: DispatchClaimRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Claims a ride or delivery job using deterministic pessimistic locking."""
    service = RideService(db)
    res = await service.claim_dispatch(current_user.id, payload)
    out: Dict[str, Any] = {"target_type": res["target_type"]}
    if res.get("trip") is not None:
        out["trip"] = RideTripResponse.model_validate(res["trip"])
    if res.get("ride_request") is not None:
        out["ride_request"] = RideRequestResponse.model_validate(res["ride_request"])
    if res.get("delivery_job") is not None:
        out["delivery_job"] = DeliveryJobResponse.model_validate(res["delivery_job"])
    return out


# ============================================================================
# 3. LIVE RIDE TRIP LIFECYCLE & TELEMETRY
# ============================================================================

@router.get(
    "/trips/{trip_id}",
    response_model=RideTripResponse,
    status_code=status.HTTP_200_OK,
    summary="Get trip details, status, and telemetry",
)
async def get_trip(
    trip_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Inspects a trip (authorized for trip passenger, driver, or admin)."""
    service = RideService(db)
    return await service.get_trip(
        trip_id=trip_id,
        caller_id=current_user.id,
        is_admin=current_user.is_active_admin,
    )


@router.get(
    "/trips/{trip_id}/otp",
    response_model=RideOtpRevealResponse,
    status_code=status.HTTP_200_OK,
    summary="Passenger retrieves trip start 6-digit OTP",
)
async def get_trip_start_otp(
    trip_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves the secure ride start OTP code for the passenger."""
    service = RideService(db)
    res = await service.get_trip_start_otp(
        trip_id=trip_id,
        caller_id=current_user.id,
        is_admin=current_user.is_active_admin,
    )
    return RideOtpRevealResponse(**res)


@router.post(
    "/trips/{trip_id}/arrived",
    response_model=RideTripResponse,
    status_code=status.HTTP_200_OK,
    summary="Driver marks arrival at passenger pickup location",
)
async def mark_driver_arrived(
    trip_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Driver notifies passenger of arrival at pickup point."""
    service = RideService(db)
    return await service.mark_driver_arrived(trip_id, current_user.id)


@router.post(
    "/trips/{trip_id}/verify-otp",
    response_model=RideTripResponse,
    status_code=status.HTTP_200_OK,
    summary="Driver verifies passenger OTP to commence trip",
)
async def verify_ride_start_otp(
    trip_id: uuid.UUID,
    payload: RideOtpVerifyRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verifies the start OTP against secure vault and starts trip."""
    service = RideService(db)
    res = await service.verify_ride_start_otp(trip_id, current_user.id, payload.otp)
    return res["trip"]


@router.post(
    "/trips/{trip_id}/location",
    response_model=RideLocationPingResponse,
    status_code=status.HTTP_200_OK,
    summary="Ingest live GPS location telemetry ping with velocity sanity checks",
)
async def ingest_trip_location_ping(
    trip_id: uuid.UUID,
    payload: RideLocationPingRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Validates Bangladesh coordinates, mock detection, and velocity sanity."""
    service = RideService(db)
    res = await service.ingest_location_ping(current_user.id, payload, trip_id=trip_id)
    ping = res["ping"]
    return RideLocationPingResponse(
        id=ping.id,
        trip_id=ping.trip_id,
        delivery_job_id=ping.delivery_job_id,
        rider_id=ping.rider_id,
        latitude=ping.latitude,
        longitude=ping.longitude,
        speed_kmh=ping.speed_kmh,
        heading=ping.heading,
        recorded_at=ping.recorded_at,
        computed_speed_kmh=res["computed_speed_kmh"],
        delta_distance_km=res["delta_distance_km"],
    )


@router.post(
    "/trips/{trip_id}/complete",
    response_model=RideTripResponse,
    status_code=status.HTTP_200_OK,
    summary="Complete ride trip, calculate final metered fare, and commit double-entry ledger",
)
async def complete_and_settle_ride(
    trip_id: uuid.UUID,
    payload: RideCompleteRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Driver ends trip with actual distance/duration and triggers atomic financial settlement."""
    service = RideService(db)
    return await service.complete_and_settle_ride(
        trip_id=trip_id,
        caller_id=current_user.id,
        request=payload,
        is_admin=current_user.is_active_admin,
    )


@router.post(
    "/trips/{trip_id}/sos",
    response_model=RideTripResponse,
    status_code=status.HTTP_200_OK,
    summary="Trigger emergency SOS event for in-progress trip",
)
async def trigger_trip_sos(
    trip_id: uuid.UUID,
    payload: RideSosRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Flags trip with emergency SOS status and records coordinates."""
    service = RideService(db)
    return await service.trigger_trip_sos(
        trip_id=trip_id,
        caller_id=current_user.id,
        request=payload,
    )


# ============================================================================
# 4. MARKETPLACE DELIVERY JOBS
# ============================================================================

@router.get(
    "/deliveries",
    response_model=List[DeliveryJobResponse],
    status_code=status.HTTP_200_OK,
    summary="List open parcel delivery jobs available for rider claiming",
)
async def list_available_delivery_jobs(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves all open marketplace delivery jobs waiting for pickup."""
    service = RideService(db)
    return await service.list_available_delivery_jobs()


@router.get(
    "/deliveries/my",
    response_model=List[DeliveryJobResponse],
    status_code=status.HTTP_200_OK,
    summary="List active and completed delivery jobs assigned to current rider",
)
async def list_my_delivery_jobs(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves all delivery jobs claimed by the current rider."""
    service = RideService(db)
    return await service.list_my_delivery_jobs(current_user.id)


@router.post(
    "/deliveries/{job_id}/verify-pickup",
    response_model=DeliveryJobResponse,
    status_code=status.HTTP_200_OK,
    summary="Rider verifies seller pickup OTP and transitions parcel to picked_up",
)
async def verify_delivery_pickup(
    job_id: uuid.UUID,
    payload: DeliveryOtpVerifyRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verifies merchant handoff OTP and begins transit."""
    service = RideService(db)
    return await service.verify_delivery_pickup_otp(job_id, current_user.id, payload)


@router.post(
    "/deliveries/{job_id}/verify-dropoff",
    response_model=DeliveryJobResponse,
    status_code=status.HTTP_200_OK,
    summary="Rider verifies customer delivery OTP, submits optional POD, and releases escrow",
)
async def verify_delivery_dropoff(
    job_id: uuid.UUID,
    payload: DeliveryOtpVerifyRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verifies buyer recipient delivery OTP and settles delivery earnings."""
    service = RideService(db)
    return await service.verify_delivery_dropoff_otp(job_id, current_user.id, payload)


@router.post(
    "/deliveries/{job_id}/pod",
    response_model=DeliveryJobResponse,
    status_code=status.HTTP_200_OK,
    summary="Submit or attach Proof of Delivery (POD) photo and signature",
)
async def submit_delivery_pod(
    job_id: uuid.UUID,
    payload: DeliveryPodSubmitRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Records proof of delivery photo, signature hash, and recipient name."""
    service = RideService(db)
    return await service.submit_delivery_pod(job_id, current_user.id, payload)


@router.post(
    "/deliveries/{job_id}/location",
    response_model=RideLocationPingResponse,
    status_code=status.HTTP_200_OK,
    summary="Ingest parcel delivery location telemetry ping",
)
async def ingest_delivery_location_ping(
    job_id: uuid.UUID,
    payload: RideLocationPingRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Ingests delivery tracking ping."""
    service = RideService(db)
    res = await service.ingest_location_ping(current_user.id, payload, delivery_job_id=job_id)
    ping = res["ping"]
    return RideLocationPingResponse(
        id=ping.id,
        trip_id=ping.trip_id,
        delivery_job_id=ping.delivery_job_id,
        rider_id=ping.rider_id,
        latitude=ping.latitude,
        longitude=ping.longitude,
        speed_kmh=ping.speed_kmh,
        heading=ping.heading,
        recorded_at=ping.recorded_at,
        computed_speed_kmh=res["computed_speed_kmh"],
        delta_distance_km=res["delta_distance_km"],
    )


# ============================================================================
# 5. RIDER PROFILE, DUTY STATUS & VEHICLE MANAGEMENT
# ============================================================================

@router.post(
    "/riders/profile",
    response_model=RiderProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new rider profile",
)
async def create_rider_profile(
    payload: RiderProfileCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Onboards authenticated user as a mobility/delivery rider."""
    service = RideService(db)
    return await service.create_rider_profile(current_user.id, payload)


@router.get(
    "/riders/profile/me",
    response_model=RiderProfileResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current rider profile, verification status, and metrics",
)
async def get_my_rider_profile(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves profile of the calling rider."""
    service = RideService(db)
    return await service.get_my_rider_profile(current_user.id)


@router.patch(
    "/riders/profile/me",
    response_model=RiderProfileResponse,
    status_code=status.HTTP_200_OK,
    summary="Update rider profile details, preferences, and payout accounts",
)
async def update_my_rider_profile(
    payload: RiderProfileUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Updates rider settings, payout channels, and active vehicle selection."""
    service = RideService(db)
    return await service.update_my_rider_profile(current_user.id, payload)


@router.post(
    "/riders/duty",
    response_model=RiderProfileResponse,
    status_code=status.HTTP_200_OK,
    summary="Toggle rider duty status (online, offline, break)",
)
async def update_duty_status(
    payload: RiderDutyUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Updates rider online presence and registers initial location coordinate."""
    service = RideService(db)
    return await service.update_duty_status(current_user.id, payload)


@router.post(
    "/riders/vehicles",
    response_model=RiderVehicleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register vehicle under rider profile",
)
async def register_vehicle(
    payload: RiderVehicleCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Registers bike, CNG, sedan, SUV, or boat with BRTA registration number."""
    service = RideService(db)
    return await service.register_vehicle(current_user.id, payload)


@router.get(
    "/riders/vehicles",
    response_model=List[RiderVehicleResponse],
    status_code=status.HTTP_200_OK,
    summary="List all registered vehicles for current rider",
)
async def list_my_vehicles(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves all registered vehicles owned by current rider."""
    service = RideService(db)
    return await service.list_my_vehicles(current_user.id)


# ============================================================================
# 6. DOUBLE-ENTRY EARNINGS LEDGER & PAYOUTS
# ============================================================================

@router.get(
    "/riders/earnings",
    response_model=RiderEarningsSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get rider cumulative earnings, available balance, tips, and deductions",
)
async def get_earnings_summary(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Calculates available balance in paisa and daily progress summary."""
    service = RideService(db)
    return await service.get_earnings_summary(current_user.id)


@router.get(
    "/riders/earnings/ledger",
    response_model=List[RiderEarningsEntryResponse],
    status_code=status.HTTP_200_OK,
    summary="List immutable double-entry ledger transactions for rider",
)
async def list_earnings_ledger(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves chronological accounting entries for rider payouts, fares, and tips."""
    service = RideService(db)
    return await service.list_earnings_ledger(current_user.id)


@router.post(
    "/riders/payouts",
    response_model=RiderPayoutResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Request a cashout payout to bKash, Nagad, Rocket, or Bank",
)
async def request_payout(
    payload: RiderPayoutCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Debits rider available balance atomically and generates payout request."""
    service = RideService(db)
    return await service.request_payout(current_user.id, payload)


@router.get(
    "/riders/payouts",
    response_model=List[RiderPayoutResponse],
    status_code=status.HTTP_200_OK,
    summary="List historical payout disbursement requests",
)
async def list_payouts(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves payout history for the calling rider."""
    service = RideService(db)
    return await service.list_payouts(current_user.id)


# ============================================================================
# 7. ADMIN VERIFICATION
# ============================================================================

@router.post(
    "/admin/riders/{rider_id}/verify",
    response_model=RiderProfileResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_admin_permission("users.verify_kyc"))],
    summary="Admin verification of rider KYC and BRTA document check",
)
async def admin_verify_rider(
    rider_id: uuid.UUID,
    payload: RiderAdminVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    """Approves or rejects rider KYC verification."""
    service = RideService(db)
    return await service.admin_verify_rider(
        rider_id=rider_id,
        kyc_status=payload.kyc_status.value,
        brta_verified=payload.brta_verified,
    )
