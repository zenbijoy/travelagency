"""
Domain Events: Booking & Reservation (Category 3).
Covers Booking Lifecycle, Payment Success/Failure, and Ticket Issuance.
"""

from app.notifications.events.base import DomainEvent
from app.notifications.events.registry import register_event


@register_event
class BookingCreatedEvent(DomainEvent):
    """
    Emitted when a customer reserves an inventory hold or initiates a booking.
    Priority Normal (6).
    Default channels: ["in_app"].
    """
    event_type: str = "booking.created"
    aggregate_type: str = "booking"
    priority: int = 6


@register_event
class BookingConfirmedEvent(DomainEvent):
    """
    Emitted upon successful payment and confirmation of room/seat allocations.
    Critical Priority P0 (9). Strict bypass of quiet hours.
    Default channels: ["in_app", "push", "email", "sms"].
    """
    event_type: str = "booking.confirmed"
    aggregate_type: str = "booking"
    priority: int = 9


@register_event
class PaymentSucceededEvent(DomainEvent):
    """
    Emitted when a payment gateway verifies a completed transaction.
    High Priority P1 (8). Bypasses quiet hours for instant receipts.
    Default channels: ["in_app", "email"].
    """
    event_type: str = "booking.payment_succeeded"
    aggregate_type: str = "payment"
    priority: int = 8


@register_event
class PaymentFailedEvent(DomainEvent):
    """
    Emitted when payment gateway checkout encounters an error, timeout, or insufficient balance.
    High Priority P1 (8).
    Default channels: ["in_app", "push", "sms"].
    """
    event_type: str = "booking.payment_failed"
    aggregate_type: str = "payment"
    priority: int = 8


@register_event
class BookingCancelledEvent(DomainEvent):
    """
    Emitted when an active booking is cancelled and release of inventory/refund processing starts.
    High Priority P1 (7).
    Default channels: ["in_app", "push", "email"].
    """
    event_type: str = "booking.cancelled"
    aggregate_type: str = "booking"
    priority: int = 7


@register_event
class TicketIssuedEvent(DomainEvent):
    """
    Emitted when tamper-proof signed e-tickets or boarding passes are generated.
    High Priority P1 (8).
    Default channels: ["in_app", "email"].
    """
    event_type: str = "booking.ticket_issued"
    aggregate_type: str = "ticket"
    priority: int = 8
