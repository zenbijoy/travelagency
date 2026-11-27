"""
Pydantic v2 Schemas for Rider, Mobility & Parcel Delivery Partner API (/api/v1/rides/...).
Aligned with @shopnojatra/shared domain/rider.ts and 20260623 SQL migration.
"""

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Dict, List, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

BD_LAT_MIN = 20.30
BD_LAT_MAX = 26.75
BD_LNG_MIN = 88.00
BD_LNG_MAX = 92.75
MAX_VELOCITY_KMH = 160.0
RIDER_MIN_CASHOUT_PAISA = 10000
RIDE_SURGE_CEILING = Decimal("1.25")
WEATHER_GUARD_CEILING = Decimal("1.15")
RIDER_COMMISSION_RATE = Decimal("0.15")


class RiderKycStatus(str, Enum):
    PENDING = "pending"
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    VERIFIED = "verified"
    REJECTED = "rejected"
    SUSPENDED = "suspended"


class RiderDutyStatus(str, Enum):
    OFFLINE = "offline"
    ONLINE = "online"
    ON_TRIP = "on_trip"
    BREAK = "break"
    SUSPENDED = "suspended"


class VehicleMode(str, Enum):
    BIKE = "bike"
    CNG = "cng"
    SEDAN = "sedan"
    SUV = "suv"
    BOAT = "boat"
    PARCEL_RIDER = "parcel_rider"


class FuelType(str, Enum):
    OCTANE = "octane"
    CNG = "cng"
    DIESEL = "diesel"
    ELECTRIC = "electric"
    HUMAN = "human"


class RideType(str, Enum):
    ON_DEMAND = "on_demand"
    SCHEDULED = "scheduled"
    AIRPORT_PICKUP = "airport_pickup"
    HOURLY_RENTAL = "hourly_rental"
    INTERCITY = "intercity"


class RideRequestStatus(str, Enum):
    SEARCHING = "searching"
    MATCHED = "matched"
    DRIVER_EN_ROUTE = "driver_en_route"
    ARRIVED = "arrived"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class RideTripStatus(str, Enum):
    ACCEPTED = "accepted"
    ARRIVED_PICKUP = "arrived_pickup"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    DISPUTED = "disputed"


class RideSettlementStatus(str, Enum):
    UNSETTLED = "unsettled"
    SETTLED = "settled"
    DISPUTED = "disputed"
    REFUNDED = "refunded"


class RidePaymentMethod(str, Enum):
    CASH = "cash"
    WALLET = "wallet"
    BKASH = "bkash"
    NAGAD = "nagad"
    ROCKET = "rocket"
    CARD = "card"


class DeliveryTier(str, Enum):
    SHOPNO_EXPRESS = "shopno_express"
    HOTEL_CONCIERGE = "hotel_concierge"
    INTER_DISTRICT_COURIER = "inter_district_courier"
    SAME_DAY = "same_day"


class DeliveryJobStatus(str, Enum):
    OPEN = "open"
    CLAIMED = "claimed"
    EN_ROUTE_PICKUP = "en_route_pickup"
    PICKED_UP = "picked_up"
    IN_TRANSIT = "in_transit"
    ARRIVED_DROPOFF = "arrived_dropoff"
    DELIVERED = "delivered"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RETURNED = "returned"


class RiderLedgerDirection(str, Enum):
    CREDIT = "credit"
    DEBIT = "debit"


class RiderLedgerEntryType(str, Enum):
    RIDE_FARE = "ride_fare"
    DELIVERY_FEE = "delivery_fee"
    SURGE_BONUS = "surge_bonus"
    TIP = "tip"
    PLATFORM_COMMISSION = "platform_commission"
    FUEL_ESTIMATE = "fuel_estimate"
    PAYOUT_HOLD = "payout_hold"
    PAYOUT_DISBURSED = "payout_disbursed"
    PAYOUT_REVERSAL = "payout_reversal"
    PENALTY = "penalty"
    ADJUSTMENT = "adjustment"


