"""
Dynamic Server-Side Segment Builder (Agent 4) for ShopnoJatra Notification Intelligence.

Implements live, query-based dynamic segment evaluation (NO stale static member lists):
- 14 Core System Segments:
    1. family_travelers
    2. budget_travelers
    3. premium_travelers
    4. adventure_enthusiasts
    5. sylhet_interested
    6. coxs_bazar_interested
    7. frequent_travelers
    8. dormant_users
    9. upcoming_trips
    10. recent_searchers
    11. price_alert_subscribers
    12. hotel_oriented
    13. flight_oriented
    14. deal_responsive
- Custom admin query criteria with strict privacy & sensitive-attribute validation
- Batched server-side evaluation (zero N+1 query storms) + pure snapshot matching helper
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import logging
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Set, Tuple
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.notification import NotificationUserPreference
from app.models.personalization import (
    PersonalizationSegment,
    UserBehavioralSignal,
    UserDestinationInterest,
    UserNotificationFatigue,
    UserPersonalizationProfile,
    UserProfileDimension,
)
from app.models.price_alert import PriceAlert
from app.notifications.personalization.dimensions import (
    FORBIDDEN_SENSITIVE_ATTRIBUTES,
    UserProfile20DSnapshot,
)
from app.notifications.personalization.travel_context import normalize_destination_key

logger = logging.getLogger(__name__)


# ============================================================================
# Canonical 14 Core System Segments
# ============================================================================

SYSTEM_SEGMENT_DEFINITIONS: Tuple[Dict[str, Any], ...] = (
    {
        "key": "family_travelers",
        "name": "Family Travelers",
        "description": "Users with explicit or behavioral family travel style preferences.",
        "query_criteria": {"travel_styles_any": ["family"], "personalization_enabled": True},
    },
    {
        "key": "budget_travelers",
        "name": "Budget Travelers",
        "description": "Cost-conscious travelers preferring budget or economy tiers.",
        "query_criteria": {"budget_tiers_any": ["budget", "economy"], "personalization_enabled": True},
    },
    {
        "key": "premium_travelers",
        "name": "Premium & Luxury Travelers",
        "description": "Travelers preferring premium or luxury stays and flights.",
        "query_criteria": {"budget_tiers_any": ["premium", "luxury"], "personalization_enabled": True},
    },
    {
        "key": "adventure_enthusiasts",
        "name": "Adventure Enthusiasts",
        "description": "Users interested in adventure, trekking, and nature expeditions.",
        "query_criteria": {"travel_styles_any": ["adventure", "nature"], "personalization_enabled": True},
    },
    {
        "key": "sylhet_interested",
        "name": "Sylhet Interested",
        "description": "Users with strong time-decayed interest or favorite in Sylhet / Sreemangal.",
        "query_criteria": {"destinations_any": ["Sylhet", "Sreemangal"], "min_interest_score": 35},
    },
    {
        "key": "coxs_bazar_interested",
        "name": "Cox's Bazar Interested",
        "description": "Users with strong time-decayed interest or favorite in Cox's Bazar / Saint Martin.",
        "query_criteria": {"destinations_any": ["Cox's Bazar", "Saint Martin"], "min_interest_score": 35},
    },
    {
        "key": "frequent_travelers",
        "name": "Frequent Travelers",
        "description": "Active repeat travelers with multiple bookings or high activity level.",
        "query_criteria": {"activity_levels_any": ["highly_active", "active", "returning"], "min_bookings": 2},
    },
    {
        "key": "dormant_users",
        "name": "Dormant Users",
        "description": "Inactive or dormant users eligible for low-fatigue reactivation.",
        "query_criteria": {"activity_levels_any": ["inactive", "dormant"], "personalization_enabled": True},
    },
    {
        "key": "upcoming_trips",
        "name": "Upcoming Trips",
        "description": "Travelers preparing for departure or holding active booked itineraries.",
        "query_criteria": {"travel_timeline_stages_any": ["booked", "preparing_for_departure"]},
    },
    {
        "key": "recent_searchers",
        "name": "Recent Searchers",
        "description": "Users with recent destination or route search signals.",
        "query_criteria": {
            "travel_timeline_stages_any": ["searching_for_trip", "comparing_options", "booking_in_progress"]
        },
    },
    {
        "key": "price_alert_subscribers",
        "name": "Price Alert Subscribers",
        "description": "Users with active fare alerts or price alert opt-ins.",
        "query_criteria": {"has_price_alerts": True},
    },
    {
        "key": "hotel_oriented",
        "name": "Hotel-Oriented Travelers",
        "description": "Users showing strong hotel/resort preference or browsing history.",
        "query_criteria": {"preferred_product_types_any": ["hotel", "resort"]},
    },
    {
        "key": "flight_oriented",
        "name": "Flight-Oriented Travelers",
        "description": "Users preferring air travel for domestic or regional routes.",
        "query_criteria": {"transport_modes_any": ["flight"]},
    },
    {
        "key": "deal_responsive",
        "name": "Deal-Responsive Travelers",
        "description": "High price-sensitivity users engaging with price drop and deal alerts.",
        "query_criteria": {"price_sensitivity_any": ["high", "medium"], "min_engagement_rate": 0.15},
    },
)

SYSTEM_SEGMENT_BY_KEY: Dict[str, Dict[str, Any]] = {
    item["key"]: item for item in SYSTEM_SEGMENT_DEFINITIONS
}

ALLOWED_CRITERIA_KEYS: frozenset[str] = frozenset(
    {
        "personalization_enabled",
        "preferred_language",
        "preferred_languages_any",
        "travel_styles_any",
        "budget_tiers_any",
        "destinations_any",
        "min_interest_score",
        "activity_levels_any",
        "travel_timeline_stages_any",
        "loyalty_tiers_any",
        "min_confidence",
        "max_confidence",
        "min_bookings",
        "has_price_alerts",
        "preferred_product_types_any",
        "transport_modes_any",
        "price_sensitivity_any",
        "min_engagement_rate",
        "max_fatigue_score",
        "home_cities_any",
        "digest_frequencies_any",
        "exclude_marketing_opted_out",
    }
)


CRITERIA_KEY_ALIASES: Dict[str, Tuple[str, bool]] = {
    # alias -> (canonical_key, coerce_scalar_to_list)
    "travel_styles": ("travel_styles_any", True),
    "budget_tiers": ("budget_tiers_any", True),
    "preferred_transport": ("transport_modes_any", True),
    "transport_modes": ("transport_modes_any", True),
    "timeline_stages": ("travel_timeline_stages_any", True),
    "travel_timeline_stages": ("travel_timeline_stages_any", True),
    "activity_levels": ("activity_levels_any", True),
    "destination": ("destinations_any", True),
    "destinations": ("destinations_any", True),
    "min_destination_score": ("min_interest_score", False),
    "price_sensitivity": ("price_sensitivity_any", True),
    "loyalty_tiers": ("loyalty_tiers_any", True),
    "category_price_alerts": ("has_price_alerts", False),
    "product_focus": ("preferred_product_types_any", True),
    "preferred_product_types": ("preferred_product_types_any", True),
    "preferred_languages": ("preferred_languages_any", True),
    "digest_frequencies": ("digest_frequencies_any", True),
    "home_cities": ("home_cities_any", True),
}


def normalize_query_criteria(criteria: Mapping[str, Any]) -> Dict[str, Any]:
    """
    Normalize UI/alias criteria keys into canonical 20260622 SQL / segments.py keys
    without modifying caller dicts in place.
    """
    normalized: Dict[str, Any] = {}
    for raw_k, raw_v in criteria.items():
        if raw_k in CRITERIA_KEY_ALIASES:
            canon_k, coerce_list = CRITERIA_KEY_ALIASES[raw_k]
            if coerce_list and not isinstance(raw_v, (list, tuple, set)):
                val: Any = [raw_v]
            elif coerce_list:
                val = list(raw_v)
            else:
                val = raw_v
            if canon_k in normalized and isinstance(normalized[canon_k], list) and isinstance(val, list):
                normalized[canon_k] = list(dict.fromkeys([*normalized[canon_k], *val]))
            else:
                normalized[canon_k] = val
        else:
            normalized[raw_k] = raw_v
    return normalized


def _assert_safe_criteria(criteria: Mapping[str, Any]) -> Dict[str, Any]:
    """Validate segment query criteria and forbid sensitive demographic targeting."""
    if not isinstance(criteria, Mapping):
        raise ValueError("query_criteria must be a dictionary.")

    def _scan(obj: Any) -> None:
        if isinstance(obj, Mapping):
            for k, v in obj.items():
                norm_k = str(k).strip().lower().replace("-", "_").replace(" ", "_")
                if norm_k in FORBIDDEN_SENSITIVE_ATTRIBUTES:
                    raise ValueError(
                        f"Sensitive demographic attribute '{k}' cannot be used in segment criteria."
                    )
                _scan(v)
        elif isinstance(obj, (list, tuple)):
            for item in obj:
                if isinstance(item, str):
                    norm_i = item.strip().lower().replace("-", "_").replace(" ", "_")
                    if norm_i in FORBIDDEN_SENSITIVE_ATTRIBUTES:
                        raise ValueError(
                            f"Sensitive demographic value '{item}' cannot be used in segment criteria."
                        )
                else:
                    _scan(item)

    _scan(criteria)

    normalized = normalize_query_criteria(criteria)
    unknown_keys = [k for k in normalized.keys() if k not in ALLOWED_CRITERIA_KEYS]
    if unknown_keys:
        raise ValueError(f"Unsupported segment criteria key(s): {unknown_keys}")
    return normalized


@dataclass
class _UserSegmentEvalRecord:
    """Normalized per-user bundle assembled in batch queries for dynamic segment evaluation."""

    user_id: uuid.UUID
    personalization_enabled: bool = True
    preferred_language: str = "en"
    digest_frequency: str = "weekly"
    home_city: Optional[str] = None
    location_consent: bool = False
    travel_timeline_stage: str = "no_planned_trip"
    loyalty_tier: str = "explorer"
    activity_level: str = "new_user"
    overall_confidence: float = 0.0
    explicit_preferences: Dict[str, Any] = field(default_factory=dict)
    dimensions: Dict[str, Any] = field(default_factory=dict)
    destination_scores: Dict[str, Tuple[float, bool]] = field(default_factory=dict)
    total_bookings: int = 0
    has_active_price_alert: bool = False
    observed_product_types: Set[str] = field(default_factory=set)
    observed_transport_modes: Set[str] = field(default_factory=set)
    engagement_rate: float = 0.0
    max_fatigue_score: float = 0.0
    category_marketing_opted_in: bool = True


def _extract_tokens(val: Any, keys: Sequence[str] = ()) -> Set[str]:
    tokens: Set[str] = set()
    if val is None or val == "unknown":
        return tokens
    if isinstance(val, str):
        s = val.strip().lower().replace("-", "_")
        if s and s != "unknown":
            tokens.add(s)
        return tokens
    if isinstance(val, list):
        for item in val:
            tokens.update(_extract_tokens(item))
        return tokens
    if isinstance(val, Mapping):
        for k in keys:
            if k in val:
                tokens.update(_extract_tokens(val[k]))
    return tokens


def _matches_criteria(record: _UserSegmentEvalRecord, criteria: Mapping[str, Any]) -> bool:
    """Evaluate all predicates in `criteria` dynamically against a user's live record."""
    if not criteria:
        return True

    if "personalization_enabled" in criteria:
        if bool(record.personalization_enabled) != bool(criteria["personalization_enabled"]):
            return False

    if "preferred_language" in criteria:
        if record.preferred_language.lower() != str(criteria["preferred_language"]).lower():
            return False

    if "preferred_languages_any" in criteria:
        allowed = {str(x).lower() for x in criteria["preferred_languages_any"]}
        if record.preferred_language.lower() not in allowed:
            return False

    if "digest_frequencies_any" in criteria:
        allowed = {str(x).lower() for x in criteria["digest_frequencies_any"]}
        if record.digest_frequency.lower() not in allowed:
            return False

    if "min_confidence" in criteria:
        if record.overall_confidence < float(criteria["min_confidence"]):
            return False

    if "max_confidence" in criteria:
        if record.overall_confidence > float(criteria["max_confidence"]):
            return False

    if "activity_levels_any" in criteria:
        allowed = {str(x).strip().lower() for x in criteria["activity_levels_any"]}
        dim_act = record.dimensions.get("activity_level")
        dim_stage = (
            str(dim_act.get("level") or dim_act.get("state") or "").lower()
            if isinstance(dim_act, Mapping)
            else (str(dim_act).lower() if isinstance(dim_act, str) else "")
        )
        if record.activity_level.lower() not in allowed and dim_stage not in allowed:
            return False

    if "travel_timeline_stages_any" in criteria:
        allowed = {str(x).strip().lower() for x in criteria["travel_timeline_stages_any"]}
        dim_tl = record.dimensions.get("travel_timeline")
        dim_stage = (
            str(dim_tl.get("stage") or "").lower()
            if isinstance(dim_tl, Mapping)
            else (str(dim_tl).lower() if isinstance(dim_tl, str) else "")
        )
        if record.travel_timeline_stage.lower() not in allowed and dim_stage not in allowed:
            return False

    if "loyalty_tiers_any" in criteria:
        allowed = {str(x).strip().lower() for x in criteria["loyalty_tiers_any"]}
        if record.loyalty_tier.lower() not in allowed:
            return False

    if "travel_styles_any" in criteria:
        wanted = {str(x).strip().lower().replace("-", "_") for x in criteria["travel_styles_any"]}
        user_styles = _extract_tokens(
            record.explicit_preferences, keys=("travel_styles", "travel_interests")
        )
        user_styles.update(
            _extract_tokens(
                record.dimensions.get("travel_style"),
                keys=("styles", "interests", "travel_styles"),
            )
        )
        if not (user_styles & wanted):
            return False

    if "budget_tiers_any" in criteria:
        wanted = {str(x).strip().lower().replace("-", "_") for x in criteria["budget_tiers_any"]}
        user_budgets = _extract_tokens(record.explicit_preferences, keys=("budget_tier",))
        user_budgets.update(
            _extract_tokens(record.dimensions.get("budget_profile"), keys=("tier", "budget_tier"))
        )
        if not (user_budgets & wanted):
            return False

    if "destinations_any" in criteria:
        wanted_dests = {
            normalize_destination_key(str(d)) or str(d).strip().lower()
            for d in criteria["destinations_any"]
            if d
        }
        min_score = float(criteria.get("min_interest_score", 35.0) or 0.0)
        favs = {
            normalize_destination_key(str(d))
            for d in (record.explicit_preferences.get("favorite_destinations") or [])
            if d
        }
        matched_dest = False
        for d_key in wanted_dests:
            if d_key in favs:
                matched_dest = True
                break
            score, is_fav = record.destination_scores.get(d_key, (0.0, False))
            if is_fav or score >= min_score:
                matched_dest = True
                break
        if not matched_dest:
            return False

    if "min_bookings" in criteria:
        if record.total_bookings < int(criteria["min_bookings"]):
            return False

    if "has_price_alerts" in criteria:
        if bool(record.has_active_price_alert) != bool(criteria["has_price_alerts"]):
            return False

    if "preferred_product_types_any" in criteria:
        wanted = {str(x).strip().lower() for x in criteria["preferred_product_types_any"]}
        user_products = set(record.observed_product_types)
        user_products.update(
            _extract_tokens(record.explicit_preferences, keys=("preferred_accommodation",))
        )
        user_products.update(
            _extract_tokens(
                record.dimensions.get("accommodation_preference"),
                keys=("types", "preferred_accommodation"),
            )
        )
        # Treat accommodation subtypes ("resort", "family_hotel", "eco_stay") as hotel-oriented
        if "hotel" in wanted and (
            user_products & {"hotel", "resort", "family_hotel", "premium_hotel", "eco_stay", "budget_stay", "guesthouse"}
        ):
            pass
        elif not (user_products & wanted):
            return False

    if "transport_modes_any" in criteria:
        wanted = {str(x).strip().lower() for x in criteria["transport_modes_any"]}
        user_modes = set(record.observed_transport_modes)
        user_modes.update(
            _extract_tokens(record.explicit_preferences, keys=("preferred_transport",))
        )
        user_modes.update(
            _extract_tokens(
                record.dimensions.get("transport_preference"),
                keys=("preferred_modes", "primary_mode", "modes", "preferred_transport"),
            )
        )
        user_modes.discard("unknown")
        if not (user_modes & wanted):
            return False

    if "price_sensitivity_any" in criteria:
        wanted = {str(x).strip().lower() for x in criteria["price_sensitivity_any"]}
        ps_tokens = _extract_tokens(
            record.explicit_preferences, keys=("price_sensitivity_level",)
        )
        ps_tokens.update(
            _extract_tokens(record.dimensions.get("price_sensitivity"), keys=("level",))
        )
        if not (ps_tokens & wanted):
            return False

    if "min_engagement_rate" in criteria:
        if record.engagement_rate < float(criteria["min_engagement_rate"]):
            return False

    if "max_fatigue_score" in criteria:
        if record.max_fatigue_score > float(criteria["max_fatigue_score"]):
            return False

    if "home_cities_any" in criteria:
        if not record.location_consent or not record.home_city:
            return False
        wanted = {str(x).strip().lower() for x in criteria["home_cities_any"]}
        if record.home_city.strip().lower() not in wanted:
            return False

    if criteria.get("exclude_marketing_opted_out"):
        if not record.category_marketing_opted_in:
            return False

    return True


