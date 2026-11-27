"""
Comprehensive unit & service integration tests for:
  1. Idempotent OutboxPublisher deduplication (`publish_idempotent`, in-session & post-commit)
  2. Genuine state-transition outbox hooks across domain services & background tasks:
     - TicketService (`booking.ticket_issued`)
     - BookingService (`booking.confirmed`, `booking.refunded`, quiet `completed`)
     - PaymentService (`booking.payment_succeeded`, `booking.confirmed`, replay idempotency)
     - BookingSagaOrchestrator (confirmed & partial-failure compensation rollback)
     - MarketplaceService (`marketplace.guide.booked`, `marketplace.trip.sos_triggered`, approve/reject)
     - DisruptionEngineService (`flight.schedule_changed`, `travel.disruption.detected`, dedup_hash)
     - HotelPMSService (`hotel.guest.checked_in`, `hotel.guest.checked_out`, secret scrubbing)
     - KYCService (`agency.kyc.rejected`, `agency.kyc.changes_requested`) & `kyc_tasks` expiring warnings
     - LedgerService (`booking.refunded` unified dedup, `agency.payout.batch_processed`)
     - RideService (`marketplace.trip.sos_triggered`) & LocalCommerceService (`marketplace.order.placed`, fulfillment)
  3. Scheduled Travel Ecosystem Automations (`backend/app/tasks/travel_automation_tasks.py`):
     - Trip preparation reminders (7d / 3d / 1d before departure) + opt-out suppression + restart idempotency
     - Hotel check-in & check-out reminders + skip already checked-in/checked-out + restart idempotency
     - Incomplete booking recovery + post-booking suppression + cooldown + opt-out + lock-screen safety
     - Disruption & refund state-change reconciliation + restart idempotency (zero duplicate dispatches)
"""

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
import json
from types import SimpleNamespace
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking, BookingItem, BookingPassenger, BookingPayment
from app.models.hotel import Hotel, HotelRoom
from app.models.hotel_pms import HotelFolio, HotelRoomUnit
from app.models.kyc import KYCDocument, KYCSubmission
from app.models.ledger import LedgerAccount, LedgerEntry
from app.models.local_commerce import MarketplaceProduct, MarketplaceSeller
from app.models.marketplace import ProviderProfileModel, ProviderServiceModel
from app.models.notification import NotificationOutbox, NotificationUserPreference
from app.models.ride import RideRequest, RideTrip, RiderProfile
from app.models.ticket import Ticket
from app.models.travel_intelligence import DisruptionEvent, JourneyMonitor
from app.models.user import Agency
from app.notifications.events.booking import BookingCreatedEvent
from app.notifications.outbox.publisher import OutboxPublisher
from app.schemas.booking import (
    BookingCreateRequest,
    BookingItemCreate,
    BookingPassengerCreate,
    BookingStatus,
    BookingStatusUpdateRequest,
    ProductType,
)
from app.schemas.hotel_pms import (
    ExpressCheckinRequest,
    FolioChargeItemInput,
    FolioItemType,
    PostFolioChargesRequest,
)
from app.schemas.kyc import (
    KYCDocType,
    KYCAdminRejectRequest,
    KYCAdminRequestChangesRequest,
    KYCStatus,
)
from app.schemas.local_commerce import (
    CartCheckoutItemInput,
    CartCheckoutRequest,
    DeliveryTier,
    FulfillmentStatus,
    MarketplacePaymentMethod,
    OrderFulfillmentUpdateRequest,
)
from app.schemas.marketplace import (
    AdminProviderApproveRequest,
    AdminProviderRejectRequest,
    BookingCreateRequest as MarketplaceBookingCreateRequest,
    TripSOSRequest,
)
from app.schemas.ride import RideSosRequest
from app.services.booking_saga import BookingSagaOrchestrator
from app.services.booking_service import BookingService
from app.services.hotel_pms_service import HotelPMSService
from app.services.kyc_service import KYCService
from app.services.ledger_service import LedgerService
from app.services.local_commerce_service import LocalCommerceService
from app.services.marketplace_service import MarketplaceService
from app.services.payment_service import PaymentService
from app.services.ride_service import RideService
from app.services.ticket_service import TicketService
from app.services.travel_intelligence.disruption_engine import DisruptionEngineService
from app.tasks.kyc_tasks import _run_expiring_documents_check
from app.tasks.travel_automation_tasks import (
    detect_disruption_and_refund_alerts_async,
    detect_hotel_checkin_checkout_reminders_async,
    detect_incomplete_booking_recovery_async,
    detect_trip_preparation_reminders_async,
)


FORBIDDEN_SECRET_KEYS = {
    "password",
    "password_hash",
    "otp_code",
    "otp_code_entered",
    "pickup_otp",
    "dropoff_otp",
    "delivery_otp",
    "access_token",
    "refresh_token",
    "key_token_hash",
    "qr_pass_code",
    "pin_code_last4",
    "wifi_password",
    "signature",
    "passport_number",
    "nid_number",
    "card_number",
    "cvv",
}


def _assert_no_secrets_in_outbox(entry: NotificationOutbox, forbidden_values: tuple[str, ...] = ()) -> None:
    """Verify neither payload/headers contain sensitive keys or literal secrets."""
    serialized = json.dumps({"payload": entry.payload, "headers": entry.headers}).lower()
    for bad_key in FORBIDDEN_SECRET_KEYS:
        assert f'"{bad_key}"' not in serialized, f"Sensitive key '{bad_key}' leaked into outbox {entry.event_type}"
    for val in forbidden_values:
        if val:
            assert val.lower() not in serialized, f"Sensitive literal leaked into outbox {entry.event_type}"


