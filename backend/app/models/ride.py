"""
SQLAlchemy 2.0 Models for Rider, Mobility & Parcel Delivery Partner Ecosystem.
Aligned with supabase/migrations/20260623_rider_hotel_marketplace_production.sql.
Uses integer paisa accounting (1 BDT = 100 paisa) and immutable earnings ledger guards.
"""

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
import uuid

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    Text,
    event,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin

JSON_ARRAY_TEXT = JSON().with_variant(ARRAY(Text), "postgresql")
JSON_JSONB = JSON().with_variant(JSONB, "postgresql")


class RiderProfile(Base, UUIDMixin, TimestampMixin):
    """Corresponds to public.rider_profiles."""
    __tablename__ = "rider_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    phone: Mapped[str] = mapped_column(Text, nullable=False)
    nid_number: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    driving_license_number: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    brta_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    kyc_status: Mapped[str] = mapped_column(Text, default="pending", nullable=False, index=True)
    duty_status: Mapped[str] = mapped_column(Text, default="offline", nullable=False, index=True)
    active_vehicle_mode: Mapped[str] = mapped_column(Text, default="bike", nullable=False)
    active_vehicle_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("rider_vehicles.id", ondelete="SET NULL", use_alter=True, name="fk_rider_profiles_active_vehicle"),
        nullable=True,
    )
    home_city: Mapped[str] = mapped_column(Text, default="Dhaka", nullable=False)
    service_zones: Mapped[List[str]] = mapped_column(JSON_ARRAY_TEXT, default=list, nullable=False)
    current_lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    current_lng: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    current_heading: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    last_location_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rating: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=Decimal("5.00"), nullable=False)
    total_rides: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_deliveries: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    acceptance_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("100.00"), nullable=False)
    cancellation_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.00"), nullable=False)
    daily_goal_paisa: Mapped[int] = mapped_column(BigInteger, default=150000, nullable=False)
    emergency_contact_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    emergency_contact_phone: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    preferred_payout_method: Mapped[str] = mapped_column(Text, default="bkash", nullable=False)
    payout_account_masked: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    vehicles: Mapped[List["RiderVehicle"]] = relationship(
        "RiderVehicle",
        back_populates="rider",
        foreign_keys="RiderVehicle.rider_id",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint(
            "kyc_status IN ('pending', 'submitted', 'under_review', 'verified', 'rejected', 'suspended')",
            name="chk_rider_profiles_kyc_status",
        ),
        CheckConstraint(
            "duty_status IN ('offline', 'online', 'on_trip', 'break', 'suspended')",
            name="chk_rider_profiles_duty_status",
        ),
        CheckConstraint(
            "active_vehicle_mode IN ('bike', 'cng', 'sedan', 'suv', 'boat', 'parcel_rider')",
            name="chk_rider_profiles_vehicle_mode",
        ),
        CheckConstraint(
            "preferred_payout_method IN ('bkash', 'nagad', 'rocket', 'bank_transfer')",
            name="chk_rider_profiles_payout_method",
        ),
    )


class RiderVehicle(Base, UUIDMixin, TimestampMixin):
    """Corresponds to public.rider_vehicles."""
    __tablename__ = "rider_vehicles"

    rider_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rider_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vehicle_mode: Mapped[str] = mapped_column(Text, nullable=False)
    make_model: Mapped[str] = mapped_column(Text, nullable=False)
    color: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    plate_number: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    registration_number: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fitness_expiry: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    insurance_expiry: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    seat_capacity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    max_cargo_kg: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("20.00"), nullable=False)
    fuel_type: Mapped[str] = mapped_column(Text, default="octane", nullable=False)
    fuel_cost_per_km_bdt: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("3.50"), nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    documents: Mapped[List[Dict[str, Any]]] = mapped_column(JSON_JSONB, default=list, nullable=False)

    rider: Mapped["RiderProfile"] = relationship(
        "RiderProfile", back_populates="vehicles", foreign_keys=[rider_id]
    )

    __table_args__ = (
        CheckConstraint(
            "vehicle_mode IN ('bike', 'cng', 'sedan', 'suv', 'boat', 'parcel_rider')",
            name="chk_rider_vehicles_mode",
        ),
        CheckConstraint(
            "fuel_type IN ('octane', 'cng', 'diesel', 'electric', 'human')",
            name="chk_rider_vehicles_fuel",
        ),
    )


