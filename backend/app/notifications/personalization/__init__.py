"""
ShopnoJatra Hyper-Personalized Notification Intelligence Package.

Exports core 20-dimensional user intelligence, time-decay mathematics,
behavioral analytics signal ingestion, and dynamic profile lifecycle services.
"""

from __future__ import annotations

from importlib import import_module
from typing import Any

from app.notifications.personalization.dimensions import (
    ACTIVITY_LIFECYCLE_STATES,
    ALLOWED_ACCOMMODATION_TYPES,
    ALLOWED_BUDGET_TIERS,
    ALLOWED_DATA_QUALITIES,
    ALLOWED_DIGEST_FREQUENCIES,
    ALLOWED_LANGUAGES,
    ALLOWED_SOURCES,
    ALLOWED_TIME_WINDOWS,
    ALLOWED_TONES,
    ALLOWED_TRANSPORT_MODES,
    ALLOWED_TRAVEL_STYLES,
    CONSENTED_LOCATION_FIELDS,
    DIMENSION_KEYS,
    DIMENSION_REGISTRY,
    DIMENSION_SPECS,
    FORBIDDEN_SENSITIVE_ATTRIBUTES,
    RELIGIOUS_TRAVEL_TAGS,
    TRAVEL_TIMELINE_STAGES,
    DimensionSpec,
    DimensionValue,
    UserProfile20DSnapshot,
    build_empty_dimensions_map,
    compute_data_quality,
    compute_expires_at,
    make_unknown_dimension,
    sanitize_dimension_value,
)
from app.notifications.personalization.profile_service import UserProfileService
from app.notifications.personalization.signals import (
    ALLOWED_SIGNAL_TYPES,
    DISCOVERY_BEHAVIORAL_SIGNALS,
    NOTIFICATION_ENGAGEMENT_SIGNALS,
    ActivityLifecycleThresholds,
    BehavioralSignalService,
    CategoryEngagementMetrics,
    PriceSensitivityMetrics,
    SearchBehaviorMetrics,
    SignalIngestionResult,
    normalize_destination_name,
)
from app.notifications.personalization.time_decay import (
    DEFAULT_DECAY_LAMBDA,
    DEFAULT_SATURATION_SCALE,
    DEFAULT_SIGNAL_CONFIDENCE,
    DEFAULT_SIGNAL_WEIGHTS,
    HIGH_INTENT_SIGNALS,
    NEGATIVE_SIGNALS,
    PASSIVE_WEAK_SIGNALS,
    STRONG_INTENT_THRESHOLD,
    DecayedInterestResult,
    SignalObservation,
    TimeDecayConfig,
    advance_raw_score,
    aggregate_decayed_interest,
    apply_config_dict,
    compute_incremental_interest,
    compute_signal_decay,
    normalize_confidence_unit,
    normalize_decayed_score,
)

__all__ = [
    # Dimensions
    "DIMENSION_KEYS",
    "DIMENSION_SPECS",
    "DIMENSION_REGISTRY",
    "DimensionSpec",
    "DimensionValue",
    "UserProfile20DSnapshot",
    "ALLOWED_SOURCES",
    "ALLOWED_DATA_QUALITIES",
    "ALLOWED_LANGUAGES",
    "ALLOWED_TONES",
    "ALLOWED_DIGEST_FREQUENCIES",
    "ALLOWED_BUDGET_TIERS",
    "ALLOWED_TRAVEL_STYLES",
    "ALLOWED_TRANSPORT_MODES",
    "ALLOWED_ACCOMMODATION_TYPES",
    "ALLOWED_TIME_WINDOWS",
    "ACTIVITY_LIFECYCLE_STATES",
    "TRAVEL_TIMELINE_STAGES",
    "FORBIDDEN_SENSITIVE_ATTRIBUTES",
    "RELIGIOUS_TRAVEL_TAGS",
    "CONSENTED_LOCATION_FIELDS",
    "compute_data_quality",
    "compute_expires_at",
    "sanitize_dimension_value",
    "make_unknown_dimension",
    "build_empty_dimensions_map",
    # Time-Decay Mathematics
    "DEFAULT_DECAY_LAMBDA",
    "DEFAULT_SATURATION_SCALE",
    "STRONG_INTENT_THRESHOLD",
    "PASSIVE_WEAK_SIGNALS",
    "HIGH_INTENT_SIGNALS",
    "NEGATIVE_SIGNALS",
    "DEFAULT_SIGNAL_WEIGHTS",
    "DEFAULT_SIGNAL_CONFIDENCE",
    "TimeDecayConfig",
    "SignalObservation",
    "DecayedInterestResult",
    "normalize_confidence_unit",
    "compute_signal_decay",
    "normalize_decayed_score",
    "advance_raw_score",
    "compute_incremental_interest",
    "aggregate_decayed_interest",
    "apply_config_dict",
    # Behavioral Signal Analytics
    "ALLOWED_SIGNAL_TYPES",
    "NOTIFICATION_ENGAGEMENT_SIGNALS",
    "DISCOVERY_BEHAVIORAL_SIGNALS",
    "ActivityLifecycleThresholds",
    "CategoryEngagementMetrics",
    "SearchBehaviorMetrics",
    "PriceSensitivityMetrics",
    "SignalIngestionResult",
    "BehavioralSignalService",
    "normalize_destination_name",
    # Dynamic Profile Service
    "UserProfileService",
]

_LAZY_SUBMODULE_EXPORTS = {
    "TravelContextEngine": "app.notifications.personalization.travel_context",
    "RelevanceEngine": "app.notifications.personalization.relevance",
    "RelevanceResult": "app.notifications.personalization.relevance",
    "NotificationCandidate": "app.notifications.personalization.relevance",
    "SegmentBuilderService": "app.notifications.personalization.segments",
    "TravelAutomationsService": "app.notifications.personalization.automations",
    "FatigueEngine": "app.notifications.personalization.fatigue",
    "AdaptiveTimingEngine": "app.notifications.personalization.timing",
    "ChannelSelector": "app.notifications.personalization.channel_selector",
    "NotificationDecisionPipeline": "app.notifications.personalization.decision_pipeline",
    "PrivacyAndConsentGuard": "app.notifications.personalization.privacy",
    "ExperimentEngine": "app.notifications.personalization.experiments",
}


def __getattr__(name: str) -> Any:
    module_path = _LAZY_SUBMODULE_EXPORTS.get(name)
    if module_path is not None:
        mod = import_module(module_path)
        return getattr(mod, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
