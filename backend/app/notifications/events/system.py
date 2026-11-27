"""
Domain Events: System Telemetry & Operational Health (Category 8).
Covers Background Worker Heartbeats, DLQ Quarantines, Provider Circuit Breakers, and Campaign Completions.
"""

from app.notifications.events.base import DomainEvent
from app.notifications.events.registry import register_event


@register_event
class SystemWorkerHealthHeartbeatEvent(DomainEvent):
    """
    Emitted periodically by notification outbox workers to signal cluster liveness and queue depth.
    Low Priority P3 (2). Telemetry only.
    Default channels: ["webhook"].
    """
    event_type: str = "system.worker.health_heartbeat"
    aggregate_type: str = "system_worker"
    priority: int = 2


@register_event
class SystemDlqMessageQuarantinedEvent(DomainEvent):
    """
    Emitted when an outbox message reaches maximum retry threshold and is quarantined into the DLQ.
    Critical Priority P0 (9). Strict bypass of quiet hours.
    Default channels: ["in_app", "webhook", "email"].
    """
    event_type: str = "system.dlq.message_quarantined"
    aggregate_type: str = "notification_dlq"
    priority: int = 9


@register_event
class SystemProviderCircuitBreakerTrippedEvent(DomainEvent):
    """
    Emitted when consecutive downstream provider failures trigger circuit breaker isolation.
    Critical Priority P0 (9). Strict bypass of quiet hours.
    Default channels: ["in_app", "email", "webhook"].
    """
    event_type: str = "system.provider.circuit_breaker_tripped"
    aggregate_type: str = "provider"
    priority: int = 9


@register_event
class SystemCampaignCompletedEvent(DomainEvent):
    """
    Emitted when a broadcast notification campaign has completed dispatching across all target audiences.
    Low Priority P3 (4).
    Default channels: ["in_app", "email"].
    """
    event_type: str = "system.campaign.completed"
    aggregate_type: str = "campaign"
    priority: int = 4
