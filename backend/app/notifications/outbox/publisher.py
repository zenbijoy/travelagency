"""
Transactional Outbox Publisher.
Stages Domain Events into the notification outbox table within active database transactions.
Guarantees atomicity: commits are strictly controlled by caller transaction boundaries.
"""

from datetime import datetime
import logging
from typing import Any, Dict, List, Optional, Tuple
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import NotificationOutbox
from app.notifications.events.base import DomainEvent

logger = logging.getLogger(__name__)

OUTBOX_IDEMPOTENCY_NAMESPACE = uuid.NAMESPACE_URL


class OutboxPublisher:
    """
    Transactional Outbox Publisher for Domain Events.
    Adheres to the Transactional Outbox Pattern to guarantee zero loss of events
    during application actions (e.g. booking confirmation, payment webhooks).
    """

    @staticmethod
    def deterministic_event_id(idempotency_key: str) -> uuid.UUID:
        """Derive a deterministic UUIDv5 event_id from a logical idempotency key."""
        normalized = str(idempotency_key).strip()
        if not normalized:
            raise ValueError("idempotency_key must be non-empty")
        return uuid.uuid5(OUTBOX_IDEMPOTENCY_NAMESPACE, f"shopnojatra:outbox:{normalized}")

    @classmethod
    def _build_entry(
        cls,
        event: DomainEvent,
        *,
        event_id: Optional[uuid.UUID] = None,
        scheduled_at: Optional[datetime] = None,
        extra_headers: Optional[Dict[str, Any]] = None,
    ) -> NotificationOutbox:
        serialized = event.to_dict()
        headers = dict(serialized.get("headers") or {})
        if extra_headers:
            headers.update(extra_headers)
        return NotificationOutbox(
            event_id=event_id or event.event_id,
            event_type=event.event_type,
            aggregate_type=event.aggregate_type,
            aggregate_id=str(event.aggregate_id),
            actor_id=event.actor_id,
            priority=event.priority,
            payload=serialized.get("payload", {}),
            headers=headers,
            scheduled_at=scheduled_at or event.timestamp,
            status="pending",
        )

    @classmethod
    async def _find_existing_entry(
        cls,
        db: AsyncSession,
        target_event_id: uuid.UUID,
    ) -> Optional[NotificationOutbox]:
        """Check uncommitted session objects first, then persisted outbox rows."""
        for pending_obj in getattr(db, "new", ()) or ():
            if (
                isinstance(pending_obj, NotificationOutbox)
                and getattr(pending_obj, "event_id", None) == target_event_id
            ):
                return pending_obj

        res = await db.execute(
            select(NotificationOutbox).where(NotificationOutbox.event_id == target_event_id).limit(1)
        )
        return res.scalar_one_or_none()

    @classmethod
    async def publish_idempotent(
        cls,
        db: AsyncSession,
        event: DomainEvent,
        idempotency_key: Optional[str] = None,
        scheduled_at: Optional[datetime] = None,
    ) -> Tuple[NotificationOutbox, bool]:
        """
        Atomically stage a DomainEvent with deterministic deduplication.
        Returns `(entry, created)` where `created=False` indicates a prior pending/processed
        outbox row already exists for `idempotency_key` (in-session or committed).
        """
        effective_key = (idempotency_key or "").strip() or event.idempotency_key
        target_event_id = cls.deterministic_event_id(effective_key)
        existing = await cls._find_existing_entry(db, target_event_id)
        if existing is not None:
            logger.debug(
                f"Skipped duplicate outbox event: key={effective_key} type={event.event_type} "
                f"existing_id={existing.event_id}"
            )
            return existing, False

        entry = cls._build_entry(
            event,
            event_id=target_event_id,
            scheduled_at=scheduled_at,
            extra_headers={"idempotency_key": effective_key},
        )
        db.add(entry)
        logger.debug(
            f"Staged idempotent outbox event: id={entry.event_id} key={effective_key} "
            f"type={entry.event_type} aggregate={entry.aggregate_type}:{entry.aggregate_id}"
        )
        return entry, True

    @classmethod
    async def publish(
        cls,
        db: AsyncSession,
        event: DomainEvent,
        scheduled_at: Optional[datetime] = None,
        idempotency_key: Optional[str] = None,
    ) -> NotificationOutbox:
        """
        Atomically stage a single DomainEvent in the current database session.
        Does NOT commit the session (the caller controls commit boundaries).
        When `idempotency_key` is provided, deduplicates in-session and against DB rows.
        """
        if idempotency_key:
            entry, _ = await cls.publish_idempotent(
                db=db,
                event=event,
                idempotency_key=idempotency_key,
                scheduled_at=scheduled_at,
            )
            return entry

        entry = cls._build_entry(event, scheduled_at=scheduled_at)
        db.add(entry)
        logger.debug(
            f"Staged outbox event: id={entry.event_id} type={entry.event_type} "
            f"aggregate={entry.aggregate_type}:{entry.aggregate_id}"
        )
        return entry

    @classmethod
    async def publish_batch(
        cls,
        db: AsyncSession,
        events: List[DomainEvent],
        scheduled_at: Optional[datetime] = None,
    ) -> List[NotificationOutbox]:
        """
        Atomically stage a list of DomainEvents in the current database session.
        Does NOT commit the session.
        """
        entries: List[NotificationOutbox] = []
        for event in events:
            entry = cls._build_entry(event, scheduled_at=scheduled_at)
            db.add(entry)
            entries.append(entry)

        logger.debug(f"Staged batch of {len(entries)} outbox events")
        return entries
