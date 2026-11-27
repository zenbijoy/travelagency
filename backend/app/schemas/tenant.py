"""
Tenant, Organization, Membership, and Cell Schemas.

Tenant context is resolved server-side from the authenticated user's memberships;
clients never supply trusted tenant IDs.
"""

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Tenant
# ---------------------------------------------------------------------------
class TenantBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: Optional[str] = Field(None, min_length=1, max_length=100)
    status: str = Field("active", description="active, suspended, archived")
    plan: str = Field("standard")
    settings: Dict[str, Any] = Field(default_factory=dict)


class TenantCreate(TenantBase):
    created_by: Optional[uuid.UUID] = None


class TenantUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    slug: Optional[str] = None
    status: Optional[str] = None
    plan: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None


class TenantResponse(TenantBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Tenant Membership
# ---------------------------------------------------------------------------
class TenantMembershipBase(BaseModel):
    role: str = Field("member", description="owner, admin, member, viewer")
    status: str = Field("active", description="active, invited, removed")


class TenantMembershipCreate(TenantMembershipBase):
    tenant_id: uuid.UUID
    user_id: uuid.UUID


class TenantMembershipUpdate(BaseModel):
    role: Optional[str] = None
    status: Optional[str] = None


class TenantMembershipResponse(TenantMembershipBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Tenant Context (server-resolved, never client-trusted)
# ---------------------------------------------------------------------------
class TenantContext(BaseModel):
    """Server-resolved tenant isolation context for the current request.

    Populated from the authenticated user's server-side memberships. The
    client-supplied tenant id (if any) is validated against these memberships
    and never trusted blindly.
    """

    tenant_id: Optional[uuid.UUID] = None
    tenant: Optional[TenantResponse] = None
    membership: Optional[TenantMembershipResponse] = None
    memberships: List[TenantMembershipResponse] = Field(default_factory=list)
    is_admin: bool = False


# ---------------------------------------------------------------------------
# Organization
# ---------------------------------------------------------------------------
class OrganizationBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: Optional[str] = Field(None, min_length=1, max_length=100)
    owner_user_id: uuid.UUID
    status: str = Field("active", description="active, suspended, archived")
    settings: Dict[str, Any] = Field(default_factory=dict)


class OrganizationCreate(OrganizationBase):
    pass


class OrganizationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    slug: Optional[str] = None
    status: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None


class OrganizationResponse(OrganizationBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Organization Membership
# ---------------------------------------------------------------------------
class OrganizationMembershipBase(BaseModel):
    role: str = Field("member", description="owner, admin, member, viewer")
    status: str = Field("active", description="active, invited, removed")


class OrganizationMembershipCreate(OrganizationMembershipBase):
    organization_id: uuid.UUID
    user_id: uuid.UUID


class OrganizationMembershipUpdate(BaseModel):
    role: Optional[str] = None
    status: Optional[str] = None


class OrganizationMembershipResponse(OrganizationMembershipBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Cell
# ---------------------------------------------------------------------------
class CellBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=100)
    region: str = Field(..., min_length=1, max_length=100)
    status: str = Field("active", description="active, draining, offline")
    capacity: Dict[str, Any] = Field(default_factory=dict)
    cell_metadata: Dict[str, Any] = Field(default_factory=dict)


class CellCreate(CellBase):
    pass


class CellUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    slug: Optional[str] = None
    region: Optional[str] = None
    status: Optional[str] = None
    capacity: Optional[Dict[str, Any]] = None
    cell_metadata: Optional[Dict[str, Any]] = None


class CellResponse(CellBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Tenant Cell Assignment
# ---------------------------------------------------------------------------
class TenantCellAssignmentBase(BaseModel):
    cell_id: uuid.UUID
    status: str = Field("active", description="active, retired")


class TenantCellAssignmentCreate(TenantCellAssignmentBase):
    tenant_id: uuid.UUID
    assigned_by: Optional[uuid.UUID] = None


class TenantCellAssignmentResponse(TenantCellAssignmentBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    cell_id: uuid.UUID
    assigned_at: datetime
    assigned_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime