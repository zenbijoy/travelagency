"""
Transactional Outbox Worker Processor (`OutboxWorkerProcessor`).

Polls `NotificationOutbox` (`FOR UPDATE SKIP LOCKED` on PostgreSQL, safe in-process
async mutex on SQLite tests), deduplicates by `event_id`, evaluates through the
24-Step Decision Pipeline (or RulesEngine for non-user system/direct events),
dispatches via Delivery Adapters, persists `NotificationDelivery`, retries with
exponential backoff + jitter (`min(2^attempts * 5, 3600) + jitter`), and
quarantines permanently failed items to `NotificationDLQ` at `max_attempts`.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import logging
import random
from typing import Any, Dict, List, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import NotificationDelivery, NotificationOutbox
from app.notifications.delivery import (
    BaseDeliveryAdapter,
    DeliveryResult,
    build_default_adapters,
)
from app.notifications.dlq.manager import DLQManager
from app.notifications.events.base import DomainEvent
from app.notifications.events.registry import parse_event_dict
from app.notifications.personalization.decision_pipeline import (
    DecisionPipelineInput,
    NotificationDecisionPipeline,
)
from app.notifications.rules.engine import RulesEngine

logger = logging.getLogger(__name__)

# In-process lock protecting SQLite polling in unit/integration tests where
# SELECT ... FOR UPDATE SKIP LOCKED is unsupported.
_SQLITE_POLL_LOCK = asyncio.Lock()


def compute_retry_delay_seconds(attempts: int, jitter_max: float = 5.0) -> float:
    """
    Exponential backoff with bounded cap and random jitter:
    `min(2^attempts * 5, 3600) + random(0, jitter_max)`.
    """
    exp = min((2 ** max(1, int(attempts))) * 5, 3600)
    jitter = random.uniform(0.0, max(0.0, float(jitter_max)))
    return float(exp) + jitter


class WorkerBatchSummary(BaseModel):
    """Telemetry summary returned after processing one outbox poll batch."""
    model_config = ConfigDict(extra="ignore")

    processed_count: int = 0
    delivered_count: int = 0
    suppressed_count: int = 0
    rescheduled_count: int = 0
    failed_count: int = 0
    quarantined_count: int = 0
    skipped_duplicate_count: int = 0
    results: List[Dict[str, Any]] = Field(default_factory=list)


class OutboxWorkerProcessor:
    """
    Polls pending/retryable rows from `notification_outbox` and executes reliable
    multi-channel delivery with idempotency, backoff retries, and DLQ quarantine.
    """

    def __init__(
        self,
        adapters: Optional[Dict[str, BaseDeliveryAdapter]] = None,
        mock_mode: Optional[bool] = None,
        decision_pipeline: Optional[NotificationDecisionPipeline] = None,
        batch_size: int = 50,
        jitter_max_seconds: float = 5.0,
    ) -> None:
        self.adapters = adapters or build_default_adapters(mock_mode=mock_mode)
        self.decision_pipeline = decision_pipeline or NotificationDecisionPipeline(
            adapters=self.adapters
        )
        self.rules_engine = RulesEngine()
        self.batch_size = max(1, min(int(batch_size), 500))
        self.jitter_max_seconds = max(0.0, float(jitter_max_seconds))

    @staticmethod
    def _is_postgres(db: AsyncSession) -> bool:
        try:
            bind = db.get_bind()
            return bool(bind is not None and bind.dialect.name == "postgresql")
        except Exception:
            return False

    @staticmethod
    def _resolve_recipient_user_id(entry: NotificationOutbox) -> Optional[uuid.UUID]:
        pl = entry.payload or {}
        candidates = [
            pl.get("user_id"),
            pl.get("recipient_user_id"),
            pl.get("traveler_id"),
            entry.actor_id,
        ]
        if entry.aggregate_type in ("user", "profile"):
            candidates.append(entry.aggregate_id)
        for cand in candidates:
            if cand is None:
                continue
            try:
                return cand if isinstance(cand, uuid.UUID) else uuid.UUID(str(cand))
            except (ValueError, TypeError):
                continue
        return None

    async def _claim_batch(
        self,
        db: AsyncSession,
        *,
        now: datetime,
        limit: int,
    ) -> List[NotificationOutbox]:
        """Claim pending or due-for-retry outbox entries safely."""
        stmt = (
            select(NotificationOutbox)
            .where(
                or_(
                    and_(
                        NotificationOutbox.status == "pending",
                        NotificationOutbox.scheduled_at <= now,
                    ),
                    and_(
                        NotificationOutbox.status == "failed",
                        NotificationOutbox.attempts < NotificationOutbox.max_attempts,
                        or_(
                            NotificationOutbox.next_retry_at.is_(None),
                            NotificationOutbox.next_retry_at <= now,
                        ),
                    ),
                )
            )
            .order_by(NotificationOutbox.priority.desc(), NotificationOutbox.scheduled_at.asc())
            .limit(limit)
        )

        if self._is_postgres(db):
            stmt = stmt.with_for_update(skip_locked=True)

        entries = list((await db.scalars(stmt)).all())
        for entry in entries:
            entry.status = "processing"
            entry.last_attempt_at = now
        await db.flush()
        return entries

    async def process_batch(
        self,
        db: AsyncSession,
        *,
        limit: Optional[int] = None,
        now_utc: Optional[datetime] = None,
        commit: bool = False,
    ) -> WorkerBatchSummary:
        """
        Poll and process up to `limit` outbox entries.
        Uses `FOR UPDATE SKIP LOCKED` on PostgreSQL and an async mutex on SQLite.
        """
        now = now_utc or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

        batch_limit = max(1, min(int(limit or self.batch_size), 500))
        if self._is_postgres(db):
            entries = await self._claim_batch(db, now=now, limit=batch_limit)
        else:
            async with _SQLITE_POLL_LOCK:
                entries = await self._claim_batch(db, now=now, limit=batch_limit)

        summary = WorkerBatchSummary()

        for entry in entries:
            summary.processed_count += 1
            outcome = await self._process_single_entry(db, entry, now=now)
            kind = outcome.get("outcome")
            if kind == "delivered":
                summary.delivered_count += 1
            elif kind == "duplicate_skipped":
                summary.skipped_duplicate_count += 1
                summary.delivered_count += 1
            elif kind == "suppressed":
                summary.suppressed_count += 1
            elif kind == "rescheduled":
                summary.rescheduled_count += 1
            elif kind == "failed":
                summary.failed_count += 1
            elif kind == "quarantined":
                summary.failed_count += 1
                summary.quarantined_count += 1
            summary.results.append(outcome)

        await db.flush()
        if commit:
            await db.commit()

        return summary

    async def _process_single_entry(
        self,
        db: AsyncSession,
        entry: NotificationOutbox,
        *,
        now: datetime,
    ) -> Dict[str, Any]:
        """Process one claimed outbox entry with deduplication, retry, and DLQ quarantine."""
        try:
            # 1. Idempotent deduplication check against successful NotificationDelivery
            existing_delivery = await db.scalar(
                select(NotificationDelivery)
                .where(
                    NotificationDelivery.event_id == entry.event_id,
                    NotificationDelivery.status.in_(["delivered", "sent"]),
                )
                .limit(1)
            )
            if existing_delivery is not None:
                entry.status = "delivered"
                entry.processed_at = now
                entry.error_message = None
                return {
                    "outbox_id": str(entry.id),
                    "event_id": str(entry.event_id),
                    "outcome": "duplicate_skipped",
                }

            # 2. Parse typed DomainEvent
            event = parse_event_dict(
                {
                    "event_id": entry.event_id,
                    "event_type": entry.event_type,
                    "aggregate_type": entry.aggregate_type,
                    "aggregate_id": entry.aggregate_id,
                    "actor_id": entry.actor_id,
                    "priority": entry.priority,
                    "payload": dict(entry.payload or {}),
                    "headers": dict(entry.headers or {}),
                    "timestamp": entry.scheduled_at or now,
                }
            )

            # Support explicit failure simulation in tests
            if (entry.payload or {}).get("_simulate_failure"):
                raise RuntimeError(str((entry.payload or {}).get("_failure_reason") or "Simulated delivery error"))

            user_id = self._resolve_recipient_user_id(entry)
            if user_id is not None:
                return await self._process_user_entry(db, entry, event, user_id, now=now)
            return await self._process_direct_or_system_entry(db, entry, event, now=now)

        except Exception as exc:
            return await self._handle_failure(
                db,
                entry,
                failure_reason=str(exc) or type(exc).__name__,
                exception=exc,
                channel=str((entry.payload or {}).get("channel") or "unknown"),
                recipient=str(
                    (entry.payload or {}).get("recipient_email")
                    or (entry.payload or {}).get("recipient_phone")
                    or (entry.payload or {}).get("user_id")
                    or entry.aggregate_id
                ),
                now=now,
            )

    async def _process_user_entry(
        self,
        db: AsyncSession,
        entry: NotificationOutbox,
        event: DomainEvent,
        user_id: uuid.UUID,
        *,
        now: datetime,
    ) -> Dict[str, Any]:
        req = DecisionPipelineInput.from_domain_event(event, outbox_id=entry.id)
        decision = await self.decision_pipeline.evaluate_recipient(
            db,
            user_id,
            req,
            dry_run=False,
            now_utc=now,
        )

        if decision.action == "suppress":
            # Outbox terminal check constraint allows 'delivered' for processed non-failing rows
            entry.status = "delivered"
            entry.processed_at = now
            entry.error_message = f"suppressed:{decision.suppression_reason}"
            return {
                "outbox_id": str(entry.id),
                "event_id": str(entry.event_id),
                "outcome": "suppressed",
                "reason": decision.suppression_reason,
                "decision_id": str(decision.decision_id),
            }

        if decision.action == "schedule":
            entry.status = "pending"
            entry.scheduled_at = decision.scheduled_for or (now + timedelta(hours=1))
            entry.error_message = "rescheduled_by_timing_or_quiet_hours"
            return {
                "outbox_id": str(entry.id),
                "event_id": str(entry.event_id),
                "outcome": "rescheduled",
                "scheduled_for": entry.scheduled_at.isoformat(),
                "decision_id": str(decision.decision_id),
            }

        # Action == "dispatch"
        any_ok = any(dr.success for dr in decision.delivery_results)
        if not decision.delivery_results or not any_ok:
            errors = [
                f"{dr.channel}:{dr.error_message or dr.error_code or 'delivery_failed'}"
                for dr in decision.delivery_results
                if not dr.success
            ]
            reason = "; ".join(errors) if errors else "No delivery adapter succeeded."
            first_failed = next((dr for dr in decision.delivery_results if not dr.success), None)
            return await self._handle_failure(
                db,
                entry,
                failure_reason=reason,
                channel=first_failed.channel if first_failed else decision.selected_channel,
                recipient=first_failed.recipient if first_failed else str(user_id),
                now=now,
            )

        entry.status = "delivered"
        entry.processed_at = now
        entry.error_message = None
        return {
            "outbox_id": str(entry.id),
            "event_id": str(entry.event_id),
            "outcome": "delivered",
            "channels": [dr.channel for dr in decision.delivery_results if dr.success],
            "decision_id": str(decision.decision_id),
        }

    async def _process_direct_or_system_entry(
        self,
        db: AsyncSession,
        entry: NotificationOutbox,
        event: DomainEvent,
        *,
        now: datetime,
    ) -> Dict[str, Any]:
        """Handle direct-address notifications (no user_id) or internal system events."""
        pl = dict(event.payload or {})
        rule_eval = await self.rules_engine.evaluate(event, user_preferences=None, db=db, now_utc=now)
        if rule_eval.is_suppressed:
            entry.status = "delivered"
            entry.processed_at = now
            entry.error_message = f"suppressed:{','.join(rule_eval.suppressed_reasons)}"
            return {
                "outbox_id": str(entry.id),
                "event_id": str(entry.event_id),
                "outcome": "suppressed",
                "reason": entry.error_message,
            }

        title = str(pl.get("title") or event.event_type)
        body = str(pl.get("body") or pl.get("message") or f"Event {event.event_type} for {event.aggregate_id}")

        dispatched_results: List[DeliveryResult] = []
        target_pairs = [
            ("email", pl.get("recipient_email") or pl.get("email"), ("recipient_email" in pl or "email" in pl)),
            ("sms", pl.get("recipient_phone") or pl.get("phone"), ("recipient_phone" in pl or "phone" in pl)),
            ("push", pl.get("push_token"), ("push_token" in pl)),
        ]
        for ch, addr, key_present in target_pairs:
            if (addr or key_present) and ch in self.adapters:
                res = await self.adapters[ch].deliver(str(addr or ""), title, body, pl)
                dispatched_results.append(res)

        if dispatched_results:
            if not any(r.success for r in dispatched_results):
                err = "; ".join(r.error_message or "failed" for r in dispatched_results)
                return await self._handle_failure(
                    db,
                    entry,
                    failure_reason=err,
                    channel=dispatched_results[0].channel,
                    recipient=dispatched_results[0].recipient,
                    now=now,
                )
            # Record NotificationDelivery using system sentinel UUID when user_id absent
            sys_uid = uuid.UUID(int=0)
            for res in dispatched_results:
                db.add(
                    NotificationDelivery(
                        outbox_id=entry.id,
                        event_id=entry.event_id,
                        user_id=sys_uid,
                        channel=res.channel,
                        recipient_address=res.recipient[:255],
                        title=title[:255],
                        body=body,
                        data=pl,
                        provider=res.provider,
                        provider_message_id=res.provider_message_id,
                        status=res.status,
                        latency_ms=res.latency_ms,
                        error_code=res.error_code,
                        error_message=res.error_message,
                        sent_at=res.sent_at,
                        delivered_at=res.delivered_at,
                    )
                )

        entry.status = "delivered"
        entry.processed_at = now
        entry.error_message = None
        return {
            "outbox_id": str(entry.id),
            "event_id": str(entry.event_id),
            "outcome": "delivered",
            "channels": [r.channel for r in dispatched_results if r.success],
        }

    async def _handle_failure(
        self,
        db: AsyncSession,
        entry: NotificationOutbox,
        *,
        failure_reason: str,
        exception: Optional[BaseException] = None,
        channel: Optional[str] = None,
        recipient: Optional[str] = None,
        now: datetime,
    ) -> Dict[str, Any]:
        """Increment attempt count; schedule exponential backoff+jitter or quarantine to DLQ."""
        entry.attempts = int(entry.attempts or 0) + 1
        entry.last_attempt_at = now
        entry.error_message = failure_reason

        if entry.attempts >= int(entry.max_attempts or 5):
            dlq_entry = await DLQManager.quarantine_outbox_entry(
                db,
                entry,
                failure_reason=failure_reason,
                channel=channel,
                recipient=recipient,
                exception=exception,
            )
            return {
                "outbox_id": str(entry.id),
                "event_id": str(entry.event_id),
                "outcome": "quarantined",
                "attempts": entry.attempts,
                "dlq_id": str(dlq_entry.id),
                "reason": failure_reason,
            }

        delay_sec = compute_retry_delay_seconds(entry.attempts, self.jitter_max_seconds)
        entry.status = "failed"
        entry.next_retry_at = now + timedelta(seconds=delay_sec)
        logger.warning(
            f"[OUTBOX RETRY] outbox_id={entry.id} attempt={entry.attempts}/{entry.max_attempts} "
            f"retry_in={delay_sec:.2f}s reason={failure_reason}"
        )
        return {
            "outbox_id": str(entry.id),
            "event_id": str(entry.event_id),
            "outcome": "failed",
            "attempts": entry.attempts,
            "next_retry_at": entry.next_retry_at.isoformat(),
            "reason": failure_reason,
        }
