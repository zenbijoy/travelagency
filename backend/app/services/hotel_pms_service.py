"""
Hotel PMS Service Layer: Room Matrix, QR Express Check-In/Out, Digital Keys,
Guest Folios & Split Billing, Housekeeping Dispatch, Maintenance Ticketing,
Dynamic Yield Pricing & Analytics.
Uses Decimal and exact integer-paisa arithmetic with tenant isolation.
"""

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import logging
import secrets
from typing import Any, Dict, List, Optional
import uuid

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import (
    BadRequestError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
)
from app.models.booking import Booking
from app.models.hotel import Hotel, HotelRoom
from app.models.hotel_pms import (
    HotelFolio,
    HotelFolioItem,
    HotelGuestKey,
    HotelHousekeepingTask,
    HotelMaintenanceTicket,
    HotelRateRule,
    HotelRoomUnit,
)
from app.models.user import HotelStaff
from app.schemas.hotel_pms import (
    AppliedRateRuleItem,
    CheckoutSummaryResponse,
    DynamicRateQuoteResponse,
    DynamicRateRequest,
    ExpressCheckinRequest,
    ExpressCheckinResponse,
    FolioItemResponse,
    HotelGuestKeyResponse,
    HotelPmsAnalyticsResponse,
    HousekeepingTaskCreateRequest,
    HousekeepingTaskTransitionRequest,
    MaintenanceTicketCreateRequest,
    MaintenanceTicketUpdateRequest,
    PostFolioChargesRequest,
    RateRuleCreateRequest,
    RateRuleUpdateRequest,
    RoomMatrixFloorGroup,
    RoomMatrixResponse,
    RoomUnitCreateRequest,
    RoomUnitResponse,
    RoomUnitUpdateRequest,
)
from app.schemas.user import CurrentUser

logger = logging.getLogger(__name__)

HOTEL_MIN_MULTIPLIER = Decimal("0.500")
HOTEL_MAX_MULTIPLIER = Decimal("1.250")
HOTEL_VAT_RATE = Decimal("0.05")
HOTEL_SERVICE_CHARGE_RATE = Decimal("0.10")

HOUSEKEEPING_ALLOWED_TRANSITIONS = {
    "dirty": {"cleaning", "cancelled"},
    "cleaning": {"inspection", "dirty", "cancelled"},
    "inspection": {"ready", "dirty", "cancelled"},
    "ready": {"dirty"},
    "cancelled": {"dirty"},
}


