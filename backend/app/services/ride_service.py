"""
Ride, Dispatch, GPS Telemetry, Delivery Job & Double-Entry Rider Ledger Service.
Enforces Bangladesh bounding box, GPS velocity sanity, Fair Price surge/weather caps,
atomic job claiming, throttled OTP verification, and integer-paisa ledger entries.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import logging
import math
import secrets
from typing import Any, Dict, List, Optional, Tuple
import uuid

from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    BadRequestError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
)
from app.models.local_commerce import MarketplaceOrder, MarketplaceOrderItem, MarketplaceSeller
from app.models.ride import (
    DeliveryJob,
    RideLocationPing,
    RideRequest,
    RideTrip,
    RiderEarningsLedger,
    RiderPayout,
    RiderProfile,
    RiderVehicle,
)
from app.schemas.ride import (
    BD_LAT_MAX,
    BD_LAT_MIN,
    BD_LNG_MAX,
    BD_LNG_MIN,
    MAX_VELOCITY_KMH,
    RIDER_COMMISSION_RATE,
    RIDER_MIN_CASHOUT_PAISA,
    RIDE_SURGE_CEILING,
    WEATHER_GUARD_CEILING,
    DeliveryOtpVerifyRequest,
    DeliveryPodSubmitRequest,
    DispatchClaimRequest,
    RideCompleteRequest,
    RideLocationPingRequest,
    RideQuoteRequest,
    RideQuoteResponse,
    RideRequestCreate,
    RideSosRequest,
    RiderDutyUpdateRequest,
    RiderEarningsSummaryResponse,
    RiderPayoutCreateRequest,
    RiderProfileCreateRequest,
    RiderProfileUpdateRequest,
    RiderVehicleCreateRequest,
    VehicleMode,
)

logger = logging.getLogger(__name__)

# Tier rate table synchronized with packages/shared/src/domain/rider.ts
VEHICLE_TIER_RATES: Dict[VehicleMode, Dict[str, Any]] = {
    VehicleMode.BIKE: {
        "base_fare_paisa": 3000,
        "per_km_paisa": 1200,
        "min_fare_paisa": 4000,
        "avg_speed_kmh": 24,
        "fuel_cost_per_km_bdt": Decimal("2.80"),
    },
    VehicleMode.CNG: {
        "base_fare_paisa": 5000,
        "per_km_paisa": 1800,
        "min_fare_paisa": 6500,
        "avg_speed_kmh": 20,
        "fuel_cost_per_km_bdt": Decimal("3.40"),
    },
    VehicleMode.SEDAN: {
        "base_fare_paisa": 8000,
        "per_km_paisa": 2800,
        "min_fare_paisa": 12000,
        "avg_speed_kmh": 22,
        "fuel_cost_per_km_bdt": Decimal("8.50"),
    },
    VehicleMode.SUV: {
        "base_fare_paisa": 12000,
        "per_km_paisa": 3800,
        "min_fare_paisa": 18000,
        "avg_speed_kmh": 22,
        "fuel_cost_per_km_bdt": Decimal("11.50"),
    },
    VehicleMode.BOAT: {
        "base_fare_paisa": 15000,
        "per_km_paisa": 4500,
        "min_fare_paisa": 20000,
        "avg_speed_kmh": 12,
        "fuel_cost_per_km_bdt": Decimal("14.00"),
    },
    VehicleMode.PARCEL_RIDER: {
        "base_fare_paisa": 4000,
        "per_km_paisa": 1000,
        "min_fare_paisa": 5000,
        "avg_speed_kmh": 25,
        "fuel_cost_per_km_bdt": Decimal("2.50"),
    },
}

# Standard platform promo rules (fallback when SQLite test DB has no promo_codes table)
PROMO_CATALOG: Dict[str, Dict[str, Any]] = {
    "SHOPNO10": {"type": "percentage", "amount": Decimal("10"), "min_spend_paisa": 10000, "max_discount_paisa": 20000},
    "EID15": {"type": "percentage", "amount": Decimal("15"), "min_spend_paisa": 20000, "max_discount_paisa": 30000},
    "DHAKA50": {"type": "fixed", "amount": Decimal("50"), "min_spend_paisa": 15000, "max_discount_paisa": 5000},
    "HERITAGE10": {"type": "percentage", "amount": Decimal("10"), "min_spend_paisa": 30000, "max_discount_paisa": 50000},
}

# In-memory OTP vault mirror for SQLite/unit-test environments where app_private.otp_vault schema does not exist
_LOCAL_OTP_VAULT: Dict[Tuple[str, str], Dict[str, Any]] = {}


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _round_paisa(val: Decimal) -> int:
    return int(val.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def haversine_distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance in kilometers between two GPS coordinates using Haversine formula."""
    earth_radius_km = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return round(earth_radius_km * c, 3)