class RideRequest(Base, UUIDMixin, TimestampMixin):
    """Corresponds to public.ride_requests."""
    __tablename__ = "ride_requests"

    request_reference: Mapped[str] = mapped_column(Text, unique=True, nullable=False, index=True)
    passenger_id: Mapped[uuid.UUID] = mapped_column(index=True, nullable=False)
    claimed_rider_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("rider_profiles.id", ondelete="SET NULL"), index=True, nullable=True
    )
    vehicle_mode: Mapped[str] = mapped_column(Text, nullable=False)
    ride_type: Mapped[str] = mapped_column(Text, default="on_demand", nullable=False)
    status: Mapped[str] = mapped_column(Text, default="searching", nullable=False, index=True)
    pickup_address: Mapped[str] = mapped_column(Text, nullable=False)
    pickup_lat: Mapped[float] = mapped_column(Float, nullable=False)
    pickup_lng: Mapped[float] = mapped_column(Float, nullable=False)
    dropoff_address: Mapped[str] = mapped_column(Text, nullable=False)
    dropoff_lat: Mapped[float] = mapped_column(Float, nullable=False)
    dropoff_lng: Mapped[float] = mapped_column(Float, nullable=False)
    estimated_distance_km: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    estimated_duration_min: Mapped[int] = mapped_column(Integer, nullable=False)
    base_fare_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False)
    distance_fare_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    surge_multiplier: Mapped[Decimal] = mapped_column(Numeric(4, 2), default=Decimal("1.00"), nullable=False)
    weather_guard_applied: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    promo_code: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    discount_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    quoted_fare_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(Text, default="BDT", nullable=False)
    payment_method: Mapped[str] = mapped_column(Text, default="cash", nullable=False)
    scheduled_for: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    idempotency_key: Mapped[Optional[str]] = mapped_column(Text, unique=True, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[Dict[str, Any]] = mapped_column("metadata", JSON_JSONB, default=dict, nullable=False)
    cancelled_by: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    cancellation_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    trip: Mapped[Optional["RideTrip"]] = relationship("RideTrip", back_populates="ride_request", uselist=False)

    __table_args__ = (
        CheckConstraint(
            "vehicle_mode IN ('bike', 'cng', 'sedan', 'suv', 'boat', 'parcel_rider')",
            name="chk_ride_requests_vehicle_mode",
        ),
        CheckConstraint(
            "ride_type IN ('on_demand', 'scheduled', 'airport_pickup', 'hourly_rental', 'intercity')",
            name="chk_ride_requests_ride_type",
        ),
        CheckConstraint(
            "status IN ('searching', 'matched', 'driver_en_route', 'arrived', 'in_progress', 'completed', 'cancelled', 'expired')",
            name="chk_ride_requests_status",
        ),
        CheckConstraint(
            "payment_method IN ('cash', 'wallet', 'bkash', 'nagad', 'rocket', 'card')",
            name="chk_ride_requests_payment_method",
        ),
        CheckConstraint("surge_multiplier >= 1.00 AND surge_multiplier <= 1.25", name="chk_ride_requests_surge"),
    )


class RideTrip(Base, UUIDMixin, TimestampMixin):
    """Corresponds to public.ride_trips."""
    __tablename__ = "ride_trips"

    ride_request_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("ride_requests.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    passenger_id: Mapped[uuid.UUID] = mapped_column(index=True, nullable=False)
    rider_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rider_profiles.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    vehicle_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("rider_vehicles.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(Text, default="accepted", nullable=False, index=True)
    start_otp_hash: Mapped[str] = mapped_column(Text, nullable=False)
    otp_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    otp_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    otp_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    accepted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    arrived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_distance_km: Mapped[Decimal] = mapped_column(Numeric(8, 3), default=Decimal("0.000"), nullable=False)
    actual_duration_min: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    gross_fare_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    platform_commission_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    rider_net_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    estimated_fuel_cost_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    tip_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(Text, default="BDT", nullable=False)
    settlement_status: Mapped[str] = mapped_column(Text, default="unsettled", nullable=False)
    settled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    sos_triggered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sos_triggered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    passenger_rating: Mapped[Optional[Decimal]] = mapped_column(Numeric(3, 2), nullable=True)
    rider_rating: Mapped[Optional[Decimal]] = mapped_column(Numeric(3, 2), nullable=True)

    ride_request: Mapped["RideRequest"] = relationship("RideRequest", back_populates="trip")

    __table_args__ = (
        CheckConstraint(
            "status IN ('accepted', 'arrived_pickup', 'in_progress', 'completed', 'cancelled', 'disputed')",
            name="chk_ride_trips_status",
        ),
        CheckConstraint(
            "settlement_status IN ('unsettled', 'settled', 'disputed', 'refunded')",
            name="chk_ride_trips_settlement",
        ),
    )


class DeliveryJob(Base, UUIDMixin, TimestampMixin):
    """Corresponds to public.delivery_jobs (bridges marketplace orders & riders)."""
    __tablename__ = "delivery_jobs"

    job_reference: Mapped[str] = mapped_column(Text, unique=True, nullable=False, index=True)
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("marketplace_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    seller_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("marketplace_sellers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    buyer_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    rider_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("rider_profiles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    batch_group_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True, index=True)
    delivery_tier: Mapped[str] = mapped_column(Text, default="shopno_express", nullable=False)
    status: Mapped[str] = mapped_column(Text, default="open", nullable=False, index=True)
    pickup_address: Mapped[str] = mapped_column(Text, nullable=False)
    pickup_lat: Mapped[float] = mapped_column(Float, nullable=False)
    pickup_lng: Mapped[float] = mapped_column(Float, nullable=False)
    pickup_contact_name: Mapped[str] = mapped_column(Text, nullable=False)
    pickup_contact_phone: Mapped[str] = mapped_column(Text, nullable=False)
    dropoff_address: Mapped[str] = mapped_column(Text, nullable=False)
    dropoff_lat: Mapped[float] = mapped_column(Float, nullable=False)
    dropoff_lng: Mapped[float] = mapped_column(Float, nullable=False)
    dropoff_contact_name: Mapped[str] = mapped_column(Text, nullable=False)
    dropoff_contact_phone: Mapped[str] = mapped_column(Text, nullable=False)
    hotel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("hotels.id", ondelete="SET NULL"), nullable=True, index=True
    )
    hotel_room_number: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    package_weight_kg: Mapped[Decimal] = mapped_column(Numeric(8, 3), default=Decimal("1.000"), nullable=False)
    package_summary: Mapped[str] = mapped_column(Text, nullable=False)
    is_fragile: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_perishable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    estimated_distance_km: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("1.00"), nullable=False)
    delivery_fee_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False)
    rider_payout_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False)
    platform_commission_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    cod_amount_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(Text, default="BDT", nullable=False)
    pickup_otp_hash: Mapped[str] = mapped_column(Text, nullable=False)
    pickup_otp_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pickup_otp_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    delivery_otp_hash: Mapped[str] = mapped_column(Text, nullable=False)
    delivery_otp_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    delivery_otp_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    pod_photo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pod_signature_hash: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pod_recipient_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    claimed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    picked_up_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "delivery_tier IN ('shopno_express', 'hotel_concierge', 'inter_district_courier', 'same_day')",
            name="chk_delivery_jobs_tier",
        ),
        CheckConstraint(
            "status IN ('open', 'claimed', 'en_route_pickup', 'picked_up', 'in_transit', 'arrived_dropoff', 'delivered', 'failed', 'cancelled', 'returned')",
            name="chk_delivery_jobs_status",
        ),
    )


