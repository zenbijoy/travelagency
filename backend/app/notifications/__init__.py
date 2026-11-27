"""
ShopnoJatra Event-Driven Notification Intelligence Platform.
"""

from app.notifications.events import (
    DomainEvent,
    EVENT_REGISTRY,
    get_event_class,
    parse_event_dict,
    register_event,
)
from app.notifications.outbox import OutboxPublisher

__all__ = [
    "DomainEvent",
    "EVENT_REGISTRY",
    "register_event",
    "get_event_class",
    "parse_event_dict",
    "OutboxPublisher",
]