# ---------------------------------------------------------------------------
# 1. OUTBOX IDEMPOTENCY DEDUPLICATION
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_outbox_publish_idempotent_in_session_and_post_commit(db_session: AsyncSession):
    """Same idempotency_key deduplicates both before flush/commit and across commits."""
    booking_id = uuid.uuid4()
    user_id = uuid.uuid4()

    ev1 = BookingCreatedEvent(
        booking_id=booking_id,
        booking_reference="SJ-IDEM-1",
        user_id=user_id,
        product_type="flight",
        total_price=5000.0,
    )
    ev2 = BookingCreatedEvent(
        booking_id=booking_id,
        booking_reference="SJ-IDEM-1",
        user_id=user_id,
        product_type="flight",
        total_price=5000.0,
    )

    row1, created1 = await OutboxPublisher.publish_idempotent(
        db_session, ev1, idempotency_key=f"test_key:{booking_id}"
    )
    row2, created2 = await OutboxPublisher.publish_idempotent(
        db_session, ev2, idempotency_key=f"test_key:{booking_id}"
    )
    assert created1 is True
    assert created2 is False
    assert row1 is row2

    await db_session.commit()

    ev3 = BookingCreatedEvent(
        booking_id=booking_id,
        booking_reference="SJ-IDEM-1",
        user_id=user_id,
        product_type="flight",
        total_price=5000.0,
    )
    row3, created3 = await OutboxPublisher.publish_idempotent(
        db_session, ev3, idempotency_key=f"test_key:{booking_id}"
    )
    assert created3 is False
    assert row3.event_id == row1.event_id

    all_rows = (
        await db_session.execute(
            select(NotificationOutbox).where(NotificationOutbox.aggregate_id == str(booking_id))
        )
    ).scalars().all()
    assert len(all_rows) == 1
    assert all_rows[0].headers.get("idempotency_key") == f"test_key:{booking_id}"


# ---------------------------------------------------------------------------
# 2. SERVICE HOOKS (GENUINE TRANSITIONS + NO SENSITIVE DATA LEAKS)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ticket_and_booking_refund_and_payment_replay_hooks(db_session: AsyncSession):
    """
    Verify TicketIssuedEvent, BookingConfirmedEvent, PaymentSucceededEvent replay
    idempotency, BookingStatus.REFUNDED alert, and no spurious event on COMPLETED.
    """
    user_id = uuid.uuid4()
    req = BookingCreateRequest(
        product_type=ProductType.TOUR,
        origin_city="Dhaka",
        destination_city="Cox's Bazar",
        start_date=date(2026, 7, 15),
        end_date=date(2026, 7, 18),
        number_of_guests=1,
        items=[
            BookingItemCreate(
                product_type=ProductType.TOUR,
                product_id=uuid.uuid4(),
                product_name="Sundarbans & Cox Heritage Tour",
                quantity=1,
                unit_price=8000.0,
            )
        ],
        passengers=[
            BookingPassengerCreate(
                first_name="Amina",
                last_name="Rahman",
                email="amina@example.com",
                phone="+8801712345678",
                passport_number="BN99887766",
            )
        ],
    )
    created = await BookingService.create_booking(db_session, user_id, req)

    # Confirm via PaymentService (also generates tickets & booking.confirmed idempotently)
    confirmed_booking, _, _ = await PaymentService.process_payment_confirmation(
        db=db_session,
        provider="bkash",
        transaction_id="TX-REPLAY-1",
        booking_reference=created.booking_reference,
        amount_paid=float(created.final_price),
        is_success=True,
    )
    assert confirmed_booking is not None

    # Replay same payment webhook twice -> zero duplicates!
    await PaymentService.process_payment_confirmation(
        db=db_session,
        provider="bkash",
        transaction_id="TX-REPLAY-1",
        booking_reference=created.booking_reference,
        amount_paid=float(created.final_price),
        is_success=True,
    )

    outbox_rows = (
        await db_session.execute(
            select(NotificationOutbox).order_by(NotificationOutbox.created_at.asc())
        )
    ).scalars().all()

    event_types = [r.event_type for r in outbox_rows]
    assert event_types.count("booking.created") == 1
    assert event_types.count("booking.confirmed") == 1
    assert event_types.count("booking.ticket_issued") == 1
    assert event_types.count("booking.payment_succeeded") == 1

    ticket_row = next(r for r in outbox_rows if r.event_type == "booking.ticket_issued")
    _assert_no_secrets_in_outbox(ticket_row, forbidden_values=("BN99887766",))
    assert ticket_row.payload["ticket_count"] == 1

    # Re-calling TicketService idempotently emits nothing new
    booking_model = await db_session.get(Booking, created.id)
    existing_tickets = await TicketService.create_tickets_for_booking(db_session, booking_model)
    assert len(existing_tickets) == 1
    await db_session.commit()

    # Transition confirmed -> completed should not emit spam, then -> refunded emits booking.refunded
    await BookingService.transition_status(
        db_session,
        created.id,
        BookingStatusUpdateRequest(target_status=BookingStatus.COMPLETED),
    )
    after_completed_types = [
        r.event_type
        for r in (await db_session.execute(select(NotificationOutbox))).scalars().all()
    ]
    assert "booking.completed" not in after_completed_types

    # Transition confirmed-equivalent? Wait: COMPLETED -> REFUNDED check VALID_TRANSITIONS or cancel/refund path:
    # Let's create a second confirmed booking and transition directly to REFUNDED.
    b2 = await BookingService.create_booking(db_session, user_id, req)
    await BookingService.transition_status(
        db_session,
        b2.id,
        BookingStatusUpdateRequest(target_status=BookingStatus.CONFIRMED, payment_transaction_id="TX-REFUND-2"),
    )
    await BookingService.transition_status(
        db_session,
        b2.id,
        BookingStatusUpdateRequest(target_status=BookingStatus.REFUNDED),
    )

    refund_rows = (
        await db_session.execute(
            select(NotificationOutbox).where(
                NotificationOutbox.event_type == "booking.refunded",
                NotificationOutbox.aggregate_id == str(b2.id),
            )
        )
    ).scalars().all()
    assert len(refund_rows) == 1
    assert refund_rows[0].priority == 9
    _assert_no_secrets_in_outbox(refund_rows[0], forbidden_values=("BN99887766",))