class RideLocationPing(Base, UUIDMixin):
    """Corresponds to public.ride_location_pings."""
    __tablename__ = "ride_location_pings"

    trip_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("ride_trips.id", ondelete="CASCADE"), nullable=True, index=True
    )
    delivery_job_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("delivery_jobs.id", ondelete="CASCADE"), nullable=True, index=True
    )
    rider_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rider_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    accuracy_meters: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    speed_kmh: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    heading: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    altitude_meters: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    battery_pct: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_mock_location: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now(), nullable=False
    )


class RiderPayout(Base, UUIDMixin, TimestampMixin):
    """Corresponds to public.rider_payouts."""
    __tablename__ = "rider_payouts"

    rider_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rider_profiles.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    payout_reference: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    amount_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False)
    fee_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    net_amount_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(Text, default="BDT", nullable=False)
    channel: Mapped[str] = mapped_column(Text, nullable=False)
    account_number_masked: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, default="requested", nullable=False, index=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(Text, unique=True, nullable=True)
    gateway_reference: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    failure_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    approved_by: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now(), nullable=False
    )
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint("amount_paisa >= 10000", name="chk_rider_payouts_min_amount"),
        CheckConstraint("fee_paisa >= 0", name="chk_rider_payouts_fee"),
        CheckConstraint("net_amount_paisa > 0", name="chk_rider_payouts_net"),
        CheckConstraint(
            "channel IN ('bkash', 'nagad', 'rocket', 'bank_transfer')",
            name="chk_rider_payouts_channel",
        ),
        CheckConstraint(
            "status IN ('requested', 'approved', 'processing', 'paid', 'failed', 'cancelled')",
            name="chk_rider_payouts_status",
        ),
    )


