"""
Central Authorization Service.

Provides server-side authorization checks over organization and tenant
memberships. All checks are database-backed; the client is never trusted for
membership or role claims.
"""

import logging
import uuid
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import PermissionDeniedError
from app.models.tenant import OrganizationMembership, TenantMembership
from app.models.user import AdminUser

logger = logging.getLogger(__name__)


class AuthorizationService:
    """Central authorization service for organization and tenant access."""

    # ------------------------------------------------------------------
    # Organization membership checks (Item 2)
    # ------------------------------------------------------------------

    @staticmethod
    async def is_organization_member(
        db: AsyncSession, user_id: uuid.UUID, organization_id: uuid.UUID
    ) -> bool:
        """Return True if the user has an active membership in the organization."""
        stmt = select(OrganizationMembership).where(
            OrganizationMembership.user_id == user_id,
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.status == "active",
        )
        res = await db.execute(stmt)
        return res.scalar_one_or_none() is not None

    @staticmethod
    async def require_organization_membership(
        db: AsyncSession, user_id: uuid.UUID, organization_id: uuid.UUID
    ) -> OrganizationMembership:
        """Return the membership or raise PermissionDeniedError."""
        stmt = select(OrganizationMembership).where(
            OrganizationMembership.user_id == user_id,
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.status == "active",
        )
        res = await db.execute(stmt)
        membership = res.scalar_one_or_none()
        if not membership:
            raise PermissionDeniedError(
                "You are not an active member of this organization."
            )
        return membership

    @staticmethod
    async def user_organizations(db: AsyncSession, user_id: uuid.UUID):
        """Return all organizations the user is an active member of."""
        from app.models.tenant import Organization

        stmt = (
            select(Organization)
            .join(
                OrganizationMembership,
                OrganizationMembership.organization_id == Organization.id,
            )
            .where(
                OrganizationMembership.user_id == user_id,
                OrganizationMembership.status == "active",
                Organization.status == "active",
            )
        )
        res = await db.execute(stmt)
        return list(res.scalars().all())

    # ------------------------------------------------------------------
    # Tenant membership checks (Item 1)
    # ------------------------------------------------------------------

    @staticmethod
    async def is_tenant_member(
        db: AsyncSession, user_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> bool:
        """Return True if the user has an active membership in the tenant."""
        stmt = select(TenantMembership).where(
            TenantMembership.user_id == user_id,
            TenantMembership.tenant_id == tenant_id,
            TenantMembership.status == "active",
        )
        res = await db.execute(stmt)
        return res.scalar_one_or_none() is not None

    @staticmethod
    async def require_tenant_membership(
        db: AsyncSession, user_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> TenantMembership:
        """Return the tenant membership or raise PermissionDeniedError."""
        stmt = select(TenantMembership).where(
            TenantMembership.user_id == user_id,
            TenantMembership.tenant_id == tenant_id,
            TenantMembership.status == "active",
        )
        res = await db.execute(stmt)
        membership = res.scalar_one_or_none()
        if not membership:
            raise PermissionDeniedError(
                "You are not an active member of this tenant."
            )
        return membership

    # ------------------------------------------------------------------
    # Admin checks
    # ------------------------------------------------------------------

    @staticmethod
    async def is_admin(db: AsyncSession, user_id: uuid.UUID) -> bool:
        """Return True if the user has an active admin_users record."""
        stmt = select(AdminUser).where(
            AdminUser.user_id == user_id, AdminUser.status == "active"
        )
        res = await db.execute(stmt)
        return res.scalar_one_or_none() is not None

    @staticmethod
    async def require_admin(db: AsyncSession, user_id: uuid.UUID) -> AdminUser:
        """Return the admin record or raise PermissionDeniedError."""
        stmt = select(AdminUser).where(
            AdminUser.user_id == user_id, AdminUser.status == "active"
        )
        res = await db.execute(stmt)
        admin = res.scalar_one_or_none()
        if not admin:
            raise PermissionDeniedError("Administrator privileges required.")
        return admin