class PayoutChannel(str, Enum):
    BKASH = "bkash"
    NAGAD = "nagad"
    ROCKET = "rocket"
    BANK_TRANSFER = "bank_transfer"


class RiderPayoutStatus(str, Enum):
    REQUESTED = "requested"
    APPROVED = "approved"
    PROCESSING = "processing"
    PAID = "paid"
    FAILED = "failed"
    CANCELLED = "cancelled"


def _validate_bd_lat(lat: float) -> float:
    if not (BD_LAT_MIN <= lat <= BD_LAT_MAX):
        raise ValueError(f"Latitude {lat} is outside Bangladesh bounding box ({BD_LAT_MIN}..{BD_LAT_MAX})")
    return lat


def _validate_bd_lng(lng: float) -> float:
    if not (BD_LNG_MIN <= lng <= BD_LNG_MAX):
        raise ValueError(f"Longitude {lng} is outside Bangladesh bounding box ({BD_LNG_MIN}..{BD_LNG_MAX})")
    return lng


class BangladeshCoords(BaseModel):
    lat: float = Field(..., ge=BD_LAT_MIN, le=BD_LAT_MAX)
    lng: float = Field(..., ge=BD_LNG_MIN, le=BD_LNG_MAX)


# ============================================================================
# RIDER PROFILE & VEHICLE SCHEMAS
# ============================================================================

class RiderProfileCreateRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120)
    phone: str = Field(..., min_length=6, max_length=30)
    nid_number: Optional[str] = Field(None, max_length=32)
    driving_license_number: Optional[str] = Field(None, max_length=40)
    active_vehicle_mode: VehicleMode = VehicleMode.BIKE
    home_city: str = Field(default="Dhaka", min_length=2, max_length=80)
    service_zones: List[str] = Field(default_factory=list)
    daily_goal_paisa: int = Field(default=150000, ge=0, le=50_000_000)
    emergency_contact_name: Optional[str] = Field(None, max_length=120)
    emergency_contact_phone: Optional[str] = Field(None, max_length=30)
    preferred_payout_method: PayoutChannel = PayoutChannel.BKASH
    payout_account_masked: Optional[str] = Field(None, max_length=64)


class RiderProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=120)
    phone: Optional[str] = Field(None, min_length=6, max_length=30)
    active_vehicle_mode: Optional[VehicleMode] = None
    active_vehicle_id: Optional[uuid.UUID] = None
    home_city: Optional[str] = Field(None, min_length=2, max_length=80)
    service_zones: Optional[List[str]] = None
    daily_goal_paisa: Optional[int] = Field(None, ge=0, le=50_000_000)
    emergency_contact_name: Optional[str] = Field(None, max_length=120)
    emergency_contact_phone: Optional[str] = Field(None, max_length=30)
    preferred_payout_method: Optional[PayoutChannel] = None
    payout_account_masked: Optional[str] = Field(None, max_length=64)


class RiderDutyUpdateRequest(BaseModel):
    duty_status: RiderDutyStatus
    active_vehicle_mode: Optional[VehicleMode] = None
    current_lat: Optional[float] = Field(None, ge=-90.0, le=90.0)
    current_lng: Optional[float] = Field(None, ge=-180.0, le=180.0)
    current_heading: Optional[float] = Field(None, ge=0.0, le=360.0)


class RiderAdminVerifyRequest(BaseModel):
    kyc_status: RiderKycStatus = RiderKycStatus.VERIFIED
    brta_verified: bool = True


class RiderProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    full_name: str
    phone: str
    nid_number: Optional[str] = None
    driving_license_number: Optional[str] = None
    brta_verified: bool
    kyc_status: str
    duty_status: str
    active_vehicle_mode: str
    active_vehicle_id: Optional[uuid.UUID] = None
    home_city: str
    service_zones: List[str] = Field(default_factory=list)
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None
    current_heading: Optional[float] = None
    last_location_at: Optional[datetime] = None
    rating: Decimal
    total_rides: int
    total_deliveries: int
    acceptance_rate: Decimal
    cancellation_rate: Decimal
    daily_goal_paisa: int
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    preferred_payout_method: str
    payout_account_masked: Optional[str] = None
    is_active: bool
    verified_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class RiderVehicleCreateRequest(BaseModel):
    vehicle_mode: VehicleMode
    make_model: str = Field(..., min_length=2, max_length=120)
    color: Optional[str] = Field(None, max_length=40)
    plate_number: str = Field(..., min_length=3, max_length=40)
    registration_number: Optional[str] = Field(None, max_length=60)
    fitness_expiry: Optional[date] = None
    insurance_expiry: Optional[date] = None
    seat_capacity: int = Field(default=1, ge=1, le=20)
    max_cargo_kg: Decimal = Field(default=Decimal("20.00"), ge=0, le=5000)
    fuel_type: FuelType = FuelType.OCTANE
    fuel_cost_per_km_bdt: Decimal = Field(default=Decimal("3.50"), ge=0, le=200)
    is_primary: bool = True


class RiderVehicleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    rider_id: uuid.UUID
    vehicle_mode: str
    make_model: str
    color: Optional[str] = None
    plate_number: str
    registration_number: Optional[str] = None
    fitness_expiry: Optional[date] = None
    insurance_expiry: Optional[date] = None
    seat_capacity: int
    max_cargo_kg: Decimal
    fuel_type: str
    fuel_cost_per_km_bdt: Decimal
    is_verified: bool
    is_primary: bool
    is_active: bool
    created_at: datetime


# ============================================================================
# FARE QUOTING, RIDE REQUESTS & DISPATCH SCHEMAS
# ============================================================================

class RideQuoteRequest(BaseModel):
    vehicle_mode: VehicleMode
    pickup: BangladeshCoords
    dropoff: BangladeshCoords
    ride_type: RideType = RideType.ON_DEMAND
    promo_code: Optional[str] = Field(None, max_length=40)
    surge_multiplier: Decimal = Field(default=Decimal("1.00"), ge=Decimal("1.00"), le=Decimal("3.00"))
    weather_warning: bool = False
    severe_weather: bool = False


class RideQuoteResponse(BaseModel):
    vehicle_mode: VehicleMode
    distance_km: Decimal
    estimated_duration_min: int
    base_fare_paisa: int
    distance_fare_paisa: int
    raw_surge_multiplier: Decimal
    applied_surge_multiplier: Decimal
    is_surge_capped: bool
    weather_guard_applied: bool
    discount_paisa: int
    quoted_fare_paisa: int
    estimated_fuel_cost_paisa: int
    estimated_commission_paisa: int
    estimated_rider_net_paisa: int
    currency: str = "BDT"


class RideRequestCreate(BaseModel):
    vehicle_mode: VehicleMode
    ride_type: RideType = RideType.ON_DEMAND
    pickup_address: str = Field(..., min_length=2, max_length=300)
    pickup_lat: float = Field(..., ge=-90.0, le=90.0)
    pickup_lng: float = Field(..., ge=-180.0, le=180.0)
    dropoff_address: str = Field(..., min_length=2, max_length=300)
    dropoff_lat: float = Field(..., ge=-90.0, le=90.0)
    dropoff_lng: float = Field(..., ge=-180.0, le=180.0)
    payment_method: RidePaymentMethod = RidePaymentMethod.CASH
    promo_code: Optional[str] = Field(None, max_length=40)
    surge_multiplier: Decimal = Field(default=Decimal("1.00"), ge=Decimal("1.00"), le=Decimal("3.00"))
    weather_warning: bool = False
    severe_weather: bool = False
    scheduled_for: Optional[datetime] = None
    idempotency_key: Optional[str] = Field(None, min_length=8, max_length=120)
    notes: Optional[str] = Field(None, max_length=500)

    @field_validator("pickup_lat", "dropoff_lat")
    @classmethod
    def check_bd_lat(cls, v: float) -> float:
        return _validate_bd_lat(v)

    @field_validator("pickup_lng", "dropoff_lng")
    @classmethod
    def check_bd_lng(cls, v: float) -> float:
        return _validate_bd_lng(v)


class RideCancelRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=300)


class RideRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    request_reference: str
    passenger_id: uuid.UUID
    claimed_rider_id: Optional[uuid.UUID] = None
    vehicle_mode: str
    ride_type: str
    status: str
    pickup_address: str
    pickup_lat: float
    pickup_lng: float
    dropoff_address: str
    dropoff_lat: float
    dropoff_lng: float
    estimated_distance_km: Decimal
    estimated_duration_min: int
    base_fare_paisa: int
    distance_fare_paisa: int
    surge_multiplier: Decimal
    weather_guard_applied: bool
    promo_code: Optional[str] = None
    discount_paisa: int
    quoted_fare_paisa: int
    currency: str
    payment_method: str
    scheduled_for: Optional[datetime] = None
    expires_at: datetime
    notes: Optional[str] = None
    created_at: datetime


class DispatchClaimRequest(BaseModel):
    target_type: str = Field(..., pattern="^(ride|delivery)$")
    target_id: Optional[uuid.UUID] = None


class RideTripResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ride_request_id: uuid.UUID
    passenger_id: uuid.UUID
    rider_id: uuid.UUID
    vehicle_id: Optional[uuid.UUID] = None
    status: str
    otp_verified: bool
    otp_verified_at: Optional[datetime] = None
    otp_attempts: int
    accepted_at: datetime
    arrived_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    actual_distance_km: Decimal
    actual_duration_min: int
    gross_fare_paisa: int
    platform_commission_paisa: int
    rider_net_paisa: int
    estimated_fuel_cost_paisa: int
    tip_paisa: int
    currency: str
    settlement_status: str
    settled_at: Optional[datetime] = None
    sos_triggered: bool
    sos_triggered_at: Optional[datetime] = None
    created_at: datetime


class RideOtpVerifyRequest(BaseModel):
    otp: str = Field(..., pattern=r"^[0-9]{4,6}$")


class RideOtpRevealResponse(BaseModel):
    trip_id: uuid.UUID
    otp_code: str
    expires_at: datetime
    consumed_at: Optional[datetime] = None


class RideCompleteRequest(BaseModel):
    actual_distance_km: Optional[Decimal] = Field(None, gt=0, le=2000)
    actual_duration_min: Optional[int] = Field(None, gt=0, le=2880)
    tip_paisa: int = Field(default=0, ge=0, le=5_000_000)


