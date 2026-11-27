"""
SMS Delivery Adapter (Bangladesh E.164 Normalization / Gateway / Safe Dev Mock).
Zero external credentials required in test and local development modes.
"""

import logging
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings
from app.notifications.delivery.base import BaseDeliveryAdapter, DeliveryResult

logger = logging.getLogger(__name__)

_E164_RE = re.compile(r"^\+[1-9]\d{7,14}$")


def normalize_phone_e164(phone: str, default_country_code: str = "+880") -> Optional[str]:
    """
    Normalize Bangladesh local mobile numbers (e.g. '01712345678' -> '+8801712345678')
    and international E.164 phone numbers. Returns None if invalid.
    """
    raw = re.sub(r"[\s\-().]", "", (phone or "").strip())
    if not raw:
        return None
    if raw.startswith("00"):
        raw = "+" + raw[2:]
    if not raw.startswith("+"):
        if raw.startswith("880") and len(raw) == 13:
            raw = "+" + raw
        elif raw.startswith("01") and len(raw) == 11 and default_country_code == "+880":
            raw = "+880" + raw[1:]
        elif raw.startswith("1") and len(raw) == 10 and default_country_code == "+880":
            raw = "+880" + raw
        else:
            raw = "+" + raw
    if not _E164_RE.match(raw):
        return None
    return raw


class SmsDeliveryAdapter(BaseDeliveryAdapter):
    """
    SMS gateway adapter with E.164 normalization, custom driver injection,
    and zero-credential dev/test mocking.
    """

    channel = "sms"
    provider_name = "sms_gateway"

    def __init__(
        self,
        driver: Optional[Any] = None,
        mock_mode: Optional[bool] = None,
        timeout_seconds: float = 10.0,
    ) -> None:
        self.driver = driver
        if mock_mode is not None:
            self.mock_mode = mock_mode
        else:
            env = (settings.ENVIRONMENT or "development").lower()
            no_creds = (
                not settings.SMS_GATEWAY_API_KEY
                or settings.SMS_GATEWAY_API_KEY in ("mock-sms-gateway-key", "your-sms-gateway-key")
            )
            self.mock_mode = env in ("test", "testing") or no_creds
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
        normalized = normalize_phone_e164(recipient)
        if not normalized:
            return DeliveryResult(
                success=False,
                channel=self.channel,
                provider="mock_sms_gateway" if self.mock_mode else self.provider_name,
                recipient=str(recipient or ""),
                status="failed",
                latency_ms=self._elapsed_ms(t0),
                error_code="INVALID_PHONE_NUMBER",
                error_message=f"Invalid E.164 phone number: {recipient!r}",
            )

        payload_data = dict(data or {})
        sms_text = kwargs.get("sms_text") or payload_data.get("sms_text")
        if not sms_text:
            sms_text = f"{title}: {body}" if title and title not in body else (body or title)
        sms_text = str(sms_text).strip()[:480]

        # 1. Custom injected driver
        if self.driver is not None:
            try:
                msg_id = await self.driver.send(normalized, sms_text)
                now = datetime.now(timezone.utc)
                return DeliveryResult(
                    success=True,
                    channel=self.channel,
                    provider="custom_sms_driver",
                    recipient=normalized,
                    provider_message_id=str(msg_id),
                    status="delivered",
                    latency_ms=self._elapsed_ms(t0),
                    sent_at=now,
                    delivered_at=now,
                )
            except Exception as exc:
                logger.error(f"SMS driver failure for {normalized}: {exc}")
                return DeliveryResult(
                    success=False,
                    channel=self.channel,
                    provider="custom_sms_driver",
                    recipient=normalized,
                    status="failed",
                    latency_ms=self._elapsed_ms(t0),
                    error_code=type(exc).__name__,
                    error_message=str(exc),
                )

        # 2. Safe Dev/Test Mock
        if self.mock_mode:
            now = datetime.now(timezone.utc)
            msg_id = f"sms-gw-{uuid.uuid4().hex[:12]}"
            self.dispatches.append({
                "message_id": msg_id,
                "phone": normalized,
                "message": sms_text,
                "data": payload_data,
                "timestamp": now,
            })
            logger.info(f"[DEV MOCK] Simulated SMS to {normalized}: '{sms_text}'")
            return DeliveryResult(
                success=True,
                channel=self.channel,
                provider="mock_sms_gateway",
                recipient=normalized,
                provider_message_id=msg_id,
                status="delivered",
                latency_ms=self._elapsed_ms(t0),
                sent_at=now,
                delivered_at=now,
                metadata={"mock": True},
            )

        # 3. Live SMS gateway HTTP dispatch
        try:
            payload = {
                "api_key": settings.SMS_GATEWAY_API_KEY,
                "sender_id": settings.SMS_SENDER_ID,
                "recipient": normalized,
                "message": sms_text,
            }
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                resp = await client.post(settings.SMS_GATEWAY_URL, json=payload)
            now = datetime.now(timezone.utc)
            if resp.status_code in (200, 201):
                resp_data = resp.json() if resp.content else {}
                msg_id = str(resp_data.get("message_id") or f"sms-{uuid.uuid4().hex[:12]}")
                return DeliveryResult(
                    success=True,
                    channel=self.channel,
                    provider=self.provider_name,
                    recipient=normalized,
                    provider_message_id=msg_id,
                    status="sent",
                    latency_ms=self._elapsed_ms(t0),
                    sent_at=now,
                )
            return DeliveryResult(
                success=False,
                channel=self.channel,
                provider=self.provider_name,
                recipient=normalized,
                status="failed",
                latency_ms=self._elapsed_ms(t0),
                error_code=f"HTTP_{resp.status_code}",
                error_message=resp.text[:300],
            )
        except Exception as exc:
            logger.error(f"SMS gateway dispatch failed for {normalized}: {exc}")
            return DeliveryResult(
                success=False,
                channel=self.channel,
                provider=self.provider_name,
                recipient=normalized,
                status="failed",
                latency_ms=self._elapsed_ms(t0),
                error_code=type(exc).__name__,
                error_message=str(exc),
            )
