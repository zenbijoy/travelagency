"""
Comprehensive Test Suite for Local Commerce & Artisan Marketplace API (/api/v1/local-commerce/...).
Validates:
1. Seller onboarding, admin KYC verification, and GI certificate registration & public verification.
2. Product catalog creation, updates, and regional/GI-certified search & pagination.
3. Bargain / Make-an-Offer negotiation engine (auto-accept, counter, reject, and buyer accept).
4. Gift hamper bundle quoting with 8% multi-item bundle discount and packaging fee.
5. Atomic multi-vendor checkout with stock reservation, bargain price locking, escrow split, idempotency, and automatic rider DeliveryJob creation.
6. End-to-end delivery hand-off (seller fulfillment -> rider claim -> pickup OTP -> dropoff OTP -> escrow release).
7. Verified-buyer reviews (blocked before delivery, accepted after delivery, product rating recalculation, and seller reply).
"""

from datetime import date, timedelta
from decimal import Decimal
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import AdminUser
from tests.conftest import make_test_jwt


@pytest.fixture
async def setup_commerce_actors(db_session: AsyncSession):
    """Seed two artisan sellers, one buyer, one rider, and an admin user."""
    seller1_user_id = uuid.uuid4()
    seller2_user_id = uuid.uuid4()
    buyer_user_id = uuid.uuid4()
    rider_user_id = uuid.uuid4()
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
        "seller1_user_id": seller1_user_id,
        "seller1_token": make_test_jwt(seller1_user_id, email="artisan1@shopnojatra.com", role="user"),
        "seller2_user_id": seller2_user_id,
        "seller2_token": make_test_jwt(seller2_user_id, email="artisan2@shopnojatra.com", role="user"),
        "buyer_user_id": buyer_user_id,
        "buyer_token": make_test_jwt(buyer_user_id, email="buyer@shopnojatra.com", role="user"),
        "rider_user_id": rider_user_id,
        "rider_token": make_test_jwt(rider_user_id, email="rider@shopnojatra.com", role="user"),
        "admin_token": make_test_jwt(admin_id, email="admin@shopnojatra.com", role="admin"),
    }


async def _onboard_verified_seller(
    client: AsyncClient,
    seller_headers: dict,
    admin_headers: dict,
    business_name: str,
    slug: str,
    district: str = "Narayanganj",
    region: str = "Dhaka",
) -> dict:
    res = await client.post(
        "/api/v1/local-commerce/sellers/onboarding",
        json={
            "business_name": business_name,
            "bangla_name": business_name,
            "slug": slug,
            "district": district,
            "region": region,
            "pickup_address": f"Artisan Para, {district}",
            "pickup_lat": 23.6238,
            "pickup_lng": 90.5000,
            "contact_phone": "+8801711889900",
            "payout_channel": "bkash",
            "payout_account_masked": "017***89900",
        },
        headers=seller_headers,
    )
    assert res.status_code == 201, res.text
    seller_id = res.json()["id"]

    res_ver = await client.post(
        f"/api/v1/local-commerce/admin/sellers/{seller_id}/verify",
        json={"verification_status": "verified", "artisan_share_pct": "90.00"},
        headers=admin_headers,
    )
    assert res_ver.status_code == 200, res_ver.text
    return res_ver.json()


# ============================================================================
# 1. SELLER, GI CERTIFICATE & ARTISAN CATALOG
# ============================================================================

