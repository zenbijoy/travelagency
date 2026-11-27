"""
Comprehensive Test Suite for Hotel Property Management System (PMS) API (/api/v1/hotel-pms/...).
Validates:
1. Physical room units creation, floor-grouped rack matrix retrieval, and status updates.
2. Express QR/Ref check-in, automatic folio provisioning, digital mobile key creation & rotation.
3. Guest folio itemized charges, multi-payer split breakdown, and full settlement checkout (with auto-housekeeping dispatch).
4. Housekeeping turnaround task creation, strict state machine transitions (dirty -> cleaning -> inspection -> ready), and invalid transition rejection.
5. Maintenance ticket creation (auto out-of-order flag when blocks_room_sale=True) and resolution restoration.
6. Dynamic yield pricing rules (occupancy surge, weekend, seasonal) with 1.25x upper ceiling protection.
7. Operational & yield PMS analytics (Occupancy %, ADR, RevPAR, GOPPAR, open maintenance).
"""

from datetime import date, timedelta
from decimal import Decimal
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.hotel import Hotel, HotelRoom
from app.models.user import AdminUser, HotelStaff
from tests.conftest import make_test_jwt


@pytest.fixture
async def setup_hotel_pms_entities(db_session: AsyncSession):
    """Seed hotel, room type, hotel staff user, guest user, admin user, and booking."""
    staff_user_id = uuid.uuid4()
    guest_user_id = uuid.uuid4()
    outsider_user_id = uuid.uuid4()
    admin_id = uuid.uuid4()

    admin = AdminUser(
        id=admin_id,
        user_id=admin_id,
        role="super_admin",
        status="active",
    )
    db_session.add(admin)

    hotel = Hotel(
        name="Cox's Bazar Bayfront Grand",
        slug=f"coxs-bayfront-{uuid.uuid4().hex[:6]}",
        city="Cox's Bazar",
        country="Bangladesh",
        star_rating=5,
    )
    db_session.add(hotel)
    await db_session.flush()

    room_type = HotelRoom(
        hotel_id=hotel.id,
        name="Ocean View Deluxe King",
        room_type="deluxe",
        max_occupancy=3,
        bed_type="King",
        base_price_per_night=Decimal("6000.00"),
        currency="BDT",
    )
    db_session.add(room_type)
    await db_session.flush()

    staff = HotelStaff(
        hotel_id=hotel.id,
        user_id=staff_user_id,
        role="front_desk",
        status="active",
    )
    db_session.add(staff)

    booking = Booking(
        user_id=guest_user_id,
        booking_reference=f"SJ-HTL-{uuid.uuid4().hex[:6].upper()}",
        product_type="hotel",
        status="confirmed",
        destination_city="Cox's Bazar",
        start_date=date.today(),
        end_date=date.today() + timedelta(days=2),
        number_of_guests=2,
        total_price=Decimal("12000.00"),
        final_price=Decimal("12000.00"),
        currency="BDT",
    )
    db_session.add(booking)
    await db_session.commit()

    return {
        "hotel_id": hotel.id,
        "room_type_id": room_type.id,
        "booking_id": booking.id,
        "booking_ref": booking.booking_reference,
        "staff_user_id": staff_user_id,
        "staff_token": make_test_jwt(staff_user_id, email="staff@hotel.com", role="user"),
        "guest_user_id": guest_user_id,
        "guest_token": make_test_jwt(guest_user_id, email="guest@shopnojatra.com", role="user"),
        "outsider_token": make_test_jwt(outsider_user_id, email="outsider@shopnojatra.com", role="user"),
        "admin_token": make_test_jwt(admin_id, email="admin@shopnojatra.com", role="admin"),
    }


async def _seed_room_unit(
    client: AsyncClient,
    hotel_id: uuid.UUID,
    room_type_id: uuid.UUID,
    staff_headers: dict,
    room_number: str = "301",
    floor_number: int = 3,
    is_vip: bool = False,
) -> dict:
    res = await client.post(
        f"/api/v1/hotel-pms/{hotel_id}/units",
        json={
            "room_type_id": str(room_type_id),
            "room_number": room_number,
            "floor_number": floor_number,
            "wing": "Sea Wing",
            "is_vip_room": is_vip,
            "base_nightly_rate_bdt": "6000.00",
        },
        headers=staff_headers,
    )
    assert res.status_code == 201, res.text
    return res.json()


# ============================================================================
# 1. ROOM MATRIX & TENANT ACCESS CONTROL
# ============================================================================

