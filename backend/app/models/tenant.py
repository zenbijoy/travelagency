"""
Tenant, Tenant Membership, Organization, Organization Membership, and Cell Models.

Tenants are the multi-tenancy isolation boundary. Tenant IDs are NEVER accepted
from the client; tenant context is resolved server-side from the authenticated
user's memberships (never trust client-supplied tenant IDs).

Organizations are the central authorization/organization registry, distinct from
the tenant isolation boundary. Cells provide cell-based deployment routing
metadata (tenant registry).
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import DateTime, ForeignKey, Index, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class Tenant(Base, TimestampMixin, UUIDMixin):
    """Corresponds to public.tenants.

    Multi-tenancy isolation boundary. One tenant per customer/organization.
    """

    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[Optional[str]] = mapped_column(Text, unique=True, index=True)
    status: Mapped[str] = mapped_column(Text, default="active", nullable=False)  # active, suspended, archived
    plan: Mapped[str] = mapped_column(Text, default="standard", nullable=False)
    settings: Mapped[Dict[str, Any]] = mapped_column("metadata", JSON, default=dict)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)

    memberships: Mapped[List["TenantMembership"]] = relationship(
        "TenantMembership", back_populates="tenant", cascade="all, delete-orphan"
    )
    cell_assignments: Mapped[List["TenantCellAssignment"]] = relationship(
        "TenantCellAssignment", back_populates="tenant", cascade="all, delete-orphan"
    )


class TenantMembership(Base, TimestampMixin, UUIDMixin):
    """Corresponds to public.tenant_memberships.

    Server-authoritative user <-> tenant association.
    The client is NEVER allowed to supply a tenant_id; membership is resolved
    server-side from this table.
    """

    __tablename__ = "tenant_memberships"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(index=True, nullable=False)
    role: Mapped[str] = mapped_column(Text, default="member", nullable=False)  # owner, admin, member, viewer
    status: Mapped[str] = mapped_column(Text, default="active", nullable=False)  # active, invited, removed

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="memberships")

    __table_args__ = (
        UniqueConstraint("tenant_id", "user_id", name="uq_tenant_memberships_tenant_user"),
        Index("idx_tenant_memberships_user_status", "user_id", "status"),
        Index("idx_tenant_memberships_tenant_status", "tenant_id", "status"),
    )


class Organization(Base, TimestampMixin, UUIDMixin):
    """Corresponds to public.organizations.

    Central organization registry used by central authorization.
    Distinct from the tenant isolation boundary.
    """

    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[Optional[str]] = mapped_column(Text, unique=True, index=True)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(index=True, nullable=False)
    status: Mapped[str] = mapped_column(Text, default="active", nullable=False)  # active, suspended, archived
    settings: Mapped[Dict[str, Any]] = mapped_column("metadata", JSON, default=dict)

    memberships: Mapped[List["OrganizationMembership"]] = relationship(
        "OrganizationMembership", back_populates="organization", cascade="all, delete-orphan"
    )


class OrganizationMembership(Base, TimestampMixin, UUIDMixin):
    """Corresponds to public.organization_memberships.

    Central authorization membership records.
    """

    __tablename__ = "organization_memberships"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(index=True, nullable=False)
    role: Mapped[str] = mapped_column(Text, default="member", nullable=False)  # owner, admin, member, viewer
    status: Mapped[str] = mapped_column(Text, default="active", nullable=False)  # active, invited, removed

    organization: Mapped["Organization"] = relationship("Organization", back_populates="memberships")

    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", name="uq_organization_memberships_org_user"),
        Index("idx_organization_memberships_user_status", "user_id", "status"),
        Index("idx_organization_memberships_org_status", "organization_id", "status"),
    )


class Cell(Base, TimestampMixin, UUIDMixin):
    """Corresponds to public.cells.

    Cell-based deployment unit (region / cluster / shard) for tenant routing.
    """

    __tablename__ = "cells"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str] = mapped_column(Text, unique=True, nullable=False, index=True)
    region: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, default="active", nullable=False)  # active, draining, offline
    capacity: Mapped[Dict[str, Any]] = mapped_column("metadata", JSON, default=dict)
    cell_metadata: Mapped[Dict[str, Any]] = mapped_column("cell_metadata", JSON, default=dict)

    assignments: Mapped[List["TenantCellAssignment"]] = relationship(
        "TenantCellAssignment", back_populates="cell", cascade="all, delete-orphan"
    )


class TenantCellAssignment(Base, TimestampMixin, UUIDMixin):
    """Corresponds to public.tenant_cell_assignments.

    Server-assigned tenant-to-cell routing metadata.
    A tenant is assigned to exactly one active cell at a time.
    """

    __tablename__ = "tenant_cell_assignments"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cell_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cells.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    assigned_by: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(Text, default="active", nullable=False)  # active, retired

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="cell_assignments")
    cell: Mapped["Cell"] = relationship("Cell", back_populates="assignments")

    __table_args__ = (
        UniqueConstraint("tenant_id", "cell_id", "status", name="uq_tenant_cell_assignments_tenant_cell_status"),
        Index("idx_tenant_cell_assignments_tenant_status", "tenant_id", "status"),
        Index("idx_tenant_cell_assignments_cell_status", "cell_id", "status"),
    )