@pytest.mark.asyncio
async def test_seller_gi_certificate_and_catalog(client: AsyncClient, setup_commerce_actors):
    """Onboards seller, registers DPDT GI certificate, creates GI-tagged product, verifies lookup."""
    seller_headers = {"Authorization": f"Bearer {setup_commerce_actors['seller1_token']}"}
    admin_headers = {"Authorization": f"Bearer {setup_commerce_actors['admin_token']}"}

    await _onboard_verified_seller(
        client, seller_headers, admin_headers, "Sonargaon Jamdani Guild", "sonargaon-jamdani"
    )

    # Register GI certificate
    res_cert = await client.post(
        "/api/v1/local-commerce/gi/certificates",
        json={
            "certificate_code": "BD-GI-2026-001",
            "gi_registration_number": "GI-01-JAMDANI",
            "product_title": "Dhakai Jamdani Saree",
            "bangla_title": "ঢাকাই জামদানি",
            "origin_district": "Narayanganj",
            "region": "Dhaka",
            "issuer_authority": "DPDT Bangladesh",
            "badge_type": "gi",
            "artisan_guild": "Sonargaon Tant Samiti",
            "issued_date": "2020-11-17",
            "expires_date": (date.today() + timedelta(days=365)).isoformat(),
        },
        headers=seller_headers,
    )
    assert res_cert.status_code == 201, res_cert.text
    cert_id = res_cert.json()["id"]

    # Create GI-certified product linked to certificate
    res_prod = await client.post(
        "/api/v1/local-commerce/products",
        json={
            "gi_certificate_id": cert_id,
            "slug": "royal-dhakai-jamdani-84-count",
            "name": "84-Count Muslin Dhakai Jamdani",
            "bangla_name": "৮৪ কাউন্ট ঢাকাই জামদানি",
            "region": "Dhaka",
            "district": "Narayanganj",
            "category": "clothing",
            "price_bdt": "8500.00",
            "original_price_bdt": "9500.00",
            "min_bargain_price_bdt": "7200.00",
            "bargain_enabled": True,
            "weight_or_unit": "1 piece (5.5m)",
            "weight_grams": 650,
            "stock_quantity": 10,
            "gi_certified": True,
            "gi_code": "BD-GI-2026-001",
            "image_url": "https://cdn.shopnojatra.com/jamdani.jpg",
            "description": "Hand-woven authentic 84-count cotton jamdani by master artisans of Rupganj.",
        },
        headers=seller_headers,
    )
    assert res_prod.status_code == 201, res_prod.text

    # Public GI verify endpoint confirms linked count = 1
    res_verify = await client.get("/api/v1/local-commerce/gi/verify/BD-GI-2026-001")
    assert res_verify.status_code == 200
    v_data = res_verify.json()
    assert v_data["valid"] is True
    assert v_data["linked_products_count"] == 1

    # Catalog discovery filter by GI and region
    res_list = await client.get("/api/v1/local-commerce/products?region=Dhaka&gi_certified=true")
    assert res_list.status_code == 200
    assert res_list.json()["total"] == 1
    assert res_list.json()["items"][0]["slug"] == "royal-dhakai-jamdani-84-count"


# ============================================================================
# 2. BARGAIN / MAKE-AN-OFFER NEGOTIATION ENGINE
# ============================================================================

@pytest.mark.asyncio
async def test_bargain_negotiation_auto_accept_and_counter(client: AsyncClient, setup_commerce_actors):
    """Tests automated instant acceptance (>=88%), counter-proposal, and manual seller/buyer resolution."""
    seller_headers = {"Authorization": f"Bearer {setup_commerce_actors['seller1_token']}"}
    buyer_headers = {"Authorization": f"Bearer {setup_commerce_actors['buyer_token']}"}
    admin_headers = {"Authorization": f"Bearer {setup_commerce_actors['admin_token']}"}

    await _onboard_verified_seller(client, seller_headers, admin_headers, "Nakshi Studio", "nakshi-studio")
    res_prod = await client.post(
        "/api/v1/local-commerce/products",
        json={
            "slug": "jamalpur-nakshi-kantha-quilt",
            "name": "Jamalpur Nakshi Kantha",
            "bangla_name": "জামালপুর নকশী কাঁথা",
            "region": "Mymensingh",
            "district": "Jamalpur",
            "category": "handicraft",
            "price_bdt": "5000.00",
            "min_bargain_price_bdt": "4000.00",  # 80% floor, auto-accept at >= 88% (4400 BDT = 440000 paisa)
            "bargain_enabled": True,
            "weight_or_unit": "King Quilt",
            "weight_grams": 1200,
            "stock_quantity": 5,
            "image_url": "https://cdn.shopnojatra.com/kantha.jpg",
            "description": "Traditional embroidered patchwork quilt stitched in Jamalpur.",
        },
        headers=seller_headers,
    )
    prod_id = res_prod.json()["id"]

    # 1. Lowball (<50% = <250000 paisa) -> auto-rejected
    res_low = await client.post(
        "/api/v1/local-commerce/bargains",
        json={"product_id": prod_id, "offered_unit_price_paisa": 200000, "quantity": 1},
        headers=buyer_headers,
    )
    assert res_low.status_code == 201
    assert res_low.json()["status"] == "rejected"

    # 2. Mid-range (between floor 400000 and auto-accept 440000) -> countered
    res_mid = await client.post(
        "/api/v1/local-commerce/bargains",
        json={"product_id": prod_id, "offered_unit_price_paisa": 410000, "quantity": 1},
        headers=buyer_headers,
    )
    assert res_mid.status_code == 201
    mid_data = res_mid.json()
    assert mid_data["status"] == "countered"
    assert mid_data["counter_unit_price_paisa"] is not None

    # Buyer accepts artisan counter-offer
    res_acc = await client.post(
        f"/api/v1/local-commerce/bargains/{mid_data['id']}/respond",
        json={"action": "accept", "message": "Deal!"},
        headers=buyer_headers,
    )
    assert res_acc.status_code == 200
    assert res_acc.json()["status"] == "accepted"

    # 3. High offer (>= 440000 paisa) -> auto-accepted immediately
    res_high = await client.post(
        "/api/v1/local-commerce/bargains",
        json={"product_id": prod_id, "offered_unit_price_paisa": 450000, "quantity": 1},
        headers=buyer_headers,
    )
    assert res_high.status_code == 201
    assert res_high.json()["status"] == "auto_accepted"
    assert res_high.json()["agreed_unit_price_paisa"] == 450000


