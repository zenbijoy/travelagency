"""
Unit and Integration Tests for Domain Event Registry & Transactional Outbox Staging (Milestone 2).

Validates:
1. Instantiation, validation, CloudEvents 1.0 format, and JSON serialization of all 34 domain events.
2. Global event registry resolution and dynamic parsing (parse_event_dict, get_event_class).
3. OutboxPublisher publish and publish_batch.
4. Transactional atomicity: rollback discards outbox staging; commit confirms persistence.
5. Producer integrations (Booking, Payment, KYC, Price Alerts).
"""

from datetime import date, datetime, timezone
import json
from typing import Type
import uuid
import pytest
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.hotel import Hotel, HotelRoom
from app.models.notification import NotificationOutbox
from app.models.price_alert import PriceAlert, PriceSnapshot
from app.models.user import Agency

from app.notifications.events.base import DomainEvent
from app.notifications.events.registry import (
    EVENT_REGISTRY,
    get_event_class,
    parse_event_dict,
)

# Import all 34 Domain Events across 8 categories
from app.notifications.events.user import (
    UserRegisteredEvent,
    UserProfileUpdatedEvent,
    UserLoyaltyTierUpgradedEvent,
    UserLoyaltyPointsAwardedEvent,
)
from app.notifications.events.security import (
    OtpRequestedEvent,
    NewDeviceLoginEvent,
    BotDetectedEvent,
    PasswordChangedEvent,
)
from app.notifications.events.booking import (
    BookingCreatedEvent,
    BookingConfirmedEvent,
    PaymentSucceededEvent,
    PaymentFailedEvent,
    BookingCancelledEvent,
    TicketIssuedEvent,
)
from app.notifications.events.travel_product import (
    FlightPriceAlertTriggeredEvent,
    FlightScheduleChangedEvent,
    HotelBookingConfirmedEvent,
    TravelDisruptionDetectedEvent,
)
from app.notifications.events.agency import (
    AgencyKycSubmittedEvent,
    AgencyKycApprovedEvent,
    AgencyKycExpiringWarningEvent,
    AgencyPayoutBatchProcessedEvent,
)
from app.notifications.events.hotel import (
    HotelRoomInventoryLowEvent,
    HotelGuestCheckInReminderEvent,
    HotelReviewSubmittedEvent,
    HotelStaffAssignedEvent,
)
from app.notifications.events.marketplace import (
    MarketplaceTripSosTriggeredEvent,
    MarketplaceGuideQuoteRequestedEvent,
    MarketplaceGuideBookedEvent,
    MarketplaceItineraryClonedEvent,
)
from app.notifications.events.system import (
    SystemWorkerHealthHeartbeatEvent,
    SystemDlqMessageQuarantinedEvent,
    SystemProviderCircuitBreakerTrippedEvent,
    SystemCampaignCompletedEvent,
)

from app.notifications.outbox.publisher import OutboxPublisher
from app.schemas.booking import (
    BookingCreateRequest,
    BookingItemCreate,
    BookingStatus,
    BookingStatusUpdateRequest,
    ProductType,
)
from app.schemas.kyc import KYCAdminApproveRequest, KYCDocumentSubmitItem
from app.services.booking_service import BookingService
from app.services.kyc_service import KYCService
from app.services.payment_service import PaymentService
from app.tasks.price_alert_tasks import _evaluate_alerts_async


# ============================================================================
# 1. TEST ALL 34 DOMAIN EVENTS INSTANTIATION & SERIALIZATION
# ============================================================================

