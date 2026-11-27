"""
User and Security Authentication Schemas.
"""

import uuid
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserRole(str, Enum):
    USER = "user"
    CREATOR = "creator"
    PARTNER = "partner"
    AGENCY = "agency"
    HOTEL_STAFF = "hotel_staff"
    ADMIN = "admin"


ADMIN_ROLE_PERMISSIONS: Dict[str, List[str]] = {
    "super_admin": [
        "users.view", "users.create", "users.ban", "users.suspend", "users.verify_kyc", "users.delete",
        "agencies.view", "agencies.create", "agencies.verify", "agencies.suspend", "agencies.reject", "agencies.reactivate",
        "hotels.view", "hotels.create", "hotels.verify", "hotels.suspend", "hotels.activate", "hotels.pricing",
        "marketplace.view", "marketplace.verify",
        "refunds.view", "refunds.approve", "refunds.process", "refunds.reject", "refunds.hold",
        "payments.view", "payments.settle",
        "commissions.view", "commissions.update", "commissions.payout",
        "bookings.view", "bookings.modify", "bookings.cancel",
        "destinations.view", "destinations.manage",
        "marketing.view", "marketing.campaigns", "ads.manage",
        "reviews.view", "reviews.moderate",
        "support.view", "support.manage", "notifications.send",
        "monitoring.view", "reports.view", "reports.export",
        "audit.view", "settings.view", "settings.manage", "rbac.manage",
    ],
    "admin": [
        "users.view", "users.create", "users.suspend", "users.verify_kyc",
        "agencies.view", "agencies.verify", "agencies.suspend", "agencies.reject", "agencies.reactivate",
        "hotels.view", "hotels.verify", "hotels.suspend", "hotels.activate",
        "marketplace.view", "marketplace.verify",
        "refunds.view", "refunds.approve", "refunds.process", "refunds.reject", "refunds.hold",
        "payments.view", "payments.settle",
        "commissions.view", "commissions.update", "commissions.payout",
        "bookings.view", "bookings.modify", "bookings.cancel",
        "destinations.view", "destinations.manage",
        "marketing.view", "marketing.campaigns", "ads.manage",
        "reviews.view", "reviews.moderate",
        "support.view", "support.manage", "notifications.send",
        "monitoring.view", "reports.view", "reports.export",
        "audit.view", "settings.view",
    ],
    "finance_admin": [
        "users.view", "agencies.view", "hotels.view", "bookings.view",
        "refunds.view", "refunds.approve", "refunds.process", "refunds.reject", "refunds.hold",
        "payments.view", "payments.settle",
        "commissions.view", "commissions.update", "commissions.payout",
        "reports.view", "reports.export", "audit.view",
    ],
    "support_admin": [
        "users.view", "users.verify_kyc", "users.suspend",
        "agencies.view", "hotels.view", "marketplace.view",
        "bookings.view", "bookings.modify", "bookings.cancel",
        "refunds.view", "refunds.hold",
        "reviews.view", "reviews.moderate",
        "support.view", "support.manage", "notifications.send",
        "monitoring.view", "audit.view",
    ],
    "marketing_admin": [
        "users.view", "destinations.view", "destinations.manage",
        "marketing.view", "marketing.campaigns", "ads.manage",
        "notifications.send", "reports.view",
    ],
    "content_admin": [
        "destinations.view", "destinations.manage",
        "reviews.view", "reviews.moderate",
        "marketing.view", "hotels.view", "marketplace.view",
    ],
    "agency_manager": [
        "agencies.view", "agencies.create", "agencies.verify", "agencies.suspend", "agencies.reject", "agencies.reactivate",
        "hotels.view", "hotels.verify", "hotels.suspend", "hotels.activate",
        "marketplace.view", "marketplace.verify",
        "bookings.view", "commissions.view", "audit.view",
    ],
    "readonly": [
        "users.view", "agencies.view", "hotels.view", "marketplace.view",
        "bookings.view", "refunds.view", "payments.view", "commissions.view",
        "destinations.view", "marketing.view", "reviews.view", "support.view",
        "monitoring.view", "reports.view", "audit.view", "settings.view",
    ],
}


class CurrentUser(BaseModel):
    """Authenticated user context resolved from Supabase JWT & DB RBAC."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: Optional[str] = None
    role: UserRole = UserRole.USER
    roles: List[str] = Field(default_factory=list)
    admin_role: Optional[str] = None
    admin_permissions: Dict[str, bool] = Field(default_factory=dict)
    agency_id: Optional[uuid.UUID] = None
    hotel_id: Optional[uuid.UUID] = None
    is_active: bool = True
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @property
    def is_active_admin(self) -> bool:
        return (
            self.role == UserRole.ADMIN
            or UserRole.ADMIN.value in self.roles
            or bool(self.admin_role)
        )

    def has_admin_permission(self, permission: str) -> bool:
        if not self.is_active_admin:
            return False
        if permission in self.admin_permissions:
            return bool(self.admin_permissions[permission])
        effective_role = (self.admin_role or "readonly").lower()
        return permission in ADMIN_ROLE_PERMISSIONS.get(effective_role, [])


class UserProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    display_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    role: str = "user"
    is_verified: bool = False
