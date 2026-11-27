"""
Base Interfaces and Result Contracts for Pluggable Multi-Channel Delivery Adapters.
"""

from abc import ABC, abstractmethod
from datetime import datetime, timezone
import time
from typing import Any, Dict, Optional
from pydantic import BaseModel, ConfigDict, Field


class DeliveryResult(BaseModel):
    """
    Standardized outcome returned by every channel delivery adapter.
    Aligns with `notification_deliveries` telemetry columns.
    """
    model_config = ConfigDict(extra="ignore")

    success: bool
    channel: str
    provider: str
    recipient: str = ""
    provider_message_id: Optional[str] = None
    status: str = "delivered"  # queued | sending | sent | delivered | failed | bounced | read
    latency_ms: int = 0
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    sent_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    delivered_at: Optional[datetime] = None


class BaseDeliveryAdapter(ABC):
    """
    Abstract base contract for Push, In-App, Email, and SMS delivery adapters.
    """

    channel: str = "unknown"
    provider_name: str = "base"

    @abstractmethod
    async def deliver(
        self,
        recipient: str,
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> DeliveryResult:
        """
        Dispatch a notification payload to a single recipient over this channel.
        Must return a DeliveryResult(success=False, status='failed', ...) on provider failures.
        """
        raise NotImplementedError

    @abstractmethod
    def is_healthy(self) -> bool:
        """Return True if the adapter and its backing provider/circuit are healthy."""
        raise NotImplementedError

    def health_snapshot(self) -> Dict[str, Any]:
        """Return non-secret health telemetry for Admin Provider Health checks."""
        return {
            "channel": self.channel,
            "provider": self.provider_name,
            "healthy": self.is_healthy(),
            "mock_mode": bool(getattr(self, "mock_mode", False)),
        }

    @staticmethod
    def _elapsed_ms(start_perf: float) -> int:
        return max(0, int((time.perf_counter() - start_perf) * 1000))
