"""
Domain Events: Security & Defense (Category 2).
Covers OTP codes, New Device Logins, Bot Detections, and Password Modifications.
"""

from app.notifications.events.base import DomainEvent
from app.notifications.events.registry import register_event


@register_event
class OtpRequestedEvent(DomainEvent):
    """
    Emitted when an OTP code is generated for 2FA, phone verification, or payout authorization.
    Critical Emergency Priority P0 (10). Bypasses quiet hours.
    Default channels: ["sms"].
    """
    event_type: str = "security.auth.otp_requested"
    aggregate_type: str = "security"
    priority: int = 10


@register_event
class NewDeviceLoginEvent(DomainEvent):
    """
    Emitted when authentication occurs from an unrecognized user-agent, fingerprint, or IP subnet.
    Critical Priority P0 (9). Bypasses quiet hours.
    Default channels: ["email", "push", "in_app"].
    """
    event_type: str = "security.auth.new_device_login"
    aggregate_type: str = "session"
    priority: int = 9


@register_event
class BotDetectedEvent(DomainEvent):
    """
    Emitted when automated scraping, credential stuffing, or rate-limit violations trigger security defense.
    High Priority P1 (8).
    Default channels: ["in_app", "webhook"].
    """
    event_type: str = "security.defense.bot_detected"
    aggregate_type: str = "security_gate"
    priority: int = 8


@register_event
class PasswordChangedEvent(DomainEvent):
    """
    Emitted when an account password is modified or reset.
    Critical Priority P0 (9). Bypasses quiet hours.
    Default channels: ["email", "push"].
    """
    event_type: str = "security.auth.password_changed"
    aggregate_type: str = "user"
    priority: int = 9
