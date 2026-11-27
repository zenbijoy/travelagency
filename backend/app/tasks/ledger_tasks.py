"""
Celery Background Tasks for Double-Entry Ledger and Agency Payouts.
Includes:
- release_matured_bookings_task: releases escrow when trip departure date passes.
- weekly_create_payout_batch_task: aggregates qualifying agency balances into a weekly payout batch.
- nightly_ledger_integrity_check_task: audits every transaction group and alerts on any imbalance.
"""

import asyncio
from datetime import date, datetime, timezone
import logging
from typing import Any, Dict, List
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.booking import Booking
from app.models.ledger import LedgerEntry
from app.services.ledger_service import LedgerService
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


def run_async(coro):
    """Helper to execute async coroutine within synchronous Celery task worker."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    if loop.is_running():
        new_loop = asyncio.new_event_loop()
        try:
            return new_loop.run_until_complete(coro)
        finally:
            new_loop.close()
    else:
        return loop.run_until_complete(coro)


@celery_app.task(name="release_matured_bookings_task")
def release_matured_bookings_task() -> Dict[str, Any]:
    """
    Periodic task to check confirmed bookings where trip departure date has passed (start_date <= today).
    Releases escrow funds to agency account.
    """
    async def _async_exec():
        async with AsyncSessionLocal() as session:
            today = date.today()
            stmt = select(Booking).where(
                Booking.status == "confirmed",
                Booking.start_date <= today,
                Booking.agency_id.is_not(None),
            )
            res = await session.execute(stmt)
            matured_bookings = res.scalars().all()

            released_count = 0
            for booking in matured_bookings:
                # Check if already released
                check_stmt = select(LedgerEntry).where(
                    LedgerEntry.booking_id == booking.id,
                    LedgerEntry.memo.like("Release escrow%"),
                ).limit(1)
                check_res = await session.execute(check_stmt)
                if not check_res.scalar_one_or_none():
                    await LedgerService.release_to_agency(session, booking)
                    released_count += 1

            if released_count > 0:
                await session.commit()

            logger.info(f"[Task] release_matured_bookings: released {released_count} bookings.")
            return {"status": "success", "released_count": released_count}

    return run_async(_async_exec())


@celery_app.task(name="weekly_create_payout_batch_task")
def weekly_create_payout_batch_task() -> Dict[str, Any]:
    """
    Weekly automated Celery beat task to generate payout batches for agencies
    whose available balance meets or exceeds the parameterized threshold.
    """
    async def _async_exec():
        async with AsyncSessionLocal() as session:
            batch = await LedgerService.create_payout_batch(
                db=session,
                created_by=None,
                minimum_threshold_paisa=settings.MINIMUM_PAYOUT_THRESHOLD_PAISA,
            )
            await session.commit()
            return {
                "status": "success",
                "batch_id": str(batch.id),
                "total_paisa": batch.total_paisa,
                "payout_count": len(batch.payouts),
            }

    return run_async(_async_exec())


@celery_app.task(name="nightly_ledger_integrity_check_task")
def nightly_ledger_integrity_check_task() -> Dict[str, Any]:
    """
    Nightly Celery beat task auditing all double-entry ledger groups.
    Raises critical alerts if any imbalance or mathematical defect is identified.
    """
    async def _async_exec():
        async with AsyncSessionLocal() as session:
            audit_result = await LedgerService.verify_ledger_integrity(session)
            if not audit_result["is_balanced"]:
                logger.critical(
                    f"[ALERT: LEDGER IMBALANCE DETECTED] Discrepancies found: "
                    f"{audit_result['imbalances']}"
                )
                try:
                    from datetime import datetime, timezone
                    from app.notifications.events.base import DomainEvent
                    from app.notifications.outbox.publisher import OutboxPublisher

                    today_str = datetime.now(timezone.utc).date().isoformat()
                    alert_event = DomainEvent(
                        event_type="system.ledger.imbalance_detected",
                        aggregate_type="ledger",
                        aggregate_id=today_str,
                        priority=10,
                        imbalance_count=len(audit_result.get("imbalances", [])),
                        category="system",
                        headers={
                            "source_service": "ledger_tasks",
                            "causation_id": today_str,
                        },
                    )
                    _, created = await OutboxPublisher.publish_idempotent(
                        session,
                        alert_event,
                        idempotency_key=f"ledger_imbalance:{today_str}:{len(audit_result.get('imbalances', []))}",
                    )
                    if created:
                        await session.commit()
                except Exception as outbox_err:
                    logger.warning(f"Could not stage ledger imbalance event: {outbox_err}")
            else:
                logger.info("[AUDIT PASSED] All ledger transaction groups balanced perfectly at zero.")
            return audit_result

    return run_async(_async_exec())