class RiderEarningsLedger(Base, UUIDMixin):
    """
    Corresponds to public.rider_earnings_ledger.
    Immutable double-entry rider earnings ledger with integer paisa precision.
    """
    __tablename__ = "rider_earnings_ledger"

    rider_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rider_profiles.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    transaction_group: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    direction: Mapped[str] = mapped_column(Text, nullable=False)
    entry_type: Mapped[str] = mapped_column(Text, nullable=False)
    amount_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(Text, default="BDT", nullable=False)
    ride_trip_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("ride_trips.id", ondelete="SET NULL"), nullable=True, index=True
    )
    delivery_job_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("delivery_jobs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    payout_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("rider_payouts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    idempotency_key: Mapped[Optional[str]] = mapped_column(Text, unique=True, nullable=True)
    memo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[Dict[str, Any]] = mapped_column("metadata", JSON_JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint("direction IN ('credit', 'debit')", name="chk_rider_ledger_direction"),
        CheckConstraint("amount_paisa > 0", name="chk_rider_ledger_amount_positive"),
        CheckConstraint(
            "entry_type IN ('ride_fare', 'delivery_fee', 'surge_bonus', 'tip', 'platform_commission', 'fuel_estimate', 'payout_hold', 'payout_disbursed', 'payout_reversal', 'penalty', 'adjustment')",
            name="chk_rider_ledger_entry_type",
        ),
        Index("idx_rider_ledger_rider_created", "rider_id", "created_at"),
    )


@event.listens_for(RiderEarningsLedger, "before_update")
def reject_rider_ledger_update(mapper, connection, target):
    raise ValueError("Immutable ledger: UPDATE operations are strictly prohibited on rider_earnings_ledger")


@event.listens_for(RiderEarningsLedger, "before_delete")
def reject_rider_ledger_delete(mapper, connection, target):
    raise ValueError("Immutable ledger: DELETE operations are strictly prohibited on rider_earnings_ledger")
