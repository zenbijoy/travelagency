"""
Tenant context, tenant isolation, memberships, and cell assignment tests.

Covers:
1. Tenant creation and slug uniqueness.
2. Tenant membership lifecycle (add / list / remove).
3. Server-side tenant context resolution (never trusts client-supplied tenant IDs).
4. Tenant isolation: users can only see their own tenant's bookings.
5. Booking idempotency (duplicate idempotency key returns existing booking).
6. Tenant cell assignment and routing metadata.
7. Central authorization / organization membership checks.
"""

import uuid
from datetime import date
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, PermissionDeniedError
from app.models.booking import Booking
from app.models.tenant import (
    Cell,
    Organization,
    OrganizationMembership,
    Tenant,
    TenantCellAssignment,
    TenantMembership,
)
from app.models.user import UserProfile
from app.schemas.tenant import (
    TenantCellAssignmentCreate,
    TenantCreate,
    TenantMembershipCreate,
)
from app.services.authorization_service import AuthorizationService
from app.services.tenant_service import TenantService
from tests.conftest import make_test_jwt


# ---------------------------------------------------------------------------
# FIXTURES
# ---------------------------------------------------------------------------

async def _create_user(db_session: AsyncSession, email: str) -> uuid.UUID:
    user_id = uuid.uuid4()
    db_session.add(
        UserProfile(
            id=user_id,
            email=email,
            display_name=email.split("@")[0],
            role="user",
            is_verified=False,
        )
    )
    await db_session.flush()
    return user_id


async def _create_tenant(
    db_session: AsyncSession, name: str, slug: str
) -> Tenant:
    tenant = Tenant(
        name=name,
        slug=slug,
        status="active",
        plan="standard",
    )
    db_session.add(tenant)
    await db_session.flush()
    return tenant


async def _add_membership(
    db_session: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, role: str = "member"
) -> TenantMembership:
    membership = TenantMembership(
        tenant_id=tenant_id,
        user_id=user_id,
        role=role,
        status="active",
    )
    db_session.add(membership)
    await db_session.flush()
    return membership


async def _create_booking(
    db_session: AsyncSession,
    user_id: uuid.UUID,
    tenant_id: uuid.UUID,
    reference: str,
) -> Booking:
    booking = Booking(
        id=uuid.uuid4(),
        user_id=user_id,
        tenant_id=tenant_id,
        booking_reference=reference,
        product_type="tour",
        status="pending_payment",
        destination_city="Cox's Bazar",
        final_price=100.0,
        currency="BDT",
        start_date=date.today(),
    )
    db_session.add(booking)
    await db_session.flush()
    return booking


# ---------------------------------------------------------------------------
# TEST 1: TENANT CREATION AND SLUG UNIQUENESS
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_tenant_create_and_slug_uniqueness(db_session: AsyncSession):
    tenant_in = TenantCreate(name="Dhaka Travels", slug="dhaka-travels")
    tenant = await TenantService.create_tenant(db_session, tenant_in)
    assert tenant.id is not None
    assert tenant.name == "Dhaka Travels"
    assert tenant.slug == "dhaka-travels"
    assert tenant.status == "active"

    # Duplicate slug must be rejected
    with pytest.raises(BadRequestError, match="already exists"):
        await TenantService.create_tenant(
            db_session, TenantCreate(name="Dup", slug="dhaka-travels")
        )

    # get_tenant works
    fetched = await TenantService.get_tenant(db_session, tenant.id)
    assert fetched is not None
    assert fetched.id == tenant.id