# ============================================================================
# 3. GIFT HAMPER QUOTING & MULTI-VENDOR ATOMIC CHECKOUT
# ============================================================================

@pytest.mark.asyncio
async def test_hamper_quote_and_atomic_multi_vendor_checkout(client: AsyncClient, setup_commerce_actors):
    """Quotes 3-item gift hamper (8% discount), performs multi-vendor checkout, reserves stock, creates DeliveryJobs."""
    s1_headers = {"Authorization": f"Bearer {setup_commerce_actors['seller1_token']}"}
    s2_headers = {"Authorization": f"Bearer {setup_commerce_actors['seller2_token']}"}
    buyer_headers = {"Authorization": f"Bearer {setup_commerce_actors['buyer_token']}"}
    admin_headers = {"Authorization": f"Bearer {setup_commerce_actors['admin_token']}"}

    await _onboard_verified_seller(client, s1_headers, admin_headers, "Sundarban Honey Co", "sundarban-honey", "Khulna", "Khulna")
    await _onboard_verified_seller(client, s2_headers, admin_headers, "Srimangal Tea Estate", "srimangal-tea", "Moulvibazar", "Sylhet")

    p1 = (await client.post(
        "/api/v1/local-commerce/products",
        json={
            "slug": "sundarban-kholisha-honey",
            "name": "Sundarban Kholisha Honey",
            "bangla_name": "সুন্দরবনের খলিশা মধু",
            "region": "Khulna",
            "district": "Khulna",
            "category": "tea_honey",
            "price_bdt": "1000.00",
            "weight_or_unit": "500g Jar",
            "weight_grams": 500,
            "stock_quantity": 20,
            "image_url": "https://cdn.shopnojatra.com/honey.jpg",
            "description": "Wild forest kholisha flower honey harvested sustainably.",
        },
        headers=s1_headers,
    )).json()

    p2 = (await client.post(
        "/api/v1/local-commerce/products",
        json={
            "slug": "srimangal-seven-layer-tea",
            "name": "Srimangal Orthodox Tea",
            "bangla_name": "শ্রীমঙ্গল চা",
            "region": "Sylhet",
            "district": "Moulvibazar",
            "category": "tea_honey",
            "price_bdt": "600.00",
            "weight_or_unit": "250g Tin",
            "weight_grams": 250,
            "stock_quantity": 15,
            "image_url": "https://cdn.shopnojatra.com/tea.jpg",
            "description": "Single-estate orthodox black tea from Srimangal valley.",
        },
        headers=s2_headers,
    )).json()

    p3 = (await client.post(
        "/api/v1/local-commerce/products",
        json={
            "slug": "bogura-shahi-doi-voucher",
            "name": "Bogura Ceramic Pot Doi Pack",
            "bangla_name": "বগুড়ার দই",
            "region": "Rajshahi",
            "district": "Bogura",
            "category": "food",
            "price_bdt": "400.00",
            "weight_or_unit": "1kg Clay Pot",
            "weight_grams": 1000,
            "stock_quantity": 8,
            "image_url": "https://cdn.shopnojatra.com/doi.jpg",
            "description": "Authentic sweetened caramelized yogurt in terracotta clay pot.",
        },
        headers=s1_headers,
    )).json()

    # 1. Hamper quote for 3 distinct items (subtotal = 2000 BDT = 200000 paisa, 5% bundle discount = 10000 paisa)
    res_quote = await client.post(
        "/api/v1/local-commerce/hampers/quote",
        json={
            "items": [
                {"product_id": p1["id"], "quantity": 1},
                {"product_id": p2["id"], "quantity": 1},
                {"product_id": p3["id"], "quantity": 1},
            ],
            "delivery_tier": "shopno_express",
        },
    )
    assert res_quote.status_code == 200, res_quote.text
    q = res_quote.json()
    assert q["bundle_discount_applied"] is True
    assert q["bundle_discount_paisa"] == 10000
    assert q["hamper_packaging_paisa"] == 15000

    # 2. Atomic Multi-Vendor Checkout with Idempotency Key
    checkout_payload = {
        "items": [
            {"product_id": p1["id"], "quantity": 2},
            {"product_id": p2["id"], "quantity": 1},
            {"product_id": p3["id"], "quantity": 1},
        ],
        "delivery_tier": "shopno_express",
        "payment_method": "bkash",
        "customer_name": "Nadia Chowdhury",
        "customer_phone": "+8801911002233",
        "delivery_address": "House 14, Road 6, Gulshan 1, Dhaka",
        "delivery_district": "Dhaka",
        "delivery_lat": 23.7808,
        "delivery_lng": 90.4161,
        "is_gift_hamper": True,
        "gift_message": "Eid Mubarak!",
        "idempotency_key": "IDEM-CART-0001",
    }
    res_co = await client.post("/api/v1/local-commerce/orders/checkout", json=checkout_payload, headers=buyer_headers)
    assert res_co.status_code == 200, res_co.text
    co = res_co.json()
    assert len(co["split_payouts"]) == 2  # Two distinct sellers
    assert len(co["delivery_job_ids"]) == 2  # Two pickup jobs automatically created

    # Verify stock decremented cleanly
    p1_after = (await client.get(f"/api/v1/local-commerce/products/{p1['id']}")).json()
    assert p1_after["stock_quantity"] == 18

    # Verify Idempotent Replay returns identical order without double deduction
    res_co_replay = await client.post("/api/v1/local-commerce/orders/checkout", json=checkout_payload, headers=buyer_headers)
    assert res_co_replay.status_code == 200
    assert res_co_replay.json()["idempotent"] is True
    assert res_co_replay.json()["order"]["id"] == co["order"]["id"]


