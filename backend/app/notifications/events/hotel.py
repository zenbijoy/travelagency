"""
Domain Events: Hotel Partner & Hospitality (Category 6).
Covers Low Room Inventory, Guest Check-In Reminders, Reviews, and Staff Assignments.
"""

from app.notifications.events.base import DomainEvent
from app.notifications.events.registry import register_event


@register_event
class HotelRoomInventoryLowEvent(DomainEvent):
    """
    Emitted when available rooms for a given category fall below reorder/low threshold (e.g. <= 2).
    Priority Normal (5).
    Default channels: ["in_app", "email"].
    """
    event_type: str = "hotel.room.inventory_low"
    aggregate_type: str = "hotel_room"
    priority: int = 5


@register_event
class HotelGuestCheckInReminderEvent(DomainEvent):
    """
    Emitted on the morning of scheduled check-in with hotel address and directions.
    Priority Normal (5).
    Default channels: ["push", "in_app"].
    """
    event_type: str = "hotel.guest.check_in_reminder"
    aggregate_type: str = "booking"
    priority: int = 5


@register_event
class HotelReviewSubmittedEvent(DomainEvent):
    """
    Emitted when a verified guest publishes a star rating and comment for a hotel stay.
    Priority Low (4).
    Default channels: ["in_app"].
    """
    event_type: str = "hotel.review.submitted"
    aggregate_type: str = "hotel_review"
    priority: int = 4


@register_event
class HotelStaffAssignedEvent(DomainEvent):
    """
    Emitted when front desk staff or manager permissions are granted to hotel staff accounts.
    Priority Normal (5).
    Default channels: ["in_app", "email"].
    """
    event_type: str = "hotel.staff.assigned"
    aggregate_type: str = "hotel"
    priority: int = 5