@pytest.mark.asyncio
async def test_booking_saga_confirmed_and_partial_failure_hooks(db_session: AsyncSession):
    """Saga emits BookingConfirmedEvent on success and BookingCancelledEvent on rollback."""
    user_id = uuid.uuid4()

    ok_res = await BookingSagaOrchestrator.execute_trip_booking_saga(
        session=db_session,
        user_id=user_id,
        idempotency_key="saga-ok-1",
        clone_id=None,
        services_to_book=[
            {"type": "flight", "title": "DAC-CXB Flight", "price": 5500, "provider": "BG"},
            {"type": "hotel", "title": "Ocean View", "price": 4500, "provider": "HTL"},
        ],
        total_amount=10000.0,
    )
    assert ok_res["status"] == "CONFIRMED"

    fail_res = await BookingSagaOrchestrator.execute_trip_booking_saga(
        session=db_session,
        user_id=user_id,
        idempotency_key="saga-fail-1",
        clone_id=None,
        services_to_book=[
            {"type": "flight", "title": "DAC-CXB Flight", "price": 5500, "provider": "BG"},
            {
                "type": "train",
                "title": "Subarna Express",
                "price": 1200,
                "provider": "BR",
                "simulate_failure": True,
            },
        ],
        total_amount=6700.0,
    )
    assert fail_res["status"] == "PARTIALLY_CONFIRMED"

    rows = (await db_session.execute(select(NotificationOutbox))).scalars().all()
    confirmed = [r for r in rows if r.event_type == "booking.confirmed"]
    cancelled = [r for r in rows if r.event_type == "booking.cancelled"]
    assert len(confirmed) == 1
    assert confirmed[0].payload["booking_reference"] == ok_res["booking_reference"]
    assert len(cancelled) == 1
    assert cancelled[0].payload["booking_reference"] == fail_res["booking_reference"]


@pytest.mark.asyncio
async def test_marketplace_hooks_book_sos_and_verification_no_otp(db_session: AsyncSession):
    """Marketplace hooks emit guide booked (NO OTP), priority-10 SOS, and approve/reject."""
    guide_user_id = uuid.uuid4()
    guide2_user_id = uuid.uuid4()
    traveler_id = uuid.uuid4()
    admin_id = uuid.uuid4()

    provider = ProviderProfileModel(
        id=uuid.uuid4(),
        user_id=guide_user_id,
        provider_category="local_guide",
        business_name="Sundarbans Eco Guides",
        full_name="Karim Mia",
        phone="+8801711000001",
        primary_destination="Sundarbans",
        verification_status="pending",
    )
    provider2 = ProviderProfileModel(
        id=uuid.uuid4(),
        user_id=guide2_user_id,
        provider_category="boatman",
        business_name=None,
        full_name="Rahim Boatman",
        phone="+8801711000002",
        primary_destination="Sylhet",
        verification_status="pending",
    )
    db_session.add_all([provider, provider2])
    await db_session.flush()

    svc = ProviderServiceModel(
        id=uuid.uuid4(),
        provider_id=provider.id,
        title="Full Day Mangrove Boat Safari",
        description="Guided mangrove canal excursion with eco boat.",
        category="day_tour",
        destination="Sundarbans",
        price_model="daily",
        price=Decimal("3000.00"),
        meeting_point="Khulna Jetty",
    )
    db_session.add(svc)
    await db_session.commit()

    mkt = MarketplaceService(db_session)
    await mkt.admin_approve_provider(
        admin_id, provider.id, AdminProviderApproveRequest(badge="Top Eco Guide")
    )
    await mkt.admin_reject_provider(
        admin_id, provider2.id, AdminProviderRejectRequest(rejection_reason="Missing boat permit scan")
    )

    booking_dict = await mkt.create_booking(
        traveler_id,
        MarketplaceBookingCreateRequest(
            provider_id=provider.id,
            service_id=svc.id,
            tour_date=date(2026, 8, 10),
            duration_days=1,
            number_of_guests=2,
            meeting_point="Khulna Jetty",
        ),
    )

    from app.models.marketplace import TripSessionModel

    trip_sess = (
        await db_session.execute(
            select(TripSessionModel).where(TripSessionModel.booking_id == booking_dict["id"])
        )
    ).scalar_one()

    await mkt.trigger_trip_sos(
        trip_sess.id,
        traveler_id,
        TripSOSRequest(
            session_id=trip_sess.id,
            latitude=22.49,
            longitude=89.56,
            address_context="Near Karamjal Watchtower",
            notes="Boat engine stall",
        ),
    )

    outbox_rows = (await db_session.execute(select(NotificationOutbox))).scalars().all()
    by_type = {r.event_type: r for r in outbox_rows}

    assert "marketplace.provider.approved" in by_type
    assert by_type["marketplace.provider.approved"].payload["display_name"] == "Sundarbans Eco Guides"
    assert "marketplace.provider.rejected" in by_type
    assert by_type["marketplace.provider.rejected"].payload["display_name"] == "Rahim Boatman"

    assert "marketplace.guide.booked" in by_type
    booked_row = by_type["marketplace.guide.booked"]
    _assert_no_secrets_in_outbox(booked_row, forbidden_values=(booking_dict["otp_code"],))

    assert "marketplace.trip.sos_triggered" in by_type
    sos_row = by_type["marketplace.trip.sos_triggered"]
    assert sos_row.priority == 10


@pytest.mark.asyncio
async def test_disruption_engine_hooks_and_dedup(db_session: AsyncSession):
    """DisruptionEngine emits flight.schedule_changed / travel.disruption.detected idempotently."""
    user_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    flight_monitor = JourneyMonitor(
        id=uuid.uuid4(),
        user_id=user_id,
        booking_id=uuid.uuid4(),
        service_type="flight",
        provider_code="BG",
        service_number="BG-433",
        origin="DAC",
        destination="CXB",
        scheduled_departure=now + timedelta(hours=3),
        scheduled_arrival=now + timedelta(hours=4),
        is_active=True,
        notification_enabled=True,
    )
    train_monitor = JourneyMonitor(
        id=uuid.uuid4(),
        user_id=user_id,
        booking_id=uuid.uuid4(),
        service_type="train",
        provider_code="BR",
        service_number="701 Subarna",
        origin="Dhaka",
        destination="Chattogram",
        scheduled_departure=now + timedelta(hours=4),
        scheduled_arrival=now + timedelta(hours=9),
        is_active=True,
        notification_enabled=True,
    )
    db_session.add_all([flight_monitor, train_monitor])
    await db_session.commit()

    ev1 = await DisruptionEngineService.verify_journey_status(db_session, flight_monitor, force_delay_test=75)
    ev1_dup = await DisruptionEngineService.verify_journey_status(db_session, flight_monitor, force_delay_test=75)
    ev2 = await DisruptionEngineService.verify_journey_status(db_session, train_monitor, force_delay_test=45)

    assert ev1 is not None and ev1_dup.id == ev1.id
    assert ev2 is not None

    rows = (await db_session.execute(select(NotificationOutbox))).scalars().all()
    flight_rows = [r for r in rows if r.event_type == "flight.schedule_changed"]
    disrupt_rows = [r for r in rows if r.event_type == "travel.disruption.detected"]
    assert len(flight_rows) == 1
    assert flight_rows[0].priority == 9
    assert len(disrupt_rows) == 1
    assert disrupt_rows[0].priority == 9


