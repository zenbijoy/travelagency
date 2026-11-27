"""
Per-User and Per-Category Notification Fatigue Engine.

Computes fatigue scores (0-100) from notifications received, opened, ignored,
dismissed, frequency, category engagement, opt-outs, and recent burst activity.

Invariants:
- Higher fatigue reduces low-priority frequency, increases cooldowns, prefers
  digest delivery, and suppresses repetitive promotional notifications.
- Lower fatigue NEVER increases spam above configured daily/weekly caps.
- Critical transactional, security, booking-change, payment, ticket, refund,
  SOS, and verified disruption alerts are NEVER suppressed by fatigue.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
from typing import Any, Dict, Iterable, List, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.notifications.rules.engine import (
    PROMOTIONAL_CATEGORIES,
    is_critical_event,
)

logger = logging.getLogger(__name__)


class FatigueConfig(BaseModel):
    """Configurable fatigue thresholds, frequency ceilings, and cooldown settings."""
    model_config = ConfigDict(extra="ignore")

    global_daily_marketing_cap: int = Field(3, ge=0, le=50)
    max_non_critical_per_day: int = Field(5, ge=1, le=50)
    max_promos_per_week: int = Field(14, ge=0, le=50)
    moderate_fatigue_threshold: float = Field(45.0, ge=10.0, le=95.0)
    high_fatigue_threshold: float = Field(65.0, ge=20.0, le=100.0)
    suppress_promo_threshold: float = Field(70.0, ge=25.0, le=100.0)
    prefer_digest_on_high_fatigue: bool = True
    cooldown_hours: int = Field(24, ge=1, le=168)
    base_cooldown_minutes: int = Field(60, ge=0, le=1440)
    high_fatigue_cooldown_minutes: int = Field(720, ge=30, le=10080)
    burst_threshold_24h: int = Field(3, ge=1, le=20)


class FatigueScoreBreakdown(BaseModel):
    """Transparent 0-100 fatigue score breakdown."""
    fatigue_score: float = Field(..., ge=0.0, le=100.0)
    volume_pressure: float = 0.0
    burst_pressure: float = 0.0
    negative_feedback_pressure: float = 0.0
    opt_out_penalty: float = 0.0
    engagement_relief: float = 0.0
    band: str = "low"  # low | moderate | high | critical


class FatigueDecision(BaseModel):
    """Outcome of fatigue evaluation for a candidate notification."""
    model_config = ConfigDict(extra="ignore")

    allow: bool
    should_suppress: bool = False
    prefer_digest: bool = False
    is_critical_bypass: bool = False
    effective_fatigue_score: float = Field(0.0, ge=0.0, le=100.0)
    user_fatigue_score: float = Field(0.0, ge=0.0, le=100.0)
    category_fatigue_score: float = Field(0.0, ge=0.0, le=100.0)
    effective_daily_cap: int = 3
    recommended_cooldown_minutes: int = 60
    retry_after: Optional[datetime] = None
    suppression_reason: Optional[str] = None
    reason: str = "within_fatigue_limits"

    @property
    def suppress(self) -> bool:
        return self.should_suppress


class FatigueEngine:
    """
    Evaluates and updates per-user and per-category notification fatigue.
    """

    def __init__(self, config: Optional[FatigueConfig] = None) -> None:
        self.config = config or FatigueConfig()

    @classmethod
    def from_rule_config(cls, fatigue_config_json: Optional[Dict[str, Any]]) -> "FatigueEngine":
        if not fatigue_config_json:
            return cls()
        return cls(config=FatigueConfig(**fatigue_config_json))

    @staticmethod
    def compute_fatigue_score(
        received_24h: int = 0,
        received_7d: int = 0,
        opened_7d: int = 0,
        clicked_7d: int = 0,
        dismissed_7d: int = 0,
        ignored_7d: int = 0,
        opt_out_count: int = 0,
        recent_burst_count: int = 0,
        category_engagement_rate: Optional[float] = None,
    ) -> FatigueScoreBreakdown:
        """
        Compute a deterministic 0-100 fatigue score.
        Higher dismissals, ignores, bursts, and opt-outs increase fatigue;
        genuine opens/clicks relieve volume pressure but never override opt-outs.
        """
        r24 = max(0, int(received_24h))
        r7 = max(0, int(received_7d))
        opened = max(0, int(opened_7d))
        clicked = max(0, int(clicked_7d))
        dismissed = max(0, int(dismissed_7d))
        ignored = max(0, int(ignored_7d))
        opt_outs = max(0, int(opt_out_count))
        burst = max(0, int(recent_burst_count))

        volume_pressure = min(20.0, r7 * 2.5)
        burst_pressure = min(25.0, r24 * 6.0 + burst * 4.5)

        ignore_ratio = ignored / max(r7, 1)
        negative_feedback_pressure = min(
            35.0,
            dismissed * 10.0 + ignored * 3.5 + ignore_ratio * 10.0,
        )
        opt_out_penalty = min(40.0, opt_outs * 30.0)

        if category_engagement_rate is not None:
            eng_rate = max(0.0, min(1.0, float(category_engagement_rate)))
        else:
            eng_rate = min(1.0, (opened + 1.5 * clicked) / max(r7, 1)) if r7 > 0 else 0.0

        # Relief cannot exceed volume+ignore pressure and does not wipe out opt-outs or dismissals.
        max_relievable = volume_pressure + min(10.0, negative_feedback_pressure * 0.35)
        engagement_relief = min(18.0, eng_rate * 18.0, max_relievable)

        raw = (
            volume_pressure
            + burst_pressure
            + negative_feedback_pressure
            + opt_out_penalty
            - engagement_relief
        )
        if opt_outs > 0:
            raw = max(raw, 75.0)
        score = round(max(0.0, min(100.0, raw)), 2)

        if score >= 80.0:
            band = "critical"
        elif score >= 65.0:
            band = "high"
        elif score >= 40.0:
            band = "moderate"
        else:
            band = "low"

        return FatigueScoreBreakdown(
            fatigue_score=score,
            volume_pressure=round(volume_pressure, 2),
            burst_pressure=round(burst_pressure, 2),
            negative_feedback_pressure=round(negative_feedback_pressure, 2),
            opt_out_penalty=round(opt_out_penalty, 2),
            engagement_relief=round(engagement_relief, 2),
            band=band,
        )

    @staticmethod
    def aggregate_user_fatigue_score(category_scores: Iterable[float]) -> float:
        """Aggregate per-category fatigue scores into a per-user overall fatigue score (0-100)."""
        scores = [max(0.0, min(100.0, float(s))) for s in category_scores]
        if not scores:
            return 0.0
        peak = max(scores)
        mean = sum(scores) / len(scores)
        return round(min(100.0, 0.6 * peak + 0.4 * mean), 2)

    def evaluate_fatigue(
        self,
        *,
        category: str,
        event_type: str = "",
        priority: int = 5,
        is_critical: Optional[bool] = None,
        user_fatigue_score: float = 0.0,
        category_fatigue_score: Optional[float] = None,
        received_24h: int = 0,
        received_7d: int = 0,
        opt_out_count: int = 0,
        cooldown_until: Optional[datetime] = None,
        last_sent_at: Optional[datetime] = None,
        user_marketing_cap_per_day: Optional[int] = None,
        payload: Optional[Dict[str, Any]] = None,
        now_utc: Optional[datetime] = None,
    ) -> FatigueDecision:
        """
        Evaluate whether a candidate notification should proceed, prefer digest,
        or be suppressed based on per-user + per-category fatigue and hard caps.
        """
        now = now_utc or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

        cat = (category or "system").lower()
        u_score = max(0.0, min(100.0, float(user_fatigue_score)))
        c_score = (
            max(0.0, min(100.0, float(category_fatigue_score)))
            if category_fatigue_score is not None
            else u_score
        )
        effective_score = round(max(c_score, 0.7 * c_score + 0.3 * u_score), 2)

        critical_flag = (
            bool(is_critical)
            if is_critical is not None
            else is_critical_event(event_type, priority, payload)
        )

        # Invariant 1: NEVER suppress critical transactional/security/booking-change/payment/ticket/refund/disruption/SOS
        if critical_flag or priority >= 9:
            return FatigueDecision(
                allow=True,
                should_suppress=False,
                prefer_digest=False,
                is_critical_bypass=True,
                effective_fatigue_score=effective_score,
                user_fatigue_score=u_score,
                category_fatigue_score=c_score,
                effective_daily_cap=self.config.max_non_critical_per_day,
                recommended_cooldown_minutes=0,
                reason="critical_alert_bypasses_fatigue",
            )

        is_promo = cat in PROMOTIONAL_CATEGORIES or priority <= 4
        # Invariant 2: Lower fatigue NEVER increases spam beyond global/user caps.
        base_cap = self.config.global_daily_marketing_cap if is_promo else self.config.max_non_critical_per_day
        if user_marketing_cap_per_day is not None and is_promo:
            base_cap = min(base_cap, max(0, int(user_marketing_cap_per_day)))

        effective_cap = base_cap
        recommended_cooldown = self.config.base_cooldown_minutes

        if effective_score >= self.config.suppress_promo_threshold:
            effective_cap = 0 if is_promo else min(base_cap, 1)
            recommended_cooldown = max(self.config.high_fatigue_cooldown_minutes, self.config.cooldown_hours * 60)
        elif effective_score >= self.config.high_fatigue_threshold:
            effective_cap = min(base_cap, 1)
            recommended_cooldown = self.config.high_fatigue_cooldown_minutes
        elif effective_score >= self.config.moderate_fatigue_threshold:
            effective_cap = min(base_cap, max(3, base_cap - 1))
            recommended_cooldown = max(self.config.base_cooldown_minutes * 3, 180)

        prefer_digest = bool(
            self.config.prefer_digest_on_high_fatigue
            and effective_score >= self.config.moderate_fatigue_threshold
            and is_promo
        )

        # Opt-out count on category immediately blocks promos
        if opt_out_count > 0 and is_promo:
            return FatigueDecision(
                allow=False,
                should_suppress=True,
                prefer_digest=False,
                effective_fatigue_score=max(effective_score, 75.0),
                user_fatigue_score=u_score,
                category_fatigue_score=c_score,
                effective_daily_cap=0,
                recommended_cooldown_minutes=recommended_cooldown,
                suppression_reason="category_fatigue_opt_out",
                reason="category_fatigue_opt_out",
            )

        # Check active cooldown window
        effective_cooldown_until = cooldown_until
        if effective_cooldown_until is not None and effective_cooldown_until.tzinfo is None:
            effective_cooldown_until = effective_cooldown_until.replace(tzinfo=timezone.utc)
        if effective_cooldown_until is None and last_sent_at is not None and is_promo and effective_score >= self.config.moderate_fatigue_threshold:
            ls = last_sent_at if last_sent_at.tzinfo else last_sent_at.replace(tzinfo=timezone.utc)
            effective_cooldown_until = ls + timedelta(minutes=recommended_cooldown)

        if effective_cooldown_until is not None and effective_cooldown_until > now and is_promo:
            return FatigueDecision(
                allow=False,
                should_suppress=True,
                prefer_digest=prefer_digest,
                effective_fatigue_score=effective_score,
                user_fatigue_score=u_score,
                category_fatigue_score=c_score,
                effective_daily_cap=effective_cap,
                recommended_cooldown_minutes=recommended_cooldown,
                retry_after=effective_cooldown_until,
                suppression_reason="fatigue_cooldown_active",
                reason="fatigue_cooldown_active",
            )

        # Suppress repetitive promos at high fatigue (unless explicitly high-priority digest itself)
        if effective_score >= self.config.suppress_promo_threshold and is_promo and cat != "digest":
            return FatigueDecision(
                allow=False,
                should_suppress=True,
                prefer_digest=True,
                effective_fatigue_score=effective_score,
                user_fatigue_score=u_score,
                category_fatigue_score=c_score,
                effective_daily_cap=effective_cap,
                recommended_cooldown_minutes=recommended_cooldown,
                suppression_reason="high_fatigue_promo_suppressed",
                reason="high_fatigue_promo_suppressed",
            )

        # Check daily & weekly caps
        if received_24h >= effective_cap:
            return FatigueDecision(
                allow=False,
                should_suppress=True,
                prefer_digest=prefer_digest,
                effective_fatigue_score=effective_score,
                user_fatigue_score=u_score,
                category_fatigue_score=c_score,
                effective_daily_cap=effective_cap,
                recommended_cooldown_minutes=recommended_cooldown,
                suppression_reason="daily_frequency_cap_reached",
                reason="daily_frequency_cap_reached",
            )

        if is_promo and received_7d >= self.config.max_promos_per_week:
            return FatigueDecision(
                allow=False,
                should_suppress=True,
                prefer_digest=True,
                effective_fatigue_score=effective_score,
                user_fatigue_score=u_score,
                category_fatigue_score=c_score,
                effective_daily_cap=effective_cap,
                recommended_cooldown_minutes=recommended_cooldown,
                suppression_reason="weekly_promo_cap_reached",
                reason="weekly_promo_cap_reached",
            )

        return FatigueDecision(
            allow=True,
            should_suppress=False,
            prefer_digest=prefer_digest,
            effective_fatigue_score=effective_score,
            user_fatigue_score=u_score,
            category_fatigue_score=c_score,
            effective_daily_cap=effective_cap,
            recommended_cooldown_minutes=recommended_cooldown,
            reason="prefer_digest_due_to_moderate_fatigue" if prefer_digest else "within_fatigue_limits",
        )

    # ------------------------------------------------------------------
    # Database Integration Helpers (Batched & Single-User)
    # ------------------------------------------------------------------

    async def get_users_fatigue_batch(
        self,
        db: AsyncSession,
        user_ids: List[uuid.UUID],
    ) -> Dict[uuid.UUID, Dict[str, Any]]:
        """
        Load all `UserNotificationFatigue` rows for a batch of users in a single query.
        Returns `{user_id: {category: row, ...}}`.
        """
        if not user_ids:
            return {}
        try:
            from app.models.personalization import UserNotificationFatigue
        except ImportError:
            return {}

        stmt = select(UserNotificationFatigue).where(UserNotificationFatigue.user_id.in_(user_ids))
        rows = (await db.scalars(stmt)).all()
        grouped: Dict[uuid.UUID, Dict[str, Any]] = {uid: {} for uid in user_ids}
        for row in rows:
            grouped.setdefault(row.user_id, {})[row.category] = row
        return grouped

    async def record_notification_sent(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        category: str,
        *,
        is_critical: bool = False,
        now_utc: Optional[datetime] = None,
    ) -> Optional[Any]:
        """Increment send counters and update fatigue score & cooldown after dispatch."""
        try:
            from app.models.personalization import UserNotificationFatigue
        except ImportError:
            return None

        now = now_utc or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        cat = (category or "system").lower()

        row = await db.scalar(
            select(UserNotificationFatigue).where(
                UserNotificationFatigue.user_id == user_id,
                UserNotificationFatigue.category == cat,
            )
        )
        if row is None:
            row = UserNotificationFatigue(
                user_id=user_id,
                category=cat,
                fatigue_score=0.0,
                received_24h=0,
                received_7d=0,
                opened_7d=0,
                clicked_7d=0,
                dismissed_7d=0,
                ignored_7d=0,
                opt_out_count=0,
            )
            db.add(row)

        # Reset 24h counter if last_sent_at was > 24h ago
        if row.last_sent_at is not None:
            ls = row.last_sent_at if row.last_sent_at.tzinfo else row.last_sent_at.replace(tzinfo=timezone.utc)
            if (now - ls) > timedelta(hours=24):
                row.received_24h = 0

        row.received_24h = int(row.received_24h or 0) + 1
        row.received_7d = int(row.received_7d or 0) + 1
        row.last_sent_at = now

        breakdown = self.compute_fatigue_score(
            received_24h=row.received_24h,
            received_7d=row.received_7d,
            opened_7d=row.opened_7d,
            clicked_7d=row.clicked_7d,
            dismissed_7d=row.dismissed_7d,
            ignored_7d=row.ignored_7d,
            opt_out_count=row.opt_out_count,
        )
        row.fatigue_score = breakdown.fatigue_score

        if not is_critical and cat in PROMOTIONAL_CATEGORIES:
            cooldown_mins = 0
            if row.fatigue_score >= self.config.high_fatigue_threshold:
                cooldown_mins = self.config.high_fatigue_cooldown_minutes
            elif row.fatigue_score >= self.config.moderate_fatigue_threshold or row.received_24h >= 2:
                cooldown_mins = self.config.base_cooldown_minutes
            if cooldown_mins > 0:
                row.cooldown_until = now + timedelta(minutes=cooldown_mins)

        await db.flush()
        return row

    async def record_engagement_event(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        category: str,
        interaction_type: str,
        *,
        now_utc: Optional[datetime] = None,
    ) -> Optional[Any]:
        """Update fatigue telemetry when a user opens, clicks, dismisses, ignores, or opts out."""
        try:
            from app.models.personalization import UserNotificationFatigue
        except ImportError:
            return None

        now = now_utc or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        cat = (category or "system").lower()

        row = await db.scalar(
            select(UserNotificationFatigue).where(
                UserNotificationFatigue.user_id == user_id,
                UserNotificationFatigue.category == cat,
            )
        )
        if row is None:
            row = UserNotificationFatigue(
                user_id=user_id,
                category=cat,
                fatigue_score=0.0,
                received_24h=0,
                received_7d=0,
                opened_7d=0,
                clicked_7d=0,
                dismissed_7d=0,
                ignored_7d=0,
                opt_out_count=0,
            )
            db.add(row)

        itype = (interaction_type or "").lower()
        if itype == "opened":
            row.opened_7d = int(row.opened_7d or 0) + 1
        elif itype in ("clicked", "cta_completed", "converted"):
            row.clicked_7d = int(row.clicked_7d or 0) + 1
        elif itype == "dismissed":
            row.dismissed_7d = int(row.dismissed_7d or 0) + 1
            row.cooldown_until = now + timedelta(hours=min(24, self.config.cooldown_hours))
        elif itype == "ignored":
            row.ignored_7d = int(row.ignored_7d or 0) + 1
        elif itype == "opt_out":
            row.opt_out_count = int(row.opt_out_count or 0) + 1
            row.cooldown_until = now + timedelta(days=7)

        breakdown = self.compute_fatigue_score(
            received_24h=row.received_24h,
            received_7d=row.received_7d,
            opened_7d=row.opened_7d,
            clicked_7d=row.clicked_7d,
            dismissed_7d=row.dismissed_7d,
            ignored_7d=row.ignored_7d,
            opt_out_count=row.opt_out_count,
        )
        row.fatigue_score = breakdown.fatigue_score
        await db.flush()
        return row
