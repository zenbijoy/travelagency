"""
Email Delivery Adapter (SMTP / HTML Safe Renderer / Zero-Credential Dev Mock).
"""

import asyncio
import email.message
import html
import logging
import smtplib
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.notifications.delivery.base import BaseDeliveryAdapter, DeliveryResult

logger = logging.getLogger(__name__)


def render_safe_email_html(
    title: str,
    body: str,
    cta_label: Optional[str] = None,
    deep_link: Optional[str] = None,
    company_name: Optional[str] = None,
) -> str:
    """Render an XSS-safe HTML email wrapper using Python's `html.escape`."""
    safe_title = html.escape(title or "")
    safe_body = html.escape(body or "").replace("\n", "<br/>")
    brand = html.escape(company_name or settings.COMPANY_NAME)
    cta_block = ""
    if cta_label and deep_link:
        dl_clean = deep_link.strip()
        dl_lower = dl_clean.lower()
        is_safe_href = (
            dl_clean.startswith("/")
            or dl_lower.startswith("shopnojatra://")
            or dl_lower.startswith("https://")
            or dl_lower.startswith("http://")
            or dl_lower.startswith("mailto:")
        ) and not any(bad in dl_lower for bad in ("javascript:", "data:", "vbscript:"))
        if is_safe_href:
            safe_cta = html.escape(cta_label)
            safe_link = html.escape(dl_clean, quote=True)
            cta_block = (
                f'<p style="margin:24px 0;"><a href="{safe_link}" '
                f'style="background:#0D47A1;color:#fff;padding:12px 20px;text-decoration:none;'
                f'border-radius:6px;font-weight:bold;">{safe_cta}</a></p>'
            )
    return (
        '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6;">'
        f'<div style="background:#0D47A1;color:#fff;padding:18px 24px;">'
        f'<h2 style="margin:0;">{brand}</h2></div>'
        f'<div style="padding:24px;border:1px solid #e5e7eb;border-top:none;">'
        f'<h3 style="margin-top:0;">{safe_title}</h3>'
        f'<p>{safe_body}</p>{cta_block}'
        f'<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>'
        f'<p style="font-size:12px;color:#6b7280;">{brand} | {html.escape(settings.SUPPORT_EMAIL)}</p>'
        "</div></body></html>"
    )


class EmailDeliveryAdapter(BaseDeliveryAdapter):
    """
    SMTP email delivery adapter with custom driver injection and dev mocking.
    """

    channel = "email"
    provider_name = "smtp"

    def __init__(
        self,
        driver: Optional[Any] = None,
        mock_mode: Optional[bool] = None,
    ) -> None:
        self.driver = driver
        if mock_mode is not None:
            self.mock_mode = mock_mode
        else:
            env = (settings.ENVIRONMENT or "development").lower()
            no_creds = not settings.SMTP_PASSWORD or settings.SMTP_PASSWORD in (
                "mock-smtp-password",
                "your-smtp-password",
            )
            self.mock_mode = env in ("test", "testing") or no_creds
        self.dispatches: List[Dict[str, Any]] = []
        self._healthy = True

    def is_healthy(self) -> bool:
        return self._healthy

    @staticmethod
    def _is_valid_email(addr: str) -> bool:
        if not addr or "@" not in addr or any(c.isspace() for c in addr):
            return False
        local, _, domain = addr.partition("@")
        return bool(local) and "." in domain and not domain.startswith(".") and not domain.endswith(".")

    async def deliver(
        self,
        recipient: str,
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> DeliveryResult:
        t0 = time.perf_counter()
        recipient_email = (recipient or "").strip()
        payload_data = dict(data or {})

        if not self._is_valid_email(recipient_email):
            return DeliveryResult(
                success=False,
                channel=self.channel,
                provider="mock_smtp" if self.mock_mode else self.provider_name,
                recipient=recipient_email,
                status="failed",
                latency_ms=self._elapsed_ms(t0),
                error_code="INVALID_EMAIL_ADDRESS",
                error_message=f"Invalid recipient email address: {recipient_email!r}",
            )

        html_body = kwargs.get("html_body") or payload_data.get("email_html")
        if not html_body:
            html_body = render_safe_email_html(
                title=title,
                body=body,
                cta_label=kwargs.get("cta") or payload_data.get("cta"),
                deep_link=kwargs.get("deep_link") or payload_data.get("deep_link"),
            )

        # 1. Custom injected driver
        if self.driver is not None:
            try:
                msg_id = await self.driver.send(recipient_email, title, html_body)
                now = datetime.now(timezone.utc)
                return DeliveryResult(
                    success=True,
                    channel=self.channel,
                    provider="custom_email_driver",
                    recipient=recipient_email,
                    provider_message_id=str(msg_id),
                    status="delivered",
                    latency_ms=self._elapsed_ms(t0),
                    sent_at=now,
                    delivered_at=now,
                )
            except Exception as exc:
                logger.error(f"Email driver failure for {recipient_email}: {exc}")
                return DeliveryResult(
                    success=False,
                    channel=self.channel,
                    provider="custom_email_driver",
                    recipient=recipient_email,
                    status="failed",
                    latency_ms=self._elapsed_ms(t0),
                    error_code=type(exc).__name__,
                    error_message=str(exc),
                )

        # 2. Safe Dev/Test Mock
        if self.mock_mode:
            now = datetime.now(timezone.utc)
            msg_id = f"smtp-msg-{uuid.uuid4().hex[:12]}"
            self.dispatches.append({
                "message_id": msg_id,
                "recipient": recipient_email,
                "subject": title,
                "body": html_body,
                "plain_body": body,
                "data": payload_data,
                "timestamp": now,
            })
            logger.info(f"[DEV MOCK] Simulated Email to {recipient_email}: Subject='{title}'")
            return DeliveryResult(
                success=True,
                channel=self.channel,
                provider="mock_smtp",
                recipient=recipient_email,
                provider_message_id=msg_id,
                status="delivered",
                latency_ms=self._elapsed_ms(t0),
                sent_at=now,
                delivered_at=now,
                metadata={"mock": True},
            )

        # 3. Real SMTP dispatch offloaded to worker thread
        try:
            await asyncio.to_thread(self._send_smtp_blocking, recipient_email, title, html_body, body)
            now = datetime.now(timezone.utc)
            msg_id = f"smtp-{uuid.uuid4().hex[:12]}"
            return DeliveryResult(
                success=True,
                channel=self.channel,
                provider=self.provider_name,
                recipient=recipient_email,
                provider_message_id=msg_id,
                status="sent",
                latency_ms=self._elapsed_ms(t0),
                sent_at=now,
            )
        except Exception as exc:
            logger.error(f"SMTP dispatch failed for {recipient_email}: {exc}")
            return DeliveryResult(
                success=False,
                channel=self.channel,
                provider=self.provider_name,
                recipient=recipient_email,
                status="failed",
                latency_ms=self._elapsed_ms(t0),
                error_code=type(exc).__name__,
                error_message=str(exc),
            )

    @staticmethod
    def _send_smtp_blocking(to_email: str, subject: str, html_content: str, plain_text: str) -> None:
        msg = email.message.EmailMessage()
        msg["Subject"] = subject
        msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
        msg["To"] = to_email
        msg.set_content(plain_text or subject)
        msg.add_alternative(html_content, subtype="html")

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