@pytest.mark.asyncio
async def test_hotel_pms_checkin_checkout_hooks_no_keys_leaked(db_session: AsyncSession):
    """HotelPMSService express_checkin & settled checkout emit events without digital keys/WiFi."""
    hotel_id = uuid.uuid4()
    room_id = uuid.uuid4()
    unit_id = uuid.uuid4()
    guest_id = uuid.uuid4()
    staff_id = uuid.uuid4()

    hotel = Hotel(
        id=hotel_id,
        name="Sea Crown Resort",
        city="Cox's Bazar",
        check_in_time="14:00",
        check_out_time="12:00",
    )
    room = HotelRoom(
        id=room_id,
        hotel_id=hotel_id,
        name="Ocean Deluxe",
        base_price_per_night=5000.0,
    )
    unit = HotelRoomUnit(
        id=unit_id,
        hotel_id=hotel_id,
        room_type_id=room_id,
        room_number="502",
        floor_number=5,
        occupancy_status="vacant",
        housekeeping_status="clean",
        base_nightly_rate_bdt=Decimal("5000.00"),
    )
    booking = Booking(
        id=uuid.uuid4(),
        user_id=guest_id,
        booking_reference="SJ-HTL-PMS-1",
        product_type="hotel",
        status="confirmed",
        flow_step="voucher_issued",
        destination_city="Cox's Bazar",
        start_date=date(2026, 7, 10),
        end_date=date(2026, 7, 12),
        total_price=10000.0,
        final_price=10000.0,
        currency="BDT",
    )
    db_session.add_all([hotel, room, unit, booking])
    await db_session.flush()
    db_session.add(
        BookingItem(
            id=uuid.uuid4(),
            booking_id=booking.id,
            product_id=room_id,
            product_type="hotel",
            product_name="Sea Crown Resort - Ocean Deluxe",
            quantity=2,
            unit_price=5000.0,
            line_total=10000.0,
        )
    )
    await db_session.commit()

    pms = HotelPMSService(db_session)
    admin_actor = SimpleNamespace(id=staff_id, is_active_admin=True, hotel_id=hotel_id)

    checkin_res = await pms.express_checkin(
        ExpressCheckinRequest(
            hotel_id=hotel_id,
            booking_ref=booking.booking_reference,
            room_unit_id=unit_id,
            wifi_password="SuperSecretWifiPassword99",
        ),
        admin_actor,
    )

    # Settle balance and check out
    folio = await db_session.get(HotelFolio, checkin_res.folio_id)
    await pms.post_folio_charges_and_checkout(
        folio.id,
        PostFolioChargesRequest(
            charges=[],
            payment_amount_paisa=folio.balance_due_paisa,
            payment_method="card",
            checkout=True,
            idempotency_key="pms-checkout-1",
        ),
        admin_actor,
    )

    outbox_rows = (await db_session.execute(select(NotificationOutbox))).scalars().all()
    in_rows = [r for r in outbox_rows if r.event_type == "hotel.guest.checked_in"]
    out_rows = [r for r in outbox_rows if r.event_type == "hotel.guest.checked_out"]
    assert len(in_rows) == 1
    assert len(out_rows) == 1

    secret_values = (
        checkin_res.guest_key.qr_pass_code,
        checkin_res.guest_key.wifi_password or "",
        "SuperSecretWifiPassword99",
    )
    _assert_no_secrets_in_outbox(in_rows[0], forbidden_values=secret_values)
    _assert_no_secrets_in_outbox(out_rows[0], forbidden_values=secret_values)


@pytest.mark.asyncio
async def test_kyc_reject_changes_and_expiring_warning_hooks(db_session: AsyncSession):
    """KYC reject/request_changes & expiring documents task emit idempotent outbox events."""
    owner_id = uuid.uuid4()
    admin_id = uuid.uuid4()

    agency = Agency(
        id=uuid.uuid4(),
        owner_user_id=owner_id,
        name="Sylhet Heritage Travels",
        email="ops@sylhetheritage.com",
        verification_status="pending",
    )
    db_session.add(agency)
    await db_session.flush()

    sub1 = KYCSubmission(
        id=uuid.uuid4(),
        agency_id=agency.id,
        status=KYCStatus.IN_REVIEW.value,
    )
    sub2 = KYCSubmission(
        id=uuid.uuid4(),
        agency_id=agency.id,
        status=KYCStatus.IN_REVIEW.value,
    )
    verified_sub = KYCSubmission(
        id=uuid.uuid4(),
        agency_id=agency.id,
        status=KYCStatus.VERIFIED.value,
    )
    db_session.add_all([sub1, sub2, verified_sub])
    await db_session.flush()

    expiring_doc = KYCDocument(
        id=uuid.uuid4(),
        submission_id=verified_sub.id,
        doc_type=KYCDocType.TRADE_LICENCE.value,
        r2_key="kyc/mock/tl.pdf",
        mime="application/pdf",
        size_bytes=12345,
        sha256="a" * 64,
        expires_on=date.today() + timedelta(days=5),
    )
    db_session.add(expiring_doc)
    await db_session.commit()

    admin_user = SimpleNamespace(id=admin_id, email="admin@shopnojatra.com", role="admin")
    await KYCService.admin_request_changes(
        db_session,
        sub1.id,
        admin_user,
        KYCAdminRequestChangesRequest(reason="Please upload clearer Trade License page 2"),
    )
    await KYCService.admin_reject(
        db_session,
        sub2.id,
        admin_user,
        KYCAdminRejectRequest(reason="Expired TIN certificate provided"),
    )

    first_count = await _run_expiring_documents_check(session=db_session)
    second_count = await _run_expiring_documents_check(session=db_session)
    assert first_count == 1
    assert second_count == 0  # Idempotent across repeated task runs!

    outbox_rows = (await db_session.execute(select(NotificationOutbox))).scalars().all()
    types = [r.event_type for r in outbox_rows]
    assert types.count("agency.kyc.changes_requested") == 1
    assert types.count("agency.kyc.rejected") == 1
    assert types.count("agency.kyc.expiring_warning") == 1

    warn = next(r for r in outbox_rows if r.event_type == "agency.kyc.expiring_warning")
    assert warn.payload["milestone_days"] == 7
    assert warn.payload["user_id"] == str(owner_id)


