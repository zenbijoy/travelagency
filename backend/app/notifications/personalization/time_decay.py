"""
Configurable Time-Decayed Interest Mathematics & Intent Guardrails.

Implements exponential time-decay scoring:
    InterestScore(u, d) = sum(signal_weight * exp(-lambda * t_days) * confidence)

Provides:
- Configurable per-signal weights and confidence defaults
- Exact O(1) incremental decay update + full-history batch aggregation
- Normalized 0-100 interest score and separate 0-100 confidence score
- Guardrails ensuring a single accidental page view or single click never
  triggers strong intent or overrides explicit preferences.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import math
from typing import Any, Dict, FrozenSet, Iterable, Mapping, Optional, Sequence


DEFAULT_DECAY_LAMBDA: float = 0.08  # Half-life ~ 8.66 days
DEFAULT_SATURATION_SCALE: float = 12.0
STRONG_INTENT_THRESHOLD: float = 45.0

PASSIVE_WEAK_SIGNALS: FrozenSet[str] = frozenset(
    {
        "page_view",
        "destination_view",
        "hotel_view",
        "notification_open",
        "notification_click",
        "filter_used",
    }
)

HIGH_INTENT_SIGNALS: FrozenSet[str] = frozenset(
    {
        "explicit_favorite",
        "booking",
        "hotel_booking",
        "price_alert_subscribe",
        "booking_attempt",
        "wishlist",
        "saved_destination",
        "repeated_search",
    }
)

NEGATIVE_SIGNALS: FrozenSet[str] = frozenset(
    {
        "dismissal",
        "opt_out",
        "notification_ignore",
        "ignored",
        "cancellation",
        "explicit_remove",
    }
)

DEFAULT_SIGNAL_WEIGHTS: Dict[str, float] = {
    "explicit_favorite": 15.0,
    "booking": 12.0,
    "hotel_booking": 11.5,
    "price_alert_subscribe": 8.0,
    "saved_destination": 7.5,
    "wishlist": 7.0,
    "repeated_search": 6.0,
    "booking_attempt": 5.0,
    "notification_conversion": 8.5,
    "converted": 8.5,
    "notification_cta_completed": 3.5,
    "cta_completed": 3.5,
    "search": 3.0,
    "transport_selection": 2.5,
    "transport_selected": 2.5,
    "notification_click": 1.5,
    "filter_used": 1.2,
    "hotel_view": 1.2,
    "notification_open": 0.8,
    "destination_view": 0.8,
    "page_view": 0.6,
    "notification_ignore": -0.6,
    "ignored": -0.6,
    "cancellation": -2.5,
    "dismissal": -4.5,
    "explicit_remove": -10.0,
    "opt_out": -16.0,
}

DEFAULT_SIGNAL_CONFIDENCE: Dict[str, float] = {
    "explicit_favorite": 100.0,
    "opt_out": 100.0,
    "explicit_remove": 100.0,
    "booking": 98.0,
    "hotel_booking": 95.0,
    "notification_conversion": 92.0,
    "converted": 92.0,
    "price_alert_subscribe": 90.0,
    "wishlist": 85.0,
    "saved_destination": 85.0,
    "dismissal": 85.0,
    "booking_attempt": 80.0,
    "notification_cta_completed": 80.0,
    "cta_completed": 80.0,
    "repeated_search": 78.0,
    "cancellation": 75.0,
    "search": 65.0,
    "transport_selection": 65.0,
    "transport_selected": 65.0,
    "filter_used": 55.0,
    "notification_click": 55.0,
    "hotel_view": 45.0,
    "notification_ignore": 45.0,
    "ignored": 45.0,
    "notification_open": 40.0,
    "destination_view": 35.0,
    "page_view": 30.0,
}


@dataclass(frozen=True)
class TimeDecayConfig:
    """Configurable parameters for time-decayed interest mathematics."""

    decay_lambda: float = DEFAULT_DECAY_LAMBDA
    saturation_scale: float = DEFAULT_SATURATION_SCALE
    weights: Dict[str, float] = field(default_factory=lambda: dict(DEFAULT_SIGNAL_WEIGHTS))
    default_confidences: Dict[str, float] = field(
        default_factory=lambda: dict(DEFAULT_SIGNAL_CONFIDENCE)
    )
    single_weak_signal_max_score: float = 18.0
    single_weak_signal_max_confidence: float = 22.0
    explicit_favorite_floor_score: float = 78.0
    explicit_favorite_floor_confidence: float = 92.0
    max_signal_age_days: int = 180

    def get_weight(self, signal_type: str, override: Optional[float] = None) -> float:
        if override is not None:
            return float(override)
        return float(self.weights.get(signal_type, 1.0))

    def get_default_confidence(self, signal_type: str, override: Optional[float] = None) -> float:
        if override is not None:
            return max(0.0, min(100.0, float(override)))
        return float(self.default_confidences.get(signal_type, 50.0))


@dataclass(frozen=True)
class SignalObservation:
    """Lightweight representation of a behavioral or preference signal for scoring."""

    signal_type: str
    occurred_at: datetime
    weight: Optional[float] = None
    confidence: Optional[float] = None  # 0-100 or 0-1
    is_explicit: bool = False


@dataclass(frozen=True)
class DecayedInterestResult:
    """Output of interest aggregation: normalized score + separate confidence score."""

    raw_decayed_score: float
    normalized_score: float  # 0-100
    confidence_score: float  # 0-100 (kept strictly separate from relevance/interest)
    positive_signal_count: int
    negative_signal_count: int
    has_high_intent_signal: bool
    is_explicit_favorite: bool
    is_strong_intent: bool
    last_signal_at: Optional[datetime]


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def normalize_confidence_unit(
    confidence: float,
    *,
    confidence_is_percent: Optional[bool] = None,
) -> float:
    """
    Convert confidence into a [0.0, 1.0] multiplier for the decay formula.

    If `confidence_is_percent` is True, divides by 100.0.
    If False, treats as [0.0, 1.0].
    If None (auto), values > 1.0 are treated as 0-100 percentages.
    """
    val = float(confidence)
    if val <= 0.0:
        return 0.0
    if confidence_is_percent is True:
        return min(1.0, val / 100.0)
    if confidence_is_percent is False:
        return min(1.0, val)
    return min(1.0, val / 100.0) if val > 1.0 else val


def compute_signal_decay(
    *,
    signal_weight: float,
    decay_lambda: float = DEFAULT_DECAY_LAMBDA,
    t_days: float = 0.0,
    confidence: float = 1.0,
    confidence_is_percent: Optional[bool] = None,
) -> float:
    """
    Evaluate a single signal contribution:
        signal_weight * exp(-lambda * t_days) * confidence_unit
    """
    if decay_lambda < 0.0:
        raise ValueError("decay_lambda must be non-negative")
    elapsed_days = max(0.0, float(t_days))
    conf_unit = normalize_confidence_unit(confidence, confidence_is_percent=confidence_is_percent)
    return float(signal_weight) * math.exp(-decay_lambda * elapsed_days) * conf_unit


def normalize_decayed_score(
    raw_decayed_score: float,
    *,
    saturation_scale: float = DEFAULT_SATURATION_SCALE,
) -> float:
    """
    Map unbounded raw decayed score onto [0.0, 100.0] using a monotonic
    saturating curve. Negative or zero raw scores map to 0.0.
    """
    if raw_decayed_score <= 0.0:
        return 0.0
    scale = max(1.0, float(saturation_scale))
    score = 100.0 * (1.0 - math.exp(-float(raw_decayed_score) / scale))
    return round(max(0.0, min(100.0, score)), 2)


def advance_raw_score(
    previous_raw_score: float,
    previous_timestamp: Optional[datetime],
    new_timestamp: datetime,
    *,
    decay_lambda: float = DEFAULT_DECAY_LAMBDA,
) -> float:
    """
    O(1) time-decay progression from `previous_timestamp` to `new_timestamp`:
        S(t_new) = S(t_prev) * exp(-lambda * dt_days)
    Because exp(-lambda * (t1 + t2)) == exp(-lambda * t1) * exp(-lambda * t2),
    incremental decay is mathematically identical to full-history recomputation.
    """
    if previous_timestamp is None or previous_raw_score == 0.0:
        return float(previous_raw_score)
    t_prev = _ensure_utc(previous_timestamp)
    t_new = _ensure_utc(new_timestamp)
    dt_days = max(0.0, (t_new - t_prev).total_seconds() / 86400.0)
    return float(previous_raw_score) * math.exp(-max(0.0, decay_lambda) * dt_days)


def compute_incremental_interest(
    *,
    current_raw_score: float,
    last_signal_at: Optional[datetime],
    signal_type: str,
    occurred_at: datetime,
    signal_count: int = 0,
    search_count: int = 0,
    booking_count: int = 0,
    is_explicit_favorite: bool = False,
    signal_weight: Optional[float] = None,
    signal_confidence: Optional[float] = None,
    config: Optional[TimeDecayConfig] = None,
) -> DecayedInterestResult:
    """
    Perform an exact incremental interest update when a new signal arrives,
    avoiding full historical re-aggregation on every page view or click.
    """
    cfg = config or TimeDecayConfig()
    occ_utc = _ensure_utc(occurred_at)
    weight = cfg.get_weight(signal_type, override=signal_weight)
    conf_pct = cfg.get_default_confidence(signal_type, override=signal_confidence)

    if last_signal_at is None:
        new_raw = compute_signal_decay(
            signal_weight=weight,
            decay_lambda=cfg.decay_lambda,
            t_days=0.0,
            confidence=conf_pct,
            confidence_is_percent=True,
        )
        effective_last = occ_utc
    else:
        last_utc = _ensure_utc(last_signal_at)
        if occ_utc >= last_utc:
            decayed_prev = advance_raw_score(
                current_raw_score,
                last_utc,
                occ_utc,
                decay_lambda=cfg.decay_lambda,
            )
            contrib = compute_signal_decay(
                signal_weight=weight,
                decay_lambda=cfg.decay_lambda,
                t_days=0.0,
                confidence=conf_pct,
                confidence_is_percent=True,
            )
            new_raw = decayed_prev + contrib
            effective_last = occ_utc
        else:
            # Backdated event: decay relative to effective_last
            age_days = (last_utc - occ_utc).total_seconds() / 86400.0
            contrib = compute_signal_decay(
                signal_weight=weight,
                decay_lambda=cfg.decay_lambda,
                t_days=age_days,
                confidence=conf_pct,
                confidence_is_percent=True,
            )
            new_raw = float(current_raw_score) + contrib
            effective_last = last_utc

    is_negative = weight < 0.0 or signal_type in NEGATIVE_SIGNALS
    new_pos_count = signal_count + (0 if is_negative else 1)
    new_neg_count = 1 if is_negative else 0
    explicit_fav = is_explicit_favorite
    if signal_type == "explicit_favorite":
        explicit_fav = True
    elif signal_type in {"explicit_remove", "opt_out"}:
        explicit_fav = False

    has_high_intent = (
        explicit_fav
        or booking_count > 0
        or search_count >= 2
        or signal_type in HIGH_INTENT_SIGNALS
    )

    normalized = normalize_decayed_score(new_raw, saturation_scale=cfg.saturation_scale)

    # Guardrail: One accidental page view / single weak passive signal NEVER
    # triggers strong intent or overrides explicit preferences.
    if not has_high_intent and new_pos_count <= 1:
        normalized = min(normalized, cfg.single_weak_signal_max_score)
        conf_score = min(conf_pct * 0.65, cfg.single_weak_signal_max_confidence)
    else:
        sufficiency_bonus = min(25.0, max(0, new_pos_count - 1) * 5.0)
        conf_score = min(100.0, max(conf_pct * 0.75, 35.0) + sufficiency_bonus)

    if explicit_fav:
        normalized = max(normalized, cfg.explicit_favorite_floor_score)
        conf_score = max(conf_score, cfg.explicit_favorite_floor_confidence)

    if new_raw <= 0.0 and not explicit_fav:
        normalized = 0.0

    normalized = round(max(0.0, min(100.0, normalized)), 2)
    conf_score = round(max(0.0, min(100.0, conf_score)), 2)

    return DecayedInterestResult(
        raw_decayed_score=round(new_raw, 4),
        normalized_score=normalized,
        confidence_score=conf_score,
        positive_signal_count=new_pos_count,
        negative_signal_count=new_neg_count,
        has_high_intent_signal=has_high_intent,
        is_explicit_favorite=explicit_fav,
        is_strong_intent=(normalized >= STRONG_INTENT_THRESHOLD and conf_score >= 35.0),
        last_signal_at=effective_last,
    )


def aggregate_decayed_interest(
    observations: Sequence[SignalObservation],
    *,
    reference_time: Optional[datetime] = None,
    is_explicit_favorite: bool = False,
    config: Optional[TimeDecayConfig] = None,
    confidence_is_percent: Optional[bool] = None,
) -> DecayedInterestResult:
    """
    Compute full time-decayed interest score and separate confidence score
    from a sequence of behavioral/transactional/explicit observations.
    """
    cfg = config or TimeDecayConfig()
    now = _ensure_utc(reference_time or datetime.now(timezone.utc))

    if not observations and not is_explicit_favorite:
        return DecayedInterestResult(
            raw_decayed_score=0.0,
            normalized_score=0.0,
            confidence_score=0.0,
            positive_signal_count=0,
            negative_signal_count=0,
            has_high_intent_signal=False,
            is_explicit_favorite=False,
            is_strong_intent=False,
            last_signal_at=None,
        )

    raw_total = 0.0
    pos_count = 0
    neg_count = 0
    has_high_intent = is_explicit_favorite
    explicit_fav = is_explicit_favorite
    last_signal: Optional[datetime] = None
    last_positive: Optional[datetime] = None
    weighted_conf_sum = 0.0
    weight_sum = 0.0
    distinct_types = set()

    sorted_obs = sorted(observations, key=lambda o: _ensure_utc(o.occurred_at))
    for obs in sorted_obs:
        occ = _ensure_utc(obs.occurred_at)
        t_days = max(0.0, (now - occ).total_seconds() / 86400.0)
        if t_days > cfg.max_signal_age_days and not obs.is_explicit:
            continue

        weight = cfg.get_weight(obs.signal_type, override=obs.weight)
        raw_conf = (
            obs.confidence
            if obs.confidence is not None
            else cfg.get_default_confidence(obs.signal_type)
        )
        conf_unit = normalize_confidence_unit(raw_conf, confidence_is_percent=confidence_is_percent)
        conf_pct = conf_unit * 100.0

        contrib = compute_signal_decay(
            signal_weight=weight,
            decay_lambda=cfg.decay_lambda,
            t_days=t_days,
            confidence=conf_unit,
            confidence_is_percent=False,
        )
        raw_total += contrib

        if last_signal is None or occ > last_signal:
            last_signal = occ

        if obs.signal_type == "explicit_favorite":
            explicit_fav = True
            has_high_intent = True
        elif obs.signal_type in {"explicit_remove", "opt_out"}:
            explicit_fav = False

        if weight >= 0.0 and obs.signal_type not in NEGATIVE_SIGNALS:
            pos_count += 1
            distinct_types.add(obs.signal_type)
            if last_positive is None or occ > last_positive:
                last_positive = occ
            if obs.signal_type in HIGH_INTENT_SIGNALS or obs.is_explicit:
                has_high_intent = True
            recency_w = math.exp(-0.5 * cfg.decay_lambda * t_days) * max(0.25, abs(weight))
            weighted_conf_sum += conf_pct * recency_w
            weight_sum += recency_w
        else:
            neg_count += 1

    normalized = normalize_decayed_score(raw_total, saturation_scale=cfg.saturation_scale)

    # Separate confidence computation (data sufficiency, freshness, signal strength, conflict)
    if pos_count == 0 and not explicit_fav:
        confidence_score = 0.0
    else:
        avg_signal_conf = (weighted_conf_sum / weight_sum) if weight_sum > 0.0 else 0.0
        sufficiency_bonus = min(22.0, max(0, pos_count - 1) * 5.0 + max(0, len(distinct_types) - 1) * 3.0)
        days_since_pos = (
            max(0.0, (now - last_positive).total_seconds() / 86400.0)
            if last_positive is not None
            else 0.0
        )
        freshness_factor = math.exp(-0.35 * cfg.decay_lambda * days_since_pos)
        conflict_penalty = min(40.0, neg_count * 12.0)

        confidence_score = ((avg_signal_conf * 0.8 + sufficiency_bonus) * freshness_factor) - conflict_penalty

        # Guardrail: one accidental page view / single passive click NEVER triggers strong intent
        only_weak_passive = (
            not has_high_intent
            and not explicit_fav
            and distinct_types.issubset(PASSIVE_WEAK_SIGNALS)
        )
        if only_weak_passive and pos_count <= 1:
            normalized = min(normalized, cfg.single_weak_signal_max_score)
            confidence_score = min(confidence_score, cfg.single_weak_signal_max_confidence)
        elif only_weak_passive and pos_count <= 2:
            normalized = min(normalized, 28.0)
            confidence_score = min(confidence_score, 32.0)

    if explicit_fav:
        normalized = max(normalized, cfg.explicit_favorite_floor_score)
        confidence_score = max(confidence_score, cfg.explicit_favorite_floor_confidence)

    if raw_total <= 0.0 and not explicit_fav:
        normalized = 0.0

    normalized = round(max(0.0, min(100.0, normalized)), 2)
    confidence_score = round(max(0.0, min(100.0, confidence_score)), 2)

    return DecayedInterestResult(
        raw_decayed_score=round(raw_total, 4),
        normalized_score=normalized,
        confidence_score=confidence_score,
        positive_signal_count=pos_count,
        negative_signal_count=neg_count,
        has_high_intent_signal=has_high_intent,
        is_explicit_favorite=explicit_fav,
        is_strong_intent=(normalized >= STRONG_INTENT_THRESHOLD and confidence_score >= 35.0),
        last_signal_at=last_signal,
    )


def apply_config_dict(rule_config_data: Optional[Mapping[str, Any]]) -> TimeDecayConfig:
    """Build a TimeDecayConfig from a PersonalizationRuleConfig row or dictionary."""
    if not rule_config_data:
        return TimeDecayConfig()
    decay_lambda = float(rule_config_data.get("decay_lambda", DEFAULT_DECAY_LAMBDA))
    weights = dict(DEFAULT_SIGNAL_WEIGHTS)
    custom_weights = rule_config_data.get("signal_weights") or rule_config_data.get("weights")
    if isinstance(custom_weights, Mapping):
        for k, v in custom_weights.items():
            try:
                weights[str(k)] = float(v)
            except (TypeError, ValueError):
                continue
    return TimeDecayConfig(
        decay_lambda=max(0.001, decay_lambda),
        weights=weights,
    )