ALL_34_EVENT_SPECS = [
    # 1. User & Account (4)
    (UserRegisteredEvent, "user.registered", "user", 5),
    (UserProfileUpdatedEvent, "user.profile_updated", "profile", 3),
    (UserLoyaltyTierUpgradedEvent, "user.loyalty.tier_upgraded", "loyalty", 6),
    (UserLoyaltyPointsAwardedEvent, "user.loyalty.points_awarded", "loyalty", 3),
    # 2. Security & Defense (4)
    (OtpRequestedEvent, "security.auth.otp_requested", "security", 10),
    (NewDeviceLoginEvent, "security.auth.new_device_login", "session", 9),
    (BotDetectedEvent, "security.defense.bot_detected", "security_gate", 8),
    (PasswordChangedEvent, "security.auth.password_changed", "user", 9),
    # 3. Booking & Reservation (6)
    (BookingCreatedEvent, "booking.created", "booking", 6),
    (BookingConfirmedEvent, "booking.confirmed", "booking", 9),
    (PaymentSucceededEvent, "booking.payment_succeeded", "payment", 8),
    (PaymentFailedEvent, "booking.payment_failed", "payment", 8),
    (BookingCancelledEvent, "booking.cancelled", "booking", 7),
    (TicketIssuedEvent, "booking.ticket_issued", "ticket", 8),
    # 4. Travel Products & Inventory (4)
    (FlightPriceAlertTriggeredEvent, "flight.price_alert.triggered", "price_alert", 6),
    (FlightScheduleChangedEvent, "flight.schedule_changed", "flight", 9),
    (HotelBookingConfirmedEvent, "hotel.booking.confirmed", "hotel_booking", 8),
    (TravelDisruptionDetectedEvent, "travel.disruption.detected", "disruption", 9),
    # 5. Agency & B2B Operations (4)
    (AgencyKycSubmittedEvent, "agency.kyc.submitted", "agency", 5),
    (AgencyKycApprovedEvent, "agency.kyc.approved", "agency", 7),
    (AgencyKycExpiringWarningEvent, "agency.kyc.expiring_warning", "agency", 6),
    (AgencyPayoutBatchProcessedEvent, "agency.payout.batch_processed", "payout_batch", 7),
    # 6. Hotel Partner & Hospitality (4)
    (HotelRoomInventoryLowEvent, "hotel.room.inventory_low", "hotel_room", 5),
    (HotelGuestCheckInReminderEvent, "hotel.guest.check_in_reminder", "booking", 5),
    (HotelReviewSubmittedEvent, "hotel.review.submitted", "hotel_review", 4),
    (HotelStaffAssignedEvent, "hotel.staff.assigned", "hotel", 5),
    # 7. Marketplace & Local Guides (4)
    (MarketplaceTripSosTriggeredEvent, "marketplace.trip.sos_triggered", "trip_session", 10),
    (MarketplaceGuideQuoteRequestedEvent, "marketplace.guide.quote_requested", "marketplace_booking", 7),
    (MarketplaceGuideBookedEvent, "marketplace.guide.booked", "marketplace_booking", 8),
    (MarketplaceItineraryClonedEvent, "marketplace.itinerary.cloned", "itinerary", 3),
    # 8. System Telemetry & Operational Health (4)
    (SystemWorkerHealthHeartbeatEvent, "system.worker.health_heartbeat", "system_worker", 2),
    (SystemDlqMessageQuarantinedEvent, "system.dlq.message_quarantined", "notification_dlq", 9),
    (SystemProviderCircuitBreakerTrippedEvent, "system.provider.circuit_breaker_tripped", "provider", 9),
    (SystemCampaignCompletedEvent, "system.campaign.completed", "campaign", 4),
]


def test_catalog_event_count_exactly_34():
    """Verify exactly 34 domain events are defined across all 8 domains."""
    assert len(ALL_34_EVENT_SPECS) == 34
    assert len(EVENT_REGISTRY) == 34


