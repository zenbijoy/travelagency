"""
Transactional Outbox Package.
"""

from app.notifications.outbox.publisher import OutboxPublisher

__all__ = ["OutboxPublisher"]
