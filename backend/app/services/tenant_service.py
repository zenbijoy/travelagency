"""
Tenant Service: tenant context resolution, memberships, and cell assignment.

Security notes:
- Tenant IDs are NEVER trusted from the client. Tenant context is resolved
  server-side from the authenticated user's tenant_memberships.
- If the client supplies an X-Tenant-Id header, it is validated against the
  user's active memberships before being honored.
"""

import logging
import uuid
from typing import List, Optional
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, NotFoundError, PermissionDeniedError
from app.models.tenant import (
    Cell,
    Organization,
    OrganizationMembership,
    Tenant,
    TenantCellAssignment,
    TenantMembership,
)
from app.schemas.tenant import (
    TenantCellAssignmentCreate,
    TenantCreate,
    TenantMembershipCreate,
    TenantUpdate,
)

logger = logging.getLogger(__name__)


class TenantService:
    """Tenant lifecycle, membership, and cell-assignment operations."""

    # ------------------------------------------------------------------
    # Tenant context resolution (Item 1: tenant context + isolation)
    # ------------------------------------------------------------------

    @staticmethod
    async def list_user_tenants(
        db: AsyncSession, user_id: uuid.UUID
    ) -> List[Tenant]:
        """Return all active tenants the user is an active member of."""
        stmt = (
            select(Tenant)
            .join(
                TenantMembership,
                and_(
                    TenantMembership.tenant_id == Tenant.id,
                    TenantMembership.user_id == user_id,
                    TenantMembership.status == "active",
                ),
            )
            .where(Tenant.status == "active")
            .order_by(Tenant.name)
        )
        res = await db.execute(stmt)
        return list(res.scalars().all())

    @staticmethod
    async def get_user_membership(
        db: AsyncSession, user_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> Optional[TenantMembership]:
        """Fetch the user's membership record for a tenant (server-authoritative)."""
        stmt = select(TenantMembership).where(
            TenantMembership.user_id == user_id,
            TenantMembership.tenant_id == tenant_id,
            TenantMembership.status == "active",
        )
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    @staticmethod
    async def resolve_tenant_context(
        db: AsyncSession,
        user_id: uuid.UUID,
        requested_tenant_id: Optional[uuid.UUID] = None,
    ) -> dict:
        """Resolve server-side tenant context for the current request.

        Never trusts client-supplied tenant IDs. A client-supplied id is only
        honored if the user has an active membership in that tenant.

        Resolution order:
        1. If requested_tenant_id supplied -> validate membership -> use it.
        2. Else if user has exactly one active tenant -> use it.
        3. Else -> raise BadRequestError asking client to specify a tenant.

        Returns a dict suitable for building TenantContext.
        """
        tenants = await TenantService.list_user_tenants(db, user_id)
        memberships: List[TenantMembership] = []
        for t in tenants:
            m = await TenantService.get_user_membership(db, user_id, t.id)
            if m:
                memberships.append(m)

        selected_tenant: Optional[Tenant] = None
        selected_membership: Optional[TenantMembership] = None

        if requested_tenant_id is not None:
            # Validate client-supplied tenant server-side (never trust blindly).
            match = next((t for t in tenants if t.id == requested_tenant_id), None)
            if match is None:
                raise BadRequestError(
                    "You are not a member of the requested tenant. "
                    "Tenant IDs are resolved server-side and cannot be spoofed."
                )
            selected_tenant = match
            selected_membership = next(
                (m for m in memberships if m.tenant_id == requested_tenant_id), None
            )
        elif len(tenants) == 1:
            selected_tenant = tenants[0]
            selected_membership = memberships[0] if memberships else None
        elif len(tenants) > 1:
            raise BadRequestError(
                "User belongs to multiple tenants. Please specify a tenant via "
                "the X-Tenant-Id header. Available tenants: "
                + ", ".join(str(t.id) for t in tenants)
            )
        # else: no tenants -> selected_tenant stays None (caller decides)

        return {
            "tenant_id": selected_tenant.id if selected_tenant else None,
            "tenant": selected_tenant,
            "membership": selected_membership,
            "memberships": memberships,
            "is_admin": bool(
                selected_membership
                and selected_membership.role in ("owner", "admin")
            ),
        }

    # ------------------------------------------------------------------
    # Tenant lifecycle
    # ------------------------------------------------------------------

    @staticmethod
    async def create_tenant(
        db: AsyncSession, tenant_in: TenantCreate, created_by: Optional[uuid.UUID] = None
    ) -> Tenant:
        """Idempotently create a tenant by slug."""
        if tenant_in.slug:
            existing = await db.execute(
                select(Tenant).where(Tenant.slug == tenant_in.slug)
            )
            if existing.scalar_one_or_none():
                raise BadRequestError(f"Tenant slug '{tenant_in.slug}' already exists.")

        tenant = Tenant(
            name=tenant_in.name,
            slug=tenant_in.slug,
            status=tenant_in.status,
            plan=tenant_in.plan,
            settings=tenant_in.settings,
            created_by=created_by,
        )
        db.add(tenant)
        await db.flush()
        await db.refresh(tenant)
        logger.info(f"[Tenant] Created tenant {tenant.id} ({tenant.slug})")
        return tenant

    @staticmethod
    async def get_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> Optional[Tenant]:
        res = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
        return res.scalar_one_or_none()

    @staticmethod
    async def update_tenant(
        db: AsyncSession, tenant_id: uuid.UUID, tenant_in: TenantUpdate
    ) -> Tenant:
        tenant = await TenantService.get_tenant(db, tenant_id)
        if not tenant:
            raise NotFoundError("Tenant", tenant_id)
        data = tenant_in.model_dump(exclude_unset=True)
        for field, value in data.items():
            setattr(tenant, field, value)
        await db.flush()
        await db.refresh(tenant)
        return tenant

    # ------------------------------------------------------------------
    # Memberships (Item 2: organization/tenant memberships)
    # ------------------------------------------------------------------

    @staticmethod
    async def add_member(
        db: AsyncSession, membership_in: TenantMembershipCreate
    ) -> TenantMembership:
        """Add a user to a tenant. Idempotent on (tenant_id, user_id)."""
        existing = await TenantService.get_user_membership(
            db, membership_in.user_id, membership_in.tenant_id
        )
        if existing:
            # Reactivate/update role if previously removed
            existing.role = membership_in.role
            existing.status = "active"
            await db.flush()
            await db.refresh(existing)
            return existing

        membership = TenantMembership(
            tenant_id=membership_in.tenant_id,
            user_id=membership_in.user_id,
            role=membership_in.role,
            status="active",
        )
        db.add(membership)
        await db.flush()
        await db.refresh(membership)
        logger.info(
            f"[Tenant] Added user {membership_in.user_id} to tenant {membership_in.tenant_id} "
            f"as {membership_in.role}"
        )
        return membership

    @staticmethod
    async def remove_member(
        db: AsyncSession, user_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> bool:
        """Soft-remove a user's membership (status = 'removed')."""
        membership = await TenantService.get_user_membership(db, user_id, tenant_id)
        if not membership:
            return False
        membership.status = "removed"
        await db.flush()
        return True

    # ------------------------------------------------------------------
    # Cell assignment (Item 4: tenant registry + cell assignment metadata)
    # ------------------------------------------------------------------

    @staticmethod
    async def get_cell(db: AsyncSession, cell_id: uuid.UUID) -> Optional[Cell]:
        res = await db.execute(select(Cell).where(Cell.id == cell_id))
        return res.scalar_one_or_none()

    @staticmethod
    async def assign_cell(
        db: AsyncSession, assignment_in: TenantCellAssignmentCreate
    ) -> TenantCellAssignment:
        """Assign a tenant to a cell. Retires any prior active assignment for
        the same (tenant_id, cell_id) pair so a tenant routes to one active cell."""
        cell = await TenantService.get_cell(db, assignment_in.cell_id)
        if not cell:
            raise NotFoundError("Cell", assignment_in.cell_id)
        tenant = await TenantService.get_tenant(db, assignment_in.tenant_id)
        if not tenant:
            raise NotFoundError("Tenant", assignment_in.tenant_id)

        # Retire prior active assignments for this tenant
        stmt = select(TenantCellAssignment).where(
            TenantCellAssignment.tenant_id == assignment_in.tenant_id,
            TenantCellAssignment.status == "active",
        )
        res = await db.execute(stmt)
        for prior in res.scalars().all():
            prior.status = "retired"

        assignment = TenantCellAssignment(
            tenant_id=assignment_in.tenant_id,
            cell_id=assignment_in.cell_id,
            assigned_by=assignment_in.assigned_by,
            status="active",
        )
        db.add(assignment)
        await db.flush()
        await db.refresh(assignment)
        logger.info(
            f"[Tenant] Assigned tenant {assignment_in.tenant_id} to cell {assignment_in.cell_id}"
        )
        return assignment

    @staticmethod
    async def get_tenant_cell(
        db: AsyncSession, tenant_id: uuid.UUID
    ) -> Optional[Cell]:
        """Return the active cell assigned to a tenant (routing metadata)."""
        stmt = (
            select(Cell)
            .join(
                TenantCellAssignment,
                and_(
                    TenantCellAssignment.cell_id == Cell.id,
                    TenantCellAssignment.tenant_id == tenant_id,
                    TenantCellAssignment.status == "active",
                ),
            )
            .where(Cell.status == "active")
        )
        res = await db.execute(stmt)
        return res.scalar_one_or_none()