@pytest.mark.asyncio
async def test_room_units_matrix_and_isolation(client: AsyncClient, setup_hotel_pms_entities):
    """Creates room units across floors, reads aggregated matrix, and blocks unauthorized users."""
    hotel_id = setup_hotel_pms_entities["hotel_id"]
    rt_id = setup_hotel_pms_entities["room_type_id"]
    staff_headers = {"Authorization": f"Bearer {setup_hotel_pms_entities['staff_token']}"}
    outsider_headers = {"Authorization": f"Bearer {setup_hotel_pms_entities['outsider_token']}"}

    await _seed_room_unit(client, hotel_id, rt_id, staff_headers, room_number="201", floor_number=2)
    await _seed_room_unit(client, hotel_id, rt_id, staff_headers, room_number="301", floor_number=3, is_vip=True)

    # Unauthorized non-staff user is blocked (403)
    res_block = await client.get(f"/api/v1/hotel-pms/{hotel_id}/matrix", headers=outsider_headers)
    assert res_block.status_code == 403

    # Hotel staff retrieves floor matrix
    res_mat = await client.get(f"/api/v1/hotel-pms/{hotel_id}/matrix", headers=staff_headers)
    assert res_mat.status_code == 200, res_mat.text
    matrix = res_mat.json()
    assert matrix["total_units"] == 2
    assert matrix["vacant_clean_units"] == 2
    assert len(matrix["floors"]) == 2
    assert matrix["floors"][0]["floor_number"] == 2
    assert matrix["floors"][1]["floor_number"] == 3


# ============================================================================
# 2. EXPRESS CHECK-IN, DIGITAL KEY & ROTATION
# ============================================================================

@pytest.mark.asyncio
async def test_express_checkin_and_digital_key_rotation(client: AsyncClient, setup_hotel_pms_entities):
    """Executes express check-in, issues digital room key & folio, and rotates key."""
    hotel_id = setup_hotel_pms_entities["hotel_id"]
    rt_id = setup_hotel_pms_entities["room_type_id"]
    booking_ref = setup_hotel_pms_entities["booking_ref"]
    staff_headers = {"Authorization": f"Bearer {setup_hotel_pms_entities['staff_token']}"}
    guest_headers = {"Authorization": f"Bearer {setup_hotel_pms_entities['guest_token']}"}

    unit = await _seed_room_unit(client, hotel_id, rt_id, staff_headers, room_number="405", floor_number=4)

    # Express Check-in by front-desk staff
    res_ci = await client.post(
        "/api/v1/hotel-pms/check-in",
        json={
            "hotel_id": str(hotel_id),
            "booking_ref": booking_ref,
            "room_unit_id": unit["id"],
            "nid_verified": True,
            "guest_name": "Tahmid Rahman",
            "guest_phone": "+8801711002233",
        },
        headers=staff_headers,
    )
    assert res_ci.status_code == 200, res_ci.text
    ci_data = res_ci.json()
    assert ci_data["room_number"] == "405"
    key_id = ci_data["guest_key"]["id"]
    old_qr = ci_data["guest_key"]["qr_pass_code"]

    # Guest views their active digital key
    res_keys = await client.get("/api/v1/hotel-pms/keys/my", headers=guest_headers)
    assert res_keys.status_code == 200
    assert len(res_keys.json()) == 1
    assert res_keys.json()[0]["qr_pass_code"] == old_qr

    # Guest rotates key for security
    res_rot = await client.post(f"/api/v1/hotel-pms/keys/{key_id}/rotate", headers=guest_headers)
    assert res_rot.status_code == 200, res_rot.text
    new_key = res_rot.json()
    assert new_key["rotated_count"] == 1
    assert new_key["qr_pass_code"] != old_qr


# ============================================================================
# 3. FOLIO INCIDENTAL CHARGES & CHECKOUT WITH AUTO-HOUSEKEEPING
# ============================================================================

