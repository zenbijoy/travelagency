"""
Mandatory 8-User Persona Acceptance Test Suite for ShopnoJatra
Hyper-Personalized Notification Intelligence.

Verifies the end-to-end personalization decision pipeline across 8 distinct
synthetic user personas subjected to a unified campaign opportunity:
"Explore travel opportunities this month."

Personas:
- User A: Family Traveler (moderate budget, family & relaxation, Cox's Bazar, resort & amenities, BN language)
- User B: Budget Traveler (student/backpacker, budget tier, backpacking, Sylhet & Sreemangal, bus/train, high price sensitivity)
- User C: Premium / Luxury Traveler (luxury tier, business/luxury, Dubai/Bangkok, flight, 5-star, EN language)
- User D: Adventure Traveler (moderate budget, trekking/adventure, Sajek/Bandarban, active)
- User E: Inactive / Dormant Traveler (registered months ago, 0 recent activity, dormant lifecycle)
- User F: New User Onboarding (registered today, 0 behavioral signals, unknown profile, generic tier)
- User G: Highly Engaged Deal Seeker (daily active, flash sales & price alerts, high engagement, elevated fatigue)
- User H: Notification-Fatigued & Marketing Opted-Out (fatigue=95, marketing_opt_in=False)
- User I: Persona A Twin (identical explicit preferences & signals to verify pipeline determinism & consistency)

Key Verifications:
1. Genuinely distinct relevance scores, confidence tiers, and explanation factors across diverse personas.
2. User F (New) receives graceful generic fallback (confidence < 35%).
3. User H (Fatigued/Opted-Out) is suppressed for the promotional campaign.
4. User H receives CRITICAL transactional notifications (booking confirmation) with ZERO suppression.
5. Determinism: User A and User I yield identical relevance scores and decision outcomes.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import uuid
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.personalization import (
    UserBehavioralSignal,
    UserDestinationInterest,
    UserNotificationFatigue,
    UserPersonalizationProfile,
)
from app.notifications.personalization.decision_pipeline import (
    DecisionPipelineInput,
    DecisionPipelineResult,
    NotificationDecisionPipeline,
)
from app.notifications.personalization.profile_service import UserProfileService
from app.notifications.personalization.signals import BehavioralSignalService


@pytest.mark.asyncio
async def test_acceptance_8_users_unified_campaign_and_critical_exemption(
    db_session: AsyncSession,
):
    now = datetime(2026, 11, 25, 12, 0, tzinfo=timezone.utc)  # 6:00 PM Dhaka time

    uid_a = uuid.uuid4()  # Family
    uid_b = uuid.uuid4()  # Budget
    uid_c = uuid.uuid4()  # Luxury
    uid_d = uuid.uuid4()  # Adventure
    uid_e = uuid.uuid4()  # Dormant
    uid_f = uuid.uuid4()  # New
    uid_g = uuid.uuid4()  # Deal Seeker
    uid_h = uuid.uuid4()  # Fatigued / Opted-out
    uid_i = uuid.uuid4()  # Twin of User A

    # -------------------------------------------------------------------------
    # 1. Setup User A (Family Traveler, BN) & Twin User I
    # -------------------------------------------------------------------------
    for uid in (uid_a, uid_i):
        await UserProfileService.update_explicit_preferences(
            db_session,
            uid,
            {
                "personalization_enabled": True,
                "preferred_language": "bn",
                "budget_tier": "mid_range",
                "travel_styles": ["family", "relaxation"],
                "favorite_destinations": ["Cox's Bazar", "Chittagong"],
                "preferred_accommodation": ["resort"],
                "preferred_amenities": ["swimming_pool", "free_breakfast"],
                "preferred_channels": ["push", "in_app"],
                "marketing_opt_in": True,
            },
            now=now - timedelta(days=5),
        )
        await BehavioralSignalService.ingest_signal(
            db_session,
            user_id=uid,
            signal_type="search",
            destination="Cox's Bazar",
            product_type="hotel",
            occurred_at=now - timedelta(hours=6),
        )

    # -------------------------------------------------------------------------
    # 2. Setup User B (Budget Traveler / Deal Seeker)
    # -------------------------------------------------------------------------
    await UserProfileService.update_explicit_preferences(
        db_session,
        uid_b,
        {
            "personalization_enabled": True,
            "preferred_language": "en",
            "budget_tier": "budget",
            "travel_styles": ["budget", "backpacking"],
            "favorite_destinations": ["Sylhet", "Sreemangal"],
            "preferred_transport": ["train", "bus"],
            "price_sensitivity": "high",
            "deal_affinity": "high",
            "preferred_channels": ["push"],
            "marketing_opt_in": True,
        },
        now=now - timedelta(days=10),
    )
    await BehavioralSignalService.ingest_signal(
        db_session,
        user_id=uid_b,
        signal_type="search",
        destination="Sylhet",
        product_type="tour",
        filters={"price_max": 2000, "budget_tier": "budget"},
        occurred_at=now - timedelta(hours=12),
    )

    # -------------------------------------------------------------------------
    # 3. Setup User C (Premium / Luxury Traveler, EN)
    # -------------------------------------------------------------------------
    await UserProfileService.update_explicit_preferences(
        db_session,
        uid_c,
        {
            "personalization_enabled": True,
            "preferred_language": "en",
            "budget_tier": "luxury",
            "travel_styles": ["luxury", "business"],
            "favorite_destinations": ["Dubai", "Bangkok"],
            "preferred_transport": ["flight"],
            "preferred_accommodation": ["luxury_hotel"],
            "price_sensitivity": "low",
            "preferred_channels": ["email", "push"],
            "marketing_opt_in": True,
        },
        now=now - timedelta(days=15),
    )
    await BehavioralSignalService.ingest_signal(
        db_session,
        user_id=uid_c,
        signal_type="search",
        destination="Dubai",
        product_type="flight",
        filters={"cabin_class": "business", "hotel_stars": 5},
        occurred_at=now - timedelta(days=2),
    )

    # -------------------------------------------------------------------------
    # 4. Setup User D (Adventure Traveler)
    # -------------------------------------------------------------------------
    await UserProfileService.update_explicit_preferences(
        db_session,
        uid_d,
        {
            "personalization_enabled": True,
            "preferred_language": "en",
            "budget_tier": "mid_range",
            "travel_styles": ["adventure"],
            "favorite_destinations": ["Sajek", "Bandarban"],
            "preferred_transport": ["bus"],
            "preferred_channels": ["push"],
            "marketing_opt_in": True,
        },
        now=now - timedelta(days=7),
    )
    await BehavioralSignalService.ingest_signal(
        db_session,
        user_id=uid_d,
        signal_type="search",
        destination="Sajek",
        product_type="tour",
        occurred_at=now - timedelta(days=1),
    )

    # -------------------------------------------------------------------------
    # 5. Setup User E (Inactive / Dormant Traveler)
    # -------------------------------------------------------------------------
    await UserProfileService.update_explicit_preferences(
        db_session,
        uid_e,
        {
            "personalization_enabled": True,
            "preferred_language": "en",
            "budget_tier": "mid_range",
            "travel_styles": ["relaxation"],
            "favorite_destinations": ["Cox's Bazar"],
            "marketing_opt_in": True,
        },
        now=now - timedelta(days=120),
    )
    # Stale signal from 100 days ago
    await BehavioralSignalService.ingest_signal(
        db_session,
        user_id=uid_e,
        signal_type="destination_view",
        destination="Cox's Bazar",
        occurred_at=now - timedelta(days=100),
    )

    # -------------------------------------------------------------------------
    # 6. Setup User F (Brand New Onboarding User)
    # -------------------------------------------------------------------------
    # Only create empty profile row; zero behavioral signals
    await UserProfileService.get_or_create_profile(db_session, uid_f)

    # -------------------------------------------------------------------------
    # 7. Setup User G (Highly Engaged Deal Seeker)
    # -------------------------------------------------------------------------
    await UserProfileService.update_explicit_preferences(
        db_session,
        uid_g,
        {
            "personalization_enabled": True,
            "preferred_language": "en",
            "budget_tier": "budget",
            "travel_styles": ["budget"],
            "price_sensitivity": "high",
            "deal_affinity": "high",
            "preferred_channels": ["push", "in_app"],
            "marketing_opt_in": True,
        },
        now=now - timedelta(days=3),
    )
    for h_ago in (2, 4, 8, 14, 20):
        await BehavioralSignalService.ingest_signal(
            db_session,
            user_id=uid_g,
            signal_type="search",
            destination="Cox's Bazar",
            product_type="hotel",
            filters={"discount": True, "flash_sale": True},
            occurred_at=now - timedelta(hours=h_ago),
        )
    # Give User G moderate fatigue score (e.g. 48.0)
    db_session.add(
        UserNotificationFatigue(
            user_id=uid_g,
            category="marketing",
            fatigue_score=48.0,
            received_24h=2,
            received_7d=7,
            opened_7d=5,
            clicked_7d=4,
            last_sent_at=now - timedelta(hours=5),
        )
    )

    # -------------------------------------------------------------------------
    # 8. Setup User H (Fatigued & Opted-Out of Marketing)
    # -------------------------------------------------------------------------
    await UserProfileService.update_explicit_preferences(
        db_session,
        uid_h,
        {
            "personalization_enabled": True,
            "marketing_opt_in": False,
            "notification_categories": {"marketing": False, "booking": True, "flight_alerts": True},
        },
        now=now - timedelta(days=1),
    )
    db_session.add(
        UserNotificationFatigue(
            user_id=uid_h,
            category="marketing",
            fatigue_score=95.0,
            received_24h=5,
            received_7d=18,
            dismissed_7d=12,
            ignored_7d=6,
            cooldown_until=now + timedelta(days=3),
            last_sent_at=now - timedelta(hours=1),
        )
    )
    await db_session.flush()

    # =========================================================================
    # PART 1: Unified Campaign Opportunity Across All 8 Personas (+ Twin User I)
    # =========================================================================
    campaign_input = DecisionPipelineInput(
        event_id=uuid.uuid4(),
        event_type="system.campaign.broadcast",
        aggregate_type="campaign",
        aggregate_id="summer-2026-coxs-bazar",
        category="marketing",
        title="Explore travel opportunities this month.",
        body="Discover seasonal travel ideas tailored to your journey.",
        destination="Cox's Bazar",
        budget_tier="mid_range",
        travel_styles=["family", "relaxation"],
        priority=5,
        cta_label="View Offers",
        deep_link="/(tabs)/explore",
    )

    pipeline = NotificationDecisionPipeline(mock_mode=True)
    all_users = [uid_a, uid_b, uid_c, uid_d, uid_e, uid_f, uid_g, uid_h, uid_i]

    results = await pipeline.evaluate_batch(
        db_session,
        all_users,
        campaign_input,
        now_utc=now,
    )

    res_by_uid = {r.user_id: r for r in results}

    res_a = res_by_uid[uid_a]
    res_b = res_by_uid[uid_b]
    res_c = res_by_uid[uid_c]
    res_d = res_by_uid[uid_d]
    res_e = res_by_uid[uid_e]
    res_f = res_by_uid[uid_f]
    res_g = res_by_uid[uid_g]
    res_h = res_by_uid[uid_h]
    res_i = res_by_uid[uid_i]

    # --- Assertion 1: User A (Family) receives high relevance & eligible treatment ---
    assert res_a.eligibility_passed is True
    assert res_a.relevance_score >= 60.0, f"Expected high relevance for Family match, got {res_a.relevance_score}"
    assert res_a.personalization_tier in ("light", "deep")
    assert any("Cox's Bazar" in f or "destination" in f.lower() or "family" in f.lower() for f in res_a.explanation_factors)

    # --- Assertion 2: User B (Budget) has distinct score reflecting budget/destination misalignment ---
    assert res_b.eligibility_passed is True
    assert res_b.relevance_score != res_a.relevance_score

    # --- Assertion 3: User C (Luxury) has distinct score reflecting luxury preferences ---
    assert res_c.eligibility_passed is True
    assert res_c.relevance_score != res_a.relevance_score
    assert res_c.relevance_score != res_b.relevance_score

    # --- Assertion 4: User D (Adventure) has distinct score reflecting adventure preference ---
    assert res_d.eligibility_passed is True
    assert res_d.relevance_score != res_a.relevance_score

    # --- Assertion 5: User E (Dormant) has decayed/cold-start scoring ---
    assert res_e.relevance_score != res_a.relevance_score

    # --- Assertion 6: User F (Brand New) receives Generic fallback tier ---
    assert res_f.confidence_score < 35.0, f"Expected cold start confidence < 35, got {res_f.confidence_score}"
    assert res_f.personalization_tier == "generic"

    # --- Assertion 7: User G (Deal Seeker) has high engagement & deal match ---
    assert res_g.eligibility_passed is True
    assert res_g.fatigue_score >= 40.0

    # --- Assertion 8: User H (Fatigued & Opted Out) MUST BE SUPPRESSED for marketing ---
    assert res_h.eligibility_passed is False or res_h.action == "suppress"
    assert res_h.suppression_reason is not None
    assert any(
        term in res_h.suppression_reason.lower()
        for term in ("opt", "fatigue", "suppress", "category", "consent")
    )

    # --- Assertion 9: Persona A and Persona I Twins have IDENTICAL decision metrics ---
    assert abs(res_a.relevance_score - res_i.relevance_score) < 0.001
    assert abs(res_a.confidence_score - res_i.confidence_score) < 0.001
    assert res_a.personalization_tier == res_i.personalization_tier
    assert res_a.eligibility_passed == res_i.eligibility_passed
    assert res_a.action == res_i.action
    assert res_a.selected_channels == res_i.selected_channels

    # --- Assertion 10: Score Diversity across Personas ---
    scores = {res_a.relevance_score, res_b.relevance_score, res_c.relevance_score, res_d.relevance_score, res_f.relevance_score}
    assert len(scores) >= 3, f"Expected diverse score distribution, got: {scores}"

    # =========================================================================
    # PART 2: Zero-Tolerance Exemption for Critical Transactional on User H
    # =========================================================================
    # Even though User H is severely fatigued (fatigue=95) and opted out of marketing,
    # a booking confirmation MUST dispatch immediately without suppression!
    critical_booking_input = DecisionPipelineInput(
        event_id=uuid.uuid4(),
        event_type="booking.confirmed",
        aggregate_type="booking",
        aggregate_id="bk-acceptance-h-1",
        category="booking",
        title="Booking Confirmed: SJ-7788",
        body="Your flight from Dhaka to Cox's Bazar is confirmed. E-ticket issued.",
        destination="Cox's Bazar",
        priority=9,
        cta_label="View Ticket",
        deep_link="/(tabs)/bookings/SJ-7788",
        verified_facts={
            "booking_reference": "SJ-7788",
            "destination": "Cox's Bazar",
            "total_paid": 8500.0,
        },
    )

    res_h_critical = await pipeline.evaluate_recipient(
        db_session,
        uid_h,
        critical_booking_input,
        now_utc=now,
    )

    assert res_h_critical.is_critical is True
    assert res_h_critical.eligibility_passed is True
    assert res_h_critical.action == "dispatch"
    assert res_h_critical.suppression_reason is None
    assert res_h_critical.selected_channel is not None
    assert res_h_critical.dispatch_immediately is True