@pytest.mark.asyncio
async def test_ledger_refund_dedup_payout_batch_and_ride_local_commerce_hooks(db_session: AsyncSession):
    """
    Verify:
      1. LedgerService.record_refund shares idempotency key with BookingService/scheduled refund sweep.
      2. LedgerService.create_payout_batch stages AgencyPayoutBatchProcessedEvent when payouts > 0.
      3. RideService.trigger_trip_sos & LocalCommerceService checkout/fulfillment emit events without OTPs.
    """
    user_id = uuid.uuid4()
    agency_owner = uuid.uuid4()
    agency = Agency(
        id=uuid.uuid4(),
        owner_user_id=agency_owner,
        name="Dhaka Express Agency",
        verification_status="verified",
        verified_at=datetime.now(timezone.utc),
    )
    booking = Booking(
        id=uuid.uuid4(),
        user_id=user_id,
        agency_id=agency.id,
        booking_reference="SJ-LDG-REF-1",
        product_type="tour",
        status="refunded",
        destination_city="Bandarban",
        total_price=4000.0,
        final_price=4000.0,
        currency="BDT",
    )
    db_session.add_all([agency, booking])
    await db_session.commit()

    # Record payment + refund in ledger -> emits booking.refunded
    await LedgerService.record_payment(
        db=db_session,
        payment={"booking_id": booking.id, "amount": 4000.0, "currency": "BDT", "agency_id": agency.id},
        booking=booking,
    )
    await LedgerService.record_refund(
        db=db_session,
        payment={"id": uuid.uuid4(), "booking_id": booking.id, "currency": "BDT"},
        amount=4000.0,
        booking=booking,
    )
    await db_session.commit()

    # Running scheduled refund reconciliation sweep MUST NOT duplicate booking.refunded!
    sweep_res = await detect_disruption_and_refund_alerts_async(
        session=db_session, evaluate_monitors=False
    )
    assert sweep_res["refund_staged"] == 0
    assert sweep_res["refund_deduplicated"] == 1

    # Credit agency ledger balance >= threshold and create payout batch -> emits payout event
    agency_acct = await LedgerService.get_or_create_account(
        db_session, owner_type="agency", owner_id=agency.id, currency="BDT"
    )
    contra_acct = await LedgerService.get_or_create_account(
        db_session, owner_type="platform", owner_id=None, currency="BDT"
    )
    tx_grp = uuid.uuid4()
    db_session.add_all(
        [
            LedgerEntry(
                transaction_group=tx_grp,
                account_id=contra_acct.id,
                direction="debit",
                amount_paisa=200000,
                memo="Test funding",
            ),
            LedgerEntry(
                transaction_group=tx_grp,
                account_id=agency_acct.id,
                direction="credit",
                amount_paisa=200000,
                memo="Agency commission credit",
            ),
        ]
    )
    await db_session.commit()

    batch = await LedgerService.create_payout_batch(
        db=db_session, created_by=uuid.uuid4(), minimum_threshold_paisa=50000
    )
    await db_session.commit()
    assert len(batch.payouts) == 1

    # Ride SOS hook
    rider_uid = uuid.uuid4()
    rider_profile = RiderProfile(
        id=uuid.uuid4(),
        user_id=rider_uid,
        full_name="Test Rider",
        phone="+8801700000010",
    )
    db_session.add(rider_profile)
    await db_session.flush()

    ride_req = RideRequest(
        id=uuid.uuid4(),
        request_reference="SJ-RIDE-SOS-1",
        passenger_id=user_id,
        claimed_rider_id=rider_profile.id,
        vehicle_mode="cng",
        ride_type="on_demand",
        status="in_progress",
        pickup_address="Gulshan 2",
        pickup_lat=23.79,
        pickup_lng=90.41,
        dropoff_address="Banani",
        dropoff_lat=23.79,
        dropoff_lng=90.40,
        estimated_distance_km=Decimal("2.50"),
        estimated_duration_min=12,
        base_fare_paisa=5000,
        quoted_fare_paisa=12000,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=20),
    )
    ride_trip = RideTrip(
        id=uuid.uuid4(),
        ride_request_id=ride_req.id,
        passenger_id=user_id,
        rider_id=rider_profile.id,
        status="in_progress",
        start_otp_hash="hashed_secret_otp",
    )
    db_session.add_all([ride_req, ride_trip])
    await db_session.commit()

    await RideService(db_session).trigger_trip_sos(
        ride_trip.id, user_id, RideSosRequest(latitude=23.792, longitude=90.412, notes="Urgent help")
    )

    # LocalCommerce checkout & fulfillment (COD skips wallet debit, transitions to packing cleanly)
    seller_user_id = uuid.uuid4()
    seller = MarketplaceSeller(
        id=uuid.uuid4(),
        user_id=seller_user_id,
        business_name="Tangail Taant House",
        slug="tangail-taant-house",
        district="Tangail",
        region="Dhaka",
        pickup_address="Tangail Craft Market",
        pickup_lat=24.25,
        pickup_lng=89.91,
        contact_phone="+8801722222222",
        verification_status="verified",
        is_verified=True,
    )
    db_session.add(seller)
    await db_session.flush()
    product = MarketplaceProduct(
        id=uuid.uuid4(),
        seller_id=seller.id,
        slug="handloom-shari-1",
        name="Tangail Handloom Shari",
        bangla_name="টাঙ্গাইল তাঁত শাড়ি",
        region="Dhaka",
        district="Tangail",
        category="clothing",
        price_bdt=Decimal("2500.00"),
        weight_or_unit="1 piece",
        weight_grams=500,
        stock_quantity=5,
        image_url="https://example.com/shari.jpg",
        description="Authentic heritage handloom weaving from Tangail artisans.",
    )
    db_session.add(product)
    await db_session.commit()

    lc = LocalCommerceService(db_session)
    await lc.admin_verify_seller(seller.id, "suspended")
    await lc.admin_verify_seller(seller.id, "verified")
    checkout_res = await lc.checkout_cart(
        user_id,
        CartCheckoutRequest(
            items=[CartCheckoutItemInput(product_id=product.id, quantity=1)],
            delivery_tier=DeliveryTier.SHOPNO_EXPRESS,
            payment_method=MarketplacePaymentMethod.COD,
            customer_name="Nadia Karim",
            customer_phone="+8801719999999",
            delivery_address="House 10, Banani, Dhaka",
            delivery_district="Dhaka",
        ),
    )
    fulfill_res = await lc.update_seller_fulfillment(
        checkout_res.order.id,
        seller_user_id,
        OrderFulfillmentUpdateRequest(fulfillment_status=FulfillmentStatus.PACKED),
    )

    all_rows = (await db_session.execute(select(NotificationOutbox))).scalars().all()
    types = [r.event_type for r in all_rows]
    assert types.count("booking.refunded") == 1
    assert types.count("agency.payout.batch_processed") == 1
    assert types.count("marketplace.trip.sos_triggered") == 1
    assert types.count("marketplace.seller.verification_updated") == 2
    assert types.count("marketplace.order.placed") == 1
    assert types.count("marketplace.order.fulfillment_updated") == 1

    fulfill_event = next(r for r in all_rows if r.event_type == "marketplace.order.fulfillment_updated")
    _assert_no_secrets_in_outbox(fulfill_event, forbidden_values=(fulfill_res.pickup_otp or "",))