class RideLocationPingRequest(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    accuracy_meters: Optional[float] = Field(None, ge=0, le=5000)
    speed_kmh: Optional[float] = Field(None, ge=0, le=220)
    heading: Optional[float] = Field(None, ge=0, le=360)
    altitude_meters: Optional[float] = None
    battery_pct: Optional[int] = Field(None, ge=0, le=100)
    is_mock_location: bool = False
    recorded_at: Optional[datetime] = None


class RideLocationPingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    trip_id: Optional[uuid.UUID] = None
    delivery_job_id: Optional[uuid.UUID] = None
    rider_id: uuid.UUID
    latitude: float
    longitude: float
    speed_kmh: Optional[float] = None
    heading: Optional[float] = None
    recorded_at: datetime
    computed_speed_kmh: Optional[float] = None
    delta_distance_km: Optional[float] = None


class RideSosRequest(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    notes: Optional[str] = Field(None, max_length=500)


# ============================================================================
# DELIVERY JOBS & POD SCHEMAS
# ============================================================================

class DeliveryJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    job_reference: str
    order_id: uuid.UUID
    seller_id: uuid.UUID
    buyer_id: uuid.UUID
    rider_id: Optional[uuid.UUID] = None
    batch_group_id: Optional[uuid.UUID] = None
    delivery_tier: str
    status: str
    pickup_address: str
    pickup_lat: float
    pickup_lng: float
    pickup_contact_name: str
    pickup_contact_phone: str
    dropoff_address: str
    dropoff_lat: float
    dropoff_lng: float
    dropoff_contact_name: str
    dropoff_contact_phone: str
    hotel_id: Optional[uuid.UUID] = None
    hotel_room_number: Optional[str] = None
    package_weight_kg: Decimal
    package_summary: str
    is_fragile: bool
    is_perishable: bool
    estimated_distance_km: Decimal
    delivery_fee_paisa: int
    rider_payout_paisa: int
    platform_commission_paisa: int
    cod_amount_paisa: int
    currency: str
    pickup_otp_verified_at: Optional[datetime] = None
    delivery_otp_verified_at: Optional[datetime] = None
    pod_photo_url: Optional[str] = None
    pod_signature_hash: Optional[str] = None
    pod_recipient_name: Optional[str] = None
    claimed_at: Optional[datetime] = None
    picked_up_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    created_at: datetime


class DeliveryOtpVerifyRequest(BaseModel):
    otp: str = Field(..., pattern=r"^[0-9]{4,6}$")
    pod_photo_url: Optional[str] = Field(None, max_length=1000)
    pod_signature_hash: Optional[str] = Field(None, max_length=256)
    pod_recipient_name: Optional[str] = Field(None, max_length=120)


class DeliveryPodSubmitRequest(BaseModel):
    pod_photo_url: Optional[str] = Field(None, max_length=1000)
    pod_signature_hash: Optional[str] = Field(None, max_length=256)
    pod_recipient_name: str = Field(..., min_length=2, max_length=120)

    @model_validator(mode="after")
    def require_photo_or_signature(self) -> "DeliveryPodSubmitRequest":
        if not (self.pod_photo_url or self.pod_signature_hash):
            raise ValueError("Either pod_photo_url or pod_signature_hash is required for Proof of Delivery")
        return self


# ============================================================================
# EARNINGS LEDGER & PAYOUT SCHEMAS
# ============================================================================

class RiderEarningsEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    rider_id: uuid.UUID
    transaction_group: uuid.UUID
    direction: str
    entry_type: str
    amount_paisa: int
    currency: str
    ride_trip_id: Optional[uuid.UUID] = None
    delivery_job_id: Optional[uuid.UUID] = None
    payout_id: Optional[uuid.UUID] = None
    memo: Optional[str] = None
    created_at: datetime


class RiderEarningsSummaryResponse(BaseModel):
    rider_id: uuid.UUID
    currency: str = "BDT"
    gross_earnings_paisa: int
    commission_deducted_paisa: int
    tips_paisa: int
    estimated_fuel_cost_paisa: int
    net_earnings_paisa: int
    net_profit_after_fuel_paisa: int
    available_balance_paisa: int
    pending_payout_paisa: int
    paid_out_paisa: int
    daily_goal_paisa: int
    daily_goal_progress_pct: Decimal


class RiderPayoutCreateRequest(BaseModel):
    amount_paisa: int = Field(..., ge=RIDER_MIN_CASHOUT_PAISA, le=50_000_000)
    channel: PayoutChannel
    account_number_masked: str = Field(..., min_length=4, max_length=64)
    idempotency_key: Optional[str] = Field(None, min_length=8, max_length=120)


class RiderPayoutResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    rider_id: uuid.UUID
    payout_reference: str
    amount_paisa: int
    fee_paisa: int
    net_amount_paisa: int
    currency: str
    channel: str
    account_number_masked: str
    status: str
    gateway_reference: Optional[str] = None
    failure_reason: Optional[str] = None
    requested_at: datetime
    processed_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
