"""
Pydantic v2 Schemas for Hyper-Personalized Notification Intelligence.
Covers 20-Dimensional User Profile, Behavioral Signals, Preference Controls,
Decision Pipeline Preview & Explainability, Rules Versioning, Dynamic Segments,
Fatigue Controls, A/B Experiments, Personalized Inbox, Outbox & DLQ Operations.
"""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ============================================================================
# Canonical Enums / Literals & Privacy Constants
# ============================================================================

LanguageCode = Literal["en", "bn"]
CommunicationTone = Literal["concise", "informative", "friendly", "formal"]
DigestFrequency = Literal["daily", "weekly", "disabled"]
DimensionSource = Literal[
    "user_preference", "behavioral", "transactional", "contextual", "unknown"
]
DataQuality = Literal["high", "medium", "low", "unknown"]
PersonalizationTier = Literal["generic", "light", "deep", "suppressed"]
ChannelType = Literal["push", "in_app", "email", "sms", "webhook"]
InteractionType = Literal[
    "opened", "clicked", "dismissed", "ignored", "cta_completed", "converted"
]
PreferredSendWindow = Literal[
    "morning", "afternoon", "evening", "late_evening", "flexible"
]
BudgetTier = Literal[
    "budget", "economy", "mid_range", "premium", "luxury", "flexible", "unknown"
]

CANONICAL_DIMENSION_KEYS: tuple[str, ...] = (
    "profile_context",
    "location_context",
    "destination_interest",
    "search_behavior",
    "travel_frequency",
    "budget_profile",
    "travel_style",
    "transport_preference",
    "accommodation_preference",
    "time_preference",
    "activity_level",
    "engagement_behavior",
    "notification_tolerance",
    "language_communication_style",
    "price_sensitivity",
    "travel_timeline",
    "loyalty_engagement_tier",
    "contextual_travel_conditions",
    "consent_communication_preferences",
    "personalization_confidence",
)

