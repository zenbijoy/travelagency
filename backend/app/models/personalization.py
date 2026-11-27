"""
SQLAlchemy 2.0 Declarative Models for ShopnoJatra Hyper-Personalized Notification Intelligence.

Extends the event-driven notification platform (20260621) with:
- 20-dimensional normalized user personalization profiles & audit changelog
- Behavioral signals & time-decayed destination interest scores
- Per-user & per-category notification fatigue tracking
- Versioned personalization rules & relevance weights
- Query-based dynamic user segments
- Verified contextual travel conditions (weather, routes, advisories, availability)
- Auditable personalization decision logs (explainability & attribution)
- Controlled A/B experiments & deterministic user assignments

Maintains 100% SQLite compatibility for in-memory testing using sqlalchemy.types.JSON,
Float, BigInteger, DateTime(timezone=True), UUIDMixin, and TimestampMixin.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin

JSON_JSONB = JSON().with_variant(JSONB, "postgresql")


class UserPersonalizationProfile(Base, UUIDMixin, TimestampMixin):
    """
    Core user personalization state, consent flags, explicit travel preferences,
    and aggregated lifecycle metrics (one row per user).
    """

    __tablename__ = "user_personalization_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(unique=True, nullable=False, index=True)
    profile_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    personalization_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    preferred_language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    communication_tone: Mapped[str] = mapped_column(String(20), default="friendly", nullable=False)
    digest_frequency: Mapped[str] = mapped_column(String(20), default="weekly", nullable=False)
    home_city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    travel_origin: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    location_consent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    explicit_preferences: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)
    travel_timeline_stage: Mapped[str] = mapped_column(
        String(40), default="no_planned_trip", nullable=False, index=True
    )
    loyalty_tier: Mapped[str] = mapped_column(String(30), default="explorer", nullable=False)
    activity_level: Mapped[str] = mapped_column(
        String(30), default="new_user", nullable=False, index=True
    )
    overall_confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    active_trip_context: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)
    last_activity_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_aggregated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reset_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "preferred_language IN ('en', 'bn')",
            name="chk_user_pers_profile_lang",
        ),
        CheckConstraint(
            "communication_tone IN ('concise', 'informative', 'friendly', 'formal')",
            name="chk_user_pers_profile_tone",
        ),
        CheckConstraint(
            "digest_frequency IN ('daily', 'weekly', 'disabled')",
            name="chk_user_pers_profile_digest",
        ),
        CheckConstraint(
            "overall_confidence >= 0.0 AND overall_confidence <= 100.0",
            name="chk_user_pers_profile_confidence",
        ),
        CheckConstraint(
            "profile_version >= 1",
            name="chk_user_pers_profile_version",
        ),
    )


class UserProfileDimension(Base, UUIDMixin, TimestampMixin):
    """
    Normalized per-dimension entries supporting all 20 personalization dimensions
    with provenance, confidence, data quality, consent, and expiration policy.
    """

    __tablename__ = "user_profile_dimensions"

    user_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    dimension_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    value_json: Mapped[Any] = mapped_column(JSON_JSONB, default=dict, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    source: Mapped[str] = mapped_column(String(30), default="unknown", nullable=False)
    data_quality: Mapped[str] = mapped_column(String(20), default="unknown", nullable=False)
    is_user_provided: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    permission_granted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    metadata_json: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "dimension_key",
            name="uq_user_profile_dimensions_user_key",
        ),
        Index("idx_user_profile_dims_user_updated", "user_id", "updated_at"),
        CheckConstraint(
            "confidence >= 0.0 AND confidence <= 100.0",
            name="chk_user_profile_dim_confidence",
        ),
        CheckConstraint(
            "source IN ('user_preference', 'behavioral', 'transactional', 'contextual', 'unknown')",
            name="chk_user_profile_dim_source",
        ),
        CheckConstraint(
            "data_quality IN ('high', 'medium', 'low', 'unknown')",
            name="chk_user_profile_dim_quality",
        ),
    )


class UserProfileChangeLog(Base, UUIDMixin, TimestampMixin):
    """
    Immutable audit log of explicit user overrides, behavioral updates,
    corrections, expirations, and profile resets.
    """

    __tablename__ = "user_profile_change_logs"

    user_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    profile_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    dimension_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    change_source: Mapped[str] = mapped_column(String(50), nullable=False)
    previous_value: Mapped[Any] = mapped_column(JSON_JSONB, nullable=True)
    new_value: Mapped[Any] = mapped_column(JSON_JSONB, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("idx_user_profile_chg_user_created", "user_id", "created_at"),
        Index("idx_user_profile_chg_user_dim", "user_id", "dimension_key"),
    )


class UserBehavioralSignal(Base, UUIDMixin, TimestampMixin):
    """
    Permitted behavioral & engagement signals ingested for incremental
    interest scoring, travel intent inference, and time-of-day histograms.
    """

    __tablename__ = "user_behavioral_signals"

    user_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    signal_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    destination: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    route_key: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    product_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    price_paisa: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    currency: Mapped[str] = mapped_column(String(10), default="BDT", nullable=False)
    filters_json: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)
    signal_weight: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    processed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    metadata_json: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)

    __table_args__ = (
        Index("idx_behavioral_signals_user_occurred", "user_id", "occurred_at"),
        Index("idx_behavioral_signals_user_type", "user_id", "signal_type", "occurred_at"),
        Index("idx_behavioral_signals_user_dest", "user_id", "destination", "occurred_at"),
        CheckConstraint(
            "confidence >= 0.0 AND confidence <= 100.0",
            name="chk_behavioral_signal_confidence",
        ),
    )


class UserDestinationInterest(Base, UUIDMixin, TimestampMixin):
    """
    Time-decayed destination interest scores per user and destination.
    Separates normalized interest score (0-100) from confidence (0-100).
    """

    __tablename__ = "user_destination_interests"

    user_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    destination: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    raw_decayed_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    signal_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    search_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    booking_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_explicit_favorite: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_signal_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_decay_computed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "destination",
            name="uq_user_destination_interests_user_dest",
        ),
        Index("idx_user_dest_interests_user_score", "user_id", "score"),
        CheckConstraint(
            "score >= 0.0 AND score <= 100.0",
            name="chk_user_dest_interest_score",
        ),
        CheckConstraint(
            "confidence >= 0.0 AND confidence <= 100.0",
            name="chk_user_dest_interest_confidence",
        ),
    )


class UserNotificationFatigue(Base, UUIDMixin, TimestampMixin):
    """
    Per-user AND per-category notification fatigue metrics, rolling engagement
    counters, and cooldown enforcement state.
    """

    __tablename__ = "user_notification_fatigue"

    user_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(50), default="all", nullable=False, index=True)
    fatigue_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    received_24h: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    received_7d: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    opened_7d: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    clicked_7d: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    dismissed_7d: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ignored_7d: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    opt_out_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cooldown_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_sent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "category",
            name="uq_user_notification_fatigue_user_cat",
        ),
        Index("idx_user_notif_fatigue_score", "fatigue_score"),
        CheckConstraint(
            "fatigue_score >= 0.0 AND fatigue_score <= 100.0",
            name="chk_user_notif_fatigue_score",
        ),
    )


class PersonalizationRuleConfig(Base, UUIDMixin, TimestampMixin):
    """
    Versioned admin configuration for relevance weights, dimension policies,
    adaptive timing, fatigue caps, AI guardrails, and time-decay lambda.
    """

    __tablename__ = "personalization_rule_configs"

    version: Mapped[int] = mapped_column(Integer, unique=True, nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    weights_json: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)
    dimension_configs_json: Mapped[Dict[str, Any]] = mapped_column(
        JSON_JSONB, default=dict, nullable=False
    )
    timing_config_json: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)
    fatigue_config_json: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)
    ai_config_json: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)
    decay_lambda: Mapped[float] = mapped_column(Float, default=0.08, nullable=False)
    min_relevance_threshold: Mapped[float] = mapped_column(Float, default=45.0, nullable=False)
    min_confidence_threshold: Mapped[float] = mapped_column(Float, default=30.0, nullable=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    change_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint("version >= 1", name="chk_pers_rule_cfg_version"),
        CheckConstraint("decay_lambda > 0.0", name="chk_pers_rule_cfg_lambda"),
        CheckConstraint(
            "min_relevance_threshold >= 0.0 AND min_relevance_threshold <= 100.0",
            name="chk_pers_rule_cfg_min_rel",
        ),
        CheckConstraint(
            "min_confidence_threshold >= 0.0 AND min_confidence_threshold <= 100.0",
            name="chk_pers_rule_cfg_min_conf",
        ),
    )


class PersonalizationSegment(Base, UUIDMixin, TimestampMixin):
    """
    Dynamic query-based segment definitions evaluated live server-side
    against user personalization profiles, interests, and behavioral metrics.
    """

    __tablename__ = "personalization_segments"

    key: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    query_criteria: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    cached_member_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_evaluated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class ContextualTravelCondition(Base, UUIDMixin, TimestampMixin):
    """
    Verified external travel context (weather, season, events, advisories,
    flight status, route conditions, price trends, hotel availability).
    """

    __tablename__ = "contextual_travel_conditions"

    destination: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    route_key: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    condition_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    payload_json: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)
    provider: Mapped[str] = mapped_column(String(100), nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_until: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    reliability_score: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)

    __table_args__ = (
        Index(
            "idx_ctx_travel_dest_lookup",
            "destination",
            "condition_type",
            "is_verified",
            "valid_until",
        ),
        Index(
            "idx_ctx_travel_route_lookup",
            "route_key",
            "condition_type",
            "is_verified",
            "valid_until",
        ),
        CheckConstraint(
            "reliability_score >= 0.0 AND reliability_score <= 100.0",
            name="chk_ctx_travel_reliability",
        ),
    )


class PersonalizationDecisionLog(Base, UUIDMixin, TimestampMixin):
    """
    Auditable record of each notification decision pipeline execution,
    explainability factors, channel/timing choices, AI fallback status,
    and downstream engagement/revenue attribution.
    """

    __tablename__ = "personalization_decision_logs"

    decision_id: Mapped[uuid.UUID] = mapped_column(
        default=uuid.uuid4, unique=True, nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    outbox_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True, index=True)
    campaign_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True, index=True)
    notification_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    eligibility_passed: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, index=True
    )
    suppression_reason: Mapped[Optional[str]] = mapped_column(
        String(120), nullable=True, index=True
    )
    relevance_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    confidence_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    fatigue_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    personalization_tier: Mapped[str] = mapped_column(
        String(20), default="generic", nullable=False, index=True
    )
    selected_channel: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    scheduled_for: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ai_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ai_provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    fallback_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    experiment_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True, index=True)
    variant: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    rendered_title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rendered_body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rendered_cta: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    deep_link: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    explanation_factors: Mapped[Any] = mapped_column(JSON_JSONB, default=list, nullable=False)
    feature_breakdown: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)
    delivered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    opened: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    clicked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    converted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    dismissed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    revenue_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)

    __table_args__ = (
        Index("idx_pers_decision_user_created", "user_id", "created_at"),
        Index("idx_pers_decision_campaign_created", "campaign_id", "created_at"),
        Index("idx_pers_decision_exp_variant", "experiment_id", "variant"),
        CheckConstraint(
            "personalization_tier IN ('generic', 'light', 'deep', 'suppressed')",
            name="chk_pers_decision_tier",
        ),
        CheckConstraint(
            "relevance_score >= 0.0 AND relevance_score <= 100.0",
            name="chk_pers_decision_relevance",
        ),
        CheckConstraint(
            "confidence_score >= 0.0 AND confidence_score <= 100.0",
            name="chk_pers_decision_confidence",
        ),
        CheckConstraint(
            "fatigue_score >= 0.0 AND fatigue_score <= 100.0",
            name="chk_pers_decision_fatigue",
        ),
    )


class PersonalizationExperiment(Base, UUIDMixin, TimestampMixin):
    """
    Controlled A/B experiments for notification personalization variants
    with sample size, duration, and opt-out spike stop conditions.
    """

    __tablename__ = "personalization_experiments"

    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    hypothesis: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    experiment_type: Mapped[str] = mapped_column(String(50), default="content", nullable=False)
    variants_json: Mapped[Any] = mapped_column(JSON_JSONB, default=list, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="draft", nullable=False, index=True)
    min_sample_size: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    max_duration_days: Mapped[int] = mapped_column(Integer, default=14, nullable=False)
    opt_out_stop_threshold: Mapped[float] = mapped_column(Float, default=0.05, nullable=False)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    results_summary: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)

    assignments: Mapped[List["PersonalizationExperimentAssignment"]] = relationship(
        "PersonalizationExperimentAssignment",
        back_populates="experiment",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint("min_sample_size >= 1", name="chk_pers_exp_min_sample"),
        CheckConstraint("max_duration_days >= 1", name="chk_pers_exp_max_days"),
        CheckConstraint(
            "opt_out_stop_threshold >= 0.0 AND opt_out_stop_threshold <= 100.0",
            name="chk_pers_exp_opt_out_thresh",
        ),
    )


class PersonalizationExperimentAssignment(Base, UUIDMixin, TimestampMixin):
    """
    Deterministic per-user experiment variant assignment and outcome telemetry.
    """

    __tablename__ = "personalization_experiment_assignments"

    experiment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("personalization_experiments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    variant: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    exposures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    opens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    clicks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    conversions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    opt_outs: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    revenue_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)

    experiment: Mapped["PersonalizationExperiment"] = relationship(
        "PersonalizationExperiment",
        back_populates="assignments",
    )

    __table_args__ = (
        UniqueConstraint(
            "experiment_id",
            "user_id",
            name="uq_personalization_exp_assign_exp_user",
        ),
        Index("idx_pers_exp_assign_exp_variant", "experiment_id", "variant"),
    )
