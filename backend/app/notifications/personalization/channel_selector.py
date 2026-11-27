"""
Per-User, Per-Category Intelligent Channel Selector.

Selects eligible channels based on:
- User channel opt-ins (`push_enabled`, `email_enabled`, `sms_enabled`, `in_app_enabled`)
- Category opt-ins & server-side consent
- Channel availability (active push token, email, phone)
- Channel reliability & adapter health
- Category / event urgency routing policy (NEVER blasts all channels blindly!)
- Interaction history & fatigue level
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.notifications.rules.engine import (
    PROMOTIONAL_CATEGORIES,
    is_critical_event,
)

logger = logging.getLogger(__name__)


class ChannelSelectionResult(BaseModel):
    """Result of intelligent channel selection with skipped/fallback explanations."""
    model_config = ConfigDict(extra="ignore")

    selected_channels: List[str] = Field(default_factory=list)
    primary_channel: Optional[str] = None
    skipped_channels: Dict[str, str] = Field(default_factory=dict)
    channel_scores: Dict[str, float] = Field(default_factory=dict)
    fallback_applied: bool = False
    reason: str = "channel_policy_applied"


class ChannelSelector:
    """
    Purposeful multi-channel selector avoiding indiscriminate multi-channel blasting.
    """

    DEFAULT_RELIABILITY: Dict[str, float] = {
        "in_app": 0.99,
        "push": 0.95,
        "email": 0.94,
        "sms": 0.92,
    }

    @staticmethod
    def _default_policy_for_event(
        event_type: str,
        category: str,
        priority: int,
        is_critical: bool,
    ) -> tuple[List[str], int]:
        """
        Return (ordered_preferred_channels, max_channels_to_dispatch).
        """
        et = (event_type or "").lower()
        cat = (category or "system").lower()

        if "otp" in et:
            return ["sms", "email"], 1
        if "sos" in et:
            return ["push", "sms", "in_app"], 3
        if et in ("flight.schedule_changed", "travel.disruption.detected"):
            return ["push", "sms", "in_app", "email"], 3
        if et in ("security.auth.new_device_login", "security.auth.password_changed"):
            return ["email", "push", "in_app"], 3
        if cat == "security":
            return ["email", "push", "in_app"], 2

        if et in ("booking.ticket_issued", "booking.confirmed", "hotel.booking.confirmed"):
            return ["push", "in_app", "email"], 3
        if et == "booking.payment_failed":
            return ["push", "in_app", "sms"], 3
        if et == "booking.payment_succeeded" or "refund" in et:
            return ["in_app", "email", "push"], 3
        if cat == "booking":
            return ["push", "in_app", "email"], 2

        if cat == "price_alerts" or "price_alert" in et:
            return ["push", "in_app"], 2

        if cat == "digest":
            return ["email", "in_app"], 2

        if cat in PROMOTIONAL_CATEGORIES:
            # Marketing / discovery / reactivation: never blast SMS; pick 1 best opted-in channel
            return ["push", "in_app", "email"], 1

        if cat == "community":
            return ["in_app", "push"], 1

        if is_critical or priority >= 9:
            return ["push", "in_app", "email"], 3
        return ["in_app", "push"], 2

    def select_channels(
        self,
        *,
        category: str,
        event_type: str = "",
        priority: int = 5,
        is_critical: Optional[bool] = None,
        preferences: Optional[Any] = None,
        server_side_consent: Optional[Any] = None,
        has_active_push_token: Optional[bool] = None,
        has_email: Optional[bool] = None,
        has_phone: Optional[bool] = None,
        channel_reliability: Optional[Dict[str, float]] = None,
        channel_interaction_history: Optional[Dict[str, Dict[str, Any]]] = None,
        fatigue_score: float = 0.0,
        requested_channels: Optional[List[str]] = None,
    ) -> ChannelSelectionResult:
        """
        Select the optimal channel(s) for a user and notification without spamming.
        """
        cat = (category or "system").lower()
        critical_flag = (
            bool(is_critical)
            if is_critical is not None
            else is_critical_event(event_type, priority)
        )

        policy_order, max_channels = self._default_policy_for_event(
            event_type, cat, priority, critical_flag
        )
        if requested_channels:
            # Respect explicit caller/rule channels while still guarding against promo blasting
            candidates = [str(c).lower() for c in requested_channels if c]
            if cat in PROMOTIONAL_CATEGORIES and not critical_flag:
                candidates = [c for c in candidates if c != "sms"]
                max_channels = 1
        else:
            candidates = policy_order

        # High fatigue reduces fan-out for non-critical messages
        if not critical_flag and fatigue_score >= 55.0:
            max_channels = 1

        reliability = {**self.DEFAULT_RELIABILITY, **(channel_reliability or {})}
        if server_side_consent is None:
            consent: Dict[str, Any] = {}
        elif isinstance(server_side_consent, dict):
            consent = server_side_consent
        else:
            # Support ConsentCheckResult dataclass/model from PrivacyAndConsentGuard
            blocked_map = getattr(server_side_consent, "blocked_channels", {}) or {}
            consent_allowed = bool(getattr(server_side_consent, "allowed", True))
            consent = {
                "personalization_enabled": bool(
                    getattr(server_side_consent, "personalization_allowed", True)
                ),
                "marketing_opt_in": consent_allowed if cat in PROMOTIONAL_CATEGORIES else True,
            }
            for b_ch in blocked_map:
                consent[f"{b_ch}_consent"] = False
        history = channel_interaction_history or {}

        # Server-side marketing consent gate
        if cat in PROMOTIONAL_CATEGORIES and not critical_flag:
            if consent.get("marketing_opt_in") is False:
                return ChannelSelectionResult(
                    selected_channels=[],
                    skipped_channels={c: "marketing_server_consent_denied" for c in candidates},
                    reason="marketing_server_consent_denied",
                )

        def _pref_flag(attr: str, default: bool = True) -> bool:
            if preferences is None:
                return default
            if isinstance(preferences, dict):
                val = preferences.get(attr, default)
                return default if val is None else bool(val)
            val = getattr(preferences, attr, default)
            return default if val is None else bool(val)

        # Category preference gate
        cat_pref_map = {
            "booking": "category_booking",
            "security": "category_security",
            "flight_alerts": "category_flight_alerts",
            "marketing": "category_marketing",
            "community": "category_community",
            "price_alerts": "category_price_alerts",
        }
        if cat in cat_pref_map and not critical_flag:
            if not _pref_flag(cat_pref_map[cat], True):
                return ChannelSelectionResult(
                    selected_channels=[],
                    skipped_channels={c: f"{cat}_opted_out" for c in candidates},
                    reason=f"{cat}_opted_out",
                )

        # Filter and score each candidate channel
        eligible_scored: List[tuple[str, float]] = []
        skipped: Dict[str, str] = {}
        fallback_applied = False

        for idx, ch in enumerate(candidates):
            if ch not in ("push", "in_app", "email", "sms"):
                continue

            # 1. User channel opt-in
            flag_attr = f"{ch}_enabled"
            if not _pref_flag(flag_attr, True) and not (critical_flag and ch == "in_app"):
                skipped[ch] = f"{ch}_disabled_by_user"
                fallback_applied = True
                continue

            # 2. Server-side per-channel consent override
            consent_key = f"{ch}_consent"
            if consent.get(consent_key) is False:
                skipped[ch] = f"{ch}_consent_denied"
                fallback_applied = True
                continue

            # 3. Availability check (only skip when explicitly known False)
            if ch == "push" and has_active_push_token is False:
                skipped[ch] = "no_active_push_token"
                fallback_applied = True
                continue
            if ch == "email" and has_email is False:
                skipped[ch] = "no_email_address"
                fallback_applied = True
                continue
            if ch == "sms" and has_phone is False:
                skipped[ch] = "no_phone_number"
                fallback_applied = True
                continue

            # 4. Channel reliability threshold
            rel = float(reliability.get(ch, 0.9))
            if rel < 0.30 and not critical_flag:
                skipped[ch] = "channel_unhealthy"
                fallback_applied = True
                continue

            # Score channel: policy order + reliability + historical engagement - fatigue noise
            order_score = max(10.0, 50.0 - idx * 10.0)
            rel_score = rel * 30.0
            ch_hist = history.get(ch, {})
            sent_n = max(0, int(ch_hist.get("sent", 0)))
            engaged_n = max(0, int(ch_hist.get("opened", 0)) + int(ch_hist.get("clicked", 0)))
            hist_score = (engaged_n / sent_n) * 20.0 if sent_n > 0 else 8.0

            # Under moderate/high fatigue, favor quieter in_app/email over intrusive push/sms
            fatigue_adj = 0.0
            if not critical_flag and fatigue_score >= 45.0:
                if ch == "in_app":
                    fatigue_adj = 12.0
                elif ch == "push":
                    fatigue_adj = -10.0

            total_score = round(order_score + rel_score + hist_score + fatigue_adj, 2)
            eligible_scored.append((ch, total_score))

        # Fallback: if push/email failed availability and in_app is permitted, include in_app
        if not eligible_scored and "in_app" not in skipped and _pref_flag("in_app_enabled", True):
            eligible_scored.append(("in_app", 60.0))
            fallback_applied = True

        # Preserve policy priority for critical alerts; sort by score for personalized non-critical
        if not critical_flag:
            eligible_scored.sort(key=lambda pair: pair[1], reverse=True)

        selected = [ch for ch, _ in eligible_scored[:max_channels]]
        scores_map = {ch: sc for ch, sc in eligible_scored}

        return ChannelSelectionResult(
            selected_channels=selected,
            primary_channel=selected[0] if selected else None,
            skipped_channels=skipped,
            channel_scores=scores_map,
            fallback_applied=fallback_applied,
            reason="fallback_channel_selected" if fallback_applied and selected else (
                "selected_channels" if selected else "no_eligible_channel"
            ),
        )
