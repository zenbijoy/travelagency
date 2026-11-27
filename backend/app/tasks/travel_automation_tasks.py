"""
Scheduled Travel Ecosystem Automation Detection Jobs.
Detects time-based and state-change notification triggers against real domain tables:
  1. Trip preparation reminders (7d / 3d / 1d before departure)
  2. Hotel check-in & check-out reminders
  3. Incomplete booking recovery with post-booking suppression & cooldown
  4. Verified disruption & refund state-change outbox alerts

All jobs enforce deterministic idempotency keys via `OutboxPublisher.publish_idempotent`
so Celery worker restarts or overlapping beat ticks never duplicate dispatches.
"""

import asyncio
from datetime import date, datetime, timedelta, timezone
import logging
from typing import Any, Awaitable, Callable, Dict, Iterable, List, Optional, Set, Tuple
import uuid
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.booking import Booking, BookingItem, BookingPassenger, BookingPayment
from app.models.hotel import Hotel, HotelRoom
from app.models.hotel_pms import HotelFolio
from app.models.notification import NotificationOutbox, NotificationUserPreference
from app.models.ticket import Ticket
from app.models.travel_intelligence import DisruptionEvent, JourneyMonitor
from app.notifications.events.base import DomainEvent
from app.notifications.events.hotel import HotelGuestCheckInReminderEvent
from app.notifications.events.travel_product import (
    FlightScheduleChangedEvent,
    TravelDisruptionDetectedEvent,
)
from app.notifications.outbox.publisher import OutboxPublisher
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)

_INCOMPLETE_BOOKING_RECOVERY_COOLDOWN: Dict[str, datetime] = {}


