"""
20-Dimensional User Intelligence Profile Registry & Privacy-First Data Contracts.

Defines the canonical 20 personalization dimensions, expiration policies,
data quality scoring, strict sensitive-attribute guardrails, and the
UserProfile20DSnapshot container shared across relevance, decision, AI,
privacy, and API layers.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, FrozenSet, List, Literal, Optional, Tuple
import uuid

from pydantic import BaseModel, Field, field_validator


DimensionSource = Literal[
    "user_preference",
    "behavioral",
    "transactional",
    "contextual",
    "unknown",
]

DataQuality = Literal["high", "medium", "low", "unknown"]

ALLOWED_SOURCES: FrozenSet[str] = frozenset(
    {"user_preference", "behavioral", "transactional", "contextual", "unknown"}
)
ALLOWED_DATA_QUALITIES: FrozenSet[str] = frozenset({"high", "medium", "low", "unknown"})

ALLOWED_LANGUAGES: Tuple[str, ...] = ("en", "bn")
ALLOWED_TONES: Tuple[str, ...] = ("concise", "informative", "friendly", "formal")
ALLOWED_DIGEST_FREQUENCIES: Tuple[str, ...] = ("daily", "weekly", "disabled")
ALLOWED_BUDGET_TIERS: Tuple[str, ...] = (
    "budget",
    "economy",
    "mid_range",
    "premium",
    "luxury",
    "flexible",
)
ALLOWED_TRAVEL_STYLES: Tuple[str, ...] = (
    "solo",
    "family",
    "couple",
    "friends",
    "group",
    "business",
    "adventure",
    "relaxation",
    "cultural",
    "nature",
    "wellness",
    "luxury",
    "budget",
    "religious",
    "religious_travel",
)
ALLOWED_TRANSPORT_MODES: Tuple[str, ...] = (
    "flight",
    "train",
    "bus",
    "launch",
    "ferry",
    "private_vehicle",
    "mixed",
)
ALLOWED_ACCOMMODATION_TYPES: Tuple[str, ...] = (
    "hotel",
    "resort",
    "budget_stay",
    "premium_hotel",
    "family_hotel",
    "eco_stay",
    "guesthouse",
)
ALLOWED_TIME_WINDOWS: Tuple[str, ...] = (
    "morning",
    "afternoon",
    "evening",
    "late_evening",
)
ACTIVITY_LIFECYCLE_STATES: Tuple[str, ...] = (
    "new_user",
    "active",
    "highly_active",
    "returning",
    "inactive",
    "dormant",
    "reactivated",
)
TRAVEL_TIMELINE_STAGES: Tuple[str, ...] = (
    "no_planned_trip",
    "destination_wishlisted",
    "searching_for_trip",
    "comparing_options",
    "booking_in_progress",
    "booked",
    "preparing_for_departure",
    "traveling",
    "returning",
    "post_trip",
)

# Sensitive demographic & identity attributes that must NEVER be inferred, stored in
# personalization dimensions, or exposed to AI/decision copy.
FORBIDDEN_SENSITIVE_ATTRIBUTES: FrozenSet[str] = frozenset(
    {
        "religion",
        "religious_affiliation",
        "faith",
        "sect",
        "denomination",
        "muslim",
        "islam",
        "islamic",
        "hindu",
        "hinduism",
        "christian",
        "christianity",
        "buddhist",
        "buddhism",
        "jewish",
        "judaism",
        "sikh",
        "atheist",
        "sunni",
        "shia",
        "catholic",
        "protestant",
        "health",
        "medical",
        "medical_condition",
        "disability",
        "diagnosis",
        "diabetes",
        "diabetic",
        "cancer",
        "asthma",
        "hypertension",
        "pregnant",
        "pregnancy",
        "depression",
        "mental_health",
        "chronic_illness",
        "hiv",
        "political_affiliation",
        "politics",
        "political_party",
        "awami_league",
        "bnp",
        "jamaat",
        "democrat",
        "republican",
        "conservative_party",
        "liberal_party",
        "ethnicity",
        "ethnic_group",
        "race",
        "caste",
        "tribe",
        "sexual_orientation",
        "biometric",
        "passport_number",
        "nid",
        "national_id",
        "ssn",
        "tin",
        "tin_number",
        "tax_id",
        "salary",
        "income",
        "monthly_income",
        "credit_score",
        "bank_balance",
        "bank_account",
        "debt",
        "loan_default",
        "net_worth",
        "credit_card",
        "card_number",
        "cvv",
        "ip_address",
        "gps",
        "latitude",
        "longitude",
        "lat",
        "lng",
    }
)

# Religious travel packages are ONLY permitted inside travel_style when explicitly
# chosen by the user (`is_user_provided=True`, `source="user_preference"`).
RELIGIOUS_TRAVEL_TAGS: FrozenSet[str] = frozenset(
    {"religious", "religious_travel", "pilgrimage", "umrah", "hajj"}
)

# Location fields allowed ONLY when explicit consent is granted by the user.
CONSENTED_LOCATION_FIELDS: FrozenSet[str] = frozenset(
    {"home_city", "travel_origin", "country", "region"}
)


@dataclass(frozen=True)
class DimensionSpec:
    """Metadata and governance contract for a single personalization dimension."""

    index: int
    key: str
    display_name: str
    description: str
    category: str
    allowed_sources: Tuple[str, ...]
    expiration_policy: str
    default_ttl_days: Optional[int]
    requires_explicit_consent: bool = False
    allow_behavioral_inference: bool = True
    pii_sensitive: bool = False
    safe_for_ai_prompt: bool = True


DIMENSION_SPECS: Tuple[DimensionSpec, ...] = (
    DimensionSpec(
        index=1,
        key="profile_context",
        display_name="Profile Context",
        description="Non-sensitive account summary & preference completion state (never raw PII/IDs).",
        category="identity_safe",
        allowed_sources=("user_preference", "transactional", "unknown"),
        expiration_policy="365_days_sliding",
        default_ttl_days=365,
        requires_explicit_consent=False,
        allow_behavioral_inference=False,
        pii_sensitive=False,
        safe_for_ai_prompt=False,
    ),
    DimensionSpec(
        index=2,
        key="location_context",
        display_name="Location Context",
        description="Explicitly consented home city and departure origin (never continuously tracked).",
        category="identity_safe",
        allowed_sources=("user_preference", "unknown"),
        expiration_policy="180_days_sliding",
        default_ttl_days=180,
        requires_explicit_consent=True,
        allow_behavioral_inference=False,
        pii_sensitive=True,
        safe_for_ai_prompt=False,
    ),
    DimensionSpec(
        index=3,
        key="destination_interest",
        display_name="Destination Interest",
        description="Time-decayed destination interest scores and explicit favorite destinations.",
        category="travel_intent",
        allowed_sources=("user_preference", "behavioral", "transactional", "unknown"),
        expiration_policy="90_days_sliding",
        default_ttl_days=90,
        requires_explicit_consent=False,
        allow_behavioral_inference=True,
        pii_sensitive=False,
        safe_for_ai_prompt=True,
    ),
    DimensionSpec(
        index=4,
        key="search_behavior",
        display_name="Search Behavior",
        description="Recent search velocity, repeated routes, abandoned searches, and filter patterns.",
        category="travel_intent",
        allowed_sources=("behavioral", "unknown"),
        expiration_policy="30_days_sliding",
        default_ttl_days=30,
        requires_explicit_consent=False,
        allow_behavioral_inference=True,
        pii_sensitive=False,
        safe_for_ai_prompt=True,
    ),
    DimensionSpec(
        index=5,
        key="travel_frequency",
        display_name="Travel Frequency",
        description="Travel cadence derived solely from actual bookings/trips or explicit user input (never account age).",
        category="travel_intent",
        allowed_sources=("user_preference", "transactional", "unknown"),
        expiration_policy="365_days_sliding",
        default_ttl_days=365,
        requires_explicit_consent=False,
        allow_behavioral_inference=False,
        pii_sensitive=False,
        safe_for_ai_prompt=True,
    ),
    DimensionSpec(
        index=6,
        key="budget_profile",
        display_name="Budget Profile",
        description="Travel spend tier (budget, economy, mid_range, premium, luxury, flexible).",
        category="preferences",
        allowed_sources=("user_preference", "transactional", "behavioral", "unknown"),
        expiration_policy="180_days_sliding",
        default_ttl_days=180,
        requires_explicit_consent=False,
        allow_behavioral_inference=True,
        pii_sensitive=False,
        safe_for_ai_prompt=True,
    ),
    DimensionSpec(
        index=7,
        key="travel_style",
        display_name="Travel Style",
        description="Traveler companion & vibe preferences (family, couple, adventure, relaxation, etc.; religious only if user-selected).",
        category="preferences",
        allowed_sources=("user_preference", "behavioral", "transactional", "unknown"),
        expiration_policy="180_days_sliding",
        default_ttl_days=180,
        requires_explicit_consent=False,
        allow_behavioral_inference=True,
        pii_sensitive=False,
        safe_for_ai_prompt=True,
    ),
    DimensionSpec(
        index=8,
        key="transport_preference",
        display_name="Transport Preference",
        description="Preferred transport modes (flight, train, bus, launch, private_vehicle, mixed).",
        category="preferences",
        allowed_sources=("user_preference", "transactional", "behavioral", "unknown"),
        expiration_policy="180_days_sliding",
        default_ttl_days=180,
        requires_explicit_consent=False,
        allow_behavioral_inference=True,
        pii_sensitive=False,
        safe_for_ai_prompt=True,
    ),
    DimensionSpec(
        index=9,
        key="accommodation_preference",
        display_name="Accommodation Preference",
        description="Preferred stay types and amenities (resort, family_hotel, eco_stay, breakfast, pool, etc.).",
        category="preferences",
        allowed_sources=("user_preference", "transactional", "behavioral", "unknown"),
        expiration_policy="180_days_sliding",
        default_ttl_days=180,
        requires_explicit_consent=False,
        allow_behavioral_inference=True,
        pii_sensitive=False,
        safe_for_ai_prompt=True,
    ),
    DimensionSpec(
        index=10,
        key="time_preference",
        display_name="Time Preference",
        description="Preferred send windows, timezone, quiet hours, and observed active hours.",
        category="engagement",
        allowed_sources=("user_preference", "behavioral", "unknown"),
        expiration_policy="120_days_sliding",
        default_ttl_days=120,
        requires_explicit_consent=False,
        allow_behavioral_inference=True,
        pii_sensitive=False,
        safe_for_ai_prompt=False,
    ),
    DimensionSpec(
        index=11,
        key="activity_level",
        display_name="Activity Level",
        description="Platform engagement lifecycle stage (new_user, active, highly_active, returning, inactive, dormant, reactivated).",
        category="engagement",
        allowed_sources=("behavioral", "transactional", "unknown"),
        expiration_policy="30_days_sliding",
        default_ttl_days=30,
        requires_explicit_consent=False,
        allow_behavioral_inference=True,
        pii_sensitive=False,
        safe_for_ai_prompt=False,
    ),
    DimensionSpec(
        index=12,
        key="engagement_behavior",
        display_name="Engagement Behavior",
        description="Category-level notification open, click, dismiss, ignore, and CTA completion telemetry.",
        category="engagement",
        allowed_sources=("behavioral", "unknown"),
        expiration_policy="90_days_sliding",
        default_ttl_days=90,
        requires_explicit_consent=False,
        allow_behavioral_inference=True,
        pii_sensitive=False,
        safe_for_ai_prompt=False,
    ),
    DimensionSpec(
        index=13,
        key="notification_tolerance",
        display_name="Notification Tolerance",
        description="Fatigue levels, cooldown state, and frequency cap tolerance across categories.",
        category="engagement",
        allowed_sources=("user_preference", "behavioral", "unknown"),
        expiration_policy="30_days_sliding",
        default_ttl_days=30,
        requires_explicit_consent=False,
        allow_behavioral_inference=True,
        pii_sensitive=False,
        safe_for_ai_prompt=False,
    ),
    DimensionSpec(
        index=14,
        key="language_communication_style",
        display_name="Language & Communication Style",
        description="Preferred language (en/bn), communication tone, and digest cadence.",
        category="preferences",
        allowed_sources=("user_preference", "unknown"),
        expiration_policy="none",
        default_ttl_days=None,
        requires_explicit_consent=False,
        allow_behavioral_inference=False,
        pii_sensitive=False,
        safe_for_ai_prompt=True,
    ),
    DimensionSpec(
        index=15,
        key="price_sensitivity",
        display_name="Price Sensitivity",
        description="Deal/discount responsiveness, price alert subscriptions, and price-filter ratio.",
        category="preferences",
        allowed_sources=("user_preference", "behavioral", "transactional", "unknown"),
        expiration_policy="90_days_sliding",
        default_ttl_days=90,
        requires_explicit_consent=False,
        allow_behavioral_inference=True,
        pii_sensitive=False,
        safe_for_ai_prompt=True,
    ),
    DimensionSpec(
        index=16,
        key="travel_timeline",
        display_name="Travel Timeline",
        description="Current 10-stage trip lifecycle state from no_planned_trip to post_trip.",
        category="context",
        allowed_sources=("transactional", "behavioral", "contextual", "unknown"),
        expiration_policy="14_days_sliding",
        default_ttl_days=14,
        requires_explicit_consent=False,
        allow_behavioral_inference=True,
        pii_sensitive=False,
        safe_for_ai_prompt=True,
    ),
    DimensionSpec(
        index=17,
        key="loyalty_engagement_tier",
        display_name="Loyalty & Engagement Tier",
        description="Verified ShopnoJatra loyalty tier and points standing.",
        category="identity_safe",
        allowed_sources=("transactional", "unknown"),
        expiration_policy="180_days_sliding",
        default_ttl_days=180,
        requires_explicit_consent=False,
        allow_behavioral_inference=False,
        pii_sensitive=False,
        safe_for_ai_prompt=True,
    ),
    DimensionSpec(
        index=18,
        key="contextual_travel_conditions",
        display_name="Contextual Travel Conditions",
        description="Verified non-expired external context (weather, season, advisories, price trends).",
        category="context",
        allowed_sources=("contextual", "unknown"),
        expiration_policy="external_ttl",
        default_ttl_days=3,
        requires_explicit_consent=False,
        allow_behavioral_inference=False,
        pii_sensitive=False,
        safe_for_ai_prompt=True,
    ),
    DimensionSpec(
        index=19,
        key="consent_communication_preferences",
        display_name="Consent & Communication Preferences",
        description="Server-side consent flags for personalization, marketing, channels, and categories.",
        category="governance",
        allowed_sources=("user_preference", "unknown"),
        expiration_policy="none",
        default_ttl_days=None,
        requires_explicit_consent=False,
        allow_behavioral_inference=False,
        pii_sensitive=False,
        safe_for_ai_prompt=False,
    ),
    DimensionSpec(
        index=20,
        key="personalization_confidence",
        display_name="Personalization Confidence",
        description="Aggregate data sufficiency & freshness score (0-100) governing generic vs light vs deep personalization.",
        category="governance",
        allowed_sources=("behavioral", "transactional", "user_preference", "contextual", "unknown"),
        expiration_policy="computed",
        default_ttl_days=30,
        requires_explicit_consent=False,
        allow_behavioral_inference=True,
        pii_sensitive=False,
        safe_for_ai_prompt=False,
    ),
)

DIMENSION_KEYS: Tuple[str, ...] = tuple(spec.key for spec in DIMENSION_SPECS)
DIMENSION_REGISTRY: Dict[str, DimensionSpec] = {spec.key: spec for spec in DIMENSION_SPECS}


def compute_data_quality(
    value: Any,
    confidence: float,
    source: str = "unknown",
    is_expired: bool = False,
) -> DataQuality:
    """Classify dimension data quality strictly from value presence, confidence, and freshness."""
    if is_expired or value is None or value == "unknown" or confidence <= 0.0:
        return "unknown"
    if isinstance(value, (dict, list)) and len(value) == 0:
        return "unknown"
    if source == "user_preference" and confidence >= 70.0:
        return "high"
    if confidence >= 75.0:
        return "high"
    if confidence >= 40.0:
        return "medium"
    return "low"


def compute_expires_at(
    dimension_key: str,
    reference_time: Optional[datetime] = None,
    ttl_days_override: Optional[int] = None,
) -> Optional[datetime]:
    """Compute UTC expiration timestamp from a dimension's expiration policy."""
    spec = DIMENSION_REGISTRY.get(dimension_key)
    ttl = ttl_days_override if ttl_days_override is not None else (spec.default_ttl_days if spec else None)
    if ttl is None or ttl <= 0:
        return None
    base = reference_time or datetime.now(timezone.utc)
    if base.tzinfo is None:
        base = base.replace(tzinfo=timezone.utc)
    return base.astimezone(timezone.utc) + timedelta(days=ttl)


