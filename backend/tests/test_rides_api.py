"""
Comprehensive Test Suite for Rides & Delivery Partner API (/api/v1/rides/...).
Validates:
1. Dynamic fare quote calculation with distance, vehicle tiers, weather guard, surge ceiling, and Bangladesh bounding box validation.
2. Rider onboarding, profile fetching, vehicle registration, admin KYC verification, and online/offline duty status toggle.
3. Ride request creation, cancellation, radar discovery, and atomic dispatch claiming.
4. Passenger 6-digit start OTP retrieval, driver arrival notification, and cryptographic OTP verification (including invalid OTP rejection).
5. In-trip GPS telemetry ingestion, mock location rejection, and velocity sanity checks (>160 km/h rejection).
6. Trip completion, metered fare settlement, double-entry earnings ledger, and bKash cashout payout request.
7. Marketplace parcel delivery job discovery, claiming, merchant pickup OTP verification, customer dropoff OTP verification, and Proof of Delivery (POD).
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.local_commerce import MarketplaceOrder, MarketplaceSeller
from app.models.ride import DeliveryJob
from app.models.user import AdminUser
from app.services.ride_service import hash_otp_code, store_otp_in_vault
from tests.conftest import make_test_jwt


@pytest.fixture
async def setup_ride_actors(db_session: AsyncSession):
    """Seed test passenger, rider, seller, and admin actor identities."""
    passenger_id = uuid.uuid4()
    rider_user_id = uuid.uuid4()
    seller_user_id = uuid.uuid4()
    admin_id = uuid.uuid4()

    admin = AdminUser(
        id=admin_id,
        user_id=admin_id,
        role="super_admin",
        status="active",
    )
    db_session.add(admin)
    await db_session.commit()

    return {
        "passenger_id": passenger_id,
        "passenger_token": make_test_jwt(passenger_id, email="passenger@shopnojatra.com", role="user"),
        "rider_user_id": rider_user_id,
        "rider_token": make_test_jwt(rider_user_id, email="rider@shopnojatra.com", role="user"),
        "seller_user_id": seller_user_id,
        "admin_id": admin_id,
        "admin_token": make_test_jwt(admin_id, email="admin@shopnojatra.com", role="admin"),
    }


async def _onboard_and_go_online(
    client: AsyncClient,
    rider_headers: dict,
    admin_headers: dict,
    full_name: str = "Rafiqul Islam",
    phone: str = "+8801700112233",
    vehicle_mode: str = "bike",
    plate_number: str = "DHAKA METRO-HA-11-2233",
) -> str:
    """Helper to register rider, add vehicle, approve KYC via admin, and go online."""
    res = await client.post(
        "/api/v1/rides/riders/profile",
        json={
            "full_name": full_name,
            "phone": phone,
            "nid_number": "19901234567890123",
            "driving_license_number": "DL-DHK-998877",
            "active_vehicle_mode": vehicle_mode,
            "home_city": "Dhaka",
            "service_zones": ["Gulshan", "Banani", "Uttara"],
            "daily_goal_paisa": 150000,
            "preferred_payout_method": "bkash",
            "payout_account_masked": "017***12233",
        },
        headers=rider_headers,
    )
    assert res.status_code == 201, res.text
    rider_id = res.json()["id"]

    res_veh = await client.post(
        "/api/v1/rides/riders/vehicles",
        json={
            "vehicle_mode": vehicle_mode,
            "make_model": "Yamaha FZ-S V3",
            "color": "Matte Black",
            "plate_number": plate_number,
            "registration_number": f"REG-{plate_number}",
            "fuel_type": "octane",
            "seat_capacity": 1 if vehicle_mode == "bike" else 3,
            "is_primary": True,
        },
        headers=rider_headers,
    )
    assert res_veh.status_code == 201, res_veh.text

    res_admin = await client.post(
        f"/api/v1/rides/admin/riders/{rider_id}/verify",
        json={"kyc_status": "verified", "brta_verified": True},
        headers=admin_headers,
    )
    assert res_admin.status_code == 200, res_admin.text

    res_duty = await client.post(
        "/api/v1/rides/riders/duty",
        json={
            "duty_status": "online",
            "current_lat": 23.8103,
            "current_lng": 90.4125,
            "current_heading": 180.0,
        },
        headers=rider_headers,
    )
    assert res_duty.status_code == 200, res_duty.text
    return rider_id


# ============================================================================
# 1. FARE QUOTE TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_fare_quote_calculation_and_surge_weather_guard(client: AsyncClient, setup_ride_actors):
    """Calculates deterministic upfront fare quote with surge ceiling (1.25x) & weather guard (1.15x)."""
    headers = {"Authorization": f"Bearer {setup_ride_actors['passenger_token']}"}
    payload = {
        "vehicle_mode": "bike",
        "pickup": {"lat": 23.8103, "lng": 90.4125},
        "dropoff": {"lat": 23.8759, "lng": 90.3795},  # Gulshan -> Uttara
        "ride_type": "on_demand",
        "surge_multiplier": 2.50,  # Should cap at 1.15 due to weather_warning=True
        "weather_warning": True,
    }

    res = await client.post("/api/v1/rides/quote", json=payload, headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["quoted_fare_paisa"] > 0
    assert Decimal(str(data["distance_km"])) > Decimal("5.00")
    assert data["vehicle_mode"] == "bike"
    assert data["base_fare_paisa"] == 3000
    assert Decimal(str(data["applied_surge_multiplier"])) == Decimal("1.15")
    assert data["is_surge_capped"] is True
    assert data["weather_guard_applied"] is True
    assert data["currency"] == "BDT"


@pytest.mark.asyncio
async def test_fare_quote_out_of_bangladesh_bounds(client: AsyncClient, setup_ride_actors):
    """Rejects coordinates outside Bangladesh bounding box (lat 20.30..26.75, lng 88.00..92.75)."""
    headers = {"Authorization": f"Bearer {setup_ride_actors['passenger_token']}"}
    payload = {
        "vehicle_mode": "sedan",
        "pickup": {"lat": 40.7128, "lng": -74.0060},
        "dropoff": {"lat": 23.7925, "lng": 90.4078},
    }
    res = await client.post("/api/v1/rides/quote", json=payload, headers=headers)
    assert res.status_code == 422


# ============================================================================
# 2. RIDER ONBOARDING, DUTY & VEHICLES
# ============================================================================

@pytest.mark.asyncio
async def test_rider_lifecycle_and_verification(client: AsyncClient, setup_ride_actors):
    """Tests rider onboarding, vehicle addition, duty status enforcement & admin approval."""
    rider_headers = {"Authorization": f"Bearer {setup_ride_actors['rider_token']}"}
    admin_headers = {"Authorization": f"Bearer {setup_ride_actors['admin_token']}"}

    # Creating profile before admin approval prevents going online
    res_p = await client.post(
        "/api/v1/rides/riders/profile",
        json={
            "full_name": "Rafiqul Islam",
            "phone": "+8801700112233",
            "nid_number": "19901234567890123",
            "active_vehicle_mode": "bike",
            "home_city": "Dhaka",
        },
        headers=rider_headers,
    )
    assert res_p.status_code == 201
    rider_id = res_p.json()["id"]
    assert res_p.json()["kyc_status"] == "submitted"

    # Attempt online while unverified -> 403 PermissionDenied
    res_fail_duty = await client.post(
        "/api/v1/rides/riders/duty",
        json={"duty_status": "online", "current_lat": 23.81, "current_lng": 90.41},
        headers=rider_headers,
    )
    assert res_fail_duty.status_code == 403

    # Admin verifies rider -> allows online
    res_admin = await client.post(
        f"/api/v1/rides/admin/riders/{rider_id}/verify",
        json={"kyc_status": "verified", "brta_verified": True},
        headers=admin_headers,
    )
    assert res_admin.status_code == 200
    assert res_admin.json()["kyc_status"] == "verified"

    res_duty = await client.post(
        "/api/v1/rides/riders/duty",
        json={"duty_status": "online", "current_lat": 23.8105, "current_lng": 90.4128},
        headers=rider_headers,
    )
    assert res_duty.status_code == 200
    assert res_duty.json()["duty_status"] == "online"

    # Check GET profile/me and PATCH profile/me
    res_me = await client.get("/api/v1/rides/riders/profile/me", headers=rider_headers)
    assert res_me.status_code == 200
    assert res_me.json()["id"] == rider_id

    res_patch = await client.patch(
        "/api/v1/rides/riders/profile/me",
        json={"daily_goal_paisa": 200000},
        headers=rider_headers,
    )
    assert res_patch.status_code == 200
    assert res_patch.json()["daily_goal_paisa"] == 200000


# ============================================================================
# 3. RIDE REQUEST, RADAR & DISPATCH CLAIMING
# ============================================================================

@pytest.mark.asyncio
async def test_ride_request_radar_claim_and_cancel(client: AsyncClient, setup_ride_actors):
    """Passenger creates request, driver discovers on radar, claims it; second request is cancelled."""
    passenger_headers = {"Authorization": f"Bearer {setup_ride_actors['passenger_token']}"}
    rider_headers = {"Authorization": f"Bearer {setup_ride_actors['rider_token']}"}
    admin_headers = {"Authorization": f"Bearer {setup_ride_actors['admin_token']}"}

    await _onboard_and_go_online(client, rider_headers, admin_headers, plate_number="DHK-LA-11-9001")
    res_mismatched_mode = await client.patch(
        "/api/v1/rides/riders/profile/me",
        json={"active_vehicle_mode": "sedan"},
        headers=rider_headers,
    )
    assert res_mismatched_mode.status_code == 400

    req_payload = {
        "vehicle_mode": "bike",
        "ride_type": "on_demand",
        "pickup_address": "Road 11, Banani, Dhaka",
        "pickup_lat": 23.8103,
        "pickup_lng": 90.4125,
        "dropoff_address": "Uttara Sector 3, Dhaka",
        "dropoff_lat": 23.8759,
        "dropoff_lng": 90.3795,
        "payment_method": "bkash",
    }
    res_req = await client.post("/api/v1/rides/requests", json=req_payload, headers=passenger_headers)
    assert res_req.status_code == 201, res_req.text
    req_data = res_req.json()
    request_id = req_data["id"]
    assert req_data["status"] == "searching"

    # Driver discovers on radar
    res_radar = await client.get("/api/v1/rides/dispatch/radar", headers=rider_headers)
    assert res_radar.status_code == 200, res_radar.text
    radar_rides = res_radar.json()["ride_requests"]
    assert any(item["id"] == request_id for item in radar_rides)

    # A rider cannot accept a request for a vehicle they do not operate.
    res_sedan_req = await client.post(
        "/api/v1/rides/requests",
        json={**req_payload, "vehicle_mode": "sedan"},
        headers=passenger_headers,
    )
    assert res_sedan_req.status_code == 201, res_sedan_req.text
    res_wrong_vehicle_claim = await client.post(
        "/api/v1/rides/dispatch/claim",
        json={"target_type": "ride", "target_id": res_sedan_req.json()["id"]},
        headers=rider_headers,
    )
    assert res_wrong_vehicle_claim.status_code == 409

    # Driver claims dispatch
    res_claim = await client.post(
        "/api/v1/rides/dispatch/claim",
        json={"target_type": "ride", "target_id": request_id},
        headers=rider_headers,
    )
    assert res_claim.status_code == 200, res_claim.text
    claim_data = res_claim.json()
    assert claim_data["target_type"] == "ride"
    assert claim_data["trip"]["status"] == "accepted"
    assert claim_data["trip"]["ride_request_id"] == request_id

    # A rider already assigned to a trip cannot claim a second job concurrently.
    res_req2 = await client.post("/api/v1/rides/requests", json=req_payload, headers=passenger_headers)
    req2_id = res_req2.json()["id"]
    res_second_claim = await client.post(
        "/api/v1/rides/dispatch/claim",
        json={"target_type": "ride", "target_id": req2_id},
        headers=rider_headers,
    )
    assert res_second_claim.status_code == 400

    # Passenger can still cancel the second request.
    res_cancel = await client.post(
        f"/api/v1/rides/requests/{req2_id}/cancel",
        json={"reason": "Change of plans"},
        headers=passenger_headers,
    )
    assert res_cancel.status_code == 200
    assert res_cancel.json()["status"] == "cancelled"


# ============================================================================
# 4. TRIP START OTP, ARRIVAL & VERIFICATION
# ============================================================================

@pytest.mark.asyncio
async def test_trip_otp_verification_and_sos(client: AsyncClient, setup_ride_actors):
    """Driver arrives, passenger gets OTP, driver verifies OTP, trip begins, SOS can trigger."""
    passenger_headers = {"Authorization": f"Bearer {setup_ride_actors['passenger_token']}"}
    rider_headers = {"Authorization": f"Bearer {setup_ride_actors['rider_token']}"}
    admin_headers = {"Authorization": f"Bearer {setup_ride_actors['admin_token']}"}

    await _onboard_and_go_online(client, rider_headers, admin_headers, plate_number="DHK-LA-22-9002")

    res_req = await client.post(
        "/api/v1/rides/requests",
        json={
            "vehicle_mode": "bike",
            "pickup_address": "Banani",
            "pickup_lat": 23.8103,
            "pickup_lng": 90.4125,
            "dropoff_address": "Gulshan",
            "dropoff_lat": 23.7925,
            "dropoff_lng": 90.4078,
        },
        headers=passenger_headers,
    )
    req_id = res_req.json()["id"]

    res_claim = await client.post(
        "/api/v1/rides/dispatch/claim",
        json={"target_type": "ride", "target_id": req_id},
        headers=rider_headers,
    )
    trip_id = res_claim.json()["trip"]["id"]

    # 1. Driver marks arrival
    res_arr = await client.post(f"/api/v1/rides/trips/{trip_id}/arrived", headers=rider_headers)
    assert res_arr.status_code == 200
    assert res_arr.json()["status"] == "arrived_pickup"

    # 2. Passenger retrieves OTP
    res_otp = await client.get(f"/api/v1/rides/trips/{trip_id}/otp", headers=passenger_headers)
    assert res_otp.status_code == 200, res_otp.text
    otp_code = res_otp.json()["otp_code"]
    assert len(otp_code) == 6

    # 3. Wrong OTP returns 400
    wrong_otp = "000000" if otp_code != "000000" else "111111"
    res_wrong = await client.post(
        f"/api/v1/rides/trips/{trip_id}/verify-otp",
        json={"otp": wrong_otp},
        headers=rider_headers,
    )
    assert res_wrong.status_code == 400

    # 4. Correct OTP starts trip
    res_start = await client.post(
        f"/api/v1/rides/trips/{trip_id}/verify-otp",
        json={"otp": otp_code},
        headers=rider_headers,
    )
    assert res_start.status_code == 200, res_start.text
    assert res_start.json()["status"] == "in_progress"
    assert res_start.json()["otp_verified"] is True

    # 5. Passenger triggers emergency SOS
    res_sos = await client.post(
        f"/api/v1/rides/trips/{trip_id}/sos",
        json={"latitude": 23.8000, "longitude": 90.4100, "notes": "Unsafe driving"},
        headers=passenger_headers,
    )
    assert res_sos.status_code == 200
    assert res_sos.json()["sos_triggered"] is True


# ============================================================================
# 5. GPS TELEMETRY & VELOCITY SANITY
# ============================================================================

@pytest.mark.asyncio
async def test_trip_location_ping_and_velocity_sanity(client: AsyncClient, setup_ride_actors):
    """Validates live telemetry ingestion and rejects mock locations and teleportation (>160 km/h)."""
    passenger_headers = {"Authorization": f"Bearer {setup_ride_actors['passenger_token']}"}
    rider_headers = {"Authorization": f"Bearer {setup_ride_actors['rider_token']}"}
    admin_headers = {"Authorization": f"Bearer {setup_ride_actors['admin_token']}"}

    await _onboard_and_go_online(
        client, rider_headers, admin_headers, vehicle_mode="sedan", plate_number="DHK-GA-33-9003"
    )

    res_req = await client.post(
        "/api/v1/rides/requests",
        json={
            "vehicle_mode": "sedan",
            "pickup_address": "Gulshan",
            "pickup_lat": 23.8103,
            "pickup_lng": 90.4125,
            "dropoff_address": "Dhanmondi",
            "dropoff_lat": 23.7465,
            "dropoff_lng": 90.3760,
        },
        headers=passenger_headers,
    )
    res_claim = await client.post(
        "/api/v1/rides/dispatch/claim",
        json={"target_type": "ride", "target_id": res_req.json()["id"]},
        headers=rider_headers,
    )
    trip_id = res_claim.json()["trip"]["id"]

    otp_res = await client.get(f"/api/v1/rides/trips/{trip_id}/otp", headers=passenger_headers)
    await client.post(
        f"/api/v1/rides/trips/{trip_id}/verify-otp",
        json={"otp": otp_res.json()["otp_code"]},
        headers=rider_headers,
    )

    t0 = datetime.now(timezone.utc)
    # 1. Valid location ping
    res_ping1 = await client.post(
        f"/api/v1/rides/trips/{trip_id}/location",
        json={
            "latitude": 23.8105,
            "longitude": 90.4126,
            "speed_kmh": 35.0,
            "heading": 175.0,
            "accuracy_meters": 5.0,
            "is_mock_location": False,
            "recorded_at": t0.isoformat(),
        },
        headers=rider_headers,
    )
    assert res_ping1.status_code == 200, res_ping1.text
    assert res_ping1.json()["speed_kmh"] == 35.0

    # 2. Mock location is rejected
    res_mock = await client.post(
        f"/api/v1/rides/trips/{trip_id}/location",
        json={
            "latitude": 23.8090,
            "longitude": 90.4120,
            "is_mock_location": True,
            "recorded_at": (t0 + timedelta(seconds=10)).isoformat(),
        },
        headers=rider_headers,
    )
    assert res_mock.status_code == 400

    # 3. Unrealistic teleportation (>160 km/h: jumping from Dhaka to Chittagong in 10 seconds)
    res_teleport = await client.post(
        f"/api/v1/rides/trips/{trip_id}/location",
        json={
            "latitude": 22.3569,  # Chittagong
            "longitude": 91.7832,
            "is_mock_location": False,
            "recorded_at": (t0 + timedelta(seconds=10)).isoformat(),
        },
        headers=rider_headers,
    )
    assert res_teleport.status_code == 400


# ============================================================================
# 6. TRIP COMPLETION, DOUBLE-ENTRY SETTLEMENT & PAYOUT
# ============================================================================

@pytest.mark.asyncio
async def test_trip_completion_settlement_and_payout(client: AsyncClient, setup_ride_actors):
    """Driver completes trip, double-entry ledger credits/debits, and rider requests bKash payout."""
    passenger_headers = {"Authorization": f"Bearer {setup_ride_actors['passenger_token']}"}
    rider_headers = {"Authorization": f"Bearer {setup_ride_actors['rider_token']}"}
    admin_headers = {"Authorization": f"Bearer {setup_ride_actors['admin_token']}"}

    await _onboard_and_go_online(client, rider_headers, admin_headers, plate_number="DHK-LA-44-9004")

    # Long ride: Gulshan -> Gazipur (~18km) so rider_net_paisa >= 10000 paisa minimum cashout
    res_req = await client.post(
        "/api/v1/rides/requests",
        json={
            "vehicle_mode": "bike",
            "pickup_address": "Gulshan 2",
            "pickup_lat": 23.8103,
            "pickup_lng": 90.4125,
            "dropoff_address": "Gazipur Chowrasta",
            "dropoff_lat": 23.9999,
            "dropoff_lng": 90.3800,
        },
        headers=passenger_headers,
    )
    res_claim = await client.post(
        "/api/v1/rides/dispatch/claim",
        json={"target_type": "ride", "target_id": res_req.json()["id"]},
        headers=rider_headers,
    )
    trip_id = res_claim.json()["trip"]["id"]
    otp_res = await client.get(f"/api/v1/rides/trips/{trip_id}/otp", headers=passenger_headers)
    await client.post(
        f"/api/v1/rides/trips/{trip_id}/verify-otp",
        json={"otp": otp_res.json()["otp_code"]},
        headers=rider_headers,
    )

    # Complete Trip with tip
    res_comp = await client.post(
        f"/api/v1/rides/trips/{trip_id}/complete",
        json={"actual_distance_km": 21.5, "actual_duration_min": 45, "tip_paisa": 2000},
        headers=rider_headers,
    )
    assert res_comp.status_code == 200, res_comp.text
    comp_data = res_comp.json()
    assert comp_data["status"] == "completed"
    assert comp_data["settlement_status"] == "settled"
    assert comp_data["rider_net_paisa"] > 10000

    # Inspect Earnings Summary
    res_earn = await client.get("/api/v1/rides/riders/earnings", headers=rider_headers)
    assert res_earn.status_code == 200
    assert res_earn.json()["available_balance_paisa"] >= 10000

    # Inspect Ledger Entries
    res_ledg = await client.get("/api/v1/rides/riders/earnings/ledger", headers=rider_headers)
    assert res_ledg.status_code == 200
    assert len(res_ledg.json()) >= 2  # Fare credit + Commission debit + Tip credit

    # Request bKash Payout (100 BDT = 10000 paisa)
    res_payout = await client.post(
        "/api/v1/rides/riders/payouts",
        json={
            "amount_paisa": 10000,
            "channel": "bkash",
            "account_number_masked": "017***12233",
        },
        headers=rider_headers,
    )
    assert res_payout.status_code == 201, res_payout.text
    assert res_payout.json()["status"] == "requested"
    assert res_payout.json()["amount_paisa"] == 10000


# ============================================================================
# 7. PARCEL DELIVERY JOB LIFECYCLE
# ============================================================================

@pytest.mark.asyncio
async def test_delivery_job_lifecycle_with_otps_and_pod(
    client: AsyncClient, db_session: AsyncSession, setup_ride_actors
):
    """Rider claims open parcel delivery, verifies pickup OTP, verifies dropoff OTP & submits POD."""
    rider_headers = {"Authorization": f"Bearer {setup_ride_actors['rider_token']}"}
    admin_headers = {"Authorization": f"Bearer {setup_ride_actors['admin_token']}"}

    await _onboard_and_go_online(client, rider_headers, admin_headers, plate_number="DHK-LA-55-9005")

    # Seed valid FK records: Seller + Order + DeliveryJob
    seller = MarketplaceSeller(
        user_id=setup_ride_actors["seller_user_id"],
        business_name="Dhanmondi Crafts",
        slug="dhanmondi-crafts-test",
        district="Dhaka",
        region="Dhaka",
        pickup_address="Road 4, Dhanmondi",
        pickup_lat=23.7465,
        pickup_lng=90.3760,
        contact_phone="+8801700000001",
    )
    db_session.add(seller)
    await db_session.flush()

    order = MarketplaceOrder(
        order_reference="SJ-ORD-DLVTEST",
        buyer_id=setup_ride_actors["passenger_id"],
        delivery_tier="shopno_express",
        status="ready_for_pickup",
        payment_method="wallet",
        payment_status="escrowed",
        subtotal_paisa=250000,
        shipping_paisa=15000,
        total_paisa=265000,
        customer_name="Fatima Begum",
        customer_phone="+8801700000002",
        delivery_address="Uttara Sector 3",
        delivery_district="Dhaka",
    )
    db_session.add(order)
    await db_session.flush()

    job_id = uuid.uuid4()
    pickup_otp = "123456"
    dropoff_otp = "654321"
    job = DeliveryJob(
        id=job_id,
        job_reference=f"SJ-DLV-{job_id.hex[:8].upper()}",
        order_id=order.id,
        seller_id=seller.id,
        buyer_id=setup_ride_actors["passenger_id"],
        delivery_tier="shopno_express",
        status="open",
        pickup_address="Road 4, Dhanmondi",
        pickup_lat=23.7465,
        pickup_lng=90.3760,
        pickup_contact_name="Dhanmondi Crafts",
        pickup_contact_phone="+8801700000001",
        dropoff_address="Uttara Sector 3",
        dropoff_lat=23.8759,
        dropoff_lng=90.3795,
        dropoff_contact_name="Fatima Begum",
        dropoff_contact_phone="+8801700000002",
        package_summary="Jamdani Saree x1",
        delivery_fee_paisa=15000,
        rider_payout_paisa=12000,
        platform_commission_paisa=3000,
        pickup_otp_hash=hash_otp_code(pickup_otp, job_id),
        delivery_otp_hash=hash_otp_code(dropoff_otp, job_id),
    )
    db_session.add(job)
    await store_otp_in_vault(
        db_session,
        "delivery_pickup",
        job_id,
        setup_ride_actors["seller_user_id"],
        pickup_otp,
        datetime.now(timezone.utc) + timedelta(hours=12),
    )
    await store_otp_in_vault(
        db_session,
        "delivery_dropoff",
        job_id,
        setup_ride_actors["passenger_id"],
        dropoff_otp,
        datetime.now(timezone.utc) + timedelta(hours=24),
    )
    await db_session.commit()

    # 1. Discover open delivery jobs
    res_jobs = await client.get("/api/v1/rides/deliveries", headers=rider_headers)
    assert res_jobs.status_code == 200
    assert any(j["id"] == str(job_id) for j in res_jobs.json())

    # 2. Claim delivery job
    res_claim = await client.post(
        "/api/v1/rides/dispatch/claim",
        json={"target_type": "delivery", "target_id": str(job_id)},
        headers=rider_headers,
    )
    assert res_claim.status_code == 200, res_claim.text
    assert res_claim.json()["delivery_job"]["status"] == "claimed"

    # 3. Verify Merchant Pickup OTP
    res_pickup = await client.post(
        f"/api/v1/rides/deliveries/{job_id}/verify-pickup",
        json={"otp": pickup_otp},
        headers=rider_headers,
    )
    assert res_pickup.status_code == 200, res_pickup.text
    assert res_pickup.json()["status"] == "picked_up"

    # 4. Verify Dropoff OTP with POD photo & signature
    res_dropoff = await client.post(
        f"/api/v1/rides/deliveries/{job_id}/verify-dropoff",
        json={
            "otp": dropoff_otp,
            "pod_photo_url": "https://storage.shopnojatra.com/pod/pkg_123.jpg",
            "pod_signature_hash": "sha256:sig_hash_001",
            "pod_recipient_name": "Fatima Begum",
        },
        headers=rider_headers,
    )
    assert res_dropoff.status_code == 200, res_dropoff.text
    dropoff_data = res_dropoff.json()
    assert dropoff_data["status"] == "delivered"
    assert dropoff_data["pod_photo_url"] == "https://storage.shopnojatra.com/pod/pkg_123.jpg"