# ---------------------------------------------------------------------------
# TEST 2: TENANT MEMBERSHIP LIFECYCLE
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_tenant_membership_lifecycle(db_session: AsyncSession):
    user_id = await _create_user(db_session, "traveler@shopnojatra.com")
    tenant = await _create_tenant(db_session, "Sylhet Tours", "sylhet-tours")

    # Add member
    membership = await TenantService.add_member(
        db_session,
        TenantMembershipCreate(tenant_id=tenant.id, user_id=user_id, role="member"),
    )
    assert membership.user_id == user_id
    assert membership.tenant_id == tenant.id
    assert membership.status == "active"

    # Idempotent: re-adding same user updates role but stays active
    membership2 = await TenantService.add_member(
        db_session,
        TenantMembershipCreate(tenant_id=tenant.id, user_id=user_id, role="admin"),
    )
    assert membership2.id == membership.id
    assert membership2.role == "admin"

    # list_user_tenants returns the tenant
    tenants = await TenantService.list_user_tenants(db_session, user_id)
    assert len(tenants) == 1
    assert tenants[0].id == tenant.id

    # get_user_membership resolves server-side
    m = await TenantService.get_user_membership(db_session, user_id, tenant.id)
    assert m is not None
    assert m.role == "admin"

    # Remove member (soft)
    removed = await TenantService.remove_member(db_session, user_id, tenant.id)
    assert removed is True
    m2 = await TenantService.get_user_membership(db_session, user_id, tenant.id)
    assert m2 is None  # status = removed, so not returned

    # Removing again returns False
    assert await TenantService.remove_member(db_session, user_id, tenant.id) is False


# ---------------------------------------------------------------------------
# TEST 3: SERVER-SIDE TENANT CONTEXT RESOLUTION (NEVER TRUST CLIENT)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_resolve_tenant_context_single_tenant_defaults(db_session: AsyncSession):
    user_id = await _create_user(db_session, "single@shopnojatra.com")
    tenant = await _create_tenant(db_session, "Single Tenant", "single-tenant")
    await _add_membership(db_session, tenant.id, user_id, role="owner")

    # No header: single tenant is used by default
    context = await TenantService.resolve_tenant_context(db_session, user_id)
    assert context["tenant_id"] == tenant.id
    assert context["tenant"].id == tenant.id
    assert context["membership"].role == "owner"
    assert context["is_admin"] is True


@pytest.mark.asyncio
async def test_resolve_tenant_context_multiple_tenants_requires_header(
    db_session: AsyncSession,
):
    user_id = await _create_user(db_session, "multi@shopnojatra.com")
    t1 = await _create_tenant(db_session, "Tenant One", "tenant-one")
    t2 = await _create_tenant(db_session, "Tenant Two", "tenant-two")
    await _add_membership(db_session, t1.id, user_id, role="member")
    await _add_membership(db_session, t2.id, user_id, role="member")

    # No header with multiple tenants -> must specify
    with pytest.raises(BadRequestError, match="multiple tenants"):
        await TenantService.resolve_tenant_context(db_session, user_id)

    # Valid header -> resolved
    context = await TenantService.resolve_tenant_context(db_session, user_id, t2.id)
    assert context["tenant_id"] == t2.id


@pytest.mark.asyncio
async def test_resolve_tenant_context_client_cannot_spoof_tenant(
    db_session: AsyncSession,
):
    user_id = await _create_user(db_session, "victim@shopnojatra.com")
    owned = await _create_tenant(db_session, "Owned", "owned")
    other = await _create_tenant(db_session, "Other", "other")
    await _add_membership(db_session, owned.id, user_id, role="member")
    # user is NOT a member of 'other'

    # Client-supplied tenant they are not a member of must be rejected
    with pytest.raises(BadRequestError, match="not a member"):
        await TenantService.resolve_tenant_context(db_session, user_id, other.id)

    # But their own tenant works
    context = await TenantService.resolve_tenant_context(db_session, user_id, owned.id)
    assert context["tenant_id"] == owned.id