def _contains_forbidden_key(key: str) -> bool:
    normalized = key.strip().lower().replace("-", "_").replace(" ", "_")
    return normalized in FORBIDDEN_SENSITIVE_ATTRIBUTES


def sanitize_dimension_value(
    dimension_key: str,
    value: Any,
    *,
    is_user_provided: bool = False,
    source: str = "unknown",
    permission_granted: bool = True,
) -> Tuple[Any, List[str]]:
    """
    Validate and sanitize a proposed dimension value against strict privacy rules.

    Returns `(sanitized_value, violation_reasons)`.
    - Never permits sensitive demographic attributes (religion, health, political affiliation, ethnicity)
      or raw identity/payment identifiers.
    - Allows religious travel tags ONLY inside `travel_style` when explicitly selected by the user.
    - Restricts `location_context` to consented non-coordinate fields (`home_city`, `travel_origin`, `country`).
    - Prevents deriving `travel_frequency` from account age.
    """
    violations: List[str] = []

    if dimension_key not in DIMENSION_REGISTRY:
        return "unknown", [f"Unknown dimension key: {dimension_key}"]

    if value is None or value == "unknown":
        return "unknown", violations

    if dimension_key == "location_context":
        if not permission_granted or not is_user_provided or source != "user_preference":
            violations.append("location_context requires explicit user consent and user-supplied origin/home city")
            return "unknown", violations
        if isinstance(value, dict):
            cleaned: Dict[str, Any] = {}
            for k, v in value.items():
                norm_k = str(k).strip().lower()
                if _contains_forbidden_key(norm_k) or norm_k not in CONSENTED_LOCATION_FIELDS:
                    violations.append(f"Disallowed location_context field '{k}' stripped")
                    continue
                if v is not None and str(v).strip():
                    cleaned[norm_k] = str(v).strip()
            return (cleaned if cleaned else "unknown"), violations
        violations.append("location_context must be a mapping of consented city/origin fields")
        return "unknown", violations

    if dimension_key == "travel_frequency" and isinstance(value, dict):
        if any(k in value for k in ("account_age", "account_age_days", "created_at", "account_created_at")):
            violations.append("travel_frequency must never be derived from account age")
        cleaned_freq = {
            k: v
            for k, v in value.items()
            if k not in {"account_age", "account_age_days", "created_at", "account_created_at"}
            and not _contains_forbidden_key(str(k))
        }
        return (cleaned_freq if cleaned_freq else "unknown"), violations

    if isinstance(value, dict):
        sanitized_dict: Dict[str, Any] = {}
        for k, v in value.items():
            k_str = str(k)
            if _contains_forbidden_key(k_str):
                violations.append(f"Forbidden sensitive demographic/PII field '{k_str}' stripped")
                continue
            if dimension_key == "travel_style" and isinstance(v, list):
                kept_items = []
                for item in v:
                    item_norm = str(item).strip().lower().replace("-", "_").replace(" ", "_")
                    if item_norm in RELIGIOUS_TRAVEL_TAGS and not (
                        is_user_provided and source == "user_preference"
                    ):
                        violations.append(
                            "Religious travel tag rejected because it was not explicitly provided by the user"
                        )
                        continue
                    if item_norm in FORBIDDEN_SENSITIVE_ATTRIBUTES:
                        violations.append(f"Forbidden sensitive tag '{item}' rejected")
                        continue
                    kept_items.append(item)
                sanitized_dict[k_str] = kept_items
            elif isinstance(v, list):
                kept_items = []
                for item in v:
                    item_norm = str(item).strip().lower().replace("-", "_").replace(" ", "_")
                    if item_norm in FORBIDDEN_SENSITIVE_ATTRIBUTES or item_norm in RELIGIOUS_TRAVEL_TAGS:
                        violations.append(f"Forbidden sensitive tag '{item}' rejected")
                        continue
                    kept_items.append(item)
                sanitized_dict[k_str] = kept_items
            elif isinstance(v, str):
                val_norm = v.strip().lower().replace("-", "_").replace(" ", "_")
                if val_norm in FORBIDDEN_SENSITIVE_ATTRIBUTES:
                    violations.append(f"Forbidden sensitive value '{v}' stripped")
                    continue
                if val_norm in RELIGIOUS_TRAVEL_TAGS and not (
                    dimension_key == "travel_style" and is_user_provided and source == "user_preference"
                ):
                    violations.append("Religious travel attribute cannot be inferred")
                    continue
                sanitized_dict[k_str] = v
            elif isinstance(v, dict):
                nested, nested_violations = sanitize_dimension_value(
                    dimension_key,
                    v,
                    is_user_provided=is_user_provided,
                    source=source,
                    permission_granted=permission_granted,
                )
                violations.extend(nested_violations)
                if nested != "unknown":
                    sanitized_dict[k_str] = nested
            else:
                sanitized_dict[k_str] = v

        # Prevent empty styles payload after stripping forbidden tags
        if dimension_key == "travel_style" and not sanitized_dict.get("styles") and not sanitized_dict.get("interests"):
            return "unknown", violations
        return (sanitized_dict if sanitized_dict else "unknown"), violations

    if isinstance(value, list):
        kept_list = []
        for item in value:
            item_norm = str(item).strip().lower().replace(" ", "_")
            if item_norm in FORBIDDEN_SENSITIVE_ATTRIBUTES:
                violations.append(f"Forbidden sensitive tag '{item}' rejected")
                continue
            if item_norm in RELIGIOUS_TRAVEL_TAGS:
                if dimension_key == "travel_style" and is_user_provided and source == "user_preference":
                    kept_list.append(item)
                else:
                    violations.append("Religious travel attribute cannot be inferred")
                continue
            kept_list.append(item)
        return (kept_list if kept_list else "unknown"), violations

    if isinstance(value, str):
        norm_val = value.strip().lower().replace(" ", "_")
        if norm_val in FORBIDDEN_SENSITIVE_ATTRIBUTES:
            violations.append(f"Forbidden sensitive value '{value}' rejected")
            return "unknown", violations
        if norm_val in RELIGIOUS_TRAVEL_TAGS and not (
            dimension_key == "travel_style" and is_user_provided and source == "user_preference"
        ):
            violations.append("Religious travel attribute cannot be inferred")
            return "unknown", violations

    return value, violations