# ---------------------------------------------------------------------------
# 3. SCHEDULED TRAVEL AUTOMATIONS (UNIT + RESTART IDEMPOTENCY)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_automation_trip_preparation_7d_3d_1d_and_idempotency(db_session: AsyncSession):
    """Trip preparation detects 7d/3d/1d bookings, respects opt-outs, and deduplicates restarts."""
    now = datetime(2026, 7, 1, 9, 0, tzinfo=timezone.utc)
    today = now.date()

    u_ok = uuid.uuid4()
    u_opt_out = uuid.uuid4()
    db_session.add(
        NotificationUserPreference(user_id=u_opt_out, category_booking=False)
    )

    b7 = Booking(
        id=uuid.uuid4(),
        user_id=u_ok,
        booking_reference="SJ-PREP-7D",
        product_type="flight",
        status="confirmed",
        origin_city="Dhaka",
        destination_city="Cox's Bazar",
        start_date=today + timedelta(days=7),
        number_of_guests=2,
        total_price=9000.0,
        final_price=9000.0,
    )
    b3 = Booking(
        id=uuid.uuid4(),
        user_id=u_ok,
        booking_reference="SJ-PREP-3D",
        product_type="hotel",
        status="paid",
        destination_city="Sylhet",
        start_date=today + timedelta(days=3),
        number_of_guests=1,
        total_price=4000.0,
        final_price=4000.0,
    )
    b1 = Booking(
        id=uuid.uuid4(),
        user_id=u_ok,
        booking_reference="SJ-PREP-1D",
        product_type="tour",
        status="confirmed",
        destination_city="Bandarban",
        start_date=today + timedelta(days=1),
        number_of_guests=1,
        total_price=6500.0,
        final_price=6500.0,
    )
    b5_skip = Booking(
        id=uuid.uuid4(),
        user_id=u_ok,
        booking_reference="SJ-PREP-5D-SKIP",
        product_type="flight",
        status="confirmed",
        destination_city="Rajshahi",
        start_date=today + timedelta(days=5),
        total_price=3000.0,
        final_price=3000.0,
    )
    b_cancelled_skip = Booking(
        id=uuid.uuid4(),
        user_id=u_ok,
        booking_reference="SJ-PREP-CANC",
        product_type="flight",
        status="cancelled",
        destination_city="Dhaka",
        start_date=today + timedelta(days=3),
        total_price=3000.0,
        final_price=3000.0,
    )
    b_optout_skip = Booking(
        id=uuid.uuid4(),
        user_id=u_opt_out,
        booking_reference="SJ-PREP-OPTOUT",
        product_type="hotel",
        status="confirmed",
        destination_city="Sylhet",
        start_date=today + timedelta(days=7),
        total_price=3000.0,
        final_price=3000.0,
    )
    db_session.add_all([b7, b3, b1, b5_skip, b_cancelled_skip, b_optout_skip])
    await db_session.flush()

    # Attach 1 passenger & 1 active ticket to b7
    db_session.add(
        BookingPassenger(booking_id=b7.id, first_name="Tariq", last_name="Hasan")
    )
    db_session.add(
        Ticket(
            id=uuid.uuid4(),
            booking_id=b7.id,
            passenger_name="Tariq Hasan",
            service_type="flight",
            valid_from=now,
            valid_to=now + timedelta(days=10),
            status="active",
            signature="signed",
        )
    )
    await db_session.commit()

    run1 = await detect_trip_preparation_reminders_async(session=db_session, now_utc=now)
    assert run1["staged"] == 3
    assert run1["suppressed"] == 1
    assert run1["deduplicated"] == 0

    # Simulated restart re-run on same day -> 0 new staged rows
    run2 = await detect_trip_preparation_reminders_async(session=db_session, now_utc=now)
    assert run2["staged"] == 0
    assert run2["deduplicated"] == 3

    rows = (
        await db_session.execute(
            select(NotificationOutbox).where(
                NotificationOutbox.event_type == "automation.trip_preparation"
            )
        )
    ).scalars().all()
    assert len(rows) == 3
    by_ref = {r.payload["booking_reference"]: r for r in rows}
    assert by_ref["SJ-PREP-7D"].payload["reminder_milestone"] == "7d"
    assert by_ref["SJ-PREP-7D"].payload["active_ticket_count"] == 1
    assert by_ref["SJ-PREP-7D"].payload["passengers_complete"] is False  # 1/2 guests
    assert by_ref["SJ-PREP-3D"].payload["reminder_milestone"] == "3d"
    assert by_ref["SJ-PREP-1D"].payload["reminder_milestone"] == "1d"
    assert by_ref["SJ-PREP-1D"].priority == 8


