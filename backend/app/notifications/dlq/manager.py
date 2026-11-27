"""
Dead-Letter Queue (DLQ) Quarantine & Administrative Replay Manager.
Handles permanent failure quarantine into `notification_dlq`, audit logging,
DLQ listing/filtering, administrative replay, and discard workflows.
"""

from datetime import datetime, timezone
import logging
import traceback
from typing import Any, Dict, List, Optional, Tuple
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import NotificationDLQ, NotificationOutbox
from app.notifications.events.system import SystemDlqMessageQuarantinedEvent
from app.notifications.outbox.publisher import OutboxPublisher

logger = logging.getLogger(__name__)


class DLQManager:
    """
    Manages Dead-Letter Queue lifecycle for undeliverable outbox messages.
    Methods are exposed as classmethods so callers may invoke either
    `DLQManager.method(...)` or `DLQManager().method(...)`.
    """

    @classmethod
    async def quarantine_outbox_entry(
        cls,
        db: AsyncSession,
        outbox_entry: NotificationOutbox,
        failure_reason: str,
        channel: Optional[str] = None,
        recipient: Optional[str] = None,
        exception: Optional[BaseException] = None,
        stack_trace: Optional[str] = None,
        emit_quarantine_event: bool = True,
    ) -> NotificationDLQ:
        """
        Transition an outbox row to `dead_letter`, create a `NotificationDLQ` record,
        log the quarantine status, and stage a critical `system.dlq.message_quarantined`
        alert (guarded against recursive self-quarantine).
        """
        now = datetime.now(timezone.utc)
        exc_class = type(exception).__name__ if exception is not None else None
        trace = stack_trace
        if trace is None and exception is not None:
            trace = "".join(
                traceback.format_exception(type(exception), exception, exception.__traceback__)
            )
            if not trace or trace.strip() == "NoneType: None":
                trace = repr(exception)

        outbox_entry.status = "dead_letter"
        outbox_entry.error_message = failure_reason
        outbox_entry.last_attempt_at = now
        outbox_entry.next_retry_at = None

        dlq_entry = NotificationDLQ(
            outbox_id=outbox_entry.id,
            event_id=outbox_entry.event_id,
            event_type=outbox_entry.event_type,
            channel=channel,
            recipient=recipient,
            payload=dict(outbox_entry.payload or {}),
            failure_reason=failure_reason,
            exception_class=exc_class,
            stack_trace=trace[:4000] if trace else None,
            attempts=int(outbox_entry.attempts or 0),
            resolution_status="unresolved",
        )
        db.add(dlq_entry)
        await db.flush()

        logger.error(
            f"[DLQ QUARANTINE] outbox_id={outbox_entry.id} event_id={outbox_entry.event_id} "
            f"event_type={outbox_entry.event_type} channel={channel} "
            f"attempts={dlq_entry.attempts} reason={failure_reason}"
        )

        # Avoid infinite recursion if a quarantine notification itself dead-letters.
        if (
            emit_quarantine_event
            and outbox_entry.event_type != "system.dlq.message_quarantined"
        ):
            try:
                quarantine_evt = SystemDlqMessageQuarantinedEvent(
                    aggregate_id=str(dlq_entry.id),
                    dlq_id=str(dlq_entry.id),
                    outbox_id=str(outbox_entry.id),
                    failed_event_id=str(outbox_entry.event_id),
                    failed_event_type=outbox_entry.event_type,
                    channel=channel,
                    failure_reason=failure_reason,
                    attempts=dlq_entry.attempts,
                    headers={
                        "schema_version": "1.0",
                        "source_service": "notification-dlq-manager",
                        "causation_id": str(outbox_entry.event_id),
                    },
                )
                await OutboxPublisher.publish(db, quarantine_evt)
            except Exception as emit_exc:
                logger.warning(f"Failed to stage DLQ quarantine alert event: {emit_exc}")

        return dlq_entry

    @classmethod
    async def list_dlq(
        cls,
        db: AsyncSession,
        resolution_status: Optional[str] = None,
        event_type: Optional[str] = None,
        channel: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[NotificationDLQ], int]:
        """List DLQ entries with optional filtering and pagination total count."""
        filters = []
        if resolution_status:
            filters.append(NotificationDLQ.resolution_status == resolution_status)
        if event_type:
            filters.append(NotificationDLQ.event_type == event_type)
        if channel:
            filters.append(NotificationDLQ.channel == channel)

        count_stmt = select(func.count(NotificationDLQ.id))
        stmt = select(NotificationDLQ)
        if filters:
            count_stmt = count_stmt.where(*filters)
            stmt = stmt.where(*filters)

        total = int((await db.scalar(count_stmt)) or 0)
        stmt = (
            stmt.order_by(NotificationDLQ.created_at.desc())
            .offset(max(0, offset))
            .limit(max(1, min(limit, 500)))
        )
        items = list((await db.scalars(stmt)).all())
        return items, total

    @classmethod
    async def get_dlq_entry(
        cls,
        db: AsyncSession,
        dlq_id: uuid.UUID,
    ) -> Optional[NotificationDLQ]:
        """Fetch a single DLQ entry by ID."""
        return await db.scalar(select(NotificationDLQ).where(NotificationDLQ.id == dlq_id))

    @classmethod
    async def replay_dlq_entry(
        cls,
        db: AsyncSession,
        dlq_id: uuid.UUID,
        resolved_by: Optional[uuid.UUID] = None,
        notes: Optional[str] = None,
        commit: bool = False,
    ) -> Dict[str, Any]:
        """
        Replay a quarantined DLQ entry back into the outbox (`status='pending'`,
        `attempts=0`, `next_retry_at=None`) and mark the DLQ entry `replayed`.
        """
        dlq_entry = await cls.get_dlq_entry(db, dlq_id)
        if dlq_entry is None:
            raise LookupError(f"DLQ entry {dlq_id} not found.")
        if dlq_entry.resolution_status == "discarded":
            raise ValueError(f"DLQ entry {dlq_id} was already discarded and cannot be replayed.")

        now = datetime.now(timezone.utc)
        outbox_entry: Optional[NotificationOutbox] = None
        if dlq_entry.outbox_id is not None:
            outbox_entry = await db.scalar(
                select(NotificationOutbox).where(NotificationOutbox.id == dlq_entry.outbox_id)
            )
        if outbox_entry is None:
            outbox_entry = await db.scalar(
                select(NotificationOutbox).where(NotificationOutbox.event_id == dlq_entry.event_id)
            )

        if outbox_entry is not None:
            outbox_entry.status = "pending"
            outbox_entry.attempts = 0
            outbox_entry.next_retry_at = None
            outbox_entry.error_message = None
            outbox_entry.processed_at = None
            outbox_entry.scheduled_at = now
        else:
            # Reconstruct a replayable outbox entry if original was pruned
            outbox_entry = NotificationOutbox(
                event_id=uuid.uuid4(),
                event_type=dlq_entry.event_type,
                aggregate_type="notification_dlq",
                aggregate_id=str(dlq_entry.id),
                payload=dict(dlq_entry.payload or {}),
                headers={
                    "schema_version": "1.0",
                    "source_service": "dlq-replay",
                    "replayed_from_dlq_id": str(dlq_entry.id),
                    "original_event_id": str(dlq_entry.event_id),
                },
                status="pending",
                priority=7,
                scheduled_at=now,
                attempts=0,
            )
            db.add(outbox_entry)
            await db.flush()
            dlq_entry.outbox_id = outbox_entry.id

        dlq_entry.resolution_status = "replayed"
        dlq_entry.resolution_notes = notes or "Replayed by administrator."
        dlq_entry.resolved_by = resolved_by
        dlq_entry.resolved_at = now
        await db.flush()

        if commit:
            await db.commit()
            await db.refresh(dlq_entry)
            await db.refresh(outbox_entry)

        logger.info(
            f"[DLQ REPLAY] dlq_id={dlq_entry.id} outbox_id={outbox_entry.id} resolved_by={resolved_by}"
        )
        return {
            "dlq_entry": dlq_entry,
            "outbox_entry": outbox_entry,
            "dlq_id": dlq_entry.id,
            "outbox_id": outbox_entry.id,
            "resolution_status": dlq_entry.resolution_status,
            "outbox_status": outbox_entry.status,
        }

    @classmethod
    async def discard_dlq_entry(
        cls,
        db: AsyncSession,
        dlq_id: uuid.UUID,
        resolved_by: Optional[uuid.UUID] = None,
        notes: Optional[str] = None,
        commit: bool = False,
    ) -> NotificationDLQ:
        """
        Mark a DLQ entry as `discarded` so it will never be replayed.
        """
        dlq_entry = await cls.get_dlq_entry(db, dlq_id)
        if dlq_entry is None:
            raise LookupError(f"DLQ entry {dlq_id} not found.")

        now = datetime.now(timezone.utc)
        dlq_entry.resolution_status = "discarded"
        dlq_entry.resolution_notes = notes or "Discarded by administrator."
        dlq_entry.resolved_by = resolved_by
        dlq_entry.resolved_at = now
        await db.flush()

        if commit:
            await db.commit()
            await db.refresh(dlq_entry)

        logger.info(f"[DLQ DISCARD] dlq_id={dlq_entry.id} resolved_by={resolved_by}")
        return dlq_entry
