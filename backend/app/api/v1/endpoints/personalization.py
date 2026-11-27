"""
Hyper-Personalized Notification Intelligence API Endpoints (User & Admin).

User Routes (`get_current_user`):
- GET/PUT  /personalization/preferences
- GET      /personalization/profile
- PATCH    /personalization/profile/correct
- POST     /personalization/signals
- POST     /personalization/opt-out
- POST     /personalization/reset
- DELETE   /personalization/profile

Admin Command Center Routes (`require_admin`):
- GET      /personalization/admin/overview
- GET      /personalization/admin/dimensions
- GET/PUT  /personalization/admin/rules
- POST     /personalization/admin/rules/rollback/{version}
- POST     /personalization/admin/preview
- GET/POST /personalization/admin/segments
- GET      /personalization/admin/segments/{segment_id}/members
- GET      /personalization/admin/fatigue
- PUT      /personalization/admin/fatigue/controls
- GET      /personalization/admin/analytics
- GET/POST /personalization/admin/experiments
- POST     /personalization/admin/experiments/{experiment_id}/stop
- GET      /personalization/admin/profiles/{user_id}
- POST     /personalization/admin/automations/{automation_key}/evaluate
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Body, Depends, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, require_admin
from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.core.rate_limit import limiter
from app.models.notification import NotificationUserPreference
from app.models.personalization import (
    PersonalizationDecisionLog,
    PersonalizationExperiment,
    PersonalizationExperimentAssignment,
    PersonalizationRuleConfig,
    PersonalizationSegment,
    UserBehavioralSignal,
    UserNotificationFatigue,
    UserPersonalizationProfile,
    UserProfileDimension,
)
from app.models.user import UserProfile
from app.notifications.ai.service import AIPersonalizationService
from app.notifications.outbox.publisher import OutboxPublisher
from app.notifications.personalization.automations import (
    AUTOMATION_CATALOG,
    TravelAutomationsService,
)
from app.notifications.personalization.channel_selector import ChannelSelector
from app.notifications.personalization.dimensions import (
    DIMENSION_KEYS,
    DimensionValue,
    UserProfile20DSnapshot,
    build_empty_dimensions_map,
    compute_data_quality,
)
from app.notifications.personalization.experiments import ExperimentEngine
from app.notifications.personalization.fatigue import FatigueEngine
from app.notifications.personalization.privacy import PrivacyAndConsentGuard
from app.notifications.personalization.profile_service import UserProfileService
from app.notifications.personalization.relevance import (
    DEFAULT_RELEVANCE_WEIGHTS,
    NotificationCandidate,
    RelevanceEngine,
)
from app.notifications.personalization.segments import SegmentBuilderService
from app.notifications.personalization.signals import BehavioralSignalService
from app.notifications.personalization.timing import AdaptiveTimingEngine
from app.schemas.personalization import (
    AUTOMATION_KEYS,
    CANONICAL_DIMENSION_KEYS,
    AutomationCandidateSummary,
    AutomationEvaluateRequest,
    AutomationEvaluateResponse,
    BehavioralSignalCreate,
    BehavioralSignalResponse,
    DecisionPreviewRequest,
    DecisionPreviewResponse,
    DestinationInterestItem,
    DimensionEntry,
    DimensionExplorerItem,
    DimensionExplorerResponse,
    ExperimentCreateRequest,
    ExperimentResponse,
    ExperimentStopRequest,
    ExperimentVariantStats,
    FatigueControlsUpdateRequest,
    FatigueOverviewResponse,
    FatigueUserCategoryItem,
    OptOutRequest,
    OptOutResponse,
    PerformanceAnalyticsResponse,
    PersonalizationOverviewResponse,
    PersonalizationProfileResponse,
    PreferenceResponse,
    PreferenceUpdateRequest,
    ProfileCorrectionRequest,
    ProfileLifecycleResponse,
    RenderedCopyVariant,
    RuleConfigSchema,
    RuleConfigUpdateRequest,
    RuleRollbackResponse,
    RulesListResponse,
    SegmentCreateRequest,
    SegmentMemberItem,
    SegmentMembersResponse,
    SegmentResponse,
    TierPerformanceMetrics,
)
from app.schemas.user import CurrentUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/personalization", tags=["Personalization Intelligence"])


# ============================================================================
# Shared Helpers
# ============================================================================

def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _snapshot_to_profile_response(
    snapshot: UserProfile20DSnapshot,
    profile: Optional[UserPersonalizationProfile],
    *,
    now: Optional[datetime] = None,
) -> PersonalizationProfileResponse:
    ref_now = now or datetime.now(timezone.utc)
    safe_dims = snapshot.to_safe_dimensions_dict(ref_now)
    dim_entries = {
        k: DimensionEntry(
            dimension_key=v["dimension_key"],
            display_name=v.get("display_name"),
            value=v.get("value", "unknown"),
            confidence=float(v.get("confidence", 0.0) or 0.0),
            source=v.get("source", "unknown"),
            updated_at=v.get("updated_at"),
            data_quality=v.get("data_quality", "unknown"),
            expiration_policy=v.get("expiration_policy"),
            expires_at=v.get("expires_at"),
            is_expired=bool(v.get("is_expired", False)),
            is_user_provided=bool(v.get("is_user_provided", False)),
            permission_granted=bool(v.get("permission_granted", True)),
            metadata={},
        )
        for k, v in safe_dims.items()
    }

    top_dests = [
        DestinationInterestItem(
            destination=str(item["destination"]),
            score=float(item.get("score", 0.0) or 0.0),
            confidence=float(item.get("confidence", 0.0) or 0.0),
            signal_count=int(item.get("signal_count", 0) or 0),
            search_count=int(item.get("search_count", 0) or 0),
            booking_count=int(item.get("booking_count", 0) or 0),
            is_explicit_favorite=bool(item.get("is_explicit_favorite", False)),
            last_signal_at=item.get("last_signal_at"),
        )
        for item in snapshot.top_destinations(limit=10)
    ]

    loc_consent = bool(profile.location_consent) if profile is not None else False
    home_city = profile.home_city if (profile is not None and loc_consent) else None
    travel_origin = profile.travel_origin if (profile is not None and loc_consent) else None

    return PersonalizationProfileResponse(
        user_id=snapshot.user_id,
        profile_version=snapshot.profile_version,
        personalization_enabled=snapshot.personalization_enabled,
        preferred_language=snapshot.preferred_language if snapshot.preferred_language in ("en", "bn") else "en",
        communication_tone=snapshot.communication_tone if snapshot.communication_tone in ("concise", "informative", "friendly", "formal") else "friendly",
        digest_frequency=snapshot.digest_frequency if snapshot.digest_frequency in ("daily", "weekly", "disabled") else "weekly",
        home_city=home_city,
        travel_origin=travel_origin,
        location_consent=loc_consent,
        travel_timeline_stage=snapshot.travel_timeline_stage,
        loyalty_tier=snapshot.loyalty_tier,
        activity_level=snapshot.activity_level,
        overall_confidence=float(snapshot.overall_confidence or 0.0),
        confidence_tier=snapshot.confidence_tier(),
        dimensions=dim_entries,
        top_destinations=top_dests,
        explicit_preferences=dict(snapshot.explicit_preferences or {}),
        explanation_summary=UserProfileService.get_profile_explanation(snapshot, now=ref_now),
        last_activity_at=profile.last_activity_at if profile else None,
        last_aggregated_at=profile.last_aggregated_at if profile else None,
        reset_at=profile.reset_at if profile else None,
    )


def _rule_to_schema(rule: Any) -> RuleConfigSchema:
    if isinstance(rule, dict):
        return RuleConfigSchema(
            id=rule.get("id"),
            version=int(rule.get("version", 1)),
            is_active=bool(rule.get("is_active", True)),
            weights=dict(rule.get("weights") or DEFAULT_RELEVANCE_WEIGHTS),
            dimension_configs=dict(rule.get("dimension_configs") or {}),
            timing_config=dict(rule.get("timing_config") or {}),
            fatigue_config=dict(rule.get("fatigue_config") or {}),
            ai_config=dict(rule.get("ai_config") or {}),
            decay_lambda=float(rule.get("decay_lambda", 0.08)),
            min_relevance_threshold=float(rule.get("min_relevance_threshold", 45.0)),
            min_confidence_threshold=float(rule.get("min_confidence_threshold", 30.0)),
            change_notes=rule.get("change_notes"),
            created_by=rule.get("created_by"),
            created_at=rule.get("created_at"),
        )
    return RuleConfigSchema(
        id=rule.id,
        version=int(rule.version),
        is_active=bool(rule.is_active),
        weights=dict(rule.weights_json or DEFAULT_RELEVANCE_WEIGHTS),
        dimension_configs=dict(rule.dimension_configs_json or {}),
        timing_config=dict(rule.timing_config_json or {}),
        fatigue_config=dict(rule.fatigue_config_json or {}),
        ai_config=dict(rule.ai_config_json or {}),
        decay_lambda=float(rule.decay_lambda),
        min_relevance_threshold=float(rule.min_relevance_threshold),
        min_confidence_threshold=float(rule.min_confidence_threshold),
        change_notes=rule.change_notes,
        created_by=rule.created_by,
        created_at=rule.created_at,
    )


def _build_synthetic_persona_preview_state(
    preset: str,
    now: datetime,
) -> tuple[UserProfile20DSnapshot, Dict[str, Any], float, str]:
    """Build an in-memory 20D snapshot & preference state for Admin AI Lab preview."""
    uid = uuid.UUID("00000000-0000-0000-0000-000000000001")
    dims = build_empty_dimensions_map(personalization_enabled=True, location_consent=False)

    def _set_dim(key: str, val: Any, conf: float = 85.0, src: str = "user_preference", user_prov: bool = True) -> None:
        dims[key] = DimensionValue(
            dimension_key=key,
            value=val,
            confidence=conf,
            source=src,
            updated_at=now - timedelta(days=2),
            data_quality=compute_data_quality(val, conf, src),
            is_user_provided=user_prov,
            permission_granted=True,
        )

    notif_pref: Dict[str, Any] = {
        "push_enabled": True,
        "email_enabled": True,
        "sms_enabled": False,
        "in_app_enabled": True,
        "category_booking": True,
        "category_security": True,
        "category_flight_alerts": True,
        "category_marketing": True,
        "category_community": True,
        "category_price_alerts": True,
        "quiet_hours_enabled": True,
        "quiet_hours_start": "22:00",
        "quiet_hours_end": "07:00",
        "timezone": "Asia/Dhaka",
        "frequency_cap_marketing_per_day": 3,
    }

    lang = "en"
    tone = "friendly"
    timeline = "searching_for_trip"
    activity = "active"
    loyalty = "silver"
    overall_conf = 82.0
    fatigue_score = 12.0
    dest_interests: Dict[str, Dict[str, Any]] = {}
    cat_eng: Dict[str, Dict[str, Any]] = {"marketing": {"affinity_score": 68.0}}
    pers_enabled = True

    if preset == "family_midrange":
        label = "User A: Family Mid-Range"
        dest_interests = {
            "Sylhet": {"score": 86.0, "confidence": 90.0, "signal_count": 7, "search_count": 4, "booking_count": 1, "is_explicit_favorite": True},
            "Cox's Bazar": {"score": 72.0, "confidence": 85.0, "signal_count": 4, "search_count": 2, "booking_count": 0, "is_explicit_favorite": False},
        }
        _set_dim("destination_interest", {"top_destination": "Sylhet", "travel_interests": ["nature", "tea_gardens"]})
        _set_dim("travel_style", {"styles": ["family", "nature", "relaxation"]})
        _set_dim("budget_profile", {"tier": "mid_range"})
        _set_dim("transport_preference", {"preferred_modes": ["train", "flight"], "primary_mode": "train"})
        _set_dim("accommodation_preference", {"types": ["family_hotel", "resort"], "amenities": ["breakfast", "family_room"]})
        _set_dim("time_preference", {"preferred_send_window": "evening"})
        _set_dim("travel_timeline", {"stage": "searching_for_trip"}, 78.0, "behavioral", False)
    elif preset == "budget_student":
        label = "User B: Budget Traveler"
        tone = "concise"
        dest_interests = {"Cox's Bazar": {"score": 78.0, "confidence": 82.0, "signal_count": 5, "search_count": 4, "booking_count": 0, "is_explicit_favorite": True}}
        _set_dim("destination_interest", {"top_destination": "Cox's Bazar", "travel_interests": ["beach", "budget"]})
        _set_dim("travel_style", {"styles": ["solo", "budget"]})
        _set_dim("budget_profile", {"tier": "budget"})
        _set_dim("transport_preference", {"preferred_modes": ["bus", "train"], "primary_mode": "bus"})
        _set_dim("price_sensitivity", {"level": "high", "score": 90.0}, 88.0, "behavioral", False)
        _set_dim("time_preference", {"preferred_send_window": "afternoon"})
    elif preset == "premium_luxury":
        label = "User C: Premium / Luxury"
        tone = "formal"
        loyalty = "diamond"
        overall_conf = 90.0
        dest_interests = {"Dubai": {"score": 88.0, "confidence": 92.0, "signal_count": 6, "search_count": 3, "booking_count": 2, "is_explicit_favorite": True}}
        _set_dim("destination_interest", {"top_destination": "Dubai", "travel_interests": ["luxury", "wellness"]})
        _set_dim("travel_style", {"styles": ["couple", "luxury", "relaxation"]})
        _set_dim("budget_profile", {"tier": "luxury"})
        _set_dim("transport_preference", {"preferred_modes": ["flight"], "primary_mode": "flight"})
        _set_dim("accommodation_preference", {"types": ["premium_hotel", "resort"], "amenities": ["pool", "breakfast"]})
        _set_dim("time_preference", {"preferred_send_window": "evening"})
    elif preset == "adventure_solo":
        label = "User D: Adventure Solo"
        dest_interests = {"Sajek": {"score": 84.0, "confidence": 86.0, "signal_count": 6, "search_count": 4, "booking_count": 1, "is_explicit_favorite": True}}
        _set_dim("destination_interest", {"top_destination": "Sajek", "travel_interests": ["mountains", "trekking"]})
        _set_dim("travel_style", {"styles": ["solo", "adventure", "nature"]})
        _set_dim("budget_profile", {"tier": "economy"})
        _set_dim("transport_preference", {"preferred_modes": ["bus"], "primary_mode": "bus"})
        _set_dim("accommodation_preference", {"types": ["eco_stay"], "primary_type": "eco_stay"})
    elif preset == "inactive_dormant":
        label = "User E: Inactive / Dormant"
        activity = "dormant"
        timeline = "no_planned_trip"
        overall_conf = 62.0
        fatigue_score = 5.0
        dest_interests = {"Sylhet": {"score": 54.0, "confidence": 65.0, "signal_count": 3, "search_count": 2, "booking_count": 1, "is_explicit_favorite": False}}
        _set_dim("destination_interest", {"top_destination": "Sylhet"}, 65.0, "behavioral", False)
        _set_dim("activity_level", {"stage": "dormant"}, 75.0, "behavioral", False)
    elif preset == "new_user":
        label = "User F: New User (Low Confidence)"
        activity = "new_user"
        timeline = "no_planned_trip"
        loyalty = "explorer"
        overall_conf = 0.0
        fatigue_score = 0.0
    elif preset == "deal_seeker":
        label = "User G: Engaged Deal Seeker"
        activity = "highly_active"
        overall_conf = 88.0
        dest_interests = {"Bangkok": {"score": 80.0, "confidence": 85.0, "signal_count": 8, "search_count": 6, "booking_count": 1, "is_explicit_favorite": True}}
        _set_dim("destination_interest", {"top_destination": "Bangkok"})
        _set_dim("price_sensitivity", {"level": "high", "score": 95.0, "price_alert_count": 3}, 92.0, "behavioral", False)
        _set_dim("time_preference", {"preferred_send_window": "morning"})
        cat_eng = {"marketing": {"affinity_score": 92.0}, "price_alerts": {"affinity_score": 96.0}}
    else:  # fatigued_opted_out
        label = "User H: Fatigued / Promo Opt-Out"
        fatigue_score = 86.0
        overall_conf = 75.0
        notif_pref["category_marketing"] = False
        _set_dim("notification_tolerance", {"fatigue_score": 86.0}, 90.0, "behavioral", False)

    snapshot = UserProfile20DSnapshot(
        user_id=uid,
        profile_version=1,
        personalization_enabled=pers_enabled,
        dimensions=dims,
        destination_interests=dest_interests,
        category_engagement=cat_eng,
        fatigue_by_category={"marketing": {"fatigue_score": fatigue_score}},
        preferred_language=lang,
        communication_tone=tone,
        digest_frequency="weekly",
        activity_level=activity,
        travel_timeline_stage=timeline,
        loyalty_tier=loyalty,
        overall_confidence=overall_conf,
        built_at=now,
    )
    return snapshot, notif_pref, fatigue_score, label


async def _compute_fatigue_overview(db: AsyncSession) -> FatigueOverviewResponse:
    rule_cfg = await RelevanceEngine.get_active_rule_config(db)
    f_cfg = dict(rule_cfg.get("fatigue_config") or {})
    global_cap = int(f_cfg.get("global_daily_marketing_cap", 3))
    high_thresh = float(f_cfg.get("high_fatigue_threshold", 65.0))
    cooldown_hours = int(f_cfg.get("cooldown_hours", 24))

    rows = list((await db.scalars(select(UserNotificationFatigue))).all())
    high_entries = [r for r in rows if float(r.fatigue_score or 0.0) >= high_thresh]
    high_users = len({r.user_id for r in high_entries})

    exceeding_users = len(
        {
            r.user_id
            for r in rows
            if r.category in ("marketing", "discovery", "digest")
            and int(r.received_24h or 0) >= global_cap
            and global_cap > 0
        }
    )
    avg_fatigue = (
        round(sum(float(r.fatigue_score or 0.0) for r in rows) / len(rows), 2)
        if rows
        else 0.0
    )

    cat_breakdown: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        b = cat_breakdown.setdefault(
            r.category,
            {
                "users_count": 0,
                "received_24h": 0,
                "received_7d": 0,
                "opened_7d": 0,
                "clicked_7d": 0,
                "dismissed_7d": 0,
                "ignored_7d": 0,
                "avg_fatigue_score": 0.0,
                "_sum_fatigue": 0.0,
            },
        )
        b["users_count"] += 1
        b["received_24h"] += int(r.received_24h or 0)
        b["received_7d"] += int(r.received_7d or 0)
        b["opened_7d"] += int(r.opened_7d or 0)
        b["clicked_7d"] += int(r.clicked_7d or 0)
        b["dismissed_7d"] += int(r.dismissed_7d or 0)
        b["ignored_7d"] += int(r.ignored_7d or 0)
        b["_sum_fatigue"] += float(r.fatigue_score or 0.0)

    for cat, stats in cat_breakdown.items():
        cnt = max(1, stats["users_count"])
        stats["avg_fatigue_score"] = round(stats.pop("_sum_fatigue") / cnt, 2)

    sorted_high = sorted(
        high_entries, key=lambda r: float(r.fatigue_score or 0.0), reverse=True
    )[:50]
    return FatigueOverviewResponse(
        high_fatigue_users_count=high_users,
        users_exceeding_caps_count=exceeding_users,
        avg_fatigue_score=avg_fatigue,
        global_daily_marketing_cap=global_cap,
        high_fatigue_threshold=high_thresh,
        cooldown_hours=cooldown_hours,
        category_breakdown=cat_breakdown,
        high_fatigue_entries=[
            FatigueUserCategoryItem(
                user_id=r.user_id,
                category=r.category,
                fatigue_score=float(r.fatigue_score or 0.0),
                received_24h=int(r.received_24h or 0),
                received_7d=int(r.received_7d or 0),
                opened_7d=int(r.opened_7d or 0),
                clicked_7d=int(r.clicked_7d or 0),
                dismissed_7d=int(r.dismissed_7d or 0),
                ignored_7d=int(r.ignored_7d or 0),
                opt_out_count=int(r.opt_out_count or 0),
                cooldown_until=r.cooldown_until,
                last_sent_at=r.last_sent_at,
            )
            for r in sorted_high
        ],
    )


async def _experiment_to_response(
    db: AsyncSession,
    exp: PersonalizationExperiment,
    *,
    now: Optional[datetime] = None,
) -> ExperimentResponse:
    assignments = list(
        (
            await db.scalars(
                select(PersonalizationExperimentAssignment).where(
                    PersonalizationExperimentAssignment.experiment_id == exp.id
                )
            )
        ).all()
    )
    eval_res = ExperimentEngine.evaluate_experiment_stats(
        assignments=assignments,
        variants=exp.variants_json,
        min_sample_size=exp.min_sample_size,
        max_duration_days=exp.max_duration_days,
        opt_out_stop_threshold=exp.opt_out_stop_threshold,
        started_at=exp.started_at,
        now=now,
    )

    rec_adjustments: Dict[str, float] = {}
    if assignments and eval_res.get("winning_variant"):
        rule_cfg = await RelevanceEngine.get_active_rule_config(db)
        weights = dict(rule_cfg.get("weights") or DEFAULT_RELEVANCE_WEIGHTS)
        lift_sign = 0.4 if eval_res["winning_variant"] != "control" else -0.2
        signals_hint = {
            "DestinationInterest": lift_sign,
            "TravelStyleMatch": lift_sign * 0.8,
            "BudgetMatch": lift_sign * 0.5,
        }
        try:
            proposal = ExperimentEngine.propose_bounded_weight_adjustments(
                weights, signals_hint
            )
            proposed = proposal.get("proposed_weights") or {}
            rec_adjustments = {
                k: round(float(proposed[k]) - float(weights[k]), 6)
                for k in weights
                if k in proposed
            }
        except Exception:
            rec_adjustments = {}

    summary = dict(exp.results_summary or {})
    summary.update(
        {
            "comparisons_vs_control": eval_res.get("comparisons_vs_control", {}),
            "min_sample_size_met": eval_res.get("min_sample_size_met", False),
            "should_stop": eval_res.get("should_stop", False),
            "stop_reason": eval_res.get("stop_reason"),
            "winning_variant": eval_res.get("winning_variant"),
        }
    )

    return ExperimentResponse(
        id=exp.id,
        key=exp.key,
        name=exp.name,
        hypothesis=exp.hypothesis or "",
        experiment_type=exp.experiment_type,
        status=exp.status,
        variants=list(exp.variants_json or []),
        min_sample_size=int(exp.min_sample_size),
        max_duration_days=int(exp.max_duration_days),
        opt_out_stop_threshold=float(exp.opt_out_stop_threshold),
        started_at=exp.started_at,
        ended_at=exp.ended_at,
        results_summary=summary,
        variant_stats=[
            ExperimentVariantStats(
                variant=str(vs["variant"]),
                exposures=int(vs.get("exposures", 0)),
                opens=int(vs.get("opens", 0)),
                clicks=int(vs.get("clicks", 0)),
                conversions=int(vs.get("conversions", 0)),
                opt_outs=int(vs.get("opt_outs", 0)),
                revenue_paisa=int(vs.get("revenue_paisa", 0)),
                conversion_rate=float(vs.get("conversion_rate", 0.0)),
                ci_95_lower=float(vs.get("ci_95_lower", 0.0)),
                ci_95_upper=float(vs.get("ci_95_upper", 0.0)),
            )
            for vs in eval_res.get("variant_stats", [])
        ],
        recommended_weight_adjustments=rec_adjustments,
        created_at=exp.created_at,
    )


# ============================================================================
# User Personalization Endpoints (`get_current_user`)
# ============================================================================

@router.get(
    "/preferences",
    response_model=PreferenceResponse,
    summary="Get authenticated user's explicit travel & notification preferences",
)
async def get_my_preferences(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PreferenceResponse:
    payload = await UserProfileService.get_preferences_payload(db, current_user.id)
    await db.commit()
    return PreferenceResponse(**payload)


@router.put(
    "/preferences",
    response_model=PreferenceResponse,
    summary="Update authenticated user's travel & notification preferences",
)
@limiter.limit("60/minute")
async def update_my_preferences(
    request: Request,
    payload: PreferenceUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PreferenceResponse:
    try:
        updates = payload.model_dump(exclude_unset=True)
        await UserProfileService.update_explicit_preferences(
            db,
            current_user.id,
            updates,
            reason="user_preferences_api_update",
        )
        await db.commit()
        merged = await UserProfileService.get_preferences_payload(db, current_user.id)
        return PreferenceResponse(**merged)
    except ValueError as exc:
        await db.rollback()
        raise BadRequestError(str(exc), code="INVALID_PREFERENCE_UPDATE") from exc


@router.get(
    "/profile",
    response_model=PersonalizationProfileResponse,
    summary="Get authenticated user's 20-dimensional intelligence profile",
)
async def get_my_profile(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PersonalizationProfileResponse:
    now = datetime.now(timezone.utc)
    profile = await UserProfileService.get_or_create_profile(db, current_user.id)
    snapshot = await UserProfileService.build_20d_snapshot(db, current_user.id, now=now)
    await db.commit()
    return _snapshot_to_profile_response(snapshot, profile, now=now)


@router.patch(
    "/profile/correct",
    response_model=PersonalizationProfileResponse,
    summary="Correct or remove an inferred personalization dimension",
)
@limiter.limit("60/minute")
async def correct_my_profile_dimension(
    request: Request,
    payload: ProfileCorrectionRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PersonalizationProfileResponse:
    now = datetime.now(timezone.utc)
    try:
        snapshot = await UserProfileService.correct_inferred_dimension(
            db,
            current_user.id,
            payload.dimension_key,
            action=payload.action,
            corrected_value=payload.corrected_value,
            reason=payload.reason,
            now=now,
        )
        await db.commit()
        profile = await UserProfileService.get_or_create_profile(db, current_user.id)
        return _snapshot_to_profile_response(snapshot, profile, now=now)
    except ValueError as exc:
        await db.rollback()
        raise BadRequestError(str(exc), code="INVALID_DIMENSION_CORRECTION") from exc


@router.post(
    "/signals",
    response_model=BehavioralSignalResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest a permitted behavioral signal for incremental profile scoring",
)
@limiter.limit("180/minute")
async def record_behavioral_signal(
    request: Request,
    payload: BehavioralSignalCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BehavioralSignalResponse:
    try:
        res = await BehavioralSignalService.ingest_signal(
            db,
            user_id=current_user.id,
            signal_type=payload.signal_type,
            category=payload.category,
            destination=payload.destination,
            route_key=payload.route_key,
            product_type=payload.product_type,
            price_paisa=payload.price_paisa,
            currency=payload.currency,
            filters=payload.filters,
            occurred_at=payload.occurred_at,
            metadata=payload.metadata,
            auto_update_profile=True,
        )
        await db.commit()
        return BehavioralSignalResponse(
            success=True,
            signal_id=res.signal_id,
            recorded=res.recorded,
            profile_version=res.profile_version,
            updated_dimensions=list(res.updated_dimensions),
            message=res.message,
        )
    except ValueError as exc:
        await db.rollback()
        raise BadRequestError(str(exc), code="INVALID_BEHAVIORAL_SIGNAL") from exc


@router.post(
    "/opt-out",
    response_model=OptOutResponse,
    summary="Opt out of marketing, personalization, or a specific category/channel",
)
@limiter.limit("60/minute")
async def opt_out_personalization(
    request: Request,
    payload: OptOutRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OptOutResponse:
    try:
        res = await UserProfileService.opt_out(
            db,
            current_user.id,
            scope=payload.scope,
            target=payload.target,
            reason=payload.reason,
        )
        await db.commit()
        return OptOutResponse(**res)
    except ValueError as exc:
        await db.rollback()
        raise BadRequestError(str(exc), code="INVALID_OPT_OUT") from exc


@router.post(
    "/reset",
    response_model=ProfileLifecycleResponse,
    summary="Reset user personalization profile and behavioral scores to unknown baseline",
)
@limiter.limit("30/minute")
async def reset_my_profile(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileLifecycleResponse:
    res = await UserProfileService.reset_profile(
        db, current_user.id, reason="user_requested_reset"
    )
    await db.commit()
    return ProfileLifecycleResponse(**res)


@router.delete(
    "/profile",
    response_model=ProfileLifecycleResponse,
    summary="Permanently delete user personalization profile and behavioral history",
)
@limiter.limit("30/minute")
async def delete_my_profile(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileLifecycleResponse:
    res = await PrivacyAndConsentGuard.delete_user_personalization(db, current_user.id)
    await db.commit()
    return ProfileLifecycleResponse(**res)


# ============================================================================
# Admin Personalization Command Center (`require_admin`)
# ============================================================================

@router.get(
    "/admin/overview",
    response_model=PersonalizationOverviewResponse,
    summary="Admin overview metrics across profiles, decisions, AI assist, fatigue, and conversions",
)
async def admin_personalization_overview(
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> PersonalizationOverviewResponse:
    now = datetime.now(timezone.utc)
    cutoff_24h = now - timedelta(hours=24)
    cutoff_30d = now - timedelta(days=30)

    profiles = list((await db.scalars(select(UserPersonalizationProfile))).all())
    total_profiles = len(profiles)
    sufficient = sum(1 for p in profiles if float(p.overall_confidence or 0.0) >= 35.0)
    incomplete = total_profiles - sufficient
    enabled_cnt = sum(1 for p in profiles if bool(p.personalization_enabled))

    decisions_24h = list(
        (
            await db.scalars(
                select(PersonalizationDecisionLog).where(
                    PersonalizationDecisionLog.created_at >= cutoff_24h
                )
            )
        ).all()
    )
    total_dec_24h = len(decisions_24h)
    ai_cnt_24h = sum(1 for d in decisions_24h if bool(d.ai_used))
    avg_rel = (
        round(sum(float(d.relevance_score or 0.0) for d in decisions_24h) / total_dec_24h, 2)
        if total_dec_24h
        else 0.0
    )
    avg_conf = (
        round(sum(float(d.confidence_score or 0.0) for d in decisions_24h) / total_dec_24h, 2)
        if total_dec_24h
        else 0.0
    )
    suppressed_cnt = sum(1 for d in decisions_24h if not bool(d.eligibility_passed))
    supp_rate = (
        round((suppressed_cnt / total_dec_24h) * 100.0, 2) if total_dec_24h else 0.0
    )

    fatigue_rows = list((await db.scalars(select(UserNotificationFatigue))).all())
    fat_dist = {"low": 0, "medium": 0, "high": 0}
    for fr in fatigue_rows:
        sc = float(fr.fatigue_score or 0.0)
        if sc >= 65.0:
            fat_dist["high"] += 1
        elif sc >= 35.0:
            fat_dist["medium"] += 1
        else:
            fat_dist["low"] += 1

    conv_rows = list(
        (
            await db.execute(
                select(
                    PersonalizationDecisionLog.converted,
                    PersonalizationDecisionLog.revenue_paisa,
                ).where(
                    PersonalizationDecisionLog.created_at >= cutoff_30d,
                    PersonalizationDecisionLog.converted.is_(True),
                )
            )
        ).all()
    )
    conv_cnt = len(conv_rows)
    rev_paisa = sum(int(r.revenue_paisa or 0) for r in conv_rows)

    active_cfg = await RelevanceEngine.get_active_rule_config(db)

    return PersonalizationOverviewResponse(
        total_profiles=total_profiles,
        profiles_sufficient_data=sufficient,
        profiles_incomplete_data=incomplete,
        personalization_enabled_count=enabled_cnt,
        total_decisions_24h=total_dec_24h,
        ai_assisted_count_24h=ai_cnt_24h,
        avg_relevance_score=avg_rel,
        avg_confidence_score=avg_conf,
        suppression_rate_pct=supp_rate,
        fatigue_distribution=fat_dist,
        conversion_count_30d=conv_cnt,
        attributed_revenue_paisa_30d=rev_paisa,
        active_rule_version=int(active_cfg.get("version", 1)),
    )


@router.get(
    "/admin/dimensions",
    response_model=DimensionExplorerResponse,
    summary="Inspect coverage, confidence, quality, and freshness across all 20 dimensions",
)
async def admin_explore_dimensions(
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> DimensionExplorerResponse:
    now = datetime.now(timezone.utc)
    total_profiles = int(
        (await db.scalar(select(func.count(UserPersonalizationProfile.id)))) or 0
    )
    dims = list((await db.scalars(select(UserProfileDimension))).all())

    by_key: Dict[str, List[UserProfileDimension]] = {k: [] for k in CANONICAL_DIMENSION_KEYS}
    for row in dims:
        if row.dimension_key in by_key:
            by_key[row.dimension_key].append(row)

    items: List[DimensionExplorerItem] = []
    for key in CANONICAL_DIMENSION_KEYS:
        rows = by_key[key]
        active_rows = []
        for r in rows:
            exp = _ensure_utc(r.expires_at)
            if exp is not None and exp <= now:
                continue
            if float(r.confidence or 0.0) <= 0.0 or r.value_json == "unknown":
                continue
            active_rows.append(r)

        cov_cnt = len(active_rows)
        cov_pct = round((cov_cnt / total_profiles) * 100.0, 2) if total_profiles > 0 else 0.0
        avg_conf = (
            round(sum(float(r.confidence or 0.0) for r in active_rows) / cov_cnt, 2)
            if cov_cnt > 0
            else 0.0
        )

        src_dist: Dict[str, int] = {}
        qual_dist: Dict[str, int] = {}
        top_vals: Dict[str, int] = {}
        user_prov_cnt = 0
        perm_cnt = 0
        latest_upd: Optional[datetime] = None

        for r in active_rows:
            src_dist[r.source] = src_dist.get(r.source, 0) + 1
            qual_dist[r.data_quality] = qual_dist.get(r.data_quality, 0) + 1
            if r.is_user_provided:
                user_prov_cnt += 1
            if r.permission_granted:
                perm_cnt += 1
            upd = _ensure_utc(r.updated_at)
            if upd is not None and (latest_upd is None or upd > latest_upd):
                latest_upd = upd

            # Strict PII safety: never aggregate raw location strings or sensitive payloads
            if key not in ("location_context", "profile_context", "consent_communication_preferences"):
                val = r.value_json
                label: Optional[str] = None
                if isinstance(val, dict):
                    label = (
                        val.get("tier")
                        or val.get("stage")
                        or val.get("top_destination")
                        or val.get("primary_mode")
                        or val.get("language")
                        or val.get("level")
                    )
                elif isinstance(val, str):
                    label = val
                if label:
                    s_lbl = str(label)[:60]
                    top_vals[s_lbl] = top_vals.get(s_lbl, 0) + 1

        # Keep top 5 summary counts
        top_vals = dict(sorted(top_vals.items(), key=lambda kv: kv[1], reverse=True)[:5])

        items.append(
            DimensionExplorerItem(
                dimension_key=key,
                coverage_count=cov_cnt,
                coverage_pct=cov_pct,
                avg_confidence=avg_conf,
                source_distribution=src_dist,
                quality_distribution=qual_dist,
                user_provided_count=user_prov_cnt,
                permission_granted_count=perm_cnt,
                top_values_summary=top_vals,
                last_updated_at=latest_upd,
            )
        )

    return DimensionExplorerResponse(total_profiles=total_profiles, dimensions=items)


@router.get(
    "/admin/rules",
    response_model=RulesListResponse,
    summary="Fetch active personalization rule configuration and version history",
)
async def admin_get_rules(
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> RulesListResponse:
    rows = list(
        (
            await db.scalars(
                select(PersonalizationRuleConfig).order_by(
                    PersonalizationRuleConfig.version.desc()
                )
            )
        ).all()
    )
    active_dict = await RelevanceEngine.get_active_rule_config(db)
    active_schema = _rule_to_schema(active_dict)
    history = [_rule_to_schema(r) for r in rows] if rows else [active_schema]
    return RulesListResponse(active_rule=active_schema, history=history)


@router.put(
    "/admin/rules",
    response_model=RuleConfigSchema,
    summary="Publish a new versioned personalization rule configuration",
)
async def admin_update_rules(
    payload: RuleConfigUpdateRequest,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> RuleConfigSchema:
    try:
        new_rule = await RelevanceEngine.publish_rule_config(
            db,
            weights=payload.weights,
            dimension_configs=payload.dimension_configs,
            timing_config=payload.timing_config,
            fatigue_config=payload.fatigue_config,
            ai_config=payload.ai_config,
            decay_lambda=payload.decay_lambda,
            min_relevance_threshold=payload.min_relevance_threshold,
            min_confidence_threshold=payload.min_confidence_threshold,
            created_by=current_admin.id,
            change_notes=payload.change_notes,
        )
        await db.commit()
        await db.refresh(new_rule)
        return _rule_to_schema(new_rule)
    except ValueError as exc:
        await db.rollback()
        raise BadRequestError(str(exc), code="INVALID_RULE_CONFIG") from exc


@router.post(
    "/admin/rules/rollback/{version}",
    response_model=RuleRollbackResponse,
    summary="Rollback active personalization rules to a previous version",
)
async def admin_rollback_rules(
    version: int,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> RuleRollbackResponse:
    try:
        prev_ver, target_row = await RelevanceEngine.rollback_rule_config(db, version)
        await db.commit()
        await db.refresh(target_row)
        return RuleRollbackResponse(
            success=True,
            rolled_back_from_version=prev_ver,
            active_version=int(target_row.version),
            active_rule=_rule_to_schema(target_row),
            message=f"Rolled back personalization rules to version {target_row.version}.",
        )
    except ValueError as exc:
        await db.rollback()
        raise NotFoundError("RuleConfig", version) from exc


@router.post(
    "/admin/preview",
    response_model=DecisionPreviewResponse,
    summary="Preview decision pipeline and AI copy side-by-side (PREVIEW ONLY — NEVER SENDS)",
)
@limiter.limit("60/minute")
async def admin_preview_decision(
    request: Request,
    payload: DecisionPreviewRequest,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> DecisionPreviewResponse:
    now = datetime.now(timezone.utc)
    if payload.user_id is not None:
        snapshot = await UserProfileService.build_20d_snapshot(db, payload.user_id, now=now)
        notif_pref: Any = await db.scalar(
            select(NotificationUserPreference).where(
                NotificationUserPreference.user_id == payload.user_id
            )
        )
        cat_fat = await db.scalar(
            select(UserNotificationFatigue).where(
                UserNotificationFatigue.user_id == payload.user_id,
                UserNotificationFatigue.category == payload.category.lower(),
            )
        )
        fatigue_score = float(cat_fat.fatigue_score) if cat_fat else 0.0
        target_label = f"User {payload.user_id}"
    else:
        preset = payload.persona_preset or "family_midrange"
        snapshot, notif_pref, fatigue_score, target_label = _build_synthetic_persona_preview_state(
            preset, now
        )

    rule_cfg = await RelevanceEngine.get_active_rule_config(db)
    weights = dict(rule_cfg.get("weights") or DEFAULT_RELEVANCE_WEIGHTS)
    ai_cfg = dict(rule_cfg.get("ai_config") or {})
    timing_engine = AdaptiveTimingEngine.from_rule_config(rule_cfg.get("timing_config"))
    fatigue_engine = FatigueEngine.from_rule_config(rule_cfg.get("fatigue_config"))

    candidate = NotificationCandidate(
        event_type=payload.event_type,
        category=payload.category,
        title=payload.base_title,
        body=payload.base_body,
        destination=payload.destination,
        travel_styles=payload.travel_styles,
        budget_tier=payload.budget_tier,
        price_paisa=payload.price_paisa,
        discount_pct=payload.discount_pct,
        transport_mode=payload.transport_mode,
        priority=payload.priority,
    )

    rel_res = RelevanceEngine.evaluate(
        snapshot,
        candidate,
        weights=weights,
        rule_version=int(rule_cfg.get("version", 1)),
        min_relevance_threshold=float(rule_cfg.get("min_relevance_threshold", 45.0)),
        min_confidence_threshold=float(rule_cfg.get("min_confidence_threshold", 30.0)),
        now=now,
    )

    is_critical = PrivacyAndConsentGuard.is_critical_notification(
        event_type=payload.event_type,
        category=payload.category,
        priority=payload.priority,
    )
    consent = PrivacyAndConsentGuard.evaluate_consent(
        event_type=payload.event_type,
        category=payload.category,
        priority=payload.priority,
        notification_pref=notif_pref,
        personalization_profile=snapshot,
    )

    fat_dec = fatigue_engine.evaluate_fatigue(
        category=payload.category,
        event_type=payload.event_type,
        priority=payload.priority,
        is_critical=is_critical,
        user_fatigue_score=fatigue_score,
        category_fatigue_score=fatigue_score,
        now_utc=now,
    )

    suppression_reason: Optional[str] = None
    eligibility_passed = True
    if not consent.allowed:
        eligibility_passed = False
        suppression_reason = consent.reason or "consent_denied"
    elif fat_dec.should_suppress and not is_critical:
        eligibility_passed = False
        suppression_reason = fat_dec.suppression_reason or "fatigue_suppressed"
    elif (
        not is_critical
        and payload.category.lower() in ("marketing", "promo", "discovery")
        and not rel_res.meets_relevance_threshold
        and rel_res.confidence_score >= float(rule_cfg.get("min_confidence_threshold", 30.0))
    ):
        eligibility_passed = False
        suppression_reason = f"below_relevance_threshold:{rel_res.relevance_score}"

    tz_name = (
        notif_pref.get("timezone", "Asia/Dhaka")
        if isinstance(notif_pref, dict)
        else getattr(notif_pref, "timezone", "Asia/Dhaka")
    )
    q_enabled = (
        bool(notif_pref.get("quiet_hours_enabled", False))
        if isinstance(notif_pref, dict)
        else bool(getattr(notif_pref, "quiet_hours_enabled", False))
    )
    q_start = (
        notif_pref.get("quiet_hours_start", "22:00")
        if isinstance(notif_pref, dict)
        else getattr(notif_pref, "quiet_hours_start", "22:00")
    )
    q_end = (
        notif_pref.get("quiet_hours_end", "07:00")
        if isinstance(notif_pref, dict)
        else getattr(notif_pref, "quiet_hours_end", "07:00")
    )

    tp_dim = snapshot.get_dimension("time_preference")
    tp_val = tp_dim.value if isinstance(tp_dim.value, dict) else {}
    explicit_tp = (
        {"preferred_send_window": tp_val.get("preferred_send_window")}
        if tp_val.get("preferred_send_window")
        else None
    )
    timing_dec = timing_engine.select_optimal_send_time(
        category=payload.category,
        event_type=payload.event_type,
        priority=payload.priority,
        is_critical=is_critical,
        user_timezone=tz_name,
        explicit_time_preference=explicit_tp,
        quiet_hours_enabled=q_enabled,
        quiet_hours_start=q_start,
        quiet_hours_end=q_end,
        confidence_score=rel_res.confidence_score,
        now_utc=now,
    )

    marketing_opt_in = (
        notif_pref.get("category_marketing", True)
        if isinstance(notif_pref, dict)
        else getattr(notif_pref, "category_marketing", True)
    )
    consent_dict = {
        "personalization_enabled": consent.personalization_allowed,
        "marketing_opt_in": bool(marketing_opt_in),
        **{f"{b_ch}_consent": False for b_ch in consent.blocked_channels},
    }
    ch_res = ChannelSelector().select_channels(
        category=payload.category,
        event_type=payload.event_type,
        priority=payload.priority,
        is_critical=is_critical,
        preferences=notif_pref,
        server_side_consent=consent_dict,
        has_active_push_token=True,
        has_email=True,
        has_phone=False,
        fatigue_score=fatigue_score,
    )
    if eligibility_passed and not ch_res.selected_channels:
        eligibility_passed = False
        suppression_reason = ch_res.reason or "no_eligible_channel"

    top_dests = snapshot.top_destinations(limit=1)
    style_val = snapshot.get_value("travel_style", default="unknown", now=now)
    budget_val = snapshot.get_value("budget_profile", default="unknown", now=now)
    trans_val = snapshot.get_value("transport_preference", default="unknown", now=now)
    lang = payload.language_override or snapshot.preferred_language or "en"

    safe_ctx = {
        "preferred_language": lang,
        "communication_tone": snapshot.communication_tone,
        "top_destination": top_dests[0]["destination"] if top_dests else payload.destination,
        "destination": payload.destination or (top_dests[0]["destination"] if top_dests else None),
        "budget_tier": (
            budget_val.get("tier") if isinstance(budget_val, dict) else payload.budget_tier
        ),
        "travel_styles": (
            style_val.get("styles", []) if isinstance(style_val, dict) else payload.travel_styles
        ),
        "transport_preference": (
            trans_val.get("primary_mode") if isinstance(trans_val, dict) else payload.transport_mode
        ),
        "activity_level": snapshot.activity_level,
        "is_new_user": snapshot.activity_level == "new_user",
    }
    facts = {
        **payload.verified_facts,
        "title": payload.base_title,
        "body": payload.base_body,
        "destination": payload.destination or safe_ctx.get("destination"),
        "deep_link": payload.deep_link,
    }
    if payload.price_paisa is not None:
        facts.setdefault("price_paisa", payload.price_paisa)
    if payload.discount_pct is not None:
        facts.setdefault("discount_percent", payload.discount_pct)

    comp = await AIPersonalizationService.preview_comparison(
        event_type=payload.event_type,
        verified_facts=facts,
        profile_context=safe_ctx,
        language=lang,
        tone=snapshot.communication_tone,
        confidence_score=rel_res.confidence_score,
        allow_ai_enrichment=bool(payload.allow_ai_enrichment and snapshot.personalization_enabled),
        ai_config=ai_cfg,
    )

    pers_tier: str = (
        "suppressed"
        if not eligibility_passed
        else (rel_res.recommended_tier if snapshot.personalization_enabled else "generic")
    )

    gen_raw = comp["generic_variant"]
    pers_key = "deep_variant" if pers_tier == "deep" else ("light_variant" if pers_tier == "light" else "generic_variant")
    pers_raw = comp[pers_key]

    def _to_variant(raw: Dict[str, Any], tier_lbl: str) -> RenderedCopyVariant:
        l_code = "bn" if raw.get("language") == "bn" else "en"
        t_lbl = tier_lbl if tier_lbl in ("generic", "light", "deep", "suppressed") else "generic"
        return RenderedCopyVariant(
            language=l_code,
            tier=t_lbl,  # type: ignore[arg-type]
            title=str(raw.get("title") or payload.base_title),
            body=str(raw.get("body") or payload.base_body),
            cta=raw.get("cta"),
            deep_link=str(raw.get("deep_link") or payload.deep_link),
            push_short_title=raw.get("push_short_title"),
            push_short_body=raw.get("push_short_body"),
        )

    bilingual = {
        code: _to_variant(v, pers_tier if eligibility_passed else "generic")
        for code, v in comp.get("bilingual_variants", {}).items()
        if code in ("en", "bn")
    }

    factors = PrivacyAndConsentGuard.sanitize_explanation_factors(
        rel_res.matching_factors
        + [
            f"Confidence: {rel_res.confidence_score:.0f}/100 ({rel_res.confidence_tier})",
            f"Fatigue: {fatigue_score:.0f}/100",
            f"Timing: {timing_dec.reason}",
        ]
    )

    return DecisionPreviewResponse(
        preview_only=True,
        dispatched=False,
        target_label=target_label,
        eligibility_passed=eligibility_passed,
        suppression_reason=suppression_reason,
        relevance_score=rel_res.relevance_score,
        confidence_score=rel_res.confidence_score,
        fatigue_score=fatigue_score,
        personalization_tier=pers_tier,  # type: ignore[arg-type]
        selected_channel=(
            ch_res.selected_channels[0]
            if eligibility_passed and ch_res.selected_channels
            else None
        ),
        recommended_send_at=timing_dec.recommended_send_at if eligibility_passed else None,
        feature_breakdown=rel_res.feature_breakdown,
        explanation_factors=factors,
        ai_used=bool(comp.get("ai_used", False)),
        ai_provider=str(comp.get("ai_provider") or "deterministic_template"),
        fallback_used=bool(comp.get("fallback_used", False)),
        factual_validation_passed=bool(comp.get("factual_validation_passed", True)),
        factual_validation_errors=list(comp.get("factual_validation_errors") or []),
        estimated_tokens=int(comp.get("estimated_tokens", 0) or 0),
        estimated_cost_usd=float(comp.get("estimated_cost_usd", 0.0) or 0.0),
        generic_variant=_to_variant(gen_raw, "generic"),
        personalized_variant=_to_variant(pers_raw, pers_tier),
        bilingual_variants=bilingual,
    )


@router.get(
    "/admin/segments",
    response_model=List[SegmentResponse],
    summary="List all dynamic personalization segments (including 14 system presets)",
)
async def admin_list_segments(
    active_only: bool = Query(False),
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> List[SegmentResponse]:
    segments = await SegmentBuilderService.list_segments(db, active_only=active_only)
    await db.commit()
    return [SegmentResponse.model_validate(s) for s in segments]


@router.post(
    "/admin/segments",
    response_model=SegmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new server-side query-based dynamic segment",
)
async def admin_create_segment(
    payload: SegmentCreateRequest,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> SegmentResponse:
    existing = await db.scalar(
        select(PersonalizationSegment).where(PersonalizationSegment.key == payload.key)
    )
    if existing is not None:
        raise ConflictError(
            f"Segment with key '{payload.key}' already exists.",
            code="SEGMENT_KEY_EXISTS",
        )
    try:
        seg = await SegmentBuilderService.create_segment(
            db,
            key=payload.key,
            name=payload.name,
            description=payload.description,
            query_criteria=payload.query_criteria,
            is_active=payload.is_active,
        )
        await db.commit()
        await db.refresh(seg)
        return SegmentResponse.model_validate(seg)
    except ValueError as exc:
        await db.rollback()
        raise BadRequestError(str(exc), code="INVALID_SEGMENT_CRITERIA") from exc


@router.get(
    "/admin/segments/{segment_id}/members",
    response_model=SegmentMembersResponse,
    summary="Dynamically evaluate and paginate members of a segment by UUID or key",
)
async def admin_get_segment_members(
    segment_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> SegmentMembersResponse:
    parsed_uuid: Optional[uuid.UUID] = None
    try:
        parsed_uuid = uuid.UUID(segment_id)
    except ValueError:
        parsed_uuid = None

    try:
        res = await SegmentBuilderService.evaluate_segment_members(
            db,
            segment_id=parsed_uuid,
            segment_key=None if parsed_uuid is not None else segment_id,
            page=page,
            page_size=page_size,
            update_cache=True,
        )
        await db.commit()
        return SegmentMembersResponse(
            segment_key=res["segment_key"],
            total=res["total"],
            total_count=res["total"],
            page=res["page"],
            page_size=res["page_size"],
            members=[SegmentMemberItem(**m) for m in res["members"]],
        )
    except ValueError as exc:
        await db.rollback()
        raise NotFoundError("Segment", segment_id) from exc


@router.get(
    "/admin/fatigue",
    response_model=FatigueOverviewResponse,
    summary="Inspect high-fatigue users, cap breaches, and category engagement breakdown",
)
async def admin_get_fatigue_overview(
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> FatigueOverviewResponse:
    return await _compute_fatigue_overview(db)


@router.put(
    "/admin/fatigue/controls",
    response_model=FatigueOverviewResponse,
    summary="Update global fatigue caps, threshold, and cooldown controls",
)
async def admin_update_fatigue_controls(
    payload: FatigueControlsUpdateRequest,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> FatigueOverviewResponse:
    active_cfg = await RelevanceEngine.get_active_rule_config(db)
    fatigue_cfg = dict(active_cfg.get("fatigue_config") or {})
    fatigue_cfg.update(
        {
            "global_daily_marketing_cap": payload.global_daily_marketing_cap,
            "high_fatigue_threshold": payload.high_fatigue_threshold,
            "cooldown_hours": payload.cooldown_hours,
            "prefer_digest_on_high_fatigue": payload.prefer_digest_on_high_fatigue,
        }
    )
    await RelevanceEngine.publish_rule_config(
        db,
        weights=active_cfg.get("weights") or DEFAULT_RELEVANCE_WEIGHTS,
        dimension_configs=active_cfg.get("dimension_configs"),
        timing_config=active_cfg.get("timing_config"),
        fatigue_config=fatigue_cfg,
        ai_config=active_cfg.get("ai_config"),
        decay_lambda=float(active_cfg.get("decay_lambda", 0.08)),
        min_relevance_threshold=float(active_cfg.get("min_relevance_threshold", 45.0)),
        min_confidence_threshold=float(active_cfg.get("min_confidence_threshold", 30.0)),
        created_by=current_admin.id,
        change_notes=payload.change_notes or "Updated global fatigue & frequency cap controls",
    )
    await db.commit()
    return await _compute_fatigue_overview(db)


@router.get(
    "/admin/analytics",
    response_model=PerformanceAnalyticsResponse,
    summary="Compare Generic vs Light vs Deep personalization performance and suppression reasons",
)
async def admin_get_performance_analytics(
    window_days: int = Query(30, ge=1, le=365),
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> PerformanceAnalyticsResponse:
    cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)
    logs = list(
        (
            await db.scalars(
                select(PersonalizationDecisionLog).where(
                    PersonalizationDecisionLog.created_at >= cutoff
                )
            )
        ).all()
    )

    tiers: Dict[str, Dict[str, Any]] = {
        t: {
            "total_decisions": 0,
            "delivered_count": 0,
            "opened_count": 0,
            "clicked_count": 0,
            "converted_count": 0,
            "dismissed_count": 0,
            "suppressed_count": 0,
            "_sum_rel": 0.0,
            "_sum_fat": 0.0,
            "revenue_paisa": 0,
        }
        for t in ("generic", "light", "deep", "suppressed")
    }
    channel_breakdown: Dict[str, Dict[str, Any]] = {}
    suppression_reasons: Dict[str, int] = {}
    total_suppressed = 0

    for d in logs:
        t_key = d.personalization_tier if d.personalization_tier in tiers else "generic"
        tb = tiers[t_key]
        tb["total_decisions"] += 1
        if d.delivered:
            tb["delivered_count"] += 1
        if d.opened:
            tb["opened_count"] += 1
        if d.clicked:
            tb["clicked_count"] += 1
        if d.converted:
            tb["converted_count"] += 1
        if d.dismissed:
            tb["dismissed_count"] += 1
        if not d.eligibility_passed:
            tb["suppressed_count"] += 1
            total_suppressed += 1
            reason = d.suppression_reason or "unknown"
            suppression_reasons[reason] = suppression_reasons.get(reason, 0) + 1

        tb["_sum_rel"] += float(d.relevance_score or 0.0)
        tb["_sum_fat"] += float(d.fatigue_score or 0.0)
        tb["revenue_paisa"] += int(d.revenue_paisa or 0)

        if d.selected_channel:
            cb = channel_breakdown.setdefault(
                d.selected_channel,
                {"sent": 0, "delivered": 0, "opened": 0, "clicked": 0, "converted": 0},
            )
            cb["sent"] += 1
            if d.delivered:
                cb["delivered"] += 1
            if d.opened:
                cb["opened"] += 1
            if d.clicked:
                cb["clicked"] += 1
            if d.converted:
                cb["converted"] += 1

    tier_metrics: List[TierPerformanceMetrics] = []
    for tier_name, tb in tiers.items():
        tot = tb["total_decisions"]
        deliv = tb["delivered_count"]
        denom = deliv if deliv > 0 else tot
        tier_metrics.append(
            TierPerformanceMetrics(
                tier=tier_name,
                total_decisions=tot,
                delivered_count=deliv,
                opened_count=tb["opened_count"],
                clicked_count=tb["clicked_count"],
                converted_count=tb["converted_count"],
                dismissed_count=tb["dismissed_count"],
                suppressed_count=tb["suppressed_count"],
                avg_relevance_score=round(tb["_sum_rel"] / tot, 2) if tot > 0 else 0.0,
                avg_fatigue_score=round(tb["_sum_fat"] / tot, 2) if tot > 0 else 0.0,
                open_rate_pct=round((tb["opened_count"] / denom) * 100.0, 2) if denom > 0 else 0.0,
                ctr_pct=round((tb["clicked_count"] / denom) * 100.0, 2) if denom > 0 else 0.0,
                conversion_rate_pct=round((tb["converted_count"] / denom) * 100.0, 2) if denom > 0 else 0.0,
                revenue_paisa=tb["revenue_paisa"],
            )
        )

    return PerformanceAnalyticsResponse(
        window_days=window_days,
        tier_comparison=tier_metrics,
        channel_breakdown=channel_breakdown,
        total_suppressed=total_suppressed,
        suppression_reasons=suppression_reasons,
    )


@router.get(
    "/admin/experiments",
    response_model=List[ExperimentResponse],
    summary="List personalization A/B experiments with live confidence intervals and recommendations",
)
async def admin_list_experiments(
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> List[ExperimentResponse]:
    exps = list(
        (
            await db.scalars(
                select(PersonalizationExperiment).order_by(
                    PersonalizationExperiment.created_at.desc()
                )
            )
        ).all()
    )
    now = datetime.now(timezone.utc)
    return [await _experiment_to_response(db, exp, now=now) for exp in exps]


@router.post(
    "/admin/experiments",
    response_model=ExperimentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new controlled A/B experiment (prohibits critical transactional alerts)",
)
async def admin_create_experiment(
    payload: ExperimentCreateRequest,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ExperimentResponse:
    existing = await db.scalar(
        select(PersonalizationExperiment).where(PersonalizationExperiment.key == payload.key)
    )
    if existing is not None:
        raise ConflictError(
            f"Experiment with key '{payload.key}' already exists.",
            code="EXPERIMENT_KEY_EXISTS",
        )
    try:
        exp = await ExperimentEngine.create_experiment(
            db,
            key=payload.key,
            name=payload.name,
            hypothesis=payload.hypothesis,
            experiment_type=payload.experiment_type,
            variants=[v.model_dump() for v in payload.variants],
            min_sample_size=payload.min_sample_size,
            max_duration_days=payload.max_duration_days,
            opt_out_stop_threshold=payload.opt_out_stop_threshold,
            target_categories=payload.target_categories,
            created_by=current_admin.id,
            start_immediately=True,
        )
        await db.commit()
        await db.refresh(exp)
        return await _experiment_to_response(db, exp)
    except ValueError as exc:
        await db.rollback()
        raise BadRequestError(str(exc), code="INVALID_EXPERIMENT") from exc


@router.post(
    "/admin/experiments/{experiment_id}/stop",
    response_model=ExperimentResponse,
    summary="Stop an active A/B experiment by UUID or key",
)
async def admin_stop_experiment(
    experiment_id: str,
    payload: Optional[ExperimentStopRequest] = Body(default=None),
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ExperimentResponse:
    exp: Optional[PersonalizationExperiment] = None
    try:
        exp_uuid = uuid.UUID(experiment_id)
        exp = await db.scalar(
            select(PersonalizationExperiment).where(PersonalizationExperiment.id == exp_uuid)
        )
    except ValueError:
        exp = await db.scalar(
            select(PersonalizationExperiment).where(PersonalizationExperiment.key == experiment_id)
        )

    if exp is None:
        raise NotFoundError("Experiment", experiment_id)

    await ExperimentEngine.stop_experiment(
        db,
        exp,
        reason=(payload.reason if payload and payload.reason else "manual_admin_stop"),
    )
    await db.commit()
    await db.refresh(exp)
    return await _experiment_to_response(db, exp)


@router.get(
    "/admin/profiles/{user_id}",
    response_model=PersonalizationProfileResponse,
    summary="Inspect a specific user's PII-safe 20-dimensional personalization profile",
)
async def admin_get_user_profile(
    user_id: uuid.UUID,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> PersonalizationProfileResponse:
    prof = await db.scalar(
        select(UserPersonalizationProfile).where(UserPersonalizationProfile.user_id == user_id)
    )
    if prof is None:
        user_row = await db.scalar(select(UserProfile).where(UserProfile.id == user_id))
        sig_id = await db.scalar(
            select(UserBehavioralSignal.id)
            .where(UserBehavioralSignal.user_id == user_id)
            .limit(1)
        )
        if user_row is None and sig_id is None:
            raise NotFoundError("PersonalizationProfile", user_id)
        prof = await UserProfileService.get_or_create_profile(db, user_id)

    now = datetime.now(timezone.utc)
    snapshot = await UserProfileService.build_20d_snapshot(db, user_id, now=now)
    await db.commit()
    return _snapshot_to_profile_response(snapshot, prof, now=now)


@router.post(
    "/admin/automations/{automation_key}/evaluate",
    response_model=AutomationEvaluateResponse,
    summary="Evaluate one of the 10 travel automations (A-J) and optionally stage to outbox",
)
async def admin_evaluate_automation(
    automation_key: str,
    payload: AutomationEvaluateRequest = Body(default_factory=AutomationEvaluateRequest),
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AutomationEvaluateResponse:
    key = automation_key.strip().upper()
    if key not in AUTOMATION_KEYS or key not in AUTOMATION_CATALOG:
        raise BadRequestError(
            f"Unsupported automation_key '{automation_key}'. Expected one of {AUTOMATION_KEYS}.",
            code="INVALID_AUTOMATION_KEY",
        )

    specs = await TravelAutomationsService.evaluate_automation(
        db,
        key,
        user_ids=payload.user_ids,
        limit=payload.limit,
        context_overrides=payload.context_overrides,
    )

    staged = 0
    if not payload.dry_run:
        for spec in specs:
            if spec.eligible:
                await OutboxPublisher.publish(db, spec.to_domain_event())
                staged += 1
        await db.commit()

    evaluated_users = len({s.user_id for s in specs})
    eligible_count = sum(1 for s in specs if s.eligible)

    return AutomationEvaluateResponse(
        automation_key=key,
        dry_run=payload.dry_run,
        evaluated_users=evaluated_users,
        candidates_generated=eligible_count,
        staged_to_outbox=staged,
        candidates=[
            AutomationCandidateSummary(
                user_id=s.user_id,
                automation_key=s.automation_key,
                event_type=s.event_type,
                destination=s.destination,
                title=s.title,
                relevance_score=s.relevance_score,
                confidence_score=s.confidence_score,
                eligible=s.eligible,
                suppression_reason=s.suppression_reason,
            )
            for s in specs
        ],
    )
