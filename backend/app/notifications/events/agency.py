"""
Domain Events: Agency & B2B Operations (Category 5).
Covers Partner Agency KYC Onboarding, Approvals, Expirations, and Commission Payout Batches.
"""

from app.notifications.events.base import DomainEvent
from app.notifications.events.registry import register_event


@register_event
class AgencyKycSubmittedEvent(DomainEvent):
    """
    Emitted when a partner travel agency submits Trade License and TIN documents for verification.
    Priority Normal (5).
    Default channels: ["in_app", "email"].
    """
    event_type: str = "agency.kyc.submitted"
    aggregate_type: str = "agency"
    priority: int = 5


@register_event
class AgencyKycApprovedEvent(DomainEvent):
    """
    Emitted when compliance officers verify Trade License and approve agency credit tiers.
    High Priority P1 (7).
    Default channels: ["in_app", "email", "sms"].
    """
    event_type: str = "agency.kyc.approved"
    aggregate_type: str = "agency"
    priority: int = 7


@register_event
class AgencyKycExpiringWarningEvent(DomainEvent):
    """
    Emitted 30/15/7 days prior to expiry of a verified trade license or operating permit.
    Priority Normal (6).
    Default channels: ["in_app", "email"].
    """
    event_type: str = "agency.kyc.expiring_warning"
    aggregate_type: str = "agency"
    priority: int = 6


@register_event
class AgencyPayoutBatchProcessedEvent(DomainEvent):
    """
    Emitted when periodic agency commission settlements (BEFTN/bKash) are successfully executed.
    High Priority P1 (7).
    Default channels: ["in_app", "email"].
    """
    event_type: str = "agency.payout.batch_processed"
    aggregate_type: str = "payout_batch"
    priority: int = 7
