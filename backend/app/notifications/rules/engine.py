"""
Deterministic Rules Engine for Notification Delivery Governance.

Enforces channel opt-ins, category subscriptions, quiet hours (`22:00`-`07:00` or
user-configured window in user timezone), priority >= 9 P0/critical emergency
bypasses, frequency caps, and optional database `NotificationRule` condition trees.
"""

from datetime import datetime, time, timedelta, timezone
import logging
from typing import Any, Dict, FrozenSet, Iterable, List, Optional, Tuple
import uuid
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import NotificationRule, NotificationUserPreference
from app.notifications.events.base import DomainEvent

logger = logging.getLogger(__name__)

# Critical transactional, security, SOS, payment, refund, ticket, and verified disruption
# events that must NEVER be blocked by quiet hours or marketing/promotional fatigue caps.
CRITICAL_BYPASS_EVENT_TYPES: FrozenSet[str] = frozenset(
    {
        "security.auth.otp_requested",
        "security.auth.new_device_login",
        "security.auth.password_changed",
        "marketplace.trip.sos_triggered",
        "travel.sos.triggered",
        "booking.confirmed",
        "booking.payment_succeeded",
        "booking.payment_failed",
        "booking.ticket_issued",
        "booking.refunded",
        "payment.completed",
        "payment.refunded",
        "flight.schedule_changed",
        "travel.disruption.detected",
        "hotel.booking.confirmed",
        "system.dlq.message_quarantined",
        "system.provider.circuit_breaker_tripped",
    }
)

PROMOTIONAL_CATEGORIES: FrozenSet[str] = frozenset(
    {"marketing", "promo", "campaign", "discovery", "reactivation", "digest"}
)

DEFAULT_CHANNELS_BY_EVENT_PREFIX: Tuple[Tuple[str, List[str]], ...] = (
    ("security.auth.otp_requested", ["sms"]),
    ("security.auth.", ["email", "push", "in_app"]),
    ("security.", ["in_app"]),
    ("marketplace.trip.sos", ["push", "sms", "in_app"]),
    ("travel.sos", ["push", "sms", "in_app"]),
    ("flight.schedule_changed", ["push", "sms", "in_app"]),
    ("travel.disruption.detected", ["push", "sms", "in_app"]),
    ("flight.price_alert", ["push", "in_app"]),
    ("booking.confirmed", ["in_app", "push", "email"]),
    ("booking.ticket_issued", ["push", "in_app", "email"]),
    ("booking.payment_failed", ["push", "in_app", "sms"]),
    ("booking.payment_succeeded", ["in_app", "email"]),
    ("booking.", ["in_app", "push", "email"]),
    ("hotel.booking.", ["in_app", "email"]),
    ("hotel.guest.", ["push", "in_app"]),
    ("marketing.", ["push", "in_app", "email"]),
    ("campaign.", ["push", "in_app", "email"]),
)


def resolve_timezone(tz_name: Optional[str]) -> Any:
    """Resolve IANA timezone string with safe fallback to Asia/Dhaka (UTC+6)."""
    if tz_name:
        try:
            return ZoneInfo(tz_name)
        except Exception:
            logger.debug(f"Invalid timezone {tz_name!r}; falling back to Asia/Dhaka")
    try:
        return ZoneInfo("Asia/Dhaka")
    except Exception:
        return timezone(timedelta(hours=6))


def parse_hhmm(hhmm: str, fallback: time) -> time:
    """Parse 'HH:MM' strings cleanly."""
    try:
        parts = (hhmm or "").strip().split(":")
        return time(int(parts[0]) % 24, int(parts[1]) % 60)
    except Exception:
        return fallback


def is_within_quiet_hours(
    check_time: time,
    start_str: str = "22:00",
    end_str: str = "07:00",
) -> bool:
    """Check whether `check_time` falls within a possibly midnight-spanning quiet window."""
    start = parse_hhmm(start_str, time(22, 0))
    end = parse_hhmm(end_str, time(7, 0))
    if start == end:
        return False
    if start > end:
        return check_time >= start or check_time < end
    return start <= check_time < end


