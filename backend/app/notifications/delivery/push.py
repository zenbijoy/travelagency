"""
Push Notification Delivery Adapter (Expo Push / FCM / Safe Dev Mock).
Zero external credentials required in test and local development modes.
"""

import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.notification import NotificationDevice
from app.notifications.delivery.base import BaseDeliveryAdapter, DeliveryResult

logger = logging.getLogger(__name__)

_INVALID_PUSH_ERROR_CODES = frozenset(
    {"INVALID_PUSH_TOKEN", "DeviceNotRegistered", "UNREGISTERED", "MismatchSenderId"}
)


def is_valid_push_token(token: Optional[str]) -> Tuple[bool, Optional[str]]:
    """
    Validate push token format for Expo, FCM, APNS, and Web Push tokens.
    Rejects empty, whitespace-containing, truncated (< 8 chars), or explicitly malformed tokens.
    """
    cleaned = (token or "").strip()
    if not cleaned:
        return False, "Recipient push token is empty."
    if any(ch.isspace() or ord(ch) < 32 for ch in cleaned):
        return False, "Push token cannot contain whitespace or control characters."
    if len(cleaned) < 8 or len(cleaned) > 255:
        return False, "Push token length must be between 8 and 255 characters."
    lowered = cleaned.lower()
    if lowered in ("invalid", "invalid_token", "invalid-token", "null", "undefined", "none") or lowered.startswith("invalid:"):
        return False, "Malformed or explicitly invalid push token."
    if cleaned.startswith("ExponentPushToken[") or cleaned.startswith("ExpoPushToken["):
        if not cleaned.endswith("]"):
            return False, "Malformed Expo push token missing closing bracket."
        inner = cleaned[cleaned.index("[") + 1 : -1].strip()
        if len(inner) < 3 or inner.lower() in ("invalid", "empty", "null"):
            return False, "Malformed Expo push token payload."
    return True, None