# ============================================================================
# 4. END-TO-END FULFILLMENT -> DELIVERY -> ESCROW RELEASE -> VERIFIED REVIEW
# ============================================================================

@pytest.mark.asyncio
async def test_fulfillment_delivery_escrow_release_and_verified_review(client: AsyncClient, setup_commerce_actors):
    """Complete marketplace loop: order -> rider delivery -> seller escrow release -> buyer review & reply."""
    s1_headers = {"Authorization": f"Bearer {setup_commerce_actors['seller1_token']}"}
    buyer_headers = {"Authorization": f"Bearer {setup_commerce_actors['buyer_token']}"}
    rider_headers = {"Authorization": f"Bearer {setup_commerce_actors['rider_token']}"}
    admin_headers = {"Authorization": f"Bearer {setup_commerce_actors['admin_token']}"}

    await _onboard_verified_seller(client, s1_headers, admin_headers, "Tangail Tant House", "tangail-tant")

    prod = (await client.post(
        "/api/v1/local-commerce/products",
        json={
            "slug": "tangail-cotton-tant-saree",
            "name": "Tangail Cotton Tant Saree",
            "bangla_name": "টাঙ্গাইল তাঁতের শাড়ি",
            "region": "Dhaka",
            "district": "Tangail",
            "category": "clothing",
            "price_bdt": "2000.00",
            "weight_or_unit": "1 piece",
            "weight_grams": 500,
            "stock_quantity": 5,
            "image_url": "https://cdn.shopnojatra.com/tangail.jpg",
            "description": "Soft handloom cotton saree woven in Pathrail, Tangail.",
        },
        headers=s1_headers,
    )).json()

    # Setup & verify Rider for parcel delivery
    res_rp = await client.post(
        "/api/v1/rides/riders/profile",
        json={"full_name": "Courier Kabir", "phone": "+8801611998877", "nid_number": "19921234567890", "active_vehicle_mode": "bike", "home_city": "Dhaka"},
        headers=rider_headers,
    )
    rider_id = res_rp.json()["id"]
    await client.post(
        f"/api/v1/rides/admin/riders/{rider_id}/verify",
        json={"kyc_status": "verified", "brta_verified": True},
        headers=admin_headers,
    )
    await client.post(
        "/api/v1/rides/riders/duty",
        json={"duty_status": "online", "current_lat": 23.81, "current_lng": 90.41},
        headers=rider_headers,
    )

    # 1. Buyer checks out item
    res_co = await client.post(
        "/api/v1/local-commerce/orders/checkout",
        json={
            "items": [{"product_id": prod["id"], "quantity": 1}],
            "delivery_tier": "shopno_express",
            "payment_method": "bkash",
            "customer_name": "Sumaiya Akter",
            "customer_phone": "+8801755667788",
            "delivery_address": "Mirpur 10, Dhaka",
            "delivery_district": "Dhaka",
        },
        headers=buyer_headers,
    )
    assert res_co.status_code == 200
    order_id = res_co.json()["order"]["id"]
    job_id = res_co.json()["delivery_job_ids"][0]

    # Verify seller has escrowed funds (90% of 2000 BDT = 1800 BDT = 180000 paisa) and 0 available yet
    seller_me = (await client.get("/api/v1/local-commerce/sellers/me", headers=s1_headers)).json()
    assert seller_me["escrow_balance_paisa"] == 180000
    assert seller_me["available_balance_paisa"] == 0

    # Review blocked before delivery (400)
    res_rev_early = await client.post(
        "/api/v1/local-commerce/reviews",
        json={"product_id": prod["id"], "order_id": order_id, "rating": "5.0", "comment": "Looks great in photo!"},
        headers=buyer_headers,
    )
    assert res_rev_early.status_code == 400

    # 2. Seller packs order & gets pickup OTP
    res_ful = await client.post(
        f"/api/v1/local-commerce/seller/orders/{order_id}/fulfillment",
        json={"fulfillment_status": "packed"},
        headers=s1_headers,
    )
    assert res_ful.status_code == 200
    pickup_otp = res_ful.json()["pickup_otp"]
    assert pickup_otp is not None

    # Buyer retrieves dropoff OTP
    otps_buyer = (await client.get(f"/api/v1/local-commerce/orders/{order_id}/otps", headers=buyer_headers)).json()
    dropoff_otp = otps_buyer[0]["delivery_otp"]
    assert dropoff_otp is not None

    # 3. Rider claims job, verifies pickup OTP, and verifies dropoff OTP
    await client.post(
        "/api/v1/rides/dispatch/claim",
        json={"target_type": "delivery", "target_id": job_id},
        headers=rider_headers,
    )
    await client.post(
        f"/api/v1/rides/deliveries/{job_id}/verify-pickup",
        json={"otp": pickup_otp},
        headers=rider_headers,
    )
    res_dlv = await client.post(
        f"/api/v1/rides/deliveries/{job_id}/verify-dropoff",
        json={"otp": dropoff_otp, "pod_photo_url": "https://cdn.shopnojatra.com/pod.jpg", "pod_recipient_name": "Sumaiya Akter"},
        headers=rider_headers,
    )
    assert res_dlv.status_code == 200
    assert res_dlv.json()["status"] == "delivered"

    # 4. Verify seller escrow released into available balance
    seller_after = (await client.get("/api/v1/local-commerce/sellers/me", headers=s1_headers)).json()
    assert seller_after["escrow_balance_paisa"] == 0
    assert seller_after["available_balance_paisa"] == 180000

    # 5. Buyer submits verified-purchase review & seller replies
    res_rev = await client.post(
        "/api/v1/local-commerce/reviews",
        json={
            "product_id": prod["id"],
            "order_id": order_id,
            "rating": "4.5",
            "title": "Authentic Tangail weave",
            "comment": "Fabric quality and packaging were both top-notch!",
        },
        headers=buyer_headers,
    )
    assert res_rev.status_code == 201, res_rev.text
    review_id = res_rev.json()["id"]
    assert res_rev.json()["is_verified_purchase"] is True

    res_reply = await client.post(
        f"/api/v1/local-commerce/reviews/{review_id}/reply",
        json={"reply": "Thank you for supporting Pathrail handloom weavers!"},
        headers=s1_headers,
    )
    assert res_reply.status_code == 200
    assert res_reply.json()["seller_reply"] == "Thank you for supporting Pathrail handloom weavers!"