def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Normalize SQLite naive datetimes and aware datetimes cleanly to UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _run_async(coro_fn: Callable[[], Awaitable[Dict[str, Any]]]) -> Dict[str, Any]:
    """Safely bridge synchronous Celery task entrypoints to async database execution."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures

            with concurrent.futures.ThreadPoolExecutor() as executor:
                return executor.submit(asyncio.run, coro_fn()).result()
        return loop.run_until_complete(coro_fn())
    except RuntimeError:
        return asyncio.run(coro_fn())


async def _load_user_preferences(
    db: AsyncSession, user_ids: Iterable[uuid.UUID]
) -> Dict[uuid.UUID, NotificationUserPreference]:
    unique_ids = list({uid for uid in user_ids if uid is not None})
    if not unique_ids:
        return {}
    res = await db.execute(
        select(NotificationUserPreference).where(
            NotificationUserPreference.user_id.in_(unique_ids)
        )
    )
    return {pref.user_id: pref for pref in res.scalars().all()}


# ---------------------------------------------------------------------------
# 1. TRIP PREPARATION REMINDERS (7d / 3d / 1d BEFORE DEPARTURE)
# ---------------------------------------------------------------------------

async def detect_trip_preparation_reminders_async(
    session: Optional[AsyncSession] = None,
    now_utc: Optional[datetime] = None,
    milestones: Tuple[int, ...] = (7, 3, 1),
) -> Dict[str, Any]:
    """
    Scan upcoming confirmed/paid bookings matching 7d, 3d, or 1d departure milestones
    and stage idempotent `automation.trip_preparation` outbox events.
    """
    current_utc = _ensure_utc(now_utc) or datetime.now(timezone.utc)
    today = current_utc.date()
    target_date_to_days: Dict[date, int] = {
        today + timedelta(days=int(days)): int(days) for days in milestones
    }

    async def _execute(db: AsyncSession) -> Dict[str, Any]:
        stmt = select(Booking).where(
            Booking.status.in_(["confirmed", "paid", "checked_in"]),
            Booking.start_date.in_(list(target_date_to_days.keys())),
        )
        bookings = list((await db.execute(stmt)).scalars().all())
        if not bookings:
            return {
                "status": "success",
                "scanned": 0,
                "staged": 0,
                "deduplicated": 0,
                "suppressed": 0,
            }

        booking_ids = [b.id for b in bookings]
        prefs = await _load_user_preferences(db, [b.user_id for b in bookings])

        ticket_counts: Dict[uuid.UUID, int] = dict(
            (
                await db.execute(
                    select(Ticket.booking_id, func.count(Ticket.id))
                    .where(Ticket.booking_id.in_(booking_ids), Ticket.status == "active")
                    .group_by(Ticket.booking_id)
                )
            ).all()
        )
        pax_counts: Dict[uuid.UUID, int] = dict(
            (
                await db.execute(
                    select(BookingPassenger.booking_id, func.count(BookingPassenger.id))
                    .where(BookingPassenger.booking_id.in_(booking_ids))
                    .group_by(BookingPassenger.booking_id)
                )
            ).all()
        )

        staged = 0
        deduplicated = 0
        suppressed = 0

        for booking in bookings:
            pref = prefs.get(booking.user_id)
            if pref is not None and not pref.category_booking:
                suppressed += 1
                continue

            days_left = target_date_to_days[booking.start_date]
            t_count = int(ticket_counts.get(booking.id, 0))
            p_count = int(pax_counts.get(booking.id, 0))
            required_guests = max(1, int(booking.number_of_guests or 1))

            event = DomainEvent(
                event_type="automation.trip_preparation",
                aggregate_type="booking",
                aggregate_id=str(booking.id),
                actor_id=booking.user_id,
                priority=8 if days_left <= 1 else 7,
                booking_id=booking.id,
                booking_reference=booking.booking_reference,
                user_id=booking.user_id,
                destination=booking.destination_city,
                origin=booking.origin_city,
                product_type=booking.product_type,
                start_date=booking.start_date.isoformat(),
                end_date=booking.end_date.isoformat() if booking.end_date else None,
                days_until_departure=days_left,
                reminder_milestone=f"{days_left}d",
                active_ticket_count=t_count,
                passenger_count=p_count,
                passengers_complete=p_count >= required_guests,
                category="booking",
                deep_link="/(tabs)/trips",
                headers={
                    "source_service": "travel_automation_tasks",
                    "causation_id": f"{booking.id}:{days_left}d",
                },
            )
            _, created = await OutboxPublisher.publish_idempotent(
                db,
                event,
                idempotency_key=f"trip_prep:{booking.id}:{booking.start_date.isoformat()}:{days_left}d",
                scheduled_at=current_utc,
            )
            if created:
                staged += 1
            else:
                deduplicated += 1

        if staged > 0:
            await db.commit()

        return {
            "status": "success",
            "scanned": len(bookings),
            "staged": staged,
            "deduplicated": deduplicated,
            "suppressed": suppressed,
        }

    if session is not None:
        return await _execute(session)
    async with AsyncSessionLocal() as db:
        return await _execute(db)


# ---------------------------------------------------------------------------
# 2. HOTEL CHECK-IN & CHECK-OUT REMINDERS
# ---------------------------------------------------------------------------

async def detect_hotel_checkin_checkout_reminders_async(
    session: Optional[AsyncSession] = None,
    now_utc: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Detect same-day hotel arrivals (not yet checked in) and same-day hotel departures
    (not yet checked out), staging idempotent reminder events.
    """
    current_utc = _ensure_utc(now_utc) or datetime.now(timezone.utc)
    today = current_utc.date()

    async def _execute(db: AsyncSession) -> Dict[str, Any]:
        stmt = select(Booking).where(
            Booking.product_type == "hotel",
            Booking.status.in_(["confirmed", "paid", "checked_in"]),
            or_(Booking.start_date == today, Booking.end_date == today),
        )
        bookings = list((await db.execute(stmt)).scalars().all())
        if not bookings:
            return {
                "status": "success",
                "scanned": 0,
                "checkin_staged": 0,
                "checkout_staged": 0,
                "staged": 0,
                "deduplicated": 0,
                "suppressed": 0,
            }

        booking_ids = [b.id for b in bookings]
        prefs = await _load_user_preferences(db, [b.user_id for b in bookings])

        folio_rows = list(
            (
                await db.execute(
                    select(HotelFolio).where(HotelFolio.booking_id.in_(booking_ids))
                )
            )
            .scalars()
            .all()
        )
        folio_by_booking: Dict[uuid.UUID, HotelFolio] = {
            f.booking_id: f for f in folio_rows if f.booking_id is not None
        }

        item_rows = list(
            (
                await db.execute(
                    select(BookingItem).where(BookingItem.booking_id.in_(booking_ids))
                )
            )
            .scalars()
            .all()
        )
        first_item_by_booking: Dict[uuid.UUID, BookingItem] = {}
        product_ids: Set[uuid.UUID] = set()
        for item in item_rows:
            first_item_by_booking.setdefault(item.booking_id, item)
            if item.product_id is not None:
                product_ids.add(item.product_id)

        room_to_hotel: Dict[uuid.UUID, uuid.UUID] = {}
        if product_ids:
            room_rows = (
                await db.execute(
                    select(HotelRoom.id, HotelRoom.hotel_id).where(
                        HotelRoom.id.in_(list(product_ids))
                    )
                )
            ).all()
            room_to_hotel = {r_id: h_id for r_id, h_id in room_rows}

        candidate_hotel_ids: Set[uuid.UUID] = set(room_to_hotel.values()) | product_ids
        candidate_hotel_ids.update(f.hotel_id for f in folio_rows if f.hotel_id is not None)

        hotels_by_id: Dict[uuid.UUID, Hotel] = {}
        if candidate_hotel_ids:
            h_rows = (
                await db.execute(
                    select(Hotel).where(Hotel.id.in_(list(candidate_hotel_ids)))
                )
            ).scalars().all()
            hotels_by_id = {h.id: h for h in h_rows}

        checkin_staged = 0
        checkout_staged = 0
        deduplicated = 0
        suppressed = 0

        for booking in bookings:
            pref = prefs.get(booking.user_id)
            if pref is not None and not pref.category_booking:
                suppressed += 1
                continue

            folio = folio_by_booking.get(booking.id)
            item = first_item_by_booking.get(booking.id)

            resolved_hotel: Optional[Hotel] = None
            if folio and folio.hotel_id in hotels_by_id:
                resolved_hotel = hotels_by_id[folio.hotel_id]
            elif item and item.product_id:
                mapped_hotel_id = room_to_hotel.get(item.product_id, item.product_id)
                resolved_hotel = hotels_by_id.get(mapped_hotel_id)

            hotel_name = (
                resolved_hotel.name
                if resolved_hotel
                else (item.product_name if item else f"Partner Hotel ({booking.destination_city})")
            )

            # Check-in reminder on arrival day if not already checked in
            if booking.start_date == today:
                already_checked_in = booking.flow_step == "checked_in" or (
                    folio is not None and folio.checked_in_at is not None
                )
                if not already_checked_in:
                    checkin_event = HotelGuestCheckInReminderEvent(
                        booking_id=booking.id,
                        booking_reference=booking.booking_reference,
                        user_id=booking.user_id,
                        actor_id=booking.user_id,
                        hotel_id=resolved_hotel.id if resolved_hotel else None,
                        hotel_name=hotel_name,
                        hotel_address=resolved_hotel.address if resolved_hotel else None,
                        destination=booking.destination_city,
                        check_in_date=booking.start_date.isoformat(),
                        check_in_time=(resolved_hotel.check_in_time if resolved_hotel else "14:00"),
                        category="booking",
                        deep_link="/(tabs)/trips",
                        headers={
                            "source_service": "travel_automation_tasks",
                            "causation_id": f"{booking.id}:checkin:{today.isoformat()}",
                        },
                    )
                    _, created = await OutboxPublisher.publish_idempotent(
                        db,
                        checkin_event,
                        idempotency_key=f"hotel_checkin:{booking.id}:{booking.start_date.isoformat()}",
                        scheduled_at=current_utc,
                    )
                    if created:
                        checkin_staged += 1
                    else:
                        deduplicated += 1

            # Check-out reminder on departure day when stay is active/checked-in
            if booking.end_date == today and (
                booking.start_date is None
                or booking.start_date < today
                or booking.flow_step == "checked_in"
                or (folio is not None and folio.checked_in_at is not None)
            ):
                already_checked_out = (
                    booking.status == "completed"
                    or booking.flow_step == "completed"
                    or (folio is not None and folio.checked_out_at is not None)
                )
                if not already_checked_out:
                    checkout_event = DomainEvent(
                        event_type="hotel.guest.check_out_reminder",
                        aggregate_type="booking",
                        aggregate_id=str(booking.id),
                        actor_id=booking.user_id,
                        priority=6,
                        booking_id=booking.id,
                        booking_reference=booking.booking_reference,
                        user_id=booking.user_id,
                        hotel_id=resolved_hotel.id if resolved_hotel else None,
                        hotel_name=hotel_name,
                        destination=booking.destination_city,
                        check_out_date=booking.end_date.isoformat(),
                        check_out_time=(resolved_hotel.check_out_time if resolved_hotel else "12:00"),
                        has_outstanding_folio_balance=bool(
                            folio is not None and folio.balance_due_paisa > 0
                        ),
                        category="booking",
                        deep_link="/(tabs)/trips",
                        headers={
                            "source_service": "travel_automation_tasks",
                            "causation_id": f"{booking.id}:checkout:{today.isoformat()}",
                        },
                    )
                    _, created = await OutboxPublisher.publish_idempotent(
                        db,
                        checkout_event,
                        idempotency_key=f"hotel_checkout:{booking.id}:{booking.end_date.isoformat()}",
                        scheduled_at=current_utc,
                    )
                    if created:
                        checkout_staged += 1
                    else:
                        deduplicated += 1

        total_staged = checkin_staged + checkout_staged
        if total_staged > 0:
            await db.commit()

        return {
            "status": "success",
            "scanned": len(bookings),
            "checkin_staged": checkin_staged,
            "checkout_staged": checkout_staged,
            "staged": total_staged,
            "deduplicated": deduplicated,
            "suppressed": suppressed,
        }

    if session is not None:
        return await _execute(session)
    async with AsyncSessionLocal() as db:
        return await _execute(db)


