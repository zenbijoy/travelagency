"""
SQLAlchemy 2.0 Models for Hotel PMS (Property Management System).
Aligned with supabase/migrations/20260623_rider_hotel_marketplace_production.sql.
Covers physical room units, housekeeping turnaround, maintenance ticketing,
guest folios & split billing, dynamic yield rules, and digital QR room keys.
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
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin

JSON_ARRAY_TEXT = JSON().with_variant(ARRAY(Text), "postgresql")
JSON_ARRAY_INT = JSON().with_variant(ARRAY(Integer), "postgresql")
JSON_JSONB = JSON().with_variant(JSONB, "postgresql")


class HotelRoomUnit(Base, UUIDMixin, TimestampMixin):
    """Corresponds to public.hotel_room_units (physical room inventory)."""
    __tablename__ = "hotel_room_units"

    hotel_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hotels.id", ondelete="CASCADE"), nullable=False, index=True
    )
    room_type_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hotel_rooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    room_number: Mapped[str] = mapped_column(Text, nullable=False)
    floor_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    wing: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    occupancy_status: Mapped[str] = mapped_column(Text, default="vacant", nullable=False, index=True)
    housekeeping_status: Mapped[str] = mapped_column(Text, default="clean", nullable=False, index=True)
    current_booking_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True, index=True
    )
    current_guest_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True, index=True)
    is_vip_room: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    dynamic_pricing_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    base_nightly_rate_bdt: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("3500.00"), nullable=False
    )
    amenities_override: Mapped[List[str]] = mapped_column(JSON_JSONB, default=list, nullable=False)
    ai_tags: Mapped[List[str]] = mapped_column(JSON_ARRAY_TEXT, default=list, nullable=False)
    last_cleaned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_inspected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (
        UniqueConstraint("hotel_id", "room_number", name="uq_hotel_room_unit_number"),
        CheckConstraint("floor_number >= 0 AND floor_number <= 100", name="chk_hotel_room_unit_floor"),
        CheckConstraint(
            "occupancy_status IN ('vacant', 'reserved', 'occupied', 'due_out', 'blocked', 'out_of_order')",
            name="chk_hotel_room_unit_occupancy",
        ),
        CheckConstraint(
            "housekeeping_status IN ('dirty', 'cleaning', 'inspection', 'clean', 'ready', 'out_of_service')",
            name="chk_hotel_room_unit_hk",
        ),
    )


class HotelHousekeepingTask(Base, UUIDMixin, TimestampMixin):
    """Corresponds to public.hotel_housekeeping_tasks."""
    __tablename__ = "hotel_housekeeping_tasks"

    hotel_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hotels.id", ondelete="CASCADE"), nullable=False, index=True
    )
    room_unit_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hotel_room_units.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assigned_staff_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("hotel_staff.id", ondelete="SET NULL"), nullable=True, index=True
    )
    assigned_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True, index=True)
    task_type: Mapped[str] = mapped_column(Text, default="checkout_clean", nullable=False)
    priority: Mapped[str] = mapped_column(Text, default="normal", nullable=False)
    status: Mapped[str] = mapped_column(Text, default="dirty", nullable=False, index=True)
    sla_minutes: Mapped[int] = mapped_column(Integer, default=45, nullable=False)
    due_by: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    inspected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    inspected_by: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    checklist: Mapped[List[Dict[str, Any]]] = mapped_column(JSON_JSONB, default=list, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint(
            "task_type IN ('checkout_clean', 'stayover_refresh', 'deep_clean', 'vip_turndown', 'inspection')",
            name="chk_hotel_hk_task_type",
        ),
        CheckConstraint(
            "priority IN ('low', 'normal', 'high', 'vip_arrival', 'urgent')",
            name="chk_hotel_hk_priority",
        ),
        CheckConstraint(
            "status IN ('dirty', 'cleaning', 'inspection', 'ready', 'cancelled')",
            name="chk_hotel_hk_status",
        ),
        CheckConstraint("sla_minutes > 0", name="chk_hotel_hk_sla"),
    )


class HotelMaintenanceTicket(Base, UUIDMixin, TimestampMixin):
    """Corresponds to public.hotel_maintenance_tickets."""
    __tablename__ = "hotel_maintenance_tickets"

    hotel_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hotels.id", ondelete="CASCADE"), nullable=False, index=True
    )
    room_unit_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("hotel_room_units.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reported_by: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    assigned_staff_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("hotel_staff.id", ondelete="SET NULL"), nullable=True, index=True
    )
    ticket_reference: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(Text, default="medium", nullable=False)
    status: Mapped[str] = mapped_column(Text, default="open", nullable=False, index=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    blocks_room_sale: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    estimated_cost_bdt: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    actual_cost_bdt: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    currency: Mapped[str] = mapped_column(Text, default="BDT", nullable=False)
    resolution_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "category IN ('plumbing', 'electrical', 'hvac', 'furniture', 'wifi_it', 'safety', 'appliance', 'other')",
            name="chk_hotel_maint_category",
        ),
        CheckConstraint(
            "severity IN ('low', 'medium', 'high', 'critical')",
            name="chk_hotel_maint_severity",
        ),
        CheckConstraint(
            "status IN ('open', 'assigned', 'in_progress', 'parts_pending', 'resolved', 'closed')",
            name="chk_hotel_maint_status",
        ),
    )


class HotelFolio(Base, UUIDMixin, TimestampMixin):
    """Corresponds to public.hotel_folios."""
    __tablename__ = "hotel_folios"

    folio_number: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    hotel_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hotels.id", ondelete="CASCADE"), nullable=False, index=True
    )
    booking_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True, index=True
    )
    room_unit_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("hotel_room_units.id", ondelete="SET NULL"), nullable=True, index=True
    )
    guest_user_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    guest_name: Mapped[str] = mapped_column(Text, nullable=False)
    guest_phone: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    guest_nid_or_passport_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(Text, default="open", nullable=False, index=True)
    currency: Mapped[str] = mapped_column(Text, default="BDT", nullable=False)
    room_charges_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    addon_charges_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    tax_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    discount_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    total_charges_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    paid_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    balance_due_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    checked_in_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    checked_out_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    settled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    split_billing_config: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    items: Mapped[List["HotelFolioItem"]] = relationship(
        "HotelFolioItem", back_populates="folio", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('open', 'pending_settlement', 'partially_paid', 'settled', 'void')",
            name="chk_hotel_folios_status",
        ),
    )


class HotelFolioItem(Base, UUIDMixin):
    """Corresponds to public.hotel_folio_items."""
    __tablename__ = "hotel_folio_items"

    folio_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hotel_folios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    hotel_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hotels.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_type: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unit_amount_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False)
    tax_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    total_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False)
    entry_side: Mapped[str] = mapped_column(Text, default="charge", nullable=False)
    payer_label: Mapped[str] = mapped_column(Text, default="primary_guest", nullable=False)
    reference_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    posted_by: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(Text, unique=True, nullable=True)
    is_voided: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    posted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now(), nullable=False
    )

    folio: Mapped["HotelFolio"] = relationship("HotelFolio", back_populates="items")

    __table_args__ = (
        CheckConstraint(
            "item_type IN ('room_night', 'minibar', 'room_service', 'breakfast', 'airport_transfer', 'late_checkout', 'marketplace_concierge', 'laundry', 'spa', 'vat_tax', 'service_charge', 'deposit', 'payment', 'discount', 'adjustment')",
            name="chk_hotel_folio_item_type",
        ),
        CheckConstraint("entry_side IN ('charge', 'payment', 'credit')", name="chk_hotel_folio_entry_side"),
        CheckConstraint("quantity > 0", name="chk_hotel_folio_item_qty"),
        CheckConstraint("unit_amount_paisa > 0", name="chk_hotel_folio_item_unit_amt"),
        CheckConstraint("total_paisa > 0", name="chk_hotel_folio_item_total"),
    )


class HotelRateRule(Base, UUIDMixin, TimestampMixin):
    """Corresponds to public.hotel_rate_rules."""
    __tablename__ = "hotel_rate_rules"

    hotel_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hotels.id", ondelete="CASCADE"), nullable=False, index=True
    )
    room_type_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("hotel_rooms.id", ondelete="CASCADE"), nullable=True, index=True
    )
    rule_name: Mapped[str] = mapped_column(Text, nullable=False)
    rule_type: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    multiplier: Mapped[Decimal] = mapped_column(Numeric(5, 3), default=Decimal("1.000"), nullable=False)
    flat_adjustment_bdt: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    min_occupancy_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    max_occupancy_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    days_of_week: Mapped[Optional[List[int]]] = mapped_column(JSON_ARRAY_INT, nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    min_nights: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_flash_deal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "rule_type IN ('occupancy_surge', 'weekend', 'seasonal', 'flash_deal', 'early_bird', 'last_minute', 'length_of_stay')",
            name="chk_hotel_rate_rules_type",
        ),
        CheckConstraint("multiplier >= 0.400 AND multiplier <= 1.250", name="chk_hotel_rate_rules_mult"),
    )


class HotelGuestKey(Base, UUIDMixin, TimestampMixin):
    """Corresponds to public.hotel_guest_keys (rotatable QR digital room keys)."""
    __tablename__ = "hotel_guest_keys"

    hotel_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hotels.id", ondelete="CASCADE"), nullable=False, index=True
    )
    room_unit_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hotel_room_units.id", ondelete="CASCADE"), nullable=False, index=True
    )
    folio_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("hotel_folios.id", ondelete="CASCADE"), nullable=True, index=True
    )
    booking_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True, index=True
    )
    guest_user_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    key_token_hash: Mapped[str] = mapped_column(Text, nullable=False)
    qr_pass_code: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    pin_code_last4: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    wifi_ssid: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    wifi_password: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, default="active", nullable=False, index=True)
    valid_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now(), nullable=False
    )
    valid_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    rotated_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_unlocked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'rotated', 'expired', 'revoked')",
            name="chk_hotel_guest_keys_status",
        ),
    )