class DimensionValue(BaseModel):
    """Canonical representation of one of the 20 personalization dimensions."""

    dimension_key: str
    value: Any = "unknown"
    confidence: float = Field(default=0.0, ge=0.0, le=100.0)
    source: DimensionSource = "unknown"
    updated_at: Optional[datetime] = None
    data_quality: DataQuality = "unknown"
    expiration_policy: str = "none"
    expires_at: Optional[datetime] = None
    is_user_provided: bool = False
    permission_granted: bool = True

    @field_validator("dimension_key")
    @classmethod
    def validate_dimension_key(cls, v: str) -> str:
        if v not in DIMENSION_REGISTRY:
            raise ValueError(f"Invalid personalization dimension key: '{v}'")
        return v

    @field_validator("confidence", mode="before")
    @classmethod
    def clamp_confidence(cls, v: Any) -> float:
        try:
            num = float(v)
        except (TypeError, ValueError):
            return 0.0
        return round(max(0.0, min(100.0, num)), 2)

    @field_validator("updated_at", "expires_at")
    @classmethod
    def normalize_utc(cls, v: Optional[datetime]) -> Optional[datetime]:
        if v is None:
            return None
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v.astimezone(timezone.utc)

    def is_unknown(self) -> bool:
        if self.value is None or self.value == "unknown":
            return True
        if isinstance(self.value, (dict, list)) and len(self.value) == 0:
            return True
        return self.confidence <= 0.0

    def is_expired(self, now: Optional[datetime] = None) -> bool:
        if self.expires_at is None:
            return False
        ref = now or datetime.now(timezone.utc)
        if ref.tzinfo is None:
            ref = ref.replace(tzinfo=timezone.utc)
        return ref >= self.expires_at

    def effective_confidence(self, now: Optional[datetime] = None) -> float:
        if not self.permission_granted or self.is_unknown() or self.is_expired(now):
            return 0.0
        return self.confidence

    def to_safe_summary(self, now: Optional[datetime] = None) -> Dict[str, Any]:
        """Return an auditable, PII-safe summary of this dimension."""
        spec = DIMENSION_REGISTRY[self.dimension_key]
        expired = self.is_expired(now)
        safe_val: Any = "unknown"
        if not expired and self.permission_granted and not self.is_unknown():
            if spec.pii_sensitive and isinstance(self.value, dict):
                # Only expose city/country level consented summary, never fine-grained identifiers
                safe_val = {
                    k: v
                    for k, v in self.value.items()
                    if k in CONSENTED_LOCATION_FIELDS
                }
            else:
                safe_val = self.value

        eff_conf = self.effective_confidence(now)
        return {
            "dimension_key": self.dimension_key,
            "display_name": spec.display_name,
            "value": safe_val,
            "confidence": eff_conf,
            "source": "unknown" if eff_conf == 0.0 else self.source,
            "data_quality": compute_data_quality(safe_val, eff_conf, self.source, is_expired=expired),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "expiration_policy": self.expiration_policy,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "is_expired": expired,
            "is_user_provided": self.is_user_provided,
            "permission_granted": self.permission_granted,
        }


