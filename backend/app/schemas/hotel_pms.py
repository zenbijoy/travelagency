"""
Pydantic v2 Schemas for Hotel PMS API (/api/v1/hotel-pms/...).
Aligned with @shopnojatra/shared domain/hotel.ts and 20260623 SQL migration.
"""

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Dict, List, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RoomOccupancyStatus(str, Enum):
    VACANT = "vacant"
    RESERVED = "reserved"
    OCCUPIED = "occupied"
    DUE_OUT = "due_out"
    BLOCKED = "blocked"
    OUT_OF_ORDER = "out_of_order"


class RoomHousekeepingStatus(str, Enum):
    DIRTY = "dirty"
    CLEANING = "cleaning"
    INSPECTION = "inspection"
    CLEAN = "clean"
    READY = "ready"
    OUT_OF_SERVICE = "out_of_service"


RoomCleanlinessStatus = RoomHousekeepingStatus


class HousekeepingTaskType(str, Enum):
    CHECKOUT_CLEAN = "checkout_clean"
    STAYOVER_REFRESH = "stayover_refresh"
    DEEP_CLEAN = "deep_clean"
    VIP_TURNDOWN = "vip_turndown"
    INSPECTION = "inspection"


class HousekeepingPriority(str, Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    VIP_ARRIVAL = "vip_arrival"
    URGENT = "urgent"


class HousekeepingTaskStatus(str, Enum):
    DIRTY = "dirty"
    CLEANING = "cleaning"
    INSPECTION = "inspection"
    READY = "ready"
    CANCELLED = "cancelled"


class MaintenanceCategory(str, Enum):
    PLUMBING = "plumbing"
    ELECTRICAL = "electrical"
    HVAC = "hvac"
    FURNITURE = "furniture"
    WIFI_IT = "wifi_it"
    SAFETY = "safety"
    APPLIANCE = "appliance"
    OTHER = "other"


class MaintenanceSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class MaintenanceTicketStatus(str, Enum):
    OPEN = "open"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    PARTS_PENDING = "parts_pending"
    RESOLVED = "resolved"
    CLOSED = "closed"


class HotelFolioStatus(str, Enum):
    OPEN = "open"
    PENDING_SETTLEMENT = "pending_settlement"
    PARTIALLY_PAID = "partially_paid"
    SETTLED = "settled"
    VOID = "void"


class FolioItemType(str, Enum):
    ROOM_NIGHT = "room_night"
    MINIBAR = "minibar"
    ROOM_SERVICE = "room_service"
    BREAKFAST = "breakfast"
    AIRPORT_TRANSFER = "airport_transfer"
    LATE_CHECKOUT = "late_checkout"
    MARKETPLACE_CONCIERGE = "marketplace_concierge"
    LAUNDRY = "laundry"
    SPA = "spa"
    VAT_TAX = "vat_tax"
    SERVICE_CHARGE = "service_charge"
    DEPOSIT = "deposit"
    PAYMENT = "payment"
    DISCOUNT = "discount"
    ADJUSTMENT = "adjustment"


class FolioEntrySide(str, Enum):
    CHARGE = "charge"
    PAYMENT = "payment"
    CREDIT = "credit"


class HotelRateRuleType(str, Enum):
    OCCUPANCY_SURGE = "occupancy_surge"
    WEEKEND = "weekend"
    SEASONAL = "seasonal"
    FLASH_DEAL = "flash_deal"
    EARLY_BIRD = "early_bird"
    LAST_MINUTE = "last_minute"
    LENGTH_OF_STAY = "length_of_stay"


class GuestKeyStatus(str, Enum):
    ACTIVE = "active"
    ROTATED = "rotated"
    EXPIRED = "expired"
    REVOKED = "revoked"


# ============================================================================
# ROOM UNITS MATRIX SCHEMAS
# ============================================================================

class RoomUnitCreateRequest(BaseModel):
    room_type_id: uuid.UUID
    room_number: str = Field(..., min_length=1, max_length=24)
    floor_number: int = Field(default=1, ge=0, le=100)
    wing: Optional[str] = Field(None, max_length=40)
    is_vip_room: bool = False
    dynamic_pricing_enabled: bool = True
    base_nightly_rate_bdt: Decimal = Field(default=Decimal("3500.00"), gt=0)
    amenities_override: List[str] = Field(default_factory=list)
    ai_tags: List[str] = Field(default_factory=list)
    notes: Optional[str] = Field(None, max_length=500)


class RoomUnitUpdateRequest(BaseModel):
    occupancy_status: Optional[RoomOccupancyStatus] = None
    housekeeping_status: Optional[RoomHousekeepingStatus] = None
    is_vip_room: Optional[bool] = None
    dynamic_pricing_enabled: Optional[bool] = None
    base_nightly_rate_bdt: Optional[Decimal] = Field(None, gt=0)
    ai_tags: Optional[List[str]] = None
    notes: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None


class RoomUnitResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    hotel_id: uuid.UUID
    room_type_id: uuid.UUID
    room_number: str
    floor_number: int
    wing: Optional[str] = None
    occupancy_status: str
    housekeeping_status: str
    current_booking_id: Optional[uuid.UUID] = None
    current_guest_id: Optional[uuid.UUID] = None
    is_vip_room: bool
    dynamic_pricing_enabled: bool
    base_nightly_rate_bdt: Decimal
    amenities_override: List[str] = Field(default_factory=list)
    ai_tags: List[str] = Field(default_factory=list)
    last_cleaned_at: Optional[datetime] = None
    last_inspected_at: Optional[datetime] = None
    notes: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class RoomMatrixFloorGroup(BaseModel):
    floor_number: int
    total_units: int
    vacant_count: int
    occupied_count: int
    dirty_count: int
    units: List[RoomUnitResponse]


class RoomMatrixResponse(BaseModel):
    hotel_id: uuid.UUID
    total_units: int
    vacant_clean_units: int
    occupied_units: int
    dirty_units: int
    out_of_order_units: int
    occupancy_pct: Decimal
    floors: List[RoomMatrixFloorGroup]


# ============================================================================
# EXPRESS CHECK-IN & DIGITAL KEY SCHEMAS
# ============================================================================

class ExpressCheckinRequest(BaseModel):
    hotel_id: uuid.UUID
    booking_ref: str = Field(..., min_length=3, max_length=64)
    room_unit_id: Optional[uuid.UUID] = None
    nid_verified: bool = True
    guest_name: Optional[str] = Field(None, max_length=120)
    guest_phone: Optional[str] = Field(None, max_length=30)
    wifi_ssid: str = Field(default="ShopnoJatra-Guest-5G", max_length=64)
    wifi_password: Optional[str] = Field(None, max_length=64)


class HotelGuestKeyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    hotel_id: uuid.UUID
    room_unit_id: uuid.UUID
    folio_id: Optional[uuid.UUID] = None
    booking_id: Optional[uuid.UUID] = None
    guest_user_id: uuid.UUID
    qr_pass_code: str
    pin_code_last4: Optional[str] = None
    wifi_ssid: Optional[str] = None
    wifi_password: Optional[str] = None
    status: str
    valid_from: datetime
    valid_until: datetime
    rotated_count: int
    last_unlocked_at: Optional[datetime] = None
    created_at: datetime


class ExpressCheckinResponse(BaseModel):
    hotel_id: uuid.UUID
    booking_id: uuid.UUID
    booking_reference: str
    room_unit_id: uuid.UUID
    room_number: str
    floor_number: int
    folio_id: uuid.UUID
    folio_number: str
    guest_key: HotelGuestKeyResponse


# ============================================================================
# GUEST FOLIO & CHECKOUT SUMMARY SCHEMAS
# ============================================================================

class FolioChargeItemInput(BaseModel):
    item_type: FolioItemType
    description: str = Field(..., min_length=1, max_length=240)
    quantity: int = Field(default=1, ge=1, le=500)
    unit_amount_paisa: int = Field(..., gt=0, le=1_000_000_000)
    tax_paisa: int = Field(default=0, ge=0, le=100_000_000)
    entry_side: FolioEntrySide = FolioEntrySide.CHARGE
    payer_label: str = Field(default="primary_guest", min_length=1, max_length=64)
    reference_id: Optional[str] = Field(None, max_length=120)


class PostFolioChargesRequest(BaseModel):
    charges: List[FolioChargeItemInput] = Field(default_factory=list)
    payment_amount_paisa: int = Field(default=0, ge=0, le=1_000_000_000)
    payment_method: str = Field(default="card", max_length=40)
    checkout: bool = False
    idempotency_key: Optional[str] = Field(None, min_length=8, max_length=120)


class FolioItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    folio_id: uuid.UUID
    hotel_id: uuid.UUID
    item_type: str
    description: str
    quantity: int
    unit_amount_paisa: int
    tax_paisa: int
    total_paisa: int
    entry_side: str
    payer_label: str
    reference_id: Optional[str] = None
    is_voided: bool
    posted_at: datetime


class FolioResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    folio_number: str
    hotel_id: uuid.UUID
    booking_id: Optional[uuid.UUID] = None
    room_unit_id: Optional[uuid.UUID] = None
    guest_user_id: uuid.UUID
    guest_name: str
    guest_phone: Optional[str] = None
    guest_nid_or_passport_verified: bool
    status: str
    currency: str
    room_charges_paisa: int
    addon_charges_paisa: int
    tax_paisa: int
    discount_paisa: int
    total_charges_paisa: int
    paid_paisa: int
    balance_due_paisa: int
    checked_in_at: Optional[datetime] = None
    checked_out_at: Optional[datetime] = None
    settled_at: Optional[datetime] = None
    items: List[FolioItemResponse] = Field(default_factory=list)
    created_at: datetime


class CheckoutSummaryResponse(BaseModel):
    folio_id: uuid.UUID
    folio_number: str
    status: str
    checked_out: bool
    room_charges_paisa: int
    addon_charges_paisa: int
    tax_paisa: int
    discount_paisa: int
    total_charges_paisa: int
    paid_paisa: int
    balance_due_paisa: int
    split_by_payer: Dict[str, int]
    housekeeping_task_id: Optional[uuid.UUID] = None
    items: List[FolioItemResponse] = Field(default_factory=list)


# ============================================================================
# HOUSEKEEPING & MAINTENANCE SCHEMAS
# ============================================================================

class HousekeepingTaskCreateRequest(BaseModel):
    room_unit_id: uuid.UUID
    task_type: HousekeepingTaskType = HousekeepingTaskType.CHECKOUT_CLEAN
    priority: HousekeepingPriority = HousekeepingPriority.NORMAL
    sla_minutes: int = Field(default=45, ge=5, le=480)
    assigned_staff_id: Optional[uuid.UUID] = None
    assigned_user_id: Optional[uuid.UUID] = None
    checklist: List[Dict[str, Any]] = Field(default_factory=list)
    notes: Optional[str] = Field(None, max_length=500)


class HousekeepingTaskTransitionRequest(BaseModel):
    target_status: HousekeepingTaskStatus
    notes: Optional[str] = Field(None, max_length=500)


class HousekeepingTaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    hotel_id: uuid.UUID
    room_unit_id: uuid.UUID
    assigned_staff_id: Optional[uuid.UUID] = None
    assigned_user_id: Optional[uuid.UUID] = None
    task_type: str
    priority: str
    status: str
    sla_minutes: int
    due_by: Optional[datetime] = None
    started_at: Optional[datetime] = None
    inspected_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    checklist: List[Dict[str, Any]] = Field(default_factory=list)
    notes: Optional[str] = None
    created_at: datetime


class MaintenanceTicketCreateRequest(BaseModel):
    room_unit_id: Optional[uuid.UUID] = None
    category: MaintenanceCategory
    severity: MaintenanceSeverity = MaintenanceSeverity.MEDIUM
    title: str = Field(..., min_length=3, max_length=160)
    description: Optional[str] = Field(None, max_length=1000)
    blocks_room_sale: bool = False
    estimated_cost_bdt: Decimal = Field(default=Decimal("0.00"), ge=0)
    assigned_staff_id: Optional[uuid.UUID] = None


class MaintenanceTicketUpdateRequest(BaseModel):
    status: Optional[MaintenanceTicketStatus] = None
    severity: Optional[MaintenanceSeverity] = None
    assigned_staff_id: Optional[uuid.UUID] = None
    blocks_room_sale: Optional[bool] = None
    actual_cost_bdt: Optional[Decimal] = Field(None, ge=0)
    resolution_notes: Optional[str] = Field(None, max_length=1000)


class MaintenanceTicketResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    hotel_id: uuid.UUID
    room_unit_id: Optional[uuid.UUID] = None
    reported_by: Optional[uuid.UUID] = None
    assigned_staff_id: Optional[uuid.UUID] = None
    ticket_reference: str
    category: str
    severity: str
    status: str
    title: str
    description: Optional[str] = None
    blocks_room_sale: bool
    estimated_cost_bdt: Decimal
    actual_cost_bdt: Decimal
    currency: str
    resolution_notes: Optional[str] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime


# ============================================================================
# DYNAMIC YIELD PRICING & ANALYTICS SCHEMAS
# ============================================================================

class RateRuleCreateRequest(BaseModel):
    room_type_id: Optional[uuid.UUID] = None
    rule_name: str = Field(..., min_length=2, max_length=120)
    rule_type: HotelRateRuleType
    priority: int = Field(default=100, ge=1, le=1000)
    multiplier: Decimal = Field(default=Decimal("1.000"), ge=Decimal("0.400"), le=Decimal("1.250"))
    flat_adjustment_bdt: Decimal = Field(default=Decimal("0.00"), ge=Decimal("-50000"), le=Decimal("50000"))
    min_occupancy_pct: Optional[Decimal] = Field(None, ge=0, le=100)
    max_occupancy_pct: Optional[Decimal] = Field(None, ge=0, le=100)
    days_of_week: Optional[List[int]] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    min_nights: Optional[int] = Field(None, ge=1, le=90)
    is_flash_deal: bool = False
    is_active: bool = True

    @model_validator(mode="after")
    def validate_dates(self) -> "RateRuleCreateRequest":
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if self.days_of_week is not None:
            for dow in self.days_of_week:
                if dow < 0 or dow > 6:
                    raise ValueError("days_of_week values must be between 0 (Sunday) and 6 (Saturday)")
        return self


class RateRuleUpdateRequest(BaseModel):
    rule_name: Optional[str] = Field(None, min_length=2, max_length=120)
    multiplier: Optional[Decimal] = Field(None, ge=Decimal("0.400"), le=Decimal("1.250"))
    flat_adjustment_bdt: Optional[Decimal] = None
    is_flash_deal: Optional[bool] = None
    is_active: Optional[bool] = None


class RateRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    hotel_id: uuid.UUID
    room_type_id: Optional[uuid.UUID] = None
    rule_name: str
    rule_type: str
    priority: int
    multiplier: Decimal
    flat_adjustment_bdt: Decimal
    min_occupancy_pct: Optional[Decimal] = None
    max_occupancy_pct: Optional[Decimal] = None
    days_of_week: Optional[List[int]] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    min_nights: Optional[int] = None
    is_flash_deal: bool
    is_active: bool
    created_at: datetime


class DynamicRateRequest(BaseModel):
    room_type_id: uuid.UUID
    check_in: date
    nights: int = Field(default=1, ge=1, le=90)


class AppliedRateRuleItem(BaseModel):
    rule_id: uuid.UUID
    rule_name: str
    rule_type: str
    multiplier: Decimal
    flat_adjustment_bdt: Decimal
    is_flash_deal: bool


class DynamicRateQuoteResponse(BaseModel):
    hotel_id: uuid.UUID
    room_type_id: uuid.UUID
    check_in: date
    nights: int
    occupancy_pct: Decimal
    base_nightly_bdt: Decimal
    effective_multiplier: Decimal
    is_capped: bool
    dynamic_nightly_bdt: Decimal
    subtotal_paisa: int
    vat_paisa: int
    service_charge_paisa: int
    total_paisa: int
    currency: str = "BDT"
    applied_rules: List[AppliedRateRuleItem] = Field(default_factory=list)


class HotelPmsAnalyticsResponse(BaseModel):
    hotel_id: uuid.UUID
    total_units: int
    occupied_units: int
    vacant_clean_units: int
    dirty_units: int
    out_of_order_units: int
    occupancy_rate_pct: Decimal
    adr_bdt: Decimal
    revpar_bdt: Decimal
    goppar_bdt: Decimal
    total_room_revenue_paisa: int
    total_addon_revenue_paisa: int
    unsettled_folios_count: int
    unsettled_balance_paisa: int
    housekeeping_pending_count: int
    open_maintenance_tickets: int
    critical_maintenance_tickets: int