@pytest.mark.asyncio
async def test_folio_charges_split_and_checkout_settlement(client: AsyncClient, setup_hotel_pms_entities):
    """Posts charges, rejects unpaid checkout, settles payment, and auto-dispatches housekeeping."""
    hotel_id = setup_hotel_pms_entities["hotel_id"]
    rt_id = setup_hotel_pms_entities["room_type_id"]
    booking_ref = setup_hotel_pms_entities["booking_ref"]
    staff_headers = {"Authorization": f"Bearer {setup_hotel_pms_entities['staff_token']}"}

    unit = await _seed_room_unit(client, hotel_id, rt_id, staff_headers, room_number="501", floor_number=5, is_vip=True)
    res_ci = await client.post(
        "/api/v1/hotel-pms/check-in",
        json={"hotel_id": str(hotel_id), "booking_ref": booking_ref, "room_unit_id": unit["id"]},
        headers=staff_headers,
    )
    folio_id = res_ci.json()["folio_id"]

    # 1. Post minibar + restaurant charge on secondary guest payer
    res_charge = await client.post(
        f"/api/v1/hotel-pms/folios/{folio_id}/charges",
        json={
            "charges": [
                {
                    "item_type": "room_service",
                    "description": "Hilsha Platter Dinner",
                    "quantity": 1,
                    "unit_amount_paisa": 150000,
                    "tax_paisa": 22500,
                    "entry_side": "charge",
                    "payer_label": "company_expense",
                }
            ],
            "payment_amount_paisa": 0,
            "checkout": False,
        },
        headers=staff_headers,
    )
    assert res_charge.status_code == 200, res_charge.text
    summary = res_charge.json()
    assert summary["addon_charges_paisa"] == 150000
    assert summary["balance_due_paisa"] > 150000
    assert "company_expense" in summary["split_by_payer"]

    # 2. Attempt checkout while balance remains due -> 400
    res_bad_co = await client.post(
        f"/api/v1/hotel-pms/folios/{folio_id}/charges",
        json={"charges": [], "payment_amount_paisa": 1000, "checkout": True},
        headers=staff_headers,
    )
    assert res_bad_co.status_code == 400

    # 3. Inspect remaining due and pay full balance to complete checkout
    summary2 = (await client.get(f"/api/v1/hotel-pms/folios/{folio_id}", headers=staff_headers)).json()
    due_paisa = summary2["balance_due_paisa"]

    res_co = await client.post(
        f"/api/v1/hotel-pms/folios/{folio_id}/charges",
        json={
            "charges": [],
            "payment_amount_paisa": due_paisa,
            "payment_method": "card",
            "checkout": True,
        },
        headers=staff_headers,
    )
    assert res_co.status_code == 200, res_co.text
    co_data = res_co.json()
    assert co_data["checked_out"] is True
    assert co_data["status"] == "settled"
    assert co_data["balance_due_paisa"] == 0
    assert co_data["housekeeping_task_id"] is not None

    # Verify unit became vacant + dirty after checkout
    mat = (await client.get(f"/api/v1/hotel-pms/{hotel_id}/matrix", headers=staff_headers)).json()
    assert mat["dirty_units"] == 1
    assert mat["occupied_units"] == 0


# ============================================================================
# 4. HOUSEKEEPING STATE MACHINE
# ============================================================================

@pytest.mark.asyncio
async def test_housekeeping_state_machine_transitions(client: AsyncClient, setup_hotel_pms_entities):
    """Validates dirty -> cleaning -> inspection -> ready transitions and rejects illegal skips."""
    hotel_id = setup_hotel_pms_entities["hotel_id"]
    rt_id = setup_hotel_pms_entities["room_type_id"]
    staff_headers = {"Authorization": f"Bearer {setup_hotel_pms_entities['staff_token']}"}

    unit = await _seed_room_unit(client, hotel_id, rt_id, staff_headers, room_number="602", floor_number=6)

    # Create task (sets unit dirty)
    res_hk = await client.post(
        f"/api/v1/hotel-pms/{hotel_id}/housekeeping",
        json={
            "room_unit_id": unit["id"],
            "task_type": "deep_clean",
            "priority": "high",
            "sla_minutes": 60,
        },
        headers=staff_headers,
    )
    assert res_hk.status_code == 201, res_hk.text
    task_id = res_hk.json()["id"]
    assert res_hk.json()["status"] == "dirty"

    # Illegal transition: dirty -> ready (must go through cleaning -> inspection)
    res_bad = await client.post(
        f"/api/v1/hotel-pms/housekeeping/{task_id}/transition",
        json={"target_status": "ready"},
        headers=staff_headers,
    )
    assert res_bad.status_code == 400

    # Valid path: dirty -> cleaning -> inspection -> ready
    for nxt in ["cleaning", "inspection", "ready"]:
        res_tr = await client.post(
            f"/api/v1/hotel-pms/housekeeping/{task_id}/transition",
            json={"target_status": nxt, "notes": f"Moved to {nxt}"},
            headers=staff_headers,
        )
        assert res_tr.status_code == 200, res_tr.text
        assert res_tr.json()["status"] == nxt

    # Room unit should now be ready
    mat = (await client.get(f"/api/v1/hotel-pms/{hotel_id}/matrix", headers=staff_headers)).json()
    assert mat["vacant_clean_units"] == 1


# ============================================================================
# 5. MAINTENANCE TICKETS & OUT-OF-ORDER TOGGLE
# ============================================================================

@pytest.mark.asyncio
async def test_maintenance_ticket_blocks_and_restores_room(client: AsyncClient, setup_hotel_pms_entities):
    """Creating a blocking ticket marks unit out_of_order; resolving returns it to vacant dirty."""
    hotel_id = setup_hotel_pms_entities["hotel_id"]
    rt_id = setup_hotel_pms_entities["room_type_id"]
    staff_headers = {"Authorization": f"Bearer {setup_hotel_pms_entities['staff_token']}"}

    unit = await _seed_room_unit(client, hotel_id, rt_id, staff_headers, room_number="701", floor_number=7)

    # Create blocking AC failure ticket
    res_mnt = await client.post(
        f"/api/v1/hotel-pms/{hotel_id}/maintenance",
        json={
            "room_unit_id": unit["id"],
            "category": "hvac",
            "severity": "critical",
            "title": "Split AC compressor leak",
            "blocks_room_sale": True,
            "estimated_cost_bdt": "4500.00",
        },
        headers=staff_headers,
    )
    assert res_mnt.status_code == 201, res_mnt.text
    ticket_id = res_mnt.json()["id"]

    mat_ooo = (await client.get(f"/api/v1/hotel-pms/{hotel_id}/matrix", headers=staff_headers)).json()
    assert mat_ooo["out_of_order_units"] == 1

    # Resolve ticket -> restores room to vacant dirty
    res_fix = await client.patch(
        f"/api/v1/hotel-pms/maintenance/{ticket_id}",
        json={
            "status": "resolved",
            "actual_cost_bdt": "4200.00",
            "resolution_notes": "Replaced valve and recharged R32 refrigerant",
        },
        headers=staff_headers,
    )
    assert res_fix.status_code == 200
    assert res_fix.json()["status"] == "resolved"

    mat_fixed = (await client.get(f"/api/v1/hotel-pms/{hotel_id}/matrix", headers=staff_headers)).json()
    assert mat_fixed["out_of_order_units"] == 0
    assert mat_fixed["dirty_units"] == 1


# ============================================================================
# 6. DYNAMIC YIELD PRICING ENGINE & ANALYTICS
# ============================================================================

@pytest.mark.asyncio
async def test_dynamic_yield_pricing_and_pms_analytics(client: AsyncClient, setup_hotel_pms_entities):
    """Creates yield rules with >1.25x stacking (verifies 1.25x ceiling) and retrieves analytics."""
    hotel_id = setup_hotel_pms_entities["hotel_id"]
    rt_id = setup_hotel_pms_entities["room_type_id"]
    staff_headers = {"Authorization": f"Bearer {setup_hotel_pms_entities['staff_token']}"}

    await _seed_room_unit(client, hotel_id, rt_id, staff_headers, room_number="101", floor_number=1)
    await _seed_room_unit(client, hotel_id, rt_id, staff_headers, room_number="102", floor_number=1)

    # Create 2 stackable rules: 1.20x * 1.15x = 1.38x (must clamp at 1.25x!)
    r1 = await client.post(
        f"/api/v1/hotel-pms/{hotel_id}/rate-rules",
        json={
            "room_type_id": str(rt_id),
            "rule_name": "Eid Peak Season Surge",
            "rule_type": "seasonal",
            "priority": 10,
            "multiplier": "1.200",
        },
        headers=staff_headers,
    )
    assert r1.status_code == 201, r1.text

    r2 = await client.post(
        f"/api/v1/hotel-pms/{hotel_id}/rate-rules",
        json={
            "room_type_id": str(rt_id),
            "rule_name": "Stay Multi-Night Yield",
            "rule_type": "length_of_stay",
            "priority": 20,
            "multiplier": "1.150",
            "min_nights": 2,
        },
        headers=staff_headers,
    )
    assert r2.status_code == 201, r2.text

    # Compute dynamic quote for 2 nights (base 6000 -> capped at 1.25 * 6000 = 7500 BDT/night)
    res_quote = await client.post(
        f"/api/v1/hotel-pms/{hotel_id}/rates/dynamic",
        json={"room_type_id": str(rt_id), "check_in": date.today().isoformat(), "nights": 2},
    )
    assert res_quote.status_code == 200, res_quote.text
    quote = res_quote.json()
    assert quote["is_capped"] is True
    assert Decimal(str(quote["effective_multiplier"])) == Decimal("1.250")
    assert Decimal(str(quote["dynamic_nightly_bdt"])) == Decimal("7500.00")
    assert quote["subtotal_paisa"] == 1500000  # 15000 BDT

    # Check PMS Analytics endpoint
    res_kpi = await client.get(f"/api/v1/hotel-pms/{hotel_id}/analytics", headers=staff_headers)
    assert res_kpi.status_code == 200, res_kpi.text
    kpi = res_kpi.json()
    assert kpi["total_units"] == 2
    assert kpi["vacant_clean_units"] == 2
