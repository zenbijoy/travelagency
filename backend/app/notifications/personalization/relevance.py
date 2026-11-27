"""
Recommendation & Relevance Engine (Agent 4) for ShopnoJatra Hyper-Personalized Notifications.

Implements:
- Independent per-recipient candidate evaluation (`RelevanceResult`)
- 10 normalized (0-100) scoring features weighted via versioned `PersonalizationRuleConfig`
- Strictly SEPARATE `confidence_score` (0-100) from data sufficiency, freshness,
  explicit vs inferred strength, and cross-source consistency
- Confidence-tiered personalization guidance:
    - < 35  : low confidence -> generic safe personalization
    - 35-70 : medium confidence -> light personalization
    - > 70  : high confidence -> deep personalization
- Weight validator (`sum == 1.0`, non-negative, bounded) and rule config versioning/rollback
- Safe `matching_factors` explanations (zero sensitive PII or raw AI CoT)
- Invariant: High relevance NEVER implies permission to send (consent/caps/fatigue govern dispatch).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import logging
from typing import Any, Dict, List, Literal, Mapping, Optional, Sequence, Tuple
import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.notifications.personalization.dimensions import (
    DIMENSION_KEYS,
    UserProfile20DSnapshot,
)
from app.notifications.personalization.travel_context import (
    BUDGET_TIER_DAILY_BDT_RANGES,
    evaluate_seasonal_suitability,
    get_destination_info,
    normalize_destination_key,
)

logger = logging.getLogger(__name__)


# ============================================================================
# Canonical Default Weights & Constants
# ============================================================================

DEFAULT_RELEVANCE_WEIGHTS: Dict[str, float] = {
    "DestinationInterest": 0.20,
    "TravelIntent": 0.15,
    "BudgetMatch": 0.12,
    "SearchRelevance": 0.10,
    "TravelStyleMatch": 0.10,
    "TransportMatch": 0.08,
    "EngagementMatch": 0.07,
    "TimingMatch": 0.07,
    "SeasonalityMatch": 0.06,
    "CategoryPreference": 0.05,
}

RELEVANCE_FEATURE_NAMES: Tuple[str, ...] = tuple(DEFAULT_RELEVANCE_WEIGHTS.keys())

BUDGET_TIER_ORDER: Dict[str, int] = {
    "budget": 0,
    "economy": 1,
    "mid_range": 2,
    "mid-range": 2,
    "premium": 3,
    "luxury": 4,
}

CRITICAL_TRANSACTIONAL_CATEGORIES = frozenset(
    {"security", "booking", "payment", "sos", "disruption", "otp", "ticket", "refund"}
)


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _clamp_100(value: float) -> float:
    return round(max(0.0, min(100.0, float(value))), 2)


def _normalize_budget_tier(tier: Optional[str]) -> Optional[str]:
    if not tier:
        return None
    cleaned = str(tier).strip().lower().replace("-", "_").replace(" ", "_")
    if cleaned in {"budget", "economy", "mid_range", "premium", "luxury", "flexible"}:
        return cleaned
    return None


def _price_bdt_to_budget_tier(price_bdt: Optional[float]) -> Optional[str]:
    if price_bdt is None or price_bdt <= 0:
        return None
    if price_bdt <= 3500:
        return "budget"
    if price_bdt <= 6000:
        return "economy"
    if price_bdt <= 12000:
        return "mid_range"
    if price_bdt <= 25000:
        return "premium"
    return "luxury"


# ============================================================================
# Weight Validation & Confidence Tier Mapping
# ============================================================================

def validate_relevance_weights(
    weights: Mapping[str, float],
    *,
    strict_keys: bool = True,
) -> Dict[str, float]:
    """
    Validate relevance feature weights:
    - Non-empty mapping
    - Every weight bounded in [0.0, 1.0] (non-negative)
    - Sum of weights equals 1.0 (tolerance 1e-3)
    - When `strict_keys=True`, requires the exact 10 canonical feature keys.
    """
    if not weights:
        raise ValueError("Relevance weights mapping cannot be empty.")

    validated: Dict[str, float] = {}
    for k, v in weights.items():
        if strict_keys and k not in DEFAULT_RELEVANCE_WEIGHTS:
            raise ValueError(f"Unknown relevance feature key: '{k}'.")
        try:
            fv = float(v)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Weight for '{k}' must be numeric.") from exc
        if fv < 0.0 or fv > 1.0:
            raise ValueError(f"Weight for '{k}' must be between 0.0 and 1.0, got {fv}.")
        validated[k] = round(fv, 6)

    if strict_keys:
        missing = [k for k in RELEVANCE_FEATURE_NAMES if k not in validated]
        if missing:
            raise ValueError(f"Missing required relevance weight keys: {missing}")

    total = sum(validated.values())
    if abs(total - 1.0) > 1e-3:
        raise ValueError(f"Relevance weights must sum to 1.0 (got {total:.6f}).")

    return validated


def map_confidence_to_tier(
    confidence_score: float,
) -> Tuple[Literal["low", "medium", "high"], Literal["generic", "light", "deep"]]:
    """Map numeric 0-100 confidence score to (confidence_tier, personalization_tier)."""
    if confidence_score > 70.0:
        return "high", "deep"
    if confidence_score >= 35.0:
        return "medium", "light"
    return "low", "generic"


# ============================================================================
# Candidate & Result Data Contracts
# ============================================================================

@dataclass
class NotificationCandidate:
    """Notification candidate evaluated independently per recipient."""

    event_type: str = "system.campaign.broadcast"
    category: str = "marketing"
    title: str = ""
    body: str = ""
    destination: Optional[str] = None
    route_key: Optional[str] = None
    product_type: Optional[str] = None
    travel_styles: List[str] = field(default_factory=list)
    interests: List[str] = field(default_factory=list)
    budget_tier: Optional[str] = None
    price_paisa: Optional[int] = None
    discount_pct: Optional[float] = None
    transport_mode: Optional[str] = None
    accommodation_type: Optional[str] = None
    amenities: List[str] = field(default_factory=list)
    target_date: Optional[datetime] = None
    priority: int = 5
    automation_key: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RelevanceResult:
    """Output of RelevanceEngine.evaluate(...) for one (user, candidate) pair."""

    relevance_score: float
    confidence_score: float
    confidence_tier: Literal["low", "medium", "high"]
    recommended_tier: Literal["generic", "light", "deep"]
    feature_breakdown: Dict[str, float]
    weights_used: Dict[str, float]
    matching_factors: List[str]
    confidence_breakdown: Dict[str, float]
    rule_version: int = 1
    meets_relevance_threshold: bool = True
    meets_confidence_threshold: bool = True
    permission_to_send_implied: bool = False  # Always False: consent/caps/fatigue check separately!

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ============================================================================
# Separate Confidence Scoring Engine
# ============================================================================

def compute_separate_confidence(
    snapshot: UserProfile20DSnapshot,
    *,
    now: Optional[datetime] = None,
) -> Tuple[float, Dict[str, float]]:
    """
    Compute confidence_score (0-100) completely INDEPENDENTLY of relevance_score.

    Components:
    - data_sufficiency (35%): coverage across core personalization dimensions & signal count
    - freshness (25%): recency of non-expired dimension observations
    - explicit_strength (25%): average effective confidence boosted by explicit user preferences / bookings
    - consistency (15%): cross-source agreement (explicit vs behavioral vs transactional)
    """
    ref = _ensure_utc(now or datetime.now(timezone.utc))

    core_keys: Tuple[str, ...] = (
        "destination_interest",
        "search_behavior",
        "travel_frequency",
        "budget_profile",
        "travel_style",
        "transport_preference",
        "accommodation_preference",
        "time_preference",
        "engagement_behavior",
        "price_sensitivity",
        "travel_timeline",
    )

    known_dims = []
    freshness_scores: List[float] = []
    strength_scores: List[float] = []

    for key in core_keys:
        dim = snapshot.get_dimension(key)
        eff_conf = dim.effective_confidence(ref)
        if eff_conf > 0.0:
            known_dims.append(dim)
            # Explicit preference or transactional proof has higher structural strength
            if dim.is_user_provided or dim.source in {"user_preference", "transactional"}:
                strength_scores.append(min(100.0, eff_conf * 1.05))
            else:
                strength_scores.append(eff_conf * 0.90)

            if dim.updated_at is not None:
                age_days = max(0.0, (ref - _ensure_utc(dim.updated_at)).total_seconds() / 86400.0)
                if age_days <= 7.0:
                    freshness_scores.append(100.0)
                elif age_days <= 30.0:
                    freshness_scores.append(80.0)
                elif age_days <= 90.0:
                    freshness_scores.append(55.0)
                elif age_days <= 180.0:
                    freshness_scores.append(30.0)
                else:
                    freshness_scores.append(15.0)
            else:
                freshness_scores.append(45.0)

    if not known_dims and not snapshot.destination_interests:
        breakdown = {
            "data_sufficiency": 0.0,
            "freshness": 0.0,
            "explicit_strength": 0.0,
            "consistency": 0.0,
        }
        return 0.0, breakdown

    coverage_ratio = len(known_dims) / float(len(core_keys))
    total_signals = sum(
        int(d.get("signal_count", 0) or 0)
        for d in snapshot.destination_interests.values()
    )
    signal_bonus = min(20.0, total_signals * 2.5)
    data_sufficiency = _clamp_100(coverage_ratio * 85.0 + signal_bonus)

    freshness = _clamp_100(
        sum(freshness_scores) / len(freshness_scores) if freshness_scores else 0.0
    )

    explicit_strength = _clamp_100(
        sum(strength_scores) / len(strength_scores) if strength_scores else 0.0
    )

    # Consistency: check alignment between explicit destination favorites / budget / styles
    # and behavioral destination interests / bookings.
    consistency = 65.0
    explicit_favs = {
        normalize_destination_key(d)
        for d in (snapshot.explicit_preferences.get("favorite_destinations") or [])
        if d
    }
    behavioral_dests = {
        normalize_destination_key(k)
        for k, v in snapshot.destination_interests.items()
        if float(v.get("score", 0.0) or 0.0) >= 30.0
    }
    if explicit_favs and behavioral_dests:
        overlap = len(explicit_favs & behavioral_dests)
        consistency = 92.0 if overlap > 0 else 58.0
    elif len(known_dims) >= 5:
        consistency = 82.0
    elif len(known_dims) >= 2:
        consistency = 70.0
    else:
        consistency = 35.0

    # Guardrail: single weak behavioral dimension without explicit prefs stays low (< 35)
    has_explicit_or_tx = any(
        d.is_user_provided or d.source in {"user_preference", "transactional"}
        for d in known_dims
    )
    raw_conf = (
        0.35 * data_sufficiency
        + 0.25 * freshness
        + 0.25 * explicit_strength
        + 0.15 * consistency
    )
    if not has_explicit_or_tx and len(known_dims) <= 1 and total_signals <= 1:
        raw_conf = min(raw_conf, 28.0)

    if snapshot.overall_confidence > 0.0 and len(known_dims) == 0:
        # Respect explicit snapshot override only if no dimension rows exist
        raw_conf = max(raw_conf, min(100.0, float(snapshot.overall_confidence)))

    final_conf = _clamp_100(raw_conf)
    breakdown = {
        "data_sufficiency": data_sufficiency,
        "freshness": freshness,
        "explicit_strength": explicit_strength,
        "consistency": _clamp_100(consistency),
    }
    return final_conf, breakdown


# ============================================================================
# Feature Evaluators (Each Normalized 0-100)
# ============================================================================

def _extract_list_from_dim(value: Any, keys: Sequence[str] = ()) -> List[str]:
    if value is None or value == "unknown":
        return []
    if isinstance(value, list):
        return [str(x).strip().lower() for x in value if x is not None and str(x).strip()]
    if isinstance(value, dict):
        collected: List[str] = []
        for k in keys:
            sub = value.get(k)
            if isinstance(sub, list):
                collected.extend(
                    str(x).strip().lower() for x in sub if x is not None and str(x).strip()
                )
            elif isinstance(sub, str) and sub.strip():
                collected.append(sub.strip().lower())
        return collected
    if isinstance(value, str) and value.strip():
        return [value.strip().lower()]
    return []


def _score_destination_interest(
    snapshot: UserProfile20DSnapshot,
    candidate: NotificationCandidate,
    factors: List[str],
) -> float:
    explicit_favs = {
        normalize_destination_key(d)
        for d in (snapshot.explicit_preferences.get("favorite_destinations") or [])
        if d
    }
    dest_map: Dict[str, Dict[str, Any]] = {}
    for k, v in snapshot.destination_interests.items():
        nk = normalize_destination_key(k)
        if nk:
            dest_map[nk] = v

    if candidate.destination:
        cand_key = normalize_destination_key(candidate.destination)
        entry = dest_map.get(cand_key) if cand_key else None
        is_fav = bool(cand_key and cand_key in explicit_favs) or bool(
            entry and entry.get("is_explicit_favorite")
        )
        score_val = float(entry.get("score", 0.0) or 0.0) if entry else 0.0

        if is_fav:
            score = max(88.0, score_val)
            factors.append(f"Matches favorite destination: {candidate.destination}")
            return _clamp_100(score)
        if entry and score_val > 0.0:
            if score_val >= 45.0:
                factors.append(f"Strong recent interest in {candidate.destination}")
            return _clamp_100(score_val)
        if dest_map or explicit_favs:
            # User has strong interests elsewhere; unrelated destination scores low
            return 18.0
        # Unknown user destination preferences
        return 30.0

    # Broad campaign without a fixed destination
    if explicit_favs or dest_map:
        top = snapshot.top_destinations(limit=1)
        if top:
            top_score = float(top[0].get("score", 0.0) or 0.0)
            is_fav = bool(top[0].get("is_explicit_favorite"))
            factors.append(f"Can highlight top destination interest: {top[0].get('destination')}")
            return _clamp_100(max(78.0 if is_fav else 50.0, top_score))
        return 72.0
    return 25.0


def _score_travel_intent(
    snapshot: UserProfile20DSnapshot,
    candidate: NotificationCandidate,
    factors: List[str],
    now: datetime,
) -> float:
    cat = (candidate.category or "").lower()
    if cat in CRITICAL_TRANSACTIONAL_CATEGORIES:
        return 100.0

    stage = snapshot.travel_timeline_stage or "no_planned_trip"
    dim_tl = snapshot.get_value("travel_timeline", default="unknown", now=now)
    if isinstance(dim_tl, dict) and dim_tl.get("stage"):
        stage = str(dim_tl["stage"])

    stage_scores: Dict[str, float] = {
        "booking_in_progress": 94.0,
        "comparing_options": 90.0,
        "searching_for_trip": 84.0,
        "destination_wishlisted": 76.0,
        "preparing_for_departure": 88.0 if cat in {"booking", "flight_alerts", "travel_prep", "weather"} else 45.0,
        "booked": 70.0 if cat in {"booking", "hotel", "transport", "travel_prep"} else 42.0,
        "traveling": 85.0 if cat in {"flight_alerts", "weather", "disruption", "travel_prep"} else 25.0,
        "returning": 78.0 if cat in {"review", "post_trip", "flight_alerts"} else 30.0,
        "post_trip": 72.0 if cat in {"review", "post_trip", "discovery"} else 38.0,
        "no_planned_trip": 35.0,
    }
    base = stage_scores.get(stage, 35.0)

    # Adjust by activity level when no trip is planned
    if stage == "no_planned_trip":
        if snapshot.activity_level in {"highly_active", "active", "returning"}:
            base = 52.0
        elif snapshot.activity_level in {"inactive", "dormant"}:
            base = 28.0
        elif snapshot.activity_level == "new_user":
            base = 30.0

    if stage in {"searching_for_trip", "comparing_options", "booking_in_progress", "destination_wishlisted"}:
        factors.append(f"Active travel timeline stage: {stage}")
    elif stage in {"booked", "preparing_for_departure", "traveling"}:
        factors.append(f"Trip lifecycle context: {stage}")

    return _clamp_100(base)


def _score_budget_match(
    snapshot: UserProfile20DSnapshot,
    candidate: NotificationCandidate,
    factors: List[str],
    now: datetime,
) -> float:
    dim_budget = snapshot.get_value("budget_profile", default="unknown", now=now)
    user_tier: Optional[str] = None
    if isinstance(dim_budget, dict):
        user_tier = _normalize_budget_tier(dim_budget.get("tier") or dim_budget.get("budget_tier"))
    elif isinstance(dim_budget, str):
        user_tier = _normalize_budget_tier(dim_budget)
    if not user_tier:
        user_tier = _normalize_budget_tier(snapshot.explicit_preferences.get("budget_tier"))

    dim_price_sens = snapshot.get_value("price_sensitivity", default="unknown", now=now)
    price_sens_level: Optional[str] = None
    if isinstance(dim_price_sens, dict):
        price_sens_level = str(dim_price_sens.get("level") or "").lower() or None
    elif isinstance(dim_price_sens, str) and dim_price_sens != "unknown":
        price_sens_level = dim_price_sens.lower()
    if not price_sens_level:
        ps = snapshot.explicit_preferences.get("price_sensitivity_level")
        price_sens_level = str(ps).lower() if ps else None

    cand_tier = _normalize_budget_tier(candidate.budget_tier)
    if not cand_tier and candidate.price_paisa is not None:
        cand_tier = _price_bdt_to_budget_tier(candidate.price_paisa / 100.0)

    # If candidate has a destination in catalog and no explicit price/tier, check catalog tiers
    catalog_info = get_destination_info(candidate.destination) if candidate.destination else None

    if user_tier is None:
        return 38.0

    if user_tier == "flexible":
        factors.append("Flexible budget preference matches diverse offers")
        return 82.0

    if cand_tier and cand_tier != "flexible":
        u_idx = BUDGET_TIER_ORDER[user_tier]
        c_idx = BUDGET_TIER_ORDER[cand_tier]
        diff = abs(u_idx - c_idx)
        score = {0: 95.0, 1: 70.0, 2: 40.0, 3: 20.0}.get(diff, 10.0)
        if diff <= 1:
            factors.append(f"Matches {user_tier.replace('_', ' ')} budget tier")
    elif catalog_info is not None:
        if user_tier in catalog_info.budget_tiers:
            score = 86.0
            factors.append(f"{catalog_info.name} aligns with {user_tier.replace('_', ' ')} budget")
        else:
            score = 32.0
    else:
        # Broad campaign tailored dynamically to user's budget tier
        score = 74.0
        factors.append(f"Adaptable to {user_tier.replace('_', ' ')} budget profile")

    # Deal / price-drop boost for price-sensitive users
    has_deal = bool(candidate.discount_pct and candidate.discount_pct > 0) or (
        (candidate.category or "").lower() == "price_alerts"
    )
    if has_deal and price_sens_level == "high":
        score = min(100.0, score + 14.0)
        factors.append("High price sensitivity aligns with fare/deal alert")
    elif has_deal and price_sens_level == "low" and user_tier in {"premium", "luxury"}:
        score = max(35.0, score - 10.0)

    return _clamp_100(score)


def _score_search_relevance(
    snapshot: UserProfile20DSnapshot,
    candidate: NotificationCandidate,
    factors: List[str],
    now: datetime,
) -> float:
    search_val = snapshot.get_value("search_behavior", default="unknown", now=now)
    if search_val == "unknown" or not isinstance(search_val, dict):
        return 20.0

    recent_count = int(
        search_val.get("recent_searches_count")
        or search_val.get("searches_7d")
        or search_val.get("total_searches")
        or search_val.get("search_count")
        or 0
    )
    recent_dests = [
        normalize_destination_key(d)
        for d in (search_val.get("recent_destinations") or [])
        if d
    ]
    repeated_dests = [
        normalize_destination_key(d)
        for d in (search_val.get("repeated_destinations") or [])
        if d
    ]
    recent_routes = [str(r).upper() for r in (search_val.get("recent_routes") or []) if r]
    abandoned_list = search_val.get("abandoned_searches") or []
    abandoned_count = int(
        search_val.get("abandoned_searches_count")
        or (len(abandoned_list) if isinstance(abandoned_list, list) else 0)
    )

    if candidate.destination:
        cand_key = normalize_destination_key(candidate.destination)
        if cand_key and (cand_key in recent_dests or cand_key in repeated_dests):
            repeat_bonus = 6.0 if cand_key in repeated_dests else 0.0
            score = 86.0 + repeat_bonus + min(8.0, abandoned_count * 4.0)
            factors.append(f"Matches recent searches for {candidate.destination}")
            return _clamp_100(score)
        if candidate.route_key and candidate.route_key.upper() in recent_routes:
            factors.append(f"Matches searched route {candidate.route_key}")
            return 92.0
        return 28.0 if recent_count > 0 else 20.0

    if recent_count > 0 or recent_dests or repeated_dests:
        score = min(90.0, 52.0 + recent_count * 8.0 + abandoned_count * 6.0)
        factors.append("Informed by recent trip search activity")
        return _clamp_100(score)
    return 20.0


def _score_travel_style_match(
    snapshot: UserProfile20DSnapshot,
    candidate: NotificationCandidate,
    factors: List[str],
    now: datetime,
) -> float:
    style_val = snapshot.get_value("travel_style", default="unknown", now=now)
    user_styles = set(_extract_list_from_dim(style_val, keys=("styles", "interests", "travel_styles")))
    user_styles.update(
        str(s).strip().lower()
        for s in (snapshot.explicit_preferences.get("travel_styles") or [])
        if s
    )
    user_styles.update(
        str(s).strip().lower()
        for s in (snapshot.explicit_preferences.get("travel_interests") or [])
        if s
    )

    if not user_styles:
        return 35.0

    cand_tags = {str(t).strip().lower() for t in (candidate.travel_styles + candidate.interests) if t}
    catalog_info = get_destination_info(candidate.destination) if candidate.destination else None
    if not cand_tags and catalog_info is not None:
        cand_tags = {t.lower() for t in catalog_info.travel_styles} | {
            t.lower() for t in catalog_info.interests
        }

    if cand_tags:
        overlap = user_styles & cand_tags
        if overlap:
            ratio = len(overlap) / max(1.0, min(len(user_styles), len(cand_tags)))
            score = 72.0 + ratio * 26.0
            factors.append(f"Matches travel style ({', '.join(sorted(overlap)[:2])})")
            return _clamp_100(score)
        return 22.0

    # Broad campaign that adapts copy/offers to known styles
    factors.append(f"Tailored for {', '.join(sorted(user_styles)[:2])} travel style")
    return 76.0


def _score_transport_match(
    snapshot: UserProfile20DSnapshot,
    candidate: NotificationCandidate,
    factors: List[str],
    now: datetime,
) -> float:
    trans_val = snapshot.get_value("transport_preference", default="unknown", now=now)
    user_modes = set(
        _extract_list_from_dim(
            trans_val,
            keys=("preferred_modes", "primary_mode", "modes", "preferred_transport"),
        )
    )
    user_modes.update(
        str(m).strip().lower()
        for m in (snapshot.explicit_preferences.get("preferred_transport") or [])
        if m
    )
    user_modes.discard("unknown")

    if not user_modes:
        return 38.0

    if "mixed" in user_modes:
        return 78.0

    cand_mode = (candidate.transport_mode or "").strip().lower()
    if not cand_mode and candidate.product_type in {"flight", "train", "bus", "launch"}:
        cand_mode = candidate.product_type

    catalog_info = get_destination_info(candidate.destination) if candidate.destination else None
    if cand_mode:
        if cand_mode in user_modes:
            factors.append(f"Matches preferred {cand_mode} transport")
            return 94.0
        return 22.0
    if catalog_info is not None:
        overlap = user_modes & {m.lower() for m in catalog_info.typical_transport_modes}
        if overlap:
            factors.append(f"Accessible via preferred {', '.join(sorted(overlap)[:2])}")
            return 84.0
        return 28.0

    return 72.0


def _score_engagement_match(
    snapshot: UserProfile20DSnapshot,
    candidate: NotificationCandidate,
    factors: List[str],
    now: datetime,
) -> float:
    if (candidate.category or "").lower() in CRITICAL_TRANSACTIONAL_CATEGORIES:
        return 95.0

    eng_val = snapshot.get_value("engagement_behavior", default="unknown", now=now)
    cat = (candidate.category or "marketing").lower()
    cat_stats = snapshot.category_engagement.get(cat, {})

    if cat_stats:
        if "affinity_score" in cat_stats:
            score = float(cat_stats["affinity_score"])
            if score >= 60.0:
                factors.append("Strong historical notification engagement")
            return _clamp_100(score)
        c_open = float(cat_stats.get("open_rate", 0.0) or 0.0)
        c_click = float(cat_stats.get("click_rate", 0.0) or 0.0)
        c_dismiss = float(cat_stats.get("dismiss_rate", 0.0) or 0.0)
        score = 45.0 + c_open * 30.0 + c_click * 40.0 - c_dismiss * 45.0
        if c_open >= 0.4 or c_click >= 0.15:
            factors.append("Strong historical notification engagement")
        return _clamp_100(score)

    if isinstance(eng_val, dict):
        by_cat = eng_val.get("by_category") or {}
        if cat in by_cat and isinstance(by_cat[cat], dict) and "affinity_score" in by_cat[cat]:
            score = float(by_cat[cat]["affinity_score"])
            if score >= 60.0:
                factors.append("Strong category notification engagement")
            return _clamp_100(score)
        if by_cat and isinstance(by_cat, dict):
            affinities = [
                float(v["affinity_score"])
                for v in by_cat.values()
                if isinstance(v, dict) and "affinity_score" in v
            ]
            if affinities:
                avg_aff = sum(affinities) / len(affinities)
                if avg_aff >= 60.0:
                    factors.append("Strong platform notification engagement")
                return _clamp_100(avg_aff)
        open_rate = float(eng_val.get("open_rate", eng_val.get("overall_open_rate", 0.0)) or 0.0)
        click_rate = float(eng_val.get("click_rate", eng_val.get("overall_click_rate", 0.0)) or 0.0)
        dismiss_rate = float(eng_val.get("dismiss_rate", 0.0) or 0.0)
        score = 45.0 + open_rate * 30.0 + click_rate * 40.0 - dismiss_rate * 45.0
        if open_rate >= 0.4:
            factors.append("Strong platform notification engagement")
        return _clamp_100(score)

    activity = snapshot.activity_level or "new_user"
    activity_baseline = {
        "highly_active": 78.0,
        "active": 68.0,
        "reactivated": 64.0,
        "returning": 60.0,
        "new_user": 45.0,
        "inactive": 32.0,
        "dormant": 22.0,
    }
    return activity_baseline.get(activity, 45.0)


def _score_timing_match(
    snapshot: UserProfile20DSnapshot,
    candidate: NotificationCandidate,
    now: datetime,
) -> float:
    if (candidate.category or "").lower() in CRITICAL_TRANSACTIONAL_CATEGORIES or candidate.priority >= 9:
        return 100.0

    time_val = snapshot.get_value("time_preference", default="unknown", now=now)
    if not isinstance(time_val, dict):
        return 50.0

    # Check preferred send window vs current local hour (Asia/Dhaka UTC+6 fallback)
    pref_window = str(
        time_val.get("preferred_window")
        or time_val.get("preferred_send_window")
        or time_val.get("inferred_window")
        or ""
    ).lower()
    local_hour = (now.hour + 6) % 24
    peak_hours = time_val.get("peak_hours") or []
    if isinstance(peak_hours, list) and local_hour in peak_hours:
        return 94.0

    window_hours = {
        "morning": range(6, 12),
        "afternoon": range(12, 17),
        "evening": range(17, 21),
        "late_evening": range(21, 24),
    }
    if pref_window in window_hours:
        return 90.0 if local_hour in window_hours[pref_window] else 55.0
    if pref_window == "flexible":
        return 80.0
    return 65.0


def _score_seasonality_match(
    snapshot: UserProfile20DSnapshot,
    candidate: NotificationCandidate,
    factors: List[str],
    now: datetime,
) -> float:
    ref_date = candidate.target_date or now
    dest = candidate.destination
    if not dest:
        top = snapshot.top_destinations(limit=1)
        if top:
            dest = str(top[0].get("destination") or "")

    if not dest:
        return 50.0

    s_info = evaluate_seasonal_suitability(dest, target_date=ref_date)
    score = float(s_info["score"])
    if s_info["suitability"] == "peak":
        factors.append(f"Peak travel season for {s_info.get('destination_name', dest)}")
    elif s_info["suitability"] == "off_peak":
        factors.append(f"Off-peak season caution for {s_info.get('destination_name', dest)}")
    return _clamp_100(score)


def _score_category_preference(
    snapshot: UserProfile20DSnapshot,
    candidate: NotificationCandidate,
    factors: List[str],
    now: datetime,
) -> float:
    cat = (candidate.category or "marketing").lower()
    if cat in CRITICAL_TRANSACTIONAL_CATEGORIES:
        return 100.0

    consent_val = snapshot.get_value("consent_communication_preferences", default="unknown", now=now)
    if isinstance(consent_val, dict):
        if cat == "marketing" and consent_val.get("category_marketing") is False:
            return 0.0
        if cat == "price_alerts" and consent_val.get("category_price_alerts") is False:
            return 0.0
        if cat == "community" and consent_val.get("category_community") is False:
            return 0.0
        if cat == "flight_alerts" and consent_val.get("category_flight_alerts") is False:
            return 0.0

    fatigue_info = snapshot.fatigue_by_category.get(cat, {})
    fatigue_score = float(fatigue_info.get("fatigue_score", 0.0) or 0.0)
    cat_eng = snapshot.category_engagement.get(cat, {})
    ctr = float(cat_eng.get("click_rate", 0.0) or 0.0)
    open_r = float(cat_eng.get("open_rate", 0.0) or 0.0)

    if cat == "price_alerts":
        ps = snapshot.get_value("price_sensitivity", default="unknown", now=now)
        if isinstance(ps, dict) and ps.get("level") == "high":
            factors.append("Opted-in and responsive to price alerts")
            return _clamp_100(92.0 - fatigue_score * 0.3)

    if not snapshot.personalization_enabled and cat == "marketing":
        return 35.0

    score = 65.0 + open_r * 20.0 + ctr * 25.0 - fatigue_score * 0.55
    return _clamp_100(score)


# ============================================================================
# RelevanceEngine Service
# ============================================================================

class RelevanceEngine:
    """
    Computes independent per-recipient `RelevanceResult` scores using configurable
    10-feature weights from `PersonalizationRuleConfig`, plus separate `confidence_score`.
    """

    @staticmethod
    def validate_weights(
        weights: Mapping[str, float],
        *,
        strict_keys: bool = True,
    ) -> Dict[str, float]:
        return validate_relevance_weights(weights, strict_keys=strict_keys)

    @classmethod
    def evaluate(
        cls,
        snapshot: UserProfile20DSnapshot,
        candidate: NotificationCandidate,
        *,
        weights: Optional[Mapping[str, float]] = None,
        rule_version: int = 1,
        min_relevance_threshold: float = 45.0,
        min_confidence_threshold: float = 30.0,
        now: Optional[datetime] = None,
    ) -> RelevanceResult:
        """
        Evaluate a candidate notification independently for one recipient.
        Note: `permission_to_send_implied` is ALWAYS False; consent, quiet hours,
        frequency caps, and fatigue gates are enforced separately.
        """
        ref = _ensure_utc(now or datetime.now(timezone.utc))
        active_weights = (
            validate_relevance_weights(weights, strict_keys=True)
            if weights is not None
            else dict(DEFAULT_RELEVANCE_WEIGHTS)
        )

        # 1. Separate Confidence Score (0-100)
        confidence_score, confidence_breakdown = compute_separate_confidence(
            snapshot, now=ref
        )
        conf_tier, rec_tier = map_confidence_to_tier(confidence_score)

        # 2. 10 Normalized (0-100) Relevance Features
        matching_factors: List[str] = []
        breakdown: Dict[str, float] = {
            "DestinationInterest": _score_destination_interest(snapshot, candidate, matching_factors),
            "TravelIntent": _score_travel_intent(snapshot, candidate, matching_factors, ref),
            "BudgetMatch": _score_budget_match(snapshot, candidate, matching_factors, ref),
            "SearchRelevance": _score_search_relevance(snapshot, candidate, matching_factors, ref),
            "TravelStyleMatch": _score_travel_style_match(snapshot, candidate, matching_factors, ref),
            "TransportMatch": _score_transport_match(snapshot, candidate, matching_factors, ref),
            "EngagementMatch": _score_engagement_match(snapshot, candidate, matching_factors, ref),
            "TimingMatch": _score_timing_match(snapshot, candidate, ref),
            "SeasonalityMatch": _score_seasonality_match(snapshot, candidate, matching_factors, ref),
            "CategoryPreference": _score_category_preference(snapshot, candidate, matching_factors, ref),
        }

        weighted_sum = sum(
            breakdown[feat] * active_weights[feat] for feat in RELEVANCE_FEATURE_NAMES
        )
        relevance_score = _clamp_100(weighted_sum)

        # Deduplicate matching factors cleanly while preserving order
        seen_factors: set[str] = set()
        unique_factors: List[str] = []
        for f in matching_factors:
            if f not in seen_factors:
                seen_factors.add(f)
                unique_factors.append(f)

        if not unique_factors:
            unique_factors.append(
                "Safe general travel discovery (limited profile history)"
                if conf_tier == "low"
                else "Matched general platform availability"
            )

        return RelevanceResult(
            relevance_score=relevance_score,
            confidence_score=confidence_score,
            confidence_tier=conf_tier,
            recommended_tier=rec_tier,
            feature_breakdown=breakdown,
            weights_used=active_weights,
            matching_factors=unique_factors[:6],
            confidence_breakdown=confidence_breakdown,
            rule_version=rule_version,
            meets_relevance_threshold=relevance_score >= min_relevance_threshold,
            meets_confidence_threshold=confidence_score >= min_confidence_threshold,
            permission_to_send_implied=False,
        )

    @classmethod
    async def get_active_rule_config(cls, db: AsyncSession) -> Dict[str, Any]:
        """Fetch active PersonalizationRuleConfig or return default v1 config."""
        from app.models.personalization import PersonalizationRuleConfig

        res = await db.execute(
            select(PersonalizationRuleConfig)
            .where(PersonalizationRuleConfig.is_active.is_(True))
            .order_by(PersonalizationRuleConfig.version.desc())
            .limit(1)
        )
        row = res.scalar_one_or_none()
        if row is None:
            return {
                "id": None,
                "version": 1,
                "is_active": True,
                "weights": dict(DEFAULT_RELEVANCE_WEIGHTS),
                "dimension_configs": {},
                "timing_config": {
                    "adaptive_timing_enabled": True,
                    "min_confidence": 35.0,
                    "max_delay_hours": 18,
                    "fallback_hour": 10,
                },
                "fatigue_config": {
                    "global_daily_marketing_cap": 3,
                    "high_fatigue_threshold": 65.0,
                    "cooldown_hours": 24,
                    "prefer_digest_on_high_fatigue": True,
                },
                "ai_config": {"ai_enabled": True, "timeout_seconds": 1.5},
                "decay_lambda": 0.08,
                "min_relevance_threshold": 45.0,
                "min_confidence_threshold": 30.0,
                "change_notes": "Default system rule configuration v1",
            }
        return {
            "id": row.id,
            "version": int(row.version),
            "is_active": bool(row.is_active),
            "weights": dict(row.weights_json or DEFAULT_RELEVANCE_WEIGHTS),
            "dimension_configs": dict(row.dimension_configs_json or {}),
            "timing_config": dict(row.timing_config_json or {}),
            "fatigue_config": dict(row.fatigue_config_json or {}),
            "ai_config": dict(row.ai_config_json or {}),
            "decay_lambda": float(row.decay_lambda),
            "min_relevance_threshold": float(row.min_relevance_threshold),
            "min_confidence_threshold": float(row.min_confidence_threshold),
            "change_notes": row.change_notes,
            "created_by": row.created_by,
            "created_at": row.created_at,
        }

    @classmethod
    async def publish_rule_config(
        cls,
        db: AsyncSession,
        *,
        weights: Mapping[str, float],
        dimension_configs: Optional[Dict[str, Any]] = None,
        timing_config: Optional[Dict[str, Any]] = None,
        fatigue_config: Optional[Dict[str, Any]] = None,
        ai_config: Optional[Dict[str, Any]] = None,
        decay_lambda: float = 0.08,
        min_relevance_threshold: float = 45.0,
        min_confidence_threshold: float = 30.0,
        created_by: Optional[uuid.UUID] = None,
        change_notes: Optional[str] = None,
    ) -> Any:
        """Validate weights and publish a new active version of PersonalizationRuleConfig."""
        from app.models.personalization import PersonalizationRuleConfig

        validated_weights = validate_relevance_weights(weights, strict_keys=True)
        current = await cls.get_active_rule_config(db)

        max_res = await db.execute(
            select(PersonalizationRuleConfig.version)
            .order_by(PersonalizationRuleConfig.version.desc())
            .limit(1)
        )
        max_ver = max_res.scalar_one_or_none() or 0
        next_version = int(max_ver) + 1

        await db.execute(
            update(PersonalizationRuleConfig).values(is_active=False)
        )

        new_rule = PersonalizationRuleConfig(
            version=next_version,
            is_active=True,
            weights_json=validated_weights,
            dimension_configs_json=(
                dimension_configs
                if dimension_configs is not None
                else current.get("dimension_configs", {})
            ),
            timing_config_json=(
                timing_config
                if timing_config is not None
                else current.get("timing_config", {})
            ),
            fatigue_config_json=(
                fatigue_config
                if fatigue_config is not None
                else current.get("fatigue_config", {})
            ),
            ai_config_json=(
                ai_config if ai_config is not None else current.get("ai_config", {})
            ),
            decay_lambda=float(decay_lambda),
            min_relevance_threshold=float(min_relevance_threshold),
            min_confidence_threshold=float(min_confidence_threshold),
            created_by=created_by,
            change_notes=change_notes or f"Published rule version {next_version}",
        )
        db.add(new_rule)
        await db.flush()
        return new_rule

    @classmethod
    async def rollback_rule_config(
        cls,
        db: AsyncSession,
        target_version: int,
    ) -> Tuple[Optional[int], Any]:
        """Roll back active rule configuration to a previously published version."""
        from app.models.personalization import PersonalizationRuleConfig

        active_res = await db.execute(
            select(PersonalizationRuleConfig)
            .where(PersonalizationRuleConfig.is_active.is_(True))
            .limit(1)
        )
        active_row = active_res.scalar_one_or_none()
        prev_version = int(active_row.version) if active_row else None

        target_res = await db.execute(
            select(PersonalizationRuleConfig).where(
                PersonalizationRuleConfig.version == target_version
            )
        )
        target_row = target_res.scalar_one_or_none()
        if target_row is None:
            raise ValueError(f"PersonalizationRuleConfig version {target_version} not found.")

        await db.execute(update(PersonalizationRuleConfig).values(is_active=False))
        target_row.is_active = True
        await db.flush()
        return prev_version, target_row
