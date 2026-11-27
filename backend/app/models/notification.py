"""
SQLAlchemy 2.0 Declarative Models for the Notification Intelligence Platform.
Implements Transactional Outbox, Multi-Channel Deliveries, Device Registry,
User Notification Preferences, Templates, Rules, Campaigns, Analytics, DLQ, and Inbox.

Maintains 100% SQLite compatibility for in-memory testing using generic JSON types.
"""

from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional
import uuid

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin

JSON_ARRAY_TEXT = JSON().with_variant(ARRAY(Text), "postgresql")
JSON_JSONB = JSON().with_variant(JSONB, "postgresql")


class NotificationOutbox(Base, UUIDMixin, TimestampMixin):
    """
    Transactional Outbox Table.
    Staged atomically in the same database transaction as domain operations.
    """
    __tablename__ = "notification_outbox"

    event_id: Mapped[uuid.UUID] = mapped_column(unique=True, nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    aggregate_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    aggregate_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    payload: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)
    headers: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False, index=True)
    priority: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    last_attempt_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    next_retry_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    deliveries: Mapped[List["NotificationDelivery"]] = relationship(
        "NotificationDelivery",
        back_populates="outbox",
        cascade="all, delete-orphan",
    )
    dlq_entries: Mapped[List["NotificationDLQ"]] = relationship(
        "NotificationDLQ",
        back_populates="outbox",
    )


class NotificationDelivery(Base, UUIDMixin, TimestampMixin):
    """
    Delivery Records for multi-channel dispatches (Push, In-App, Email, SMS).
    """
    __tablename__ = "notification_deliveries"

    outbox_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("notification_outbox.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    event_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    channel: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    recipient_address: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    data: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    provider_message_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="queued", nullable=False, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    error_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    outbox: Mapped[Optional["NotificationOutbox"]] = relationship(
        "NotificationOutbox",
        back_populates="deliveries",
    )


class NotificationDevice(Base, UUIDMixin, TimestampMixin):
    """
    Hardware and push token registry (Expo, FCM, APNS, Web Push).
    """
    __tablename__ = "notification_devices"

    user_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    device_id: Mapped[str] = mapped_column(String(100), nullable=False)
    push_token: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    token_type: Mapped[str] = mapped_column(String(20), default="expo", nullable=False)
    platform: Mapped[str] = mapped_column(String(20), nullable=False)
    device_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    os_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    app_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_active_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("user_id", "push_token", name="uq_notification_devices_user_token"),
    )


class NotificationUserPreference(Base, UUIDMixin, TimestampMixin):
    """
    User-level notification channel and category opt-in preferences, quiet hours, and caps.
    """
    __tablename__ = "notification_user_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(unique=True, nullable=False, index=True)
    push_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sms_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    in_app_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    category_booking: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    category_security: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    category_flight_alerts: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    category_marketing: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    category_community: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    category_price_alerts: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    quiet_hours_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    quiet_hours_start: Mapped[str] = mapped_column(String(10), default="22:00", nullable=False)
    quiet_hours_end: Mapped[str] = mapped_column(String(10), default="07:00", nullable=False)
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Dhaka", nullable=False)
    frequency_cap_marketing_per_day: Mapped[int] = mapped_column(Integer, default=3, nullable=False)


class NotificationTemplate(Base, UUIDMixin, TimestampMixin):
    """
    Standardized multi-lingual (EN/BN) notification templates.
    """
    __tablename__ = "notification_templates"

    code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    channels: Mapped[List[str]] = mapped_column(JSON_ARRAY_TEXT, default=lambda: ["in_app"], nullable=False)
    title_template: Mapped[str] = mapped_column(Text, nullable=False)
    title_template_bn: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    body_template: Mapped[str] = mapped_column(Text, nullable=False)
    body_template_bn: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    email_html_template: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sms_template: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    variables: Mapped[List[str]] = mapped_column(JSON_JSONB, default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)

    rules: Mapped[List["NotificationRule"]] = relationship(
        "NotificationRule",
        back_populates="template",
    )
    campaigns: Mapped[List["NotificationCampaign"]] = relationship(
        "NotificationCampaign",
        back_populates="template",
    )


class NotificationRule(Base, UUIDMixin, TimestampMixin):
    """
    Deterministic rule definitions with condition trees and channel mappings.
    """
    __tablename__ = "notification_rules"

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    trigger_event: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    channels: Mapped[List[str]] = mapped_column(JSON_ARRAY_TEXT, default=lambda: ["in_app", "push"], nullable=False)
    template_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("notification_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    conditions: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)
    priority: Mapped[str] = mapped_column(String(20), default="normal", nullable=False)
    bypass_quiet_hours: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    cooldown_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)

    template: Mapped[Optional["NotificationTemplate"]] = relationship(
        "NotificationTemplate",
        back_populates="rules",
    )


class NotificationCampaign(Base, UUIDMixin, TimestampMixin):
    """
    Marketing campaigns and scheduled broadcasts.
    """
    __tablename__ = "notification_campaigns"

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    channel: Mapped[str] = mapped_column(String(20), nullable=False)
    target_audience: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)
    template_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("notification_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    custom_payload: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    scheduled_for: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    total_target_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sent_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    delivered_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    opened_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    clicked_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)

    template: Mapped[Optional["NotificationTemplate"]] = relationship(
        "NotificationTemplate",
        back_populates="campaigns",
    )


class NotificationAnalytics(Base, UUIDMixin, TimestampMixin):
    """
    Aggregated daily delivery, latency, and interaction telemetry.
    """
    __tablename__ = "notification_analytics"

    metric_date: Mapped[date] = mapped_column(Date, default=date.today, nullable=False, index=True)
    channel: Mapped[str] = mapped_column(String(50), nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    total_sent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_delivered: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_failed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_opened: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_clicked: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_latency_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class NotificationDLQ(Base, UUIDMixin, TimestampMixin):
    """
    Dead-Letter Queue (DLQ) for quarantined undeliverable messages.
    """
    __tablename__ = "notification_dlq"

    outbox_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("notification_outbox.id", ondelete="SET NULL"),
        nullable=True,
    )
    event_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    channel: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    recipient: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    payload: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)
    failure_reason: Mapped[str] = mapped_column(Text, nullable=False)
    exception_class: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    stack_trace: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False)
    resolution_status: Mapped[str] = mapped_column(
        String(20),
        default="unresolved",
        nullable=False,
        index=True,
    )
    resolution_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolved_by: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    outbox: Mapped[Optional["NotificationOutbox"]] = relationship(
        "NotificationOutbox",
        back_populates="dlq_entries",
    )


class Notification(Base, UUIDMixin, TimestampMixin):
    """
    Corresponds to public.notifications (Client In-App Inbox Table).
    """
    __tablename__ = "notifications"

    user_id: Mapped[uuid.UUID] = mapped_column(index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String(50), default="system", nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    recipient_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    priority: Mapped[str] = mapped_column(String(20), default="normal", nullable=False)
    channels: Mapped[List[str]] = mapped_column(JSON_ARRAY_TEXT, default=lambda: ["in_app"], nullable=False)
    data: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
