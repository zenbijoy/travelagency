"""
Global Domain Event Registry and Dynamic Event Deserialization Engine.
"""

from typing import Any, Dict, Optional, Type
import logging

from app.notifications.events.base import DomainEvent

logger = logging.getLogger(__name__)

# Registry mapping dot-delimited event_type string to its concrete DomainEvent class
EVENT_REGISTRY: Dict[str, Type[DomainEvent]] = {}


def register_event(event_cls: Type[DomainEvent]) -> Type[DomainEvent]:
    """
    Decorator and function to register a concrete DomainEvent subclass.
    """
    field_info = event_cls.model_fields.get("event_type")
    event_type = field_info.default if field_info else getattr(event_cls, "event_type", None)

    if event_type and event_type != "unknown":
        EVENT_REGISTRY[event_type] = event_cls
        logger.debug(f"Registered domain event '{event_type}' -> {event_cls.__name__}")
    else:
        logger.warning(f"Could not register event {event_cls.__name__}: missing event_type attribute")
    return event_cls


def get_event_class(event_type: str) -> Optional[Type[DomainEvent]]:
    """
    Retrieve concrete DomainEvent subclass for a given dot-delimited event_type.
    """
    return EVENT_REGISTRY.get(event_type)


def parse_event_dict(data: Dict[str, Any]) -> DomainEvent:
    """
    Dynamically deserializes a dictionary into a typed DomainEvent subclass.
    Supports both standard DomainEvent dictionary formats and CloudEvents 1.0 JSON payloads.
    Falls back to base DomainEvent if no specific subclass is registered.
    """
    # CloudEvents 1.0 mapping: 'type' -> 'event_type', 'subject' -> 'aggregate_id', 'data' -> 'payload'
    event_type = data.get("event_type") or data.get("type")
    if not event_type:
        raise ValueError("Cannot parse event dictionary: missing 'event_type' or 'type'")

    normalized_data = dict(data)
    if "type" in normalized_data and "event_type" not in normalized_data:
        normalized_data["event_type"] = normalized_data.pop("type")
    if "subject" in normalized_data and "aggregate_id" not in normalized_data:
        normalized_data["aggregate_id"] = normalized_data.pop("subject")
    if "data" in normalized_data and "payload" not in normalized_data:
        normalized_data["payload"] = normalized_data.pop("data")
    if "time" in normalized_data and "timestamp" not in normalized_data:
        normalized_data["timestamp"] = normalized_data.pop("time")

    event_cls = get_event_class(event_type) or DomainEvent
    return event_cls(**normalized_data)