# ---------------------------------------------------------------------------
# TEST 4: TENANT ISOLATION - USERS ONLY SEE THEIR OWN TENANT'S BOOKINGS
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_tenant_isolation_bookings_cross_tenant_denied(
    client: AsyncClient,
    db_session: AsyncSession,
):
    # Tenant 1 + user 1 + booking 1
    u1 = await _create_user(db_session, "user1@shopnojatra.com")
    t1 = await _create_tenant(db_session, "Alpha Travel", "alpha-travel")
    await _add_membership(db_session, t1.id, u1, role="owner")
    b1 = await _create_booking(db_session, u1, t1.id, "SJ-ALPHA-001")

    # Tenant 2 + user 2 + booking 2
    u2 = await _create_user(db_session, "user2@shopnojatra.com")
    t2 = await _create_tenant(db_session, "Beta Travel", "beta-travel")
    await _add_membership(db_session, t2.id, u2, role="owner")
    b2 = await _create_booking(db_session, u2, t2.id, "SJ-BETA-002")
    await db_session.commit()

    jwt_u1 = make_test_jwt(u1, email="user1@shopnojatra.com", role="user")
    jwt_u2 = make_test_jwt(u2, email="user2@shopnojatra.com", role="user")

    # User 1 lists bookings in tenant 1 -> sees only b1
    resp = await client.get(
        "/api/v1/bookings",
        headers={"Authorization": f"Bearer {jwt_u1}", "X-Tenant-Id": str(t1.id)},
    )
    assert resp.status_code == 200, resp.text
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["booking_reference"] == "SJ-ALPHA-001"

    # User 1 cannot get user 2's booking in tenant 2 (isolated -> 404)
    resp_forbidden = await client.get(
        f"/api/v1/bookings/{b2.id}",
        headers={"Authorization": f"Bearer {jwt_u1}", "X-Tenant-Id": str(t1.id)},
    )
    assert resp_forbidden.status_code == 404, resp_forbidden.text

    # User 2 lists bookings in tenant 2 -> sees only b2
    resp2 = await client.get(
        "/api/v1/bookings",
        headers={"Authorization": f"Bearer {jwt_u2}", "X-Tenant-Id": str(t2.id)},
    )
    assert resp2.status_code == 200, resp2.text
    items2 = resp2.json()["items"]
    assert len(items2) == 1
    assert items2[0]["booking_reference"] == "SJ-BETA-002"