@pytest.mark.parametrize("event_cls,expected_type,expected_aggregate,expected_priority", ALL_34_EVENT_SPECS)
def test_each_domain_event_instantiation_and_contract(
    event_cls: Type[DomainEvent],
    expected_type: str,
    expected_aggregate: str,
    expected_priority: int,
):
    """
    Test that every one of the 34 domain events instantiates with correct metadata,
    default priority, timezone-aware UTC timestamp, and produces valid CloudEvents 1.0 dictionaries.
    """
    entity_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    event = event_cls(
        aggregate_id=str(entity_id),
        actor_id=actor_id,
        headers={"causation_id": "cause-123", "source_service": "test_service"},
        test_payload_key="test_value",
    )

    # 1. Core attributes
    assert isinstance(event.event_id, uuid.UUID)
    assert event.event_type == expected_type
    assert event.aggregate_type == expected_aggregate
    assert event.aggregate_id == str(entity_id)
    assert event.actor_id == actor_id
    assert event.priority == expected_priority
    assert event.timestamp.tzinfo is not None  # Must be timezone-aware (UTC)

    # 2. Idempotency key
    expected_idem_key = f"{expected_aggregate}:{entity_id}:{expected_type}:cause-123"
    assert event.idempotency_key == expected_idem_key

    # 3. Serialization to dict and JSON round-trip
    d = event.to_dict()
    assert isinstance(d, dict)
    assert d["event_type"] == expected_type
    assert d["priority"] == expected_priority
    json_str = json.dumps(d)
    assert expected_type in json_str

    # 4. CloudEvents 1.0 envelope compliance
    ce = event.to_cloudevent()
    assert ce["specversion"] == "1.0"
    assert ce["id"] == str(event.event_id)
    assert ce["type"] == expected_type
    assert ce["source"] == "test_service"
    assert ce["subject"] == str(entity_id)
    assert ce["time"] == event.timestamp.isoformat()
    assert ce["datacontenttype"] == "application/json"
    assert ce["priority"] == expected_priority
    assert ce["aggregatetype"] == expected_aggregate
    assert ce["actorid"] == str(actor_id)
    assert ce["causationid"] == "cause-123"


# ============================================================================
# 2. REGISTRY RESOLUTION & DYNAMIC PARSING TESTS
# ============================================================================

def test_registry_resolution_and_get_event_class():
    """Verify registry resolves all 34 event types to their concrete classes."""
    for event_cls, expected_type, _, _ in ALL_34_EVENT_SPECS:
        resolved = get_event_class(expected_type)
        assert resolved is event_cls, f"Registry failed to resolve {expected_type}"

    assert get_event_class("non.existent.event") is None


def test_parse_event_dict_typed_and_cloudevent():
    """Verify parse_event_dict reconstructs typed classes from dicts and CloudEvents payloads."""
    # 1. Standard DomainEvent dict
    data = {
        "event_type": "booking.created",
        "aggregate_type": "booking",
        "aggregate_id": "bk-999",
        "priority": 6,
        "payload": {"destination": "Cox's Bazar", "total_price": 5000.0},
    }
    parsed = parse_event_dict(data)
    assert isinstance(parsed, BookingCreatedEvent)
    assert parsed.aggregate_id == "bk-999"
    assert parsed.payload["destination"] == "Cox's Bazar"

    # 2. CloudEvents 1.0 envelope dict
    ce_data = {
        "type": "marketplace.trip.sos_triggered",
        "subject": "session-emergency-1",
        "source": "mobile-app",
        "time": datetime.now(timezone.utc).isoformat(),
        "priority": 10,
        "data": {
            "battery_level": 12,
            "sos_message": "Injured on trail near Nafakhum",
        },
    }
    parsed_ce = parse_event_dict(ce_data)
    assert isinstance(parsed_ce, MarketplaceTripSosTriggeredEvent)
    assert parsed_ce.aggregate_id == "session-emergency-1"
    assert parsed_ce.payload["battery_level"] == 12
    assert parsed_ce.priority == 10

    # 3. Fallback to base DomainEvent for unregistered types
    unknown_data = {
        "event_type": "custom.unknown.event",
        "aggregate_type": "custom",
        "aggregate_id": "c-101",
        "priority": 5,
        "payload": {},
    }
    parsed_unknown = parse_event_dict(unknown_data)
    assert type(parsed_unknown) is DomainEvent
    assert parsed_unknown.event_type == "custom.unknown.event"

    # 4. Error on missing event_type / type
    with pytest.raises(ValueError, match="missing 'event_type'"):
        parse_event_dict({"aggregate_id": "invalid"})


