"""
In-App Inbox Delivery Adapter.
Persists notifications to `public.notifications` via the `Notification` ORM model
and optionally broadcasts over WebSockets (`ws_manager`) when available.
"""

import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.notifications.delivery.base import BaseDeliveryAdapter, DeliveryResult

logger = logging.getLogger(__name__)


def _normalize_priority_label(priority: Any) -> str:
    if isinstance(priority, str):
        lowered = priority.lower()
        if lowered in ("critical", "high", "normal", "low"):
            return lowered
        if lowered.isdigit():
            priority = int(lowered)
    if isinstance(priority, int):
        if priority >= 9:
            return "critical"
        if priority >= 7:
            return "high"
        if priority >= 4:
            return "normal"
        return "low"
    return "normal"


class InAppDeliveryAdapter(BaseDeliveryAdapter):
    """
    Writes persistent inbox notifications into `public.notifications` and
    triggers non-blocking real-time WebSocket delivery on `user:{user_id}`.
    """

    channel = "in_app"
    provider_name = "in_app_db"

    def __init__(
        self,
        db: Optional[AsyncSession] = None,
        enable_websocket: bool = True,
    ) -> None:
        self._db = db
        self.enable_websocket = enable_websocket
        self._healthy = True

    def is_healthy(self) -> bool:
        return self._healthy

    async def deliver(
        self,
        recipient: str,
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> DeliveryResult:
        t0 = time.perf_counter()
        db: Optional[AsyncSession] = kwargs.get("db") or self._db

        user_id_raw = kwargs.get("user_id") or recipient
        try:
            user_uuid = user_id_raw if isinstance(user_id_raw, uuid.UUID) else uuid.UUID(str(user_id_raw))
        except (ValueError, TypeError):
            return DeliveryResult(
                success=False,
                channel=self.channel,
                provider=self.provider_name,
                recipient=str(recipient or ""),
                status="failed",
                latency_ms=self._elapsed_ms(t0),
                error_code="INVALID_USER_ID",
                error_message=f"Invalid user UUID for in-app delivery: {user_id_raw!r}",
            )

        if db is None:
            return DeliveryResult(
                success=False,
                channel=self.channel,
                provider=self.provider_name,
                recipient=str(user_uuid),
                status="failed",
                latency_ms=self._elapsed_ms(t0),
                error_code="DB_SESSION_REQUIRED",
                error_message="AsyncSession `db` is required to persist in-app notifications.",
            )

        payload_data = dict(data or {})
        notif_type = str(
            kwargs.get("notification_type")
            or kwargs.get("category")
            or payload_data.get("category")
            or "system"
        )[:50]
        priority_label = _normalize_priority_label(
            kwargs.get("priority", payload_data.get("priority", "normal"))
        )
        channels_list: List[str] = list(kwargs.get("channels") or ["in_app"])
        expires_at = kwargs.get("expires_at")
        recipient_id_raw = kwargs.get("recipient_id")
        recipient_uuid: Optional[uuid.UUID] = user_uuid
        if recipient_id_raw:
            try:
                recipient_uuid = (
                    recipient_id_raw
                    if isinstance(recipient_id_raw, uuid.UUID)
                    else uuid.UUID(str(recipient_id_raw))
                )
            except (ValueError, TypeError):
                recipient_uuid = user_uuid

        try:
            notif = Notification(
                user_id=user_uuid,
                recipient_id=recipient_uuid,
                title=title[:255],
                message=body,
                type=notif_type,
                priority=priority_label,
                channels=channels_list,
                data=payload_data,
                is_read=False,
                expires_at=expires_at,
            )
            db.add(notif)
            await db.flush()
            if kwargs.get("commit"):
                await db.commit()
                await db.refresh(notif)
        except Exception as exc:
            logger.error(f"Failed to persist in-app notification for user={user_uuid}: {exc}")
            return DeliveryResult(
                success=False,
                channel=self.channel,
                provider=self.provider_name,
                recipient=str(user_uuid),
                status="failed",
                latency_ms=self._elapsed_ms(t0),
                error_code=type(exc).__name__,
                error_message=str(exc),
            )

        ws_broadcasted = False
        if self.enable_websocket:
            ws_broadcasted = await self._try_ws_broadcast(user_uuid, notif)

        now = datetime.now(timezone.utc)
        return DeliveryResult(
            success=True,
            channel=self.channel,
            provider=self.provider_name,
            recipient=str(user_uuid),
            provider_message_id=str(notif.id),
            status="delivered",
            latency_ms=self._elapsed_ms(t0),
            sent_at=now,
            delivered_at=now,
            metadata={
                "notification_id": str(notif.id),
                "ws_broadcasted": ws_broadcasted,
            },
        )

    async def _try_ws_broadcast(self, user_id: uuid.UUID, notif: Notification) -> bool:
        try:
            from app.websockets.connection_manager import ws_manager

            await ws_manager.broadcast_to_channel(
                f"user:{user_id}",
                {
                    "type": "notification.created",
                    "notification_id": str(notif.id),
                    "user_id": str(user_id),
                    "title": notif.title,
                    "message": notif.message,
                    "category": notif.type,
                    "priority": notif.priority,
                    "data": notif.data,
                    "created_at": (
                        notif.created_at.isoformat()
                        if getattr(notif, "created_at", None)
                        else datetime.now(timezone.utc).isoformat()
                    ),
                },
            )
            return True
        except Exception as exc:
            logger.debug(f"WebSocket broadcast skipped for user {user_id}: {exc}")
            return False
