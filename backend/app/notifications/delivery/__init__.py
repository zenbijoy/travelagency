"""
Pluggable Multi-Channel Notification Delivery Adapters.
"""

from typing import Dict, Optional

from app.notifications.delivery.base import BaseDeliveryAdapter, DeliveryResult
from app.notifications.delivery.email import EmailDeliveryAdapter, render_safe_email_html
from app.notifications.delivery.in_app import InAppDeliveryAdapter
from app.notifications.delivery.push import PushDeliveryAdapter, is_valid_push_token
from app.notifications.delivery.sms import SmsDeliveryAdapter, normalize_phone_e164


def build_default_adapters(mock_mode: Optional[bool] = None) -> Dict[str, BaseDeliveryAdapter]:
    """Instantiate the standard multi-channel adapter map keyed by channel name."""
    return {
        "push": PushDeliveryAdapter(mock_mode=mock_mode),
        "in_app": InAppDeliveryAdapter(),
        "email": EmailDeliveryAdapter(mock_mode=mock_mode),
        "sms": SmsDeliveryAdapter(mock_mode=mock_mode),
    }


__all__ = [
    "BaseDeliveryAdapter",
    "DeliveryResult",
    "PushDeliveryAdapter",
    "is_valid_push_token",
    "InAppDeliveryAdapter",
    "EmailDeliveryAdapter",
    "SmsDeliveryAdapter",
    "render_safe_email_html",
    "normalize_phone_e164",
    "build_default_adapters",
]
