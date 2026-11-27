"""
Domain Events: Travel Products & Inventory (Category 4).
Covers Flight Price Alerts, Schedule Changes, Hotel Confirmations, and Severe Travel Disruptions.
"""

from app.notifications.events.base import DomainEvent
from app.notifications.events.registry import register_event


@register_event
class FlightPriceAlertTriggeredEvent(DomainEvent):
    """
    Emitted when automated fare sampling detects a price drop below traveler target threshold.
    Priority Normal (6). Respects quiet hours.
    Default channels: ["push", "in_app"].
    """
    event_type: str = "flight.price_alert.triggered"
    aggregate_type: str = "price_alert"
    priority: int = 6


@register_event
class FlightScheduleChangedEvent(DomainEvent):
    """
    Emitted when an airline reschedules departure, reports a flight delay, or reassigns a terminal gate.
    Critical Priority P0 (9). Strict bypass of quiet hours.
    Default channels: ["push", "sms", "in_app"].
    """
    event_type: str = "flight.schedule_changed"
    aggregate_type: str = "flight"
    priority: int = 9


@register_event
class HotelBookingConfirmedEvent(DomainEvent):
    """
    Emitted when hotel partner reservation is acknowledged and room allocation secured.
    High Priority P1 (8).
    Default channels: ["in_app", "email"].
    """
    event_type: str = "hotel.booking.confirmed"
    aggregate_type: str = "hotel_booking"
    priority: int = 8


@register_event
class TravelDisruptionDetectedEvent(DomainEvent):
    """
    Emitted when external weather warnings (cyclones, monsoons) or road blockades threaten travel itineraries.
    Critical Priority P0 (9). Strict bypass of quiet hours.
    Default channels: ["push", "sms", "in_app"].
    """
    event_type: str = "travel.disruption.detected"
    aggregate_type: str = "disruption"
    priority: int = 9