@pytest.mark.asyncio
async def test_automation_hotel_checkin_and_checkout_reminders(db_session: AsyncSession):
    """Hotel reminder detector sends check-in/out alerts only when guest isn't already in/out."""
    now = datetime(2026, 7, 20, 8, 30, tzinfo=timezone.utc)
    today = now.date()
    user_id = uuid.uuid4()

    hotel_id = uuid.uuid4()
    room_id = uuid.uuid4()
    db_session.add(
        Hotel(
            id=hotel_id,
            name="Sayeman Beach Resort",
            address="Marine Drive, Cox's Bazar",
            city="Cox's Bazar",
            check_in_time="15:00",
            check_out_time="11:30",
        )
    )
    db_session.add(
        HotelRoom(id=room_id, hotel_id=hotel_id, name="Suite", base_price_per_night=8000.0)
    )

    b_due_in = Booking(
        id=uuid.uuid4(),
        user_id=user_id,
        booking_reference="SJ-HTL-IN-1",
        product_type="hotel",
        status="confirmed",
        flow_step="voucher_issued",
        destination_city="Cox's Bazar",
        start_date=today,
        end_date=today + timedelta(days=2),
        total_price=16000.0,
        final_price=16000.0,
    )
    b_already_in = Booking(
        id=uuid.uuid4(),
        user_id=user_id,
        booking_reference="SJ-HTL-IN-DONE",
        product_type="hotel",
        status="checked_in",
        flow_step="checked_in",
        destination_city="Cox's Bazar",
        start_date=today,
        end_date=today + timedelta(days=2),
        total_price=8000.0,
        final_price=8000.0,
    )
    b_due_out = Booking(
        id=uuid.uuid4(),
        user_id=user_id,
        booking_reference="SJ-HTL-OUT-1",
        product_type="hotel",
        status="checked_in",
        flow_step="checked_in",
        destination_city="Cox's Bazar",
        start_date=today - timedelta(days=2),
        end_date=today,
        total_price=12000.0,
        final_price=12000.0,
    )
    b_already_out = Booking(
        id=uuid.uuid4(),
        user_id=user_id,
        booking_reference="SJ-HTL-OUT-DONE",
        product_type="hotel",
        status="confirmed",
        destination_city="Cox's Bazar",
        start_date=today - timedelta(days=2),
        end_date=today,
        total_price=12000.0,
        final_price=12000.0,
    )
    db_session.add_all([b_due_in, b_already_in, b_due_out, b_already_out])
    await db_session.flush()

    db_session.add(
        BookingItem(
            id=uuid.uuid4(),
            booking_id=b_due_in.id,
            product_id=room_id,
            product_type="hotel",
            product_name="Sayeman Suite",
            quantity=2,
            unit_price=8000.0,
            line_total=16000.0,
        )
    )
    db_session.add(
        HotelFolio(
            id=uuid.uuid4(),
            folio_number="FOL-OUT-DUE",
            hotel_id=hotel_id,
            booking_id=b_due_out.id,
            guest_user_id=user_id,
            guest_name="Farhana Ahmed",
            status="open",
            balance_due_paisa=250000,
            checked_in_at=now - timedelta(days=2),
        )
    )
    db_session.add(
        HotelFolio(
            id=uuid.uuid4(),
            folio_number="FOL-OUT-DONE",
            hotel_id=hotel_id,
            booking_id=b_already_out.id,
            guest_user_id=user_id,
            guest_name="Farhana Ahmed",
            status="settled",
            balance_due_paisa=0,
            checked_in_at=now - timedelta(days=2),
            checked_out_at=now - timedelta(hours=1),
        )
    )
    await db_session.commit()

    run1 = await detect_hotel_checkin_checkout_reminders_async(session=db_session, now_utc=now)
    assert run1["checkin_staged"] == 1
    assert run1["checkout_staged"] == 1
    assert run1["staged"] == 2

    run2 = await detect_hotel_checkin_checkout_reminders_async(session=db_session, now_utc=now)
    assert run2["staged"] == 0
    assert run2["deduplicated"] == 2

    in_row = (
        await db_session.execute(
            select(NotificationOutbox).where(
                NotificationOutbox.event_type == "hotel.guest.check_in_reminder"
            )
        )
    ).scalar_one()
    assert in_row.payload["hotel_name"] == "Sayeman Beach Resort"
    assert in_row.payload["check_in_time"] == "15:00"

    out_row = (
        await db_session.execute(
            select(NotificationOutbox).where(
                NotificationOutbox.event_type == "hotel.guest.check_out_reminder"
            )
        )
    ).scalar_one()
    assert out_row.payload["has_outstanding_folio_balance"] is True
    assert out_row.payload["check_out_time"] == "11:30"