def test_domain_event_boundary_validation():
    """Verify boundary condition rejections for priority and timezone normalization."""
    # Priority < 1 rejected
    with pytest.raises(ValidationError):
        DomainEvent(event_type="test", aggregate_type="test", aggregate_id="1", priority=0)

    # Priority > 10 rejected
    with pytest.raises(ValidationError):
        DomainEvent(event_type="test", aggregate_type="test", aggregate_id="1", priority=11)

    # Naive timestamp normalized to UTC
    naive_dt = datetime(2026, 11, 24, 12, 0, 0)
    evt = DomainEvent(
        event_type="test",
        aggregate_type="test",
        aggregate_id="1",
        timestamp=naive_dt,
    )
    assert evt.timestamp.tzinfo == timezone.utc

    # Aggregate ID passed as integer converted to string
    evt_int = DomainEvent(
        event_type="test",
        aggregate_type="test",
        aggregate_id=12345,  # type: ignore
    )
    assert evt_int.aggregate_id == "12345"


# ============================================================================
# 3. OUTBOX PUBLISHER & TRANSACTIONAL ATOMICITY TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_outbox_publisher_publish_and_atomicity(db_session: AsyncSession):
    """
    Test that OutboxPublisher stages rows without committing,
    and rollback strictly cancels staging while commit persists it.
    """
    event = BookingConfirmedEvent(
        booking_id=uuid.uuid4(),
        booking_reference="SJ-2026-TEST",
        user_id=uuid.uuid4(),
        customer_name="Rahim Ahmed",
        customer_email="rahim@example.com",
        total_paid=15000.0,
        currency="BDT",
    )

    # 1. Publish into session (uncommitted)
    staged = await OutboxPublisher.publish(db_session, event)
    assert staged.status == "pending"
    assert staged.event_id == event.event_id
    assert staged.event_type == "booking.confirmed"
    assert staged.priority == 9
    assert staged.payload["customer_name"] == "Rahim Ahmed"

    # 2. Rollback session -> row must disappear
    await db_session.rollback()
    stmt = select(NotificationOutbox).where(NotificationOutbox.event_id == event.event_id)
    res = await db_session.execute(stmt)
    assert res.scalar_one_or_none() is None

    # 3. Re-publish and commit -> row must persist
    await OutboxPublisher.publish(db_session, event)
    await db_session.commit()

    res_committed = await db_session.execute(stmt)
    persisted = res_committed.scalar_one()
    assert persisted.event_id == event.event_id
    assert persisted.event_type == "booking.confirmed"
    assert persisted.status == "pending"
    assert persisted.attempts == 0
    assert persisted.max_attempts == 5


@pytest.mark.asyncio
async def test_outbox_publisher_publish_batch(db_session: AsyncSession):
    """Verify OutboxPublisher.publish_batch stages multiple domain events atomically."""
    events = [
        OtpRequestedEvent(phone="+8801700000001", otp_code="123456"),
        NewDeviceLoginEvent(device_name="Safari on iPhone 16"),
        PasswordChangedEvent(ip_address="103.25.12.1"),
    ]

    staged_list = await OutboxPublisher.publish_batch(db_session, events)
    assert len(staged_list) == 3
    await db_session.commit()

    # Verify all 3 were persisted in outbox table
    event_ids = [e.event_id for e in events]
    stmt = select(NotificationOutbox).where(NotificationOutbox.event_id.in_(event_ids))
    res = await db_session.execute(stmt)
    persisted_rows = res.scalars().all()
    assert len(persisted_rows) == 3


