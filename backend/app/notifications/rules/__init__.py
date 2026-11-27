"""
Deterministic Notification Rules Engine Package.
"""

from app.notifications.rules.engine import (
    CRITICAL_BYPASS_EVENT_TYPES,
    PROMOTIONAL_CATEGORIES,
    RuleEvaluationResult,
    RulesEngine,
    compute_quiet_hours_end_utc,
    evaluate_condition_tree,
    is_critical_event,
    is_within_quiet_hours,
    resolve_event_category,
)

__all__ = [
    "CRITICAL_BYPASS_EVENT_TYPES",
    "PROMOTIONAL_CATEGORIES",
    "RuleEvaluationResult",
    "RulesEngine",
    "compute_quiet_hours_end_utc",
    "evaluate_condition_tree",
    "is_critical_event",
    "is_within_quiet_hours",
    "resolve_event_category",
]