def _snapshot_to_eval_record(snapshot: UserProfile20DSnapshot) -> _UserSegmentEvalRecord:
    """Convert an in-memory UserProfile20DSnapshot to an evaluation bundle."""
    now = datetime.now(timezone.utc)
    dims: Dict[str, Any] = {}
    for key, dim in snapshot.dimensions.items():
        if dim.effective_confidence(now) > 0.0:
            dims[key] = dim.value

    dest_scores: Dict[str, Tuple[float, bool]] = {}
    total_bookings = 0
    for d_name, info in snapshot.destination_interests.items():
        nk = normalize_destination_key(d_name) or d_name.lower()
        dest_scores[nk] = (
            float(info.get("score", 0.0) or 0.0),
            bool(info.get("is_explicit_favorite", False)),
        )
        total_bookings += int(info.get("booking_count", 0) or 0)

    tf_val = dims.get("travel_frequency")
    if isinstance(tf_val, Mapping):
        total_bookings = max(
            total_bookings,
            int(tf_val.get("confirmed_bookings_12m") or tf_val.get("total_bookings") or 0),
        )

    ps_val = dims.get("price_sensitivity")
    has_alerts = bool(
        isinstance(ps_val, Mapping)
        and int(ps_val.get("price_alert_count") or ps_val.get("active_alerts_count") or 0) > 0
    )

    eng_val = dims.get("engagement_behavior")
    eng_rate = 0.0
    if isinstance(eng_val, Mapping):
        eng_rate = float(
            eng_val.get("open_rate")
            or eng_val.get("click_rate")
            or eng_val.get("engagement_rate")
            or 0.0
        )
        if eng_rate == 0.0 and isinstance(eng_val.get("by_category"), Mapping):
            affs = [
                float(v.get("affinity_score", 0.0) or 0.0) / 100.0
                for v in eng_val["by_category"].values()
                if isinstance(v, Mapping)
            ]
            if affs:
                eng_rate = max(affs)

    max_fatigue = max(
        (float(v.get("fatigue_score", 0.0) or 0.0) for v in snapshot.fatigue_by_category.values()),
        default=0.0,
    )

    loc_val = dims.get("location_context")
    home_city = loc_val.get("home_city") if isinstance(loc_val, Mapping) else None
    consent_val = dims.get("consent_communication_preferences")
    mkt_opt_in = True
    if isinstance(consent_val, Mapping) and consent_val.get("category_marketing") is False:
        mkt_opt_in = False

    return _UserSegmentEvalRecord(
        user_id=snapshot.user_id,
        personalization_enabled=snapshot.personalization_enabled,
        preferred_language=snapshot.preferred_language,
        digest_frequency=snapshot.digest_frequency,
        home_city=home_city,
        location_consent=snapshot.get_dimension("location_context").permission_granted,
        travel_timeline_stage=snapshot.travel_timeline_stage,
        loyalty_tier=snapshot.loyalty_tier,
        activity_level=snapshot.activity_level,
        overall_confidence=snapshot.overall_confidence,
        explicit_preferences=dict(snapshot.explicit_preferences or {}),
        dimensions=dims,
        destination_scores=dest_scores,
        total_bookings=total_bookings,
        has_active_price_alert=has_alerts,
        engagement_rate=eng_rate,
        max_fatigue_score=max_fatigue,
        category_marketing_opted_in=mkt_opt_in,
    )