# ============================================================================
# 4. REAL SERVICE PRODUCER INTEGRATION TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_booking_service_outbox_integration(db_session: AsyncSession):
    """
    Verify BookingService.create_booking stages BookingCreatedEvent and
    BookingService.transition_status stages BookingConfirmedEvent or BookingCancelledEvent.
    """
    # 1. Setup hotel and room for booking creation
    test_user_id = uuid.uuid4()
    hotel = Hotel(name="Pan Pacific Sonargaon", city="Dhaka", country="Bangladesh", address="Karwan Bazar")
    db_session.add(hotel)
    await db_session.commit()
    await db_session.refresh(hotel)

    room = HotelRoom(
        hotel_id=hotel.id,
        name="Deluxe King Room",
        room_type="deluxe",
        base_price_per_night=8500.0,
        max_occupancy=2,
        is_available=True,
    )
    db_session.add(room)
    await db_session.commit()
    await db_session.refresh(room)

    req = BookingCreateRequest(
        product_type=ProductType.HOTEL,
        origin_city="Dhaka",
        destination_city="Dhaka",
        number_of_guests=2,
        items=[
            BookingItemCreate(
                product_id=room.id,
                product_type=ProductType.HOTEL,
                product_name="Deluxe King Room",
                quantity=1,
                unit_price=8500.0,
            )
        ],
        passengers=[],
    )

    # Create Booking
    booking_resp = await BookingService.create_booking(db_session, test_user_id, req)
    assert booking_resp.booking_reference is not None

    # Verify BookingCreatedEvent staged in outbox
    stmt_created = select(NotificationOutbox).where(
        NotificationOutbox.event_type == "booking.created",
        NotificationOutbox.aggregate_id == str(booking_resp.id),
    )
    res_created = await db_session.execute(stmt_created)
    outbox_created = res_created.scalar_one_or_none()
    assert outbox_created is not None
    assert outbox_created.payload["destination"] == "Dhaka"
    assert outbox_created.priority == 6

    # 2. Confirm Booking
    confirm_req = BookingStatusUpdateRequest(
        target_status=BookingStatus.CONFIRMED,
        payment_transaction_id="TXN-CONFIRM-TEST-01",
    )
    await BookingService.transition_status(db_session, booking_resp.id, confirm_req)

    # Verify BookingConfirmedEvent staged in outbox
    stmt_confirmed = select(NotificationOutbox).where(
        NotificationOutbox.event_type == "booking.confirmed",
        NotificationOutbox.aggregate_id == str(booking_resp.id),
    )
    res_confirmed = await db_session.execute(stmt_confirmed)
    outbox_confirmed = res_confirmed.scalar_one_or_none()
    assert outbox_confirmed is not None
    assert outbox_confirmed.priority == 9

    # 3. Create another booking and cancel it
    booking_resp2 = await BookingService.create_booking(db_session, test_user_id, req)
    cancel_req = BookingStatusUpdateRequest(
        target_status=BookingStatus.CANCELLED,
        cancellation_reason="Traveler plans changed",
    )
    await BookingService.transition_status(db_session, booking_resp2.id, cancel_req)

    stmt_cancelled = select(NotificationOutbox).where(
        NotificationOutbox.event_type == "booking.cancelled",
        NotificationOutbox.aggregate_id == str(booking_resp2.id),
    )
    res_cancelled = await db_session.execute(stmt_cancelled)
    outbox_cancelled = res_cancelled.scalar_one_or_none()
    assert outbox_cancelled is not None
    assert outbox_cancelled.payload["cancellation_reason"] == "Traveler plans changed"
    assert outbox_cancelled.priority == 7


