"""
Comprehensive Engine, Adapter, Worker, AI Guardrail, and Admin/User REST API Tests
for the ShopnoJatra Notification Platform.

Runs 100% hermetically on SQLite with mock delivery adapters, zero Redis dependencies,
and zero external credentials or live broadcasts.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.circuit_breaker import CircuitState, gemini_circuit_breaker
from app.core.config import settings
from app.models.notification import (
    Notification,
    NotificationAnalytics,
    NotificationCampaign,
    NotificationDLQ,
    NotificationDelivery,
    NotificationDevice,
    NotificationOutbox,
    NotificationRule,
    NotificationTemplate,
    NotificationUserPreference,
)
from app.models.user import AdminUser, Agency, HotelStaff
from app.notifications.ai.factual_validator import FactualValidator
from app.notifications.ai.service import AIPersonalizationService
from app.notifications.delivery import (
    DeliveryResult,
    EmailDeliveryAdapter,
    InAppDeliveryAdapter,
    PushDeliveryAdapter,
    SmsDeliveryAdapter,
    is_valid_push_token,
    normalize_phone_e164,
    render_safe_email_html,
)
from app.notifications.dlq.manager import DLQManager
from app.notifications.events.base import DomainEvent
from app.notifications.events.booking import BookingConfirmedEvent
from app.notifications.events.registry import EVENT_REGISTRY
from app.notifications.events.security import OtpRequestedEvent
from app.notifications.events.system import SystemDlqMessageQuarantinedEvent
from app.notifications.events.travel_product import TravelDisruptionDetectedEvent
from app.notifications.outbox.publisher import OutboxPublisher
from app.notifications.personalization.fatigue import FatigueEngine
from app.notifications.rules.engine import (
    RulesEngine,
    compute_quiet_hours_end_utc,
    is_within_quiet_hours,
    validate_condition_tree,
)
from app.notifications.worker.processor import (
    OutboxWorkerProcessor,
    compute_retry_delay_seconds,
)
from app.schemas.ai import AICompletionResponse
from app.services.gemini_service import GeminiConciergeService
from tests.conftest import make_test_jwt


# ============================================================================
# Shared Auth & Fixture Helpers
# ============================================================================


async def _make_admin_headers(
    db_session: AsyncSession, email: str = "ops-admin@shopnojatra.com"
) -> tuple[uuid.UUID, dict[str, str]]:
    admin_id = uuid.uuid4()
    db_session.add(AdminUser(user_id=admin_id, role="admin", status="active"))
    await db_session.commit()
    token = make_test_jwt(admin_id, email=email, role="user")
    return admin_id, {"Authorization": f"Bearer {token}"}


def _make_user_headers(
    *,
    email: str = "traveler@shopnojatra.com",
    role: str = "user",
) -> tuple[uuid.UUID, dict[str, str]]:
    uid = uuid.uuid4()
    token = make_test_jwt(uid, email=email, role=role)
    return uid, {"Authorization": f"Bearer {token}"}


async def _make_agency_headers(
    db_session: AsyncSession, email: str = "agency@shopnojatra.com"
) -> tuple[uuid.UUID, uuid.UUID, dict[str, str]]:
    owner_id = uuid.uuid4()
    agency_id = uuid.uuid4()
    db_session.add(
        Agency(
            id=agency_id,
            owner_user_id=owner_id,
            name="Bengal Horizon Tours",
            slug=f"bengal-{agency_id.hex[:8]}",
            email=email,
            phone="+8801711000001",
            status="active",
        )
    )
    await db_session.commit()
    token = make_test_jwt(owner_id, email=email, role="agency")
    return owner_id, agency_id, {"Authorization": f"Bearer {token}"}


async def _make_hotel_headers(
    db_session: AsyncSession, email: str = "hotel@shopnojatra.com"
) -> tuple[uuid.UUID, uuid.UUID, dict[str, str]]:
    staff_uid = uuid.uuid4()
    hotel_id = uuid.uuid4()
    db_session.add(
        HotelStaff(
            hotel_id=hotel_id,
            user_id=staff_uid,
            role="manager",
            status="active",
        )
    )
    await db_session.commit()
    token = make_test_jwt(staff_uid, email=email, role="hotel_staff")
    return staff_uid, hotel_id, {"Authorization": f"Bearer {token}"}


# ============================================================================
# 1. Rules Engine: Conditions, Quiet Hours, Caps, Cooldowns & Critical Bypass
# ============================================================================


def test_rules_engine_conditions_tree_and_validation():
    tree = {
        "all": [
            {"field": "booking.total_paisa", "op": "gte", "value": 500000},
            {"field": "destination", "op": "in", "value": ["Cox's Bazar", "Sylhet"]},
            {"field": "tags", "op": "contains", "value": "vip"},
            {"field": "cancelled_by", "op": "not_in", "value": ["fraud", "chargeback"]},
            {"field": "voucher_code", "op": "exists", "value": True},
            {"not": {"field": "status", "op": "eq", "value": "cancelled"}},
            {
                "any": [
                    {"field": "passengers", "op": "gt", "value": 1},
                    {"field": "passengers", "op": "lte", "value": 0},
                ]
            },
        ]
    }
    validate_condition_tree(tree)

    matching_payload = {
        "booking": {"total_paisa": 750000},
        "destination": "Sylhet",
        "tags": ["family", "vip"],
        "cancelled_by": "user",
        "voucher_code": "SYLHET15",
        "status": "confirmed",
        "passengers": 3,
    }
    assert RulesEngine.evaluate_condition_tree(tree, matching_payload) is True

    # Fail inside NOT branch
    bad_status_payload = {**matching_payload, "status": "cancelled"}
    assert RulesEngine.evaluate_condition_tree(tree, bad_status_payload) is False

    # Safe mixed-type comparisons never raise TypeError
    assert RulesEngine.evaluate_condition_tree(
        {"field": "passengers", "op": "gt", "value": "not-an-int"},
        {"passengers": 3},
    ) is False

    # Private / underscore dotted segments are blocked from traversal
    assert RulesEngine.evaluate_condition_tree(
        {"field": "booking.__class__", "op": "exists", "value": True},
        matching_payload,
    ) is False

    # Validation rejects unsupported ops and deep nesting
    with pytest.raises(ValueError, match="Unsupported"):
        validate_condition_tree({"field": "x", "op": "eval", "value": "1+1"})

    deep_tree: dict = {"field": "x", "op": "eq", "value": 1}
    for _ in range(14):
        deep_tree = {"not": deep_tree}
    with pytest.raises(ValueError, match="depth"):
        validate_condition_tree(deep_tree)


def test_rules_engine_quiet_hours_cooldown_caps_opt_outs_and_critical_bypass():
    engine = RulesEngine()
    now_utc = datetime(2026, 5, 10, 17, 30, tzinfo=timezone.utc)  # 23:30 Asia/Dhaka

    prefs = SimpleNamespace(
        user_id=uuid.uuid4(),
        push_enabled=True,
        email_enabled=False,
        sms_enabled=True,
        in_app_enabled=True,
        category_booking=True,
        category_security=True,
        category_flight_alerts=True,
        category_marketing=True,
        category_community=True,
        category_price_alerts=True,
        quiet_hours_enabled=True,
        quiet_hours_start="22:00",
        quiet_hours_end="07:00",
        timezone="Asia/Dhaka",
        frequency_cap_marketing_per_day=2,
    )

    assert is_within_quiet_hours(datetime(2026, 5, 10, 23, 30).time(), "22:00", "07:00") is True
    assert is_within_quiet_hours(datetime(2026, 5, 10, 14, 0).time(), "22:00", "07:00") is False
    expected_wake_utc = compute_quiet_hours_end_utc(now_utc, "Asia/Dhaka", "22:00", "07:00")
    # 07:00 next morning Asia/Dhaka == 01:00 UTC
    assert expected_wake_utc == datetime(2026, 5, 11, 1, 0, tzinfo=timezone.utc)

    # 1. Promotional event during quiet hours: email opted out, push/in_app deferred
    promo_event = DomainEvent(
        event_type="marketing.promo.flash_sale",
        aggregate_type="campaign",
        aggregate_id="cmp-1",
        priority=5,
        payload={"channel_override": "email"},
    )
    promo_res = engine.evaluate_sync(
        promo_event,
        prefs,
        now_utc=now_utc,
        marketing_sent_today=0,
        candidate_channels=["push", "in_app", "email"],
    )
    assert promo_res.is_critical is False
    assert promo_res.bypass_quiet_hours is False
    assert promo_res.should_dispatch_now is False
    assert promo_res.scheduled_at == expected_wake_utc
    assert promo_res.suppressed_channels.get("email") == "email_disabled_by_user"
    assert "push" in promo_res.eligible_channels and "email" not in promo_res.eligible_channels

    # 2. Promotional daily cap reached -> full suppression
    capped_res = engine.evaluate_sync(
        promo_event,
        prefs,
        now_utc=now_utc,
        marketing_sent_today=2,
        candidate_channels=["push", "in_app"],
    )
    assert capped_res.is_suppressed is True
    assert "marketing_daily_frequency_cap_reached" in capped_res.suppressed_reasons

    # 3. Category opt-out -> suppressed
    prefs_no_mkt = SimpleNamespace(**{**prefs.__dict__, "category_marketing": False})
    optout_res = engine.evaluate_sync(
        promo_event,
        prefs_no_mkt,
        now_utc=now_utc,
        candidate_channels=["push", "in_app"],
    )
    assert optout_res.is_suppressed is True
    assert "category_marketing_opt_out" in optout_res.suppressed_reasons

    # 4. Critical events bypass quiet hours & frequency caps completely
    for crit_event in (
        BookingConfirmedEvent(aggregate_id="bk-101", payload={"booking_reference": "SJ-101"}),
        OtpRequestedEvent(aggregate_id="u-1", payload={"otp_code": "123456"}),
        TravelDisruptionDetectedEvent(aggregate_id="flt-1", payload={"flight_no": "BG-147"}),
        DomainEvent(
            event_type="travel.sos.triggered",
            aggregate_type="trip",
            aggregate_id="trip-1",
            priority=10,
            payload={},
        ),
    ):
        crit_res = engine.evaluate_sync(
            crit_event,
            prefs,
            now_utc=now_utc,
            marketing_sent_today=99,
            candidate_channels=["push", "sms", "in_app"],
        )
        assert crit_res.is_critical is True
        assert crit_res.bypass_quiet_hours is True
        assert crit_res.should_dispatch_now is True
        assert crit_res.is_suppressed is False
        assert crit_res.scheduled_at is None

    # 5. DB NotificationRule cooldown enforcement
    rule_id = uuid.uuid4()
    db_rule = NotificationRule(
        id=rule_id,
        name="High Value Alert",
        trigger_event="marketing.promo.flash_sale",
        channels=["push"],
        conditions={"field": "discount_pct", "op": "gte", "value": 15},
        priority="normal",
        bypass_quiet_hours=True,
        cooldown_seconds=600,
        is_active=True,
    )
    hot_event = DomainEvent(
        event_type="marketing.promo.flash_sale",
        aggregate_type="campaign",
        aggregate_id="cmp-2",
        priority=5,
        payload={"discount_pct": 20},
    )
    # Within 600s cooldown -> skipped & cooldown reason recorded
    in_cooldown = engine.evaluate_sync(
        hot_event,
        prefs,
        db_rules=[db_rule],
        now_utc=now_utc,
        rule_last_triggered_at={rule_id: now_utc - timedelta(seconds=120)},
        candidate_channels=None,
    )
    assert "rule_cooldown_active" in in_cooldown.suppressed_reasons
    assert rule_id not in in_cooldown.matched_rule_ids

    # After cooldown expires -> rule matches and activates push channel + bypass_quiet_hours
    after_cooldown = engine.evaluate_sync(
        hot_event,
        prefs,
        db_rules=[db_rule],
        now_utc=now_utc,
        rule_last_triggered_at={rule_id: now_utc - timedelta(seconds=900)},
        candidate_channels=None,
    )
    assert rule_id in after_cooldown.matched_rule_ids
    assert after_cooldown.bypass_quiet_hours is True
    assert "push" in after_cooldown.eligible_channels


# ============================================================================
# 2. AI Personalization Guardrails, Disable Flag, Timeout & Critical Bypass
# ============================================================================


@pytest.mark.asyncio
async def test_ai_personalization_disabled_timeouts_circuit_breaker_and_critical_bypass(
    monkeypatch: pytest.MonkeyPatch,
):
    call_counter = {"count": 0}

    async def fake_ok_completion(req):
        call_counter["count"] += 1
        return AICompletionResponse(
            text='{"title":"Sylhet Escape Ready","body":"Save 15% on Sylhet retreats from BDT 8,500.","cta":"View Offer","push_short_title":"Sylhet Retreat Deal","push_short_body":"15% off Sylhet packages.","in_app_title":"Sylhet Escape Ready","in_app_body":"Save 15% on Sylhet stays.","email_subject":"Sylhet Escape Ready","sms_text":"Sylhet 15% off on ShopnoJatra."}',
            model="gemini-test",
            provider="gemini",
        )

    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setattr(GeminiConciergeService, "text_completion", fake_ok_completion)
    monkeypatch.setattr(gemini_circuit_breaker, "state", CircuitState.CLOSED)
    monkeypatch.setattr(gemini_circuit_breaker, "failure_count", 0)

    facts = {
        "destination": "Sylhet",
        "discount_pct": 15,
        "price_bdt": 8500,
        "deep_link": "/(tabs)/explore?destination=Sylhet",
    }

    # 1. ai_enabled=False and provider='disabled' disable AI cleanly
    res_disabled = await AIPersonalizationService.personalize_notification(
        event_type="system.campaign.broadcast",
        verified_facts=facts,
        ai_config={"ai_enabled": False},
    )
    assert res_disabled.ai_used is False
    assert res_disabled.ai_provider == "ai_disabled"

    res_provider_off = await AIPersonalizationService.personalize_notification(
        event_type="system.campaign.broadcast",
        verified_facts=facts,
        ai_config={"ai_enabled": True, "provider": "disabled"},
    )
    assert res_provider_off.ai_used is False
    assert res_provider_off.ai_provider == "ai_disabled"
    assert call_counter["count"] == 0

    # 2. Critical transactional events NEVER invoke AI even with valid key & allow_ai=True
    for crit_type in (
        "booking.confirmed",
        "booking.refunded",
        "payment.completed",
        "travel.sos.triggered",
        "security.auth.otp_requested",
    ):
        assert AIPersonalizationService.is_critical_or_transactional(crit_type) is True
        crit_res = await AIPersonalizationService.personalize_notification(
            event_type=crit_type,
            verified_facts={"booking_reference": "SJ-999", "amount_bdt": 12000},
            allow_ai=True,
            ai_config={"ai_enabled": True},
        )
        assert crit_res.ai_used is False
        assert crit_res.ai_provider == "deterministic_critical"
    assert call_counter["count"] == 0

    # 3. Open circuit breaker -> safe fallback without calling Gemini
    monkeypatch.setattr(gemini_circuit_breaker, "state", CircuitState.OPEN)
    cb_res = await AIPersonalizationService.personalize_notification(
        event_type="system.campaign.broadcast",
        verified_facts=facts,
        confidence_tier="high",
        ai_config={"ai_enabled": True, "eligible_categories": ["marketing"]},
        category="marketing",
    )
    assert cb_res.ai_used is False
    assert cb_res.ai_provider == "circuit_open_fallback"
    assert call_counter["count"] == 0

    # Reset circuit breaker for timeout & hallucination checks
    monkeypatch.setattr(gemini_circuit_breaker, "state", CircuitState.CLOSED)

    # 4. Timeout falls back cleanly to deterministic copy
    async def slow_completion(req):
        await asyncio.sleep(1.2)
        return await fake_ok_completion(req)

    monkeypatch.setattr(GeminiConciergeService, "text_completion", slow_completion)
    timeout_res = await AIPersonalizationService.personalize_notification(
        event_type="system.campaign.broadcast",
        verified_facts=facts,
        confidence_tier="high",
        ai_config={
            "ai_enabled": True,
            "timeout_seconds": 0.05,
            "eligible_categories": ["marketing"],
        },
        category="marketing",
    )
    assert timeout_res.ai_used is False
    assert timeout_res.fallback_used is True
    assert timeout_res.ai_provider == "timeout_fallback"

    # 5. Factual hallucination (invented 75% discount) rejected by FactualValidator -> fallback
    async def hallucinating_completion(req):
        return AICompletionResponse(
            text='{"title":"Mega 75% Off Sylhet!","body":"Grab an exclusive 75% discount today for BDT 500 only.","cta":"Book Now","push_short_title":"75% Off!","push_short_body":"BDT 500 flash offer.","in_app_title":"75% Off","in_app_body":"Save 75%.","email_subject":"75% Off","sms_text":"75% off BDT 500"}',
            model="gemini-test",
            provider="gemini",
        )

    monkeypatch.setattr(GeminiConciergeService, "text_completion", hallucinating_completion)
    halluc_res = await AIPersonalizationService.personalize_notification(
        event_type="system.campaign.broadcast",
        verified_facts=facts,
        confidence_tier="high",
        ai_config={"ai_enabled": True, "eligible_categories": ["marketing"]},
        category="marketing",
    )
    assert halluc_res.ai_used is False
    assert halluc_res.fallback_used is True
    assert halluc_res.factual_validation_passed is False
    assert halluc_res.ai_provider == "validation_fallback"

    # 6. PII sanitizer & deep link guardrails
    sanitized = FactualValidator.sanitize_prompt_payload(
        {
            "destination": "Sylhet",
            "email": "secret@example.com",
            "phone": "+8801712345678",
            "nid": "19901234567890",
            "notes": "Contact me at +8801712345678 or secret@example.com",
        }
    )
    assert "email" not in sanitized and "phone" not in sanitized and "nid" not in sanitized
    assert "secret@example.com" not in sanitized.get("notes", "")
    assert FactualValidator.validate_deep_link("javascript:alert(1)")[0] is False
    assert FactualValidator.validate_deep_link("https://evil.example.com/phish")[0] is False
    assert FactualValidator.validate_deep_link("/(tabs)/bookings")[0] is True


# ============================================================================
# 3. Delivery Adapters: Mock, Invalid Tokens, E.164, XSS & Auto-Deactivation
# ============================================================================


@pytest.mark.asyncio
async def test_delivery_adapters_mock_and_invalid_tokens_and_xss(
    db_session: AsyncSession,
):
    # Push token validator & adapter
    assert is_valid_push_token("")[0] is False
    assert is_valid_push_token("short")[0] is False
    assert is_valid_push_token("has whitespace token")[0] is False
    assert is_valid_push_token("invalid_token")[0] is False
    assert is_valid_push_token("ExponentPushToken[]")[0] is False
    assert is_valid_push_token("ExponentPushToken[abc12345]")[0] is True
    assert is_valid_push_token("fcm-token-long-enough-123456")[0] is True

    mock_push = PushDeliveryAdapter(mock_mode=True)
    ok_push = await mock_push.deliver("ExponentPushToken[valid1234]", "Hello", "Trip updated")
    assert ok_push.success is True
    assert ok_push.status == "delivered"

    bad_push = await mock_push.deliver("invalid_token", "Hello", "Trip updated")
    assert bad_push.success is False
    assert bad_push.error_code == "INVALID_PUSH_TOKEN"

    # Auto-deactivate invalid/unregistered devices in DB via deliver_to_user_devices
    uid = uuid.uuid4()
    dev_good = NotificationDevice(
        user_id=uid,
        device_id="dev-good",
        push_token="ExponentPushToken[goodtoken123]",
        token_type="expo",
        platform="android",
        is_active=True,
    )
    dev_stale = NotificationDevice(
        user_id=uid,
        device_id="dev-stale",
        push_token="ExponentPushToken[stale123456]",
        token_type="expo",
        platform="ios",
        is_active=True,
    )
    db_session.add_all([dev_good, dev_stale])
    await db_session.commit()

    class DeviceNotRegistered(Exception):
        pass

    class _SelectivePushDriver:
        async def send(self, token: str, title: str, body: str, data: dict):
            if "stale123456" in token:
                raise DeviceNotRegistered("Device token expired")
            return "expo-ok-1"

    adapter = PushDeliveryAdapter(driver=_SelectivePushDriver(), mock_mode=False)
    dev_results = await adapter.deliver_to_user_devices(
        db_session,
        uid,
        "Gate Change",
        "Flight BG-147 boarding at Gate 4",
    )
    await db_session.commit()
    assert len(dev_results) == 2
    await db_session.refresh(dev_good)
    await db_session.refresh(dev_stale)
    assert dev_good.is_active is True
    assert dev_stale.is_active is False

    # Email adapter & XSS sanitization
    email_adapter = EmailDeliveryAdapter(mock_mode=True)
    ok_email = await email_adapter.deliver(
        "user@shopnojatra.com",
        "Booking Confirmed",
        "Enjoy your stay!",
        deep_link="/(tabs)/bookings",
        cta_label="View Booking",
    )
    assert ok_email.success is True

    bad_email = await email_adapter.deliver("not-an-email", "Hi", "Body")
    assert bad_email.success is False
    assert bad_email.error_code == "INVALID_EMAIL_ADDRESS"

    safe_html = render_safe_email_html(
        "<script>alert(1)</script>",
        "Line 1\n<img onerror=alert(2) src=x>",
        cta_label="Click",
        deep_link="javascript:alert(3)",
    )
    assert "<script>" not in safe_html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in safe_html
    assert "javascript:alert" not in safe_html

    # SMS adapter & BD E.164 normalization
    assert normalize_phone_e164("01712-345678") == "+8801712345678"
    assert normalize_phone_e164("8801812345678") == "+8801812345678"
    assert normalize_phone_e164("123") is None

    sms_adapter = SmsDeliveryAdapter(mock_mode=True)
    ok_sms = await sms_adapter.deliver("01712345678", "OTP", "Code: 445566")
    assert ok_sms.success is True
    assert ok_sms.recipient == "+8801712345678"

    bad_sms = await sms_adapter.deliver("99", "OTP", "Code")
    assert bad_sms.success is False
    assert bad_sms.error_code == "INVALID_PHONE_NUMBER"

    # In-App adapter
    in_app = InAppDeliveryAdapter(db=db_session, enable_websocket=False)
    ok_inapp = await in_app.deliver(str(uid), "In-App Title", "In-App Body")
    assert ok_inapp.success is True
    assert (await InAppDeliveryAdapter(db=None).deliver(str(uid), "T", "B")).error_code == "DB_SESSION_REQUIRED"
    assert (await in_app.deliver("not-a-uuid", "T", "B")).error_code == "INVALID_USER_ID"


# ============================================================================
# 4. Outbox Worker: Polling, Deduplication, Reschedule, Backoff & DLQ
# ============================================================================


@pytest.mark.asyncio
async def test_worker_outbox_polling_dedup_reschedule_backoff_dlq_and_empty_address(
    db_session: AsyncSession,
):
    # Backoff + jitter helper bounds
    d1 = compute_retry_delay_seconds(1, jitter_max=3.0)
    d2 = compute_retry_delay_seconds(4, jitter_max=3.0)
    d_cap = compute_retry_delay_seconds(20, jitter_max=2.0)
    assert 10.0 <= d1 <= 13.0
    assert 80.0 <= d2 <= 83.0
    assert 3600.0 <= d_cap <= 3602.0

    # 1. Event ID deduplication on repeat publish & worker replay
    uid = uuid.uuid4()
    event = BookingConfirmedEvent(
        aggregate_id="bk-dedup-1",
        payload={
            "user_id": str(uid),
            "booking_reference": "SJ-DEDUP-1",
            "amount_bdt": 5000,
        },
    )
    outbox1 = await OutboxPublisher.publish(db_session, event, idempotency_key="dedup-key-1")
    dup_entry, created_second = await OutboxPublisher.publish_idempotent(
        db_session, event, idempotency_key="dedup-key-1"
    )
    assert created_second is False
    assert dup_entry.id == outbox1.id
    await db_session.commit()

    worker = OutboxWorkerProcessor(mock_mode=True, batch_size=20, jitter_max_seconds=0.5)
    poll_time = datetime.now(timezone.utc) + timedelta(seconds=1)
    summary1 = await worker.process_batch(db_session, now_utc=poll_time)
    assert summary1.delivered_count >= 1
    await db_session.refresh(outbox1)
    assert outbox1.status == "delivered"

    # Re-stage same outbox row as pending (simulating duplicate delivery attempt for same event_id)
    outbox1.status = "pending"
    await db_session.commit()
    summary_dup = await worker.process_batch(db_session, now_utc=poll_time + timedelta(seconds=1))
    assert summary_dup.skipped_duplicate_count == 1
    await db_session.refresh(outbox1)
    assert outbox1.status == "delivered"

    # Only one in-app Notification row created for the same event_id
    notif_count = await db_session.scalar(
        select(func.count(Notification.id)).where(Notification.user_id == uid)
    )
    assert int(notif_count or 0) == 1

    # 2. Quiet-hours reschedule moves outbox entry to future wake time without failing
    quiet_uid = uuid.uuid4()
    db_session.add(
        NotificationUserPreference(
            user_id=quiet_uid,
            push_enabled=True,
            in_app_enabled=True,
            quiet_hours_enabled=True,
            quiet_hours_start="22:00",
            quiet_hours_end="07:00",
            timezone="Asia/Dhaka",
        )
    )
    await db_session.flush()
    quiet_now_utc = datetime(2026, 5, 10, 17, 30, tzinfo=timezone.utc)  # 23:30 Asia/Dhaka
    promo_evt = DomainEvent(
        event_type="marketing.promo.flash_sale",
        aggregate_type="campaign",
        aggregate_id="cmp-qh-1",
        priority=5,
        payload={"user_id": str(quiet_uid), "destination": "Sylhet"},
    )
    promo_row = await OutboxPublisher.publish(db_session, promo_evt, scheduled_at=quiet_now_utc)
    await db_session.commit()
    s_qh = await worker.process_batch(db_session, now_utc=quiet_now_utc)
    assert s_qh.rescheduled_count >= 1
    await db_session.refresh(promo_row)
    assert promo_row.status == "pending"
    sched = promo_row.scheduled_at
    if sched.tzinfo is None:
        sched = sched.replace(tzinfo=timezone.utc)
    assert sched > quiet_now_utc

    # 3. Direct email failing with explicit empty address -> retries -> DLQ quarantine
    # Also prevents recursive self-quarantine on SystemDlqMessageQuarantinedEvent
    bad_direct_evt = DomainEvent(
        event_type="security.auth.password_changed",
        aggregate_type="user",
        aggregate_id="direct-bad-1",
        priority=9,
        payload={"channel": "email", "recipient_email": ""},
    )
    bad_row = await OutboxPublisher.publish(db_session, bad_direct_evt)
    bad_row.max_attempts = 2
    await db_session.commit()

    # Attempt 1 -> failed + scheduled retry
    await worker.process_batch(db_session, now_utc=datetime.now(timezone.utc) + timedelta(seconds=5))
    await db_session.refresh(bad_row)
    assert bad_row.status == "failed"
    assert bad_row.attempts == 1
    assert bad_row.next_retry_at is not None

    # Force next_retry_at due and run Attempt 2 -> dead_letter + DLQ record + 1 SystemDlqMessageQuarantinedEvent
    bad_row.next_retry_at = datetime.now(timezone.utc) - timedelta(seconds=5)
    await db_session.commit()

    s_fail2 = await worker.process_batch(db_session, now_utc=datetime.now(timezone.utc))
    assert s_fail2.quarantined_count >= 1
    await db_session.refresh(bad_row)
    assert bad_row.status == "dead_letter"

    dlq_rows = list((await db_session.scalars(select(NotificationDLQ))).all())
    assert len(dlq_rows) == 1
    assert dlq_rows[0].outbox_id == bad_row.id

    quarantine_outbox = await db_session.scalar(
        select(NotificationOutbox).where(
            NotificationOutbox.event_type == "system.dlq.message_quarantined"
        )
    )
    assert quarantine_outbox is not None

    # Quarantine a SystemDlqMessageQuarantinedEvent directly -> must NOT spawn another quarantine event
    await DLQManager.quarantine_outbox_entry(
        db_session,
        quarantine_outbox,
        failure_reason="Simulated DLQ alert sink down",
        channel="webhook",
    )
    await db_session.commit()
    q_count = await db_session.scalar(
        select(func.count(NotificationOutbox.id)).where(
            NotificationOutbox.event_type == "system.dlq.message_quarantined"
        )
    )
    assert int(q_count or 0) == 1


# ============================================================================
# 5. FastAPI RBAC & Tenant-Scoped Portal Endpoints
# ============================================================================


@pytest.mark.asyncio
async def test_notifications_rbac_unauth_non_admin_and_portal_tenant_isolation(
    client: AsyncClient, db_session: AsyncSession
):
    # 1. Unauthenticated requests -> 401
    for url in (
        "/api/v1/notifications",
        "/api/v1/notifications/portal?portal_type=consumer",
        "/api/v1/notifications/preferences",
        "/api/v1/notifications/devices",
        "/api/v1/notifications/admin/events",
        "/api/v1/notifications/admin/rules",
        "/api/v1/notifications/admin/templates",
        "/api/v1/notifications/admin/campaigns",
        "/api/v1/notifications/admin/delivery-logs",
        "/api/v1/notifications/admin/analytics/funnel",
        "/api/v1/notifications/admin/providers/health",
        "/api/v1/notifications/admin/live-ops",
        "/api/v1/notifications/admin/ai/config",
    ):
        resp = await client.get(url)
        assert resp.status_code == 401, f"Expected 401 on {url}, got {resp.status_code}"

    # 2. Non-admin standard user -> 403 across all admin endpoints
    user_id, user_headers = _make_user_headers()
    for method, url, json_body in (
        ("GET", "/api/v1/notifications/admin/events", None),
        ("GET", "/api/v1/notifications/admin/events/booking.confirmed", None),
        ("POST", "/api/v1/notifications/admin/events/booking.confirmed/dry-run", {}),
        ("GET", "/api/v1/notifications/admin/rules", None),
        ("POST", "/api/v1/notifications/admin/rules/dry-run", {}),
        ("GET", "/api/v1/notifications/admin/templates", None),
        ("POST", "/api/v1/notifications/admin/templates/preview", {"title_template": "Hi", "body_template": "Body"}),
        ("POST", "/api/v1/notifications/admin/broadcast/preview-audience", {"target_audience": "all"}),
        ("GET", "/api/v1/notifications/admin/campaigns", None),
        ("GET", "/api/v1/notifications/admin/delivery-logs", None),
        ("GET", "/api/v1/notifications/admin/analytics/funnel", None),
        ("GET", "/api/v1/notifications/admin/providers/health", None),
        ("GET", "/api/v1/notifications/admin/live-ops", None),
        ("GET", "/api/v1/notifications/admin/ai/config", None),
        ("PUT", "/api/v1/notifications/admin/ai/config", {"ai_enabled": False}),
        ("POST", "/api/v1/notifications/admin/ai/copilot", {"goal": "Sylhet weekend campaign"}),
    ):
        resp = await client.request(method, url, json=json_body, headers=user_headers)
        assert resp.status_code == 403, f"Expected 403 on {method} {url}, got {resp.status_code}"

    # 3. Tenant-scoped portal filtering (agency / hotel / cross-tenant 403)
    agency_uid, agency_id, agency_headers = await _make_agency_headers(db_session)
    hotel_uid, hotel_id, hotel_headers = await _make_hotel_headers(db_session)
    other_tenant_id = uuid.uuid4()

    db_session.add_all(
        [
            Notification(
                user_id=agency_uid,
                type="agency",
                title="Agency Payout Settled",
                message="Your payout was processed.",
                data={"portal_type": "agency", "tenant_id": str(agency_id)},
            ),
            Notification(
                user_id=hotel_uid,
                type="hotel",
                title="New Hotel Check-in",
                message="Guest arriving at 2 PM.",
                data={"portal_type": "hotel", "tenant_id": str(hotel_id)},
            ),
            Notification(
                user_id=user_id,
                type="booking",
                title="Consumer Trip Ready",
                message="Pack your bags.",
                data={"portal_type": "consumer"},
            ),
        ]
    )
    await db_session.commit()

    ag_ok = await client.get(
        f"/api/v1/notifications/portal?portal_type=agency&tenant_id={agency_id}",
        headers=agency_headers,
    )
    assert ag_ok.status_code == 200
    assert ag_ok.json()["total"] == 1
    assert ag_ok.json()["items"][0]["title"] == "Agency Payout Settled"

    # Cross-tenant agency access & cross-portal access denied
    assert (
        await client.get(
            f"/api/v1/notifications/portal?portal_type=agency&tenant_id={other_tenant_id}",
            headers=agency_headers,
        )
    ).status_code == 403
    assert (
        await client.get(
            "/api/v1/notifications/portal?portal_type=hotel",
            headers=agency_headers,
        )
    ).status_code == 403
    assert (
        await client.get(
            "/api/v1/notifications/portal?portal_type=agency",
            headers=user_headers,
        )
    ).status_code == 403

    ht_ok = await client.get(
        "/api/v1/notifications/portal?portal_type=hotel",
        headers=hotel_headers,
    )
    assert ht_ok.status_code == 200
    assert ht_ok.json()["total"] == 1
    assert ht_ok.json()["items"][0]["title"] == "New Hotel Check-in"


# ============================================================================
# 6. User Preferences, Device Registry & /why 404 Handling
# ============================================================================


@pytest.mark.asyncio
async def test_user_preferences_devices_and_why_not_found(
    client: AsyncClient, db_session: AsyncSession
):
    uid, headers = _make_user_headers()

    # Preferences GET & PUT
    pref_get = await client.get("/api/v1/notifications/preferences", headers=headers)
    assert pref_get.status_code == 200
    assert pref_get.json()["notification_preferences"]["push_enabled"] is True

    pref_put = await client.put(
        "/api/v1/notifications/preferences",
        json={
            "email_enabled": False,
            "quiet_hours_enabled": True,
            "quiet_hours_start": "23:00",
            "quiet_hours_end": "06:30",
            "frequency_cap_marketing_per_day": 1,
        },
        headers=headers,
    )
    assert pref_put.status_code == 200
    notif_prefs = pref_put.json()["notification_preferences"]
    assert notif_prefs["email_enabled"] is False
    assert notif_prefs["quiet_hours_enabled"] is True
    assert notif_prefs["frequency_cap_marketing_per_day"] == 1

    # Devices POST validation + dedup + GET + DELETE
    bad_dev = await client.post(
        "/api/v1/notifications/devices",
        json={
            "device_id": "phone-1",
            "push_token": "ExponentPushToken[]",
            "token_type": "expo",
            "platform": "android",
        },
        headers=headers,
    )
    assert bad_dev.status_code == 422

    reg1 = await client.post(
        "/api/v1/notifications/devices",
        json={
            "device_id": "phone-1",
            "push_token": "ExponentPushToken[abc987654]",
            "token_type": "expo",
            "platform": "android",
            "device_name": "Pixel 8",
        },
        headers=headers,
    )
    assert reg1.status_code == 201
    assert reg1.json()["is_active"] is True

    # Registering same token with updated device_id updates cleanly (no IntegrityError)
    reg2 = await client.post(
        "/api/v1/notifications/devices",
        json={
            "device_id": "phone-1-reinstalled",
            "push_token": "ExponentPushToken[abc987654]",
            "token_type": "expo",
            "platform": "android",
        },
        headers=headers,
    )
    assert reg2.status_code == 201

    list_dev = await client.get("/api/v1/notifications/devices", headers=headers)
    assert list_dev.status_code == 200
    assert list_dev.json()["total"] == 1

    del_dev = await client.delete(
        "/api/v1/notifications/devices/phone-1-reinstalled",
        headers=headers,
    )
    assert del_dev.status_code == 200
    assert del_dev.json()["is_active"] is False

    list_active = await client.get("/api/v1/notifications/devices?active_only=true", headers=headers)
    assert list_active.json()["total"] == 0

    # /why returns 404 when missing or owned by another user
    missing_why = await client.get(f"/api/v1/notifications/{uuid.uuid4()}/why", headers=headers)
    assert missing_why.status_code == 404

    other_uid, _ = _make_user_headers(email="other@shopnojatra.com")
    other_notif = Notification(
        user_id=other_uid,
        type="booking",
        title="Other User Booking",
        message="Private",
    )
    db_session.add(other_notif)
    await db_session.commit()
    assert (
        await client.get(f"/api/v1/notifications/{other_notif.id}/why", headers=headers)
    ).status_code == 404


# ============================================================================
# 7. Admin Event Catalog, Rules CRUD + Dry-Run, Templates CRUD + Preview
# ============================================================================


@pytest.mark.asyncio
async def test_admin_event_catalog_rules_and_templates_endpoints(
    client: AsyncClient, db_session: AsyncSession
):
    _, admin_headers = await _make_admin_headers(db_session)

    # Event Catalog listing, single inspection, and dry-run
    ev_list = await client.get("/api/v1/notifications/admin/events", headers=admin_headers)
    assert ev_list.status_code == 200
    assert ev_list.json()["total"] == len(EVENT_REGISTRY) == 34

    ev_one = await client.get(
        "/api/v1/notifications/admin/events/booking.confirmed", headers=admin_headers
    )
    assert ev_one.status_code == 200
    assert ev_one.json()["is_critical"] is True

    ev_missing = await client.get(
        "/api/v1/notifications/admin/events/nonexistent.event", headers=admin_headers
    )
    assert ev_missing.status_code == 404

    ev_dry = await client.post(
        "/api/v1/notifications/admin/events/booking.confirmed/dry-run",
        json={
            "payload": {"destination": "Cox's Bazar", "booking_reference": "SJ-555"},
            "simulated_local_time": "23:45",
        },
        headers=admin_headers,
    )
    assert ev_dry.status_code == 200
    assert ev_dry.json()["dry_run"] is True
    assert ev_dry.json()["dispatched"] is False
    assert ev_dry.json()["bypass_quiet_hours"] is True

    # Templates CRUD + XSS / {{var}} validation + EN/BN Preview
    bad_tmpl = await client.post(
        "/api/v1/notifications/admin/templates",
        json={
            "code": "bad_xss_tmpl",
            "name": "Bad XSS Template",
            "category": "marketing",
            "channels": ["email"],
            "title_template": "Hi {{user_name}}",
            "body_template": "Offer details",
            "email_html_template": "<script>alert(1)</script><p>{{user_name}}</p>",
        },
        headers=admin_headers,
    )
    assert bad_tmpl.status_code in (400, 422)

    tmpl_create = await client.post(
        "/api/v1/notifications/admin/templates",
        json={
            "code": "sylhet_flash_sale",
            "name": "Sylhet Flash Sale",
            "category": "marketing",
            "channels": ["push", "in_app", "email", "sms"],
            "title_template": "{{discount_pct}}% off {{destination}}!",
            "title_template_bn": "{{destination}} ভ্রমণে {{discount_pct}}% ছাড়!",
            "body_template": "Book {{destination}} starting at BDT {{price_bdt}}.",
            "body_template_bn": "{{destination}} প্যাকেজ মাত্র {{price_bdt}} টাকায়।",
            "sms_template": "ShopnoJatra: {{destination}} {{discount_pct}}% off (BDT {{price_bdt}})",
            "variables": ["destination", "discount_pct", "price_bdt"],
            "strict_variables": True,
        },
        headers=admin_headers,
    )
    assert tmpl_create.status_code == 201
    tmpl_id = tmpl_create.json()["id"]
    assert tmpl_create.json()["version"] == 1

    tmpl_patch = await client.patch(
        f"/api/v1/notifications/admin/templates/{tmpl_id}",
        json={"name": "Sylhet Flash Sale v2"},
        headers=admin_headers,
    )
    assert tmpl_patch.status_code == 200
    assert tmpl_patch.json()["version"] == 2

    # Preview with missing variable flagged cleanly
    preview_missing = await client.post(
        f"/api/v1/notifications/admin/templates/{tmpl_id}/preview",
        json={"variables": {"destination": "Sylhet", "discount_pct": 15}},
        headers=admin_headers,
    )
    assert preview_missing.status_code == 200
    assert preview_missing.json()["preview_only"] is True
    assert "price_bdt" in preview_missing.json()["missing_variables"]

    preview_ok = await client.post(
        "/api/v1/notifications/admin/templates/preview",
        json={
            "template_id": tmpl_id,
            "variables": {"destination": "Sylhet", "discount_pct": 15, "price_bdt": 6500},
            "cta_label": "Explore",
            "deep_link": "/(tabs)/explore",
        },
        headers=admin_headers,
    )
    assert preview_ok.status_code == 200
    p_data = preview_ok.json()
    assert p_data["valid"] is True
    assert p_data["rendered_en"]["title"] == "15% off Sylhet!"
    assert "Sylhet" in p_data["rendered_bn"]["body"]

    # Rules CRUD + Dry-Run
    bad_rule = await client.post(
        "/api/v1/notifications/admin/rules",
        json={
            "name": "Invalid Op Rule",
            "trigger_event": "marketing.promo.flash_sale",
            "channels": ["push"],
            "conditions": {"field": "amount", "op": "exec", "value": "1"},
        },
        headers=admin_headers,
    )
    assert bad_rule.status_code == 422

    rule_create = await client.post(
        "/api/v1/notifications/admin/rules",
        json={
            "name": "VIP Promo Rule",
            "trigger_event": "marketing.promo.flash_sale",
            "channels": ["push", "email"],
            "template_id": tmpl_id,
            "conditions": {"field": "discount_pct", "op": "gte", "value": 15},
            "priority": "high",
            "bypass_quiet_hours": False,
            "cooldown_seconds": 300,
        },
        headers=admin_headers,
    )
    assert rule_create.status_code == 201
    rule_id = rule_create.json()["id"]

    rule_dry = await client.post(
        "/api/v1/notifications/admin/rules/dry-run",
        json={
            "event_type": "marketing.promo.flash_sale",
            "aggregate_type": "campaign",
            "aggregate_id": "c-1",
            "rule_id": rule_id,
            "payload": {"discount_pct": 20},
            "simulated_local_time": "23:15",
            "preferences_override": {"quiet_hours_enabled": True},
        },
        headers=admin_headers,
    )
    assert rule_dry.status_code == 200
    dry_json = rule_dry.json()
    assert dry_json["dry_run"] is True
    assert dry_json["dispatched"] is False
    assert dry_json["condition_matched"] is True
    assert dry_json["should_dispatch_now"] is False
    assert rule_id in dry_json["matched_rule_ids"]

    # Delete rule & template cleanly
    assert (
        await client.delete(f"/api/v1/notifications/admin/rules/{rule_id}", headers=admin_headers)
    ).status_code == 200
    assert (
        await client.delete(f"/api/v1/notifications/admin/templates/{tmpl_id}", headers=admin_headers)
    ).status_code == 200


# ============================================================================
# 8. Admin Campaigns, Delivery Logs (PII Masked), Analytics Funnel, Health,
#    Live Ops, AI Config Toggle & AI Copilot
# ============================================================================


@pytest.mark.asyncio
async def test_admin_campaigns_delivery_logs_analytics_health_liveops_and_ai(
    client: AsyncClient, db_session: AsyncSession
):
    _, admin_headers = await _make_admin_headers(db_session)
    uid, _ = _make_user_headers(email="masked-target@shopnojatra.com")

    # Seed device + preference + outbox + delivery + analytics + notification for telemetry tests
    db_session.add(NotificationUserPreference(user_id=uid, push_enabled=True, email_enabled=True))
    db_session.add(
        NotificationDevice(
            user_id=uid,
            device_id="telemetry-dev",
            push_token="ExponentPushToken[telemetry12345]",
            token_type="expo",
            platform="android",
            is_active=True,
        )
    )
    failed_outbox = NotificationOutbox(
        event_id=uuid.uuid4(),
        event_type="booking.confirmed",
        aggregate_type="booking",
        aggregate_id="bk-retry-1",
        payload={"user_id": str(uid), "booking_reference": "SJ-RETRY-1"},
        headers={},
        status="failed",
        attempts=2,
        max_attempts=5,
        error_message="Transient gateway timeout",
    )
    db_session.add(failed_outbox)
    await db_session.flush()

    deliv_email = NotificationDelivery(
        outbox_id=failed_outbox.id,
        event_id=failed_outbox.event_id,
        user_id=uid,
        channel="email",
        recipient_address="sensitive.traveler@example.com",
        title="Booking Confirmed",
        body="Your booking SJ-RETRY-1 is confirmed.",
        provider="smtp",
        status="delivered",
        attempts=1,
        latency_ms=42,
        sent_at=datetime.now(timezone.utc),
        delivered_at=datetime.now(timezone.utc),
    )
    deliv_sms = NotificationDelivery(
        outbox_id=failed_outbox.id,
        event_id=failed_outbox.event_id,
        user_id=uid,
        channel="sms",
        recipient_address="+8801712345678",
        title="OTP",
        body="Your verification code is 123456.",
        provider="sms_gateway",
        status="failed",
        attempts=1,
        latency_ms=88,
        error_code="TIMEOUT",
    )
    db_session.add_all([deliv_email, deliv_sms])
    db_session.add(
        NotificationAnalytics(
            metric_date=datetime.now(timezone.utc).date(),
            channel="email",
            event_type="booking.confirmed",
            total_sent=10,
            total_delivered=9,
            total_failed=1,
            total_opened=6,
            total_clicked=3,
            avg_latency_ms=50,
        )
    )
    await db_session.commit()

    # 1. Broadcast audience preview
    aud = await client.post(
        "/api/v1/notifications/admin/broadcast/preview-audience",
        json={"target_user_ids": [str(uid)], "category": "marketing", "channel": "push"},
        headers=admin_headers,
    )
    assert aud.status_code == 200
    assert aud.json()["preview_only"] is True
    assert aud.json()["total_candidates"] >= 1
    assert aud.json()["reachable_push_devices"] >= 1

    # 2. Campaigns CRUD + timezone validation + pause/resume/cancel
    bad_tz = await client.post(
        "/api/v1/notifications/admin/campaigns",
        json={
            "title": "Bad TZ Campaign",
            "channel": "push",
            "scheduled_for": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
            "timezone": "Invalid/Mars_Timezone",
        },
        headers=admin_headers,
    )
    assert bad_tz.status_code in (400, 422)

    camp_resp = await client.post(
        "/api/v1/notifications/admin/campaigns",
        json={
            "title": "Eid Cox's Bazar Promo",
            "description": "Early bird offers",
            "channel": "all",
            "target_audience": {"segment_key": "beach_lovers"},
            "scheduled_for": (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat(),
            "timezone": "Asia/Dhaka",
            "deep_link": "/(tabs)/explore",
        },
        headers=admin_headers,
    )
    assert camp_resp.status_code == 201
    camp_id = camp_resp.json()["id"]
    assert camp_resp.json()["status"] == "scheduled"

    assert (
        await client.post(
            f"/api/v1/notifications/admin/campaigns/{camp_id}/pause", headers=admin_headers
        )
    ).json()["status"] == "paused"
    assert (
        await client.post(
            f"/api/v1/notifications/admin/campaigns/{camp_id}/resume", headers=admin_headers
        )
    ).json()["status"] == "scheduled"
    assert (
        await client.post(
            f"/api/v1/notifications/admin/campaigns/{camp_id}/cancel", headers=admin_headers
        )
    ).json()["status"] == "cancelled"

    # 3. Delivery logs with PII masking & filtering
    logs_resp = await client.get(
        "/api/v1/notifications/admin/delivery-logs?channel=email",
        headers=admin_headers,
    )
    assert logs_resp.status_code == 200
    logs_data = logs_resp.json()
    assert logs_data["total"] == 1
    item = logs_data["items"][0]
    assert "sensitive.traveler@example.com" not in item["recipient_address"]
    assert "sensitive.traveler@example.com" not in item["recipient_masked"]
    assert "@example.com" in item["recipient_masked"]

    # 4. Outbox retry action resets status to pending (preserves attempts below max_attempts)
    retry_resp = await client.post(
        f"/api/v1/notifications/admin/outbox/{failed_outbox.id}/retry",
        headers=admin_headers,
    )
    assert retry_resp.status_code == 200
    assert retry_resp.json()["status"] == "pending"
    assert retry_resp.json()["attempts"] == 2

    # 5. Analytics funnel, Provider Health & Live Ops
    funnel_resp = await client.get(
        "/api/v1/notifications/admin/analytics/funnel?window_days=30",
        headers=admin_headers,
    )
    assert funnel_resp.status_code == 200
    funnel_data = funnel_resp.json()
    assert set(["queued", "accepted", "delivered", "read", "clicked", "converted"]).issubset(
        funnel_data["funnel"].keys()
    )

    health_resp = await client.get(
        "/api/v1/notifications/admin/providers/health",
        headers=admin_headers,
    )
    assert health_resp.status_code == 200
    channels = {p["channel"] for p in health_resp.json()["providers"]}
    assert {"push", "in_app", "email", "sms"}.issubset(channels)

    live_ops = await client.get("/api/v1/notifications/admin/live-ops", headers=admin_headers)
    assert live_ops.status_code == 200
    assert "queue_counts" in live_ops.json()

    # 6. Global AI Config toggle + AI Copilot preview-only draft (writes 0 notifications)
    before_notifs = int((await db_session.scalar(select(func.count(Notification.id)))) or 0)
    ai_off = await client.put(
        "/api/v1/notifications/admin/ai/config",
        json={"ai_enabled": False, "change_notes": "Emergency deterministic mode"},
        headers=admin_headers,
    )
    assert ai_off.status_code == 200
    assert ai_off.json()["ai_config"]["ai_enabled"] is False

    ai_get = await client.get("/api/v1/notifications/admin/ai/config", headers=admin_headers)
    assert ai_get.status_code == 200
    assert ai_get.json()["ai_config"]["ai_enabled"] is False

    copilot = await client.post(
        "/api/v1/notifications/admin/ai/copilot",
        json={
            "goal": "Promote winter tea-garden stays in Sylhet with 15% discount",
            "category": "marketing",
            "destination": "Sylhet",
            "verified_facts": {"discount_pct": 15, "price_bdt": 5500},
            "deep_link": "/(tabs)/explore?destination=Sylhet",
        },
        headers=admin_headers,
    )
    assert copilot.status_code == 200
    c_json = copilot.json()
    assert c_json["preview_only"] is True
    assert c_json["dispatched"] is False
    assert c_json["ai_used"] is False
    assert "title" in c_json["draft_en"] and "title" in c_json["draft_bn"]
    after_notifs = int((await db_session.scalar(select(func.count(Notification.id)))) or 0)
    assert after_notifs == before_notifs
