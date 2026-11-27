"""
Domain Event Registry & Event Definitions across all 8 Travel Domains.
"""

from app.notifications.events.base import DomainEvent
from app.notifications.events.registry import (
    EVENT_REGISTRY,
    get_event_class,
    parse_event_dict,
    register_event,
)

# User & Account Events (Category 1)
from app.notifications.events.user import (
    UserLoyaltyPointsAwardedEvent,
    UserLoyaltyTierUpgradedEvent,
    UserProfileUpdatedEvent,
    UserRegisteredEvent,
)

# Security & Defense Events (Category 2)
from app.notifications.events.security import (
    BotDetectedEvent,
    NewDeviceLoginEvent,
    OtpRequestedEvent,
    PasswordChangedEvent,
)

# Booking & Reservation Events (Category 3)
from app.notifications.events.booking import (
    BookingCancelledEvent,
    BookingConfirmedEvent,
    BookingCreatedEvent,
    PaymentFailedEvent,
    PaymentSucceededEvent,
    TicketIssuedEvent,
)

# Travel Products & Inventory Events (Category 4)
from app.notifications.events.travel_product import (
    FlightPriceAlertTriggeredEvent,
    FlightScheduleChangedEvent,
    HotelBookingConfirmedEvent,
    TravelDisruptionDetectedEvent,
)

# Agency & B2B Operations Events (Category 5)
from app.notifications.events.agency import (
    AgencyKycApprovedEvent,
    AgencyKycExpiringWarningEvent,
    AgencyKycSubmittedEvent,
    AgencyPayoutBatchProcessedEvent,
)

# Hotel Partner & Hospitality Events (Category 6)
from app.notifications.events.hotel import (
    HotelGuestCheckInReminderEvent,
    HotelReviewSubmittedEvent,
    HotelRoomInventoryLowEvent,
    HotelStaffAssignedEvent,
)

# Marketplace & Local Guides Events (Category 7)
from app.notifications.events.marketplace import (
    MarketplaceGuideBookedEvent,
    MarketplaceGuideQuoteRequestedEvent,
    MarketplaceItineraryClonedEvent,
    MarketplaceTripSosTriggeredEvent,
)

# System Telemetry & Operational Health Events (Category 8)
from app.notifications.events.system import (
    SystemCampaignCompletedEvent,
    SystemDlqMessageQuarantinedEvent,
    SystemProviderCircuitBreakerTrippedEvent,
    SystemWorkerHealthHeartbeatEvent,
)

__all__ = [
    # Base and Registry
    "DomainEvent",
    "EVENT_REGISTRY",
    "register_event",
    "get_event_class",
    "parse_event_dict",
    # User (4)
    "UserRegisteredEvent",
    "UserProfileUpdatedEvent",
    "UserLoyaltyTierUpgradedEvent",
    "UserLoyaltyPointsAwardedEvent",
    # Security (4)
    "OtpRequestedEvent",
    "NewDeviceLoginEvent",
    "BotDetectedEvent",
    "PasswordChangedEvent",
    # Booking (6)
    "BookingCreatedEvent",
    "BookingConfirmedEvent",
    "PaymentSucceededEvent",
    "PaymentFailedEvent",
    "BookingCancelledEvent",
    "TicketIssuedEvent",
    # Travel Product (4)
    "FlightPriceAlertTriggeredEvent",
    "FlightScheduleChangedEvent",
    "HotelBookingConfirmedEvent",
    "TravelDisruptionDetectedEvent",
    # Agency (4)
    "AgencyKycSubmittedEvent",
    "AgencyKycApprovedEvent",
    "AgencyKycExpiringWarningEvent",
    "AgencyPayoutBatchProcessedEvent",
    # Hotel (4)
    "HotelRoomInventoryLowEvent",
    "HotelGuestCheckInReminderEvent",
    "HotelReviewSubmittedEvent",
    "HotelStaffAssignedEvent",
    # Marketplace (4)
    "MarketplaceTripSosTriggeredEvent",
    "MarketplaceGuideQuoteRequestedEvent",
    "MarketplaceGuideBookedEvent",
    "MarketplaceItineraryClonedEvent",
    # System (4)
    "SystemWorkerHealthHeartbeatEvent",
    "SystemDlqMessageQuarantinedEvent",
    "SystemProviderCircuitBreakerTrippedEvent",
    "SystemCampaignCompletedEvent",
]