@pytest.mark.asyncio
async def test_payment_service_outbox_integration(db_session: AsyncSession):
    """Verify PaymentService stages PaymentSucceededEvent on success and PaymentFailedEvent on failure."""
    test_user_id = uuid.uuid4()
    test_booking_id = uuid.uuid4()

    # 1. Test Payment Failed
    await PaymentService.process_payment_confirmation(
        db=db_session,
        provider="bkash",
        transaction_id="TX-FAIL-1",
        booking_reference="SJ-REF-FAIL",
        amount_paid=4500.0,
        is_success=False,
        failure_reason="Insufficient wallet balance",
        user_id=test_user_id,
        booking_id=test_booking_id,
    )
    await db_session.commit()

    stmt_fail = select(NotificationOutbox).where(
        NotificationOutbox.event_type == "booking.payment_failed",
    )
    res_fail = await db_session.execute(stmt_fail)
    outbox_fail = res_fail.scalar_one_or_none()
    assert outbox_fail is not None
    assert outbox_fail.payload["failure_reason"] == "Insufficient wallet balance"
    assert outbox_fail.priority == 8

    # 2. Test Payment Succeeded
    booking = Booking(
        id=uuid.uuid4(),
        user_id=test_user_id,
        booking_reference="SJ-REF-SUCCESS-1",
        product_type="hotel",
        status=BookingStatus.PENDING_PAYMENT.value,
        flow_step="payment",
        origin_city="Dhaka",
        destination_city="Cox's Bazar",
        total_price=12500.0,
        final_price=12500.0,
        currency="BDT",
    )
    db_session.add(booking)
    await db_session.commit()

    confirmed_booking, _, _ = await PaymentService.process_payment_confirmation(
        db=db_session,
        provider="bkash",
        transaction_id="TX-SUCC-1",
        booking_reference=booking.booking_reference,
        amount_paid=12500.0,
        is_success=True,
    )
    assert confirmed_booking is not None
    assert confirmed_booking.status == BookingStatus.CONFIRMED.value

    stmt_succ = select(NotificationOutbox).where(
        NotificationOutbox.event_type == "booking.payment_succeeded",
    )
    res_succ = await db_session.execute(stmt_succ)
    outbox_succ = res_succ.scalar_one_or_none()
    assert outbox_succ is not None
    assert outbox_succ.aggregate_type == "payment"
    assert outbox_succ.aggregate_id != "unknown"
    assert uuid.UUID(outbox_succ.aggregate_id) is not None
    assert outbox_succ.payload["gateway"] == "bkash"
    assert outbox_succ.payload["gateway_transaction_id"] == "TX-SUCC-1"
    assert outbox_succ.payload["amount"] == 12500.0
    assert outbox_succ.priority == 8