def make_unknown_dimension(
    dimension_key: str,
    *,
    permission_granted: Optional[bool] = None,
) -> DimensionValue:
    """Create a canonical 'unknown' dimension placeholder with confidence 0."""
    spec = DIMENSION_REGISTRY[dimension_key]
    perm = (not spec.requires_explicit_consent) if permission_granted is None else permission_granted
    return DimensionValue(
        dimension_key=dimension_key,
        value="unknown",
        confidence=0.0,
        source="unknown",
        updated_at=None,
        data_quality="unknown",
        expiration_policy=spec.expiration_policy,
        expires_at=None,
        is_user_provided=False,
        permission_granted=perm,
    )


def build_empty_dimensions_map(
    *,
    personalization_enabled: bool = True,
    location_consent: bool = False,
) -> Dict[str, DimensionValue]:
    """Initialize all 20 canonical dimensions cleanly as 'unknown'."""
    dims: Dict[str, DimensionValue] = {}
    for spec in DIMENSION_SPECS:
        if spec.key == "location_context":
            perm = location_consent
        elif spec.category in {"travel_intent", "preferences", "engagement", "context"}:
            perm = personalization_enabled or spec.key in {
                "language_communication_style",
                "consent_communication_preferences",
            }
        else:
            perm = True
        dims[spec.key] = make_unknown_dimension(spec.key, permission_granted=perm)
    return dims