class PushDeliveryAdapter(BaseDeliveryAdapter):
    """
    Multi-platform push notification adapter supporting Expo Push API,
    custom injected drivers (for tests), and zero-credential dev mocking.
    """

    channel = "push"
    provider_name = "expo_push"

    EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

    def __init__(
        self,
        driver: Optional[Any] = None,
        mock_mode: Optional[bool] = None,
        access_token: Optional[str] = None,
        timeout_seconds: float = 5.0,
    ) -> None:
        self.driver = driver
        self.access_token = access_token or getattr(settings, "EXPO_ACCESS_TOKEN", "")
        if mock_mode is not None:
            self.mock_mode = mock_mode
        else:
            env = (settings.ENVIRONMENT or "development").lower()
            self.mock_mode = env in ("development", "dev", "test", "testing") or not bool(self.access_token)
        self.timeout_seconds = timeout_seconds
        self.dispatches: List[Dict[str, Any]] = []
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
        token = (recipient or "").strip()
        payload_data = dict(data or {})

        token_ok, token_err = is_valid_push_token(token)
        if not token_ok:
            return DeliveryResult(
                success=False,
                channel=self.channel,
                provider=self.provider_name if not self.mock_mode else "mock_expo",
                recipient=token,
                status="failed",
                latency_ms=self._elapsed_ms(t0),
                error_code="INVALID_PUSH_TOKEN",
                error_message=token_err or "Invalid push token.",
            )

        # 1. Custom injected driver (e.g., MockPushDriver in E2E tests)
        if self.driver is not None:
            try:
                msg_id = await self.driver.send(token, title, body, payload_data)
                now = datetime.now(timezone.utc)
                return DeliveryResult(
                    success=True,
                    channel=self.channel,
                    provider="custom_push_driver",
                    recipient=token,
                    provider_message_id=str(msg_id),
                    status="delivered",
                    latency_ms=self._elapsed_ms(t0),
                    sent_at=now,
                    delivered_at=now,
                )
            except Exception as exc:
                logger.error(f"Push driver error for token={token[:24]}...: {exc}")
                return DeliveryResult(
                    success=False,
                    channel=self.channel,
                    provider="custom_push_driver",
                    recipient=token,
                    status="failed",
                    latency_ms=self._elapsed_ms(t0),
                    error_code=type(exc).__name__,
                    error_message=str(exc),
                )

        # 2. Zero-credential dev/test mock mode
        if self.mock_mode:
            now = datetime.now(timezone.utc)
            msg_id = f"expo-push-{uuid.uuid4().hex[:12]}"
            self.dispatches.append({
                "message_id": msg_id,
                "token": token,
                "title": title,
                "body": body,
                "data": payload_data,
                "timestamp": now,
            })
            logger.info(f"[DEV MOCK] Push to {token}: {title}")
            return DeliveryResult(
                success=True,
                channel=self.channel,
                provider="mock_expo",
                recipient=token,
                provider_message_id=msg_id,
                status="delivered",
                latency_ms=self._elapsed_ms(t0),
                sent_at=now,
                delivered_at=now,
                metadata={"mock": True},
            )

        # 3. Live Expo Push API
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"

        expo_payload = {
            "to": token,
            "title": title,
            "body": body,
            "data": payload_data,
            "sound": kwargs.get("sound", "default"),
            "priority": kwargs.get("expo_priority", "high"),
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                resp = await client.post(self.EXPO_PUSH_URL, json=expo_payload, headers=headers)
            now = datetime.now(timezone.utc)
            if resp.status_code in (200, 201):
                resp_json = resp.json() if resp.content else {}
                ticket_data = resp_json.get("data", {})
                if isinstance(ticket_data, list) and ticket_data:
                    ticket_data = ticket_data[0]
                if isinstance(ticket_data, dict) and ticket_data.get("status") == "error":
                    return DeliveryResult(
                        success=False,
                        channel=self.channel,
                        provider=self.provider_name,
                        recipient=token,
                        status="failed",
                        latency_ms=self._elapsed_ms(t0),
                        error_code=str(ticket_data.get("details", {}).get("error", "EXPO_ERROR")),
                        error_message=str(ticket_data.get("message", "Expo push error")),
                    )
                msg_id = (
                    ticket_data.get("id")
                    if isinstance(ticket_data, dict)
                    else None
                ) or f"expo-{uuid.uuid4().hex[:12]}"
                return DeliveryResult(
                    success=True,
                    channel=self.channel,
                    provider=self.provider_name,
                    recipient=token,
                    provider_message_id=str(msg_id),
                    status="sent",
                    latency_ms=self._elapsed_ms(t0),
                    sent_at=now,
                )
            return DeliveryResult(
                success=False,
                channel=self.channel,
                provider=self.provider_name,
                recipient=token,
                status="failed",
                latency_ms=self._elapsed_ms(t0),
                error_code=f"HTTP_{resp.status_code}",
                error_message=resp.text[:300],
            )
        except Exception as exc:
            logger.error(f"Live Expo push delivery failed: {exc}")
            return DeliveryResult(
                success=False,
                channel=self.channel,
                provider=self.provider_name,
                recipient=token,
                status="failed",
                latency_ms=self._elapsed_ms(t0),
                error_code=type(exc).__name__,
                error_message=str(exc),
            )

    async def deliver_to_user_devices(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> List[DeliveryResult]:
        """Query active NotificationDevice tokens for user and deliver to each."""
        stmt = select(NotificationDevice).where(
            NotificationDevice.user_id == user_id,
            NotificationDevice.is_active.is_(True),
        )
        devices = (await db.scalars(stmt)).all()
        if not devices:
            return []
        results: List[DeliveryResult] = []
        for dev in devices:
            res = await self.deliver(
                recipient=dev.push_token,
                title=title,
                body=body,
                data=data,
                device_id=dev.device_id,
                platform=dev.platform,
                token_type=dev.token_type,
                **kwargs,
            )
            if not res.success and res.error_code in _INVALID_PUSH_ERROR_CODES:
                dev.is_active = False
            results.append(res)
        return results
