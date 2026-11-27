"""
Adaptive Send-Time Optimization Engine (`AdaptiveTimingEngine`).

Scores candidate delivery windows per user using:
1. Authoritative explicit time preferences (overrides behavioral guessing).
2. User local timezone (`Asia/Dhaka` default or user-configured IANA timezone).
3. Behavioral engagement-hour histogram (gated by `min_confidence`).
4. Category timing priors, quiet hours, trip deadlines, and event urgency.

Critical transactional, security, SOS, payment, refund, and verified disruption
alerts ALWAYS bypass delay and dispatch immediately.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
import logging
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.notifications.rules.engine import (
    compute_quiet_hours_end_utc,
    is_critical_event,
    is_within_quiet_hours,
    resolve_timezone,
)

logger = logging.getLogger(__name__)

SEND_WINDOW_HOUR_RANGES: Dict[str, Tuple[int, int]] = {
    "morning": (8, 11),
    "afternoon": (12, 16),
    "evening": (17, 20),
    "late_evening": (20, 21),
}

CATEGORY_PRIOR_HOURS: Dict[str, Tuple[int, ...]] = {
    "price_alerts": (9, 10, 13, 19, 20),
    "marketing": (10, 11, 18, 19, 20),
    "digest": (9, 10, 19),
    "booking": (8, 9, 10, 14, 18),
    "community": (12, 18, 19, 20),
    "flight_alerts": (8, 9, 12, 16, 20),
}


class AdaptiveTimingConfig(BaseModel):
    """Admin-configurable parameters for send-time optimization."""
    model_config = ConfigDict(extra="ignore")

    adaptive_timing_enabled: bool = True
    min_confidence: float = Field(35.0, ge=0.0, le=100.0)
    eligible_categories: List[str] = Field(
        default_factory=lambda: [
            "marketing",
            "price_alerts",
            "community",
            "digest",
            "discovery",
            "reactivation",
        ]
    )
    allowed_windows: List[Dict[str, int]] = Field(
        default_factory=lambda: [{"start_hour": 8, "end_hour": 21}]
    )
    max_delay_hours: int = Field(18, ge=1, le=72)
    fallback_hour: int = Field(10, ge=0, le=23)
    emergency_override_policy: str = "immediate_bypass"

    @field_validator("allowed_windows", mode="before")
    @classmethod
    def normalize_allowed_windows(cls, v: Any) -> List[Dict[str, int]]:
        if not v:
            return [{"start_hour": 8, "end_hour": 21}]
        normalized: List[Dict[str, int]] = []
        for item in v:
            if isinstance(item, str):
                key = item.strip().lower()
                if key in SEND_WINDOW_HOUR_RANGES:
                    s_h, e_h = SEND_WINDOW_HOUR_RANGES[key]
                    normalized.append({"start_hour": s_h, "end_hour": e_h})
            elif isinstance(item, dict):
                normalized.append({
                    "start_hour": int(item.get("start_hour", 8)) % 24,
                    "end_hour": int(item.get("end_hour", 21)) % 24,
                })
        return normalized or [{"start_hour": 8, "end_hour": 21}]


class TimingDecision(BaseModel):
    """Result of send-time optimization with window scores and audit reason."""
    model_config = ConfigDict(extra="ignore")

    dispatch_immediately: bool = True
    recommended_send_at: datetime
    local_send_hour: int
    user_timezone: str = "Asia/Dhaka"
    delay_hours: float = 0.0
    reason: str = "immediate"
    used_explicit_override: bool = False
    window_scores: Dict[int, float] = Field(default_factory=dict)


class AdaptiveTimingEngine:
    """
    Scores available local-time delivery slots and chooses the optimal send time.
    """

    def __init__(self, config: Optional[AdaptiveTimingConfig] = None) -> None:
        self.config = config or AdaptiveTimingConfig()

    @classmethod
    def from_rule_config(cls, timing_config_json: Optional[Dict[str, Any]]) -> "AdaptiveTimingEngine":
        if not timing_config_json:
            return cls()
        return cls(config=AdaptiveTimingConfig(**timing_config_json))

    def _is_hour_in_allowed_windows(self, hour: int) -> bool:
        if not self.config.allowed_windows:
            return 8 <= hour <= 21
        for win in self.config.allowed_windows:
            start_h = int(win.get("start_hour", 8))
            end_h = int(win.get("end_hour", 21))
            if start_h <= end_h:
                if start_h <= hour <= end_h:
                    return True
            else:
                if hour >= start_h or hour <= end_h:
                    return True
        return False

    @staticmethod
    def _extract_explicit_hours(explicit_pref: Optional[Dict[str, Any]]) -> List[int]:
        if not explicit_pref or not isinstance(explicit_pref, dict):
            return []
        hours: List[int] = []
        if explicit_pref.get("preferred_hour") is not None:
            try:
                hours.append(int(explicit_pref["preferred_hour"]) % 24)
            except (TypeError, ValueError):
                pass
        raw_hours = explicit_pref.get("preferred_hours")
        if isinstance(raw_hours, list):
            for h in raw_hours:
                try:
                    hours.append(int(h) % 24)
                except (TypeError, ValueError):
                    pass
        window_name = str(explicit_pref.get("preferred_send_window") or explicit_pref.get("preferred_window") or "").lower()
        if window_name in SEND_WINDOW_HOUR_RANGES:
            s_h, e_h = SEND_WINDOW_HOUR_RANGES[window_name]
            for h in range(s_h, e_h + 1):
                if h not in hours:
                    hours.append(h)
        return hours

    @staticmethod
    def _normalize_histogram(histogram: Optional[Dict[Any, Any]]) -> Dict[int, float]:
        if not histogram or not isinstance(histogram, dict):
            return {}
        parsed: Dict[int, float] = {}
        for k, v in histogram.items():
            try:
                h = int(k) % 24
                val = max(0.0, float(v))
                parsed[h] = parsed.get(h, 0.0) + val
            except (TypeError, ValueError):
                continue
        max_val = max(parsed.values(), default=0.0)
        if max_val <= 0:
            return {}
        return {h: (val / max_val) * 100.0 for h, val in parsed.items()}

    def select_optimal_send_time(
        self,
        *,
        category: str,
        event_type: str = "",
        priority: int = 5,
        is_critical: Optional[bool] = None,
        user_timezone: str = "Asia/Dhaka",
        explicit_time_preference: Optional[Dict[str, Any]] = None,
        engagement_histogram: Optional[Dict[Any, Any]] = None,
        quiet_hours_enabled: bool = False,
        quiet_hours_start: str = "22:00",
        quiet_hours_end: str = "07:00",
        trip_deadline_at: Optional[datetime] = None,
        confidence_score: float = 0.0,
        payload: Optional[Dict[str, Any]] = None,
        now_utc: Optional[datetime] = None,
    ) -> TimingDecision:
        """
        Compute optimal UTC send timestamp and per-hour window scores.
        """
        now = now_utc or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

        tz_name = user_timezone or "Asia/Dhaka"
        tz = resolve_timezone(tz_name)
        local_now = now.astimezone(tz)

        critical_flag = (
            bool(is_critical)
            if is_critical is not None
            else is_critical_event(event_type, priority, payload)
        )

        # 1. Critical / emergency alerts bypass all timing delays
        if critical_flag or priority >= 9:
            return TimingDecision(
                dispatch_immediately=True,
                recommended_send_at=now,
                local_send_hour=local_now.hour,
                user_timezone=tz_name,
                delay_hours=0.0,
                reason="critical_bypass",
                used_explicit_override=False,
            )

        # 2. Imminent trip deadline (< 6 hours) dispatches promptly (unless quiet hours & priority < 7)
        if trip_deadline_at is not None:
            dl = trip_deadline_at if trip_deadline_at.tzinfo else trip_deadline_at.replace(tzinfo=timezone.utc)
            hours_to_deadline = (dl - now).total_seconds() / 3600.0
            if 0 < hours_to_deadline <= 6.0:
                in_quiet = quiet_hours_enabled and is_within_quiet_hours(
                    local_now.time(), quiet_hours_start, quiet_hours_end
                )
                if not in_quiet or hours_to_deadline <= 2.0 or priority >= 7:
                    return TimingDecision(
                        dispatch_immediately=True,
                        recommended_send_at=now,
                        local_send_hour=local_now.hour,
                        user_timezone=tz_name,
                        delay_hours=0.0,
                        reason="trip_deadline_urgent",
                    )

        cat = (category or "system").lower()
        in_quiet_now = quiet_hours_enabled and is_within_quiet_hours(
            local_now.time(), quiet_hours_start, quiet_hours_end
        )

        # 3. Adaptive timing disabled or category not eligible for deferral
        if (not self.config.adaptive_timing_enabled) or (cat not in self.config.eligible_categories):
            if in_quiet_now:
                q_end_utc = compute_quiet_hours_end_utc(now, tz_name, quiet_hours_start, quiet_hours_end)
                q_end_local = q_end_utc.astimezone(tz)
                return TimingDecision(
                    dispatch_immediately=False,
                    recommended_send_at=q_end_utc,
                    local_send_hour=q_end_local.hour,
                    user_timezone=tz_name,
                    delay_hours=round((q_end_utc - now).total_seconds() / 3600.0, 2),
                    reason="quiet_hours_deferred",
                )
            return TimingDecision(
                dispatch_immediately=True,
                recommended_send_at=now,
                local_send_hour=local_now.hour,
                user_timezone=tz_name,
                delay_hours=0.0,
                reason="adaptive_timing_disabled" if not self.config.adaptive_timing_enabled else "category_immediate",
            )

        # 4. Build candidate hours within [0, max_delay_hours] respecting quiet hours, allowed windows, and deadlines
        explicit_hours = self._extract_explicit_hours(explicit_time_preference)
        norm_hist = self._normalize_histogram(engagement_histogram)
        use_histogram = confidence_score >= self.config.min_confidence and bool(norm_hist)
        cat_priors = CATEGORY_PRIOR_HOURS.get(cat, (10, 18, 19))

        candidates: List[Tuple[int, datetime, float]] = []
        max_h = max(1, int(self.config.max_delay_hours))

        for offset_h in range(0, max_h + 1):
            if offset_h == 0:
                cand_local = local_now
            else:
                cand_local = (local_now + timedelta(hours=offset_h)).replace(
                    minute=0, second=0, microsecond=0
                )
            cand_utc = cand_local.astimezone(timezone.utc)

            if trip_deadline_at is not None:
                dl = trip_deadline_at if trip_deadline_at.tzinfo else trip_deadline_at.replace(tzinfo=timezone.utc)
                if cand_utc > dl - timedelta(hours=1):
                    continue

            if quiet_hours_enabled and is_within_quiet_hours(
                cand_local.time(), quiet_hours_start, quiet_hours_end
            ):
                continue

            if not self._is_hour_in_allowed_windows(cand_local.hour):
                continue

            h = cand_local.hour
            timeliness_bonus = max(0.0, 12.0 * (1.0 - (offset_h / max(max_h, 1))))
            prior_bonus = 20.0 if h in cat_priors else 5.0

            if explicit_hours:
                # Authoritative explicit time preference dominates scoring
                explicit_score = 100.0 if h in explicit_hours else 0.0
                score = explicit_score + timeliness_bonus * 0.5 + prior_bonus * 0.1
            elif use_histogram:
                hist_score = norm_hist.get(h, 0.0) * 0.65
                score = hist_score + prior_bonus + timeliness_bonus
            else:
                # Low-confidence mode: avoid overfitting noisy clicks; prefer fallback_hour or current daytime
                fallback_bonus = 45.0 if h == self.config.fallback_hour else 0.0
                score = fallback_bonus + prior_bonus + timeliness_bonus

            candidates.append((offset_h, cand_utc, round(score, 2)))

        if not candidates:
            # Fallback to end of quiet hours if currently in quiet hours, else immediate
            if in_quiet_now:
                q_end_utc = compute_quiet_hours_end_utc(now, tz_name, quiet_hours_start, quiet_hours_end)
                return TimingDecision(
                    dispatch_immediately=False,
                    recommended_send_at=q_end_utc,
                    local_send_hour=q_end_utc.astimezone(tz).hour,
                    user_timezone=tz_name,
                    delay_hours=round((q_end_utc - now).total_seconds() / 3600.0, 2),
                    reason="quiet_hours_deferred",
                )
            return TimingDecision(
                dispatch_immediately=True,
                recommended_send_at=now,
                local_send_hour=local_now.hour,
                user_timezone=tz_name,
                delay_hours=0.0,
                reason="no_better_window_immediate",
            )

        # Pick best candidate (ties broken by earliest offset_h)
        best_offset, best_utc, _ = max(candidates, key=lambda item: (item[2], -item[0]))
        window_scores: Dict[int, float] = {}
        for _, cu, sc in candidates:
            lh = cu.astimezone(tz).hour
            if lh not in window_scores or sc > window_scores[lh]:
                window_scores[lh] = sc

        dispatch_now = best_offset == 0 or (best_utc - now).total_seconds() <= 300
        if dispatch_now:
            best_utc = now

        if explicit_hours and best_utc.astimezone(tz).hour in explicit_hours:
            reason = "explicit_time_preference"
            used_explicit = True
        elif use_histogram:
            reason = "engagement_histogram_optimal"
            used_explicit = False
        elif in_quiet_now:
            reason = "quiet_hours_deferred"
            used_explicit = False
        else:
            reason = "fallback_window" if not dispatch_now else "immediate_allowed_window"
            used_explicit = False

        return TimingDecision(
            dispatch_immediately=dispatch_now,
            recommended_send_at=best_utc,
            local_send_hour=best_utc.astimezone(tz).hour,
            user_timezone=tz_name,
            delay_hours=round(max(0.0, (best_utc - now).total_seconds() / 3600.0), 2),
            reason=reason,
            used_explicit_override=used_explicit,
            window_scores=window_scores,
        )