@pytest.mark.asyncio
async def test_kyc_service_outbox_integration(db_session: AsyncSession):
    """Verify KYCService stages AgencyKycSubmittedEvent and AgencyKycApprovedEvent."""
    test_user_id = uuid.uuid4()
    admin_id = uuid.uuid4()

    # Setup Agency
    agency = Agency(
        name="Chittagong Travel Hub",
        email="hub@ctg.com",
        phone="+8801811111111",
        owner_user_id=test_user_id,
        verification_status="unverified",
    )
    db_session.add(agency)
    await db_session.commit()
    await db_session.refresh(agency)

    # 1. Submit KYC
    upload_items = [
        KYCDocumentSubmitItem(
            doc_type="trade_licence",
            r2_key="kyc/test/trade_licence.pdf",
            mime="application/pdf",
            size_bytes=10240,
            sha256="a" * 64,
        ),
        KYCDocumentSubmitItem(
            doc_type="tin",
            r2_key="kyc/test/tin.pdf",
            mime="application/pdf",
            size_bytes=10240,
            sha256="b" * 64,
        ),
        KYCDocumentSubmitItem(
            doc_type="owner_id",
            r2_key="kyc/test/owner_id.pdf",
            mime="application/pdf",
            size_bytes=10240,
            sha256="c" * 64,
        ),
        KYCDocumentSubmitItem(
            doc_type="address_proof",
            r2_key="kyc/test/address_proof.pdf",
            mime="application/pdf",
            size_bytes=10240,
            sha256="d" * 64,
        ),
    ]
    from app.schemas.kyc import KYCSubmitRequest
    kyc_req = KYCSubmitRequest(documents=upload_items)
    submission_resp = await KYCService.submit_kyc(db_session, agency.id, test_user_id, kyc_req)

    # Verify AgencyKycSubmittedEvent staged in outbox
    stmt_kyc_sub = select(NotificationOutbox).where(
        NotificationOutbox.event_type == "agency.kyc.submitted",
        NotificationOutbox.aggregate_id == str(agency.id),
    )
    res_kyc_sub = await db_session.execute(stmt_kyc_sub)
    outbox_kyc_sub = res_kyc_sub.scalar_one_or_none()
    assert outbox_kyc_sub is not None
    assert outbox_kyc_sub.payload["agency_name"] == "Chittagong Travel Hub"
    assert outbox_kyc_sub.priority == 5

    # 2. Admin Review & Approve KYC
    class MockAdminUser:
        id = admin_id
        email = "compliance@shopnojatra.com"
        role = "admin"

    approve_req = KYCAdminApproveRequest(note="Trade license verified with city corporation")
    await KYCService.review_kyc(
        db=db_session,
        submission_id=submission_resp.id,
        admin_user=MockAdminUser(),
        request=approve_req,
        approved=True,
    )

    # Verify AgencyKycApprovedEvent staged in outbox
    stmt_kyc_app = select(NotificationOutbox).where(
        NotificationOutbox.event_type == "agency.kyc.approved",
        NotificationOutbox.aggregate_id == str(agency.id),
    )
    res_kyc_app = await db_session.execute(stmt_kyc_app)
    outbox_kyc_app = res_kyc_app.scalar_one_or_none()
    assert outbox_kyc_app is not None
    assert outbox_kyc_app.payload["agency_name"] == "Chittagong Travel Hub"
    assert outbox_kyc_app.priority == 7


@pytest.mark.asyncio
async def test_price_alert_tasks_outbox_integration(db_session: AsyncSession):
    """Verify price alert evaluation task stages FlightPriceAlertTriggeredEvent in outbox."""
    test_user_id = uuid.uuid4()
    today = date.today()

    # Create active price alert: target price 5000 BDT (500000 paisa)
    alert = PriceAlert(
        user_id=test_user_id,
        service_type="flight",
        origin="DAC",
        destination="CXB",
        travel_date=today,
        target_price_paisa=500000,
        status="active",
    )
    db_session.add(alert)

    # Create price snapshot at 4200 BDT (420000 paisa) -> below target threshold
    from app.repositories.price_alert_repository import build_route_key
    snapshot = PriceSnapshot(
        route_key=build_route_key("flight", "DAC", "CXB"),
        travel_date=today,
        lowest_price_paisa=420000,
        source="test_sampler",
    )
    db_session.add(snapshot)
    await db_session.commit()

    # Run evaluation with allow_quiet_hours=True to force evaluation
    eval_res = await _evaluate_alerts_async(allow_quiet_hours=True, session=db_session)
    assert eval_res["triggered_count"] >= 1

    # Verify FlightPriceAlertTriggeredEvent staged in outbox
    stmt = select(NotificationOutbox).where(
        NotificationOutbox.event_type == "flight.price_alert.triggered",
        NotificationOutbox.aggregate_id == str(alert.id),
    )
    res = await db_session.execute(stmt)
    outbox_alert = res.scalar_one_or_none()
    assert outbox_alert is not None
    assert outbox_alert.payload["origin"] == "DAC"
    assert outbox_alert.payload["destination"] == "CXB"
    assert outbox_alert.payload["current_price"] == 4200.0
    assert outbox_alert.priority == 6
