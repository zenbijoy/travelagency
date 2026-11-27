"""
Domain Events: User & Account (Category 1).
Covers User Registration, Profile Updates, and Loyalty Tier Milestones.
"""

from app.notifications.events.base import DomainEvent
from app.notifications.events.registry import register_event


@register_event
class UserRegisteredEvent(DomainEvent):
    """
    Emitted when a new traveler or agency account is created.
    Default channels: ["email", "in_app"].
    """
    event_type: str = "user.registered"
    aggregate_type: str = "user"
    priority: int = 5


@register_event
class UserProfileUpdatedEvent(DomainEvent):
    """
    Emitted when personal profile details, preferences, or emergency contacts change.
    Default channels: ["in_app"].
    """
    event_type: str = "user.profile_updated"
    aggregate_type: str = "profile"
    priority: int = 3


@register_event
class UserLoyaltyTierUpgradedEvent(DomainEvent):
    """
    Emitted when a customer earns enough points/trips to advance to Silver, Gold, or Platinum tier.
    Default channels: ["in_app", "push", "email"].
    """
    event_type: str = "user.loyalty.tier_upgraded"
    aggregate_type: str = "loyalty"
    priority: int = 6


@register_event
class UserLoyaltyPointsAwardedEvent(DomainEvent):
    """
    Emitted when loyalty reward points are credited following booking completion or promotion.
    Default channels: ["in_app"].
    """
    event_type: str = "user.loyalty.points_awarded"
    aggregate_type: str = "loyalty"
    priority: int = 3
