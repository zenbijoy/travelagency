"""
Comprehensive Unit & Integration Tests for the 24-Step Decision Pipeline,
Relevance Scoring, Fatigue, Adaptive Timing, Channel Selection, AI Guardrails,
Factual/Deep-Link Validation, Anti-Feedback-Loop, A/B Experiments, and Outbox Worker.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import json
import math
from types import SimpleNamespace
import uuid
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.circuit_breaker import CircuitState, gemini_circuit_breaker
from app.core.config import settings
from app.models.notification import (
    Notification,
    NotificationDLQ,
    NotificationDelivery,
    NotificationOutbox,
    NotificationUserPreference,
)
from app.models.personalization import (
    PersonalizationDecisionLog,
    PersonalizationRuleConfig,
    UserNotificationFatigue,
)
from app.notifications.ai.factual_validator import FactualValidator
from app.notifications.ai.service import AIPersonalizationService
from app.notifications.delivery import build_default_adapters
from app.notifications.dlq.manager import DLQManager
from app.notifications.events.booking import BookingConfirmedEvent, PaymentFailedEvent
from app.notifications.events.security import OtpRequestedEvent
from app.notifications.events.travel_product import TravelDisruptionDetectedEvent
from app.notifications.outbox.publisher import OutboxPublisher
from app.notifications.personalization.channel_selector import ChannelSelector
from app.notifications.personalization.decision_pipeline import (
    DecisionPipelineInput,
    NotificationDecisionPipeline,
)
from app.notifications.personalization.dimensions import (
    DimensionValue,
    UserProfile20DSnapshot,
    build_empty_dimensions_map,
)
from app.notifications.personalization.experiments import ExperimentEngine
from app.notifications.personalization.fatigue import FatigueConfig, FatigueEngine
from app.notifications.personalization.profile_service import UserProfileService
from app.notifications.personalization.relevance import (
    DEFAULT_RELEVANCE_WEIGHTS,
    NotificationCandidate,
    RelevanceEngine,
    validate_relevance_weights,
)
from app.notifications.personalization.timing import AdaptiveTimingConfig, AdaptiveTimingEngine
from app.notifications.worker.processor import OutboxWorkerProcessor, compute_retry_delay_seconds
from app.schemas.ai import AICompletionResponse
from app.services.gemini_service import GeminiConciergeService


def _make_snapshot(
    user_id: uuid.UUID,
    *,
    dest: str = "Sylhet",
    dest_score: float = 85.0,
    budget_tier: str = "mid_range",
    styles: list[str] | None = None,
    transport: str = "train",
    preferred_window: str = "morning",
    language: str = "en",
    confidence: float = 85.0,
    personalization_enabled: bool = True,
) -> UserProfile20DSnapshot:
    now = datetime.now(timezone.utc)
    dims = build_empty_dimensions_map(personalization_enabled=personalization_enabled)
    for k, val in (
        ("destination_interest", {"top_destination": dest, "explicit_favorites": [dest]}),
        ("budget_profile", {"tier": budget_tier}),
        ("travel_style", {"styles": styles or ["family", "nature"]}),
        ("transport_preference", {"preferred_modes": [transport], "primary_mode": transport}),
        ("time_preference", {"preferred_send_window": preferred_window}),
        ("travel_timeline", {"stage": "searching_for_trip"}),
        ("price_sensitivity", {"level": "medium", "score": 55.0}),
    ):
        dims[k] = DimensionValue(
            dimension_key=k,
            value=val,
            confidence=confidence,
            source="user_preference",
            updated_at=now,
            data_quality="high" if confidence >= 75 else "low",
            is_user_provided=True,
            permission_granted=True,
        )
    return UserProfile20DSnapshot(
        user_id=user_id,
        personalization_enabled=personalization_enabled,
        dimensions=dims,
        destination_interests={
            dest: {
                "score": dest_score,
                "confidence": confidence,
                "signal_count": 5,
                "search_count": 3,
                "booking_count": 1,
                "is_explicit_favorite": True,
            }
        },
        explicit_preferences={"favorite_destinations": [dest], "travel_styles": styles or ["family"]},
        preferred_language=language,
        overall_confidence=confidence,
        travel_timeline_stage="searching_for_trip",
        activity_level="active",
        built_at=now,
    )


# ============================================================================
# 1. RELEVANCE SCORING, SEPARATE CONFIDENCE, WEIGHT VALIDATION & VERSIONING
# ============================================================================


@pytest.mark.asyncio
async def test_10_feature_relevance_separate_confidence_and_rule_rollback(
    db_session: AsyncSession,
):
    uid = uuid.uuid4()
    now = datetime(2026, 11, 25, 4, 0, tzinfo=timezone.utc)  # 10:00 Asia/Dhaka (morning)

    rich_snap = _make_snapshot(uid, dest="Sylhet", budget_tier="mid_range", styles=["family"], transport="train")
    cand = NotificationCandidate(
        event_type="automation.destination_discovery",
        category="marketing",
        destination="Sylhet",
        budget_tier="mid_range",
        travel_styles=["family"],
        transport_mode="train",
        priority=3,
    )
    res_match = RelevanceEngine.evaluate(rich_snap, cand, now=now)
    assert set(res_match.feature_breakdown.keys()) == set(DEFAULT_RELEVANCE_WEIGHTS.keys())
    assert len(res_match.feature_breakdown) == 10
    assert res_match.relevance_score >= 70.0
    assert res_match.confidence_score > 70.0
    assert res_match.recommended_tier == "deep"
    assert res_match.permission_to_send_implied is False
    assert res_match.matching_factors

    # Separate confidence check: sparse single-signal snapshot stays low confidence
    sparse_dims = build_empty_dimensions_map()
    sparse_dims["destination_interest"] = DimensionValue(
        dimension_key="destination_interest",
        value={"top_destination": "Sylhet"},
        confidence=20.0,
        source="behavioral",
        updated_at=now,
        data_quality="low",
        is_user_provided=False,
        permission_granted=True,
    )
    sparse_snap = UserProfile20DSnapshot(
        user_id=uuid.uuid4(),
        dimensions=sparse_dims,
        destination_interests={"Sylhet": {"score": 18.0, "confidence": 20.0, "signal_count": 1}},
        overall_confidence=18.0,
    )
    res_sparse = RelevanceEngine.evaluate(sparse_snap, cand, now=now)
    assert res_sparse.confidence_score < 35.0
    assert res_sparse.recommended_tier == "generic"

    # Weight validation rejects sum != 1.0 or negative weights
    bad_weights = {**DEFAULT_RELEVANCE_WEIGHTS, "DestinationInterest": 0.90}
    with pytest.raises(ValueError):
        validate_relevance_weights(bad_weights)
    neg_weights = {**DEFAULT_RELEVANCE_WEIGHTS, "DestinationInterest": -0.10}
    with pytest.raises(ValueError):
        validate_relevance_weights(neg_weights)

    # Versioned rule publish & rollback
    r1 = await RelevanceEngine.publish_rule_config(
        db_session, weights=DEFAULT_RELEVANCE_WEIGHTS, change_notes="v1 baseline"
    )
    custom_weights = {**DEFAULT_RELEVANCE_WEIGHTS, "DestinationInterest": 0.25, "TravelIntent": 0.10}
    r2 = await RelevanceEngine.publish_rule_config(
        db_session, weights=custom_weights, change_notes="v2 boosted dest"
    )
    assert r2.version == r1.version + 1
    assert (await RelevanceEngine.get_active_rule_config(db_session))["version"] == r2.version

    prev_ver, rolled = await RelevanceEngine.rollback_rule_config(db_session, r1.version)
    assert prev_ver == r2.version
    assert rolled.version == r1.version
    assert (await RelevanceEngine.get_active_rule_config(db_session))["version"] == r1.version


# ============================================================================
# 2. FATIGUE, FREQUENCY CAPS, QUIET HOURS & CRITICAL NON-SUPPRESSION
# ============================================================================


@pytest.mark.asyncio
async def test_fatigue_caps_quiet_hours_and_critical_transactional_non_suppression(
    db_session: AsyncSession,
):
    uid = uuid.uuid4()
    # Quiet hour in Asia/Dhaka (UTC+6): 17:30 UTC == 23:30 Dhaka time!
    quiet_utc = datetime(2026, 11, 25, 17, 30, tzinfo=timezone.utc)
    day_utc = datetime(2026, 11, 25, 5, 0, tzinfo=timezone.utc)  # 11:00 Dhaka time

    await UserProfileService.update_explicit_preferences(
        db_session,
        uid,
        {
            "favorite_destinations": ["Sylhet"],
            "travel_styles": ["family"],
            "budget_tier": "mid_range",
            "quiet_hours_enabled": True,
            "quiet_hours_start": "22:00",
            "quiet_hours_end": "07:00",
            "timezone": "Asia/Dhaka",
            "frequency_cap_marketing_per_day": 1,
        },
        now=day_utc,
    )

    pipeline = NotificationDecisionPipeline(mock_mode=True)

    # 1. Promotional notification during quiet hours -> scheduled (deferred, not blasted at night)
    promo_req = DecisionPipelineInput(
        event_type="system.campaign.broadcast",
        category="marketing",
        title="Explore Sylhet",
        body="Explore seasonal travel opportunities in Sylhet.",
        destination="Sylhet",
        priority=3,
    )
    res_quiet = await pipeline.evaluate_recipient(db_session, uid, promo_req, now_utc=quiet_utc)
    assert res_quiet.eligibility_passed is True
    assert res_quiet.action == "schedule"
    assert res_quiet.scheduled_for is not None
    assert res_quiet.scheduled_for > quiet_utc

    # 2. Simulate high fatigue + daily cap reached -> marketing suppressed
    db_session.add(
        UserNotificationFatigue(
            user_id=uid,
            category="marketing",
            fatigue_score=78.0,
            received_24h=3,
            received_7d=9,
            dismissed_7d=3,
            ignored_7d=5,
        )
    )
    await db_session.flush()

    res_fatigued = await pipeline.evaluate_recipient(db_session, uid, promo_req, now_utc=day_utc)
    assert res_fatigued.eligibility_passed is False
    assert res_fatigued.action == "suppress"
    assert res_fatigued.personalization_tier == "suppressed"

    # 3. Critical transactional / security / disruption alerts MUST NEVER be suppressed
    #    even during quiet hours AND high fatigue AND marketing cap reached!
    critical_events = [
        ("booking.confirmed", "booking", 9, {"booking_reference": "SJ-9001", "destination": "Sylhet"}),
        ("booking.payment_failed", "payment", 8, {"booking_reference": "SJ-9002", "destination": "Sylhet"}),
        ("booking.ticket_issued", "booking", 8, {"booking_reference": "SJ-9003", "ticket_id": "TK-10"}),
        ("booking.refunded", "booking", 8, {"booking_reference": "SJ-9004"}),
        ("security.auth.otp_requested", "security", 10, {"otp_code": "654321"}),
        ("travel.disruption.detected", "flight_alerts", 9, {"destination": "Sylhet", "is_verified": True, "advisory_summary": "Runway maintenance"}),
    ]
    for ev_type, cat, prio, facts in critical_events:
        crit_req = DecisionPipelineInput(
            event_type=ev_type,
            category=cat,
            title=f"Critical: {ev_type}",
            body=f"Critical update for {ev_type}",
            destination="Sylhet",
            priority=prio,
            verified_facts=facts,
            metadata=facts,
        )
        crit_res = await pipeline.evaluate_recipient(db_session, uid, crit_req, now_utc=quiet_utc)
        assert crit_res.eligibility_passed is True, f"{ev_type} was wrongly suppressed: {crit_res.suppression_reason}"
        assert crit_res.action == "dispatch", f"{ev_type} should dispatch immediately even in quiet hours"
        assert crit_res.is_critical is True

    # Lower fatigue never exceeds cap
    fat_engine = FatigueEngine(FatigueConfig(global_daily_marketing_cap=2))
    cap_dec = fat_engine.evaluate_fatigue(
        category="marketing",
        priority=3,
        user_fatigue_score=0.0,
        category_fatigue_score=0.0,
        received_24h=2,
        now_utc=day_utc,
    )
    assert cap_dec.allow is False
    assert cap_dec.suppression_reason == "daily_frequency_cap_reached"


# ============================================================================
# 3. DUPLICATE SUPPRESSION & PERSONALIZATION DISABLED
# ============================================================================


@pytest.mark.asyncio
async def test_duplicate_ttl_suppression_and_personalization_disabled(
    db_session: AsyncSession,
):
    uid = uuid.uuid4()
    now = datetime(2026, 11, 25, 5, 0, tzinfo=timezone.utc)
    await UserProfileService.update_explicit_preferences(
        db_session,
        uid,
        {"favorite_destinations": ["Cox's Bazar"], "travel_styles": ["family"], "budget_tier": "mid_range"},
        now=now,
    )

    pipeline = NotificationDecisionPipeline(mock_mode=True)
    req = DecisionPipelineInput(
        event_type="automation.destination_discovery",
        category="marketing",
        title="Cox's Bazar Coastal Picks",
        body="Explore Cox's Bazar stays.",
        destination="Cox's Bazar",
        priority=3,
        dedup_ttl_hours=24,
    )
    first = await pipeline.evaluate_recipient(db_session, uid, req, now_utc=now)
    assert first.eligibility_passed is True
    assert first.action == "dispatch"

    # Second identical destination push within TTL -> suppressed!
    second = await pipeline.evaluate_recipient(
        db_session, uid, req, now_utc=now + timedelta(hours=2)
    )
    assert second.eligibility_passed is False
    assert second.suppression_reason == "duplicate_within_ttl_window"

    # Disable personalization -> promo is blocked when require_personalization_consent=True,
    # and otherwise rendered safely at generic tier without AI enrichment
    await UserProfileService.opt_out(db_session, uid, scope="personalization", now=now)
    req_consent_required = DecisionPipelineInput(
        event_type="automation.destination_discovery",
        category="marketing",
        destination="Sylhet",
        priority=3,
        require_personalization_consent=True,
        dedup_ttl_hours=0,
    )
    blocked = await pipeline.evaluate_recipient(db_session, uid, req_consent_required, now_utc=now + timedelta(hours=3))
    assert blocked.eligibility_passed is False
    assert blocked.suppression_reason == "personalization_opted_out"


# ============================================================================
# 4. AI NON-GATING FALLBACKS, FACTUAL VALIDATION & DEEP-LINK VALIDATION
# ============================================================================


@pytest.mark.asyncio
async def test_ai_disabled_unavailable_timeout_and_invalid_output_fallback(
    monkeypatch: pytest.MonkeyPatch,
):
    ctx = {
        "preferred_language": "en",
        "communication_tone": "friendly",
        "top_destination": "Sylhet",
        "budget_tier": "mid_range",
        "travel_styles": ["family"],
    }
    facts = {"destination": "Sylhet", "price_bdt": 5000, "discount_percent": 20}

    # 1. AI disabled
    res_disabled = await AIPersonalizationService.personalize_notification(
        event_type="campaign.discovery",
        verified_facts=facts,
        profile_context=ctx,
        confidence_score=85.0,
        allow_ai=False,
    )
    assert res_disabled.ai_used is False
    assert res_disabled.ai_provider == "ai_disabled"
    assert res_disabled.content.title

    # 2. AI provider unavailable (mock/empty key)
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "mock-gemini-api-key-for-dev")
    res_nokey = await AIPersonalizationService.personalize_notification(
        event_type="campaign.discovery",
        verified_facts=facts,
        profile_context=ctx,
        confidence_score=85.0,
        allow_ai=True,
    )
    assert res_nokey.ai_used is False
    assert res_nokey.fallback_used is True
    assert res_nokey.ai_provider == "deterministic_fallback_no_key"

    # 3. AI timeout -> seamless fallback
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "live-test-key-123456789")
    gemini_circuit_breaker._state = CircuitState.CLOSED  # type: ignore[attr-defined]

    async def _slow_completion(_req):
        await asyncio.sleep(1.0)
        return AICompletionResponse(text="{}", provider="gemini", model="gemini-2.0-flash", tokens_used=10)

    monkeypatch.setattr(GeminiConciergeService, "text_completion", staticmethod(_slow_completion))
    res_timeout = await AIPersonalizationService.personalize_notification(
        event_type="campaign.discovery",
        verified_facts=facts,
        profile_context=ctx,
        confidence_score=85.0,
        allow_ai=True,
        ai_config={"ai_enabled": True, "timeout_seconds": 0.2},
    )
    assert res_timeout.ai_used is False
    assert res_timeout.fallback_used is True
    assert res_timeout.ai_provider == "timeout_fallback"

    # 4. Invalid/hallucinated AI output (fabricated price 9999 + scarcity) -> rejected & falls back!
    async def _hallucinated_completion(_req):
        bad_json = json.dumps(
            {
                "title": "Only 1 room left in Sylhet!",
                "body": "Book now for BDT 9999 with 60% off!",
                "cta": "Book",
                "push_short_title": "Hurry",
                "push_short_body": "Only 1 room left!",
            }
        )
        return AICompletionResponse(text=bad_json, provider="gemini", model="gemini-2.0-flash", tokens_used=50)

    monkeypatch.setattr(GeminiConciergeService, "text_completion", staticmethod(_hallucinated_completion))
    res_invalid = await AIPersonalizationService.personalize_notification(
        event_type="campaign.discovery",
        verified_facts=facts,
        profile_context=ctx,
        confidence_score=85.0,
        allow_ai=True,
        ai_config={"ai_enabled": True, "timeout_seconds": 1.0},
    )
    assert res_invalid.ai_used is False
    assert res_invalid.fallback_used is True
    assert res_invalid.factual_validation_passed is False
    assert res_invalid.factual_validation_errors


def test_factual_validator_deep_links_pii_flight_tokens_and_lockscreen():
    # Deep-link allowlist & blocking
    assert FactualValidator.validate_deep_link("/(tabs)/trips")[0] is True
    assert FactualValidator.validate_deep_link("/screens/search-stays?destination=Sylhet")[0] is True
    assert FactualValidator.validate_deep_link("shopnojatra://deals")[0] is True
    assert FactualValidator.validate_deep_link("https://evil.com")[0] is False
    assert FactualValidator.validate_deep_link("javascript:alert(1)")[0] is False
    assert FactualValidator.validate_deep_link("/(tabs)?next=https://evil.com")[0] is False

    # #37 regression check: TK 5000 & UP TO 20% pass when backed by facts; genuine unverified flight code BG-147 fails!
    ok_verified, errs_verified = FactualValidator.validate_factual_grounding(
        {"title": "SAVE UP TO 20%", "body": "Offer TK 5000 for Sylhet"},
        {"price_bdt": 5000, "discount_percent": 20},
    )
    assert ok_verified is True, errs_verified

    ok_bad_flight, errs_bad_flight = FactualValidator.validate_factual_grounding(
        {"title": "Flight BG-147 Ready", "body": "Departs at 10:30"},
        {},
    )
    assert ok_bad_flight is False
    assert any("BG-147" in e for e in errs_bad_flight)

    # Lock-screen leak check on abandoned search + PII detection
    ok_abandoned, errs_abandoned = FactualValidator.validate_notification_output(
        {
            "title": "Continue Sylhet planning",
            "body": "Compare options in Sylhet.",
            "cta": "Compare",
            "deep_link": "/screens/search?q=Sylhet",
            "push_short_title": "Sylhet awaits",
            "push_short_body": "Your Sylhet search is waiting!",
        },
        {"destination": "Sylhet"},
        is_abandoned_search=True,
    )
    assert ok_abandoned is False
    assert any("lock-screen" in e.lower() for e in errs_abandoned)

    pii_reasons = FactualValidator.detect_pii("Contact traveler@test.com or +8801712345678")
    assert len(pii_reasons) >= 2


# ============================================================================
# 5. CHANNEL FALLBACK & ADAPTIVE SEND-TIME OPTIMIZATION
# ============================================================================


def test_channel_selector_fallback_and_adaptive_timing():
    selector = ChannelSelector()
    prefs = SimpleNamespace(
        push_enabled=False,  # User disabled push
        email_enabled=True,
        sms_enabled=True,
        in_app_enabled=True,
        category_booking=True,
        category_marketing=True,
        category_price_alerts=True,
    )
    # Price alert prefers push -> falls back cleanly to in_app when push disabled
    ch_res = selector.select_channels(
        category="price_alerts",
        event_type="flight.price_alert.triggered",
        priority=6,
        preferences=prefs,
    )
    assert ch_res.fallback_applied is True
    assert "push" not in ch_res.selected_channels
    assert "in_app" in ch_res.selected_channels

    # Promo never blasts SMS or all 4 channels
    promo_ch = selector.select_channels(
        category="marketing",
        event_type="system.campaign.broadcast",
        priority=3,
        preferences=SimpleNamespace(
            push_enabled=True,
            email_enabled=True,
            sms_enabled=True,
            in_app_enabled=True,
            category_marketing=True,
        ),
    )
    assert len(promo_ch.selected_channels) == 1
    assert "sms" not in promo_ch.selected_channels

    # Adaptive timing: explicit override beats behavioral histogram
    timing = AdaptiveTimingEngine(AdaptiveTimingConfig(adaptive_timing_enabled=True))
    now_dhaka_morning = datetime(2026, 11, 25, 3, 0, tzinfo=timezone.utc)  # 09:00 Asia/Dhaka
    dec_explicit = timing.select_optimal_send_time(
        category="marketing",
        user_timezone="Asia/Dhaka",
        explicit_time_preference={"preferred_send_window": "evening"},
        engagement_histogram={"9": 99.0},
        confidence_score=90.0,
        now_utc=now_dhaka_morning,
    )
    assert dec_explicit.used_explicit_override is True
    assert dec_explicit.reason == "explicit_time_preference"
    assert 17 <= dec_explicit.local_send_hour <= 20

    # Critical alert bypasses timing delay immediately even during quiet hours
    quiet_utc = datetime(2026, 11, 25, 17, 30, tzinfo=timezone.utc)  # 23:30 Asia/Dhaka
    dec_crit = timing.select_optimal_send_time(
        category="security",
        event_type="security.auth.otp_requested",
        priority=10,
        quiet_hours_enabled=True,
        now_utc=quiet_utc,
    )
    assert dec_crit.dispatch_immediately is True
    assert dec_crit.reason == "critical_bypass"


# ============================================================================
# 6. ANTI-FEEDBACK-LOOP GUARD & A/B EXPERIMENTS & OUTBOX WORKER / DLQ
# ============================================================================


@pytest.mark.asyncio
async def test_anti_feedback_loop_guard_on_notification_interaction(
    db_session: AsyncSession,
):
    uid = uuid.uuid4()
    now = datetime(2026, 11, 25, 6, 0, tzinfo=timezone.utc)
    await UserProfileService.update_explicit_preferences(
        db_session, uid, {"favorite_destinations": ["Sylhet"]}, now=now
    )

    pipeline = NotificationDecisionPipeline(mock_mode=True)
    res = await pipeline.evaluate_recipient(
        db_session,
        uid,
        DecisionPipelineInput(
            event_type="automation.destination_discovery",
            category="marketing",
            destination="Sylhet",
            priority=9,
            requested_channels=["in_app"],
        ),
        now_utc=now,
    )
    assert res.notification_id is not None

    outbox_before = await db_session.scalar(select(func.count(NotificationOutbox.id)))
    snap_before = await UserProfileService.build_20d_snapshot(db_session, uid, now=now)
    dest_signals_before = snap_before.destination_interests.get("Sylhet", {}).get("signal_count", 0)

    # Record click interaction -> updates decision log & fatigue, MUST NOT spawn new outbox events
    # or inflate destination search intent!
    inter_res = await NotificationDecisionPipeline.record_interaction(
        db_session,
        notification_id=res.notification_id,
        user_id=uid,
        interaction_type="clicked",
        channel="in_app",
        now_utc=now + timedelta(minutes=5),
    )
    assert inter_res["decision_logged"] is True
    assert inter_res["anti_feedback_loop_applied"] is True

    outbox_after = await db_session.scalar(select(func.count(NotificationOutbox.id)))
    assert outbox_after == outbox_before

    snap_after = await UserProfileService.build_20d_snapshot(db_session, uid, now=now + timedelta(minutes=6))
    assert snap_after.destination_interests.get("Sylhet", {}).get("signal_count", 0) == dest_signals_before


@pytest.mark.asyncio
async def test_ab_experiment_hash_stop_conditions_bounded_learning_and_critical_ban(
    db_session: AsyncSession,
):
    # 1. Critical transactional/security categories strictly forbidden
    for bad_cat in ("security", "booking", "payment", "sos", "disruption"):
        eligible, _ = ExperimentEngine.is_experiment_eligible(category=bad_cat, priority=3)
        assert eligible is False
        with pytest.raises(ValueError):
            await ExperimentEngine.create_experiment(
                db_session,
                key=f"bad-{bad_cat}",
                name="Invalid Critical Experiment",
                hypothesis="Should fail",
                experiment_type="generic_vs_personalized",
                variants=[{"name": "control", "weight": 0.5}, {"name": "personalized", "weight": 0.5}],
                target_categories=[bad_cat],
            )

    # 2. Deterministic SHA-256 hash assignment
    uid = uuid.uuid4()
    variants = [{"name": "control", "weight": 0.5}, {"name": "personalized", "weight": 0.5}]
    v1 = ExperimentEngine.assign_variant("exp-sylhet-tone", uid, variants)
    v2 = ExperimentEngine.assign_variant("exp-sylhet-tone", uid, variants)
    assert v1 == v2
    assert v1 in {"control", "personalized"}

    # 3. Create valid marketing experiment & trigger opt-out spike stop condition
    exp = await ExperimentEngine.create_experiment(
        db_session,
        key="exp-promo-copy-1",
        name="Promo Personalization Test",
        hypothesis="Deep personalization improves conversions without opt-outs",
        experiment_type="generic_vs_personalized",
        variants=variants,
        min_sample_size=20,
        opt_out_stop_threshold=0.05,
        target_categories=["marketing"],
    )
    stats_spike = ExperimentEngine.evaluate_experiment_stats(
        assignments=[
            {"variant": "control", "exposures": 25, "conversions": 2, "opt_outs": 0},
            {"variant": "personalized", "exposures": 25, "conversions": 4, "opt_outs": 3},  # 12% > 5%!
        ],
        variants=variants,
        min_sample_size=20,
        opt_out_stop_threshold=0.05,
    )
    assert stats_spike["should_stop"] is True
    assert stats_spike["recommended_status"] == "stopped"
    assert "opt_out_spike" in (stats_spike["stop_reason"] or "")

    # 4. Bounded adaptive learning caps every delta <= +/- 0.03 and sums to 1.0
    proposal = ExperimentEngine.propose_bounded_weight_adjustments(
        DEFAULT_RELEVANCE_WEIGHTS,
        {"DestinationInterest": 1.0, "TravelStyleMatch": 1.0, "TimingMatch": -1.0},
    )
    assert proposal["requires_approval"] is True
    assert proposal["applied"] is False
    assert math.isclose(proposal["weight_sum"], 1.0, abs_tol=1e-4)
    for k, delta in proposal["deltas"].items():
        assert abs(delta) <= 0.03 + 1e-6, f"Delta for {k} exceeded +/- 0.03: {delta}"


@pytest.mark.asyncio
async def test_outbox_worker_delivery_dedup_retry_and_dlq_replay(db_session: AsyncSession):
    uid = uuid.uuid4()
    now = datetime(2026, 11, 25, 6, 0, tzinfo=timezone.utc)

    # 1. Valid critical booking event -> OutboxWorkerProcessor delivers end-to-end
    evt = BookingConfirmedEvent(
        booking_id=uuid.uuid4(),
        booking_reference="SJ-WORKER-1",
        user_id=uid,
        customer_name="Ayesha Rahman",
        customer_email="ayesha@example.com",
        destination="Sylhet",
        total_paid=12000.0,
    )
    outbox_ok = await OutboxPublisher.publish(db_session, evt)
    outbox_ok.scheduled_at = now
    await db_session.flush()

    worker = OutboxWorkerProcessor(mock_mode=True)
    summary = await worker.process_batch(db_session, now_utc=now)
    assert summary.delivered_count >= 1
    assert outbox_ok.status == "delivered"

    # 2. Failure simulation -> retry backoff + DLQ quarantine at max_attempts + replay
    d_delay = compute_retry_delay_seconds(attempts=2, jitter_max=0.0)
    assert d_delay == 20.0

    failing_outbox = NotificationOutbox(
        event_id=uuid.uuid4(),
        event_type="booking.confirmed",
        aggregate_type="booking",
        aggregate_id="bk-fail-1",
        actor_id=uid,
        priority=9,
        payload={
            "user_id": str(uid),
            "booking_reference": "SJ-FAIL-1",
            "_simulate_failure": True,
            "_failure_reason": "Simulated SMTP outage",
        },
        status="pending",
        attempts=1,
        max_attempts=2,
        scheduled_at=now,
    )
    db_session.add(failing_outbox)
    await db_session.flush()

    sum_fail = await worker.process_batch(db_session, now_utc=now)
    assert sum_fail.quarantined_count == 1
    assert failing_outbox.status == "dead_letter"

    dlq_items, total_dlq = await DLQManager.list_dlq(db_session, resolution_status="unresolved")
    assert total_dlq >= 1
    target_dlq = next(d for d in dlq_items if d.outbox_id == failing_outbox.id)

    replay_res = await DLQManager.replay_dlq_entry(db_session, target_dlq.id)
    assert replay_res["resolution_status"] == "replayed"
    assert failing_outbox.status == "pending"
    assert failing_outbox.attempts == 0