@pytest.mark.asyncio
async def test_automation_incomplete_booking_recovery_suppression_and_cooldown(
    db_session: AsyncSession,
):
    """
    Incomplete booking recovery:
      - Triggers for eligible draft in [30m, 72h]
      - Suppresses drafts where user already booked same destination afterwards
      - Suppresses marketing/booking opt-outs
      - Enforces 24h cooldown across restarts & additional drafts for same user
    """
    now = datetime(2026, 7, 25, 12, 0, tzinfo=timezone.utc)

    u_eligible = uuid.uuid4()
    u_converted = uuid.uuid4()
    u_opt_out = uuid.uuid4()

    db_session.add(
        NotificationUserPreference(user_id=u_opt_out, category_marketing=False)
    )

    draft_ok = Booking(
        id=uuid.uuid4(),
        user_id=u_eligible,
        booking_reference="SJ-DRF-OK",
        product_type="hotel",
        status="pending_payment",
        flow_step="payment",
        destination_city="Sylhet",
        total_price=7200.0,
        final_price=7200.0,
        created_at=now - timedelta(hours=4),
    )
    draft_too_fresh = Booking(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        booking_reference="SJ-DRF-FRESH",
        product_type="flight",
        status="draft",
        destination_city="Dhaka",
        total_price=3500.0,
        final_price=3500.0,
        created_at=now - timedelta(minutes=10),
    )
    draft_converted = Booking(
        id=uuid.uuid4(),
        user_id=u_converted,
        booking_reference="SJ-DRF-CONV",
        product_type="hotel",
        status="draft",
        destination_city="Cox's Bazar",
        total_price=9500.0,
        final_price=9500.0,
        created_at=now - timedelta(hours=6),
    )
    later_confirmed = Booking(
        id=uuid.uuid4(),
        user_id=u_converted,
        booking_reference="SJ-CONF-AFTER",
        product_type="hotel",
        status="confirmed",
        destination_city="Cox's Bazar",
        total_price=9500.0,
        final_price=9500.0,
        created_at=now - timedelta(hours=2),
    )
    draft_optout = Booking(
        id=uuid.uuid4(),
        user_id=u_opt_out,
        booking_reference="SJ-DRF-OPTOUT",
        product_type="tour",
        status="draft",
        destination_city="Rangamati",
        total_price=5000.0,
        final_price=5000.0,
        created_at=now - timedelta(hours=5),
    )
    db_session.add_all([draft_ok, draft_too_fresh, draft_converted, later_confirmed, draft_optout])
    await db_session.commit()

    run1 = await detect_incomplete_booking_recovery_async(session=db_session, now_utc=now)
    assert run1["staged"] == 1
    assert run1["suppressed_converted"] == 1
    assert run1["suppressed_opt_out"] == 1

    # Re-run within cooldown window while draft_too_fresh is still < 30m -> 0 new dispatches
    run2 = await detect_incomplete_booking_recovery_async(
        session=db_session, now_utc=now + timedelta(minutes=15)
    )
    assert run2["staged"] == 0
    assert run2["suppressed_cooldown"] == 1

    # Once 2h pass, draft_too_fresh becomes eligible, while draft_ok remains suppressed by 24h cooldown
    run3 = await detect_incomplete_booking_recovery_async(
        session=db_session, now_utc=now + timedelta(hours=2)
    )
    assert run3["staged"] == 1
    assert run3["suppressed_cooldown"] == 1

    recovery_rows = (
        await db_session.execute(
            select(NotificationOutbox).where(
                NotificationOutbox.event_type == "automation.incomplete_booking_recovery"
            )
        )
    ).scalars().all()
    assert len(recovery_rows) == 2
    by_agg = {r.aggregate_id: r for r in recovery_rows}
    assert set(by_agg.keys()) == {str(draft_ok.id), str(draft_too_fresh.id)}
    row = by_agg[str(draft_ok.id)]
    assert row.payload["booking_reference"] == "SJ-DRF-OK"
    assert row.payload["lock_screen_safe"] is True
    for rec_row in recovery_rows:
        _assert_no_secrets_in_outbox(rec_row)


@pytest.mark.asyncio
async def test_automation_disruption_and_refund_reconciliation_idempotent(
    db_session: AsyncSession,
):
    """Scheduled disruption & refund reconciliation stages alerts once and never duplicates restarts."""
    now = datetime(2026, 8, 1, 10, 0, tzinfo=timezone.utc)
    user_id = uuid.uuid4()

    monitor = JourneyMonitor(
        id=uuid.uuid4(),
        user_id=user_id,
        booking_id=uuid.uuid4(),
        service_type="flight",
        provider_code="BG",
        service_number="BG-611",
        origin="DAC",
        destination="ZYL",
        scheduled_departure=now + timedelta(hours=6),
        scheduled_arrival=now + timedelta(hours=7),
        is_active=True,
        notification_enabled=True,
    )
    dedup_hash = DisruptionEngineService.calculate_dedup_hash(
        str(monitor.id), "FLIGHT_DELAYED", 90, now.strftime("%Y-%m-%d")
    )
    disruption = DisruptionEvent(
        id=uuid.uuid4(),
        monitor_id=monitor.id,
        user_id=user_id,
        event_type="FLIGHT_DELAYED",
        severity="high",
        previous_state={"status": "on_time", "delay_minutes": 0},
        new_state={"status": "delayed", "delay_minutes": 90},
        delay_minutes=90,
        source="authorized_feed",
        dedup_hash=dedup_hash,
        event_timestamp=now - timedelta(minutes=15),
    )
    refunded_booking = Booking(
        id=uuid.uuid4(),
        user_id=user_id,
        booking_reference="SJ-REF-SWEEP-1",
        product_type="flight",
        status="refunded",
        destination_city="Sylhet",
        total_price=4800.0,
        final_price=4800.0,
        currency="BDT",
    )
    db_session.add_all([monitor, disruption, refunded_booking])
    await db_session.commit()

    run1 = await detect_disruption_and_refund_alerts_async(
        session=db_session, now_utc=now, evaluate_monitors=False
    )
    assert run1["disruption_staged"] == 1
    assert run1["refund_staged"] == 1
    assert run1["staged"] == 2

    # Simulated worker restart re-run -> 0 duplicates
    run2 = await detect_disruption_and_refund_alerts_async(
        session=db_session, now_utc=now + timedelta(minutes=15), evaluate_monitors=False
    )
    assert run2["disruption_staged"] == 0
    assert run2["disruption_deduplicated"] == 1
    assert run2["refund_staged"] == 0
    assert run2["refund_deduplicated"] == 1
    assert run2["staged"] == 0
