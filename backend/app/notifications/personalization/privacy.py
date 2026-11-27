"""
Privacy, Server-Side Consent Verification, Sensitive Attribute Protection,
Data Retention Enforcement, and GDPR Controls for ShopnoJatra Personalization.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
import re
from typing import Any, Dict, List, Optional, Tuple
import uuid

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import NotificationUserPreference
from app.models.personalization import (
    ContextualTravelCondition,
    PersonalizationDecisionLog,
    PersonalizationExperimentAssignment,
    UserBehavioralSignal,
    UserDestinationInterest,
    UserNotificationFatigue,
    UserPersonalizationProfile,
    UserProfileChangeLog,
    UserProfileDimension,
)
from app.notifications.ai.factual_validator import FactualValidator
from app.notifications.personalization.dimensions import (
    FORBIDDEN_SENSITIVE_ATTRIBUTES,
    RELIGIOUS_TRAVEL_TAGS,
)

# Critical event types & categories that ALWAYS bypass marketing/personalization opt-out
CRITICAL_EVENT_PREFIXES: Tuple[str, ...] = ("security.",)
CRITICAL_EVENT_TYPES = frozenset(
    {
        "booking.confirmed",
        "booking.cancelled",
        "booking.payment_succeeded",
        "booking.payment_failed",
        "booking.ticket_issued",
        "flight.schedule_changed",
        "hotel.booking.confirmed",
        "travel.disruption.detected",
        "marketplace.trip.sos_triggered",
        "agency.kyc.approved",
        "agency.kyc.rejected",
        "agency.payout.processed",
    }
)
CRITICAL_CATEGORIES = frozenset(
    {"security", "booking_critical", "payment", "disruption", "sos", "otp", "transactional_critical"}
)

# Category -> column name on NotificationUserPreference
CATEGORY_PREF_MAP: Dict[str, str] = {
    "booking": "category_booking",
    "bookings": "category_booking",
    "trip": "category_booking",
    "trip_prep": "category_booking",
    "hotel": "category_booking",
    "transactional": "category_booking",
    "security": "category_security",
    "auth": "category_security",
    "defense": "category_security",
    "flight": "category_flight_alerts",
    "flight_alerts": "category_flight_alerts",
    "flight_alert": "category_flight_alerts",
    "disruption": "category_flight_alerts",
    "marketing": "category_marketing",
    "promo": "category_marketing",
    "promotion": "category_marketing",
    "discovery": "category_marketing",
    "reactivation": "category_marketing",
    "digest": "category_marketing",
    "abandoned_search": "category_marketing",
    "campaign": "category_marketing",
    "community": "category_community",
    "review": "category_community",
    "marketplace": "category_community",
    "price_alert": "category_price_alerts",
    "price_alerts": "category_price_alerts",
}

CHANNEL_PREF_MAP: Dict[str, str] = {
    "push": "push_enabled",
    "email": "email_enabled",
    "sms": "sms_enabled",
    "in_app": "in_app_enabled",
}

_COT_STRIP_PATTERNS: Tuple[re.Pattern[str], ...] = (
    re.compile(r"<\s*think\s*>.*?<\s*/\s*think\s*>", re.IGNORECASE | re.DOTALL),
    re.compile(
        r"\b(?:chain_of_thought|internal_reasoning|model_thought|system_instruction|raw_prompt)\s*:\s*.*",
        re.IGNORECASE,
    ),
)

_FINANCIAL_SENSITIVE_KEYS = frozenset(
    {
        "salary",
        "income",
        "monthly_income",
        "credit_score",
        "bank_balance",
        "debt",
        "loan_default",
        "net_worth",
        "tax_id",
        "tin",
        "tin_number",
    }
)


@dataclass
class ConsentCheckResult:
    """Result of server-side consent verification prior to dispatch."""

    allowed: bool
    personalization_allowed: bool
    location_allowed: bool
    allowed_channels: List[str] = field(default_factory=list)
    blocked_channels: Dict[str, str] = field(default_factory=dict)
    reason: Optional[str] = None
    is_critical_override: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class PrivacyAndConsentGuard:
    """
    Enforces server-side consent, sensitive attribute exclusion, safe explanation
    sanitization, retention purging, and GDPR export/reset/delete controls.
    """

    @staticmethod
    def is_critical_notification(
        event_type: str = "",
        category: str = "",
        priority: int = 5,
    ) -> bool:
        et = (event_type or "").strip().lower()
        cat = (category or "").strip().lower()
        if priority >= 9:
            return True
        if any(et.startswith(p) for p in CRITICAL_EVENT_PREFIXES):
            return True
        if et in CRITICAL_EVENT_TYPES:
            return True
        if cat in CRITICAL_CATEGORIES:
            return True
        return False

    @classmethod
    def evaluate_consent(
        cls,
        *,
        event_type: str = "",
        category: str = "system",
        priority: int = 5,
        requested_channels: Optional[List[str]] = None,
        notification_pref: Optional[Any] = None,
        personalization_profile: Optional[Any] = None,
        require_personalization_consent: bool = False,
    ) -> ConsentCheckResult:
        """
        Pure server-side consent verification given loaded preference/profile models or dicts.
        """
        channels = list(requested_channels or ["in_app", "push"])
        is_critical = cls.is_critical_notification(event_type=event_type, category=category, priority=priority)

        def _get(obj: Any, attr: str, default: Any) -> Any:
            if obj is None:
                return default
            if isinstance(obj, dict):
                return obj.get(attr, default)
            return getattr(obj, attr, default)

        pers_enabled = bool(_get(personalization_profile, "personalization_enabled", True))
        loc_consent = bool(_get(personalization_profile, "location_consent", False))

        if is_critical:
            # Critical security/transactional/SOS/disruption alerts NEVER suppressed by marketing opt-out
            allowed_ch = []
            blocked_ch: Dict[str, str] = {}
            for ch in channels:
                pref_col = CHANNEL_PREF_MAP.get(ch)
                # For P0 critical OTP/security/disruption, allow designated channel even if marketing/general push off,
                # unless explicit non-critical; actually keep in_app/sms/email/push active for critical safety.
                if pref_col and notification_pref is not None and priority < 10 and category == "booking":
                    if not bool(_get(notification_pref, pref_col, True)):
                        blocked_ch[ch] = "channel_disabled"
                        continue
                allowed_ch.append(ch)
            if not allowed_ch:
                allowed_ch = ["in_app"]
            return ConsentCheckResult(
                allowed=True,
                personalization_allowed=pers_enabled,
                location_allowed=loc_consent,
                allowed_channels=allowed_ch,
                blocked_channels=blocked_ch,
                reason=None,
                is_critical_override=True,
            )

        # Check personalization opt-out if caller requires personalization consent (e.g., pure personalized automation)
        if require_personalization_consent and not pers_enabled:
            return ConsentCheckResult(
                allowed=False,
                personalization_allowed=False,
                location_allowed=False,
                allowed_channels=[],
                blocked_channels={ch: "personalization_disabled" for ch in channels},
                reason="personalization_opted_out",
                is_critical_override=False,
            )

        # Check category opt-in
        cat_norm = (category or "system").strip().lower()
        cat_col = CATEGORY_PREF_MAP.get(cat_norm)
        if cat_col and notification_pref is not None:
            if not bool(_get(notification_pref, cat_col, True)):
                return ConsentCheckResult(
                    allowed=False,
                    personalization_allowed=pers_enabled,
                    location_allowed=loc_consent,
                    allowed_channels=[],
                    blocked_channels={ch: f"category_opt_out:{cat_norm}" for ch in channels},
                    reason=f"category_opt_out:{cat_norm}",
                    is_critical_override=False,
                )

        # Check channel opt-ins
        allowed_channels: List[str] = []
        blocked_channels: Dict[str, str] = {}
        for ch in channels:
            ch_norm = str(ch).strip().lower()
            pref_col = CHANNEL_PREF_MAP.get(ch_norm)
            if pref_col and notification_pref is not None:
                if not bool(_get(notification_pref, pref_col, True)):
                    blocked_channels[ch_norm] = f"channel_opt_out:{ch_norm}"
                    continue
            allowed_channels.append(ch_norm)

        if not allowed_channels:
            return ConsentCheckResult(
                allowed=False,
                personalization_allowed=pers_enabled,
                location_allowed=loc_consent,
                allowed_channels=[],
                blocked_channels=blocked_channels,
                reason="all_requested_channels_opted_out",
                is_critical_override=False,
            )

        return ConsentCheckResult(
            allowed=True,
            personalization_allowed=pers_enabled,
            location_allowed=loc_consent,
            allowed_channels=allowed_channels,
            blocked_channels=blocked_channels,
            reason=None,
            is_critical_override=False,
        )

    @classmethod
    async def check_server_side_consent(
        cls,
        db: AsyncSession,
        user_id: uuid.UUID,
        *,
        event_type: str = "",
        category: str = "system",
        priority: int = 5,
        requested_channels: Optional[List[str]] = None,
        require_personalization_consent: bool = False,
    ) -> ConsentCheckResult:
        """
        Loads server-side `NotificationUserPreference` & `UserPersonalizationProfile`
        and enforces consent before any notification dispatch.
        """
        pref_res = await db.execute(
            select(NotificationUserPreference).where(NotificationUserPreference.user_id == user_id)
        )
        notif_pref = pref_res.scalar_one_or_none()

        prof_res = await db.execute(
            select(UserPersonalizationProfile).where(UserPersonalizationProfile.user_id == user_id)
        )
        pers_prof = prof_res.scalar_one_or_none()

        return cls.evaluate_consent(
            event_type=event_type,
            category=category,
            priority=priority,
            requested_channels=requested_channels,
            notification_pref=notif_pref,
            personalization_profile=pers_prof,
            require_personalization_consent=require_personalization_consent,
        )

    @staticmethod
    def is_sensitive_attribute(
        key: str,
        value: Any = None,
        *,
        is_user_provided: bool = False,
    ) -> Tuple[bool, Optional[str]]:
        """
        Returns `(is_blocked, reason)`.
        Prohibits storing or inferring religion (unless explicit `religious_travel` style
        selected by user for travel packages), health, political affiliation, ethnicity,
        or sensitive financial/identity attributes.
        """
        key_norm = str(key).strip().lower().replace("-", "_").replace(" ", "_")

        if key_norm in FORBIDDEN_SENSITIVE_ATTRIBUTES or key_norm in _FINANCIAL_SENSITIVE_KEYS:
            return True, f"forbidden_sensitive_key:{key_norm}"

        if isinstance(value, str):
            val_norm = value.strip().lower().replace("-", "_").replace(" ", "_")
            if val_norm in FORBIDDEN_SENSITIVE_ATTRIBUTES or val_norm in _FINANCIAL_SENSITIVE_KEYS:
                return True, f"forbidden_sensitive_value:{val_norm}"
            if val_norm in RELIGIOUS_TRAVEL_TAGS:
                if key_norm in ("travel_style", "travel_styles", "style", "styles") and is_user_provided:
                    return False, None
                return True, "religious_attribute_cannot_be_inferred_or_profiled"

        return False, None

    @classmethod
    def sanitize_personalization_payload(
        cls,
        payload: Dict[str, Any],
        *,
        is_user_provided: bool = False,
    ) -> Tuple[Dict[str, Any], List[str]]:
        """
        Recursively removes forbidden sensitive demographic, health, political,
        financial, or raw PII fields from a personalization dictionary.
        """
        cleaned: Dict[str, Any] = {}
        violations: List[str] = []

        for k, v in (payload or {}).items():
            key_str = str(k)
            blocked, reason = cls.is_sensitive_attribute(
                key_str, None if isinstance(v, (dict, list)) else v, is_user_provided=is_user_provided
            )
            if blocked:
                violations.append(reason or f"blocked:{key_str}")
                continue

            if isinstance(v, dict):
                sub_clean, sub_v = cls.sanitize_personalization_payload(v, is_user_provided=is_user_provided)
                violations.extend(sub_v)
                if sub_clean:
                    cleaned[key_str] = sub_clean
            elif isinstance(v, list):
                kept: List[Any] = []
                for item in v:
                    if isinstance(item, dict):
                        sub_clean, sub_v = cls.sanitize_personalization_payload(item, is_user_provided=is_user_provided)
                        violations.extend(sub_v)
                        if sub_clean:
                            kept.append(sub_clean)
                    else:
                        item_blocked, item_reason = cls.is_sensitive_attribute(
                            key_str, item, is_user_provided=is_user_provided
                        )
                        if item_blocked:
                            violations.append(item_reason or f"blocked_item:{item}")
                            continue
                        if isinstance(item, str) and FactualValidator.detect_pii(item):
                            violations.append(f"pii_stripped_from_list:{key_str}")
                            continue
                        kept.append(item)
                cleaned[key_str] = kept
            elif isinstance(v, str):
                if FactualValidator.detect_pii(v):
                    violations.append(f"pii_stripped:{key_str}")
                    continue
                cleaned[key_str] = v
            else:
                cleaned[key_str] = v

        return cleaned, violations

    @classmethod
    def sanitize_explanation_factors(cls, factors: Any) -> List[str]:
        """
        Strips internal AI chain-of-thought, system prompts, PII, and sensitive attributes
        from `explanation_factors` before persistence or returning to user/admin.
        """
        raw_items: List[str] = []
        if isinstance(factors, str):
            raw_items = [factors]
        elif isinstance(factors, list):
            for item in factors:
                if isinstance(item, str):
                    raw_items.append(item)
                elif isinstance(item, dict):
                    label = item.get("factor") or item.get("label") or item.get("reason")
                    if label:
                        raw_items.append(str(label))
        elif isinstance(factors, dict):
            for k, v in factors.items():
                if str(k).lower() in ("chain_of_thought", "reasoning", "raw_prompt", "system_prompt"):
                    continue
                raw_items.append(f"{k}: {v}")

        safe_factors: List[str] = []
        for item in raw_items:
            text = str(item).strip()
            if not text:
                continue
            for pat in _COT_STRIP_PATTERNS:
                text = pat.sub("", text).strip()
            if not text:
                continue
            # Drop any explanation string containing leaked PII or sensitive attributes
            if FactualValidator.detect_pii(text):
                continue
            if any(bad in text.lower() for bad in ("<think>", "chain_of_thought", "system_instruction")):
                continue
            safe_factors.append(text[:240])

        return safe_factors

    @staticmethod
    async def purge_expired_signals_and_logs(
        db: AsyncSession,
        *,
        signal_retention_days: int = 180,
        decision_log_retention_days: int = 365,
        change_log_retention_days: int = 365,
        now: Optional[datetime] = None,
    ) -> Dict[str, int]:
        """
        Enforces data retention policies by purging expired behavioral signals,
        expired profile dimensions, expired contextual conditions, and aged audit logs.
        """
        ref = now or datetime.now(timezone.utc)
        if ref.tzinfo is None:
            ref = ref.replace(tzinfo=timezone.utc)

        signal_cutoff = ref - timedelta(days=signal_retention_days)
        decision_cutoff = ref - timedelta(days=decision_log_retention_days)
        change_cutoff = ref - timedelta(days=change_log_retention_days)

        sig_res = await db.execute(
            delete(UserBehavioralSignal).where(
                or_(
                    UserBehavioralSignal.expires_at < ref,
                    UserBehavioralSignal.occurred_at < signal_cutoff,
                )
            )
        )
        dim_res = await db.execute(
            delete(UserProfileDimension).where(
                UserProfileDimension.expires_at.is_not(None),
                UserProfileDimension.expires_at < ref,
            )
        )
        ctx_res = await db.execute(
            delete(ContextualTravelCondition).where(ContextualTravelCondition.valid_until < ref)
        )
        dec_res = await db.execute(
            delete(PersonalizationDecisionLog).where(PersonalizationDecisionLog.created_at < decision_cutoff)
        )
        chg_res = await db.execute(
            delete(UserProfileChangeLog).where(UserProfileChangeLog.created_at < change_cutoff)
        )

        await db.flush()

        counts = {
            "signals_purged": int(sig_res.rowcount or 0),
            "dimensions_purged": int(dim_res.rowcount or 0),
            "contextual_conditions_purged": int(ctx_res.rowcount or 0),
            "decision_logs_purged": int(dec_res.rowcount or 0),
            "change_logs_purged": int(chg_res.rowcount or 0),
        }
        counts["total_purged"] = sum(counts.values())
        return counts

    @classmethod
    async def export_user_personalization_data(
        cls,
        db: AsyncSession,
        user_id: uuid.UUID,
    ) -> Dict[str, Any]:
        """GDPR-compliant full export of user's personalization & consent records."""
        prof = (
            await db.execute(
                select(UserPersonalizationProfile).where(UserPersonalizationProfile.user_id == user_id)
            )
        ).scalar_one_or_none()
        notif_pref = (
            await db.execute(
                select(NotificationUserPreference).where(NotificationUserPreference.user_id == user_id)
            )
        ).scalar_one_or_none()
        dims = (
            await db.execute(
                select(UserProfileDimension).where(UserProfileDimension.user_id == user_id)
            )
        ).scalars().all()
        interests = (
            await db.execute(
                select(UserDestinationInterest).where(UserDestinationInterest.user_id == user_id)
            )
        ).scalars().all()
        signals = (
            await db.execute(
                select(UserBehavioralSignal)
                .where(UserBehavioralSignal.user_id == user_id)
                .order_by(UserBehavioralSignal.occurred_at.desc())
                .limit(200)
            )
        ).scalars().all()
        fatigue_rows = (
            await db.execute(
                select(UserNotificationFatigue).where(UserNotificationFatigue.user_id == user_id)
            )
        ).scalars().all()
        change_logs = (
            await db.execute(
                select(UserProfileChangeLog)
                .where(UserProfileChangeLog.user_id == user_id)
                .order_by(UserProfileChangeLog.created_at.desc())
                .limit(100)
            )
        ).scalars().all()
        decisions = (
            await db.execute(
                select(PersonalizationDecisionLog)
                .where(PersonalizationDecisionLog.user_id == user_id)
                .order_by(PersonalizationDecisionLog.created_at.desc())
                .limit(100)
            )
        ).scalars().all()
        assignments = (
            await db.execute(
                select(PersonalizationExperimentAssignment).where(
                    PersonalizationExperimentAssignment.user_id == user_id
                )
            )
        ).scalars().all()

        return {
            "user_id": str(user_id),
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "profile": (
                {
                    "profile_version": prof.profile_version,
                    "personalization_enabled": prof.personalization_enabled,
                    "preferred_language": prof.preferred_language,
                    "communication_tone": prof.communication_tone,
                    "digest_frequency": prof.digest_frequency,
                    "home_city": prof.home_city if prof.location_consent else None,
                    "travel_origin": prof.travel_origin if prof.location_consent else None,
                    "location_consent": prof.location_consent,
                    "explicit_preferences": prof.explicit_preferences,
                    "travel_timeline_stage": prof.travel_timeline_stage,
                    "loyalty_tier": prof.loyalty_tier,
                    "activity_level": prof.activity_level,
                    "overall_confidence": prof.overall_confidence,
                    "last_activity_at": prof.last_activity_at.isoformat() if prof.last_activity_at else None,
                    "reset_at": prof.reset_at.isoformat() if prof.reset_at else None,
                }
                if prof
                else None
            ),
            "notification_preferences": (
                {
                    "push_enabled": notif_pref.push_enabled,
                    "email_enabled": notif_pref.email_enabled,
                    "sms_enabled": notif_pref.sms_enabled,
                    "in_app_enabled": notif_pref.in_app_enabled,
                    "category_booking": notif_pref.category_booking,
                    "category_security": notif_pref.category_security,
                    "category_flight_alerts": notif_pref.category_flight_alerts,
                    "category_marketing": notif_pref.category_marketing,
                    "category_community": notif_pref.category_community,
                    "category_price_alerts": notif_pref.category_price_alerts,
                    "quiet_hours_enabled": notif_pref.quiet_hours_enabled,
                    "quiet_hours_start": notif_pref.quiet_hours_start,
                    "quiet_hours_end": notif_pref.quiet_hours_end,
                    "timezone": notif_pref.timezone,
                    "frequency_cap_marketing_per_day": notif_pref.frequency_cap_marketing_per_day,
                }
                if notif_pref
                else None
            ),
            "dimensions": [
                {
                    "dimension_key": d.dimension_key,
                    "value": d.value_json,
                    "confidence": d.confidence,
                    "source": d.source,
                    "data_quality": d.data_quality,
                    "is_user_provided": d.is_user_provided,
                    "permission_granted": d.permission_granted,
                    "expires_at": d.expires_at.isoformat() if d.expires_at else None,
                }
                for d in dims
            ],
            "destination_interests": [
                {
                    "destination": i.destination,
                    "score": i.score,
                    "confidence": i.confidence,
                    "signal_count": i.signal_count,
                    "is_explicit_favorite": i.is_explicit_favorite,
                }
                for i in interests
            ],
            "recent_signals": [
                {
                    "signal_type": s.signal_type,
                    "category": s.category,
                    "destination": s.destination,
                    "product_type": s.product_type,
                    "occurred_at": s.occurred_at.isoformat() if s.occurred_at else None,
                }
                for s in signals
            ],
            "fatigue": [
                {
                    "category": f.category,
                    "fatigue_score": f.fatigue_score,
                    "received_24h": f.received_24h,
                    "received_7d": f.received_7d,
                    "cooldown_until": f.cooldown_until.isoformat() if f.cooldown_until else None,
                }
                for f in fatigue_rows
            ],
            "change_logs": [
                {
                    "dimension_key": c.dimension_key,
                    "change_source": c.change_source,
                    "reason": c.reason,
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                }
                for c in change_logs
            ],
            "recent_decisions": [
                {
                    "decision_id": str(d.decision_id),
                    "event_type": d.event_type,
                    "category": d.category,
                    "personalization_tier": d.personalization_tier,
                    "relevance_score": d.relevance_score,
                    "confidence_score": d.confidence_score,
                    "explanation_factors": cls.sanitize_explanation_factors(d.explanation_factors),
                    "created_at": d.created_at.isoformat() if d.created_at else None,
                }
                for d in decisions
            ],
            "experiment_assignments": [
                {
                    "experiment_id": str(a.experiment_id),
                    "variant": a.variant,
                    "assigned_at": a.assigned_at.isoformat() if a.assigned_at else None,
                }
                for a in assignments
            ],
        }

    @staticmethod
    async def reset_user_personalization(
        db: AsyncSession,
        user_id: uuid.UUID,
        *,
        reason: str = "user_requested_reset",
    ) -> Dict[str, Any]:
        """
        Resets inferred personalization intelligence, signals, destination interests,
        and fatigue counters while preserving the user's account and consent shell.
        """
        now = datetime.now(timezone.utc)
        cleared = 0

        for model in (UserBehavioralSignal, UserDestinationInterest, UserNotificationFatigue, UserProfileDimension):
            res = await db.execute(delete(model).where(model.user_id == user_id))
            cleared += int(res.rowcount or 0)

        prof = (
            await db.execute(
                select(UserPersonalizationProfile).where(UserPersonalizationProfile.user_id == user_id)
            )
        ).scalar_one_or_none()

        new_version = 1
        if prof:
            prof.profile_version += 1
            new_version = prof.profile_version
            prof.home_city = None
            prof.travel_origin = None
            prof.location_consent = False
            prof.explicit_preferences = {}
            prof.travel_timeline_stage = "no_planned_trip"
            prof.activity_level = "new_user"
            prof.overall_confidence = 0.0
            prof.active_trip_context = {}
            prof.last_aggregated_at = None
            prof.reset_at = now

        db.add(
            UserProfileChangeLog(
                user_id=user_id,
                profile_version=new_version,
                dimension_key="all",
                change_source="user_reset",
                previous_value={"reset": False},
                new_value={"reset": True},
                reason=reason,
            )
        )
        await db.flush()

        return {
            "success": True,
            "user_id": user_id,
            "action": "reset",
            "profile_version": new_version,
            "cleared_records": cleared,
            "message": "Personalization signals, destination scores, and inferred preferences have been reset.",
        }

    @staticmethod
    async def delete_user_personalization(
        db: AsyncSession,
        user_id: uuid.UUID,
    ) -> Dict[str, Any]:
        """
        Permanently deletes all personalization profile, signal, interest, dimension,
        fatigue, decision log, and experiment assignment rows for a user.
        Preserves core bookings, payments, and account records.
        """
        cleared = 0
        for model in (
            UserBehavioralSignal,
            UserDestinationInterest,
            UserProfileDimension,
            UserProfileChangeLog,
            UserNotificationFatigue,
            PersonalizationDecisionLog,
            PersonalizationExperimentAssignment,
            UserPersonalizationProfile,
        ):
            res = await db.execute(delete(model).where(model.user_id == user_id))
            cleared += int(res.rowcount or 0)

        await db.flush()

        return {
            "success": True,
            "user_id": user_id,
            "action": "deleted",
            "profile_version": None,
            "cleared_records": cleared,
            "message": "All user personalization profile and behavioral history records have been deleted.",
        }
