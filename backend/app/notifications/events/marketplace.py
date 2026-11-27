"""
Domain Events: Marketplace & Local Guides (Category 7).
Covers Traveler SOS Emergencies, Guide Quotes, Confirmed Guide Bookings, and Itinerary Clones.
"""

from app.notifications.events.base import DomainEvent
from app.notifications.events.registry import register_event


@register_event
class MarketplaceTripSosTriggeredEvent(DomainEvent):
    """
    Emitted when traveler activates the in-trip emergency SOS button or loses vital beacon contact.
    Emergency Critical Priority P0 (10). Strict bypass of quiet hours and frequency caps.
    Default channels: ["push", "sms", "in_app", "webhook"].
    """
    event_type: str = "marketplace.trip.sos_triggered"
    aggregate_type: str = "trip_session"
    priority: int = 10


@register_event
class MarketplaceGuideQuoteRequestedEvent(DomainEvent):
    """
    Emitted when a traveler requests a custom tour quote from a certified local guide.
    High Priority P1 (7).
    Default channels: ["push", "in_app", "sms"].
    """
    event_type: str = "marketplace.guide.quote_requested"
    aggregate_type: str = "marketplace_booking"
    priority: int = 7


@register_event
class MarketplaceGuideBookedEvent(DomainEvent):
    """
    Emitted when a guided tour booking is paid and scheduled on the marketplace.
    High Priority P1 (8).
    Default channels: ["in_app", "push", "sms"].
    """
    event_type: str = "marketplace.guide.booked"
    aggregate_type: str = "marketplace_booking"
    priority: int = 8


@register_event
class MarketplaceItineraryClonedEvent(DomainEvent):
    """
    Emitted when a community traveler forks/clones a public travel itinerary.
    Low Priority P3 (3).
    Default channels: ["in_app"].
    """
    event_type: str = "marketplace.itinerary.cloned"
    aggregate_type: str = "itinerary"
    priority: int = 3
