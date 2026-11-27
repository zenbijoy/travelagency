"""
FastAPI Dependencies: Database Sessions, Redis, Supabase Zero-Trust Auth & RBAC.
"""

import logging
import uuid
from typing import AsyncGenerator, Optional
from fastapi import Depends, Header, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import AuthenticationError, BadRequestError, PermissionDeniedError
from app.core.redis import get_redis
from app.core.security import decode_supabase_jwt
from app.repositories.user_repository import UserRepository
from app.schemas.tenant import TenantContext
from app.schemas.user import CurrentUser, UserRole
from app.services.authorization_service import AuthorizationService
from app.services.tenant_service import TenantService

# HTTP Bearer scheme
security_bearer = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    """
    Validate Supabase JWT from Bearer Authorization header and resolve RBAC context.
    Enforces Zero-Trust claim verification and database-backed permission validation.
    """
    if not credentials or not credentials.credentials:
        raise AuthenticationError("Missing Authorization Bearer token")

    payload = await decode_supabase_jwt(credentials.credentials)
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise AuthenticationError("Token missing valid subject identifier ('sub')")

    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        raise AuthenticationError("Token subject is not a valid UUID")

    email = payload.get("email")
    app_metadata = payload.get("app_metadata", {})
    user_metadata = payload.get("user_metadata", {})

    roles = []
    user_repo = UserRepository(db)

    # 1. Authoritative Admin Verification (Database-only: admin_users table)
    active_admin = await user_repo.get_active_admin(user_uuid)
    admin_role: Optional[str] = None
    admin_permissions: dict = {}
    if active_admin:
        roles.append(UserRole.ADMIN.value)
        admin_role = active_admin.role
        raw_perms = active_admin.permissions or {}
        if isinstance(raw_perms, dict):
            admin_permissions = {str(k): bool(v) for k, v in raw_perms.items()}

    # 2. Authoritative Agency Association (Database-only)
    agency_id = await user_repo.get_user_agency_id(user_uuid)
    if agency_id:
        roles.append(UserRole.AGENCY.value)

    # 3. Authoritative Hotel Staff Association (Database-only)
    hotel_id = await user_repo.get_user_hotel_id(user_uuid)
    if hotel_id:
        roles.append(UserRole.HOTEL_STAFF.value)

    # 4. Check user profile for non-privileged informational tags only
    profile = await user_repo.get_user_profile(user_uuid)
    if profile and profile.role:
        # Prevent privilege escalation: untrusted profile string cannot grant admin/agency
        if profile.role in [UserRole.CREATOR.value, UserRole.PARTNER.value, UserRole.USER.value]:
            roles.append(profile.role)

    # Resolve primary role with strict hierarchy (Never grant Admin without active_admin)
    if active_admin:
        primary_role = UserRole.ADMIN
    elif agency_id:
        primary_role = UserRole.AGENCY
    elif hotel_id:
        primary_role = UserRole.HOTEL_STAFF
    elif UserRole.CREATOR.value in roles:
        primary_role = UserRole.CREATOR
    elif UserRole.PARTNER.value in roles:
        primary_role = UserRole.PARTNER
    else:
        primary_role = UserRole.USER

    return CurrentUser(
        id=user_uuid,
        email=email,
        role=primary_role,
        roles=list(set(roles)),
        admin_role=admin_role,
        admin_permissions=admin_permissions,
        agency_id=agency_id,
        hotel_id=hotel_id,
        is_active=True,
        metadata={**user_metadata, **app_metadata},
    )


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    db: AsyncSession = Depends(get_db),
) -> Optional[CurrentUser]:
    """Optional user dependency for public endpoints with personalized experiences."""
    if not credentials or not credentials.credentials:
        return None
    try:
        return await get_current_user(credentials=credentials, db=db)
    except AuthenticationError:
        # User provided an explicit token that is invalid or expired.
        # Do NOT silently downgrade to anonymous - re-raise so client knows session expired.
        raise
    except Exception as exc:
        logger.warning(f"Unexpected non-auth exception during optional user lookup: {exc}", exc_info=True)
        return None


# RBAC Role Guards
def require_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Enforces that the current authenticated user has active Administrator privileges."""
    if not current_user.is_active_admin:
        raise PermissionDeniedError("Administrator privileges required for this endpoint")
    return current_user


def require_admin_permission(permission: str):
    """Granular RBAC guard enforcing role/per-user admin permission on backend endpoints."""

    def _permission_guard(
        current_user: CurrentUser = Depends(require_admin),
    ) -> CurrentUser:
        if not current_user.has_admin_permission(permission):
            raise PermissionDeniedError(
                f"Administrator lacks required permission '{permission}'"
            )
        return current_user

    return _permission_guard


def require_agency(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Enforces that the current user belongs to a registered Agency or is an Admin."""
    is_agency = (
        current_user.role in (UserRole.AGENCY, UserRole.ADMIN)
        or current_user.agency_id is not None
        or UserRole.AGENCY.value in current_user.roles
    )
    if not is_agency:
        raise PermissionDeniedError("Agency partner access required for this operation")
    return current_user


def require_hotel_staff(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Enforces that the current user is Hotel Staff, Hotel Manager, or Admin."""
    is_staff = (
        current_user.role in (UserRole.HOTEL_STAFF, UserRole.ADMIN, UserRole.AGENCY)
        or current_user.hotel_id is not None
        or UserRole.HOTEL_STAFF.value in current_user.roles
        or "hotel_staff" in current_user.roles
    )
    if not is_staff:
        raise PermissionDeniedError("Hotel staff or management access required")
    return current_user


# ---------------------------------------------------------------------------
# Tenant context dependency (Item 1: tenant context + isolation)
# ---------------------------------------------------------------------------

async def get_tenant_context(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
) -> TenantContext:
    """Resolve server-side tenant isolation context for the current request.

    The X-Tenant-Id header, if supplied, is validated against the user's active
    tenant memberships and never trusted blindly. If omitted and the user belongs
    to exactly one tenant, that tenant is used. If the user belongs to multiple
    tenants and none is specified, a 400 is raised.
    """
    requested_tenant_id: Optional[uuid.UUID] = None
    if x_tenant_id:
        try:
            requested_tenant_id = uuid.UUID(x_tenant_id)
        except ValueError:
            raise BadRequestError("X-Tenant-Id header is not a valid UUID")

    context = await TenantService.resolve_tenant_context(
        db, current_user.id, requested_tenant_id
    )

    return TenantContext(
        tenant_id=context["tenant_id"],
        tenant=context["tenant"],
        membership=context["membership"],
        memberships=context["memberships"],
        is_admin=context["is_admin"],
    )


def require_tenant(
    tenant_context: TenantContext = Depends(get_tenant_context),
) -> TenantContext:
    """Enforces that a tenant context has been resolved for the request."""
    if tenant_context.tenant_id is None:
        raise BadRequestError(
            "No tenant context could be resolved. Please specify a tenant via "
            "the X-Tenant-Id header, or ensure you are a member of a tenant."
        )
    return tenant_context


def require_tenant_member(
    tenant_context: TenantContext = Depends(require_tenant),
) -> TenantContext:
    """Enforces that the caller is an active member of the resolved tenant."""
    if tenant_context.membership is None:
        raise PermissionDeniedError("You are not an active member of this tenant.")
    return tenant_context


def require_tenant_admin(
    tenant_context: TenantContext = Depends(require_tenant_member),
) -> TenantContext:
    """Enforces that the caller is an owner or admin of the resolved tenant."""
    if not tenant_context.is_admin:
        raise PermissionDeniedError("Tenant admin privileges required.")
    return tenant_context