def _round_paisa(val: Decimal) -> int:
    return int(val.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _round_bdt(val: Decimal) -> Decimal:
    return val.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class HotelPMSService:
    """Production Hotel Property Management System service."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def verify_hotel_staff_access(self, hotel_id: uuid.UUID, current_user: CurrentUser) -> Hotel:
        """Enforce zero-trust tenant isolation for hotel staff or administrators."""
        hotel = (await self.db.execute(select(Hotel).where(Hotel.id == hotel_id))).scalar_one_or_none()
        if not hotel:
            raise NotFoundError("Hotel", hotel_id)

        if getattr(current_user, "is_active_admin", False):
            return hotel
        if getattr(current_user, "hotel_id", None) == hotel_id:
            return hotel

        staff = (
            await self.db.execute(
                select(HotelStaff).where(
                    HotelStaff.hotel_id == hotel_id,
                    HotelStaff.user_id == current_user.id,
                    HotelStaff.status == "active",
                )
            )
        ).scalar_one_or_none()
        if not staff:
            raise PermissionDeniedError("Hotel staff permission required for this property")
        return hotel

    # -------------------------------------------------------------------------
    # 1. ROOM UNITS MATRIX
    # -------------------------------------------------------------------------

    async def create_room_unit(
        self, hotel_id: uuid.UUID, current_user: CurrentUser, request: RoomUnitCreateRequest
    ) -> HotelRoomUnit:
        await self.verify_hotel_staff_access(hotel_id, current_user)

        room_type = (
            await self.db.execute(
                select(HotelRoom).where(HotelRoom.id == request.room_type_id, HotelRoom.hotel_id == hotel_id)
            )
        ).scalar_one_or_none()
        if not room_type:
            raise NotFoundError("HotelRoom", request.room_type_id)

        dup = (
            await self.db.execute(
                select(HotelRoomUnit).where(
                    HotelRoomUnit.hotel_id == hotel_id,
                    HotelRoomUnit.room_number == request.room_number.strip(),
                )
            )
        ).scalar_one_or_none()
        if dup:
            raise ConflictError(f"Room unit '{request.room_number}' already exists in this hotel")

        unit = HotelRoomUnit(
            hotel_id=hotel_id,
            room_type_id=request.room_type_id,
            room_number=request.room_number.strip(),
            floor_number=request.floor_number,
            wing=request.wing,
            is_vip_room=request.is_vip_room,
            dynamic_pricing_enabled=request.dynamic_pricing_enabled,
            base_nightly_rate_bdt=request.base_nightly_rate_bdt,
            amenities_override=request.amenities_override,
            ai_tags=request.ai_tags,
            notes=request.notes,
        )
        self.db.add(unit)
        await self.db.commit()
        await self.db.refresh(unit)
        return unit

    async def get_room_matrix(
        self, hotel_id: uuid.UUID, current_user: CurrentUser
    ) -> RoomMatrixResponse:
        await self.verify_hotel_staff_access(hotel_id, current_user)

        units = (
            await self.db.execute(
                select(HotelRoomUnit)
                .where(HotelRoomUnit.hotel_id == hotel_id, HotelRoomUnit.is_active.is_(True))
                .order_by(HotelRoomUnit.floor_number.asc(), HotelRoomUnit.room_number.asc())
            )
        ).scalars().all()

        floor_map: Dict[int, List[HotelRoomUnit]] = defaultdict(list)
        for u in units:
            floor_map[u.floor_number].append(u)

        floors: List[RoomMatrixFloorGroup] = []
        for floor_num in sorted(floor_map.keys()):
            f_units = floor_map[floor_num]
            floors.append(
                RoomMatrixFloorGroup(
                    floor_number=floor_num,
                    total_units=len(f_units),
                    vacant_count=sum(1 for u in f_units if u.occupancy_status == "vacant"),
                    occupied_count=sum(1 for u in f_units if u.occupancy_status in ("occupied", "due_out")),
                    dirty_count=sum(1 for u in f_units if u.housekeeping_status == "dirty"),
                    units=[RoomUnitResponse.model_validate(u) for u in f_units],
                )
            )

        total = len(units)
        occupied = sum(1 for u in units if u.occupancy_status in ("occupied", "reserved", "due_out"))
        vacant_clean = sum(
            1 for u in units if u.occupancy_status == "vacant" and u.housekeeping_status in ("clean", "ready")
        )
        dirty = sum(1 for u in units if u.housekeeping_status == "dirty")
        ooo = sum(1 for u in units if u.occupancy_status in ("out_of_order", "blocked"))
        occ_pct = (
            (Decimal(occupied) * Decimal("100") / Decimal(total)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if total > 0
            else Decimal("0.00")
        )

        return RoomMatrixResponse(
            hotel_id=hotel_id,
            total_units=total,
            vacant_clean_units=vacant_clean,
            occupied_units=occupied,
            dirty_units=dirty,
            out_of_order_units=ooo,
            occupancy_pct=occ_pct,
            floors=floors,
        )

    async def update_room_unit(
        self, unit_id: uuid.UUID, current_user: CurrentUser, request: RoomUnitUpdateRequest
    ) -> HotelRoomUnit:
        unit = (
            await self.db.execute(select(HotelRoomUnit).where(HotelRoomUnit.id == unit_id).with_for_update())
        ).scalar_one_or_none()
        if not unit:
            raise NotFoundError("HotelRoomUnit", unit_id)

        await self.verify_hotel_staff_access(unit.hotel_id, current_user)

        if request.occupancy_status is not None:
            if request.occupancy_status.value == "vacant" and unit.occupancy_status == "occupied":
                open_folio = (
                    await self.db.execute(
                        select(HotelFolio).where(
                            HotelFolio.room_unit_id == unit.id,
                            HotelFolio.status.in_(["open", "pending_settlement", "partially_paid"]),
                        )
                    )
                ).scalar_one_or_none()
                if open_folio:
                    raise ConflictError(
                        "Cannot mark room vacant while an unsettled guest folio is active; use folio checkout"
                    )
            unit.occupancy_status = request.occupancy_status.value
        if request.housekeeping_status is not None:
            unit.housekeeping_status = request.housekeeping_status.value
        if request.is_vip_room is not None:
            unit.is_vip_room = request.is_vip_room
        if request.dynamic_pricing_enabled is not None:
            unit.dynamic_pricing_enabled = request.dynamic_pricing_enabled
        if request.base_nightly_rate_bdt is not None:
            unit.base_nightly_rate_bdt = request.base_nightly_rate_bdt
        if request.ai_tags is not None:
            unit.ai_tags = request.ai_tags
        if request.notes is not None:
            unit.notes = request.notes
        if request.is_active is not None:
            unit.is_active = request.is_active

        await self.db.commit()
        await self.db.refresh(unit)
        return unit

    # -------------------------------------------------------------------------
    # 2. QR / OTP EXPRESS CHECK-IN & DIGITAL KEY ROTATION
    # -------------------------------------------------------------------------

    async def express_checkin(
        self, *args
    ) -> ExpressCheckinResponse:
        # Backward-compatible call support:
        # - API: express_checkin(current_user, request)
        # - legacy/tests: express_checkin(request, current_user)
        if len(args) != 2:
            raise TypeError("express_checkin expects (current_user, request)")
        first, second = args
        if isinstance(first, ExpressCheckinRequest):
            request, current_user = first, second
        elif isinstance(second, ExpressCheckinRequest):
            current_user, request = first, second
        else:
            raise TypeError("A valid ExpressCheckinRequest is required")

        hotel = (
            await self.db.execute(select(Hotel).where(Hotel.id == request.hotel_id))
        ).scalar_one_or_none()
        if not hotel:
            raise NotFoundError("Hotel", request.hotel_id)

        booking = (
            await self.db.execute(
                select(Booking)
                .options(selectinload(Booking.items))
                .where(Booking.booking_reference == request.booking_ref.strip())
            )
        ).scalar_one_or_none()
        if not booking:
            raise NotFoundError("Booking", request.booking_ref)

        # Verify caller is hotel staff/admin OR the booking guest
        is_staff_or_admin = current_user.is_active_admin or current_user.hotel_id == request.hotel_id
        if not is_staff_or_admin:
            staff = (
                await self.db.execute(
                    select(HotelStaff).where(
                        HotelStaff.hotel_id == request.hotel_id,
                        HotelStaff.user_id == current_user.id,
                        HotelStaff.status == "active",
                    )
                )
            ).scalar_one_or_none()
            is_staff_or_admin = staff is not None
        if not is_staff_or_admin and booking.user_id != current_user.id:
            raise PermissionDeniedError("Not authorized to check in this booking")

        # Verify booking hotel linkage if booking has hotel room items
        if booking.items:
            room_ids = [item.product_id for item in booking.items if item.product_id]
            if room_ids:
                rooms = (
                    await self.db.execute(select(HotelRoom).where(HotelRoom.id.in_(room_ids)))
                ).scalars().all()
                if rooms and all(r.hotel_id != request.hotel_id for r in rooms):
                    raise PermissionDeniedError("Booking does not belong to the target hotel")

        if booking.status in ("cancelled", "refunded"):
            raise ConflictError(f"Cannot check in a {booking.status} booking")

        if request.room_unit_id:
            unit = (
                await self.db.execute(
                    select(HotelRoomUnit)
                    .where(
                        HotelRoomUnit.id == request.room_unit_id,
                        HotelRoomUnit.hotel_id == request.hotel_id,
                    )
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if not unit:
                raise NotFoundError("HotelRoomUnit", request.room_unit_id)
        else:
            unit = (
                await self.db.execute(
                    select(HotelRoomUnit)
                    .where(
                        HotelRoomUnit.hotel_id == request.hotel_id,
                        HotelRoomUnit.occupancy_status.in_(["vacant", "reserved"]),
                        HotelRoomUnit.housekeeping_status.in_(["clean", "ready"]),
                        HotelRoomUnit.is_active.is_(True),
                    )
                    .order_by(HotelRoomUnit.floor_number.asc(), HotelRoomUnit.room_number.asc())
                    .limit(1)
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if not unit:
                raise ConflictError("No clean available room unit found for express check-in")

        if unit.occupancy_status in ("occupied", "blocked", "out_of_order"):
            raise ConflictError(
                f"Room unit {unit.room_number} is already {unit.occupancy_status}"
            )
        if unit.housekeeping_status not in ("clean", "ready"):
            raise ConflictError(
                f"Room unit {unit.room_number} is not ready (housekeeping: {unit.housekeeping_status})"
            )

        now = datetime.now(timezone.utc)
        nights = 1
        if booking.start_date and booking.end_date:
            nights = max(1, (booking.end_date - booking.start_date).days)

        nightly_paisa = _round_paisa(Decimal(str(unit.base_nightly_rate_bdt)) * Decimal("100"))
        booking_total_bdt = Decimal(str(booking.final_price or booking.total_price or 0))
        booking_total_paisa = _round_paisa(booking_total_bdt * Decimal("100"))
        room_subtotal_paisa = max(booking_total_paisa, nightly_paisa * nights)
        vat_paisa = _round_paisa(Decimal(room_subtotal_paisa) * HOTEL_VAT_RATE)
        valid_until = (
            datetime.combine(booking.end_date, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=18)
            if booking.end_date
            else now + timedelta(days=nights)
        )

        unit.occupancy_status = "occupied"
        unit.current_booking_id = booking.id
        unit.current_guest_id = booking.user_id

        folio = (
            await self.db.execute(
                select(HotelFolio)
                .where(
                    HotelFolio.booking_id == booking.id,
                    HotelFolio.hotel_id == request.hotel_id,
                    HotelFolio.status != "void",
                )
                .with_for_update()
            )
        ).scalar_one_or_none()

        if not folio:
            folio_id = uuid.uuid4()
            folio_num = f"FOL-{folio_id.hex[:8].upper()}"
            total_due = room_subtotal_paisa + vat_paisa
            folio = HotelFolio(
                id=folio_id,
                folio_number=folio_num,
                hotel_id=request.hotel_id,
                booking_id=booking.id,
                room_unit_id=unit.id,
                guest_user_id=booking.user_id,
                guest_name=request.guest_name or f"Guest {str(booking.user_id)[:6].upper()}",
                guest_phone=request.guest_phone,
                guest_nid_or_passport_verified=request.nid_verified,
                status="open",
                currency=booking.currency or "BDT",
                room_charges_paisa=room_subtotal_paisa,
                tax_paisa=vat_paisa,
                total_charges_paisa=total_due,
                balance_due_paisa=total_due,
                checked_in_at=now,
            )
            self.db.add(folio)
            await self.db.flush()

            unit_amount = max(1, _round_paisa(Decimal(room_subtotal_paisa) / Decimal(nights)))
            self.db.add(
                HotelFolioItem(
                    folio_id=folio.id,
                    hotel_id=request.hotel_id,
                    item_type="room_night",
                    description=f"Room {unit.room_number} ({nights} night stay)",
                    quantity=nights,
                    unit_amount_paisa=unit_amount,
                    tax_paisa=vat_paisa,
                    total_paisa=total_due,
                    entry_side="charge",
                    posted_by=current_user.id,
                    idempotency_key=f"checkin_room:{folio.id}",
                )
            )
        else:
            folio.room_unit_id = unit.id
            folio.guest_nid_or_passport_verified = folio.guest_nid_or_passport_verified or request.nid_verified
            folio.checked_in_at = folio.checked_in_at or now

        # Rotate any existing active keys on this unit and issue a fresh QR digital key
        existing_keys = (
            await self.db.execute(
                select(HotelGuestKey).where(
                    HotelGuestKey.room_unit_id == unit.id,
                    HotelGuestKey.status == "active",
                )
            )
        ).scalars().all()
        rotated_count = 0
        for ek in existing_keys:
            ek.status = "rotated"
            rotated_count = max(rotated_count, ek.rotated_count + 1)

        key_id = uuid.uuid4()
        qr_pass = f"SJ-KEY-{secrets.token_hex(5).upper()}"
        key_hash = hashlib.sha256(f"{qr_pass}:{key_id}".encode("utf-8")).hexdigest()
        guest_key = HotelGuestKey(
            id=key_id,
            hotel_id=request.hotel_id,
            room_unit_id=unit.id,
            folio_id=folio.id,
            booking_id=booking.id,
            guest_user_id=booking.user_id,
            key_token_hash=key_hash,
            qr_pass_code=qr_pass,
            pin_code_last4=qr_pass[-4:],
            wifi_ssid=request.wifi_ssid,
            wifi_password=request.wifi_password or f"SJ-{unit.room_number}-WIFI",
            status="active",
            valid_from=now,
            valid_until=valid_until,
            rotated_count=rotated_count,
        )
        self.db.add(guest_key)
        booking.flow_step = "checked_in"

        try:
            from app.notifications.events.base import DomainEvent
            from app.notifications.outbox.publisher import OutboxPublisher

            checked_in_event = DomainEvent(
                event_type="hotel.guest.checked_in",
                aggregate_type="booking",
                aggregate_id=str(booking.id),
                actor_id=booking.user_id,
                priority=7,
                hotel_id=request.hotel_id,
                booking_id=booking.id,
                booking_reference=booking.booking_reference,
                folio_id=folio.id,
                folio_number=folio.folio_number,
                room_number=unit.room_number,
                floor_number=unit.floor_number,
                user_id=booking.user_id,
                category="booking",
                deep_link="/(tabs)/trips",
                headers={
                    "source_service": "hotel_pms_service",
                    "causation_id": str(folio.id),
                },
            )
            await OutboxPublisher.publish_idempotent(
                self.db,
                checked_in_event,
                idempotency_key=f"hotel_checked_in:{booking.id}:{folio.id}",
            )
        except Exception as outbox_err:
            logger.warning(f"Could not stage hotel.guest.checked_in into outbox: {outbox_err}")

        await self.db.commit()
        await self.db.refresh(guest_key)
        return ExpressCheckinResponse(
            hotel_id=request.hotel_id,
            booking_id=booking.id,
            booking_reference=booking.booking_reference,
            room_unit_id=unit.id,
            room_number=unit.room_number,
            floor_number=unit.floor_number,
            folio_id=folio.id,
            folio_number=folio.folio_number,
            guest_key=HotelGuestKeyResponse.model_validate(guest_key),
        )

    async def rotate_guest_key(self, key_id: uuid.UUID, current_user: CurrentUser) -> HotelGuestKey:
        old_key = (
            await self.db.execute(select(HotelGuestKey).where(HotelGuestKey.id == key_id).with_for_update())
        ).scalar_one_or_none()
        if not old_key:
            raise NotFoundError("HotelGuestKey", key_id)

        if old_key.guest_user_id != current_user.id:
            await self.verify_hotel_staff_access(old_key.hotel_id, current_user)

        if old_key.status != "active":
            raise ConflictError(f"Cannot rotate key in '{old_key.status}' status")

        old_key.status = "rotated"
        new_id = uuid.uuid4()
        qr_pass = f"SJ-KEY-{secrets.token_hex(5).upper()}"
        new_key = HotelGuestKey(
            id=new_id,
            hotel_id=old_key.hotel_id,
            room_unit_id=old_key.room_unit_id,
            folio_id=old_key.folio_id,
            booking_id=old_key.booking_id,
            guest_user_id=old_key.guest_user_id,
            key_token_hash=hashlib.sha256(f"{qr_pass}:{new_id}".encode("utf-8")).hexdigest(),
            qr_pass_code=qr_pass,
            pin_code_last4=qr_pass[-4:],
            wifi_ssid=old_key.wifi_ssid,
            wifi_password=old_key.wifi_password,
            status="active",
            valid_from=datetime.now(timezone.utc),
            valid_until=old_key.valid_until,
            rotated_count=old_key.rotated_count + 1,
        )
        self.db.add(new_key)
        await self.db.commit()
        await self.db.refresh(new_key)
        return new_key

    async def list_my_guest_keys(self, guest_user_id: uuid.UUID) -> List[HotelGuestKey]:
        rows = (
            await self.db.execute(
                select(HotelGuestKey)
                .where(HotelGuestKey.guest_user_id == guest_user_id)
                .order_by(HotelGuestKey.created_at.desc())
            )
        ).scalars().all()
        return list(rows)

    # -------------------------------------------------------------------------
    # 3. GUEST FOLIO LINE ITEMS, SPLIT BILLING & CHECKOUT
    # -------------------------------------------------------------------------

    async def list_hotel_folios(
        self, hotel_id: uuid.UUID, current_user: CurrentUser, status_filter: Optional[str] = None
    ) -> List[HotelFolio]:
        await self.verify_hotel_staff_access(hotel_id, current_user)
        stmt = select(HotelFolio).options(selectinload(HotelFolio.items)).where(HotelFolio.hotel_id == hotel_id)
        if status_filter:
            stmt = stmt.where(HotelFolio.status == status_filter)
        rows = (await self.db.execute(stmt.order_by(HotelFolio.created_at.desc()))).scalars().all()
        return list(rows)

    async def get_folio_summary(
        self, folio_id: uuid.UUID, current_user: CurrentUser
    ) -> CheckoutSummaryResponse:
        folio = (
            await self.db.execute(
                select(HotelFolio).options(selectinload(HotelFolio.items)).where(HotelFolio.id == folio_id)
            )
        ).scalar_one_or_none()
        if not folio:
            raise NotFoundError("HotelFolio", folio_id)

        if folio.guest_user_id != current_user.id:
            await self.verify_hotel_staff_access(folio.hotel_id, current_user)

        split_by_payer: Dict[str, int] = defaultdict(int)
        for item in folio.items:
            if item.is_voided:
                continue
            payer = item.payer_label or "primary_guest"
            if item.entry_side == "charge":
                split_by_payer[payer] += item.total_paisa
            elif item.entry_side == "credit":
                split_by_payer[payer] = max(0, split_by_payer[payer] - item.total_paisa)

        return CheckoutSummaryResponse(
            folio_id=folio.id,
            folio_number=folio.folio_number,
            status=folio.status,
            checked_out=folio.checked_out_at is not None,
            room_charges_paisa=folio.room_charges_paisa,
            addon_charges_paisa=folio.addon_charges_paisa,
            tax_paisa=folio.tax_paisa,
            discount_paisa=folio.discount_paisa,
            total_charges_paisa=folio.total_charges_paisa,
            paid_paisa=folio.paid_paisa,
            balance_due_paisa=folio.balance_due_paisa,
            split_by_payer=dict(split_by_payer),
            items=[FolioItemResponse.model_validate(i) for i in folio.items],
        )

    async def post_folio_charges_and_checkout(
        self, *args
    ) -> CheckoutSummaryResponse:
        if len(args) != 3:
            raise TypeError("post_folio_charges_and_checkout expects (folio_id, current_user, request)")
        folio_id, current_user, request = args
        if isinstance(current_user, PostFolioChargesRequest):
            current_user, request = request, current_user
        folio = (
            await self.db.execute(
                select(HotelFolio).options(selectinload(HotelFolio.items)).where(HotelFolio.id == folio_id).with_for_update()
            )
        ).scalar_one_or_none()
        if not folio:
            raise NotFoundError("HotelFolio", folio_id)

        await self.verify_hotel_staff_access(folio.hotel_id, current_user)

        if folio.status == "void":
            raise ConflictError("Cannot mutate a voided folio")

        now = datetime.now(timezone.utc)

        for idx, ch in enumerate(request.charges, start=1):
            idem = f"{request.idempotency_key}:item:{idx}" if request.idempotency_key else None
            if idem:
                exists = (
                    await self.db.execute(select(HotelFolioItem).where(HotelFolioItem.idempotency_key == idem))
                ).scalar_one_or_none()
                if exists:
                    continue
            total_paisa = (ch.quantity * ch.unit_amount_paisa) + ch.tax_paisa
            self.db.add(
                HotelFolioItem(
                    folio_id=folio.id,
                    hotel_id=folio.hotel_id,
                    item_type=ch.item_type.value,
                    description=ch.description,
                    quantity=ch.quantity,
                    unit_amount_paisa=ch.unit_amount_paisa,
                    tax_paisa=ch.tax_paisa,
                    total_paisa=total_paisa,
                    entry_side=ch.entry_side.value,
                    payer_label=ch.payer_label,
                    reference_id=ch.reference_id,
                    posted_by=current_user.id,
                    idempotency_key=idem,
                    posted_at=now,
                )
            )

        if request.payment_amount_paisa > 0:
            pay_idem = f"{request.idempotency_key}:pay" if request.idempotency_key else None
            already_paid = False
            if pay_idem:
                already_paid = (
                    await self.db.execute(select(HotelFolioItem).where(HotelFolioItem.idempotency_key == pay_idem))
                ).scalar_one_or_none() is not None
            if not already_paid:
                self.db.add(
                    HotelFolioItem(
                        folio_id=folio.id,
                        hotel_id=folio.hotel_id,
                        item_type="payment",
                        description=f"Payment via {request.payment_method}",
                        quantity=1,
                        unit_amount_paisa=request.payment_amount_paisa,
                        tax_paisa=0,
                        total_paisa=request.payment_amount_paisa,
                        entry_side="payment",
                        reference_id=request.payment_method,
                        posted_by=current_user.id,
                        idempotency_key=pay_idem,
                        posted_at=now,
                    )
                )

        await self.db.flush()

        # Recompute deterministic folio totals
        all_items = (
            await self.db.execute(
                select(HotelFolioItem)
                .where(HotelFolioItem.folio_id == folio.id, HotelFolioItem.is_voided.is_(False))
                .order_by(HotelFolioItem.posted_at.asc())
            )
        ).scalars().all()

        room_sum = 0
        addon_sum = 0
        tax_sum = 0
        disc_sum = 0
        charge_sum = 0
        paid_sum = 0
        split_by_payer: Dict[str, int] = defaultdict(int)

        for item in all_items:
            payer = item.payer_label or "primary_guest"
            if item.entry_side == "charge":
                pre_tax = max(0, item.total_paisa - item.tax_paisa)
                if item.item_type == "room_night":
                    room_sum += pre_tax
                else:
                    addon_sum += pre_tax
                tax_sum += item.tax_paisa
                charge_sum += item.total_paisa
                split_by_payer[payer] += item.total_paisa
            elif item.entry_side == "credit":
                disc_sum += item.total_paisa
                split_by_payer[payer] = max(0, split_by_payer[payer] - item.total_paisa)
            elif item.entry_side == "payment":
                paid_sum += item.total_paisa

        total_charges = max(0, charge_sum - disc_sum)
        balance_due = max(0, total_charges - paid_sum)

        if request.checkout and balance_due > 0:
            raise BadRequestError(
                f"Cannot check out with unpaid folio balance of {balance_due} paisa",
                code="UNPAID_FOLIO_BALANCE",
            )

        folio.room_charges_paisa = room_sum
        folio.addon_charges_paisa = addon_sum
        folio.tax_paisa = tax_sum
        folio.discount_paisa = disc_sum
        folio.total_charges_paisa = total_charges
        folio.paid_paisa = paid_sum
        folio.balance_due_paisa = balance_due

        if request.checkout and balance_due == 0:
            folio.status = "settled"
            folio.checked_out_at = folio.checked_out_at or now
            folio.settled_at = folio.settled_at or now
        elif balance_due == 0 and paid_sum > 0:
            folio.status = "settled"
            folio.settled_at = folio.settled_at or now
        elif paid_sum > 0:
            folio.status = "partially_paid"

        hk_task_id: Optional[uuid.UUID] = None
        if request.checkout:
            keys = (
                await self.db.execute(
                    select(HotelGuestKey).where(
                        HotelGuestKey.folio_id == folio.id,
                        HotelGuestKey.status == "active",
                    )
                )
            ).scalars().all()
            for k in keys:
                k.status = "expired"

            if folio.room_unit_id:
                unit = (
                    await self.db.execute(
                        select(HotelRoomUnit).where(HotelRoomUnit.id == folio.room_unit_id).with_for_update()
                    )
                ).scalar_one_or_none()
                if unit:
                    unit.occupancy_status = "vacant"
                    unit.housekeeping_status = "dirty"
                    unit.current_booking_id = None
                    unit.current_guest_id = None

                    hk_task = HotelHousekeepingTask(
                        hotel_id=folio.hotel_id,
                        room_unit_id=unit.id,
                        task_type="checkout_clean",
                        priority="vip_arrival" if unit.is_vip_room else "normal",
                        status="dirty",
                        sla_minutes=45,
                        due_by=now + timedelta(minutes=45),
                        notes=f"Auto-dispatched upon guest checkout (Folio {folio.folio_number})",
                    )
                    self.db.add(hk_task)
                    await self.db.flush()
                    hk_task_id = hk_task.id

        if request.checkout and folio.checked_out_at is not None and balance_due == 0:
            try:
                from app.notifications.events.base import DomainEvent
                from app.notifications.outbox.publisher import OutboxPublisher

                checked_out_event = DomainEvent(
                    event_type="hotel.guest.checked_out",
                    aggregate_type="booking",
                    aggregate_id=str(folio.booking_id or folio.id),
                    actor_id=folio.guest_user_id,
                    priority=7,
                    hotel_id=folio.hotel_id,
                    booking_id=folio.booking_id,
                    folio_id=folio.id,
                    folio_number=folio.folio_number,
                    total_charges_paisa=total_charges,
                    paid_paisa=paid_sum,
                    currency=folio.currency,
                    user_id=folio.guest_user_id,
                    category="booking",
                    deep_link="/(tabs)/trips",
                    headers={
                        "source_service": "hotel_pms_service",
                        "causation_id": str(folio.id),
                    },
                )
                await OutboxPublisher.publish_idempotent(
                    self.db,
                    checked_out_event,
                    idempotency_key=f"hotel_checked_out:{folio.id}",
                )
            except Exception as outbox_err:
                logger.warning(f"Could not stage hotel.guest.checked_out into outbox: {outbox_err}")

        await self.db.commit()
        return CheckoutSummaryResponse(
            folio_id=folio.id,
            folio_number=folio.folio_number,
            status=folio.status,
            checked_out=folio.checked_out_at is not None,
            room_charges_paisa=room_sum,
            addon_charges_paisa=addon_sum,
            tax_paisa=tax_sum,
            discount_paisa=disc_sum,
            total_charges_paisa=total_charges,
            paid_paisa=paid_sum,
            balance_due_paisa=balance_due,
            split_by_payer=dict(split_by_payer),
            housekeeping_task_id=hk_task_id,
            items=[FolioItemResponse.model_validate(i) for i in all_items],
        )

    # -------------------------------------------------------------------------
    # 4. HOUSEKEEPING TURNAROUND DISPATCH
    # -------------------------------------------------------------------------

    async def list_housekeeping_tasks(
        self, hotel_id: uuid.UUID, current_user: CurrentUser, status_filter: Optional[str] = None
    ) -> List[HotelHousekeepingTask]:
        await self.verify_hotel_staff_access(hotel_id, current_user)
        stmt = select(HotelHousekeepingTask).where(HotelHousekeepingTask.hotel_id == hotel_id)
        if status_filter:
            stmt = stmt.where(HotelHousekeepingTask.status == status_filter)
        rows = (await self.db.execute(stmt.order_by(HotelHousekeepingTask.created_at.desc()))).scalars().all()
        return list(rows)

    async def create_housekeeping_task(
        self, hotel_id: uuid.UUID, current_user: CurrentUser, request: HousekeepingTaskCreateRequest
    ) -> HotelHousekeepingTask:
        await self.verify_hotel_staff_access(hotel_id, current_user)
        unit = (
            await self.db.execute(
                select(HotelRoomUnit).where(
                    HotelRoomUnit.id == request.room_unit_id,
                    HotelRoomUnit.hotel_id == hotel_id,
                )
            )
        ).scalar_one_or_none()
        if not unit:
            raise NotFoundError("HotelRoomUnit", request.room_unit_id)

        now = datetime.now(timezone.utc)
        task = HotelHousekeepingTask(
            hotel_id=hotel_id,
            room_unit_id=unit.id,
            assigned_staff_id=request.assigned_staff_id,
            assigned_user_id=request.assigned_user_id,
            task_type=request.task_type.value,
            priority=request.priority.value,
            status="dirty",
            sla_minutes=request.sla_minutes,
            due_by=now + timedelta(minutes=request.sla_minutes),
            checklist=request.checklist,
            notes=request.notes,
        )
        unit.housekeeping_status = "dirty"
        self.db.add(task)
        await self.db.commit()
        await self.db.refresh(task)
        return task

    async def transition_housekeeping_task(
        self, task_id: uuid.UUID, current_user: CurrentUser, request: HousekeepingTaskTransitionRequest
    ) -> HotelHousekeepingTask:
        task = (
            await self.db.execute(
                select(HotelHousekeepingTask).where(HotelHousekeepingTask.id == task_id).with_for_update()
            )
        ).scalar_one_or_none()
        if not task:
            raise NotFoundError("HotelHousekeepingTask", task_id)

        await self.verify_hotel_staff_access(task.hotel_id, current_user)

        target = request.target_status.value
        allowed = HOUSEKEEPING_ALLOWED_TRANSITIONS.get(task.status, set())
        if target not in allowed:
            raise BadRequestError(
                f"Invalid housekeeping transition from '{task.status}' to '{target}'",
                code="INVALID_HK_TRANSITION",
            )

        now = datetime.now(timezone.utc)
        task.status = target
        if request.notes is not None:
            task.notes = request.notes

        unit = (
            await self.db.execute(
                select(HotelRoomUnit).where(HotelRoomUnit.id == task.room_unit_id).with_for_update()
            )
        ).scalar_one_or_none()

        if target == "cleaning":
            task.started_at = task.started_at or now
            if unit:
                unit.housekeeping_status = "cleaning"
        elif target == "inspection":
            task.inspected_at = now
            if unit:
                unit.housekeeping_status = "inspection"
                unit.last_cleaned_at = now
        elif target == "ready":
            task.completed_at = now
            task.inspected_by = current_user.id
            if unit:
                unit.housekeeping_status = "ready"
                unit.last_inspected_at = now
        elif target == "dirty" and unit:
            unit.housekeeping_status = "dirty"

        await self.db.commit()
        await self.db.refresh(task)
        return task

    # -------------------------------------------------------------------------
    # 5. MAINTENANCE TICKETING
    # -------------------------------------------------------------------------

    async def list_maintenance_tickets(
        self, hotel_id: uuid.UUID, current_user: CurrentUser, status_filter: Optional[str] = None
    ) -> List[HotelMaintenanceTicket]:
        await self.verify_hotel_staff_access(hotel_id, current_user)
        stmt = select(HotelMaintenanceTicket).where(HotelMaintenanceTicket.hotel_id == hotel_id)
        if status_filter:
            stmt = stmt.where(HotelMaintenanceTicket.status == status_filter)
        rows = (await self.db.execute(stmt.order_by(HotelMaintenanceTicket.created_at.desc()))).scalars().all()
        return list(rows)

    async def create_maintenance_ticket(
        self, hotel_id: uuid.UUID, current_user: CurrentUser, request: MaintenanceTicketCreateRequest
    ) -> HotelMaintenanceTicket:
        await self.verify_hotel_staff_access(hotel_id, current_user)

        unit: Optional[HotelRoomUnit] = None
        if request.room_unit_id:
            unit = (
                await self.db.execute(
                    select(HotelRoomUnit)
                    .where(
                        HotelRoomUnit.id == request.room_unit_id,
                        HotelRoomUnit.hotel_id == hotel_id,
                    )
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if not unit:
                raise NotFoundError("HotelRoomUnit", request.room_unit_id)

        ticket = HotelMaintenanceTicket(
            hotel_id=hotel_id,
            room_unit_id=request.room_unit_id,
            reported_by=current_user.id,
            assigned_staff_id=request.assigned_staff_id,
            ticket_reference=f"MNT-{uuid.uuid4().hex[:8].upper()}",
            category=request.category.value,
            severity=request.severity.value,
            status="assigned" if request.assigned_staff_id else "open",
            title=request.title,
            description=request.description,
            blocks_room_sale=request.blocks_room_sale,
            estimated_cost_bdt=request.estimated_cost_bdt,
        )
        self.db.add(ticket)

        if unit and request.blocks_room_sale and unit.occupancy_status != "occupied":
            unit.occupancy_status = "out_of_order"
            unit.housekeeping_status = "out_of_service"

        await self.db.commit()
        await self.db.refresh(ticket)
        return ticket

    async def update_maintenance_ticket(
        self, ticket_id: uuid.UUID, current_user: CurrentUser, request: MaintenanceTicketUpdateRequest
    ) -> HotelMaintenanceTicket:
        ticket = (
            await self.db.execute(
                select(HotelMaintenanceTicket).where(HotelMaintenanceTicket.id == ticket_id).with_for_update()
            )
        ).scalar_one_or_none()
        if not ticket:
            raise NotFoundError("HotelMaintenanceTicket", ticket_id)

        await self.verify_hotel_staff_access(ticket.hotel_id, current_user)

        if request.status is not None:
            ticket.status = request.status.value
            if request.status.value in ("resolved", "closed"):
                ticket.resolved_at = datetime.now(timezone.utc)
        if request.severity is not None:
            ticket.severity = request.severity.value
        if request.assigned_staff_id is not None:
            ticket.assigned_staff_id = request.assigned_staff_id
        if request.blocks_room_sale is not None:
            ticket.blocks_room_sale = request.blocks_room_sale
        if request.actual_cost_bdt is not None:
            ticket.actual_cost_bdt = request.actual_cost_bdt
        if request.resolution_notes is not None:
            ticket.resolution_notes = request.resolution_notes

        if ticket.room_unit_id and ticket.status in ("resolved", "closed"):
            unit = (
                await self.db.execute(
                    select(HotelRoomUnit).where(HotelRoomUnit.id == ticket.room_unit_id).with_for_update()
                )
            ).scalar_one_or_none()
            if unit and unit.occupancy_status == "out_of_order":
                unit.occupancy_status = "vacant"
                unit.housekeeping_status = "dirty"

        await self.db.commit()
        await self.db.refresh(ticket)
        return ticket

    # -------------------------------------------------------------------------
    # 6. DYNAMIC YIELD PRICING RULES & ANALYTICS
    # -------------------------------------------------------------------------

    async def list_rate_rules(self, hotel_id: uuid.UUID, current_user: CurrentUser) -> List[HotelRateRule]:
        await self.verify_hotel_staff_access(hotel_id, current_user)
        rows = (
            await self.db.execute(
                select(HotelRateRule)
                .where(HotelRateRule.hotel_id == hotel_id)
                .order_by(HotelRateRule.priority.asc())
            )
        ).scalars().all()
        return list(rows)

    async def create_rate_rule(
        self, hotel_id: uuid.UUID, current_user: CurrentUser, request: RateRuleCreateRequest
    ) -> HotelRateRule:
        await self.verify_hotel_staff_access(hotel_id, current_user)
        if request.room_type_id:
            rt = (
                await self.db.execute(
                    select(HotelRoom).where(HotelRoom.id == request.room_type_id, HotelRoom.hotel_id == hotel_id)
                )
            ).scalar_one_or_none()
            if not rt:
                raise NotFoundError("HotelRoom", request.room_type_id)

        rule = HotelRateRule(
            hotel_id=hotel_id,
            room_type_id=request.room_type_id,
            rule_name=request.rule_name,
            rule_type=request.rule_type.value,
            priority=request.priority,
            multiplier=request.multiplier,
            flat_adjustment_bdt=request.flat_adjustment_bdt,
            min_occupancy_pct=request.min_occupancy_pct,
            max_occupancy_pct=request.max_occupancy_pct,
            days_of_week=request.days_of_week,
            start_date=request.start_date,
            end_date=request.end_date,
            min_nights=request.min_nights,
            is_flash_deal=request.is_flash_deal,
            is_active=request.is_active,
        )
        self.db.add(rule)
        await self.db.commit()
        await self.db.refresh(rule)
        return rule

    async def update_rate_rule(
        self, rule_id: uuid.UUID, current_user: CurrentUser, request: RateRuleUpdateRequest
    ) -> HotelRateRule:
        rule = (
            await self.db.execute(select(HotelRateRule).where(HotelRateRule.id == rule_id).with_for_update())
        ).scalar_one_or_none()
        if not rule:
            raise NotFoundError("HotelRateRule", rule_id)
        await self.verify_hotel_staff_access(rule.hotel_id, current_user)

        if request.rule_name is not None:
            rule.rule_name = request.rule_name
        if request.multiplier is not None:
            rule.multiplier = request.multiplier
        if request.flat_adjustment_bdt is not None:
            rule.flat_adjustment_bdt = request.flat_adjustment_bdt
        if request.is_flash_deal is not None:
            rule.is_flash_deal = request.is_flash_deal
        if request.is_active is not None:
            rule.is_active = request.is_active

        await self.db.commit()
        await self.db.refresh(rule)
        return rule

    async def compute_dynamic_rate(
        self, hotel_id: uuid.UUID, request: DynamicRateRequest
    ) -> DynamicRateQuoteResponse:
        room_type = (
            await self.db.execute(
                select(HotelRoom).where(
                    HotelRoom.id == request.room_type_id,
                    HotelRoom.hotel_id == hotel_id,
                )
            )
        ).scalar_one_or_none()
        if not room_type:
            raise NotFoundError("HotelRoom", request.room_type_id)

        units = (
            await self.db.execute(
                select(HotelRoomUnit).where(
                    HotelRoomUnit.hotel_id == hotel_id,
                    HotelRoomUnit.room_type_id == request.room_type_id,
                    HotelRoomUnit.is_active.is_(True),
                )
            )
        ).scalars().all()
        total_units = len(units)
        occupied_units = sum(1 for u in units if u.occupancy_status in ("occupied", "reserved", "due_out"))
        occupancy_pct = (
            (Decimal(occupied_units) * Decimal("100") / Decimal(total_units)).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            if total_units > 0
            else Decimal("0.00")
        )

        rules = (
            await self.db.execute(
                select(HotelRateRule)
                .where(HotelRateRule.hotel_id == hotel_id, HotelRateRule.is_active.is_(True))
                .order_by(HotelRateRule.priority.asc())
            )
        ).scalars().all()

        # Align Python weekday (Mon=0..Sun=6) to PostgreSQL DOW / JS getUTCDay() (Sun=0..Sat=6)
        dow = (request.check_in.weekday() + 1) % 7
        base_rate = Decimal(str(room_type.base_price_per_night))

        raw_mult = Decimal("1.0000")
        flat_delta = Decimal("0.00")
        applied_items: List[AppliedRateRuleItem] = []

        for rule in rules:
            if rule.room_type_id is not None and rule.room_type_id != request.room_type_id:
                continue
            if rule.start_date is not None and request.check_in < rule.start_date:
                continue
            if rule.end_date is not None and request.check_in > rule.end_date:
                continue
            if rule.days_of_week and dow not in rule.days_of_week:
                continue
            if rule.min_occupancy_pct is not None and occupancy_pct < rule.min_occupancy_pct:
                continue
            if rule.max_occupancy_pct is not None and occupancy_pct > rule.max_occupancy_pct:
                continue
            if rule.min_nights is not None and request.nights < rule.min_nights:
                continue

            raw_mult = raw_mult * Decimal(str(rule.multiplier))
            flat_delta = flat_delta + Decimal(str(rule.flat_adjustment_bdt))
            applied_items.append(
                AppliedRateRuleItem(
                    rule_id=rule.id,
                    rule_name=rule.rule_name,
                    rule_type=rule.rule_type,
                    multiplier=rule.multiplier,
                    flat_adjustment_bdt=rule.flat_adjustment_bdt,
                    is_flash_deal=rule.is_flash_deal,
                )
            )

        clamped_mult = min(HOTEL_MAX_MULTIPLIER, max(HOTEL_MIN_MULTIPLIER, raw_mult)).quantize(
            Decimal("0.001"), rounding=ROUND_HALF_UP
        )
        max_allowed_bdt = _round_bdt(base_rate * HOTEL_MAX_MULTIPLIER)
        raw_nightly_bdt = max(Decimal("100.00"), _round_bdt((base_rate * clamped_mult) + flat_delta))
        dynamic_nightly_bdt = min(max_allowed_bdt, raw_nightly_bdt)
        is_capped = (raw_mult > HOTEL_MAX_MULTIPLIER) or (raw_nightly_bdt > max_allowed_bdt)

        subtotal_paisa = _round_paisa(dynamic_nightly_bdt * Decimal(request.nights) * Decimal("100"))
        vat_paisa = _round_paisa(Decimal(subtotal_paisa) * HOTEL_VAT_RATE)
        service_paisa = _round_paisa(Decimal(subtotal_paisa) * HOTEL_SERVICE_CHARGE_RATE)
        total_paisa = subtotal_paisa + vat_paisa + service_paisa

        return DynamicRateQuoteResponse(
            hotel_id=hotel_id,
            room_type_id=request.room_type_id,
            check_in=request.check_in,
            nights=request.nights,
            occupancy_pct=occupancy_pct,
            base_nightly_bdt=_round_bdt(base_rate),
            effective_multiplier=clamped_mult,
            is_capped=is_capped,
            dynamic_nightly_bdt=dynamic_nightly_bdt,
            subtotal_paisa=subtotal_paisa,
            vat_paisa=vat_paisa,
            service_charge_paisa=service_paisa,
            total_paisa=total_paisa,
            currency=room_type.currency or "BDT",
            applied_rules=applied_items,
        )

    async def get_pms_analytics(
        self, hotel_id: uuid.UUID, current_user: CurrentUser
    ) -> HotelPmsAnalyticsResponse:
        await self.verify_hotel_staff_access(hotel_id, current_user)

        units = (
            await self.db.execute(
                select(HotelRoomUnit).where(HotelRoomUnit.hotel_id == hotel_id, HotelRoomUnit.is_active.is_(True))
            )
        ).scalars().all()
        folios = (
            await self.db.execute(
                select(HotelFolio).where(HotelFolio.hotel_id == hotel_id, HotelFolio.status != "void")
            )
        ).scalars().all()
        hk_tasks = (
            await self.db.execute(
                select(HotelHousekeepingTask).where(
                    HotelHousekeepingTask.hotel_id == hotel_id,
                    HotelHousekeepingTask.status.in_(["dirty", "cleaning", "inspection"]),
                )
            )
        ).scalars().all()
        maint_tickets = (
            await self.db.execute(
                select(HotelMaintenanceTicket).where(
                    HotelMaintenanceTicket.hotel_id == hotel_id,
                    HotelMaintenanceTicket.status.in_(["open", "assigned", "in_progress", "parts_pending"]),
                )
            )
        ).scalars().all()

        total_units = len(units)
        occupied_units = sum(1 for u in units if u.occupancy_status in ("occupied", "reserved", "due_out"))
        vacant_clean = sum(
            1 for u in units if u.occupancy_status == "vacant" and u.housekeeping_status in ("clean", "ready")
        )
        dirty_units = sum(1 for u in units if u.housekeeping_status == "dirty")
        ooo_units = sum(1 for u in units if u.occupancy_status in ("out_of_order", "blocked"))

        occ_rate = (
            (Decimal(occupied_units) * Decimal("100") / Decimal(total_units)).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            if total_units > 0
            else Decimal("0.00")
        )

        total_room_rev_paisa = sum(f.room_charges_paisa for f in folios)
        total_addon_rev_paisa = sum(f.addon_charges_paisa for f in folios)
        room_rev_bdt = Decimal(total_room_rev_paisa) / Decimal("100")

        adr_bdt = (
            _round_bdt(room_rev_bdt / Decimal(occupied_units))
            if occupied_units > 0
            else Decimal("0.00")
        )
        revpar_bdt = (
            _round_bdt(room_rev_bdt / Decimal(total_units))
            if total_units > 0
            else Decimal("0.00")
        )
        maint_cost_bdt = sum((Decimal(str(t.actual_cost_bdt)) for t in maint_tickets), Decimal("0.00"))
        goppar_bdt = (
            _round_bdt((room_rev_bdt - maint_cost_bdt) / Decimal(total_units))
            if total_units > 0
            else Decimal("0.00")
        )

        unsettled_folios = [f for f in folios if f.balance_due_paisa > 0]
        critical_maint = sum(1 for t in maint_tickets if t.severity == "critical")

        return HotelPmsAnalyticsResponse(
            hotel_id=hotel_id,
            total_units=total_units,
            occupied_units=occupied_units,
            vacant_clean_units=vacant_clean,
            dirty_units=dirty_units,
            out_of_order_units=ooo_units,
            occupancy_rate_pct=occ_rate,
            adr_bdt=adr_bdt,
            revpar_bdt=revpar_bdt,
            goppar_bdt=goppar_bdt,
            total_room_revenue_paisa=total_room_rev_paisa,
            total_addon_revenue_paisa=total_addon_rev_paisa,
            unsettled_folios_count=len(unsettled_folios),
            unsettled_balance_paisa=sum(f.balance_due_paisa for f in unsettled_folios),
            housekeeping_pending_count=len(hk_tasks),
            open_maintenance_tickets=len(maint_tickets),
            critical_maintenance_tickets=critical_maint,
        )


HotelPmsService = HotelPMSService