class UserProfile20DSnapshot(BaseModel):
    """
    Complete, in-memory 20-dimensional user intelligence snapshot used by
    RelevanceEngine, TravelContextEngine, FatigueEngine, ChannelSelector,
    AdaptiveTimingEngine, NotificationDecisionPipeline, and Admin Explorer.
    """

    user_id: uuid.UUID
    profile_version: int = 1
    personalization_enabled: bool = True
    dimensions: Dict[str, DimensionValue] = Field(default_factory=dict)
    destination_interests: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    category_engagement: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    fatigue_by_category: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    active_trip_context: Dict[str, Any] = Field(default_factory=dict)
    explicit_preferences: Dict[str, Any] = Field(default_factory=dict)
    preferred_language: str = "en"
    communication_tone: str = "friendly"
    digest_frequency: str = "weekly"
    activity_level: str = "new_user"
    travel_timeline_stage: str = "no_planned_trip"
    loyalty_tier: str = "explorer"
    overall_confidence: float = 0.0
    built_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def model_post_init(self, __context: Any) -> None:
        # Ensure all 20 canonical dimensions are always present without inventing values.
        for spec in DIMENSION_SPECS:
            if spec.key not in self.dimensions:
                perm = False if spec.key == "location_context" else True
                self.dimensions[spec.key] = make_unknown_dimension(spec.key, permission_granted=perm)

    def get_dimension(self, key: str) -> DimensionValue:
        if key not in DIMENSION_REGISTRY:
            raise KeyError(f"Unknown personalization dimension '{key}'")
        return self.dimensions[key]

    def get_value(self, key: str, default: Any = "unknown", now: Optional[datetime] = None) -> Any:
        dim = self.get_dimension(key)
        if not dim.permission_granted or dim.is_unknown() or dim.is_expired(now):
            return default
        return dim.value

    def get_confidence(self, key: str, now: Optional[datetime] = None) -> float:
        return self.get_dimension(key).effective_confidence(now)

    def is_dimension_known(self, key: str, now: Optional[datetime] = None) -> bool:
        return self.get_confidence(key, now) > 0.0

    def populated_dimension_count(self, now: Optional[datetime] = None) -> int:
        return sum(
            1
            for key in DIMENSION_KEYS
            if key != "personalization_confidence" and self.is_dimension_known(key, now)
        )

    def confidence_tier(self) -> Literal["low", "medium", "high"]:
        if self.overall_confidence > 70.0:
            return "high"
        if self.overall_confidence >= 35.0:
            return "medium"
        return "low"

    def top_destinations(self, limit: int = 5) -> List[Dict[str, Any]]:
        ranked = sorted(
            self.destination_interests.items(),
            key=lambda item: (
                bool(item[1].get("is_explicit_favorite", False)),
                float(item[1].get("score", 0.0)),
                float(item[1].get("confidence", 0.0)),
            ),
            reverse=True,
        )
        return [
            {"destination": dest, **data}
            for dest, data in ranked[:limit]
            if float(data.get("score", 0.0)) > 0.0 or data.get("is_explicit_favorite")
        ]

    def to_safe_dimensions_dict(self, now: Optional[datetime] = None) -> Dict[str, Dict[str, Any]]:
        return {
            key: self.dimensions[key].to_safe_summary(now)
            for key in DIMENSION_KEYS
        }