# ============================================================================
# SegmentBuilderService
# ============================================================================

class SegmentBuilderService:
    """
    Dynamic query-based server-side segment builder and evaluator.
    Supports all 14 built-in segments plus custom admin criteria queries.
    """

    @staticmethod
    def validate_criteria(query_criteria: Mapping[str, Any]) -> Dict[str, Any]:
        return _assert_safe_criteria(query_criteria)

    @staticmethod
    def evaluate_snapshot(
        snapshot: UserProfile20DSnapshot,
        *,
        segment_key: Optional[str] = None,
        query_criteria: Optional[Mapping[str, Any]] = None,
    ) -> bool:
        """Pure synchronous check whether a 20D user snapshot matches a segment or criteria."""
        criteria = dict(query_criteria or {})
        if segment_key and not criteria:
            defn = SYSTEM_SEGMENT_BY_KEY.get(segment_key)
            if defn is None:
                raise ValueError(f"Unknown built-in segment key '{segment_key}'.")
            criteria = dict(defn["query_criteria"])
        clean_criteria = _assert_safe_criteria(criteria)
        return _matches_criteria(_snapshot_to_eval_record(snapshot), clean_criteria)

    @classmethod
    async def ensure_system_segments(cls, db: AsyncSession) -> List[PersonalizationSegment]:
        """Ensure all 14 canonical system segments exist in `personalization_segments`."""
        res = await db.execute(select(PersonalizationSegment))
        existing_rows = list(res.scalars().all())
        existing_by_key = {row.key: row for row in existing_rows}

        created_any = False
        for item in SYSTEM_SEGMENT_DEFINITIONS:
            if item["key"] not in existing_by_key:
                seg = PersonalizationSegment(
                    key=item["key"],
                    name=item["name"],
                    description=item["description"],
                    query_criteria=dict(item["query_criteria"]),
                    is_system=True,
                    is_active=True,
                    cached_member_count=0,
                )
                db.add(seg)
                existing_by_key[item["key"]] = seg
                created_any = True

        if created_any:
            await db.flush()

        return list(existing_by_key.values())

    @classmethod
    async def list_segments(
        cls,
        db: AsyncSession,
        *,
        active_only: bool = True,
    ) -> List[PersonalizationSegment]:
        await cls.ensure_system_segments(db)
        stmt = select(PersonalizationSegment)
        if active_only:
            stmt = stmt.where(PersonalizationSegment.is_active.is_(True))
        res = await db.execute(
            stmt.order_by(PersonalizationSegment.is_system.desc(), PersonalizationSegment.name.asc())
        )
        return list(res.scalars().all())

    @classmethod
    async def create_segment(
        cls,
        db: AsyncSession,
        *,
        key: str,
        name: str,
        description: Optional[str] = None,
        query_criteria: Mapping[str, Any],
        is_active: bool = True,
    ) -> PersonalizationSegment:
        """Create a new custom dynamic segment after validating criteria & privacy guardrails."""
        clean_key = key.strip().lower()
        clean_criteria = _assert_safe_criteria(query_criteria)

        existing = await db.execute(
            select(PersonalizationSegment).where(PersonalizationSegment.key == clean_key)
        )
        if existing.scalar_one_or_none() is not None:
            raise ValueError(f"Segment with key '{clean_key}' already exists.")

        seg = PersonalizationSegment(
            key=clean_key,
            name=name.strip(),
            description=description,
            query_criteria=clean_criteria,
            is_system=False,
            is_active=bool(is_active),
            cached_member_count=0,
        )
        db.add(seg)
        await db.flush()
        return seg

    @classmethod
    async def _load_user_eval_records(
        cls,
        db: AsyncSession,
        *,
        candidate_user_ids: Optional[Sequence[uuid.UUID]] = None,
    ) -> List[_UserSegmentEvalRecord]:
        """Batch-load live user intelligence state without N+1 queries."""
        now = datetime.now(timezone.utc)
        prof_stmt = select(UserPersonalizationProfile)
        if candidate_user_ids is not None:
            if not candidate_user_ids:
                return []
            prof_stmt = prof_stmt.where(
                UserPersonalizationProfile.user_id.in_(list(candidate_user_ids))
            )

        prof_res = await db.execute(prof_stmt)
        profiles = list(prof_res.scalars().all())
        if not profiles:
            return []

        user_ids = [p.user_id for p in profiles]
        records_by_uid: Dict[uuid.UUID, _UserSegmentEvalRecord] = {}
        for p in profiles:
            records_by_uid[p.user_id] = _UserSegmentEvalRecord(
                user_id=p.user_id,
                personalization_enabled=bool(p.personalization_enabled),
                preferred_language=p.preferred_language,
                digest_frequency=p.digest_frequency,
                home_city=p.home_city,
                location_consent=bool(p.location_consent),
                travel_timeline_stage=p.travel_timeline_stage,
                loyalty_tier=p.loyalty_tier,
                activity_level=p.activity_level,
                overall_confidence=float(p.overall_confidence or 0.0),
                explicit_preferences=dict(p.explicit_preferences or {}),
            )

        # 1. Batch load dimensions (ignore expired or zero-confidence dims)
        dim_res = await db.execute(
            select(UserProfileDimension).where(UserProfileDimension.user_id.in_(user_ids))
        )
        for dim in dim_res.scalars().all():
            rec = records_by_uid.get(dim.user_id)
            if rec is None:
                continue
            if dim.expires_at is not None:
                exp = dim.expires_at if dim.expires_at.tzinfo else dim.expires_at.replace(tzinfo=timezone.utc)
                if exp <= now:
                    continue
            if float(dim.confidence or 0.0) <= 0.0:
                continue
            if dim.value_json == "unknown" or dim.value_json is None:
                continue
            rec.dimensions[dim.dimension_key] = dim.value_json
            if dim.dimension_key == "travel_frequency" and isinstance(dim.value_json, Mapping):
                rec.total_bookings = max(
                    rec.total_bookings,
                    int(
                        dim.value_json.get("confirmed_bookings_12m")
                        or dim.value_json.get("total_bookings")
                        or 0
                    ),
                )
            if dim.dimension_key == "price_sensitivity" and isinstance(dim.value_json, Mapping):
                if (
                    int(
                        dim.value_json.get("price_alert_count")
                        or dim.value_json.get("active_alerts_count")
                        or 0
                    )
                    > 0
                ):
                    rec.has_active_price_alert = True
            if dim.dimension_key == "engagement_behavior" and isinstance(dim.value_json, Mapping):
                extracted_eng = float(
                    dim.value_json.get("open_rate")
                    or dim.value_json.get("click_rate")
                    or dim.value_json.get("engagement_rate")
                    or 0.0
                )
                if extracted_eng == 0.0 and isinstance(dim.value_json.get("by_category"), Mapping):
                    by_cat = dim.value_json["by_category"]
                    affs = [
                        float(v.get("affinity_score", 0.0) or 0.0) / 100.0
                        for v in by_cat.values()
                        if isinstance(v, Mapping)
                    ]
                    if affs:
                        extracted_eng = max(affs)
                rec.engagement_rate = max(rec.engagement_rate, extracted_eng)

        # 2. Batch load time-decayed destination interests
        dest_res = await db.execute(
            select(UserDestinationInterest).where(UserDestinationInterest.user_id.in_(user_ids))
        )
        dest_bookings: Dict[uuid.UUID, int] = {}
        for di in dest_res.scalars().all():
            rec = records_by_uid.get(di.user_id)
            if rec is None:
                continue
            nk = normalize_destination_key(di.destination) or di.destination.lower()
            rec.destination_scores[nk] = (
                float(di.score or 0.0),
                bool(di.is_explicit_favorite),
            )
            dest_bookings[di.user_id] = dest_bookings.get(di.user_id, 0) + int(di.booking_count or 0)

        for uid, cnt in dest_bookings.items():
            records_by_uid[uid].total_bookings = max(records_by_uid[uid].total_bookings, cnt)

        # 3. Batch load confirmed/completed Booking counts
        booking_res = await db.execute(
            select(Booking.user_id, func.count(Booking.id))
            .where(
                Booking.user_id.in_(user_ids),
                Booking.status.in_(["confirmed", "paid", "completed", "checked_in", "in_progress"]),
            )
            .group_by(Booking.user_id)
        )
        for uid, b_cnt in booking_res.all():
            if uid in records_by_uid:
                records_by_uid[uid].total_bookings = max(
                    records_by_uid[uid].total_bookings, int(b_cnt or 0)
                )

        # 4. Batch load active PriceAlert subscriptions
        alert_res = await db.execute(
            select(PriceAlert.user_id)
            .where(PriceAlert.user_id.in_(user_ids), PriceAlert.status == "active")
            .distinct()
        )
        for (uid,) in alert_res.all():
            if uid in records_by_uid:
                records_by_uid[uid].has_active_price_alert = True

        # 5. Batch load recent behavioral signals (product_types, transport, price alerts)
        sig_res = await db.execute(
            select(UserBehavioralSignal)
            .where(UserBehavioralSignal.user_id.in_(user_ids))
            .order_by(UserBehavioralSignal.occurred_at.desc())
            .limit(len(user_ids) * 25)
        )
        for sig in sig_res.scalars().all():
            rec = records_by_uid.get(sig.user_id)
            if rec is None:
                continue
            if sig.signal_type == "price_alert_subscribe":
                rec.has_active_price_alert = True
            if sig.product_type:
                pt = sig.product_type.strip().lower()
                rec.observed_product_types.add(pt)
                if pt in {"flight", "train", "bus", "launch", "private_vehicle"}:
                    rec.observed_transport_modes.add(pt)
            if sig.signal_type in {"hotel_view", "hotel_booking"}:
                rec.observed_product_types.add("hotel")
            if sig.signal_type in {"transport_selected", "transport_selection"} and sig.filters_json:
                mode = sig.filters_json.get("transport_mode") or sig.filters_json.get("mode")
                if mode:
                    rec.observed_transport_modes.add(str(mode).strip().lower())

        # 6. Batch load fatigue & engagement fallback + marketing consent
        fat_res = await db.execute(
            select(UserNotificationFatigue).where(UserNotificationFatigue.user_id.in_(user_ids))
        )
        for fat in fat_res.scalars().all():
            rec = records_by_uid.get(fat.user_id)
            if rec is None:
                continue
            rec.max_fatigue_score = max(rec.max_fatigue_score, float(fat.fatigue_score or 0.0))
            if fat.received_7d > 0:
                rate = (fat.opened_7d + fat.clicked_7d) / float(fat.received_7d)
                rec.engagement_rate = max(rec.engagement_rate, rate)

        pref_res = await db.execute(
            select(NotificationUserPreference).where(
                NotificationUserPreference.user_id.in_(user_ids)
            )
        )
        for pref in pref_res.scalars().all():
            rec = records_by_uid.get(pref.user_id)
            if rec is not None:
                rec.category_marketing_opted_in = bool(pref.category_marketing)

        return list(records_by_uid.values())

    @classmethod
    async def evaluate_segment_members(
        cls,
        db: AsyncSession,
        *,
        segment_key: Optional[str] = None,
        segment_id: Optional[uuid.UUID] = None,
        query_criteria: Optional[Mapping[str, Any]] = None,
        candidate_user_ids: Optional[Sequence[uuid.UUID]] = None,
        page: int = 1,
        page_size: int = 20,
        update_cache: bool = True,
    ) -> Dict[str, Any]:
        """
        Dynamically evaluate segment membership server-side against live database state.
        Never relies on stale static member lists.
        """
        await cls.ensure_system_segments(db)

        segment_row: Optional[PersonalizationSegment] = None
        resolved_key = segment_key or "custom_query"
        criteria: Dict[str, Any]

        if segment_id is not None:
            res = await db.execute(
                select(PersonalizationSegment).where(PersonalizationSegment.id == segment_id)
            )
            segment_row = res.scalar_one_or_none()
            if segment_row is None:
                raise ValueError(f"Segment '{segment_id}' not found.")
            resolved_key = segment_row.key
            criteria = dict(segment_row.query_criteria or {})
        elif segment_key is not None:
            res = await db.execute(
                select(PersonalizationSegment).where(PersonalizationSegment.key == segment_key)
            )
            segment_row = res.scalar_one_or_none()
            if segment_row is None:
                raise ValueError(f"Segment '{segment_key}' not found.")
            resolved_key = segment_row.key
            criteria = dict(segment_row.query_criteria or {})
        elif query_criteria is not None:
            criteria = _assert_safe_criteria(query_criteria)
        else:
            raise ValueError("Provide segment_key, segment_id, or query_criteria.")

        criteria = _assert_safe_criteria(criteria)

        user_records = await cls._load_user_eval_records(
            db, candidate_user_ids=candidate_user_ids
        )
        matched: List[_UserSegmentEvalRecord] = [
            rec for rec in user_records if _matches_criteria(rec, criteria)
        ]

        now = datetime.now(timezone.utc)
        if segment_row is not None and update_cache and candidate_user_ids is None:
            segment_row.cached_member_count = len(matched)
            segment_row.last_evaluated_at = now
            await db.flush()

        total = len(matched)
        safe_page = max(1, int(page))
        safe_size = max(1, min(200, int(page_size)))
        start = (safe_page - 1) * safe_size
        end = start + safe_size
        page_slice = matched[start:end]

        return {
            "segment_key": resolved_key,
            "total": total,
            "page": safe_page,
            "page_size": safe_size,
            "member_user_ids": [rec.user_id for rec in matched],
            "members": [
                {
                    "user_id": rec.user_id,
                    "loyalty_tier": rec.loyalty_tier,
                    "activity_level": rec.activity_level,
                    "travel_timeline_stage": rec.travel_timeline_stage,
                    "overall_confidence": rec.overall_confidence,
                    "preferred_language": rec.preferred_language,
                }
                for rec in page_slice
            ],
        }