@pytest.mark.asyncio
async def test_create_booking_sets_server_resolved_tenant(
    client: AsyncClient,
    db_session: AsyncSession,
):
    u1 = await _create_user(db_session, "booker@shopnojatra.com")
    t1 = await _create_tenant(db_session, "Gamma Travel", "gamma-travel")
    await _add_membership(db_session, t1.id, u1, role="owner")
    await db_session.commit()

    jwt_u1 = make_test_jwt(u1, email="booker@shopnojatra.com", role="user")

    payload = {
        "product_type": "tour",
        "destination_city": "Sylhet",
        "number_of_guests": 2,
        "items": [
            {
                "product_type": "tour",
                "product_id": str(uuid.uuid4()),
                "product_name": "Tea Garden Tour",
                "quantity": 1,
                "unit_price": 100.0,
            }
        ],
        "passengers": [
            {
                "first_name": "Jane",
                "last_name": "Doe",
                "email": "jane@example.com",
                "passenger_type": "adult",
            }
        ],
        "idempotency_key": "idem-booking-001",
    }

    resp = await client.post(
        "/api/v1/bookings",
        json=payload,
        headers={
            "Authorization": f"Bearer {jwt_u1}",
            "X-Tenant-Id": str(t1.id),
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    # Tenant id is set server-side from context, not from the request body
    assert data["tenant_id"] == str(t1.id)

    # Verify persisted tenant_id
    stmt = select(Booking).where(Booking.booking_reference == data["booking_reference"])
    persisted = (await db_session.execute(stmt)).scalar_one_or_none()
    assert persisted is not None
    assert persisted.tenant_id == t1.id


# ---------------------------------------------------------------------------
# TEST 5: BOOKING IDEMPOTENCY (DUPLICATE KEY RETURNS EXISTING)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_booking_idempotency_duplicate_key_returns_existing(
    client: AsyncClient,
    db_session: AsyncSession,
):
    u1 = await _create_user(db_session, "idem@shopnojatra.com")
    t1 = await _create_tenant(db_session, "Idem Travel", "idem-travel")
    await _add_membership(db_session, t1.id, u1, role="owner")
    await db_session.commit()

    jwt_u1 = make_test_jwt(u1, email="idem@shopnojatra.com", role="user")

    payload = {
        "product_type": "tour",
        "destination_city": "Khulna",
        "number_of_guests": 1,
        "items": [
            {
                "product_type": "tour",
                "product_id": str(uuid.uuid4()),
                "product_name": "Sundarbans Tour",
                "quantity": 1,
                "unit_price": 50.0,
            }
        ],
        "passengers": [
            {"first_name": "John", "last_name": "Smith", "passenger_type": "adult"}
        ],
        "idempotency_key": "idem-key-123",
    }

    resp1 = await client.post(
        "/api/v1/bookings",
        json=payload,
        headers={"Authorization": f"Bearer {jwt_u1}", "X-Tenant-Id": str(t1.id)},
    )
    assert resp1.status_code == 201, resp1.text
    ref1 = resp1.json()["data"]["booking_reference"]

    # Same idempotency key -> returns existing booking (no duplicate).
    # Route decorator forces 201 Created; the idempotency guarantee is that the
    # same booking reference is returned and no duplicate row is created.
    resp2 = await client.post(
        "/api/v1/bookings",
        json=payload,
        headers={"Authorization": f"Bearer {jwt_u1}", "X-Tenant-Id": str(t1.id)},
    )
    assert resp2.status_code == 201, resp2.text
    ref2 = resp2.json()["data"]["booking_reference"]
    assert ref1 == ref2, "Idempotent create must return the same booking reference"

    # Only one booking exists for this user/key
    stmt = select(Booking).where(Booking.idempotency_key == "idem-key-123")
    rows = (await db_session.execute(stmt)).scalars().all()
    assert len(rows) == 1


# ---------------------------------------------------------------------------
# TEST 6: TENANT CELL ASSIGNMENT AND ROUTING METADATA
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_tenant_cell_assignment_routing(db_session: AsyncSession):
    tenant = await _create_tenant(db_session, "Cell Tenant", "cell-tenant")
    cell = Cell(
        name="Dhaka Cell",
        slug="dhaka-cell",
        region="Dhaka",
        status="active",
    )
    db_session.add(cell)
    await db_session.flush()

    assignment = await TenantService.assign_cell(
        db_session,
        TenantCellAssignmentCreate(tenant_id=tenant.id, cell_id=cell.id, assigned_by=None),
    )
    assert assignment.tenant_id == tenant.id
    assert assignment.cell_id == cell.id
    assert assignment.status == "active"

    # get_tenant_cell returns routing cell
    routed_cell = await TenantService.get_tenant_cell(db_session, tenant.id)
    assert routed_cell is not None
    assert routed_cell.id == cell.id
    assert routed_cell.slug == "dhaka-cell"


# ---------------------------------------------------------------------------
# TEST 7: CENTRAL AUTHORIZATION / ORGANIZATION MEMBERSHIP
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_authorization_organization_membership(db_session: AsyncSession):
    user_id = await _create_user(db_session, "orguser@shopnojatra.com")
    org = Organization(
        name="Acme Travel Org",
        slug="acme-travel",
        owner_user_id=user_id,
        status="active",
    )
    db_session.add(org)
    await db_session.flush()

    # Not a member initially
    assert await AuthorizationService.is_organization_member(db_session, user_id, org.id) is False

    # Add membership via org membership record
    om = OrganizationMembership(
        organization_id=org.id,
        user_id=user_id,
        role="admin",
        status="active",
    )
    db_session.add(om)
    await db_session.flush()

    assert await AuthorizationService.is_organization_member(db_session, user_id, org.id) is True
    membership = await AuthorizationService.require_organization_membership(
        db_session, user_id, org.id
    )
    assert membership.role == "admin"

    # require_organization_membership denies non-members
    other_user = await _create_user(db_session, "outsider@shopnojatra.com")
    with pytest.raises(PermissionDeniedError):
        await AuthorizationService.require_organization_membership(
            db_session, other_user, org.id
        )

    # is_admin / require_admin
    assert await AuthorizationService.is_admin(db_session, user_id) is False
    with pytest.raises(PermissionDeniedError):
        await AuthorizationService.require_admin(db_session, user_id)