FORBIDDEN_SENSITIVE_KEYS: frozenset[str] = frozenset(
    {
        "religion",
        "religious_affiliation",
        "faith",
        "sect",
        "denomination",
        "health",
        "medical",
        "medical_condition",
        "disability",
        "diagnosis",
        "political_affiliation",
        "politics",
        "political_party",
        "ethnicity",
        "race",
        "caste",
        "tribe",
        "sexual_orientation",
        "biometric",
        "nid",
        "national_id",
        "passport_number",
        "ssn",
        "tin",
        "bank_account",
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

AUTOMATION_KEYS: tuple[str, ...] = ("A", "B", "C", "D", "E", "F", "G", "H", "I", "J")


def _assert_no_sensitive_keys(obj: Any, path: str = "") -> None:
    """Rejects forbidden sensitive demographic keys in user-supplied dicts."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            key_norm = str(k).strip().lower()
            if key_norm in FORBIDDEN_SENSITIVE_KEYS:
                raise ValueError(
                    f"Sensitive attribute '{k}' is prohibited in personalization data."
                )
            _assert_no_sensitive_keys(v, f"{path}.{key_norm}" if path else key_norm)
    elif isinstance(obj, list):
        for idx, item in enumerate(obj):
            _assert_no_sensitive_keys(item, f"{path}[{idx}]")


# ============================================================================
# 1. 20-Dimensional Profile & Preferences Schemas
# ============================================================================

class DimensionEntry(BaseModel):
    """Single personalization dimension entry with provenance, confidence, and expiry."""
    model_config = ConfigDict(from_attributes=True)

    dimension_key: str = Field(..., min_length=2, max_length=80)
    display_name: Optional[str] = None
    value: Any = Field(default="unknown")
    confidence: float = Field(0.0, ge=0.0, le=100.0)
    source: DimensionSource = "unknown"
    updated_at: Optional[datetime] = None
    data_quality: DataQuality = "unknown"
    expiration_policy: Optional[str] = None
    expires_at: Optional[datetime] = None
    is_expired: bool = False
    is_user_provided: bool = False
    permission_granted: bool = True
    metadata: Dict[str, Any] = Field(default_factory=dict)


class DestinationInterestItem(BaseModel):
    """Time-decayed destination interest summary."""
    model_config = ConfigDict(from_attributes=True)

    destination: str
    score: float = Field(..., ge=0.0, le=100.0)
    confidence: float = Field(..., ge=0.0, le=100.0)
    signal_count: int = Field(0, ge=0)
    search_count: int = Field(0, ge=0)
    booking_count: int = Field(0, ge=0)
    is_explicit_favorite: bool = False
    last_signal_at: Optional[datetime] = None


class PersonalizationProfileResponse(BaseModel):
    """Full 20-dimensional personalization snapshot safe for user/admin inspection."""
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    profile_version: int = Field(1, ge=1)
    personalization_enabled: bool = True
    preferred_language: LanguageCode = "en"
    communication_tone: CommunicationTone = "friendly"
    digest_frequency: DigestFrequency = "weekly"
    home_city: Optional[str] = None
    travel_origin: Optional[str] = None
    location_consent: bool = False
    travel_timeline_stage: str = "no_planned_trip"
    loyalty_tier: str = "explorer"
    activity_level: str = "new_user"
    overall_confidence: float = Field(0.0, ge=0.0, le=100.0)
    confidence_tier: Literal["low", "medium", "high"] = "low"
    dimensions: Dict[str, DimensionEntry] = Field(default_factory=dict)
    top_destinations: List[DestinationInterestItem] = Field(default_factory=list)
    explicit_preferences: Dict[str, Any] = Field(default_factory=dict)
    explanation_summary: List[str] = Field(default_factory=list)
    last_activity_at: Optional[datetime] = None
    last_aggregated_at: Optional[datetime] = None
    reset_at: Optional[datetime] = None


class NotificationPreferenceSummary(BaseModel):
    """Channel, category, and quiet-hours consent settings."""
    model_config = ConfigDict(from_attributes=True)

    push_enabled: bool = True
    email_enabled: bool = True
    sms_enabled: bool = True
    in_app_enabled: bool = True
    category_booking: bool = True
    category_security: bool = True
    category_flight_alerts: bool = True
    category_marketing: bool = True
    category_community: bool = True
    category_price_alerts: bool = True
    quiet_hours_enabled: bool = False
    quiet_hours_start: str = "22:00"
    quiet_hours_end: str = "07:00"
    timezone: str = "Asia/Dhaka"
    frequency_cap_marketing_per_day: int = Field(3, ge=0, le=50)


class PreferenceResponse(BaseModel):
    """Combined user personalization & notification preferences."""
    user_id: uuid.UUID
    personalization_enabled: bool = True
    preferred_language: LanguageCode = "en"
    communication_tone: CommunicationTone = "friendly"
    digest_frequency: DigestFrequency = "weekly"
    preferred_send_window: PreferredSendWindow = "flexible"
    home_city: Optional[str] = None
    travel_origin: Optional[str] = None
    location_consent: bool = False
    favorite_destinations: List[str] = Field(default_factory=list)
    travel_interests: List[str] = Field(default_factory=list)
    travel_styles: List[str] = Field(default_factory=list)
    preferred_transport: List[str] = Field(default_factory=list)
    preferred_accommodation: List[str] = Field(default_factory=list)
    preferred_amenities: List[str] = Field(default_factory=list)
    budget_tier: BudgetTier = "flexible"
    price_sensitivity_level: Optional[Literal["low", "medium", "high"]] = None
    notification_preferences: NotificationPreferenceSummary = Field(
        default_factory=NotificationPreferenceSummary
    )
    updated_at: Optional[datetime] = None


class PreferenceUpdateRequest(BaseModel):
    """Explicit user travel & notification preference update (always overrides inference)."""
    personalization_enabled: Optional[bool] = None
    preferred_language: Optional[LanguageCode] = None
    communication_tone: Optional[CommunicationTone] = None
    digest_frequency: Optional[DigestFrequency] = None
    preferred_send_window: Optional[PreferredSendWindow] = None
    home_city: Optional[str] = Field(None, max_length=100)
    travel_origin: Optional[str] = Field(None, max_length=100)
    location_consent: Optional[bool] = None
    favorite_destinations: Optional[List[str]] = Field(None, max_length=25)
    travel_interests: Optional[List[str]] = Field(None, max_length=25)
    travel_styles: Optional[List[str]] = Field(None, max_length=20)
    preferred_transport: Optional[List[str]] = Field(None, max_length=10)
    preferred_accommodation: Optional[List[str]] = Field(None, max_length=15)
    preferred_amenities: Optional[List[str]] = Field(None, max_length=25)
    budget_tier: Optional[BudgetTier] = None
    price_sensitivity_level: Optional[Literal["low", "medium", "high"]] = None

    # Channel & category toggles (synced to notification_user_preferences)
    push_enabled: Optional[bool] = None
    email_enabled: Optional[bool] = None
    sms_enabled: Optional[bool] = None
    in_app_enabled: Optional[bool] = None
    category_booking: Optional[bool] = None
    category_security: Optional[bool] = None
    category_flight_alerts: Optional[bool] = None
    category_marketing: Optional[bool] = None
    category_community: Optional[bool] = None
    category_price_alerts: Optional[bool] = None
    quiet_hours_enabled: Optional[bool] = None
    quiet_hours_start: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    quiet_hours_end: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    timezone: Optional[str] = Field(None, max_length=50)
    frequency_cap_marketing_per_day: Optional[int] = Field(None, ge=0, le=50)
    extra_preferences: Optional[Dict[str, Any]] = None

    @field_validator("extra_preferences")
    @classmethod
    def validate_no_sensitive_extras(
        cls, v: Optional[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        if v is not None:
            _assert_no_sensitive_keys(v)
        return v

    @model_validator(mode="after")
    def validate_location_consent_rule(self) -> "PreferenceUpdateRequest":
        if self.location_consent is False and (
            self.home_city is not None or self.travel_origin is not None
        ):
            raise ValueError(
                "Cannot store home_city or travel_origin while location_consent is False."
            )
        return self


class ProfileCorrectionRequest(BaseModel):
    """User correction or removal of an inferred personalization dimension."""
    dimension_key: str = Field(..., min_length=2, max_length=80)
    action: Literal["set", "remove"] = "set"
    corrected_value: Optional[Any] = None
    reason: Optional[str] = Field(None, max_length=300)

    @field_validator("dimension_key")
    @classmethod
    def validate_dimension_key(cls, v: str) -> str:
        key = v.strip()
        if key not in CANONICAL_DIMENSION_KEYS:
            raise ValueError(f"Unknown personalization dimension '{key}'.")
        return key

    @field_validator("corrected_value")
    @classmethod
    def validate_safe_corrected_value(cls, v: Any) -> Any:
        if v is not None:
            _assert_no_sensitive_keys(v)
        return v

    @model_validator(mode="after")
    def validate_action_value(self) -> "ProfileCorrectionRequest":
        if self.action == "set" and self.corrected_value is None:
            raise ValueError("corrected_value is required when action is 'set'.")
        return self


class OptOutRequest(BaseModel):
    """Granular opt-out request for personalization or specific notification categories."""
    scope: Literal["all_marketing", "personalization", "category", "channel"] = (
        "all_marketing"
    )
    target: Optional[str] = Field(
        None,
        max_length=60,
        description="Category or channel name when scope is 'category' or 'channel'",
    )
    reason: Optional[str] = Field(None, max_length=300)


class OptOutResponse(BaseModel):
    success: bool = True
    user_id: uuid.UUID
    scope: str
    target: Optional[str] = None
    personalization_enabled: bool
    category_marketing: bool
    message: str


class ProfileLifecycleResponse(BaseModel):
    success: bool = True
    user_id: uuid.UUID
    action: Literal["reset", "deleted"]
    profile_version: Optional[int] = None
    cleared_records: int = 0
    message: str


# ============================================================================
# 2. Behavioral Signal Schemas
# ============================================================================

AllowedSignalType = Literal[
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
    "notification_ignore",
    "notification_cta_completed",
    "notification_conversion",
    "dismissal",
    "ignored",
    "cta_completed",
    "converted",
    "opt_out",
]


class BehavioralSignalCreate(BaseModel):
    """Permitted behavioral signal event for incremental profile scoring."""
    signal_type: AllowedSignalType
    category: Optional[str] = Field(None, max_length=60)
    destination: Optional[str] = Field(None, max_length=120)
    route_key: Optional[str] = Field(None, max_length=80)
    product_type: Optional[str] = Field(None, max_length=50)
    price_paisa: Optional[int] = Field(None, ge=0)
    currency: str = Field("BDT", min_length=3, max_length=8)
    filters: Dict[str, Any] = Field(default_factory=dict)
    occurred_at: Optional[datetime] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("filters", "metadata")
    @classmethod
    def validate_no_sensitive_payload(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        _assert_no_sensitive_keys(v)
        return v


class BehavioralSignalResponse(BaseModel):
    success: bool = True
    signal_id: Optional[uuid.UUID] = None
    recorded: bool
    profile_version: Optional[int] = None
    updated_dimensions: List[str] = Field(default_factory=list)
    message: str


# ============================================================================
# 3. User Inbox, Interactions & Explainability Schemas
# ============================================================================

class InboxNotificationItem(BaseModel):
    """Personalized notification item in the user's in-app inbox."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    message: str
    category: str = Field("system", description="Notification category / type")
    priority: str = "normal"
    is_read: bool = False
    read_at: Optional[datetime] = None
    channels: List[str] = Field(default_factory=lambda: ["in_app"])
    cta_label: Optional[str] = None
    deep_link: Optional[str] = None
    personalization_tier: Optional[PersonalizationTier] = None
    relevance_score: Optional[float] = Field(None, ge=0.0, le=100.0)
    confidence_score: Optional[float] = Field(None, ge=0.0, le=100.0)
    has_explanation: bool = False
    data: Dict[str, Any] = Field(default_factory=dict)
    expires_at: Optional[datetime] = None
    created_at: datetime


class InboxListResponse(BaseModel):
    items: List[InboxNotificationItem] = Field(default_factory=list)
    total: int = 0
    unread_count: int = 0
    page: int = 1
    page_size: int = 20
    total_pages: int = 1
    has_next: bool = False
    has_prev: bool = False


class InboxReadResponse(BaseModel):
    success: bool = True
    notification_id: uuid.UUID
    is_read: bool = True
    read_at: Optional[datetime] = None


class InboxReadAllResponse(BaseModel):
    success: bool = True
    marked_count: int = 0


class InboxInteractionRequest(BaseModel):
    """Records user engagement with a notification safely without feedback loops."""
    interaction_type: InteractionType
    channel: Optional[ChannelType] = "in_app"
    revenue_paisa: Optional[int] = Field(None, ge=0)
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("metadata")
    @classmethod
    def validate_metadata_safe(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        _assert_no_sensitive_keys(v)
        return v


class InboxInteractionResponse(BaseModel):
    success: bool = True
    notification_id: uuid.UUID
    interaction_type: InteractionType
    decision_logged: bool = False
    anti_feedback_loop_applied: bool = True
    message: str


class NotificationWhyResponse(BaseModel):
    """Safe, auditable 'Why am I seeing this?' explanation (never exposes AI CoT or PII)."""
    notification_id: uuid.UUID
    category: str
    personalization_tier: PersonalizationTier = "generic"
    relevance_score: Optional[float] = Field(None, ge=0.0, le=100.0)
    confidence_score: Optional[float] = Field(None, ge=0.0, le=100.0)
    summary: str
    explanation_factors: List[str] = Field(default_factory=list)
    matched_preferences: List[str] = Field(default_factory=list)
    can_adjust_preferences: bool = True
    can_opt_out_category: bool = True
    preferences_route: str = "/screens/travel-preferences"


class DeviceRegisterRequest(BaseModel):
    device_id: str = Field(..., min_length=2, max_length=100)
    push_token: str = Field(..., min_length=8, max_length=255)
    token_type: Literal["expo", "fcm", "apns", "web_push"] = "expo"
    platform: Literal["android", "ios", "web", "desktop"]
    device_name: Optional[str] = Field(None, max_length=100)
    os_version: Optional[str] = Field(None, max_length=50)
    app_version: Optional[str] = Field(None, max_length=50)

    @field_validator("device_id")
    @classmethod
    def validate_device_id(cls, v: str) -> str:
        cleaned = v.strip()
        if len(cleaned) < 2:
            raise ValueError("device_id must be at least 2 non-whitespace characters.")
        return cleaned

    @field_validator("push_token")
    @classmethod
    def validate_push_token(cls, v: str) -> str:
        from app.notifications.delivery.push import is_valid_push_token

        cleaned = v.strip()
        ok, err = is_valid_push_token(cleaned)
        if not ok:
            raise ValueError(err or "Invalid push token format.")
        return cleaned


class DeviceRegisterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    device_id: str
    token_type: str
    platform: str
    device_name: Optional[str] = None
    os_version: Optional[str] = None
    app_version: Optional[str] = None
    is_active: bool
    last_active_at: datetime


class DeviceListResponse(BaseModel):
    items: List[DeviceRegisterResponse] = Field(default_factory=list)
    total: int = 0


class DeviceDeactivateResponse(BaseModel):
    success: bool = True
    device_id: str
    is_active: bool = False
    message: str


# ============================================================================
# 4. Admin Outbox, DLQ & Personalized Broadcast Schemas
# ============================================================================

class OutboxItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    event_type: str
    aggregate_type: str
    aggregate_id: str
    status: str
    priority: int
    attempts: int
    max_attempts: int
    scheduled_at: datetime
    last_attempt_at: Optional[datetime] = None
    next_retry_at: Optional[datetime] = None
    error_message: Optional[str] = None
    last_error: Optional[str] = Field(default=None, validation_alias="error_message")
    processed_at: Optional[datetime] = None
    created_at: datetime


class OutboxListResponse(BaseModel):
    items: List[OutboxItemResponse] = Field(default_factory=list)
    total: int = 0
    total_count: int = 0
    page: int = 1
    page_size: int = 20
    status_counts: Dict[str, int] = Field(default_factory=dict)


class OutboxProcessResponse(BaseModel):
    success: bool = True
    processed_count: int = 0
    delivered_count: int = 0
    suppressed_count: int = 0
    rescheduled_count: int = 0
    failed_count: int = 0
    quarantined_count: int = 0


class DLQItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    outbox_id: Optional[uuid.UUID] = None
    outbox_event_id: Optional[uuid.UUID] = None
    event_id: uuid.UUID
    event_type: str
    channel: Optional[str] = None
    recipient: Optional[str] = None
    failure_reason: str
    exception_class: Optional[str] = None
    attempts: int
    resolution_status: str
    resolution_notes: Optional[str] = None
    resolved_by: Optional[uuid.UUID] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime
    failed_at: Optional[datetime] = Field(default=None, validation_alias="created_at")


class DLQListResponse(BaseModel):
    items: List[DLQItemResponse] = Field(default_factory=list)
    total: int = 0
    total_count: int = 0
    page: int = 1
    page_size: int = 20


class OutboxReplayResponse(BaseModel):
    success: bool = True
    dlq_id: uuid.UUID
    outbox_id: Optional[uuid.UUID] = None
    resolution_status: str
    message: str


class DLQDiscardRequest(BaseModel):
    resolution_notes: Optional[str] = Field(None, max_length=500)


class PersonalizedBroadcastRequest(BaseModel):
    """Admin broadcast evaluated per recipient through the 24-Step Decision Pipeline."""
    title: str = Field(..., min_length=2, max_length=200)
    message: str = Field(..., min_length=2, max_length=4000)
    category: str = Field("marketing", max_length=60)
    event_type: str = Field("system.campaign.broadcast", max_length=100)
    channel: Literal["push", "in_app", "email", "sms", "auto"] = "auto"
    segment_key: Optional[str] = Field(None, max_length=100)
    target_user_ids: Optional[List[uuid.UUID]] = None
    destination: Optional[str] = Field(None, max_length=120)
    travel_styles: List[str] = Field(default_factory=list)
    budget_tier: Optional[BudgetTier] = None
    transport_mode: Optional[str] = Field(None, max_length=40)
    cta_label: Optional[str] = Field(None, max_length=80)
    deep_link: str = Field("/(tabs)", max_length=300)
    priority: int = Field(3, ge=1, le=10)
    allow_ai_enrichment: bool = True
    verified_facts: Dict[str, Any] = Field(default_factory=dict)
    experiment_id: Optional[uuid.UUID] = None
    scheduled_for: Optional[datetime] = None


class BroadcastRecipientDecisionSummary(BaseModel):
    user_id: uuid.UUID
    eligibility_passed: bool
    suppression_reason: Optional[str] = None
    personalization_tier: PersonalizationTier
    relevance_score: float
    confidence_score: float
    selected_channel: Optional[str] = None
    scheduled_for: Optional[datetime] = None


class PersonalizedBroadcastResponse(BaseModel):
    success: bool = True
    campaign_id: Optional[uuid.UUID] = None
    total_candidates: int = 0
    approved_count: int = 0
    suppressed_count: int = 0
    rescheduled_count: int = 0
    dispatched_count: int = 0
    decisions_sample: List[BroadcastRecipientDecisionSummary] = Field(
        default_factory=list
    )


# ============================================================================
# 5. Admin Decision Preview ("PREVIEW ONLY — NEVER SENDS")
# ============================================================================

class DecisionPreviewRequest(BaseModel):
    """Dry-run decision & AI personalization preview request (never dispatches)."""
    user_id: Optional[uuid.UUID] = None
    persona_preset: Optional[
        Literal[
            "family_midrange",
            "budget_student",
            "premium_luxury",
            "adventure_solo",
            "inactive_dormant",
            "new_user",
            "deal_seeker",
            "fatigued_opted_out",
        ]
    ] = None
    event_type: str = Field("system.campaign.broadcast", max_length=100)
    category: str = Field("marketing", max_length=60)
    base_title: str = Field("Explore travel opportunities this month.", max_length=255)
    base_body: str = Field(
        "Discover seasonal travel ideas tailored to your journey.", max_length=4000
    )
    destination: Optional[str] = Field(None, max_length=120)
    travel_styles: List[str] = Field(default_factory=list)
    budget_tier: Optional[BudgetTier] = None
    transport_mode: Optional[str] = Field(None, max_length=40)
    price_paisa: Optional[int] = Field(None, ge=0)
    discount_pct: Optional[float] = Field(None, ge=0.0, le=95.0)
    deep_link: str = Field("/(tabs)", max_length=300)
    priority: int = Field(3, ge=1, le=10)
    language_override: Optional[LanguageCode] = None
    allow_ai_enrichment: bool = True
    verified_facts: Dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_target_present(self) -> "DecisionPreviewRequest":
        if self.user_id is None and self.persona_preset is None:
            self.persona_preset = "family_midrange"
        return self


class RenderedCopyVariant(BaseModel):
    language: LanguageCode
    tier: PersonalizationTier
    title: str
    body: str
    cta: Optional[str] = None
    deep_link: str
    push_short_title: Optional[str] = None
    push_short_body: Optional[str] = None


class DecisionPreviewResponse(BaseModel):
    """Dry-run evaluation output explicitly marked preview_only=True."""
    preview_only: bool = True
    dispatched: bool = False
    target_label: str
    eligibility_passed: bool
    suppression_reason: Optional[str] = None
    relevance_score: float = Field(..., ge=0.0, le=100.0)
    confidence_score: float = Field(..., ge=0.0, le=100.0)
    fatigue_score: float = Field(0.0, ge=0.0, le=100.0)
    personalization_tier: PersonalizationTier
    selected_channel: Optional[str] = None
    recommended_send_at: Optional[datetime] = None
    feature_breakdown: Dict[str, float] = Field(default_factory=dict)
    explanation_factors: List[str] = Field(default_factory=list)
    ai_used: bool = False
    ai_provider: str = "deterministic_template"
    fallback_used: bool = False
    factual_validation_passed: bool = True
    factual_validation_errors: List[str] = Field(default_factory=list)
    estimated_tokens: int = 0
    estimated_cost_usd: float = 0.0
    generic_variant: RenderedCopyVariant
    personalized_variant: RenderedCopyVariant
    bilingual_variants: Dict[str, RenderedCopyVariant] = Field(default_factory=dict)


# ============================================================================
# 6. Admin Rules, Weights & Rollback Schemas
# ============================================================================

DEFAULT_RELEVANCE_WEIGHTS: Dict[str, float] = {
    "DestinationInterest": 0.20,
    "TravelIntent": 0.15,
    "BudgetMatch": 0.12,
    "SearchRelevance": 0.10,
    "TravelStyleMatch": 0.10,
    "TransportMatch": 0.08,
    "EngagementMatch": 0.07,
    "TimingMatch": 0.07,
    "SeasonalityMatch": 0.06,
    "CategoryPreference": 0.05,
}


class RuleConfigSchema(BaseModel):
    """Versioned Personalization Rules & Relevance Weight Configuration."""
    model_config = ConfigDict(from_attributes=True)

    id: Optional[uuid.UUID] = None
    version: int = Field(1, ge=1)
    is_active: bool = True
    weights: Dict[str, float] = Field(
        default_factory=lambda: dict(DEFAULT_RELEVANCE_WEIGHTS)
    )
    dimension_configs: Dict[str, Any] = Field(default_factory=dict)
    timing_config: Dict[str, Any] = Field(default_factory=dict)
    fatigue_config: Dict[str, Any] = Field(default_factory=dict)
    ai_config: Dict[str, Any] = Field(default_factory=dict)
    decay_lambda: float = Field(0.08, ge=0.001, le=2.0)
    min_relevance_threshold: float = Field(45.0, ge=0.0, le=100.0)
    min_confidence_threshold: float = Field(30.0, ge=0.0, le=100.0)
    change_notes: Optional[str] = Field(None, max_length=500)
    created_by: Optional[uuid.UUID] = None
    created_at: Optional[datetime] = None

    @field_validator("weights")
    @classmethod
    def validate_weights_sum_to_one(cls, v: Dict[str, float]) -> Dict[str, float]:
        if not v:
            raise ValueError("Relevance weights dictionary cannot be empty.")
        for k, val in v.items():
            if val < 0.0 or val > 1.0:
                raise ValueError(f"Weight '{k}' must be between 0.0 and 1.0, got {val}.")
        total = sum(v.values())
        if abs(total - 1.0) > 1e-3:
            raise ValueError(
                f"Relevance weights must sum to 1.0 (got {total:.6f})."
            )
        return v


class RuleConfigUpdateRequest(BaseModel):
    """Payload to publish a new active PersonalizationRuleConfig version."""
    weights: Dict[str, float] = Field(default_factory=lambda: dict(DEFAULT_RELEVANCE_WEIGHTS))
    dimension_configs: Optional[Dict[str, Any]] = None
    timing_config: Optional[Dict[str, Any]] = None
    fatigue_config: Optional[Dict[str, Any]] = None
    ai_config: Optional[Dict[str, Any]] = None
    decay_lambda: float = Field(0.08, ge=0.001, le=2.0)
    min_relevance_threshold: float = Field(45.0, ge=0.0, le=100.0)
    min_confidence_threshold: float = Field(30.0, ge=0.0, le=100.0)
    change_notes: Optional[str] = Field(None, max_length=500)

    @field_validator("weights")
    @classmethod
    def validate_weights(cls, v: Dict[str, float]) -> Dict[str, float]:
        return RuleConfigSchema.validate_weights_sum_to_one(v)


class RulesListResponse(BaseModel):
    active_rule: RuleConfigSchema
    history: List[RuleConfigSchema] = Field(default_factory=list)


class RuleRollbackResponse(BaseModel):
    success: bool = True
    rolled_back_from_version: Optional[int] = None
    active_version: int
    active_rule: RuleConfigSchema
    message: str


# ============================================================================
# 7. Dynamic Segment Schemas
# ============================================================================

class SegmentCreateRequest(BaseModel):
    key: str = Field(..., min_length=2, max_length=100, pattern=r"^[a-z0-9_]+$")
    name: str = Field(..., min_length=2, max_length=150)
    description: Optional[str] = Field(None, max_length=500)
    query_criteria: Dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True

    @field_validator("query_criteria")
    @classmethod
    def validate_safe_criteria(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        _assert_no_sensitive_keys(v)
        return v


class SegmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[uuid.UUID] = None
    key: str
    name: str
    description: Optional[str] = None
    query_criteria: Dict[str, Any] = Field(default_factory=dict)
    is_system: bool = False
    is_active: bool = True
    cached_member_count: int = 0
    last_evaluated_at: Optional[datetime] = None


class SegmentMemberItem(BaseModel):
    user_id: uuid.UUID
    loyalty_tier: str = "explorer"
    activity_level: str = "new_user"
    travel_timeline_stage: str = "no_planned_trip"
    overall_confidence: float = 0.0
    preferred_language: LanguageCode = "en"


class SegmentMembersResponse(BaseModel):
    segment_key: str
    total: int
    total_count: int = 0
    page: int = 1
    page_size: int = 20
    members: List[SegmentMemberItem] = Field(default_factory=list)


# ============================================================================
# 8. Admin Overview, Dimension Explorer, Fatigue & Analytics Schemas
# ============================================================================

class PersonalizationOverviewResponse(BaseModel):
    total_profiles: int = 0
    profiles_sufficient_data: int = 0
    profiles_incomplete_data: int = 0
    personalization_enabled_count: int = 0
    total_decisions_24h: int = 0
    ai_assisted_count_24h: int = 0
    avg_relevance_score: float = 0.0
    avg_confidence_score: float = 0.0
    suppression_rate_pct: float = 0.0
    fatigue_distribution: Dict[str, int] = Field(default_factory=dict)
    conversion_count_30d: int = 0
    attributed_revenue_paisa_30d: int = 0
    active_rule_version: int = 1


class DimensionExplorerItem(BaseModel):
    dimension_key: str
    coverage_count: int = 0
    coverage_pct: float = 0.0
    avg_confidence: float = 0.0
    source_distribution: Dict[str, int] = Field(default_factory=dict)
    quality_distribution: Dict[str, int] = Field(default_factory=dict)
    user_provided_count: int = 0
    permission_granted_count: int = 0
    top_values_summary: Dict[str, int] = Field(default_factory=dict)
    last_updated_at: Optional[datetime] = None


class DimensionExplorerResponse(BaseModel):
    total_profiles: int = 0
    dimensions: List[DimensionExplorerItem] = Field(default_factory=list)


class FatigueUserCategoryItem(BaseModel):
    user_id: uuid.UUID
    category: str
    fatigue_score: float
    received_24h: int
    received_7d: int
    opened_7d: int
    clicked_7d: int
    dismissed_7d: int
    ignored_7d: int
    opt_out_count: int
    cooldown_until: Optional[datetime] = None
    last_sent_at: Optional[datetime] = None


class FatigueOverviewResponse(BaseModel):
    high_fatigue_users_count: int = 0
    users_exceeding_caps_count: int = 0
    avg_fatigue_score: float = 0.0
    global_daily_marketing_cap: int = 3
    high_fatigue_threshold: float = 65.0
    cooldown_hours: int = 24
    category_breakdown: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    high_fatigue_entries: List[FatigueUserCategoryItem] = Field(default_factory=list)


class FatigueControlsUpdateRequest(BaseModel):
    global_daily_marketing_cap: int = Field(..., ge=0, le=50)
    high_fatigue_threshold: float = Field(65.0, ge=20.0, le=100.0)
    cooldown_hours: int = Field(24, ge=1, le=168)
    prefer_digest_on_high_fatigue: bool = True
    change_notes: Optional[str] = Field(None, max_length=300)


class TierPerformanceMetrics(BaseModel):
    tier: str
    total_decisions: int = 0
    delivered_count: int = 0
    opened_count: int = 0
    clicked_count: int = 0
    converted_count: int = 0
    dismissed_count: int = 0
    suppressed_count: int = 0
    avg_relevance_score: float = 0.0
    avg_fatigue_score: float = 0.0
    open_rate_pct: float = 0.0
    ctr_pct: float = 0.0
    conversion_rate_pct: float = 0.0
    revenue_paisa: int = 0


class PerformanceAnalyticsResponse(BaseModel):
    window_days: int = 30
    tier_comparison: List[TierPerformanceMetrics] = Field(default_factory=list)
    channel_breakdown: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    total_suppressed: int = 0
    suppression_reasons: Dict[str, int] = Field(default_factory=dict)


# ============================================================================
# 9. A/B Experiment & Bounded Adaptive Learning Schemas
# ============================================================================

class ExperimentVariantSpec(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    weight: float = Field(0.5, gt=0.0, le=1.0)
    description: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)


class ExperimentCreateRequest(BaseModel):
    key: str = Field(..., min_length=2, max_length=100, pattern=r"^[a-z0-9_-]+$")
    name: str = Field(..., min_length=2, max_length=150)
    hypothesis: str = Field(..., min_length=5, max_length=1000)
    experiment_type: Literal[
        "generic_vs_personalized",
        "short_vs_detailed",
        "destination_vs_style",
        "timing",
        "cta",
        "channel",
    ]
    variants: List[ExperimentVariantSpec] = Field(..., min_length=2, max_length=5)
    min_sample_size: int = Field(100, ge=10, le=1000000)
    max_duration_days: int = Field(30, ge=1, le=180)
    opt_out_stop_threshold: float = Field(0.05, gt=0.0, le=0.5)
    target_categories: List[str] = Field(default_factory=lambda: ["marketing"])

    @field_validator("target_categories")
    @classmethod
    def forbid_critical_transactional_experiments(cls, v: List[str]) -> List[str]:
        forbidden = {"security", "booking", "payment", "sos", "disruption", "otp"}
        bad = [c for c in v if c.lower() in forbidden]
        if bad:
            raise ValueError(
                f"Experiments are prohibited on critical transactional/security categories: {bad}"
            )
        return v

    @model_validator(mode="after")
    def validate_variant_weights(self) -> "ExperimentCreateRequest":
        total = sum(var.weight for var in self.variants)
        if abs(total - 1.0) > 1e-3:
            raise ValueError(f"Experiment variant weights must sum to 1.0 (got {total:.4f}).")
        return self


class ExperimentVariantStats(BaseModel):
    variant: str
    exposures: int = 0
    opens: int = 0
    clicks: int = 0
    conversions: int = 0
    opt_outs: int = 0
    revenue_paisa: int = 0
    conversion_rate: float = 0.0
    ci_95_lower: float = 0.0
    ci_95_upper: float = 0.0


class ExperimentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    key: str
    name: str
    hypothesis: str
    experiment_type: str
    status: str
    variants: List[Dict[str, Any]] = Field(default_factory=list)
    min_sample_size: int
    max_duration_days: int
    opt_out_stop_threshold: float
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    results_summary: Dict[str, Any] = Field(default_factory=dict)
    variant_stats: List[ExperimentVariantStats] = Field(default_factory=list)
    recommended_weight_adjustments: Dict[str, float] = Field(default_factory=dict)
    created_at: datetime


class ExperimentStopRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=500)


# ============================================================================
# 10. Automation Evaluation Schemas (A-J)
# ============================================================================

class AutomationEvaluateRequest(BaseModel):
    user_ids: Optional[List[uuid.UUID]] = None
    limit: int = Field(50, ge=1, le=500)
    dry_run: bool = True
    context_overrides: Dict[str, Any] = Field(default_factory=dict)


class AutomationCandidateSummary(BaseModel):
    user_id: uuid.UUID
    automation_key: str
    event_type: str
    destination: Optional[str] = None
    title: str
    relevance_score: Optional[float] = None
    confidence_score: Optional[float] = None
    eligible: bool = True
    suppression_reason: Optional[str] = None


class AutomationEvaluateResponse(BaseModel):
    automation_key: str
    dry_run: bool
    evaluated_users: int = 0
    candidates_generated: int = 0
    staged_to_outbox: int = 0
    candidates: List[AutomationCandidateSummary] = Field(default_factory=list)


# ============================================================================
# 11. Notification Platform Admin Operations Schemas (Catalog, Rules, Templates,
#     Campaigns, Delivery Logs, Outbox Retry, Analytics, Provider Health)
# ============================================================================

NotificationChannelType = Literal["push", "in_app", "email", "sms", "webhook"]
NotificationRulePriority = Literal["critical", "high", "normal", "low"]
NotificationTemplateCategory = Literal[
    "booking",
    "payment",
    "flight",
    "flight_alerts",
    "price_alerts",
    "security",
    "marketing",
    "community",
    "hotel",
    "agency",
    "marketplace",
    "digest",
    "discovery",
    "system",
]
NotificationCampaignChannel = Literal["push", "in_app", "email", "sms", "all"]


class EventCatalogItem(BaseModel):
    event_type: str
    class_name: str
    domain: str
    aggregate_type: str
    default_priority: int
    category: str
    default_channels: List[str] = Field(default_factory=list)
    is_critical: bool = False
    bypass_quiet_hours: bool = False
    description: str = ""
    cloudevent_schema_version: str = "1.0"
    sample_payload: Dict[str, Any] = Field(default_factory=dict)


class EventCatalogListResponse(BaseModel):
    total: int = 0
    domains: List[str] = Field(default_factory=list)
    items: List[EventCatalogItem] = Field(default_factory=list)


class NotificationRuleCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    description: Optional[str] = Field(None, max_length=500)
    trigger_event: str = Field(..., min_length=1, max_length=100, pattern=r"^(\*|[a-z0-9_.*-]+)$")
    channels: List[NotificationChannelType] = Field(
        default_factory=lambda: ["in_app", "push"], min_length=1, max_length=5
    )
    template_id: Optional[uuid.UUID] = None
    conditions: Dict[str, Any] = Field(default_factory=dict)
    priority: NotificationRulePriority = "normal"
    bypass_quiet_hours: bool = False
    cooldown_seconds: int = Field(0, ge=0, le=604800)
    is_active: bool = True

    @field_validator("conditions")
    @classmethod
    def validate_rule_conditions(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        from app.notifications.rules.engine import validate_condition_tree

        _assert_no_sensitive_keys(v)
        validate_condition_tree(v)
        return v


class NotificationRuleUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=150)
    description: Optional[str] = Field(None, max_length=500)
    trigger_event: Optional[str] = Field(
        None, min_length=1, max_length=100, pattern=r"^(\*|[a-z0-9_.*-]+)$"
    )
    channels: Optional[List[NotificationChannelType]] = Field(None, min_length=1, max_length=5)
    template_id: Optional[uuid.UUID] = None
    conditions: Optional[Dict[str, Any]] = None
    priority: Optional[NotificationRulePriority] = None
    bypass_quiet_hours: Optional[bool] = None
    cooldown_seconds: Optional[int] = Field(None, ge=0, le=604800)
    is_active: Optional[bool] = None

    @field_validator("conditions")
    @classmethod
    def validate_rule_conditions(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if v is not None:
            from app.notifications.rules.engine import validate_condition_tree

            _assert_no_sensitive_keys(v)
            validate_condition_tree(v)
        return v


class NotificationRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: Optional[str] = None
    trigger_event: str
    channels: List[str] = Field(default_factory=list)
    template_id: Optional[uuid.UUID] = None
    conditions: Dict[str, Any] = Field(default_factory=dict)
    priority: str
    bypass_quiet_hours: bool
    cooldown_seconds: int
    is_active: bool
    created_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime


class NotificationRuleListResponse(BaseModel):
    items: List[NotificationRuleResponse] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 50


class NotificationPreferenceOverride(BaseModel):
    push_enabled: bool = True
    email_enabled: bool = True
    sms_enabled: bool = True
    in_app_enabled: bool = True
    category_booking: bool = True
    category_security: bool = True
    category_flight_alerts: bool = True
    category_marketing: bool = True
    category_community: bool = True
    category_price_alerts: bool = True
    quiet_hours_enabled: bool = False
    quiet_hours_start: str = Field("22:00", pattern=r"^\d{2}:\d{2}$")
    quiet_hours_end: str = Field("07:00", pattern=r"^\d{2}:\d{2}$")
    timezone: str = Field("Asia/Dhaka", max_length=50)
    frequency_cap_marketing_per_day: int = Field(3, ge=0, le=50)


class NotificationRuleTestRequest(BaseModel):
    event_type: str = Field("booking.confirmed", min_length=2, max_length=100)
    aggregate_type: str = Field("booking", min_length=2, max_length=50)
    aggregate_id: str = Field("dry-run-test-1", min_length=1, max_length=100)
    priority: int = Field(5, ge=1, le=10)
    payload: Dict[str, Any] = Field(default_factory=dict)
    user_id: Optional[uuid.UUID] = None
    rule_id: Optional[uuid.UUID] = None
    conditions_override: Optional[Dict[str, Any]] = None
    simulated_local_time: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    marketing_sent_today: int = Field(0, ge=0, le=100)
    preferences_override: Optional[NotificationPreferenceOverride] = None

    @field_validator("conditions_override")
    @classmethod
    def validate_conditions_override(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if v is not None:
            from app.notifications.rules.engine import validate_condition_tree

            _assert_no_sensitive_keys(v)
            validate_condition_tree(v)
        return v


class NotificationRuleTestResponse(BaseModel):
    dry_run: bool = True
    dispatched: bool = False
    event_type: str
    category: str
    is_critical: bool
    bypass_quiet_hours: bool
    eligible_channels: List[str] = Field(default_factory=list)
    suppressed_channels: Dict[str, str] = Field(default_factory=dict)
    suppressed_reasons: List[str] = Field(default_factory=list)
    is_suppressed: bool = False
    should_dispatch_now: bool = True
    scheduled_at: Optional[datetime] = None
    matched_rule_ids: List[uuid.UUID] = Field(default_factory=list)
    matched_rule_names: List[str] = Field(default_factory=list)
    condition_matched: Optional[bool] = None
    template_id: Optional[uuid.UUID] = None


class NotificationTemplateCreateRequest(BaseModel):
    code: str = Field(..., min_length=2, max_length=100, pattern=r"^[a-zA-Z0-9_.-]+$")
    name: str = Field(..., min_length=2, max_length=150)
    category: NotificationTemplateCategory
    channels: List[NotificationChannelType] = Field(
        default_factory=lambda: ["in_app"], min_length=1, max_length=5
    )
    title_template: str = Field(..., min_length=1, max_length=500)
    title_template_bn: Optional[str] = Field(None, max_length=500)
    body_template: str = Field(..., min_length=1, max_length=5000)
    body_template_bn: Optional[str] = Field(None, max_length=5000)
    email_html_template: Optional[str] = Field(None, max_length=20000)
    sms_template: Optional[str] = Field(None, max_length=640)
    variables: Optional[List[str]] = None
    strict_variables: bool = False
    is_active: bool = True


class NotificationTemplateUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=150)
    category: Optional[NotificationTemplateCategory] = None
    channels: Optional[List[NotificationChannelType]] = Field(None, min_length=1, max_length=5)
    title_template: Optional[str] = Field(None, min_length=1, max_length=500)
    title_template_bn: Optional[str] = Field(None, max_length=500)
    body_template: Optional[str] = Field(None, min_length=1, max_length=5000)
    body_template_bn: Optional[str] = Field(None, max_length=5000)
    email_html_template: Optional[str] = Field(None, max_length=20000)
    sms_template: Optional[str] = Field(None, max_length=640)
    variables: Optional[List[str]] = None
    strict_variables: bool = False
    is_active: Optional[bool] = None


class NotificationTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    category: str
    channels: List[str] = Field(default_factory=list)
    title_template: str
    title_template_bn: Optional[str] = None
    body_template: str
    body_template_bn: Optional[str] = None
    email_html_template: Optional[str] = None
    sms_template: Optional[str] = None
    variables: List[str] = Field(default_factory=list)
    is_active: bool
    version: int
    created_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime


class NotificationTemplateListResponse(BaseModel):
    items: List[NotificationTemplateResponse] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 50


class NotificationTemplatePreviewRequest(BaseModel):
    template_id: Optional[uuid.UUID] = None
    template_code: Optional[str] = Field(None, max_length=100)
    title_template: Optional[str] = Field(None, max_length=500)
    title_template_bn: Optional[str] = Field(None, max_length=500)
    body_template: Optional[str] = Field(None, max_length=5000)
    body_template_bn: Optional[str] = Field(None, max_length=5000)
    email_html_template: Optional[str] = Field(None, max_length=20000)
    sms_template: Optional[str] = Field(None, max_length=640)
    declared_variables: Optional[List[str]] = None
    variables: Dict[str, Any] = Field(default_factory=dict)
    deep_link: str = Field("/(tabs)", max_length=300)
    cta_label: Optional[str] = Field(None, max_length=80)


class NotificationTemplateRenderedLocale(BaseModel):
    language: LanguageCode
    title: str
    body: str
    email_html: str
    sms_text: str


class NotificationTemplatePreviewResponse(BaseModel):
    preview_only: bool = True
    valid: bool
    errors: List[str] = Field(default_factory=list)
    detected_variables: List[str] = Field(default_factory=list)
    missing_variables: List[str] = Field(default_factory=list)
    undeclared_variables: List[str] = Field(default_factory=list)
    sms_length: int = 0
    rendered_en: NotificationTemplateRenderedLocale
    rendered_bn: NotificationTemplateRenderedLocale


class CampaignCreateRequest(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    channel: NotificationCampaignChannel = "all"
    target_audience: Dict[str, Any] = Field(default_factory=dict)
    template_id: Optional[uuid.UUID] = None
    custom_payload: Dict[str, Any] = Field(default_factory=dict)
    scheduled_for: Optional[datetime] = None
    timezone: str = Field("Asia/Dhaka", max_length=50)
    deep_link: str = Field("/(tabs)", max_length=300)

    @field_validator("target_audience", "custom_payload")
    @classmethod
    def validate_safe_campaign_dicts(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        _assert_no_sensitive_keys(v)
        return v


class CampaignUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    channel: Optional[NotificationCampaignChannel] = None
    target_audience: Optional[Dict[str, Any]] = None
    template_id: Optional[uuid.UUID] = None
    custom_payload: Optional[Dict[str, Any]] = None
    scheduled_for: Optional[datetime] = None
    timezone: Optional[str] = Field(None, max_length=50)


class CampaignResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: Optional[str] = None
    channel: str
    target_audience: Dict[str, Any] = Field(default_factory=dict)
    template_id: Optional[uuid.UUID] = None
    custom_payload: Dict[str, Any] = Field(default_factory=dict)
    status: str
    scheduled_for: Optional[datetime] = None
    total_target_count: int = 0
    sent_count: int = 0
    delivered_count: int = 0
    failed_count: int = 0
    opened_count: int = 0
    clicked_count: int = 0
    created_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime


class CampaignListResponse(BaseModel):
    items: List[CampaignResponse] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 20
    status_counts: Dict[str, int] = Field(default_factory=dict)


class CampaignStatusActionResponse(BaseModel):
    success: bool = True
    campaign_id: uuid.UUID
    status: str
    message: str


class DeliveryLogItemResponse(BaseModel):
    id: uuid.UUID
    outbox_id: Optional[uuid.UUID] = None
    event_id: uuid.UUID
    event_type: Optional[str] = None
    user_id: uuid.UUID
    channel: str
    recipient_address: str
    recipient_masked: str
    title: str
    provider: str
    provider_message_id: Optional[str] = None
    status: str
    attempts: int
    latency_ms: Optional[int] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    created_at: datetime


class DeliveryLogListResponse(BaseModel):
    items: List[DeliveryLogItemResponse] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 20
    status_counts: Dict[str, int] = Field(default_factory=dict)


class OutboxRetryResponse(BaseModel):
    success: bool = True
    outbox_id: uuid.UUID
    status: str
    attempts: int
    message: str


class ChannelDeliveryMetrics(BaseModel):
    channel: str
    total: int = 0
    delivered: int = 0
    failed: int = 0
    avg_latency_ms: float = 0.0


class DailyAnalyticsItem(BaseModel):
    metric_date: str
    channel: str
    event_type: str
    total_sent: int = 0
    total_delivered: int = 0
    total_failed: int = 0
    total_opened: int = 0
    total_clicked: int = 0
    avg_latency_ms: int = 0


class NotificationAnalyticsSummaryResponse(BaseModel):
    window_days: int = 30
    queued_count: int = 0
    accepted_count: int = 0
    sent_count: int = 0
    delivered_count: int = 0
    failed_count: int = 0
    quarantined_count: int = 0
    read_count: int = 0
    clicked_count: int = 0
    converted_count: int = 0
    suppressed_count: int = 0
    delivery_rate_pct: float = 0.0
    open_rate_pct: float = 0.0
    ctr_pct: float = 0.0
    conversion_rate_pct: float = 0.0
    avg_latency_ms: float = 0.0
    funnel: Dict[str, int] = Field(default_factory=dict)
    by_channel: Dict[str, ChannelDeliveryMetrics] = Field(default_factory=dict)
    daily_series: List[DailyAnalyticsItem] = Field(default_factory=list)


class ProviderHealthItem(BaseModel):
    channel: str
    provider: str
    healthy: bool
    mode: str
    details: Dict[str, Any] = Field(default_factory=dict)
    deliveries_24h: int = 0
    failures_24h: int = 0
    failure_rate_pct: float = 0.0


class ProviderHealthResponse(BaseModel):
    overall_healthy: bool
    queue_pending: int = 0
    queue_failed: int = 0
    dlq_unresolved: int = 0
    providers: List[ProviderHealthItem] = Field(default_factory=list)
    ai_status: Dict[str, Any] = Field(default_factory=dict)


class EventDryRunRequest(BaseModel):
    payload: Dict[str, Any] = Field(default_factory=dict)
    priority: Optional[int] = Field(None, ge=1, le=10)
    user_id: Optional[uuid.UUID] = None
    simulated_local_time: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    language: LanguageCode = "en"


class EventDryRunResponse(BaseModel):
    dry_run: bool = True
    dispatched: bool = False
    event_type: str
    category: str
    is_critical: bool
    bypass_quiet_hours: bool
    eligible_channels: List[str] = Field(default_factory=list)
    suppressed_channels: Dict[str, str] = Field(default_factory=dict)
    suppressed_reasons: List[str] = Field(default_factory=list)
    should_dispatch_now: bool = True
    matched_rule_ids: List[uuid.UUID] = Field(default_factory=list)
    rendered_title: str = ""
    rendered_body: str = ""
    deep_link: str = "/(tabs)"


class BroadcastAudiencePreviewRequest(BaseModel):
    target_audience: Optional[Literal["all", "travelers", "agencies", "inactive", "vip"]] = None
    segment_key: Optional[str] = Field(None, max_length=100)
    target_user_ids: Optional[List[uuid.UUID]] = None
    category: str = Field("marketing", max_length=60)
    channel: Literal["push", "in_app", "email", "sms", "auto"] = "auto"


class BroadcastAudiencePreviewResponse(BaseModel):
    preview_only: bool = True
    total_candidates: int = 0
    eligible_estimate: int = 0
    opted_out_estimate: int = 0
    reachable_push_devices: int = 0
    reachable_emails: int = 0
    sample_user_ids: List[uuid.UUID] = Field(default_factory=list)


class LiveOpsResponse(BaseModel):
    generated_at: datetime
    queue_counts: Dict[str, int] = Field(default_factory=dict)
    unresolved_dlq_count: int = 0
    recent_outbox: List[OutboxItemResponse] = Field(default_factory=list)
    recent_deliveries: List[DeliveryLogItemResponse] = Field(default_factory=list)
    recent_dlq: List[DLQItemResponse] = Field(default_factory=list)


class AIConfigUpdateRequest(BaseModel):
    ai_enabled: bool = True
    provider: Optional[str] = Field(None, max_length=40)
    model: Optional[str] = Field(None, max_length=80)
    timeout_seconds: Optional[float] = Field(None, ge=0.2, le=5.0)
    max_output_tokens: Optional[int] = Field(None, ge=64, le=2048)
    daily_cost_budget_usd: Optional[float] = Field(None, ge=0.0, le=500.0)
    eligible_categories: Optional[List[str]] = None
    change_notes: Optional[str] = Field(None, max_length=300)


class AIConfigResponse(BaseModel):
    success: bool = True
    rule_version: int
    ai_config: Dict[str, Any] = Field(default_factory=dict)
    provider_status: Dict[str, Any] = Field(default_factory=dict)


class AICopilotRequest(BaseModel):
    goal: str = Field(..., min_length=3, max_length=1000)
    category: str = Field("marketing", max_length=60)
    destination: Optional[str] = Field(None, max_length=120)
    language: LanguageCode = "en"
    tone: CommunicationTone = "friendly"
    deep_link: str = Field("/(tabs)", max_length=300)
    verified_facts: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("verified_facts")
    @classmethod
    def validate_safe_facts(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        _assert_no_sensitive_keys(v)
        return v


class AICopilotResponse(BaseModel):
    preview_only: bool = True
    dispatched: bool = False
    ai_used: bool = False
    ai_provider: str = "deterministic_copilot"
    draft_en: Dict[str, str] = Field(default_factory=dict)
    draft_bn: Dict[str, str] = Field(default_factory=dict)
    recommended_channels: List[str] = Field(default_factory=list)
    recommended_segment_keys: List[str] = Field(default_factory=list)
    suggested_rule_conditions: Dict[str, Any] = Field(default_factory=dict)
    safety_notes: List[str] = Field(default_factory=list)