def validate_bangladesh_bbox(lat: float, lng: float) -> None:
    """Validate coordinates are inside Bangladesh operational bounding box."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        raise BadRequestError("GPS coordinates must be finite numbers", code="INVALID_GPS")
    if not (BD_LAT_MIN <= lat <= BD_LAT_MAX and BD_LNG_MIN <= lng <= BD_LNG_MAX):
        raise BadRequestError(
            f"GPS coordinates ({lat}, {lng}) are outside Bangladesh service boundary",
            code="OUTSIDE_BANGLADESH_BBOX",
        )


def hash_otp_code(otp_code: str, target_id: uuid.UUID) -> str:
    """Deterministic SHA-256 OTP hash matching 20260623 SQL RPC format."""
    return hashlib.sha256(f"{otp_code.strip()}:{target_id}".encode("utf-8")).hexdigest()


def generate_numeric_otp(digits: int = 6) -> str:
    """Generate cryptographically secure numeric OTP."""
    return f"{secrets.randbelow(10 ** digits):0{digits}d}"


async def store_otp_in_vault(
    db: AsyncSession,
    target_type: str,
    target_id: uuid.UUID,
    owner_user_id: uuid.UUID,
    otp_code: str,
    expires_at: datetime,
) -> None:
    """Persist plaintext OTP in Postgres app_private.otp_vault or in-process SQLite test vault."""
    dialect_name = db.bind.dialect.name if db.bind is not None else "sqlite"
    if dialect_name == "postgresql":
        await db.execute(
            text(
                """
                INSERT INTO app_private.otp_vault (target_type, target_id, owner_user_id, otp_code, expires_at)
                VALUES (:tt, :tid, :uid, :otp, :exp)
                ON CONFLICT (target_type, target_id) DO UPDATE
                  SET otp_code = EXCLUDED.otp_code,
                      expires_at = EXCLUDED.expires_at,
                      consumed_at = NULL
                """
            ),
            {
                "tt": target_type,
                "tid": target_id,
                "uid": owner_user_id,
                "otp": otp_code,
                "exp": expires_at,
            },
        )
    else:
        _LOCAL_OTP_VAULT[(target_type, str(target_id))] = {
            "owner_user_id": owner_user_id,
            "otp_code": otp_code,
            "expires_at": expires_at,
            "consumed_at": None,
        }


async def read_otp_from_vault(
    db: AsyncSession,
    target_type: str,
    target_id: uuid.UUID,
    caller_id: uuid.UUID,
    is_admin: bool = False,
) -> Dict[str, Any]:
    """Retrieve OTP from vault strictly for the authorized owner or administrator."""
    dialect_name = db.bind.dialect.name if db.bind is not None else "sqlite"
    if dialect_name == "postgresql":
        row = (
            await db.execute(
                text(
                    """
                    SELECT owner_user_id, otp_code, expires_at, consumed_at
                    FROM app_private.otp_vault
                    WHERE target_type = :tt AND target_id = :tid
                    """
                ),
                {"tt": target_type, "tid": target_id},
            )
        ).first()
        if not row:
            raise NotFoundError("OtpVaultEntry", target_id)
        if not is_admin and row.owner_user_id != caller_id:
            raise PermissionDeniedError("Forbidden: cannot access another user's OTP")
        return {
            "otp_code": row.otp_code,
            "expires_at": row.expires_at,
            "consumed_at": row.consumed_at,
        }

    entry = _LOCAL_OTP_VAULT.get((target_type, str(target_id)))
    if not entry:
        raise NotFoundError("OtpVaultEntry", target_id)
    if not is_admin and entry["owner_user_id"] != caller_id:
        raise PermissionDeniedError("Forbidden: cannot access another user's OTP")
    return entry


async def mark_otp_consumed(
    db: AsyncSession,
    target_type: str,
    target_id: uuid.UUID,
    consumed_at: datetime,
) -> None:
    """Mark vaulted OTP as consumed."""
    dialect_name = db.bind.dialect.name if db.bind is not None else "sqlite"
    if dialect_name == "postgresql":
        await db.execute(
            text(
                """
                UPDATE app_private.otp_vault
                SET consumed_at = :cat
                WHERE target_type = :tt AND target_id = :tid
                """
            ),
            {"cat": consumed_at, "tt": target_type, "tid": target_id},
        )
    else:
        entry = _LOCAL_OTP_VAULT.get((target_type, str(target_id)))
        if entry:
            entry["consumed_at"] = consumed_at


def resolve_promo_discount_paisa(promo_code: Optional[str], subtotal_paisa: int) -> int:
    """Calculate promo discount in integer paisa using Decimal rounding."""
    if not promo_code or not promo_code.strip():
        return 0
    rule = PROMO_CATALOG.get(promo_code.strip().upper())
    if not rule or subtotal_paisa < rule["min_spend_paisa"]:
        return 0
    if rule["type"] == "percentage":
        raw_disc = _round_paisa(Decimal(subtotal_paisa) * rule["amount"] / Decimal("100"))
        return min(subtotal_paisa, min(raw_disc, rule["max_discount_paisa"]))
    fixed_paisa = _round_paisa(rule["amount"] * Decimal("100"))
    return min(subtotal_paisa, fixed_paisa)


class RideService:
    """Production service for Ride Quoting, Dispatch, GPS Telemetry, Delivery Jobs & Ledger."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # -------------------------------------------------------------------------
    # 1. RIDER PROFILE, VEHICLES & DUTY STATUS
    # -------------------------------------------------------------------------

    async def create_rider_profile(
        self, user_id: uuid.UUID, request: RiderProfileCreateRequest
    ) -> RiderProfile:
        existing = (
            await self.db.execute(select(RiderProfile).where(RiderProfile.user_id == user_id))
        ).scalar_one_or_none()
        if existing:
            raise ConflictError("Rider profile already exists for this user")

        profile = RiderProfile(
            user_id=user_id,
            full_name=request.full_name,
            phone=request.phone,
            nid_number=request.nid_number,
            driving_license_number=request.driving_license_number,
            kyc_status="submitted" if request.nid_number else "pending",
            duty_status="offline",
            active_vehicle_mode=request.active_vehicle_mode.value,
            home_city=request.home_city,
            service_zones=request.service_zones,
            daily_goal_paisa=request.daily_goal_paisa,
            emergency_contact_name=request.emergency_contact_name,
            emergency_contact_phone=request.emergency_contact_phone,
            preferred_payout_method=request.preferred_payout_method.value,
            payout_account_masked=request.payout_account_masked,
        )
        self.db.add(profile)
        await self.db.commit()
        await self.db.refresh(profile)
        return profile

    async def get_my_rider_profile(self, user_id: uuid.UUID) -> RiderProfile:
        profile = (
            await self.db.execute(select(RiderProfile).where(RiderProfile.user_id == user_id))
        ).scalar_one_or_none()
        if not profile:
            raise NotFoundError("RiderProfile", user_id)
        return profile

    async def update_my_rider_profile(
        self, user_id: uuid.UUID, request: RiderProfileUpdateRequest
    ) -> RiderProfile:
        profile = await self.get_my_rider_profile(user_id)
        if request.full_name is not None:
            profile.full_name = request.full_name
        if request.phone is not None:
            profile.phone = request.phone
        if request.active_vehicle_mode is not None:
            profile.active_vehicle_mode = request.active_vehicle_mode.value
        if request.active_vehicle_id is not None:
            vehicle = (
                await self.db.execute(
                    select(RiderVehicle).where(
                        RiderVehicle.id == request.active_vehicle_id,
                        RiderVehicle.rider_id == profile.id,
                    )
                )
            ).scalar_one_or_none()
            if not vehicle:
                raise NotFoundError("RiderVehicle", request.active_vehicle_id)
            profile.active_vehicle_id = vehicle.id
            profile.active_vehicle_mode = vehicle.vehicle_mode
        if request.home_city is not None:
            profile.home_city = request.home_city
        if request.service_zones is not None:
            profile.service_zones = request.service_zones
        if request.daily_goal_paisa is not None:
            profile.daily_goal_paisa = request.daily_goal_paisa
        if request.emergency_contact_name is not None:
            profile.emergency_contact_name = request.emergency_contact_name
        if request.emergency_contact_phone is not None:
            profile.emergency_contact_phone = request.emergency_contact_phone
        if request.preferred_payout_method is not None:
            profile.preferred_payout_method = request.preferred_payout_method.value
        if request.payout_account_masked is not None:
            profile.payout_account_masked = request.payout_account_masked

        await self.db.commit()
        await self.db.refresh(profile)
        return profile

    async def admin_verify_rider(
        self, rider_id: uuid.UUID, kyc_status: str, brta_verified: bool
    ) -> RiderProfile:
        profile = (
            await self.db.execute(select(RiderProfile).where(RiderProfile.id == rider_id))
        ).scalar_one_or_none()
        if not profile:
            raise NotFoundError("RiderProfile", rider_id)
        profile.kyc_status = kyc_status
        profile.brta_verified = brta_verified
        if kyc_status == "verified":
            profile.verified_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(profile)
        return profile

    async def update_duty_status(
        self, user_id: uuid.UUID, request: RiderDutyUpdateRequest
    ) -> RiderProfile:
        profile = await self.get_my_rider_profile(user_id)
        if request.duty_status.value in ("online", "on_trip") and profile.kyc_status != "verified":
            raise PermissionDeniedError(
                "KYC verification must be completed before going online"
            )
        if not profile.is_active:
            raise PermissionDeniedError("Rider account is inactive")

        if request.current_lat is not None or request.current_lng is not None:
            if request.current_lat is None or request.current_lng is None:
                raise BadRequestError("Both current_lat and current_lng must be provided together")
            validate_bangladesh_bbox(request.current_lat, request.current_lng)
            profile.current_lat = request.current_lat
            profile.current_lng = request.current_lng
            profile.last_location_at = datetime.now(timezone.utc)
        if request.current_heading is not None:
            profile.current_heading = request.current_heading
        if request.active_vehicle_mode is not None:
            profile.active_vehicle_mode = request.active_vehicle_mode.value

        profile.duty_status = request.duty_status.value
        await self.db.commit()
        await self.db.refresh(profile)
        return profile

    async def register_vehicle(
        self, user_id: uuid.UUID, request: RiderVehicleCreateRequest
    ) -> RiderVehicle:
        profile = await self.get_my_rider_profile(user_id)
        dup = (
            await self.db.execute(
                select(RiderVehicle).where(RiderVehicle.plate_number == request.plate_number.strip())
            )
        ).scalar_one_or_none()
        if dup:
            raise ConflictError(f"Vehicle with plate number '{request.plate_number}' already registered")

        if request.is_primary:
            existing_vehicles = (
                await self.db.execute(select(RiderVehicle).where(RiderVehicle.rider_id == profile.id))
            ).scalars().all()
            for v in existing_vehicles:
                v.is_primary = False

        vehicle = RiderVehicle(
            rider_id=profile.id,
            vehicle_mode=request.vehicle_mode.value,
            make_model=request.make_model,
            color=request.color,
            plate_number=request.plate_number.strip(),
            registration_number=request.registration_number,
            fitness_expiry=request.fitness_expiry,
            insurance_expiry=request.insurance_expiry,
            seat_capacity=request.seat_capacity,
            max_cargo_kg=request.max_cargo_kg,
            fuel_type=request.fuel_type.value,
            fuel_cost_per_km_bdt=request.fuel_cost_per_km_bdt,
            is_verified=False,
            is_primary=request.is_primary,
        )
        self.db.add(vehicle)
        await self.db.flush()

        if request.is_primary or profile.active_vehicle_id is None:
            profile.active_vehicle_id = vehicle.id
            profile.active_vehicle_mode = vehicle.vehicle_mode

        await self.db.commit()
        await self.db.refresh(vehicle)
        return vehicle

    async def list_my_vehicles(self, user_id: uuid.UUID) -> List[RiderVehicle]:
        profile = await self.get_my_rider_profile(user_id)
        rows = (
            await self.db.execute(
                select(RiderVehicle)
                .where(RiderVehicle.rider_id == profile.id, RiderVehicle.is_active.is_(True))
                .order_by(RiderVehicle.is_primary.desc(), RiderVehicle.created_at.desc())
            )
        ).scalars().all()
        return list(rows)

    # -------------------------------------------------------------------------
    # 2. DYNAMIC FARE QUOTING & RIDE REQUESTS
    # -------------------------------------------------------------------------

    def calculate_fare_quote(self, request: RideQuoteRequest) -> RideQuoteResponse:
        """Compute deterministic Decimal/integer-paisa fare quote with surge & weather guard."""
        validate_bangladesh_bbox(request.pickup.lat, request.pickup.lng)
        validate_bangladesh_bbox(request.dropoff.lat, request.dropoff.lng)

        tier = VEHICLE_TIER_RATES[request.vehicle_mode]
        raw_dist = haversine_distance_km(
            request.pickup.lat, request.pickup.lng, request.dropoff.lat, request.dropoff.lng
        )
        distance_km = max(Decimal("0.50"), Decimal(str(raw_dist)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        est_duration = max(3, int(math.ceil(float(distance_km) / tier["avg_speed_kmh"] * 60)))

        raw_surge = max(Decimal("1.00"), request.surge_multiplier)
        if request.severe_weather:
            ceiling = Decimal("1.00")
        elif request.weather_warning:
            ceiling = WEATHER_GUARD_CEILING
        else:
            ceiling = RIDE_SURGE_CEILING

        applied_surge = min(ceiling, raw_surge).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        is_surge_capped = raw_surge > applied_surge
        weather_guard = bool(request.weather_warning or request.severe_weather)

        base_fare_paisa = int(tier["base_fare_paisa"])
        distance_fare_paisa = _round_paisa(distance_km * Decimal(tier["per_km_paisa"]))
        surged_total = _round_paisa(Decimal(base_fare_paisa + distance_fare_paisa) * applied_surge)
        raw_total = max(int(tier["min_fare_paisa"]), surged_total)

        discount_paisa = resolve_promo_discount_paisa(request.promo_code, raw_total)
        quoted_fare_paisa = max(0, raw_total - discount_paisa)

        estimated_fuel_paisa = _round_paisa(distance_km * tier["fuel_cost_per_km_bdt"] * Decimal("100"))
        est_commission = _round_paisa(Decimal(quoted_fare_paisa) * RIDER_COMMISSION_RATE)
        est_rider_net = max(0, quoted_fare_paisa - est_commission)

        return RideQuoteResponse(
            vehicle_mode=request.vehicle_mode,
            distance_km=distance_km,
            estimated_duration_min=est_duration,
            base_fare_paisa=base_fare_paisa,
            distance_fare_paisa=distance_fare_paisa,
            raw_surge_multiplier=raw_surge,
            applied_surge_multiplier=applied_surge,
            is_surge_capped=is_surge_capped,
            weather_guard_applied=weather_guard,
            discount_paisa=discount_paisa,
            quoted_fare_paisa=quoted_fare_paisa,
            estimated_fuel_cost_paisa=estimated_fuel_paisa,
            estimated_commission_paisa=est_commission,
            estimated_rider_net_paisa=est_rider_net,
            currency="BDT",
        )

    async def create_ride_request(
        self, passenger_id: uuid.UUID, request: RideRequestCreate
    ) -> RideRequest:
        if request.idempotency_key:
            existing = (
                await self.db.execute(
                    select(RideRequest).where(RideRequest.idempotency_key == request.idempotency_key)
                )
            ).scalar_one_or_none()
            if existing:
                if existing.passenger_id != passenger_id:
                    raise ConflictError("Idempotency key already bound to another user")
                return existing

        quote = self.calculate_fare_quote(
            RideQuoteRequest(
                vehicle_mode=request.vehicle_mode,
                pickup={"lat": request.pickup_lat, "lng": request.pickup_lng},
                dropoff={"lat": request.dropoff_lat, "lng": request.dropoff_lng},
                ride_type=request.ride_type,
                promo_code=request.promo_code,
                surge_multiplier=request.surge_multiplier,
                weather_warning=request.weather_warning,
                severe_weather=request.severe_weather,
            )
        )

        ride_req = RideRequest(
            request_reference=f"SJ-RIDE-{uuid.uuid4().hex[:8].upper()}",
            passenger_id=passenger_id,
            vehicle_mode=request.vehicle_mode.value,
            ride_type=request.ride_type.value,
            status="searching",
            pickup_address=request.pickup_address,
            pickup_lat=request.pickup_lat,
            pickup_lng=request.pickup_lng,
            dropoff_address=request.dropoff_address,
            dropoff_lat=request.dropoff_lat,
            dropoff_lng=request.dropoff_lng,
            estimated_distance_km=quote.distance_km,
            estimated_duration_min=quote.estimated_duration_min,
            base_fare_paisa=quote.base_fare_paisa,
            distance_fare_paisa=quote.distance_fare_paisa,
            surge_multiplier=quote.applied_surge_multiplier,
            weather_guard_applied=quote.weather_guard_applied,
            promo_code=request.promo_code.strip().upper() if request.promo_code else None,
            discount_paisa=quote.discount_paisa,
            quoted_fare_paisa=quote.quoted_fare_paisa,
            currency="BDT",
            payment_method=request.payment_method.value,
            scheduled_for=request.scheduled_for,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
            idempotency_key=request.idempotency_key,
            notes=request.notes,
        )
        self.db.add(ride_req)
        await self.db.commit()
        await self.db.refresh(ride_req)
        return ride_req

    async def list_my_ride_requests(self, passenger_id: uuid.UUID) -> List[RideRequest]:
        rows = (
            await self.db.execute(
                select(RideRequest)
                .where(RideRequest.passenger_id == passenger_id)
                .order_by(RideRequest.created_at.desc())
            )
        ).scalars().all()
        return list(rows)

    async def cancel_ride_request(
        self, request_id: uuid.UUID, caller_id: uuid.UUID, reason: Optional[str] = None
    ) -> RideRequest:
        ride_req = (
            await self.db.execute(
                select(RideRequest).where(RideRequest.id == request_id).with_for_update()
            )
        ).scalar_one_or_none()
        if not ride_req:
            raise NotFoundError("RideRequest", request_id)
        if ride_req.passenger_id != caller_id:
            raise PermissionDeniedError("Only the requesting passenger can cancel this ride")
        if ride_req.status in ("in_progress", "completed", "cancelled"):
            raise ConflictError(f"Cannot cancel ride request in '{ride_req.status}' status")

        ride_req.status = "cancelled"
        ride_req.cancelled_by = caller_id
        ride_req.cancellation_reason = reason

        trip = (
            await self.db.execute(
                select(RideTrip).where(RideTrip.ride_request_id == ride_req.id).with_for_update()
            )
        ).scalar_one_or_none()
        if trip and trip.status in ("accepted", "arrived_pickup"):
            trip.status = "cancelled"
            trip.cancelled_at = datetime.now(timezone.utc)
            rider = (
                await self.db.execute(
                    select(RiderProfile).where(RiderProfile.id == trip.rider_id).with_for_update()
                )
            ).scalar_one_or_none()
            if rider and rider.duty_status == "on_trip":
                rider.duty_status = "online"

        await self.db.commit()
        await self.db.refresh(ride_req)
        return ride_req

    # -------------------------------------------------------------------------
    # 3. DISPATCH RADAR & ATOMIC CLAIMING
    # -------------------------------------------------------------------------

    async def get_available_dispatch(
        self,
        user_id: uuid.UUID,
        vehicle_mode: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Return open ride requests and open marketplace delivery jobs for verified riders."""
        rider = await self.get_my_rider_profile(user_id)
        if not rider.is_active or rider.kyc_status != "verified":
            raise PermissionDeniedError("Rider must be active and KYC verified to view dispatch jobs")
        if rider.duty_status != "online":
            raise BadRequestError("Rider must be online and available to view dispatch jobs")
        now = datetime.now(timezone.utc)

        effective_mode = vehicle_mode or rider.active_vehicle_mode
        ride_stmt = select(RideRequest).where(
            RideRequest.status == "searching",
            RideRequest.expires_at > now,
        )
        if effective_mode != "all":
            ride_stmt = ride_stmt.where(RideRequest.vehicle_mode == effective_mode)
        rides = (await self.db.execute(ride_stmt.order_by(RideRequest.created_at.asc()))).scalars().all()

        delivery_stmt = select(DeliveryJob).where(DeliveryJob.status == "open").order_by(DeliveryJob.created_at.asc())
        deliveries = (await self.db.execute(delivery_stmt)).scalars().all()

        return {"ride_requests": list(rides), "delivery_jobs": list(deliveries)}

    async def claim_dispatch(
        self, user_id: uuid.UUID, request: DispatchClaimRequest
    ) -> Dict[str, Any]:
        """Atomically claim a ride request or delivery job with row-level locks."""
        rider = (
            await self.db.execute(
                select(RiderProfile).where(RiderProfile.user_id == user_id).with_for_update()
            )
        ).scalar_one_or_none()
        if not rider:
            raise NotFoundError("RiderProfile", user_id)
        if not rider.is_active or rider.kyc_status != "verified":
            raise PermissionDeniedError("Rider must be active and KYC verified to claim jobs")
        if rider.duty_status != "online":
            raise BadRequestError(f"Rider must be online and available to claim jobs (current: {rider.duty_status})")

        now = datetime.now(timezone.utc)

        if request.target_type == "ride":
            if request.target_id:
                ride_req = (
                    await self.db.execute(
                        select(RideRequest).where(RideRequest.id == request.target_id).with_for_update()
                    )
                ).scalar_one_or_none()
                if not ride_req:
                    raise NotFoundError("RideRequest", request.target_id)
                if ride_req.status != "searching" or _as_utc(ride_req.expires_at) <= now:
                    raise ConflictError("Ride request unavailable or already claimed")
                if ride_req.vehicle_mode != rider.active_vehicle_mode:
                    raise ConflictError("Ride request requires a different vehicle mode")
            else:
                ride_req = (
                    await self.db.execute(
                        select(RideRequest)
                        .where(
                            RideRequest.status == "searching",
                            RideRequest.expires_at > now,
                            RideRequest.vehicle_mode == rider.active_vehicle_mode,
                        )
                        .order_by(RideRequest.created_at.asc())
                        .limit(1)
                        .with_for_update()
                    )
                ).scalar_one_or_none()
                if not ride_req:
                    raise NotFoundError("RideRequest", "next_available")

            trip_id = uuid.uuid4()
            otp_code = generate_numeric_otp(6)
            otp_hash = hash_otp_code(otp_code, trip_id)

            ride_req.status = "matched"
            ride_req.claimed_rider_id = rider.id

            trip = RideTrip(
                id=trip_id,
                ride_request_id=ride_req.id,
                passenger_id=ride_req.passenger_id,
                rider_id=rider.id,
                vehicle_id=rider.active_vehicle_id,
                status="accepted",
                start_otp_hash=otp_hash,
                gross_fare_paisa=ride_req.quoted_fare_paisa,
                currency=ride_req.currency,
                accepted_at=now,
            )
            self.db.add(trip)

            await store_otp_in_vault(
                db=self.db,
                target_type="ride_start",
                target_id=trip_id,
                owner_user_id=ride_req.passenger_id,
                otp_code=otp_code,
                expires_at=now + timedelta(hours=4),
            )

            rider.duty_status = "on_trip"
            await self.db.commit()
            await self.db.refresh(trip)
            return {"target_type": "ride", "trip": trip, "ride_request": ride_req}

        # target_type == "delivery"
        if request.target_id:
            job = (
                await self.db.execute(
                    select(DeliveryJob).where(DeliveryJob.id == request.target_id).with_for_update()
                )
            ).scalar_one_or_none()
            if not job:
                raise NotFoundError("DeliveryJob", request.target_id)
            if job.status != "open":
                raise ConflictError("Delivery job unavailable or already claimed")
        else:
            job = (
                await self.db.execute(
                    select(DeliveryJob)
                    .where(DeliveryJob.status == "open")
                    .order_by(DeliveryJob.created_at.asc())
                    .limit(1)
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if not job:
                raise NotFoundError("DeliveryJob", "next_available")

        job.status = "claimed"
        job.rider_id = rider.id
        job.claimed_at = now
        rider.duty_status = "on_trip"

        await self.db.commit()
        await self.db.refresh(job)
        return {"target_type": "delivery", "delivery_job": job}

    # -------------------------------------------------------------------------
    # 4. TRIP LIFECYCLE, OTP VERIFICATION, GPS TELEMETRY & SETTLEMENT
    # -------------------------------------------------------------------------

    async def get_trip(self, trip_id: uuid.UUID, caller_id: uuid.UUID, is_admin: bool = False) -> RideTrip:
        trip = (await self.db.execute(select(RideTrip).where(RideTrip.id == trip_id))).scalar_one_or_none()
        if not trip:
            raise NotFoundError("RideTrip", trip_id)
        rider = (
            await self.db.execute(select(RiderProfile).where(RiderProfile.id == trip.rider_id))
        ).scalar_one_or_none()
        if not is_admin and trip.passenger_id != caller_id and (not rider or rider.user_id != caller_id):
            raise PermissionDeniedError("Not authorized to view this ride trip")
        return trip

    async def get_trip_start_otp(
        self, trip_id: uuid.UUID, caller_id: uuid.UUID, is_admin: bool = False
    ) -> Dict[str, Any]:
        trip = await self.get_trip(trip_id, caller_id, is_admin=is_admin)
        if not is_admin and trip.passenger_id != caller_id:
            raise PermissionDeniedError("Only the passenger can retrieve the ride start OTP")
        entry = await read_otp_from_vault(self.db, "ride_start", trip.id, caller_id, is_admin=is_admin)
        return {
            "trip_id": trip.id,
            "otp_code": entry["otp_code"],
            "expires_at": entry["expires_at"],
            "consumed_at": entry.get("consumed_at"),
        }

    async def mark_driver_arrived(self, trip_id: uuid.UUID, user_id: uuid.UUID) -> RideTrip:
        trip = (
            await self.db.execute(select(RideTrip).where(RideTrip.id == trip_id).with_for_update())
        ).scalar_one_or_none()
        if not trip:
            raise NotFoundError("RideTrip", trip_id)
        rider = await self.get_my_rider_profile(user_id)
        if trip.rider_id != rider.id:
            raise PermissionDeniedError("Only the assigned rider can mark arrival")
        if trip.status != "accepted":
            raise ConflictError(f"Cannot mark arrival when trip is '{trip.status}'")

        now = datetime.now(timezone.utc)
        trip.status = "arrived_pickup"
        trip.arrived_at = now
        ride_req = (
            await self.db.execute(select(RideRequest).where(RideRequest.id == trip.ride_request_id))
        ).scalar_one_or_none()
        if ride_req:
            ride_req.status = "arrived"

        await self.db.commit()
        await self.db.refresh(trip)
        return trip

    async def verify_ride_start_otp(
        self, trip_id: uuid.UUID, user_id: uuid.UUID, otp: str
    ) -> Dict[str, Any]:
        trip = (
            await self.db.execute(select(RideTrip).where(RideTrip.id == trip_id).with_for_update())
        ).scalar_one_or_none()
        if not trip:
            raise NotFoundError("RideTrip", trip_id)

        rider = await self.get_my_rider_profile(user_id)
        if trip.rider_id != rider.id:
            raise PermissionDeniedError("Only the assigned rider can verify trip OTP")

        if trip.otp_verified:
            return {"verified": True, "already_verified": True, "status": trip.status, "trip": trip}

        if trip.otp_attempts >= 5:
            raise BadRequestError("OTP locked: maximum verification attempts exceeded", code="OTP_LOCKED")

        entered_hash = hash_otp_code(otp, trip.id)
        if not secrets.compare_digest(trip.start_otp_hash, entered_hash):
            trip.otp_attempts += 1
            await self.db.commit()
            remaining = max(0, 5 - trip.otp_attempts)
            raise BadRequestError(
                f"Invalid trip start OTP ({remaining} attempts remaining)",
                code="INVALID_OTP",
            )

        now = datetime.now(timezone.utc)
        trip.otp_verified = True
        trip.otp_verified_at = now
        trip.status = "in_progress"
        trip.started_at = trip.started_at or now

        ride_req = (
            await self.db.execute(select(RideRequest).where(RideRequest.id == trip.ride_request_id))
        ).scalar_one_or_none()
        if ride_req:
            ride_req.status = "in_progress"

        await mark_otp_consumed(self.db, "ride_start", trip.id, now)
        await self.db.commit()
        await self.db.refresh(trip)
        return {"verified": True, "already_verified": False, "status": trip.status, "trip": trip}

    async def ingest_location_ping(
        self,
        user_id: uuid.UUID,
        request: RideLocationPingRequest,
        trip_id: Optional[uuid.UUID] = None,
        delivery_job_id: Optional[uuid.UUID] = None,
    ) -> Dict[str, Any]:
        """Validate Bangladesh bbox, anti-mock flag, monotonic timestamp & velocity sanity."""
        if request.is_mock_location:
            raise BadRequestError("Mock GPS telemetry is strictly rejected", code="MOCK_GPS_REJECTED")

        validate_bangladesh_bbox(request.latitude, request.longitude)
        rider = await self.get_my_rider_profile(user_id)

        trip: Optional[RideTrip] = None
        if trip_id is not None:
            trip = (
                await self.db.execute(select(RideTrip).where(RideTrip.id == trip_id).with_for_update())
            ).scalar_one_or_none()
            if not trip:
                raise NotFoundError("RideTrip", trip_id)
            if trip.rider_id != rider.id:
                raise PermissionDeniedError("Only the assigned rider can send trip telemetry")
            if trip.status not in ("accepted", "arrived_pickup", "in_progress"):
                raise ConflictError(f"Cannot record GPS ping on '{trip.status}' trip")

        if delivery_job_id is not None:
            job = (
                await self.db.execute(
                    select(DeliveryJob).where(DeliveryJob.id == delivery_job_id).with_for_update()
                )
            ).scalar_one_or_none()
            if not job:
                raise NotFoundError("DeliveryJob", delivery_job_id)
            if job.rider_id != rider.id:
                raise PermissionDeniedError("Only the assigned rider can send delivery telemetry")

        ping_time = _as_utc(request.recorded_at) if request.recorded_at else datetime.now(timezone.utc)

        # Look up most recent ping on same target or rider for velocity & timestamp monotonicity check
        prev_stmt = select(RideLocationPing).where(RideLocationPing.rider_id == rider.id)
        if trip_id is not None:
            prev_stmt = prev_stmt.where(RideLocationPing.trip_id == trip_id)
        elif delivery_job_id is not None:
            prev_stmt = prev_stmt.where(RideLocationPing.delivery_job_id == delivery_job_id)
        prev_ping = (
            await self.db.execute(prev_stmt.order_by(RideLocationPing.recorded_at.desc()).limit(1))
        ).scalar_one_or_none()

        delta_km = 0.0
        computed_speed: Optional[float] = None
        if prev_ping is not None:
            prev_time = _as_utc(prev_ping.recorded_at)
            if ping_time <= prev_time:
                raise BadRequestError("Telemetry timestamp must strictly advance", code="STALE_TELEMETRY")

            delta_km = haversine_distance_km(
                prev_ping.latitude, prev_ping.longitude, request.latitude, request.longitude
            )
            elapsed_hours = (ping_time - prev_time).total_seconds() / 3600.0
            if elapsed_hours > 0:
                computed_speed = round(delta_km / elapsed_hours, 2)
                if computed_speed > MAX_VELOCITY_KMH and delta_km > 0.25:
                    raise BadRequestError(
                        f"Unrealistic GPS velocity ({computed_speed:.1f} km/h > {MAX_VELOCITY_KMH} km/h)",
                        code="VELOCITY_SANITY_FAILED",
                    )

        ping = RideLocationPing(
            trip_id=trip_id,
            delivery_job_id=delivery_job_id,
            rider_id=rider.id,
            latitude=request.latitude,
            longitude=request.longitude,
            accuracy_meters=request.accuracy_meters,
            speed_kmh=request.speed_kmh if request.speed_kmh is not None else computed_speed,
            heading=request.heading,
            altitude_meters=request.altitude_meters,
            battery_pct=request.battery_pct,
            is_mock_location=False,
            recorded_at=ping_time,
        )
        self.db.add(ping)

        rider.current_lat = request.latitude
        rider.current_lng = request.longitude
        if request.heading is not None:
            rider.current_heading = request.heading
        rider.last_location_at = ping_time

        if trip is not None and delta_km > 0:
            new_dist = Decimal(str(trip.actual_distance_km)) + Decimal(str(delta_km))
            trip.actual_distance_km = new_dist.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)

        await self.db.commit()
        await self.db.refresh(ping)
        return {
            "ping": ping,
            "computed_speed_kmh": computed_speed,
            "delta_distance_km": delta_km,
        }

    async def complete_and_settle_ride(
        self,
        trip_id: uuid.UUID,
        caller_id: uuid.UUID,
        request: RideCompleteRequest,
        is_admin: bool = False,
    ) -> RideTrip:
        """Finalize ride trip and post balanced double-entry rider earnings ledger entries."""
        trip = (
            await self.db.execute(select(RideTrip).where(RideTrip.id == trip_id).with_for_update())
        ).scalar_one_or_none()
        if not trip:
            raise NotFoundError("RideTrip", trip_id)

        rider = (
            await self.db.execute(
                select(RiderProfile).where(RiderProfile.id == trip.rider_id).with_for_update()
            )
        ).scalar_one_or_none()
        if not rider:
            raise NotFoundError("RiderProfile", trip.rider_id)

        if not is_admin and rider.user_id != caller_id and trip.passenger_id != caller_id:
            raise PermissionDeniedError("Not authorized to complete or settle this ride trip")

        if trip.settlement_status == "settled":
            return trip

        if not trip.otp_verified:
            raise BadRequestError("Cannot settle ride trip before OTP verification")

        ride_req = (
            await self.db.execute(select(RideRequest).where(RideRequest.id == trip.ride_request_id))
        ).scalar_one()

        distance_km = request.actual_distance_km or (
            trip.actual_distance_km if trip.actual_distance_km > 0 else ride_req.estimated_distance_km
        )
        duration_min = request.actual_duration_min or ride_req.estimated_duration_min
        gross_paisa = max(trip.gross_fare_paisa, ride_req.quoted_fare_paisa)
        commission_paisa = _round_paisa(Decimal(gross_paisa) * RIDER_COMMISSION_RATE)
        tip_paisa = max(0, request.tip_paisa)
        rider_net_paisa = max(0, gross_paisa - commission_paisa) + tip_paisa

        fuel_rate = Decimal("3.50")
        if trip.vehicle_id:
            vehicle = (
                await self.db.execute(select(RiderVehicle).where(RiderVehicle.id == trip.vehicle_id))
            ).scalar_one_or_none()
            if vehicle:
                fuel_rate = vehicle.fuel_cost_per_km_bdt
        else:
            tier = VEHICLE_TIER_RATES.get(VehicleMode(ride_req.vehicle_mode))
            if tier:
                fuel_rate = tier["fuel_cost_per_km_bdt"]
        fuel_paisa = _round_paisa(Decimal(str(distance_km)) * fuel_rate * Decimal("100"))

        now = datetime.now(timezone.utc)
        tx_group = uuid.uuid4()

        if gross_paisa > 0:
            self.db.add(
                RiderEarningsLedger(
                    rider_id=rider.id,
                    transaction_group=tx_group,
                    direction="credit",
                    entry_type="ride_fare",
                    amount_paisa=gross_paisa,
                    currency=trip.currency,
                    ride_trip_id=trip.id,
                    idempotency_key=f"ride_fare:{trip.id}",
                    memo=f"Gross fare for ride {ride_req.request_reference}",
                )
            )
        if commission_paisa > 0:
            self.db.add(
                RiderEarningsLedger(
                    rider_id=rider.id,
                    transaction_group=tx_group,
                    direction="debit",
                    entry_type="platform_commission",
                    amount_paisa=commission_paisa,
                    currency=trip.currency,
                    ride_trip_id=trip.id,
                    idempotency_key=f"ride_comm:{trip.id}",
                    memo=f"15% platform dispatch fee for {ride_req.request_reference}",
                )
            )
        if tip_paisa > 0:
            self.db.add(
                RiderEarningsLedger(
                    rider_id=rider.id,
                    transaction_group=tx_group,
                    direction="credit",
                    entry_type="tip",
                    amount_paisa=tip_paisa,
                    currency=trip.currency,
                    ride_trip_id=trip.id,
                    idempotency_key=f"ride_tip:{trip.id}",
                    memo=f"Passenger tip for {ride_req.request_reference}",
                )
            )

        trip.status = "completed"
        trip.completed_at = trip.completed_at or now
        trip.actual_distance_km = Decimal(str(distance_km)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
        trip.actual_duration_min = duration_min
        trip.gross_fare_paisa = gross_paisa
        trip.platform_commission_paisa = commission_paisa
        trip.rider_net_paisa = rider_net_paisa
        trip.estimated_fuel_cost_paisa = fuel_paisa
        trip.tip_paisa = tip_paisa
        trip.settlement_status = "settled"
        trip.settled_at = now

        ride_req.status = "completed"
        rider.total_rides += 1
        if rider.duty_status == "on_trip":
            rider.duty_status = "online"

        await self.db.commit()
        await self.db.refresh(trip)
        return trip

    async def trigger_trip_sos(
        self, trip_id: uuid.UUID, caller_id: uuid.UUID, request: RideSosRequest
    ) -> RideTrip:
        validate_bangladesh_bbox(request.latitude, request.longitude)
        trip = await self.get_trip(trip_id, caller_id)
        trip.sos_triggered = True
        trip.sos_triggered_at = datetime.now(timezone.utc)

        try:
            from app.notifications.events.marketplace import MarketplaceTripSosTriggeredEvent
            from app.notifications.outbox.publisher import OutboxPublisher

            sos_event = MarketplaceTripSosTriggeredEvent(
                session_id=trip.id,
                trip_id=trip.id,
                user_id=caller_id,
                actor_id=caller_id,
                latitude=request.latitude,
                longitude=request.longitude,
                source="ride_sos",
                deep_link="/(tabs)/marketplace",
                headers={
                    "source_service": "ride_service",
                    "causation_id": str(trip.id),
                },
            )
            await OutboxPublisher.publish_idempotent(
                self.db,
                sos_event,
                idempotency_key=f"ride_sos:{trip.id}",
            )
        except Exception as outbox_err:
            logger.warning(f"Could not stage MarketplaceTripSosTriggeredEvent in ride_service: {outbox_err}")

        await self.db.commit()
        await self.db.refresh(trip)
        logger.critical(
            f"[RIDE SOS] trip={trip.id} caller={caller_id} lat={request.latitude} lng={request.longitude}"
        )
        return trip

    # -------------------------------------------------------------------------
    # 5. DELIVERY JOBS, PICKUP/DELIVERY OTP, POD & ESCROW SETTLEMENT
    # -------------------------------------------------------------------------

    async def list_available_delivery_jobs(self) -> List[DeliveryJob]:
        rows = (
            await self.db.execute(
                select(DeliveryJob).where(DeliveryJob.status == "open").order_by(DeliveryJob.created_at.asc())
            )
        ).scalars().all()
        return list(rows)

    async def list_my_delivery_jobs(self, user_id: uuid.UUID) -> List[DeliveryJob]:
        rider = await self.get_my_rider_profile(user_id)
        rows = (
            await self.db.execute(
                select(DeliveryJob)
                .where(DeliveryJob.rider_id == rider.id)
                .order_by(DeliveryJob.created_at.desc())
            )
        ).scalars().all()
        return list(rows)

    async def verify_delivery_pickup_otp(
        self, job_id: uuid.UUID, user_id: uuid.UUID, request: DeliveryOtpVerifyRequest
    ) -> DeliveryJob:
        job = (
            await self.db.execute(select(DeliveryJob).where(DeliveryJob.id == job_id).with_for_update())
        ).scalar_one_or_none()
        if not job:
            raise NotFoundError("DeliveryJob", job_id)
        rider = await self.get_my_rider_profile(user_id)
        if job.rider_id != rider.id:
            raise PermissionDeniedError("Only the assigned rider can verify delivery pickup OTP")
        if job.pickup_otp_verified_at is not None:
            return job
        if job.pickup_otp_attempts >= 5:
            raise BadRequestError("Pickup OTP locked: maximum attempts exceeded", code="OTP_LOCKED")

        if not secrets.compare_digest(job.pickup_otp_hash, hash_otp_code(request.otp, job.id)):
            job.pickup_otp_attempts += 1
            await self.db.commit()
            raise BadRequestError(
                f"Invalid pickup OTP ({max(0, 5 - job.pickup_otp_attempts)} attempts remaining)",
                code="INVALID_OTP",
            )

        now = datetime.now(timezone.utc)
        job.pickup_otp_verified_at = now
        job.picked_up_at = now
        job.status = "picked_up"

        order = (
            await self.db.execute(select(MarketplaceOrder).where(MarketplaceOrder.id == job.order_id))
        ).scalar_one_or_none()
        if order and order.status in ("order_placed", "confirmed", "packing", "ready_for_pickup"):
            order.status = "in_transit"

        items = (
            await self.db.execute(
                select(MarketplaceOrderItem).where(
                    MarketplaceOrderItem.order_id == job.order_id,
                    MarketplaceOrderItem.seller_id == job.seller_id,
                )
            )
        ).scalars().all()
        for item in items:
            item.fulfillment_status = "handed_to_rider"

        await mark_otp_consumed(self.db, "delivery_pickup", job.id, now)
        await self.db.commit()
        await self.db.refresh(job)
        return job

    async def verify_delivery_dropoff_otp(
        self, job_id: uuid.UUID, user_id: uuid.UUID, request: DeliveryOtpVerifyRequest
    ) -> DeliveryJob:
        job = (
            await self.db.execute(select(DeliveryJob).where(DeliveryJob.id == job_id).with_for_update())
        ).scalar_one_or_none()
        if not job:
            raise NotFoundError("DeliveryJob", job_id)
        rider = (
            await self.db.execute(
                select(RiderProfile).where(RiderProfile.user_id == user_id).with_for_update()
            )
        ).scalar_one_or_none()
        if not rider or job.rider_id != rider.id:
            raise PermissionDeniedError("Only the assigned rider can verify delivery dropoff OTP")
        if job.delivery_otp_verified_at is not None:
            return job
        if job.pickup_otp_verified_at is None:
            raise BadRequestError("Parcel must be picked up with pickup OTP before dropoff verification")
        if job.delivery_otp_attempts >= 5:
            raise BadRequestError("Delivery OTP locked: maximum attempts exceeded", code="OTP_LOCKED")

        if not secrets.compare_digest(job.delivery_otp_hash, hash_otp_code(request.otp, job.id)):
            job.delivery_otp_attempts += 1
            await self.db.commit()
            raise BadRequestError(
                f"Invalid delivery OTP ({max(0, 5 - job.delivery_otp_attempts)} attempts remaining)",
                code="INVALID_OTP",
            )

        now = datetime.now(timezone.utc)
        job.delivery_otp_verified_at = now
        job.delivered_at = now
        job.status = "delivered"
        if request.pod_photo_url:
            job.pod_photo_url = request.pod_photo_url
        if request.pod_signature_hash:
            job.pod_signature_hash = request.pod_signature_hash
        if request.pod_recipient_name:
            job.pod_recipient_name = request.pod_recipient_name

        # Transition order items & order + release seller escrow
        items = (
            await self.db.execute(
                select(MarketplaceOrderItem).where(
                    MarketplaceOrderItem.order_id == job.order_id,
                    MarketplaceOrderItem.seller_id == job.seller_id,
                )
            )
        ).scalars().all()
        seller_release_paisa = sum(i.seller_payout_paisa for i in items)
        for item in items:
            item.fulfillment_status = "delivered"

        all_order_items = (
            await self.db.execute(
                select(MarketplaceOrderItem).where(MarketplaceOrderItem.order_id == job.order_id)
            )
        ).scalars().all()
        all_delivered = all(i.fulfillment_status == "delivered" for i in all_order_items)

        order = (
            await self.db.execute(
                select(MarketplaceOrder).where(MarketplaceOrder.id == job.order_id).with_for_update()
            )
        ).scalar_one_or_none()
        if order:
            if all_delivered:
                order.status = "delivered"
                order.delivered_at = now
                if order.payment_status == "escrowed":
                    order.payment_status = "released"

            if order.payment_status in ("escrowed", "released") and seller_release_paisa > 0:
                seller = (
                    await self.db.execute(
                        select(MarketplaceSeller).where(MarketplaceSeller.id == job.seller_id).with_for_update()
                    )
                ).scalar_one_or_none()
                if seller:
                    moved = min(seller.escrow_balance_paisa, seller_release_paisa)
                    seller.escrow_balance_paisa -= moved
                    seller.available_balance_paisa += seller_release_paisa

        # Record rider delivery fee earnings ledger idempotently
        existing_ledger = (
            await self.db.execute(
                select(RiderEarningsLedger).where(
                    RiderEarningsLedger.idempotency_key == f"dlv_fee:{job.id}"
                )
            )
        ).scalar_one_or_none()
        if not existing_ledger and job.delivery_fee_paisa > 0:
            tx_group = uuid.uuid4()
            self.db.add(
                RiderEarningsLedger(
                    rider_id=rider.id,
                    transaction_group=tx_group,
                    direction="credit",
                    entry_type="delivery_fee",
                    amount_paisa=job.delivery_fee_paisa,
                    currency=job.currency,
                    delivery_job_id=job.id,
                    idempotency_key=f"dlv_fee:{job.id}",
                    memo=f"Delivery fee for job {job.job_reference}",
                )
            )
            if job.platform_commission_paisa > 0:
                self.db.add(
                    RiderEarningsLedger(
                        rider_id=rider.id,
                        transaction_group=tx_group,
                        direction="debit",
                        entry_type="platform_commission",
                        amount_paisa=job.platform_commission_paisa,
                        currency=job.currency,
                        delivery_job_id=job.id,
                        idempotency_key=f"dlv_comm:{job.id}",
                        memo=f"Platform commission for job {job.job_reference}",
                    )
                )

        rider.total_deliveries += 1
        if rider.duty_status == "on_trip":
            rider.duty_status = "online"

        await mark_otp_consumed(self.db, "delivery_dropoff", job.id, now)
        await self.db.commit()
        await self.db.refresh(job)
        return job

    async def submit_delivery_pod(
        self, job_id: uuid.UUID, user_id: uuid.UUID, request: DeliveryPodSubmitRequest
    ) -> DeliveryJob:
        job = (
            await self.db.execute(select(DeliveryJob).where(DeliveryJob.id == job_id).with_for_update())
        ).scalar_one_or_none()
        if not job:
            raise NotFoundError("DeliveryJob", job_id)
        rider = await self.get_my_rider_profile(user_id)
        if job.rider_id != rider.id:
            raise PermissionDeniedError("Only the assigned rider can attach Proof of Delivery")
        job.pod_photo_url = request.pod_photo_url
        job.pod_signature_hash = request.pod_signature_hash
        job.pod_recipient_name = request.pod_recipient_name
        await self.db.commit()
        await self.db.refresh(job)
        return job

    # -------------------------------------------------------------------------
    # 6. DOUBLE-ENTRY EARNINGS LEDGER & PAYOUT REQUESTS
    # -------------------------------------------------------------------------

    async def get_earnings_summary(self, user_id: uuid.UUID) -> RiderEarningsSummaryResponse:
        rider = await self.get_my_rider_profile(user_id)
        entries = (
            await self.db.execute(
                select(RiderEarningsLedger).where(RiderEarningsLedger.rider_id == rider.id)
            )
        ).scalars().all()

        gross = sum(
            e.amount_paisa for e in entries if e.direction == "credit" and e.entry_type in ("ride_fare", "delivery_fee", "surge_bonus")
        )
        tips = sum(e.amount_paisa for e in entries if e.direction == "credit" and e.entry_type == "tip")
        commission = sum(
            e.amount_paisa for e in entries if e.direction == "debit" and e.entry_type == "platform_commission"
        )
        total_credits = sum(e.amount_paisa for e in entries if e.direction == "credit")
        total_debits = sum(e.amount_paisa for e in entries if e.direction == "debit")
        available_balance = max(0, total_credits - total_debits)

        trips_fuel = (
            await self.db.execute(
                select(func.coalesce(func.sum(RideTrip.estimated_fuel_cost_paisa), 0)).where(
                    RideTrip.rider_id == rider.id,
                    RideTrip.settlement_status == "settled",
                )
            )
        ).scalar() or 0

        payouts = (
            await self.db.execute(select(RiderPayout).where(RiderPayout.rider_id == rider.id))
        ).scalars().all()
        pending_payout = sum(p.amount_paisa for p in payouts if p.status in ("requested", "approved", "processing"))
        paid_out = sum(p.amount_paisa for p in payouts if p.status == "paid")

        net_earnings = max(0, gross + tips - commission)
        net_after_fuel = net_earnings - int(trips_fuel)

        goal_pct = Decimal("0.00")
        if rider.daily_goal_paisa > 0:
            goal_pct = min(
                Decimal("100.00"),
                (Decimal(net_earnings) * Decimal("100") / Decimal(rider.daily_goal_paisa)).quantize(
                    Decimal("0.01"), rounding=ROUND_HALF_UP
                ),
            )

        return RiderEarningsSummaryResponse(
            rider_id=rider.id,
            currency="BDT",
            gross_earnings_paisa=gross,
            commission_deducted_paisa=commission,
            tips_paisa=tips,
            estimated_fuel_cost_paisa=int(trips_fuel),
            net_earnings_paisa=net_earnings,
            net_profit_after_fuel_paisa=net_after_fuel,
            available_balance_paisa=available_balance,
            pending_payout_paisa=pending_payout,
            paid_out_paisa=paid_out,
            daily_goal_paisa=rider.daily_goal_paisa,
            daily_goal_progress_pct=goal_pct,
        )

    async def list_earnings_ledger(self, user_id: uuid.UUID) -> List[RiderEarningsLedger]:
        rider = await self.get_my_rider_profile(user_id)
        rows = (
            await self.db.execute(
                select(RiderEarningsLedger)
                .where(RiderEarningsLedger.rider_id == rider.id)
                .order_by(RiderEarningsLedger.created_at.desc())
            )
        ).scalars().all()
        return list(rows)

    async def request_payout(
        self, user_id: uuid.UUID, request: RiderPayoutCreateRequest
    ) -> RiderPayout:
        rider = (
            await self.db.execute(
                select(RiderProfile).where(RiderProfile.user_id == user_id).with_for_update()
            )
        ).scalar_one_or_none()
        if not rider:
            raise NotFoundError("RiderProfile", user_id)

        if request.idempotency_key:
            existing = (
                await self.db.execute(
                    select(RiderPayout).where(RiderPayout.idempotency_key == request.idempotency_key)
                )
            ).scalar_one_or_none()
            if existing:
                if existing.rider_id != rider.id:
                    raise ConflictError("Idempotency key belongs to another rider")
                return existing

        if request.amount_paisa < RIDER_MIN_CASHOUT_PAISA:
            raise BadRequestError(f"Minimum cashout is {RIDER_MIN_CASHOUT_PAISA} paisa (100 BDT)")

        summary = await self.get_earnings_summary(user_id)
        if request.amount_paisa > summary.available_balance_paisa:
            raise BadRequestError(
                f"Insufficient available balance ({summary.available_balance_paisa} paisa) for payout request",
                code="INSUFFICIENT_BALANCE",
            )

        payout_id = uuid.uuid4()
        payout_ref = f"SJ-RPY-{payout_id.hex[:8].upper()}"
        fee_paisa = 0
        net_amount = request.amount_paisa - fee_paisa

        payout = RiderPayout(
            id=payout_id,
            rider_id=rider.id,
            payout_reference=payout_ref,
            amount_paisa=request.amount_paisa,
            fee_paisa=fee_paisa,
            net_amount_paisa=net_amount,
            currency="BDT",
            channel=request.channel.value,
            account_number_masked=request.account_number_masked,
            status="requested",
            idempotency_key=request.idempotency_key,
        )
        self.db.add(payout)
        await self.db.flush()

        hold_entry = RiderEarningsLedger(
            rider_id=rider.id,
            transaction_group=uuid.uuid4(),
            direction="debit",
            entry_type="payout_hold",
            amount_paisa=request.amount_paisa,
            currency="BDT",
            payout_id=payout.id,
            idempotency_key=f"payout_hold:{payout.id}",
            memo=f"Payout hold {payout_ref} via {request.channel.value}",
        )
        self.db.add(hold_entry)
        await self.db.commit()
        await self.db.refresh(payout)
        return payout

    async def list_payouts(self, user_id: uuid.UUID) -> List[RiderPayout]:
        rider = await self.get_my_rider_profile(user_id)
        rows = (
            await self.db.execute(
                select(RiderPayout)
                .where(RiderPayout.rider_id == rider.id)
                .order_by(RiderPayout.created_at.desc())
            )
        ).scalars().all()
        return list(rows)