# ---------------------------------------------------------------------------
# 3. INCOMPLETE BOOKING RECOVERY WITH COOLDOWN & POST-BOOKING SUPPRESSION
# ---------------------------------------------------------------------------

async def detect_incomplete_booking_recovery_async(
    session: Optional[AsyncSession] = None,
    now_utc: Optional[datetime] = None,
    min_age_minutes: int = 30,
    max_age_hours: int = 72,
    cooldown_hours: int = 24,
) -> Dict[str, Any]:
    """
    Recover abandoned draft/pending bookings within [min_age_minutes, max_age_hours].
    Suppresses when:
      - User opted out of booking/marketing notifications or disabled active channels
      - User confirmed/completed a booking for the same destination after creating the draft
      - Recovery notice was already staged for this booking or user within `cooldown_hours`
    """
    current_utc = _ensure_utc(now_utc) or datetime.now(timezone.utc)
    oldest_cutoff = current_utc - timedelta(hours=max_age_hours)
    newest_cutoff = current_utc - timedelta(minutes=min_age_minutes)
    cooldown_cutoff = current_utc - timedelta(hours=cooldown_hours)
    cooldown_bucket = int(current_utc.timestamp() // (max(1, cooldown_hours) * 3600))

    async def _execute(db: AsyncSession) -> Dict[str, Any]:
        stmt = (
            select(Booking)
            .where(
                Booking.status.in_(["draft", "details_pending", "pending", "pending_payment", "payment_pending"]),
                Booking.created_at >= oldest_cutoff,
                Booking.created_at <= newest_cutoff,
            )
            .order_by(Booking.created_at.desc())
        )
        candidates = list((await db.execute(stmt)).scalars().all())
        if not candidates:
            return {
                "status": "success",
                "scanned": 0,
                "staged": 0,
                "deduplicated": 0,
                "suppressed_converted": 0,
                "suppressed_cooldown": 0,
                "suppressed_opt_out": 0,
            }

        user_ids = {b.user_id for b in candidates}
        prefs = await _load_user_preferences(db, user_ids)

        confirmed_rows = list(
            (
                await db.execute(
                    select(Booking).where(
                        Booking.user_id.in_(list(user_ids)),
                        Booking.status.in_(["confirmed", "paid", "checked_in", "completed"]),
                        Booking.created_at >= oldest_cutoff,
                    )
                )
            )
            .scalars()
            .all()
        )
        confirmed_by_user: Dict[uuid.UUID, List[Booking]] = {}
        for cb in confirmed_rows:
            confirmed_by_user.setdefault(cb.user_id, []).append(cb)

        prior_outbox_rows = list(
            (
                await db.execute(
                    select(NotificationOutbox).where(
                        NotificationOutbox.event_type == "automation.incomplete_booking_recovery",
                    )
                )
            )
            .scalars()
            .all()
        )
        recent_booking_ids: Set[str] = set()
        recent_user_ids: Set[uuid.UUID] = set()
        for row in prior_outbox_rows:
            reference_time = _ensure_utc(row.scheduled_at) or _ensure_utc(row.created_at)
            if reference_time is not None and reference_time < cooldown_cutoff:
                continue
            recent_booking_ids.add(str(row.aggregate_id))
            if row.actor_id:
                recent_user_ids.add(row.actor_id)
            if isinstance(row.payload, dict) and row.payload.get("user_id"):
                try:
                    recent_user_ids.add(uuid.UUID(str(row.payload["user_id"])))
                except (ValueError, TypeError):
                    pass

        staged = 0
        deduplicated = 0
        suppressed_converted = 0
        suppressed_cooldown = 0
        suppressed_opt_out = 0

        for booking in candidates:
            memory_cooldown = _INCOMPLETE_BOOKING_RECOVERY_COOLDOWN.get(str(booking.id))
            if memory_cooldown is not None:
                if _ensure_utc(memory_cooldown) and _ensure_utc(memory_cooldown) >= cooldown_cutoff:
                    suppressed_cooldown += 1
                    continue
                _INCOMPLETE_BOOKING_RECOVERY_COOLDOWN.pop(str(booking.id), None)

            pref = prefs.get(booking.user_id)
            if pref is not None and (
                not pref.category_booking
                or not pref.category_marketing
                or (not pref.push_enabled and not pref.email_enabled and not pref.in_app_enabled)
            ):
                suppressed_opt_out += 1
                continue

            draft_created_at = _ensure_utc(booking.created_at) or oldest_cutoff
            draft_dest = (booking.destination_city or "").strip().lower()
            user_confirmed_list = confirmed_by_user.get(booking.user_id, [])
            already_converted = any(
                (_ensure_utc(cb.created_at) or oldest_cutoff) >= draft_created_at
                and (cb.destination_city or "").strip().lower() == draft_dest
                for cb in user_confirmed_list
            )
            if already_converted:
                suppressed_converted += 1
                continue

            if str(booking.id) in recent_booking_ids or booking.user_id in recent_user_ids:
                suppressed_cooldown += 1
                continue

            existing_cooldown_event_id = OutboxPublisher.deterministic_event_id(
                f"incomplete_booking:{booking.id}:bucket:{cooldown_bucket}"
            )
            existing_cooldown_row = await OutboxPublisher._find_existing_entry(
                db,
                existing_cooldown_event_id,
            )
            if existing_cooldown_row is not None:
                recent_booking_ids.add(str(booking.id))
                recent_user_ids.add(booking.user_id)
                suppressed_cooldown += 1
                continue

            recovery_event = DomainEvent(
                event_type="automation.incomplete_booking_recovery",
                aggregate_type="booking",
                aggregate_id=str(booking.id),
                actor_id=booking.user_id,
                priority=5,
                booking_id=booking.id,
                booking_reference=booking.booking_reference,
                user_id=booking.user_id,
                destination=booking.destination_city,
                product_type=booking.product_type,
                flow_step=booking.flow_step,
                estimated_price=float(booking.final_price),
                currency=booking.currency,
                lock_screen_safe=True,
                summary=(
                    f"Resume your saved {booking.product_type} booking for {booking.destination_city}"
                ),
                category="booking",
                deep_link="/(tabs)/bookings",
                headers={
                    "source_service": "travel_automation_tasks",
                    "causation_id": str(booking.id),
                },
            )
            _, created = await OutboxPublisher.publish_idempotent(
                db,
                recovery_event,
                idempotency_key=f"incomplete_booking:{booking.id}:bucket:{cooldown_bucket}",
                scheduled_at=current_utc,
            )
            if created:
                staged += 1
                recent_booking_ids.add(str(booking.id))
                recent_user_ids.add(booking.user_id)
                _INCOMPLETE_BOOKING_RECOVERY_COOLDOWN[str(booking.id)] = current_utc
            else:
                deduplicated += 1

        if staged > 0:
            await db.commit()

        return {
            "status": "success",
            "scanned": len(candidates),
            "staged": staged,
            "deduplicated": deduplicated,
            "suppressed_converted": suppressed_converted,
            "suppressed_cooldown": suppressed_cooldown,
            "suppressed_opt_out": suppressed_opt_out,
        }

    if session is not None:
        return await _execute(session)
    async with AsyncSessionLocal() as db:
        return await _execute(db)


# ---------------------------------------------------------------------------
# 4. DISRUPTION & REFUND STATE-CHANGE ALERTS (IDEMPOTENT ACROSS RESTARTS)
# ---------------------------------------------------------------------------

async def detect_disruption_and_refund_alerts_async(
    session: Optional[AsyncSession] = None,
    now_utc: Optional[datetime] = None,
    evaluate_monitors: bool = True,
) -> Dict[str, Any]:
    """
    Evaluate active journey monitors for disruptions and reconcile recent verified
    `DisruptionEvent` & `refunded` Booking/BookingPayment states into the outbox
    using deterministic idempotency keys shared with live services.
    """
    current_utc = _ensure_utc(now_utc) or datetime.now(timezone.utc)
    monitor_window_start = current_utc - timedelta(hours=12)
    monitor_window_end = current_utc + timedelta(hours=72)
    disruption_cutoff = current_utc - timedelta(days=3)

    async def _execute(db: AsyncSession) -> Dict[str, Any]:
        from app.services.travel_intelligence.disruption_engine import DisruptionEngineService

        monitors_checked = 0
        if evaluate_monitors:
            monitor_rows = list(
                (
                    await db.execute(
                        select(JourneyMonitor).where(
                            JourneyMonitor.is_active.is_(True),
                            JourneyMonitor.notification_enabled.is_(True),
                        )
                    )
                )
                .scalars()
                .all()
            )
            active_monitors = [
                m
                for m in monitor_rows
                if monitor_window_start
                <= (_ensure_utc(m.scheduled_departure) or current_utc)
                <= monitor_window_end
            ]
            for monitor in active_monitors:
                try:
                    await DisruptionEngineService.verify_journey_status(db, monitor)
                    monitors_checked += 1
                except Exception as mon_err:
                    logger.warning(
                        f"Disruption check skipped for monitor {monitor.id}: {mon_err}"
                    )

        disruption_staged = 0
        disruption_deduplicated = 0

        disruption_rows = (
            await db.execute(
                select(DisruptionEvent, JourneyMonitor)
                .join(JourneyMonitor, DisruptionEvent.monitor_id == JourneyMonitor.id)
                .where(
                    JourneyMonitor.notification_enabled.is_(True),
                    DisruptionEvent.event_timestamp >= disruption_cutoff,
                )
            )
        ).all()

        for d_event, monitor in disruption_rows:
            svc_type = (monitor.service_type or "").lower()
            event_kwargs = dict(
                disruption_id=d_event.id,
                monitor_id=monitor.id,
                booking_id=monitor.booking_id,
                user_id=monitor.user_id,
                actor_id=monitor.user_id,
                service_type=svc_type,
                service_number=monitor.service_number,
                origin=monitor.origin,
                destination=monitor.destination,
                delay_minutes=d_event.delay_minutes,
                severity=d_event.severity,
                status=(d_event.new_state or {}).get("status", monitor.current_status),
                dedup_hash=d_event.dedup_hash,
                deep_link="/(tabs)/trips",
                headers={
                    "source_service": "travel_automation_tasks",
                    "causation_id": d_event.dedup_hash,
                },
            )
            if svc_type == "flight":
                outbox_event: DomainEvent = FlightScheduleChangedEvent(
                    flight_id=monitor.service_number,
                    **event_kwargs,
                )
            else:
                outbox_event = TravelDisruptionDetectedEvent(**event_kwargs)

            _, created = await OutboxPublisher.publish_idempotent(
                db,
                outbox_event,
                idempotency_key=f"disruption:{d_event.dedup_hash}",
                scheduled_at=current_utc,
            )
            if created:
                disruption_staged += 1
            else:
                disruption_deduplicated += 1

        # Reconcile refunded bookings & refunded BookingPayment records
        refund_candidates: Dict[uuid.UUID, Tuple[Booking, float, str, Optional[uuid.UUID]]] = {}

        refunded_bookings = list(
            (
                await db.execute(
                    select(Booking).where(Booking.status == "refunded")
                )
            )
            .scalars()
            .all()
        )
        for rb in refunded_bookings:
            refund_candidates[rb.id] = (rb, float(rb.final_price), rb.currency, None)

        refunded_payments = (
            await db.execute(
                select(BookingPayment, Booking)
                .join(Booking, BookingPayment.booking_id == Booking.id)
                .where(BookingPayment.payment_status == "refunded")
            )
        ).all()
        for bp, rb in refunded_payments:
            refund_candidates[rb.id] = (
                rb,
                float(bp.amount if bp.amount is not None else rb.final_price),
                bp.currency or rb.currency,
                bp.id,
            )

        refund_staged = 0
        refund_deduplicated = 0
        for b_id, (booking, refund_amount, currency, payment_id) in refund_candidates.items():
            refund_event = DomainEvent(
                event_type="booking.refunded",
                aggregate_type="booking",
                aggregate_id=str(b_id),
                actor_id=booking.user_id,
                priority=9,
                booking_id=b_id,
                booking_reference=booking.booking_reference,
                payment_id=payment_id,
                user_id=booking.user_id,
                refund_amount=refund_amount,
                currency=currency,
                destination=booking.destination_city,
                product_type=booking.product_type,
                category="booking",
                deep_link="/(tabs)/trips",
                headers={
                    "source_service": "travel_automation_tasks",
                    "causation_id": str(b_id),
                },
            )
            _, created = await OutboxPublisher.publish_idempotent(
                db,
                refund_event,
                idempotency_key=f"refund:{b_id}",
                scheduled_at=current_utc,
            )
            if created:
                refund_staged += 1
            else:
                refund_deduplicated += 1

        total_staged = disruption_staged + refund_staged
        if total_staged > 0:
            await db.commit()

        return {
            "status": "success",
            "monitors_checked": monitors_checked,
            "disruption_staged": disruption_staged,
            "disruption_deduplicated": disruption_deduplicated,
            "refund_staged": refund_staged,
            "refund_deduplicated": refund_deduplicated,
            "staged": total_staged,
        }

    if session is not None:
        return await _execute(session)
    async with AsyncSessionLocal() as db:
        return await _execute(db)


# ---------------------------------------------------------------------------
# CELERY TASK WRAPPERS
# ---------------------------------------------------------------------------

@celery_app.task(name="detect_trip_preparation_reminders_task")
def detect_trip_preparation_reminders_task() -> Dict[str, Any]:
    """Daily scheduled task for 7d/3d/1d trip preparation reminders."""
    return _run_async(detect_trip_preparation_reminders_async)


@celery_app.task(name="detect_hotel_checkin_checkout_reminders_task")
def detect_hotel_checkin_checkout_reminders_task() -> Dict[str, Any]:
    """Daily scheduled task for hotel check-in and check-out reminders."""
    return _run_async(detect_hotel_checkin_checkout_reminders_async)


@celery_app.task(name="detect_incomplete_booking_recovery_task")
def detect_incomplete_booking_recovery_task() -> Dict[str, Any]:
    """Periodic task for incomplete booking recovery with cooldown & suppression."""
    return _run_async(detect_incomplete_booking_recovery_async)


@celery_app.task(name="detect_disruption_and_refund_alerts_task")
def detect_disruption_and_refund_alerts_task() -> Dict[str, Any]:
    """Periodic task for disruption monitoring and refund state-change outbox alerts."""
    return _run_async(detect_disruption_and_refund_alerts_async)