def compute_quiet_hours_end_utc(
    now_utc: datetime,
    tz_name: Optional[str] = "Asia/Dhaka",
    start_str: str = "22:00",
    end_str: str = "07:00",
) -> datetime:
    """Compute the next UTC timestamp when quiet hours conclude."""
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    tz = resolve_timezone(tz_name)
    local_now = now_utc.astimezone(tz)
    end_t = parse_hhmm(end_str, time(7, 0))
    candidate_local = local_now.replace(
        hour=end_t.hour,
        minute=end_t.minute,
        second=0,
        microsecond=0,
    )
    if candidate_local <= local_now:
        candidate_local = candidate_local + timedelta(days=1)
    return candidate_local.astimezone(timezone.utc)


def resolve_event_category(
    event_type: str,
    aggregate_type: str = "",
    payload: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Map an event_type / aggregate_type / payload into canonical preference categories:
    `booking` | `security` | `flight_alerts` | `price_alerts` | `marketing` | `community` | `system`.
    """
    pl = payload or {}
    explicit_cat = str(pl.get("category", "")).strip().lower()
    if explicit_cat in {
        "booking",
        "security",
        "flight_alerts",
        "price_alerts",
        "marketing",
        "community",
        "system",
    }:
        return explicit_cat

    et = (event_type or "").lower()
    agg = (aggregate_type or "").lower()

    if et.startswith("security.") or agg in ("security", "security_gate", "session"):
        return "security"
    if "sos" in et or agg == "trip_session":
        return "security"
    if "price_alert" in et or agg == "price_alert" or explicit_cat == "price_alert":
        return "price_alerts"
    if et in ("flight.schedule_changed", "travel.disruption.detected") or agg in ("flight", "disruption"):
        return "flight_alerts"
    if (
        et.startswith("marketing.")
        or et.startswith("campaign.")
        or et.startswith("promo.")
        or et.startswith("personalization.automation.")
        or agg in ("marketing", "campaign")
        or explicit_cat in ("promo", "discovery", "digest", "reactivation")
    ):
        return "marketing"
    if et in ("hotel.review.submitted", "marketplace.itinerary.cloned") or agg in ("hotel_review", "itinerary"):
        return "community"
    if (
        et.startswith("booking.")
        or et.startswith("payment.")
        or et.startswith("hotel.booking")
        or et.startswith("marketplace.guide")
        or agg in ("booking", "payment", "ticket", "hotel_booking", "marketplace_booking")
    ):
        return "booking"
    if et.startswith("system.") or et.startswith("agency.") or et.startswith("hotel."):
        return "system"
    return "booking" if "refund" in et else "system"


def is_critical_event(
    event_type: str,
    priority: int = 5,
    payload: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Determine whether an event is P0/critical transactional/security/SOS/payment/
    ticket/refund/verified-disruption and therefore exempt from quiet hours and fatigue caps.
    """
    if int(priority or 5) >= 9:
        return True
    et = (event_type or "").lower()
    pl = payload or {}
    if bool(pl.get("is_critical")) or bool(pl.get("bypass_quiet_hours")):
        return True
    if et in CRITICAL_BYPASS_EVENT_TYPES:
        return True
    if "sos" in et or "otp" in et or "refund" in et:
        return True
    if et == "travel.disruption.detected" and pl.get("is_verified", True):
        return True
    return False


_ALLOWED_CONDITION_OPS = frozenset(
    {"eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in", "contains", "exists"}
)


def _lookup_payload_field(payload: Dict[str, Any], field_path: str) -> Tuple[bool, Any]:
    """Safely look up flat or dotted keys in payload without dunder/private attribute access."""
    if field_path in payload:
        return True, payload[field_path]
    if "." not in field_path:
        return False, None
    cur: Any = payload
    for part in field_path.split("."):
        if not part or part.startswith("_") or not isinstance(cur, dict) or part not in cur:
            return False, None
        cur = cur[part]
    return True, cur


def _safe_order_compare(actual: Any, expected: Any, op: str) -> bool:
    """Compare numeric/comparable values safely without raising TypeError on mixed types."""
    if actual is None or expected is None:
        return False
    left: Any = actual
    right: Any = expected
    if isinstance(left, bool) or isinstance(right, bool):
        return False
    if type(left) is not type(right):
        try:
            left = float(left)
            right = float(right)
        except (TypeError, ValueError):
            return False
    try:
        if op == "gt":
            return bool(left > right)
        if op == "gte":
            return bool(left >= right)
        if op == "lt":
            return bool(left < right)
        if op == "lte":
            return bool(left <= right)
    except TypeError:
        return False
    return False


def _extract_explicit_leaf(conditions: Dict[str, Any]) -> Optional[Tuple[str, str, Any]]:
    """Detect optional `{field, op, value}` leaf syntax when `'op'` is specified."""
    if "op" in conditions and (
        isinstance(conditions.get("op"), str) or "field" in conditions
    ):
        field_name = conditions.get("field")
        op_name = conditions.get("op")
        val = conditions.get("value", True if op_name == "exists" else None)
        return field_name, op_name, val  # type: ignore[return-value]
    return None


def _validate_operator_map(field_name: str, ops_map: Dict[str, Any]) -> None:
    if not ops_map:
        raise ValueError(f"Operator map for '{field_name}' cannot be empty.")
    unknown_ops = [op for op in ops_map.keys() if op not in _ALLOWED_CONDITION_OPS]
    if unknown_ops:
        raise ValueError(f"Unsupported condition operator(s) on '{field_name}': {unknown_ops}")
    for op in ("in", "not_in"):
        if op in ops_map and not isinstance(ops_map[op], (list, tuple, set)):
            raise ValueError(f"Operator '{op}' on '{field_name}' requires a list.")
    if "exists" in ops_map and not isinstance(ops_map["exists"], bool):
        raise ValueError(f"Operator 'exists' on '{field_name}' requires a boolean.")


def _eval_operator_map(found: bool, actual: Any, ops_map: Dict[str, Any]) -> bool:
    if "exists" in ops_map:
        exists_flag = bool(found and actual is not None)
        if exists_flag != bool(ops_map["exists"]):
            return False
    if "eq" in ops_map and actual != ops_map["eq"]:
        return False
    if "neq" in ops_map and actual == ops_map["neq"]:
        return False
    if "in" in ops_map and (
        not isinstance(ops_map["in"], (list, tuple, set)) or actual not in ops_map["in"]
    ):
        return False
    if (
        "not_in" in ops_map
        and isinstance(ops_map["not_in"], (list, tuple, set))
        and actual in ops_map["not_in"]
    ):
        return False
    if "contains" in ops_map:
        needle = ops_map["contains"]
        if isinstance(actual, (list, tuple, set)):
            if needle not in actual:
                return False
        elif isinstance(actual, str):
            if str(needle) not in actual:
                return False
        else:
            return False
    for order_op in ("gt", "gte", "lt", "lte"):
        if order_op in ops_map and not _safe_order_compare(actual, ops_map[order_op], order_op):
            return False
    return True


def validate_condition_tree(conditions: Optional[Dict[str, Any]], *, _depth: int = 0) -> None:
    """
    Validate rule condition tree structure deterministically (never uses eval/exec).
    Supports both `{field: {op: value}}` and `{"field": ..., "op": ..., "value": ...}` nodes.
    Raises ValueError on malformed trees, unsafe paths, or unknown operators.
    """
    if conditions is None or conditions == {}:
        return
    if _depth > 8:
        raise ValueError("Rule condition tree exceeds maximum nesting depth of 8.")
    if not isinstance(conditions, dict):
        raise ValueError("Rule conditions must be a JSON object.")

    leaf = _extract_explicit_leaf(conditions)
    if leaf is not None:
        field_name, op_name, val = leaf
        if (
            not isinstance(field_name, str)
            or not field_name.strip()
            or any(part.startswith("_") for part in field_name.split("."))
        ):
            raise ValueError(f"Invalid condition field '{field_name}'.")
        if not isinstance(op_name, str):
            raise ValueError(f"Unsupported condition operator on '{field_name}': {op_name!r}")
        _validate_operator_map(field_name, {op_name: val})
        return

    for key, val in conditions.items():
        if not isinstance(key, str) or not key.strip():
            raise ValueError("Condition keys must be non-empty strings.")
        if key in ("all", "any"):
            if not isinstance(val, list):
                raise ValueError(f"Condition '{key}' must be a list of sub-conditions.")
            for sub in val:
                validate_condition_tree(sub, _depth=_depth + 1)
            continue
        if key == "not":
            if not isinstance(val, dict):
                raise ValueError("Condition 'not' must be a condition object.")
            validate_condition_tree(val, _depth=_depth + 1)
            continue
        if any(part.startswith("_") for part in key.split(".")):
            raise ValueError(f"Invalid condition field '{key}'.")
        if isinstance(val, dict):
            _validate_operator_map(key, val)


def evaluate_condition_tree(conditions: Optional[Dict[str, Any]], payload: Dict[str, Any]) -> bool:
    """
    Evaluate deterministic rule `conditions` JSON against an event payload.
    Supports `all`, `any`, `not`, `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`,
    `not_in`, `contains`, `exists`, flat key-value checks, `{field, op, value}`,
    and safe dotted paths.
    """
    if not conditions:
        return True
    if not isinstance(conditions, dict):
        return False
    leaf = _extract_explicit_leaf(conditions)
    if leaf is not None:
        field_name, op_name, val = leaf
        if not isinstance(field_name, str) or op_name not in _ALLOWED_CONDITION_OPS:
            return False
        found, actual = _lookup_payload_field(payload, field_name)
        return _eval_operator_map(found, actual, {op_name: val})

    if "all" in conditions and isinstance(conditions["all"], list):
        if not all(evaluate_condition_tree(c, payload) for c in conditions["all"]):
            return False
    if "any" in conditions and isinstance(conditions["any"], list):
        if not any(evaluate_condition_tree(c, payload) for c in conditions["any"]):
            return False
    if "not" in conditions and isinstance(conditions["not"], dict):
        if evaluate_condition_tree(conditions["not"], payload):
            return False

    for key, expected in conditions.items():
        if key in ("all", "any", "not"):
            continue
        found, actual = _lookup_payload_field(payload, key)
        if isinstance(expected, dict):
            if not _eval_operator_map(found, actual, expected):
                return False
        else:
            if actual != expected:
                return False
    return True


class RuleEvaluationResult(BaseModel):
    """Deterministic outcome from evaluating rules, preferences, quiet hours, and caps."""
    model_config = ConfigDict(extra="ignore")

    eligible_channels: List[str] = Field(default_factory=list)
    suppressed_channels: Dict[str, str] = Field(default_factory=dict)
    suppressed_reasons: List[str] = Field(default_factory=list)
    is_suppressed: bool = False
    should_dispatch_now: bool = True
    bypass_quiet_hours: bool = False
    is_critical: bool = False
    category: str = "system"
    scheduled_at: Optional[datetime] = None
    matched_rule_ids: List[uuid.UUID] = Field(default_factory=list)
    template_id: Optional[uuid.UUID] = None


class RulesEngine:
    """
    Deterministic Notification Rules Engine.
    Evaluates channel opt-ins, category opt-ins, priority >= 9 & critical bypasses,
    quiet hours (`22:00`-`07:00` or user's configured window & timezone),
    marketing daily caps, and active DB `NotificationRule` rows.
    """

    evaluate_condition_tree = staticmethod(evaluate_condition_tree)

    @staticmethod
    def default_channels_for_event(event: DomainEvent) -> List[str]:
        et = (event.event_type or "").lower()
        payload_channels = (event.payload or {}).get("channels")
        if isinstance(payload_channels, list) and payload_channels:
            return [str(c) for c in payload_channels]
        for prefix, chans in DEFAULT_CHANNELS_BY_EVENT_PREFIX:
            if et.startswith(prefix):
                return list(chans)
        return ["in_app", "push"]

    @staticmethod
    def _pref_val(prefs: Any, attr: str, default: Any) -> Any:
        val = getattr(prefs, attr, default)
        return default if val is None else val

    @classmethod
    def _category_opt_in_check(
        cls,
        category: str,
        prefs: NotificationUserPreference,
    ) -> Tuple[bool, Optional[str]]:
        mapping = {
            "booking": ("category_booking", "category_booking_opt_out"),
            "security": ("category_security", "category_security_opt_out"),
            "flight_alerts": ("category_flight_alerts", "category_flight_alerts_opt_out"),
            "marketing": ("category_marketing", "category_marketing_opt_out"),
            "community": ("category_community", "category_community_opt_out"),
            "price_alerts": ("category_price_alerts", "category_price_alerts_opt_out"),
        }
        if category in mapping:
            attr_name, reason = mapping[category]
            if not bool(cls._pref_val(prefs, attr_name, True)):
                return False, reason
        return True, None

    @classmethod
    def evaluate_sync(
        cls,
        event: DomainEvent,
        user_preferences: Optional[NotificationUserPreference],
        *,
        db_rules: Optional[Iterable[NotificationRule]] = None,
        simulated_local_time: Optional[time] = None,
        now_utc: Optional[datetime] = None,
        marketing_sent_today: int = 0,
        candidate_channels: Optional[List[str]] = None,
        rule_last_triggered_at: Optional[Dict[uuid.UUID, datetime]] = None,
    ) -> RuleEvaluationResult:
        """
        Pure deterministic evaluation without I/O.
        """
        now = now_utc or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

        category = resolve_event_category(
            event.event_type,
            event.aggregate_type,
            event.payload,
        )
        critical = is_critical_event(event.event_type, event.priority, event.payload)
        bypass_quiet = event.priority >= 9 or critical

        matched_rules: List[NotificationRule] = []
        rule_channels: Optional[List[str]] = None
        template_id: Optional[uuid.UUID] = None
        cooldown_suppressed_rules: List[NotificationRule] = []

        if db_rules:
            for rule in db_rules:
                if not getattr(rule, "is_active", True):
                    continue
                if rule.trigger_event not in (event.event_type, "*"):
                    continue
                if evaluate_condition_tree(rule.conditions, event.payload or {}):
                    cd_sec = int(getattr(rule, "cooldown_seconds", 0) or 0)
                    r_id = getattr(rule, "id", None)
                    if (
                        cd_sec > 0
                        and not critical
                        and rule_last_triggered_at
                        and r_id in rule_last_triggered_at
                    ):
                        last_t = rule_last_triggered_at[r_id]
                        if last_t.tzinfo is None:
                            last_t = last_t.replace(tzinfo=timezone.utc)
                        if (now - last_t).total_seconds() < cd_sec:
                            cooldown_suppressed_rules.append(rule)
                            continue
                    matched_rules.append(rule)
                    if rule.bypass_quiet_hours or str(rule.priority).lower() == "critical":
                        bypass_quiet = True
                    if rule_channels is None and rule.channels:
                        rule_channels = list(rule.channels)
                    if template_id is None and rule.template_id:
                        template_id = rule.template_id

        if cooldown_suppressed_rules and not matched_rules and not critical:
            return RuleEvaluationResult(
                eligible_channels=[],
                suppressed_channels={},
                suppressed_reasons=["rule_cooldown_active"],
                is_suppressed=True,
                should_dispatch_now=False,
                bypass_quiet_hours=bypass_quiet,
                is_critical=critical,
                category=category,
                matched_rule_ids=[],
                template_id=None,
            )

        desired_channels = list(
            candidate_channels
            or rule_channels
            or cls.default_channels_for_event(event)
        )

        # No user preference row yet -> allow safe defaults (in_app, email, or rule channels)
        if user_preferences is None:
            return RuleEvaluationResult(
                eligible_channels=desired_channels or ["in_app", "email"],
                suppressed_channels={},
                suppressed_reasons=[],
                is_suppressed=False,
                should_dispatch_now=True,
                bypass_quiet_hours=bypass_quiet,
                is_critical=critical,
                category=category,
                matched_rule_ids=[r.id for r in matched_rules if getattr(r, "id", None)],
                template_id=template_id,
            )

        # 1. Category opt-in check (security/critical OTP/SOS cannot be silently dropped unless non-critical)
        suppressed_reasons: List[str] = []
        suppressed_channels: Dict[str, str] = {}

        cat_allowed, cat_reason = cls._category_opt_in_check(category, user_preferences)
        if not cat_allowed and not (critical and category != "marketing"):
            suppressed_reasons.append(cat_reason or f"category_{category}_opt_out")
            return RuleEvaluationResult(
                eligible_channels=[],
                suppressed_channels={ch: (cat_reason or "category_opt_out") for ch in desired_channels},
                suppressed_reasons=suppressed_reasons,
                is_suppressed=True,
                should_dispatch_now=False,
                bypass_quiet_hours=bypass_quiet,
                is_critical=critical,
                category=category,
                matched_rule_ids=[r.id for r in matched_rules if getattr(r, "id", None)],
                template_id=template_id,
            )

        # 2. Channel opt-in filtering
        channel_flag_map = {
            "push": ("push_enabled", "push_disabled_by_user"),
            "email": ("email_enabled", "email_disabled_by_user"),
            "sms": ("sms_enabled", "sms_disabled_by_user"),
            "in_app": ("in_app_enabled", "in_app_disabled_by_user"),
        }
        eligible_channels: List[str] = []
        for ch in desired_channels:
            if ch in channel_flag_map:
                flag_attr, reason = channel_flag_map[ch]
                if bool(cls._pref_val(user_preferences, flag_attr, True)):
                    eligible_channels.append(ch)
                else:
                    suppressed_channels[ch] = reason
                    if reason not in suppressed_reasons:
                        suppressed_reasons.append(reason)
            elif ch == "webhook":
                eligible_channels.append(ch)

        if not eligible_channels:
            return RuleEvaluationResult(
                eligible_channels=[],
                suppressed_channels=suppressed_channels,
                suppressed_reasons=suppressed_reasons or ["no_eligible_channels"],
                is_suppressed=True,
                should_dispatch_now=False,
                bypass_quiet_hours=bypass_quiet,
                is_critical=critical,
                category=category,
                matched_rule_ids=[r.id for r in matched_rules if getattr(r, "id", None)],
                template_id=template_id,
            )

        # 3. Daily frequency cap for promotional/marketing category
        if category in PROMOTIONAL_CATEGORIES and not critical:
            daily_cap = max(0, int(cls._pref_val(user_preferences, "frequency_cap_marketing_per_day", 3)))
            if marketing_sent_today >= daily_cap:
                suppressed_reasons.append("marketing_daily_frequency_cap_reached")
                return RuleEvaluationResult(
                    eligible_channels=[],
                    suppressed_channels={ch: "marketing_daily_frequency_cap_reached" for ch in eligible_channels},
                    suppressed_reasons=suppressed_reasons,
                    is_suppressed=True,
                    should_dispatch_now=False,
                    bypass_quiet_hours=bypass_quiet,
                    is_critical=critical,
                    category=category,
                    matched_rule_ids=[r.id for r in matched_rules if getattr(r, "id", None)],
                    template_id=template_id,
                )

        # 4. Quiet hours evaluation
        should_dispatch_now = True
        is_suppressed = False
        scheduled_at: Optional[datetime] = None

        if bool(cls._pref_val(user_preferences, "quiet_hours_enabled", False)):
            tz_name = str(cls._pref_val(user_preferences, "timezone", "Asia/Dhaka"))
            q_start = str(cls._pref_val(user_preferences, "quiet_hours_start", "22:00"))
            q_end = str(cls._pref_val(user_preferences, "quiet_hours_end", "07:00"))

            if simulated_local_time is not None:
                local_t = simulated_local_time
            else:
                local_t = now.astimezone(resolve_timezone(tz_name)).time()

            if is_within_quiet_hours(local_t, q_start, q_end) and not bypass_quiet:
                should_dispatch_now = False
                suppressed_reasons.append("quiet_hours_active")
                if category in PROMOTIONAL_CATEGORIES and event.priority < 4:
                    is_suppressed = True
                else:
                    scheduled_at = compute_quiet_hours_end_utc(now, tz_name, q_start, q_end)

        return RuleEvaluationResult(
            eligible_channels=eligible_channels,
            suppressed_channels=suppressed_channels,
            suppressed_reasons=suppressed_reasons,
            is_suppressed=is_suppressed,
            should_dispatch_now=should_dispatch_now,
            bypass_quiet_hours=bypass_quiet,
            is_critical=critical,
            category=category,
            scheduled_at=scheduled_at,
            matched_rule_ids=[r.id for r in matched_rules if getattr(r, "id", None)],
            template_id=template_id,
        )

    async def evaluate(
        self,
        event: DomainEvent,
        user_preferences: Optional[NotificationUserPreference],
        *,
        db: Optional[AsyncSession] = None,
        simulated_local_time: Optional[time] = None,
        now_utc: Optional[datetime] = None,
        marketing_sent_today: int = 0,
        candidate_channels: Optional[List[str]] = None,
    ) -> RuleEvaluationResult:
        """
        Async evaluation entry point; loads active `NotificationRule` rows when `db` is supplied.
        """
        db_rules: List[NotificationRule] = []
        if db is not None:
            stmt = select(NotificationRule).where(
                NotificationRule.is_active.is_(True),
                NotificationRule.trigger_event.in_([event.event_type, "*"]),
            )
            db_rules = list((await db.scalars(stmt)).all())

        return self.evaluate_sync(
            event=event,
            user_preferences=user_preferences,
            db_rules=db_rules,
            simulated_local_time=simulated_local_time,
            now_utc=now_utc,
            marketing_sent_today=marketing_sent_today,
            candidate_channels=candidate_channels,
        )
