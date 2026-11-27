"""
Base Domain Event Specification compliant with CloudEvents 1.0.
Provides immutable, serializable, and typed domain event models for the notification platform.
"""

from datetime import datetime, timezone
from typing import Any, Dict, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field, field_validator


class DomainEvent(BaseModel):
    """
    CloudEvents 1.0 envelope-compliant base domain event.
    Standardized across all microservices and travel domains in ShopnoJatra.
    """
    model_config = ConfigDict(
        extra="allow",
        populate_by_name=True,
    )

    event_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    event_type: str = Field(description="Dot-delimited domain event name (e.g. 'booking.confirmed')")
    aggregate_type: str = Field(description="Aggregate root name (e.g. 'booking', 'user', 'payment')")
    aggregate_id: str = Field(default="unknown", description="Unique identifier of the aggregate entity")
    actor_id: Optional[uuid.UUID] = Field(default=None, description="Triggering user/admin UUID if known")
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="ISO-8601 UTC timestamp of event generation",
    )
    priority: int = Field(
        default=5,
        ge=1,
        le=10,
        description="Priority score from 1 (lowest) to 10 (emergency)",
    )
    payload: Dict[str, Any] = Field(default_factory=dict, description="Typed event payload dictionary")
    headers: Dict[str, Any] = Field(
        default_factory=lambda: {
            "schema_version": "1.0",
            "source_service": "shopnojatra-backend",
        },
        description="Tracing and metadata headers",
    )

    def __init__(self, **data: Any):
        # 1. Populate default event_type, aggregate_type, and priority from subclass model_fields
        for field_name in ("event_type", "aggregate_type", "priority"):
            if field_name not in data or data[field_name] is None:
                field_info = self.__class__.model_fields.get(field_name)
                if field_info and field_info.default is not None:
                    data[field_name] = field_info.default

        # 2. Derive aggregate_id if not explicitly provided
        if "aggregate_id" in data and data["aggregate_id"] is not None:
            data["aggregate_id"] = str(data["aggregate_id"])
        elif not data.get("aggregate_id"):
            agg_type = data.get("aggregate_type", "")
            agg_id_map = {
                "price_alert": ("alert_id",),
                "user": ("user_id",),
                "profile": ("user_id",),
                "loyalty": ("account_id", "transaction_id", "user_id"),
                "security": ("user_id",),
                "session": ("session_id", "user_id"),
                "security_gate": ("client_fingerprint", "ip_address"),
                "booking": ("booking_id",),
                "payment": ("payment_id",),
                "ticket": ("ticket_id",),
                "flight": ("flight_id",),
                "hotel_booking": ("booking_id",),
                "hotel_room": ("room_id", "hotel_id"),
                "hotel_review": ("review_id", "hotel_id"),
                "hotel": ("hotel_id",),
                "disruption": ("disruption_id",),
                "agency": ("agency_id",),
                "payout_batch": ("batch_id",),
                "trip_session": ("session_id",),
                "marketplace_booking": ("booking_id",),
                "itinerary": ("itinerary_id", "original_itinerary_id"),
                "system_worker": ("node_id",),
                "notification_dlq": ("dlq_id",),
                "provider": ("provider",),
                "campaign": ("campaign_id",),
            }
            preferred_keys = agg_id_map.get(agg_type, ())
            found = False
            for k in preferred_keys:
                if k in data and data[k] is not None:
                    data["aggregate_id"] = str(data[k])
                    found = True
                    break
            if not found:
                for id_key in (
                    "booking_id", "alert_id", "payment_id", "user_id", "agency_id",
                    "hotel_id", "room_id", "flight_id", "session_id", "batch_id",
                    "disruption_id", "review_id", "ticket_id", "dlq_id", "campaign_id",
                    "node_id", "provider", "ip_address"
                ):
                    if id_key in data and data[id_key] is not None:
                        data["aggregate_id"] = str(data[id_key])
                        break
        if not data.get("aggregate_id"):
            data["aggregate_id"] = "unknown"

        # 3. Collect extra keyword arguments into payload
        base_fields = {
            "event_id", "event_type", "aggregate_type", "aggregate_id",
            "actor_id", "timestamp", "priority", "payload", "headers"
        }
        extra_payload = {}
        for k in list(data.keys()):
            if k not in base_fields:
                extra_payload[k] = data.pop(k)

        if extra_payload:
            existing_payload = data.get("payload") or {}
            data["payload"] = {**extra_payload, **existing_payload}

        super().__init__(**data)

    @field_validator("timestamp")
    @classmethod
    def ensure_utc_timezone(cls, v: datetime) -> datetime:
        """Enforces that timestamps are timezone-aware and set to UTC."""
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v.astimezone(timezone.utc)

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: int) -> int:
        if v < 1 or v > 10:
            raise ValueError(f"Priority must be between 1 and 10, got {v}")
        return v

    @property
    def idempotency_key(self) -> str:
        """
        Calculates a deterministic idempotency key for outbox deduplication.
        Formula: {aggregate_type}:{aggregate_id}:{event_type}:{causation_id}
        """
        causation_id = str(self.headers.get("causation_id", ""))
        return f"{self.aggregate_type}:{self.aggregate_id}:{self.event_type}:{causation_id}"

    def to_dict(self) -> Dict[str, Any]:
        """Serializes domain event to a standard JSON-compatible Python dictionary."""
        return self.model_dump(mode="json")

    def to_cloudevent(self) -> Dict[str, Any]:
        """
        CloudEvents 1.0 specification compliant representation.
        Ref: https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md
        """
        source = self.headers.get("source_service", f"shopnojatra/{self.aggregate_type}")
        cloud_event: Dict[str, Any] = {
            "specversion": "1.0",
            "id": str(self.event_id),
            "type": self.event_type,
            "source": source,
            "subject": str(self.aggregate_id),
            "time": self.timestamp.isoformat(),
            "datacontenttype": "application/json",
            "data": self.payload,
            # CloudEvents extension attributes
            "priority": self.priority,
            "aggregatetype": self.aggregate_type,
        }
        if self.actor_id:
            cloud_event["actorid"] = str(self.actor_id)
        if "correlation_id" in self.headers:
            cloud_event["correlationid"] = str(self.headers["correlation_id"])
        if "causation_id" in self.headers:
            cloud_event["causationid"] = str(self.headers["causation_id"])

        return cloud_event
