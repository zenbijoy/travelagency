"""
Behavioral Analytics Engine (`BehavioralSignalService`).

Ingests permitted travel & notification signals, enforces privacy/anti-feedback-loop
guardrails, performs O(1) incremental profile & interest updates, and computes:
- Category-level notification engagement (e.g. price alerts affinity vs marketing)
- Search velocity, repeated search vs casual browsing, and search abandonment
- Price sensitivity signals
- Time-of-day engagement histograms (user timezone aware)
- Activity lifecycle stage (`new_user`, `active`, `highly_active`, `returning`,
  `inactive`, `dormant`, `reactivated`) via configurable thresholds.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import re
from typing import Any, Dict, FrozenSet, List, Mapping, Optional, Sequence, Tuple
import uuid
from zoneinfo import ZoneInfo

from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import NotificationUserPreference
from app.models.personalization import (
    PersonalizationRuleConfig,
    UserBehavioralSignal,
    UserDestinationInterest,
    UserNotificationFatigue,
    UserPersonalizationProfile,
    UserProfileDimension,
)
from app.notifications.personalization.dimensions import (
    FORBIDDEN_SENSITIVE_ATTRIBUTES,
    compute_data_quality,
    compute_expires_at,
    sanitize_dimension_value,
)
from app.notifications.personalization.time_decay import (
    TimeDecayConfig,
    apply_config_dict,
    compute_incremental_interest,
)


ALLOWED_SIGNAL_TYPES: FrozenSet[str] = frozenset(
    {
        "search",
        "repeated_search",
        "page_view",
        "destination_view",
        "filter_used",
        "explicit_favorite",
        "explicit_remove",
        "wishlist",
        "saved_destination",
        "booking_attempt",
        "booking",
        "cancellation",
        "hotel_view",
        "hotel_booking",
        "transport_selected",
        "transport_selection",
        "price_alert_subscribe",
        "notification_open",
        "notification_click",
        "dismissal",
        "ignored",
        "notification_ignore",
        "cta_completed",
        "notification_cta_completed",
        "converted",
        "notification_conversion",
        "opt_out",
    }
)

NOTIFICATION_ENGAGEMENT_SIGNALS: FrozenSet[str] = frozenset(
    {
        "notification_open",
        "notification_click",
        "dismissal",
        "ignored",
        "notification_ignore",
        "cta_completed",
        "notification_cta_completed",
        "converted",
        "notification_conversion",
        "opt_out",
    }
)

DISCOVERY_BEHAVIORAL_SIGNALS: FrozenSet[str] = frozenset(
    {
        "search",
        "repeated_search",
        "page_view",
        "destination_view",
        "filter_used",
        "wishlist",
        "saved_destination",
        "hotel_view",
        "transport_selected",
        "transport_selection",
    }
)

DESTINATION_ALIASES: Dict[str, str] = {
    "coxs bazar": "Cox's Bazar",
    "cox's bazar": "Cox's Bazar",
    "cox s bazar": "Cox's Bazar",
    "coxbazar": "Cox's Bazar",
    "sylhet": "Sylhet",
    "sajek": "Sajek",
    "sajek valley": "Sajek",
    "sreemangal": "Sreemangal",
    "srimangal": "Sreemangal",
    "bandarban": "Bandarban",
    "saint martin": "Saint Martin",
    "saint martin's": "Saint Martin",
    "st martin": "Saint Martin",
    "st. martin": "Saint Martin",
    "sundarbans": "Sundarbans",
    "sundarban": "Sundarbans",
    "kuakata": "Kuakata",
    "dhaka": "Dhaka",
    "chittagong": "Chittagong",
    "chattogram": "Chittagong",
    "kathmandu": "Kathmandu",
    "bangkok": "Bangkok",
    "dubai": "Dubai",
    "singapore": "Singapore",
    "kuala lumpur": "Kuala Lumpur",
}


def normalize_destination_name(destination: Optional[str]) -> Optional[str]:
    """Normalize destination names consistently without inventing missing data."""
    if not destination or not isinstance(destination, str):
        return None
    cleaned = re.sub(r"\s+", " ", destination.strip())
    if not cleaned:
        return None
    lower = cleaned.lower()
    if lower in DESTINATION_ALIASES:
        return DESTINATION_ALIASES[lower]
    return cleaned.title() if cleaned.islower() or cleaned.isupper() else cleaned


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _sanitize_signal_dict(payload: Optional[Mapping[str, Any]]) -> Tuple[Dict[str, Any], List[str]]:
    """Remove any sensitive demographic or raw location coordinate keys."""
    if not payload:
        return {}, []
    cleaned: Dict[str, Any] = {}
    violations: List[str] = []
    for k, v in payload.items():
        k_str = str(k)
        k_norm = k_str.strip().lower().replace("-", "_").replace(" ", "_")
        if k_norm in FORBIDDEN_SENSITIVE_ATTRIBUTES:
            violations.append(f"Stripped forbidden sensitive signal attribute '{k_str}'")
            continue
        if isinstance(v, Mapping):
            nested, nested_v = _sanitize_signal_dict(v)
            violations.extend(nested_v)
            if nested:
                cleaned[k_str] = nested
        elif isinstance(v, list):
            kept = []
            for item in v:
                item_norm = str(item).strip().lower().replace("-", "_").replace(" ", "_")
                if item_norm in FORBIDDEN_SENSITIVE_ATTRIBUTES:
                    violations.append(f"Stripped forbidden sensitive list value '{item}'")
                else:
                    kept.append(item)
            cleaned[k_str] = kept
        elif isinstance(v, str):
            val_norm = v.strip().lower().replace("-", "_").replace(" ", "_")
            if val_norm in FORBIDDEN_SENSITIVE_ATTRIBUTES:
                violations.append(f"Stripped forbidden sensitive value '{v}'")
                continue
            cleaned[k_str] = v
        else:
            cleaned[k_str] = v
    return cleaned, violations


@dataclass(frozen=True)
class ActivityLifecycleThresholds:
    """Configurable time-window thresholds for user activity lifecycle stages."""

    active_max_days: float = 7.0
    highly_active_max_days: float = 3.0
    highly_active_min_signals_7d: int = 6
    inactive_min_days: float = 14.0
    dormant_min_days: float = 30.0
    returning_gap_days: float = 14.0
    reactivated_gap_days: float = 30.0


@dataclass(frozen=True)
class CategoryEngagementMetrics:
    category: str
    total_events: int
    opens: int
    clicks: int
    dismissals: int
    ignores: int
    cta_completions: int
    conversions: int
    opt_outs: int
    open_rate: float
    click_rate: float
    dismiss_rate: float
    affinity_score: float  # 0-100


@dataclass(frozen=True)
class SearchBehaviorMetrics:
    searches_24h: int
    searches_7d: int
    searches_30d: int
    search_velocity_7d: float
    repeated_destinations: List[str]
    casual_browsing_destinations: List[str]
    abandoned_searches: List[Dict[str, Any]]
    top_filters: Dict[str, Any]


@dataclass(frozen=True)
class PriceSensitivityMetrics:
    level: str  # "high" | "medium" | "low" | "unknown"
    score: float  # 0-100
    price_alert_count: int
    discount_filter_ratio: float
    avg_price_paisa: Optional[int]
    inferred_budget_tier: str


@dataclass(frozen=True)
class SignalIngestionResult:
    signal_id: Optional[uuid.UUID]
    recorded: bool
    profile_version: int
    updated_dimensions: List[str] = field(default_factory=list)
    anti_feedback_loop_applied: bool = False
    sanitized_violations: List[str] = field(default_factory=list)
    message: str = "Signal recorded."


class BehavioralSignalService:
    """
    Behavioral Analytics Engine for ShopnoJatra personalization.
    Supports both O(1) incremental ingestion and analytical aggregation.
    """

    @staticmethod
    def classify_activity_lifecycle(
        *,
        last_activity_at: Optional[datetime],
        signals_7d: int = 0,
        signals_30d: int = 0,
        previous_state: str = "new_user",
        previous_gap_days: Optional[float] = None,
        now: Optional[datetime] = None,
        thresholds: Optional[ActivityLifecycleThresholds] = None,
    ) -> str:
        """
        Classify user activity lifecycle into:
        `new_user`, `active`, `highly_active`, `returning`, `inactive`, `dormant`, `reactivated`.
        Never derives lifecycle or travel frequency from account age.
        """
        cfg = thresholds or ActivityLifecycleThresholds()
        ref = _ensure_utc(now or datetime.now(timezone.utc))

        if last_activity_at is None:
            return "new_user"

        last_utc = _ensure_utc(last_activity_at)
        days_since = max(0.0, (ref - last_utc).total_seconds() / 86400.0)

        if days_since >= cfg.dormant_min_days:
            return "dormant"
        if days_since >= cfg.inactive_min_days:
            return "inactive"

        # User had activity within the active window (< inactive_min_days)
        if days_since <= cfg.active_max_days:
            if previous_state == "dormant" or (
                previous_gap_days is not None and previous_gap_days >= cfg.reactivated_gap_days
            ):
                return "reactivated"
            if previous_state == "inactive" or (
                previous_gap_days is not None and previous_gap_days >= cfg.returning_gap_days
            ):
                return "returning"
            if (
                days_since <= cfg.highly_active_max_days
                and signals_7d >= cfg.highly_active_min_signals_7d
            ):
                return "highly_active"
            return "active"

        if signals_30d == 0 and previous_state == "new_user":
            return "new_user"
        return "active"

    @staticmethod
    def compute_category_engagement(
        signals: Sequence[Any],
    ) -> Dict[str, CategoryEngagementMetrics]:
        """
        Compute engagement metrics independently per notification category.
        Allows distinguishing e.g. high affinity for `price_alerts` alongside
        dismissals/opt-outs on `marketing`.
        """
        buckets: Dict[str, Dict[str, int]] = {}
        for sig in signals:
            sig_type = getattr(sig, "signal_type", None) or (sig.get("signal_type") if isinstance(sig, Mapping) else None)
            if sig_type not in NOTIFICATION_ENGAGEMENT_SIGNALS:
                continue
            category = (
                getattr(sig, "category", None)
                or (sig.get("category") if isinstance(sig, Mapping) else None)
                or "general"
            )
            cat_key = str(category).strip().lower()
            if cat_key not in buckets:
                buckets[cat_key] = {
                    "opens": 0,
                    "clicks": 0,
                    "dismissals": 0,
                    "ignores": 0,
                    "cta_completions": 0,
                    "conversions": 0,
                    "opt_outs": 0,
                }
            b = buckets[cat_key]
            if sig_type == "notification_open":
                b["opens"] += 1
            elif sig_type == "notification_click":
                b["clicks"] += 1
            elif sig_type == "dismissal":
                b["dismissals"] += 1
            elif sig_type in {"ignored", "notification_ignore"}:
                b["ignores"] += 1
            elif sig_type in {"cta_completed", "notification_cta_completed"}:
                b["cta_completions"] += 1
            elif sig_type in {"converted", "notification_conversion"}:
                b["conversions"] += 1
            elif sig_type == "opt_out":
                b["opt_outs"] += 1

        results: Dict[str, CategoryEngagementMetrics] = {}
        for cat, b in buckets.items():
            total = sum(b.values())
            denom = max(1, b["opens"] + b["dismissals"] + b["ignores"] + b["opt_outs"])
            open_rate = round(min(1.0, b["opens"] / denom), 4)
            click_rate = round(min(1.0, b["clicks"] / max(1, b["opens"] or denom)), 4)
            dismiss_rate = round(min(1.0, (b["dismissals"] + b["opt_outs"]) / denom), 4)

            if b["opt_outs"] > 0:
                affinity = 0.0
            else:
                raw_aff = (
                    50.0
                    + b["opens"] * 4.0
                    + b["clicks"] * 9.0
                    + b["cta_completions"] * 12.0
                    + b["conversions"] * 15.0
                    - b["dismissals"] * 18.0
                    - b["ignores"] * 6.0
                )
                affinity = round(max(0.0, min(100.0, raw_aff)), 2)

            results[cat] = CategoryEngagementMetrics(
                category=cat,
                total_events=total,
                opens=b["opens"],
                clicks=b["clicks"],
                dismissals=b["dismissals"],
                ignores=b["ignores"],
                cta_completions=b["cta_completions"],
                conversions=b["conversions"],
                opt_outs=b["opt_outs"],
                open_rate=open_rate,
                click_rate=click_rate,
                dismiss_rate=dismiss_rate,
                affinity_score=affinity,
            )
        return results

    @staticmethod
    def compute_search_metrics(
        signals: Sequence[Any],
        *,
        now: Optional[datetime] = None,
        abandonment_window_hours: int = 48,
        repeated_window_hours: int = 72,
    ) -> SearchBehaviorMetrics:
        """
        Compute search velocity, repeated vs casual browsing, filters, and
        abandoned searches (searches without booking within configurable window).
        """
        ref = _ensure_utc(now or datetime.now(timezone.utc))
        cutoff_24h = ref - timedelta(hours=24)
        cutoff_7d = ref - timedelta(days=7)
        cutoff_30d = ref - timedelta(days=30)
        repeat_cutoff = ref - timedelta(hours=repeated_window_hours)
        abandon_cutoff = ref - timedelta(hours=abandonment_window_hours)

        searches_24h = 0
        searches_7d = 0
        searches_30d = 0
        recent_dest_searches: Dict[str, List[datetime]] = {}
        view_only_dests: Dict[str, int] = {}
        bookings_by_dest: Dict[str, datetime] = {}
        latest_search_by_dest: Dict[str, Dict[str, Any]] = {}
        filter_counts: Dict[str, Dict[str, int]] = {}

        def _get(sig: Any, attr: str, default: Any = None) -> Any:
            if isinstance(sig, Mapping):
                return sig.get(attr, default)
            return getattr(sig, attr, default)

        for sig in signals:
            sig_type = _get(sig, "signal_type")
            occ_raw = _get(sig, "occurred_at")
            if occ_raw is None:
                continue
            occ = _ensure_utc(occ_raw)
            dest = normalize_destination_name(_get(sig, "destination"))
            route_key = _get(sig, "route_key")
            product_type = _get(sig, "product_type")
            filters = _get(sig, "filters_json") or _get(sig, "filters") or {}

            if sig_type in {"booking", "hotel_booking"} and dest:
                prev_bk = bookings_by_dest.get(dest)
                if prev_bk is None or occ > prev_bk:
                    bookings_by_dest[dest] = occ
                continue

            if sig_type in {"page_view", "destination_view", "hotel_view"} and dest:
                view_only_dests[dest] = view_only_dests.get(dest, 0) + 1

            if sig_type in {"search", "repeated_search"}:
                if occ >= cutoff_24h:
                    searches_24h += 1
                if occ >= cutoff_7d:
                    searches_7d += 1
                if occ >= cutoff_30d:
                    searches_30d += 1
                if dest:
                    if occ >= repeat_cutoff:
                        recent_dest_searches.setdefault(dest, []).append(occ)
                    prev = latest_search_by_dest.get(dest)
                    if prev is None or occ > prev["last_searched_at"]:
                        latest_search_by_dest[dest] = {
                            "destination": dest,
                            "route_key": route_key,
                            "product_type": product_type,
                            "last_searched_at": occ,
                            "search_count": (prev["search_count"] + 1) if prev else 1,
                        }
                    else:
                        prev["search_count"] += 1

            if isinstance(filters, Mapping):
                for fk, fv in filters.items():
                    if str(fk).lower() in FORBIDDEN_SENSITIVE_ATTRIBUTES or fv is None:
                        continue
                    f_bucket = filter_counts.setdefault(str(fk), {})
                    fv_str = str(fv)
                    f_bucket[fv_str] = f_bucket.get(fv_str, 0) + 1

        repeated_destinations = sorted(
            dest for dest, times in recent_dest_searches.items() if len(times) >= 2
        )
        casual_browsing = sorted(
            dest
            for dest, count in view_only_dests.items()
            if count == 1 and dest not in recent_dest_searches
        )

        abandoned: List[Dict[str, Any]] = []
        for dest, info in latest_search_by_dest.items():
            last_s = info["last_searched_at"]
            if last_s < abandon_cutoff:
                continue
            booked_at = bookings_by_dest.get(dest)
            if booked_at is not None and booked_at >= last_s:
                continue
            abandoned.append(
                {
                    "destination": dest,
                    "route_key": info["route_key"],
                    "product_type": info["product_type"],
                    "search_count": info["search_count"],
                    "last_searched_at": last_s.isoformat(),
                }
            )
        abandoned.sort(key=lambda item: item["last_searched_at"], reverse=True)

        top_filters = {
            fk: max(counts.items(), key=lambda item: item[1])[0]
            for fk, counts in filter_counts.items()
            if counts
        }

        return SearchBehaviorMetrics(
            searches_24h=searches_24h,
            searches_7d=searches_7d,
            searches_30d=searches_30d,
            search_velocity_7d=round(searches_7d / 7.0, 2),
            repeated_destinations=repeated_destinations,
            casual_browsing_destinations=casual_browsing,
            abandoned_searches=abandoned,
            top_filters=top_filters,
        )

    @staticmethod
    def compute_price_sensitivity(
        signals: Sequence[Any],
        *,
        explicit_level: Optional[str] = None,
        explicit_budget_tier: Optional[str] = None,
    ) -> PriceSensitivityMetrics:
        """Compute price sensitivity score, discount ratio, and inferred budget tier."""
        prices: List[int] = []
        price_alerts = 0
        filter_events = 0
        discount_or_price_filters = 0

        def _get(sig: Any, attr: str, default: Any = None) -> Any:
            if isinstance(sig, Mapping):
                return sig.get(attr, default)
            return getattr(sig, attr, default)

        for sig in signals:
            sig_type = _get(sig, "signal_type")
            price = _get(sig, "price_paisa")
            if isinstance(price, (int, float)) and price > 0:
                prices.append(int(price))
            if sig_type == "price_alert_subscribe":
                price_alerts += 1
            filters = _get(sig, "filters_json") or _get(sig, "filters") or {}
            if isinstance(filters, Mapping) and filters:
                filter_events += 1
                keys_lower = {str(k).lower() for k in filters.keys()}
                vals_lower = {str(v).lower() for v in filters.values()}
                if (
                    keys_lower & {"max_price", "price_range", "discount_only", "sort_by", "budget"}
                    or "price_low_to_high" in vals_lower
                    or "budget" in vals_lower
                    or filters.get("discount_only") is True
                ):
                    discount_or_price_filters += 1

        avg_price = int(sum(prices) / len(prices)) if prices else None
        ratio = round(discount_or_price_filters / filter_events, 3) if filter_events > 0 else 0.0

        # Infer budget tier from observed prices in BDT paisa (1 BDT = 100 paisa)
        if explicit_budget_tier and explicit_budget_tier != "unknown":
            inferred_tier = explicit_budget_tier
        elif avg_price is None:
            inferred_tier = "unknown"
        elif avg_price < 400_000:  # < 4,000 BDT
            inferred_tier = "budget"
        elif avg_price < 900_000:  # < 9,000 BDT
            inferred_tier = "economy"
        elif avg_price < 2_500_000:  # < 25,000 BDT
            inferred_tier = "mid_range"
        elif avg_price < 6_000_000:  # < 60,000 BDT
            inferred_tier = "premium"
        else:
            inferred_tier = "luxury"

        if explicit_level in {"low", "medium", "high"}:
            score = {"low": 25.0, "medium": 55.0, "high": 85.0}[explicit_level]
            return PriceSensitivityMetrics(
                level=explicit_level,
                score=score,
                price_alert_count=price_alerts,
                discount_filter_ratio=ratio,
                avg_price_paisa=avg_price,
                inferred_budget_tier=inferred_tier,
            )

        if price_alerts == 0 and filter_events == 0 and avg_price is None:
            return PriceSensitivityMetrics(
                level="unknown",
                score=0.0,
                price_alert_count=0,
                discount_filter_ratio=0.0,
                avg_price_paisa=None,
                inferred_budget_tier="unknown",
            )

        raw_score = 35.0 + min(35.0, price_alerts * 15.0) + min(30.0, ratio * 40.0)
        if inferred_tier in {"budget", "economy"}:
            raw_score += 15.0
        elif inferred_tier == "luxury":
            raw_score -= 15.0
        score = round(max(0.0, min(100.0, raw_score)), 2)

        if score >= 65.0:
            level = "high"
        elif score >= 35.0:
            level = "medium"
        else:
            level = "low"

        return PriceSensitivityMetrics(
            level=level,
            score=score,
            price_alert_count=price_alerts,
            discount_filter_ratio=ratio,
            avg_price_paisa=avg_price,
            inferred_budget_tier=inferred_tier,
        )

    @staticmethod
    def compute_time_of_day_histogram(
        signals: Sequence[Any],
        *,
        timezone_name: str = "Asia/Dhaka",
    ) -> Dict[str, Any]:
        """Build a 24-hour engagement histogram in the user's timezone."""
        try:
            tz = ZoneInfo(timezone_name)
        except Exception:
            tz = ZoneInfo("Asia/Dhaka")

        histogram: Dict[str, float] = {str(h): 0.0 for h in range(24)}
        event_weights = {
            "notification_click": 2.0,
            "cta_completed": 2.5,
            "notification_cta_completed": 2.5,
            "converted": 3.0,
            "notification_conversion": 3.0,
            "notification_open": 1.2,
            "search": 1.5,
            "booking": 2.5,
        }

        def _get(sig: Any, attr: str, default: Any = None) -> Any:
            if isinstance(sig, Mapping):
                return sig.get(attr, default)
            return getattr(sig, attr, default)

        total_obs = 0
        for sig in signals:
            sig_type = _get(sig, "signal_type")
            if sig_type in {"dismissal", "ignored", "notification_ignore", "opt_out"}:
                continue
            occ = _get(sig, "occurred_at")
            if occ is None:
                continue
            local_dt = _ensure_utc(occ).astimezone(tz)
            w = event_weights.get(str(sig_type), 1.0)
            key = str(local_dt.hour)
            histogram[key] = round(histogram[key] + w, 2)
            total_obs += 1

        if total_obs == 0:
            return {
                "timezone": str(tz),
                "histogram": histogram,
                "peak_hours": [],
                "inferred_window": "unknown",
                "sample_size": 0,
            }

        ranked_hours = sorted(
            ((int(h), val) for h, val in histogram.items() if val > 0),
            key=lambda item: item[1],
            reverse=True,
        )
        peak_hours = [h for h, _ in ranked_hours[:3]]
        top_hour = peak_hours[0] if peak_hours else 10
        if 6 <= top_hour <= 11:
            window = "morning"
        elif 12 <= top_hour <= 16:
            window = "afternoon"
        elif 17 <= top_hour <= 20:
            window = "evening"
        else:
            window = "late_evening"

        return {
            "timezone": str(tz),
            "histogram": histogram,
            "peak_hours": peak_hours,
            "inferred_window": window,
            "sample_size": total_obs,
        }

    @classmethod
    async def _load_active_decay_config(cls, db: AsyncSession) -> TimeDecayConfig:
        res = await db.execute(
            select(PersonalizationRuleConfig)
            .where(PersonalizationRuleConfig.is_active.is_(True))
            .order_by(desc(PersonalizationRuleConfig.version))
            .limit(1)
        )
        row = res.scalar_one_or_none()
        if not row:
            return TimeDecayConfig()
        return apply_config_dict(
            {
                "decay_lambda": row.decay_lambda,
                "signal_weights": (row.dimension_configs_json or {}).get("signal_weights"),
            }
        )

    @classmethod
    async def _get_or_create_profile_row(
        cls,
        db: AsyncSession,
        user_id: uuid.UUID,
    ) -> UserPersonalizationProfile:
        res = await db.execute(
            select(UserPersonalizationProfile).where(UserPersonalizationProfile.user_id == user_id)
        )
        profile = res.scalar_one_or_none()
        if profile is None:
            profile = UserPersonalizationProfile(user_id=user_id)
            db.add(profile)
            await db.flush()
        return profile

    @classmethod
    async def _upsert_behavioral_dimension(
        cls,
        db: AsyncSession,
        *,
        user_id: uuid.UUID,
        dimension_key: str,
        value: Any,
        confidence: float,
        source: str,
        now: datetime,
        permission_granted: bool = True,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[UserProfileDimension]:
        """
        Update a dimension ONLY if no explicit `user_preference` override exists.
        Explicit user preferences always win over behavioral inference.
        """
        sanitized, _ = sanitize_dimension_value(
            dimension_key,
            value,
            is_user_provided=False,
            source=source,
            permission_granted=permission_granted,
        )
        if sanitized == "unknown":
            return None

        res = await db.execute(
            select(UserProfileDimension).where(
                and_(
                    UserProfileDimension.user_id == user_id,
                    UserProfileDimension.dimension_key == dimension_key,
                )
            )
        )
        dim = res.scalar_one_or_none()

        # Explicit user preference override protection
        if dim is not None and (dim.is_user_provided or dim.source == "user_preference"):
            return None

        if dim is not None and (dim.metadata_json or {}).get("suppressed_by_user"):
            return None

        quality = compute_data_quality(sanitized, confidence, source)
        expires_at = compute_expires_at(dimension_key, reference_time=now)

        if dim is None:
            dim = UserProfileDimension(
                user_id=user_id,
                dimension_key=dimension_key,
                value_json=sanitized,
                confidence=round(max(0.0, min(100.0, confidence)), 2),
                source=source,
                data_quality=quality,
                is_user_provided=False,
                permission_granted=permission_granted,
                expires_at=expires_at,
                metadata_json=dict(metadata or {}),
            )
            db.add(dim)
        else:
            dim.value_json = sanitized
            dim.confidence = round(max(0.0, min(100.0, confidence)), 2)
            dim.source = source
            dim.data_quality = quality
            dim.is_user_provided = False
            dim.permission_granted = permission_granted
            dim.expires_at = expires_at
            if metadata:
                merged_meta = dict(dim.metadata_json or {})
                merged_meta.update(metadata)
                dim.metadata_json = merged_meta

        return dim

    @classmethod
    async def ingest_signal(
        cls,
        db: AsyncSession,
        *,
        user_id: uuid.UUID,
        signal_type: str,
        category: Optional[str] = None,
        destination: Optional[str] = None,
        route_key: Optional[str] = None,
        product_type: Optional[str] = None,
        price_paisa: Optional[int] = None,
        currency: str = "BDT",
        filters: Optional[Mapping[str, Any]] = None,
        occurred_at: Optional[datetime] = None,
        metadata: Optional[Mapping[str, Any]] = None,
        auto_update_profile: bool = True,
    ) -> SignalIngestionResult:
        """
        Ingest a permitted behavioral/transactional/notification signal and perform
        O(1) incremental updates without expensive full profile recomputation.
        """
        if signal_type not in ALLOWED_SIGNAL_TYPES:
            raise ValueError(f"Unsupported behavioral signal_type: '{signal_type}'")

        now = _ensure_utc(occurred_at or datetime.now(timezone.utc))
        norm_dest = normalize_destination_name(destination)
        clean_filters, filter_violations = _sanitize_signal_dict(filters)
        clean_meta, meta_violations = _sanitize_signal_dict(metadata)
        violations = filter_violations + meta_violations

        profile = await cls._get_or_create_profile_row(db, user_id)

        # If personalization is disabled, ignore behavioral discovery inference
        if not profile.personalization_enabled and signal_type in DISCOVERY_BEHAVIORAL_SIGNALS:
            return SignalIngestionResult(
                signal_id=None,
                recorded=False,
                profile_version=profile.profile_version,
                updated_dimensions=[],
                anti_feedback_loop_applied=False,
                sanitized_violations=violations,
                message="Personalization is disabled by user; behavioral signal skipped.",
            )

        decay_cfg = await cls._load_active_decay_config(db)

        # Detect repeated search within 72h for scoring weight elevation
        effective_signal_type = signal_type
        if signal_type == "search" and (norm_dest or route_key):
            repeat_cutoff = now - timedelta(hours=72)
            conds = [
                UserBehavioralSignal.user_id == user_id,
                UserBehavioralSignal.signal_type.in_(["search", "repeated_search"]),
                UserBehavioralSignal.occurred_at >= repeat_cutoff,
            ]
            if norm_dest:
                conds.append(UserBehavioralSignal.destination == norm_dest)
            elif route_key:
                conds.append(UserBehavioralSignal.route_key == route_key)
            prev_count_res = await db.execute(select(func.count()).select_from(UserBehavioralSignal).where(*conds))
            if (prev_count_res.scalar() or 0) > 0:
                effective_signal_type = "repeated_search"
                clean_meta["is_repeated_search"] = True

        # Anti-feedback-loop guard: notification clicks/opens never amplify travel intent
        anti_feedback_loop = signal_type in {
            "notification_open",
            "notification_click",
            "cta_completed",
            "notification_cta_completed",
        }
        if anti_feedback_loop:
            clean_meta["anti_feedback_loop_guarded"] = True

        weight = decay_cfg.get_weight(effective_signal_type)
        conf = decay_cfg.get_default_confidence(effective_signal_type)

        sig_row = UserBehavioralSignal(
            user_id=user_id,
            signal_type=signal_type,
            category=category,
            destination=norm_dest,
            route_key=route_key,
            product_type=product_type,
            price_paisa=price_paisa,
            currency=(currency or "BDT").upper()[:10],
            filters_json=clean_filters,
            signal_weight=weight,
            confidence=conf,
            occurred_at=now,
            expires_at=now + timedelta(days=decay_cfg.max_signal_age_days),
            processed_at=now if auto_update_profile else None,
            metadata_json=clean_meta,
        )
        db.add(sig_row)
        await db.flush()

        updated_dims: List[str] = []

        if auto_update_profile:
            # 1. Activity lifecycle update (incremental)
            prev_last = profile.last_activity_at
            prev_gap = (
                max(0.0, (now - _ensure_utc(prev_last)).total_seconds() / 86400.0)
                if prev_last is not None
                else None
            )
            cutoff_7d = now - timedelta(days=7)
            s7_res = await db.execute(
                select(func.count())
                .select_from(UserBehavioralSignal)
                .where(
                    and_(
                        UserBehavioralSignal.user_id == user_id,
                        UserBehavioralSignal.occurred_at >= cutoff_7d,
                    )
                )
            )
            signals_7d = int(s7_res.scalar() or 1)

            if signal_type not in {"ignored", "notification_ignore"}:
                new_activity_level = cls.classify_activity_lifecycle(
                    last_activity_at=now,
                    signals_7d=signals_7d,
                    signals_30d=signals_7d,
                    previous_state=profile.activity_level,
                    previous_gap_days=prev_gap,
                    now=now,
                )
                profile.activity_level = new_activity_level
                if prev_last is None or now > _ensure_utc(prev_last):
                    profile.last_activity_at = now
                if await cls._upsert_behavioral_dimension(
                    db,
                    user_id=user_id,
                    dimension_key="activity_level",
                    value={"stage": new_activity_level, "signals_7d": signals_7d},
                    confidence=min(95.0, 55.0 + signals_7d * 4.0),
                    source="behavioral",
                    now=now,
                ):
                    updated_dims.append("activity_level")

            # 2. Incremental destination interest update (skip behavioral inflation on passive notif opens/clicks when disabled or anti-loop)
            if (
                norm_dest
                and (profile.personalization_enabled or signal_type in {"explicit_favorite", "explicit_remove", "opt_out"})
                and not (anti_feedback_loop and signal_type == "notification_open")
            ):
                dest_res = await db.execute(
                    select(UserDestinationInterest).where(
                        and_(
                            UserDestinationInterest.user_id == user_id,
                            UserDestinationInterest.destination == norm_dest,
                        )
                    )
                )
                dest_row = dest_res.scalar_one_or_none()
                is_search = signal_type in {"search", "repeated_search"}
                is_booking = signal_type in {"booking", "hotel_booking"}

                if dest_row is None:
                    calc = compute_incremental_interest(
                        current_raw_score=0.0,
                        last_signal_at=None,
                        signal_type=effective_signal_type,
                        occurred_at=now,
                        signal_count=0,
                        search_count=1 if is_search else 0,
                        booking_count=1 if is_booking else 0,
                        is_explicit_favorite=(signal_type == "explicit_favorite"),
                        signal_weight=weight,
                        signal_confidence=conf,
                        config=decay_cfg,
                    )
                    dest_row = UserDestinationInterest(
                        user_id=user_id,
                        destination=norm_dest,
                        score=calc.normalized_score,
                        raw_decayed_score=calc.raw_decayed_score,
                        confidence=calc.confidence_score,
                        signal_count=1,
                        search_count=1 if is_search else 0,
                        booking_count=1 if is_booking else 0,
                        is_explicit_favorite=calc.is_explicit_favorite,
                        last_signal_at=calc.last_signal_at,
                        last_decay_computed_at=now,
                    )
                    db.add(dest_row)
                else:
                    new_search_count = dest_row.search_count + (1 if is_search else 0)
                    new_booking_count = dest_row.booking_count + (1 if is_booking else 0)
                    decay_ref = dest_row.last_decay_computed_at or dest_row.last_signal_at
                    calc = compute_incremental_interest(
                        current_raw_score=dest_row.raw_decayed_score,
                        last_signal_at=decay_ref,
                        signal_type=effective_signal_type,
                        occurred_at=now,
                        signal_count=dest_row.signal_count,
                        search_count=new_search_count,
                        booking_count=new_booking_count,
                        is_explicit_favorite=dest_row.is_explicit_favorite,
                        signal_weight=weight,
                        signal_confidence=conf,
                        config=decay_cfg,
                    )
                    dest_row.score = calc.normalized_score
                    dest_row.raw_decayed_score = calc.raw_decayed_score
                    dest_row.confidence = calc.confidence_score
                    dest_row.signal_count = dest_row.signal_count + 1
                    dest_row.search_count = new_search_count
                    dest_row.booking_count = new_booking_count
                    dest_row.is_explicit_favorite = calc.is_explicit_favorite
                    prev_sig_ts = _ensure_utc(dest_row.last_signal_at) if dest_row.last_signal_at else None
                    dest_row.last_signal_at = (
                        now if (prev_sig_ts is None or now > prev_sig_ts) else prev_sig_ts
                    )
                    prev_dec_ts = _ensure_utc(decay_ref) if decay_ref else None
                    dest_row.last_decay_computed_at = (
                        now if (prev_dec_ts is None or now > prev_dec_ts) else prev_dec_ts
                    )
                updated_dims.append("destination_interest")

            # 3. Incremental search_behavior dimension (never promoted by notification clicks!)
            if (
                profile.personalization_enabled
                and signal_type in {"search", "repeated_search", "filter_used", "booking_attempt"}
                and not anti_feedback_loop
            ):
                search_dim_res = await db.execute(
                    select(UserProfileDimension).where(
                        and_(
                            UserProfileDimension.user_id == user_id,
                            UserProfileDimension.dimension_key == "search_behavior",
                        )
                    )
                )
                existing_sb = search_dim_res.scalar_one_or_none()
                sb_val = dict(existing_sb.value_json) if (existing_sb and isinstance(existing_sb.value_json, dict)) else {}
                recent_dests = list(sb_val.get("recent_destinations", []))
                if norm_dest:
                    if norm_dest in recent_dests:
                        repeated_dests = list(set(sb_val.get("repeated_destinations", [])) | {norm_dest})
                        sb_val["repeated_destinations"] = repeated_dests[:10]
                    else:
                        recent_dests = ([norm_dest] + recent_dests)[:10]
                sb_val["recent_destinations"] = recent_dests
                sb_val["total_searches"] = int(sb_val.get("total_searches", 0)) + (1 if signal_type in {"search", "repeated_search"} else 0)
                sb_val["last_search_at"] = now.isoformat()
                if clean_filters:
                    merged_filters = dict(sb_val.get("top_filters", {}))
                    merged_filters.update(clean_filters)
                    sb_val["top_filters"] = merged_filters
                if await cls._upsert_behavioral_dimension(
                    db,
                    user_id=user_id,
                    dimension_key="search_behavior",
                    value=sb_val,
                    confidence=min(90.0, 40.0 + sb_val["total_searches"] * 10.0),
                    source="behavioral",
                    now=now,
                ):
                    updated_dims.append("search_behavior")

            # 4. Incremental transport_preference inference (only if no explicit override)
            if profile.personalization_enabled and (
                signal_type in {"transport_selected", "transport_selection"}
                or (
                    product_type in {"flight", "train", "bus", "launch", "ferry", "private_vehicle"}
                    and signal_type in {"booking", "search", "booking_attempt"}
                )
            ):
                mode = (
                    clean_meta.get("transport_mode")
                    or clean_filters.get("transport_mode")
                    or product_type
                )
                if mode in {"flight", "train", "bus", "launch", "ferry", "private_vehicle", "mixed"}:
                    if await cls._upsert_behavioral_dimension(
                        db,
                        user_id=user_id,
                        dimension_key="transport_preference",
                        value={"preferred_modes": [mode], "primary_mode": mode},
                        confidence=75.0 if signal_type == "booking" else 52.0,
                        source="transactional" if signal_type == "booking" else "behavioral",
                        now=now,
                    ):
                        updated_dims.append("transport_preference")

            # 5. Incremental accommodation_preference inference (only if no explicit override)
            if profile.personalization_enabled and (
                signal_type in {"hotel_booking", "hotel_view"}
                or (
                    product_type == "hotel" and signal_type in {"booking", "search", "filter_used"}
                )
            ):
                acc_type = clean_filters.get("accommodation_type") or clean_meta.get("accommodation_type") or "hotel"
                amenities = list(clean_filters.get("amenities", []) or clean_meta.get("amenities", []))
                acc_val: Dict[str, Any] = {"types": [acc_type]}
                if amenities:
                    acc_val["amenities"] = amenities[:10]
                is_strong = signal_type in {"hotel_booking", "booking"}
                if await cls._upsert_behavioral_dimension(
                    db,
                    user_id=user_id,
                    dimension_key="accommodation_preference",
                    value=acc_val,
                    confidence=78.0 if is_strong else 32.0,
                    source="transactional" if is_strong else "behavioral",
                    now=now,
                ):
                    updated_dims.append("accommodation_preference")

            # 6. Incremental price_sensitivity & budget_profile (when price or alert present)
            if profile.personalization_enabled and (
                signal_type == "price_alert_subscribe" or (price_paisa and price_paisa > 0)
            ):
                ps_metrics = cls.compute_price_sensitivity(
                    [
                        {
                            "signal_type": signal_type,
                            "price_paisa": price_paisa,
                            "filters": clean_filters,
                        }
                    ]
                )
                if ps_metrics.level != "unknown":
                    if await cls._upsert_behavioral_dimension(
                        db,
                        user_id=user_id,
                        dimension_key="price_sensitivity",
                        value={
                            "level": ps_metrics.level,
                            "score": ps_metrics.score,
                            "price_alert_count": ps_metrics.price_alert_count,
                        },
                        confidence=82.0 if signal_type == "price_alert_subscribe" else 50.0,
                        source="behavioral",
                        now=now,
                    ):
                        updated_dims.append("price_sensitivity")

                if ps_metrics.inferred_budget_tier != "unknown":
                    is_booking_sig = signal_type in {"booking", "hotel_booking"}
                    if await cls._upsert_behavioral_dimension(
                        db,
                        user_id=user_id,
                        dimension_key="budget_profile",
                        value={
                            "tier": ps_metrics.inferred_budget_tier,
                            "avg_spend_paisa": ps_metrics.avg_price_paisa,
                            "currency": (currency or "BDT").upper()[:10],
                        },
                        confidence=78.0 if is_booking_sig else 42.0,
                        source="transactional" if is_booking_sig else "behavioral",
                        now=now,
                    ):
                        updated_dims.append("budget_profile")

            # 7. Incremental travel_frequency (ONLY from actual bookings, NEVER account age!)
            if profile.personalization_enabled and signal_type in {"booking", "hotel_booking"}:
                bk_cutoff = now - timedelta(days=365)
                bk_count_res = await db.execute(
                    select(func.count())
                    .select_from(UserBehavioralSignal)
                    .where(
                        and_(
                            UserBehavioralSignal.user_id == user_id,
                            UserBehavioralSignal.signal_type.in_(["booking", "hotel_booking"]),
                            UserBehavioralSignal.occurred_at >= bk_cutoff,
                        )
                    )
                )
                bookings_12m = int(bk_count_res.scalar() or 1)
                freq_tier = (
                    "power" if bookings_12m >= 6 else ("frequent" if bookings_12m >= 3 else "occasional")
                )
                if await cls._upsert_behavioral_dimension(
                    db,
                    user_id=user_id,
                    dimension_key="travel_frequency",
                    value={
                        "tier": freq_tier,
                        "confirmed_bookings_12m": bookings_12m,
                    },
                    confidence=min(98.0, 65.0 + bookings_12m * 8.0),
                    source="transactional",
                    now=now,
                ):
                    updated_dims.append("travel_frequency")

            # 8. Incremental engagement_behavior & fatigue updates for notification signals
            if signal_type in NOTIFICATION_ENGAGEMENT_SIGNALS:
                cat_key = (category or "general").strip().lower()
                eng_res = await db.execute(
                    select(UserProfileDimension).where(
                        and_(
                            UserProfileDimension.user_id == user_id,
                            UserProfileDimension.dimension_key == "engagement_behavior",
                        )
                    )
                )
                eng_dim = eng_res.scalar_one_or_none()
                eng_val = dict(eng_dim.value_json) if (eng_dim and isinstance(eng_dim.value_json, dict)) else {}
                by_cat = dict(eng_val.get("by_category", {}))
                c_stats = dict(
                    by_cat.get(
                        cat_key,
                        {
                            "opens": 0,
                            "clicks": 0,
                            "dismissals": 0,
                            "ignores": 0,
                            "cta_completions": 0,
                            "conversions": 0,
                            "opt_outs": 0,
                        },
                    )
                )
                if signal_type == "notification_open":
                    c_stats["opens"] += 1
                elif signal_type == "notification_click":
                    c_stats["clicks"] += 1
                elif signal_type == "dismissal":
                    c_stats["dismissals"] += 1
                elif signal_type in {"ignored", "notification_ignore"}:
                    c_stats["ignores"] += 1
                elif signal_type in {"cta_completed", "notification_cta_completed"}:
                    c_stats["cta_completions"] += 1
                elif signal_type in {"converted", "notification_conversion"}:
                    c_stats["conversions"] += 1
                elif signal_type == "opt_out":
                    c_stats["opt_outs"] += 1

                if c_stats["opt_outs"] > 0:
                    c_stats["affinity_score"] = 0.0
                else:
                    raw_aff = (
                        50.0
                        + c_stats["opens"] * 4.0
                        + c_stats["clicks"] * 9.0
                        + c_stats["cta_completions"] * 12.0
                        + c_stats["conversions"] * 15.0
                        - c_stats["dismissals"] * 18.0
                        - c_stats["ignores"] * 6.0
                    )
                    c_stats["affinity_score"] = round(max(0.0, min(100.0, raw_aff)), 2)

                by_cat[cat_key] = c_stats
                eng_val["by_category"] = by_cat
                eng_val["last_engagement_at"] = now.isoformat()
                total_eng_events = sum(
                    sum(v for k, v in st.items() if isinstance(v, int))
                    for st in by_cat.values()
                )
                if await cls._upsert_behavioral_dimension(
                    db,
                    user_id=user_id,
                    dimension_key="engagement_behavior",
                    value=eng_val,
                    confidence=min(95.0, 45.0 + total_eng_events * 6.0),
                    source="behavioral",
                    now=now,
                ):
                    updated_dims.append("engagement_behavior")

                # Sync category opt-out or dismissal counters to fatigue / preference safely
                if signal_type == "opt_out":
                    pref_res = await db.execute(
                        select(NotificationUserPreference).where(
                            NotificationUserPreference.user_id == user_id
                        )
                    )
                    notif_pref = pref_res.scalar_one_or_none()
                    if notif_pref is None:
                        notif_pref = NotificationUserPreference(user_id=user_id)
                        db.add(notif_pref)
                    if cat_key in {"marketing", "all_marketing", "promo"}:
                        notif_pref.category_marketing = False
                    elif cat_key == "price_alerts":
                        notif_pref.category_price_alerts = False
                    elif cat_key == "community":
                        notif_pref.category_community = False

                fat_res = await db.execute(
                    select(UserNotificationFatigue).where(
                        and_(
                            UserNotificationFatigue.user_id == user_id,
                            UserNotificationFatigue.category == cat_key,
                        )
                    )
                )
                fat_row = fat_res.scalar_one_or_none()
                if fat_row is None:
                    fat_row = UserNotificationFatigue(
                        user_id=user_id,
                        category=cat_key,
                        fatigue_score=0.0,
                        received_24h=0,
                        received_7d=0,
                        opened_7d=0,
                        clicked_7d=0,
                        dismissed_7d=0,
                        ignored_7d=0,
                        opt_out_count=0,
                    )
                    db.add(fat_row)
                cur_fat = float(fat_row.fatigue_score or 0.0)
                if signal_type == "notification_open":
                    fat_row.opened_7d = int(fat_row.opened_7d or 0) + 1
                    fat_row.fatigue_score = round(max(0.0, cur_fat - 3.0), 2)
                elif signal_type == "notification_click":
                    fat_row.clicked_7d = int(fat_row.clicked_7d or 0) + 1
                    fat_row.fatigue_score = round(max(0.0, cur_fat - 5.0), 2)
                elif signal_type == "dismissal":
                    fat_row.dismissed_7d = int(fat_row.dismissed_7d or 0) + 1
                    fat_row.fatigue_score = round(min(100.0, cur_fat + 18.0), 2)
                elif signal_type in {"ignored", "notification_ignore"}:
                    fat_row.ignored_7d = int(fat_row.ignored_7d or 0) + 1
                    fat_row.fatigue_score = round(min(100.0, cur_fat + 8.0), 2)
                elif signal_type == "opt_out":
                    fat_row.opt_out_count = int(fat_row.opt_out_count or 0) + 1
                    fat_row.fatigue_score = 100.0

            # 9. Travel timeline stage incremental transition (never triggered by notification click!)
            if profile.personalization_enabled and not anti_feedback_loop:
                new_stage: Optional[str] = None
                if signal_type in {"booking", "hotel_booking"}:
                    new_stage = "booked"
                elif signal_type == "booking_attempt" and profile.travel_timeline_stage not in {
                    "booked",
                    "preparing_for_departure",
                    "traveling",
                }:
                    new_stage = "booking_in_progress"
                elif signal_type in {"search", "repeated_search"} and profile.travel_timeline_stage in {
                    "no_planned_trip",
                    "destination_wishlisted",
                }:
                    new_stage = (
                        "comparing_options"
                        if effective_signal_type == "repeated_search"
                        else "searching_for_trip"
                    )
                elif signal_type in {"wishlist", "saved_destination", "explicit_favorite"} and profile.travel_timeline_stage == "no_planned_trip":
                    new_stage = "destination_wishlisted"

                if new_stage:
                    profile.travel_timeline_stage = new_stage
                    if await cls._upsert_behavioral_dimension(
                        db,
                        user_id=user_id,
                        dimension_key="travel_timeline",
                        value={
                            "stage": new_stage,
                            "active_destination": norm_dest,
                        },
                        confidence=90.0 if new_stage == "booked" else 65.0,
                        source="transactional" if new_stage == "booked" else "behavioral",
                        now=now,
                    ):
                        updated_dims.append("travel_timeline")

            # 10. Incremental time_preference histogram update (never overrides explicit window)
            if profile.personalization_enabled and signal_type not in {
                "dismissal",
                "ignored",
                "notification_ignore",
                "opt_out",
            }:
                pref_tz_res = await db.execute(
                    select(NotificationUserPreference.timezone).where(
                        NotificationUserPreference.user_id == user_id
                    )
                )
                tz_name = pref_tz_res.scalar_one_or_none() or "Asia/Dhaka"
                try:
                    local_dt = now.astimezone(ZoneInfo(tz_name))
                except Exception:
                    tz_name = "Asia/Dhaka"
                    local_dt = now.astimezone(ZoneInfo(tz_name))
                hour_key = str(local_dt.hour)

                tp_res = await db.execute(
                    select(UserProfileDimension).where(
                        and_(
                            UserProfileDimension.user_id == user_id,
                            UserProfileDimension.dimension_key == "time_preference",
                        )
                    )
                )
                tp_dim = tp_res.scalar_one_or_none()
                if tp_dim is None or not (tp_dim.is_user_provided or tp_dim.source == "user_preference"):
                    tp_val = (
                        dict(tp_dim.value_json)
                        if (tp_dim and isinstance(tp_dim.value_json, dict))
                        else {"timezone": tz_name, "histogram": {}}
                    )
                    hist = dict(tp_val.get("histogram", {}))
                    hist[hour_key] = round(float(hist.get(hour_key, 0.0)) + 1.0, 2)
                    ranked = sorted(
                        ((int(h), float(c)) for h, c in hist.items()),
                        key=lambda item: item[1],
                        reverse=True,
                    )
                    peak_hours = [h for h, _ in ranked[:3]]
                    top_h = peak_hours[0] if peak_hours else local_dt.hour
                    inferred_win = (
                        "morning"
                        if 6 <= top_h <= 11
                        else ("afternoon" if 12 <= top_h <= 16 else ("evening" if 17 <= top_h <= 20 else "late_evening"))
                    )
                    tp_val.update(
                        {
                            "timezone": tz_name,
                            "histogram": hist,
                            "peak_hours": peak_hours,
                            "preferred_window": inferred_win,
                        }
                    )
                    obs_count = int(sum(hist.values()))
                    if await cls._upsert_behavioral_dimension(
                        db,
                        user_id=user_id,
                        dimension_key="time_preference",
                        value=tp_val,
                        confidence=min(85.0, 30.0 + obs_count * 7.0),
                        source="behavioral",
                        now=now,
                    ):
                        updated_dims.append("time_preference")
                else:
                    # User set explicit time preference; keep observed histogram in metadata only
                    meta_copy = dict(tp_dim.metadata_json or {})
                    obs_hist = dict(meta_copy.get("observed_histogram", {}))
                    obs_hist[hour_key] = round(float(obs_hist.get(hour_key, 0.0)) + 1.0, 2)
                    meta_copy["observed_histogram"] = obs_hist
                    tp_dim.metadata_json = meta_copy

            # 11. Incremental travel_style inference (safe non-religious tags only)
            style_candidate = clean_filters.get("travel_style") or clean_meta.get("travel_style")
            if profile.personalization_enabled and style_candidate and not anti_feedback_loop:
                styles_list = (
                    [str(s).strip().lower() for s in style_candidate]
                    if isinstance(style_candidate, list)
                    else [str(style_candidate).strip().lower()]
                )
                if await cls._upsert_behavioral_dimension(
                    db,
                    user_id=user_id,
                    dimension_key="travel_style",
                    value={"styles": styles_list},
                    confidence=65.0 if signal_type in {"booking", "hotel_booking"} else 45.0,
                    source="transactional" if signal_type in {"booking", "hotel_booking"} else "behavioral",
                    now=now,
                ):
                    updated_dims.append("travel_style")

            # 12. Refresh overall_confidence estimate incrementally
            dim_confs_res = await db.execute(
                select(UserProfileDimension.dimension_key, UserProfileDimension.confidence).where(
                    and_(
                        UserProfileDimension.user_id == user_id,
                        UserProfileDimension.dimension_key.notin_(
                            [
                                "personalization_confidence",
                                "consent_communication_preferences",
                                "notification_tolerance",
                            ]
                        ),
                        UserProfileDimension.confidence > 0.0,
                    )
                )
            )
            dim_rows = dim_confs_res.all()
            if dim_rows:
                avg_conf = sum(float(r[1]) for r in dim_rows) / len(dim_rows)
                coverage_ratio = min(1.0, len(dim_rows) / 7.0)
                profile.overall_confidence = round(min(100.0, avg_conf * (0.35 + 0.65 * coverage_ratio)), 2)

            if updated_dims:
                profile.profile_version += 1

        await db.flush()
        return SignalIngestionResult(
            signal_id=sig_row.id,
            recorded=True,
            profile_version=profile.profile_version,
            updated_dimensions=sorted(set(updated_dims)),
            anti_feedback_loop_applied=anti_feedback_loop,
            sanitized_violations=violations,
            message="Behavioral signal ingested and profile incrementally updated.",
        )
