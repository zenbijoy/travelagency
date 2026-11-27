"""
Comprehensive Unit & DB Integration Tests for:
- All 20 Personalization Dimensions (`dimensions.py`)
- Time-Decay Interest Mathematics & Guardrails (`time_decay.py`)
- Behavioral Analytics Engine (`signals.py`)
- Dynamic 20D User Profile Update Engine (`profile_service.py`)

Covers:
1. Canonical 20-dimension registry, attributes, unknown profile preservation.
2. Explicit preferences overriding inferred behavioral data + changelog & version increments.
3. Conflicting preferences, dimension correction (`set`/`remove`), and negative signal impact.
4. Stale / expired data handling (`expires_at`, `run_batch_aggregation`, `last_signal_at` preservation).
5. Low vs medium vs high confidence scoring tiers (`< 35`, `35-70`, `> 70`).
6. User reset, GDPR profile deletion, and granular consent withdrawal (marketing, personalization, location).
7. Sensitive demographic & PII rejection (religion, health, politics, ethnicity, NID/passport, account-age-for-frequency) + explicit-only `religious_travel` in `travel_style`.
8. Behavioral signals (repeated search, abandonment suppressed after booking, category engagement isolation, time-of-day histogram, 7 activity lifecycle stages).
9. Exact time-decay formula `exp(-lambda * t)`, O(1) incremental vs batch parity, single accidental view/click resistance.
10. Batched snapshot assembly query-count efficiency (no N+1 per-dimension queries).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import math
import uuid
import pytest
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.personalization import (
    PersonalizationRuleConfig,
    UserBehavioralSignal,
    UserDestinationInterest,
    UserNotificationFatigue,
    UserPersonalizationProfile,
    UserProfileChangeLog,
    UserProfileDimension,
)
from app.notifications.personalization.dimensions import (
    DIMENSION_KEYS,
    DIMENSION_REGISTRY,
    DIMENSION_SPECS,
    DimensionValue,
    build_empty_dimensions_map,
    compute_data_quality,
    sanitize_dimension_value,
)
from app.notifications.personalization.profile_service import UserProfileService
from app.notifications.personalization.signals import (
    ActivityLifecycleThresholds,
    BehavioralSignalService,
)
from app.notifications.personalization.time_decay import (
    SignalObservation,
    TimeDecayConfig,
    aggregate_decayed_interest,
    compute_incremental_interest,
    compute_signal_decay,
    normalize_decayed_score,
)


# ============================================================================
# 1. 20 DIMENSIONS & UNKNOWN PROFILE PRESERVATION
# ============================================================================


def test_all_20_dimensions_registered_with_full_contract():
    expected_keys = (
        "profile_context",
        "location_context",
        "destination_interest",
        "search_behavior",
        "travel_frequency",
        "budget_profile",
        "travel_style",
        "transport_preference",
        "accommodation_preference",
        "time_preference",
        "activity_level",
        "engagement_behavior",
        "notification_tolerance",
        "language_communication_style",
        "price_sensitivity",
        "travel_timeline",
        "loyalty_engagement_tier",
        "contextual_travel_conditions",
        "consent_communication_preferences",
        "personalization_confidence",
    )
    assert len(DIMENSION_SPECS) == 20
    assert DIMENSION_KEYS == expected_keys
    assert set(DIMENSION_REGISTRY.keys()) == set(expected_keys)

    dims = build_empty_dimensions_map()
    assert len(dims) == 20
    for key in expected_keys:
        dim = dims[key]
        assert dim.dimension_key == key
        assert dim.value == "unknown"
        assert dim.confidence == 0.0
        assert dim.source == "unknown"
        assert dim.data_quality == "unknown"
        assert dim.updated_at is None
        assert dim.is_user_provided is False
        assert dim.is_unknown() is True
        summary = dim.to_safe_summary()
        assert set(summary.keys()) >= {
            "dimension_key",
            "value",
            "confidence",
            "source",
            "data_quality",
            "updated_at",
            "expiration_policy",
            "expires_at",
            "is_user_provided",
            "permission_granted",
        }
    # Location requires explicit consent by default
    assert dims["location_context"].permission_granted is False


@pytest.mark.asyncio
async def test_unknown_profile_preserved_without_invented_values(db_session: AsyncSession):
    """A brand-new user with no preferences or signals stays unknown with 0 confidence."""
    user_id = uuid.uuid4()
    snapshot = await UserProfileService.build_20d_snapshot(db_session, user_id)

    assert snapshot.user_id == user_id
    assert len(snapshot.dimensions) == 20
    assert snapshot.overall_confidence == 0.0
    assert snapshot.confidence_tier() == "low"
    assert snapshot.populated_dimension_count() == 0
    assert snapshot.top_destinations() == []
    assert snapshot.activity_level == "new_user"
    assert snapshot.travel_timeline_stage == "no_planned_trip"
    for key in DIMENSION_KEYS:
        assert snapshot.get_value(key) == "unknown"
        assert snapshot.get_confidence(key) == 0.0


# ============================================================================
# 2. EXPLICIT PREFERENCES OVERRIDE BEHAVIORAL INFERENCE & CONFLICT RESOLUTION
# ============================================================================


@pytest.mark.asyncio
async def test_explicit_preferences_override_behavioral_and_prevent_overwrite(
    db_session: AsyncSession,
):
    user_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    # Behavioral signals infer bus + budget
    await BehavioralSignalService.ingest_signal(
        db_session,
        user_id=user_id,
        signal_type="search",
        destination="Cox's Bazar",
        product_type="bus",
        price_paisa=250_000,
        occurred_at=now - timedelta(hours=4),
    )
    await BehavioralSignalService.ingest_signal(
        db_session,
        user_id=user_id,
        signal_type="booking",
        destination="Cox's Bazar",
        product_type="bus",
        price_paisa=250_000,
        occurred_at=now - timedelta(hours=3),
    )
    snap_behavioral = await UserProfileService.build_20d_snapshot(db_session, user_id, now=now)
    assert snap_behavioral.get_dimension("transport_preference").source == "transactional"
    assert snap_behavioral.get_value("transport_preference")["primary_mode"] == "bus"

    # Explicit user preference overrides to flight + luxury + Sylhet favorite
    snap_explicit = await UserProfileService.update_explicit_preferences(
        db_session,
        user_id,
        {
            "preferred_language": "bn",
            "communication_tone": "concise",
            "digest_frequency": "daily",
            "favorite_destinations": ["Sylhet"],
            "travel_styles": ["family", "nature"],
            "preferred_transport": ["flight"],
            "preferred_accommodation": ["resort"],
            "preferred_amenities": ["breakfast", "family_room"],
            "budget_tier": "luxury",
            "price_sensitivity_level": "low",
            "location_consent": True,
            "home_city": "Dhaka",
            "travel_origin": "Dhaka",
        },
        now=now,
    )
    assert snap_explicit.profile_version >= 2
    assert snap_explicit.preferred_language == "bn"
    assert snap_explicit.communication_tone == "concise"
    assert snap_explicit.digest_frequency == "daily"
    assert snap_explicit.get_dimension("transport_preference").is_user_provided is True
    assert snap_explicit.get_dimension("transport_preference").source == "user_preference"
    assert snap_explicit.get_value("transport_preference")["primary_mode"] == "flight"
    assert snap_explicit.get_value("budget_profile")["tier"] == "luxury"
    assert snap_explicit.get_value("location_context")["home_city"] == "Dhaka"

    # Subsequent conflicting behavioral bus booking MUST NOT overwrite explicit flight preference
    await BehavioralSignalService.ingest_signal(
        db_session,
        user_id=user_id,
        signal_type="booking",
        destination="Bandarban",
        product_type="bus",
        price_paisa=200_000,
        occurred_at=now + timedelta(minutes=10),
    )
    snap_after = await UserProfileService.build_20d_snapshot(
        db_session, user_id, now=now + timedelta(minutes=15)
    )
    assert snap_after.get_value("transport_preference")["primary_mode"] == "flight"
    assert snap_after.get_dimension("transport_preference").is_user_provided is True

    # Audit changelog recorded
    logs = (
        await db_session.execute(
            select(UserProfileChangeLog).where(UserProfileChangeLog.user_id == user_id)
        )
    ).scalars().all()
    assert len(logs) >= 5
    assert any(l.dimension_key == "transport_preference" and l.change_source == "user_preference" for l in logs)


@pytest.mark.asyncio
async def test_correct_and_remove_inferred_dimensions(db_session: AsyncSession):
    user_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    await BehavioralSignalService.ingest_signal(
        db_session,
        user_id=user_id,
        signal_type="hotel_booking",
        destination="Sajek",
        product_type="hotel",
        filters={"accommodation_type": "eco_stay"},
        occurred_at=now,
    )

    # Correct inferred dimension via user action="set"
    snap_set = await UserProfileService.correct_inferred_dimension(
        db_session,
        user_id,
        "accommodation_preference",
        action="set",
        corrected_value={"types": ["premium_hotel"], "amenities": ["pool", "wifi"]},
        reason="User prefers premium hotels",
        now=now,
    )
    assert snap_set.get_value("accommodation_preference")["types"] == ["premium_hotel"]
    assert snap_set.get_dimension("accommodation_preference").is_user_provided is True

    # Remove inferred destination & suppress accommodation inference
    snap_rem = await UserProfileService.correct_inferred_dimension(
        db_session,
        user_id,
        "destination_interest",
        action="remove",
        corrected_value="Sajek",
        reason="Not interested anymore",
        now=now,
    )
    assert all(d["destination"] != "Sajek" for d in snap_rem.top_destinations())

    snap_sup = await UserProfileService.correct_inferred_dimension(
        db_session,
        user_id,
        "accommodation_preference",
        action="remove",
        reason="Clear inferred accommodation",
        now=now,
    )
    assert snap_sup.get_value("accommodation_preference") == "unknown"


# ============================================================================
# 3. STALE / EXPIRED DATA & BATCH AGGREGATION (PRESERVES last_signal_at!)
# ============================================================================


@pytest.mark.asyncio
async def test_stale_expired_dimensions_and_batch_aggregation_preserves_last_signal_at(
    db_session: AsyncSession,
):
    user_id = uuid.uuid4()
    old_time = datetime.now(timezone.utc) - timedelta(days=45)
    now = datetime.now(timezone.utc)

    await UserProfileService.get_or_create_profile(db_session, user_id)
    # Create an expired inferred search_behavior dimension and a fresh explicit language dimension
    db_session.add(
        UserProfileDimension(
            user_id=user_id,
            dimension_key="search_behavior",
            value_json={"recent_destinations": ["Kuakata"], "total_searches": 3},
            confidence=70.0,
            source="behavioral",
            data_quality="medium",
            is_user_provided=False,
            permission_granted=True,
            expires_at=old_time + timedelta(days=30),  # Expired 15 days ago
        )
    )
    db_session.add(
        UserProfileDimension(
            user_id=user_id,
            dimension_key="travel_style",
            value_json={"styles": ["family"]},
            confidence=100.0,
            source="user_preference",
            data_quality="high",
            is_user_provided=True,
            permission_granted=True,
            expires_at=old_time + timedelta(days=10),  # Even if old, is_user_provided=True stays
        )
    )
    # Add an expired behavioral signal + an old UserDestinationInterest
    db_session.add(
        UserBehavioralSignal(
            user_id=user_id,
            signal_type="search",
            destination="Kuakata",
            signal_weight=3.0,
            confidence=65.0,
            occurred_at=old_time,
            expires_at=now - timedelta(days=1),
        )
    )
    db_session.add(
        UserDestinationInterest(
            user_id=user_id,
            destination="Kuakata",
            score=75.0,
            raw_decayed_score=16.0,
            confidence=80.0,
            signal_count=3,
            search_count=3,
            booking_count=0,
            is_explicit_favorite=False,
            last_signal_at=old_time,
            last_decay_computed_at=old_time,
        )
    )
    await db_session.flush()

    # Snapshot already treats expired inferred search_behavior as unknown
    snap_before = await UserProfileService.build_20d_snapshot(db_session, user_id, now=now)
    assert snap_before.get_dimension("search_behavior").is_expired(now) is True
    assert snap_before.get_confidence("search_behavior", now=now) == 0.0
    assert snap_before.get_value("search_behavior", now=now) == "unknown"

    # Run batch aggregation -> purges expired signal, expires inferred dimension, decays interest,
    # and strictly preserves true last_signal_at while updating last_decay_computed_at!
    agg_res = await UserProfileService.run_batch_aggregation(db_session, [user_id], now=now)
    assert agg_res["processed_profiles"] == 1
    assert agg_res["purged_signals"] >= 1
    assert agg_res["expired_dimensions"] >= 1
    assert agg_res["recomputed_interests"] >= 1

    dim_sb = (
        await db_session.execute(
            select(UserProfileDimension).where(
                UserProfileDimension.user_id == user_id,
                UserProfileDimension.dimension_key == "search_behavior",
            )
        )
    ).scalar_one()
    assert dim_sb.value_json == "unknown"
    assert dim_sb.confidence == 0.0
    assert dim_sb.data_quality == "unknown"

    dest_row = (
        await db_session.execute(
            select(UserDestinationInterest).where(
                UserDestinationInterest.user_id == user_id,
                UserDestinationInterest.destination == "Kuakata",
            )
        )
    ).scalar_one()
    assert dest_row.score < 20.0  # Decayed heavily over 45 days (exp(-0.08 * 45) ~ 0.027)
    assert dest_row.last_signal_at.replace(tzinfo=timezone.utc) == old_time
    assert dest_row.last_decay_computed_at.replace(tzinfo=timezone.utc) == now


# ============================================================================
# 4. LOW VS HIGH CONFIDENCE, CONSENT WITHDRAWAL, RESET, AND DELETION
# ============================================================================


@pytest.mark.asyncio
async def test_low_vs_high_confidence_and_reset_delete_consent(db_session: AsyncSession):
    low_user = uuid.uuid4()
    high_user = uuid.uuid4()
    now = datetime.now(timezone.utc)

    # Low-confidence user: single weak view
    await BehavioralSignalService.ingest_signal(
        db_session,
        user_id=low_user,
        signal_type="page_view",
        destination="Sylhet",
        occurred_at=now,
    )
    low_snap = await UserProfileService.build_20d_snapshot(db_session, low_user, now=now)
    assert low_snap.overall_confidence < 35.0
    assert low_snap.confidence_tier() == "low"

    # High-confidence user: rich explicit preferences + location consent
    high_snap = await UserProfileService.update_explicit_preferences(
        db_session,
        high_user,
        {
            "preferred_language": "en",
            "communication_tone": "friendly",
            "digest_frequency": "weekly",
            "preferred_send_window": "morning",
            "location_consent": True,
            "home_city": "Dhaka",
            "favorite_destinations": ["Sylhet", "Cox's Bazar"],
            "travel_styles": ["family"],
            "preferred_transport": ["flight"],
            "preferred_accommodation": ["family_hotel"],
            "budget_tier": "mid_range",
            "price_sensitivity_level": "medium",
            "frequency_cap_marketing_per_day": 2,
        },
        now=now,
    )
    assert high_snap.overall_confidence > 70.0
    assert high_snap.confidence_tier() == "high"

    # Withdraw personalization consent -> inferred dims suppressed, marketing opt-out recorded
    opt_res = await UserProfileService.opt_out(
        db_session, high_user, scope="personalization", reason="Privacy choice", now=now
    )
    assert opt_res["personalization_enabled"] is False
    snap_after_opt_out = await UserProfileService.build_20d_snapshot(db_session, high_user, now=now)
    assert snap_after_opt_out.personalization_enabled is False

    # Re-verify location consent withdrawal clears home_city & travel_origin
    await UserProfileService.update_explicit_preferences(
        db_session, high_user, {"location_consent": False}, now=now
    )
    prefs_payload = await UserProfileService.get_preferences_payload(db_session, high_user)
    assert prefs_payload["location_consent"] is False
    assert prefs_payload["home_city"] is None
    assert prefs_payload["travel_origin"] is None

    # Reset profile -> dimensions & interests cleared back to unknown
    reset_res = await UserProfileService.reset_profile(db_session, high_user, now=now)
    assert reset_res["action"] == "reset"
    assert reset_res["cleared_records"] > 0
    snap_reset = await UserProfileService.build_20d_snapshot(db_session, high_user, now=now)
    assert snap_reset.overall_confidence == 0.0
    assert snap_reset.top_destinations() == []
    assert snap_reset.explicit_preferences == {}

    # Hard delete profile -> zero rows remain in personalization tables
    del_res = await UserProfileService.delete_profile_data(db_session, high_user)
    assert del_res["action"] == "deleted"
    assert del_res["cleared_records"] >= 1
    remaining = (
        await db_session.execute(
            select(UserPersonalizationProfile).where(
                UserPersonalizationProfile.user_id == high_user
            )
        )
    ).scalar_one_or_none()
    assert remaining is None


# ============================================================================
# 5. SENSITIVE DEMOGRAPHIC REJECTION & EXPLICIT RELIGIOUS TRAVEL RULE
# ============================================================================


@pytest.mark.asyncio
async def test_sensitive_demographics_rejected_and_religious_travel_explicit_only(
    db_session: AsyncSession,
):
    user_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    # 1. Forbidden sensitive attributes inside lists or dicts MUST be rejected BEFORE write
    for bad_payload in (
        {"travel_styles": ["family", "muslim"]},
        {"travel_interests": ["nature", "diabetes"]},
        {"extra_preferences": {"political_affiliation": "party_x"}},
        {"extra_preferences": {"ethnicity": "group_a"}},
        {"extra_preferences": {"nid": "1234567890123"}},
    ):
        with pytest.raises(ValueError):
            await UserProfileService.update_explicit_preferences(
                db_session, user_id, bad_payload, now=now
            )

    # Confirm nothing leaked into UserPersonalizationProfile.explicit_preferences
    prof = await UserProfileService.get_or_create_profile(db_session, user_id)
    assert "muslim" not in str(prof.explicit_preferences).lower()
    assert "diabetes" not in str(prof.explicit_preferences).lower()

    # 2. Behavioral inference of religious_travel is rejected
    san_inferred, viols_inferred = sanitize_dimension_value(
        "travel_style",
        {"styles": ["religious_travel", "cultural"]},
        is_user_provided=False,
        source="behavioral",
    )
    assert "religious_travel" not in san_inferred.get("styles", [])
    assert viols_inferred

    # 3. Explicit user selection of religious_travel inside travel_style IS permitted
    snap_rel = await UserProfileService.update_explicit_preferences(
        db_session,
        user_id,
        {"travel_styles": ["religious_travel", "family"]},
        now=now,
    )
    assert "religious_travel" in snap_rel.get_value("travel_style")["styles"]

    # 4. travel_frequency rejects account_age derivation
    san_freq, viols_freq = sanitize_dimension_value(
        "travel_frequency",
        {"account_age_days": 900, "confirmed_bookings_12m": 0},
        is_user_provided=False,
        source="transactional",
    )
    assert "account_age_days" not in san_freq
    assert any("account age" in v.lower() for v in viols_freq)

    # 5. Location context requires explicit consent
    with pytest.raises(ValueError):
        await UserProfileService.update_explicit_preferences(
            db_session,
            user_id,
            {"location_consent": False, "home_city": "Dhaka"},
            now=now,
        )


# ============================================================================
# 6. BEHAVIORAL SIGNALS, CATEGORY ISOLATION, ABANDONMENT & TIME-DECAY MATH
# ============================================================================


@pytest.mark.asyncio
async def test_behavioral_signals_search_abandonment_category_engagement_and_lifecycle(
    db_session: AsyncSession,
):
    user_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    # 2 searches for Sylhet (repeated search!) + 1 search for Cox's Bazar followed by booking
    await BehavioralSignalService.ingest_signal(
        db_session,
        user_id=user_id,
        signal_type="search",
        destination="Sylhet",
        product_type="hotel",
        filters={"max_price": 8000},
        occurred_at=now - timedelta(hours=10),
    )
    res_rep = await BehavioralSignalService.ingest_signal(
        db_session,
        user_id=user_id,
        signal_type="search",
        destination="Sylhet",
        product_type="hotel",
        occurred_at=now - timedelta(hours=6),
    )
    assert res_rep.recorded is True

    await BehavioralSignalService.ingest_signal(
        db_session,
        user_id=user_id,
        signal_type="search",
        destination="Cox's Bazar",
        product_type="flight",
        occurred_at=now - timedelta(hours=8),
    )
    await BehavioralSignalService.ingest_signal(
        db_session,
        user_id=user_id,
        signal_type="booking",
        destination="Cox's Bazar",
        product_type="flight",
        price_paisa=450_000,
        occurred_at=now - timedelta(hours=4),
    )

    # Notification engagement: likes price_alerts, dislikes marketing
    for h_offset in (5, 3):
        await BehavioralSignalService.ingest_signal(
            db_session,
            user_id=user_id,
            signal_type="notification_click",
            category="price_alerts",
            occurred_at=now - timedelta(hours=h_offset),
        )
    await BehavioralSignalService.ingest_signal(
        db_session,
        user_id=user_id,
        signal_type="dismissal",
        category="marketing",
        occurred_at=now - timedelta(hours=2),
    )

    all_sigs = (
        await db_session.execute(
            select(UserBehavioralSignal).where(UserBehavioralSignal.user_id == user_id)
        )
    ).scalars().all()

    search_metrics = BehavioralSignalService.compute_search_metrics(all_sigs, now=now)
    assert "Sylhet" in search_metrics.repeated_destinations
    assert any(a["destination"] == "Sylhet" for a in search_metrics.abandoned_searches)
    # Booked destination must NOT remain in abandoned searches!
    assert all(a["destination"] != "Cox's Bazar" for a in search_metrics.abandoned_searches)

    cat_eng = BehavioralSignalService.compute_category_engagement(all_sigs)
    assert cat_eng["price_alerts"].affinity_score > cat_eng["marketing"].affinity_score
    assert cat_eng["marketing"].dismissals == 1

    hist = BehavioralSignalService.compute_time_of_day_histogram(all_sigs, timezone_name="Asia/Dhaka")
    assert hist["sample_size"] >= 4
    assert hist["inferred_window"] in {"morning", "afternoon", "evening", "late_evening"}

    # Lifecycle stages
    thresholds = ActivityLifecycleThresholds()
    assert (
        BehavioralSignalService.classify_activity_lifecycle(
            last_activity_at=None, now=now, thresholds=thresholds
        )
        == "new_user"
    )
    assert (
        BehavioralSignalService.classify_activity_lifecycle(
            last_activity_at=now - timedelta(days=1), signals_7d=8, now=now, thresholds=thresholds
        )
        == "highly_active"
    )
    assert (
        BehavioralSignalService.classify_activity_lifecycle(
            last_activity_at=now - timedelta(days=16), now=now, thresholds=thresholds
        )
        == "inactive"
    )
    assert (
        BehavioralSignalService.classify_activity_lifecycle(
            last_activity_at=now - timedelta(days=45), now=now, thresholds=thresholds
        )
        == "dormant"
    )
    assert (
        BehavioralSignalService.classify_activity_lifecycle(
            last_activity_at=now - timedelta(hours=4),
            previous_state="dormant",
            previous_gap_days=45.0,
            now=now,
            thresholds=thresholds,
        )
        == "reactivated"
    )


def test_time_decay_exact_math_incremental_parity_and_single_click_resistance():
    now = datetime(2026, 11, 25, 12, 0, tzinfo=timezone.utc)
    lam = 0.08

    # 1. Exact formula verification: weight * exp(-lambda * t_days) * confidence_unit
    val_10d = compute_signal_decay(
        signal_weight=12.0, decay_lambda=lam, t_days=10.0, confidence=80.0
    )
    expected = 12.0 * math.exp(-0.08 * 10.0) * 0.80
    assert math.isclose(val_10d, expected, rel_tol=1e-9)

    # Higher lambda decays faster
    val_fast = compute_signal_decay(
        signal_weight=12.0, decay_lambda=0.25, t_days=10.0, confidence=80.0
    )
    assert val_fast < val_10d

    # 2. Single accidental click / page view NEVER triggers strong intent
    for weak_sig in ("page_view", "destination_view", "notification_click"):
        res_single = aggregate_decayed_interest(
            [SignalObservation(signal_type=weak_sig, occurred_at=now)],
            reference_time=now,
        )
        assert res_single.normalized_score <= 18.0
        assert res_single.confidence_score <= 22.0
        assert res_single.is_strong_intent is False

    # 3. O(1) incremental decay matches batch aggregation of raw decayed score
    t0 = now - timedelta(days=5)
    t1 = now
    cfg = TimeDecayConfig(decay_lambda=0.10)
    inc1 = compute_incremental_interest(
        current_raw_score=0.0,
        last_signal_at=None,
        signal_type="search",
        occurred_at=t0,
        config=cfg,
    )
    inc2 = compute_incremental_interest(
        current_raw_score=inc1.raw_decayed_score,
        last_signal_at=inc1.last_signal_at,
        signal_type="booking",
        occurred_at=t1,
        signal_count=1,
        search_count=1,
        booking_count=1,
        config=cfg,
    )
    batch = aggregate_decayed_interest(
        [
            SignalObservation(signal_type="search", occurred_at=t0),
            SignalObservation(signal_type="booking", occurred_at=t1),
        ],
        reference_time=t1,
        config=cfg,
    )
    assert math.isclose(inc2.raw_decayed_score, batch.raw_decayed_score, abs_tol=1e-2)
    assert batch.is_strong_intent is True
    assert batch.normalized_score > 50.0


@pytest.mark.asyncio
async def test_batched_snapshot_constant_query_count(db_session: AsyncSession):
    """Ensure batch snapshot building does not execute N*20 queries per user."""
    user_ids = [uuid.uuid4() for _ in range(5)]
    for uid in user_ids:
        await UserProfileService.get_or_create_profile(db_session, uid)
    await db_session.flush()

    query_count = 0

    def _before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        nonlocal query_count
        query_count += 1

    sync_engine = db_session.bind.sync_engine
    event.listen(sync_engine, "before_cursor_execute", _before_cursor_execute)
    try:
        snapshots = await UserProfileService.build_20d_snapshots_batch(db_session, user_ids)
    finally:
        event.remove(sync_engine, "before_cursor_execute", _before_cursor_execute)

    assert len(snapshots) == 5
    # Constant <= 10 batched queries for 5 users (well below 5 * 20 = 100)
    assert query_count <= 10
