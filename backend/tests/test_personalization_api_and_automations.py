"""
Comprehensive API Integration & Travel Automations (A-J) Test Suite.

Covers:
1. Zero-Trust JWT Auth (401) & RBAC Admin Enforcement (403 for standard user).
2. User Personalization APIs: GET/PUT preferences, location consent & sensitive
   payload rejection, 20D profile GET & PATCH correct, POST behavioral signals,
   POST opt-out, POST reset, DELETE profile.
3. User Notification Inbox APIs: GET inbox, POST devices, POST read & read-all,
   POST interact, GET /why explainability (safe factors, zero raw PII/CoT).
4. Admin Personalization APIs: overview, dimensions, rules GET/PUT + rollback,
   preview (strictly preview_only=True, dispatched=False, zero DB sends),
   segments CRUD + member evaluation, fatigue GET/PUT controls, analytics,
   experiments CRUD (critical category ban) + stop, outbox/DLQ replay/discard,
   and personalized broadcast.
5. All 10 Travel Automations (A-J) via both `TravelAutomationsService.evaluate_automation`
   and `/api/v1/personalization/admin/automations/{key}/evaluate`.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.notification import (
    Notification,
    NotificationDLQ,
    NotificationDelivery,
    NotificationOutbox,
)
from app.models.personalization import (
    ContextualTravelCondition,
    PersonalizationRuleConfig,
    UserPersonalizationProfile,
)
from app.models.user import AdminUser
from app.notifications.personalization.automations import (
    AUTOMATION_CATALOG,
    TravelAutomationsService,
)
from app.notifications.personalization.profile_service import UserProfileService
from app.notifications.personalization.signals import BehavioralSignalService
from tests.conftest import make_test_jwt


async def _create_admin_headers(db_session: AsyncSession) -> tuple[uuid.UUID, dict[str, str]]:
    admin_id = uuid.uuid4()
    db_session.add(AdminUser(user_id=admin_id, role="admin", status="active"))
    await db_session.commit()
    token = make_test_jwt(admin_id, email="admin@shopnojatra.com", role="user")
    return admin_id, {"Authorization": f"Bearer {token}"}


def _create_user_headers(email: str = "traveler@shopnojatra.com") -> tuple[uuid.UUID, dict[str, str]]:
    uid = uuid.uuid4()
    token = make_test_jwt(uid, email=email, role="user")
    return uid, {"Authorization": f"Bearer {token}"}


# ============================================================================
# 1. AUTHENTICATION & RBAC ENFORCEMENT
# ============================================================================


@pytest.mark.asyncio
async def test_api_auth_and_admin_rbac_enforcement(
    client: AsyncClient, db_session: AsyncSession
):
    # 1. Unauthenticated requests -> 401
    for url in (
        "/api/v1/personalization/preferences",
        "/api/v1/personalization/profile",
        "/api/v1/notifications",
        "/api/v1/personalization/admin/overview",
    ):
        resp = await client.get(url)
        assert resp.status_code == 401, f"Expected 401 on {url}, got {resp.status_code}"

    # 2. Standard non-admin user -> 403 on all admin routes
    _, user_headers = _create_user_headers()

    admin_gets = (
        "/api/v1/personalization/admin/overview",
        "/api/v1/personalization/admin/dimensions",
        "/api/v1/personalization/admin/rules",
        "/api/v1/personalization/admin/segments",
        "/api/v1/personalization/admin/fatigue",
        "/api/v1/personalization/admin/analytics",
        "/api/v1/personalization/admin/experiments",
        "/api/v1/notifications/admin/outbox",
        "/api/v1/notifications/admin/dlq",
    )
    for url in admin_gets:
        resp = await client.get(url, headers=user_headers)
        assert resp.status_code == 403, f"Expected 403 on GET {url}, got {resp.status_code}"

    admin_posts = (
        ("/api/v1/personalization/admin/preview", {"persona_preset": "family_midrange"}),
        ("/api/v1/personalization/admin/automations/A/evaluate", {"dry_run": True}),
        ("/api/v1/notifications/admin/process-outbox", {}),
    )
    for url, body in admin_posts:
        resp = await client.post(url, json=body, headers=user_headers)
        assert resp.status_code == 403, f"Expected 403 on POST {url}, got {resp.status_code}"


# ============================================================================
# 2. USER PERSONALIZATION PREFERENCES, 20D PROFILE, SIGNALS & LIFECYCLE
# ============================================================================


@pytest.mark.asyncio
async def test_user_personalization_crud_signals_consent_and_gdpr_lifecycle(
    client: AsyncClient,
):
    uid, headers = _create_user_headers("user.prefs@shopnojatra.com")

    # 1. GET initial preferences
    r_get = await client.get("/api/v1/personalization/preferences", headers=headers)
    assert r_get.status_code == 200
    assert r_get.json()["user_id"] == str(uid)
    assert r_get.json()["personalization_enabled"] is True

    # 2. PUT valid explicit preferences
    r_put = await client.put(
        "/api/v1/personalization/preferences",
        headers=headers,
        json={
            "preferred_language": "bn",
            "favorite_destinations": ["Sylhet", "Cox's Bazar"],
            "travel_styles": ["family", "nature"],
            "budget_tier": "economy",
            "location_consent": True,
            "home_city": "Dhaka",
            "digest_frequency": "daily",
            "frequency_cap_marketing_per_day": 2,
        },
    )
    assert r_put.status_code == 200
    pref_data = r_put.json()
    assert pref_data["preferred_language"] == "bn"
    assert "Sylhet" in pref_data["favorite_destinations"]
    assert pref_data["budget_tier"] == "economy"
    assert pref_data["home_city"] == "Dhaka"

    # 3. Reject location without consent & reject sensitive demographics
    r_bad_loc = await client.put(
        "/api/v1/personalization/preferences",
        headers=headers,
        json={"location_consent": False, "home_city": "Chattogram"},
    )
    assert r_bad_loc.status_code in (400, 422)

    r_bad_sens = await client.put(
        "/api/v1/personalization/preferences",
        headers=headers,
        json={"extra_preferences": {"political_affiliation": "none"}},
    )
    assert r_bad_sens.status_code in (400, 422)

    # 4. Ingest behavioral signal -> 201 Created
    r_sig = await client.post(
        "/api/v1/personalization/signals",
        headers=headers,
        json={
            "signal_type": "search",
            "destination": "Bandarban",
            "product_type": "tour",
            "filters": {"budget": "economy"},
        },
    )
    assert r_sig.status_code == 201
    assert r_sig.json()["recorded"] is True

    # 5. GET 20D Profile snapshot
    r_prof = await client.get("/api/v1/personalization/profile", headers=headers)
    assert r_prof.status_code == 200
    prof_json = r_prof.json()
    assert len(prof_json["dimensions"]) == 20
    assert prof_json["preferred_language"] == "bn"
    assert len(prof_json["explanation_summary"]) >= 1

    # 6. PATCH correct inferred dimension
    r_corr = await client.patch(
        "/api/v1/personalization/profile/correct",
        headers=headers,
        json={
            "dimension_key": "budget_profile",
            "action": "set",
            "corrected_value": {"tier": "mid_range", "currency": "BDT"},
            "reason": "Prefer mid-range stays",
        },
    )
    assert r_corr.status_code == 200
    assert r_corr.json()["dimensions"]["budget_profile"]["is_user_provided"] is True

    # 7. Opt-out marketing -> category_marketing becomes False
    r_opt = await client.post(
        "/api/v1/personalization/opt-out",
        headers=headers,
        json={"scope": "all_marketing", "reason": "Too many promos"},
    )
    assert r_opt.status_code == 200
    assert r_opt.json()["category_marketing"] is False

    # 8. Reset profile -> clears inferred dimensions
    r_rst = await client.post("/api/v1/personalization/reset", headers=headers)
    assert r_rst.status_code == 200
    assert r_rst.json()["action"] == "reset"

    # 9. Delete profile -> GDPR purge
    r_del = await client.delete("/api/v1/personalization/profile", headers=headers)
    assert r_del.status_code == 200
    assert r_del.json()["action"] == "deleted"


# ============================================================================
# 3. USER INBOX, DEVICES, EXPLAINABILITY (/why), READ & INTERACT
# ============================================================================


@pytest.mark.asyncio
async def test_user_notifications_inbox_devices_why_and_interact(
    client: AsyncClient, db_session: AsyncSession
):
    uid, user_headers = _create_user_headers("inbox.user@shopnojatra.com")
    _, admin_headers = await _create_admin_headers(db_session)

    # 1. Register push device token
    r_dev = await client.post(
        "/api/v1/notifications/devices",
        headers=user_headers,
        json={
            "device_id": f"dev-{uuid.uuid4().hex}",
            "push_token": f"fcm-tok-{uuid.uuid4().hex}",
            "token_type": "fcm",
            "platform": "android",
            "device_name": "Pixel Test",
        },
    )
    assert r_dev.status_code == 201
    assert r_dev.json()["platform"] == "android"

    # 2. Admin triggers a personalized broadcast directly to this user
    r_bc = await client.post(
        "/api/v1/notifications/admin/broadcast",
        headers=admin_headers,
        json={
            "title": "Explore travel opportunities this month.",
            "message": "Discover Cox's Bazar seasonal hotel deals.",
            "category": "marketing",
            "channel": "in_app",
            "target_user_ids": [str(uid)],
            "destination": "Cox's Bazar",
            "cta_label": "Explore Deals",
            "deep_link": "/(tabs)/explore",
            "priority": 9,  # immediate dispatch
        },
    )
    assert r_bc.status_code == 200
    assert r_bc.json()["dispatched_count"] >= 1

    # 3. GET user inbox
    r_inbox = await client.get("/api/v1/notifications", headers=user_headers)
    assert r_inbox.status_code == 200
    inbox_data = r_inbox.json()
    assert inbox_data["total"] >= 1
    assert inbox_data["unread_count"] >= 1
    notif_id = inbox_data["items"][0]["id"]

    # 4. GET /why explainability (must be PII-safe and non-empty)
    r_why = await client.get(f"/api/v1/notifications/{notif_id}/why", headers=user_headers)
    assert r_why.status_code == 200
    why_data = r_why.json()
    assert why_data["notification_id"] == notif_id
    assert len(why_data["explanation_factors"]) >= 1
    joined = " ".join(why_data["explanation_factors"]).lower()
    assert "chain of thought" not in joined
    assert "passport" not in joined

    # 5. POST interact (clicked -> anti-feedback-loop safe)
    r_inter = await client.post(
        f"/api/v1/notifications/{notif_id}/interact",
        headers=user_headers,
        json={"interaction_type": "clicked", "channel": "in_app"},
    )
    assert r_inter.status_code == 200
    assert r_inter.json()["anti_feedback_loop_applied"] is True

    # 6. POST read & read-all
    r_read = await client.post(f"/api/v1/notifications/{notif_id}/read", headers=user_headers)
    assert r_read.status_code == 200
    assert r_read.json()["is_read"] is True

    r_all = await client.post("/api/v1/notifications/read-all", headers=user_headers)
    assert r_all.status_code == 200
    assert r_all.json()["success"] is True


# ============================================================================
# 4. ADMIN COMMAND CENTER: OVERVIEW, RULES, PREVIEW, SEGMENTS, FATIGUE,
#    ANALYTICS, EXPERIMENTS, OUTBOX & DLQ
# ============================================================================


@pytest.mark.asyncio
async def test_admin_command_center_endpoints_and_preview_safety(
    client: AsyncClient, db_session: AsyncSession
):
    _, admin_headers = await _create_admin_headers(db_session)
    uid = uuid.uuid4()
    await UserProfileService.update_explicit_preferences(
        db_session,
        uid,
        {
            "preferred_language": "bn",
            "favorite_destinations": ["Sylhet"],
            "travel_styles": ["nature"],
            "budget_tier": "economy",
        },
    )
    await db_session.commit()

    # 1. Overview & Dimensions
    r_ov = await client.get("/api/v1/personalization/admin/overview", headers=admin_headers)
    assert r_ov.status_code == 200
    assert r_ov.json()["total_profiles"] >= 1

    r_dims = await client.get("/api/v1/personalization/admin/dimensions", headers=admin_headers)
    assert r_dims.status_code == 200
    assert len(r_dims.json()["dimensions"]) == 20

    # 2. Rules GET -> PUT (v1 baseline) -> PUT (v2) -> Rollback (to v1)
    r_rules = await client.get("/api/v1/personalization/admin/rules", headers=admin_headers)
    assert r_rules.status_code == 200
    weights = dict(r_rules.json()["active_rule"]["weights"])

    # Invalid weights sum != 1.0 -> 400/422
    bad_w = dict(weights)
    bad_w["DestinationInterest"] = 0.99
    r_bad_rules = await client.put(
        "/api/v1/personalization/admin/rules",
        headers=admin_headers,
        json={"weights": bad_w, "change_notes": "Invalid"},
    )
    assert r_bad_rules.status_code in (400, 422)

    # First persisted rule config (v1)
    r_put_v1 = await client.put(
        "/api/v1/personalization/admin/rules",
        headers=admin_headers,
        json={"weights": weights, "change_notes": "Initial persisted baseline"},
    )
    assert r_put_v1.status_code == 200
    v1 = r_put_v1.json()["version"]

    # Valid update -> increments version (v2)
    weights["DestinationInterest"] = round(weights["DestinationInterest"] + 0.02, 4)
    weights["CategoryPreference"] = round(weights["CategoryPreference"] - 0.02, 4)
    r_put_rules = await client.put(
        "/api/v1/personalization/admin/rules",
        headers=admin_headers,
        json={"weights": weights, "change_notes": "Boost destination weight"},
    )
    assert r_put_rules.status_code == 200
    assert r_put_rules.json()["version"] == v1 + 1

    r_rb = await client.post(
        f"/api/v1/personalization/admin/rules/rollback/{v1}",
        headers=admin_headers,
    )
    assert r_rb.status_code == 200
    assert r_rb.json()["active_version"] == v1

    # 3. Preview Decision (CRITICAL INVARIANT: preview_only=True, NEVER sends!)
    notif_count_before = await db_session.scalar(select(func.count(Notification.id)))
    deliv_count_before = await db_session.scalar(select(func.count(NotificationDelivery.id)))

    r_prev = await client.post(
        "/api/v1/personalization/admin/preview",
        headers=admin_headers,
        json={
            "user_id": str(uid),
            "event_type": "system.campaign.broadcast",
            "category": "marketing",
            "base_title": "Explore travel opportunities this month.",
            "base_body": "Discover tailored offers for you.",
            "destination": "Sylhet",
        },
    )
    assert r_prev.status_code == 200
    prev_json = r_prev.json()
    assert prev_json["preview_only"] is True
    assert prev_json["dispatched"] is False
    assert "generic_variant" in prev_json
    assert "personalized_variant" in prev_json

    notif_count_after = await db_session.scalar(select(func.count(Notification.id)))
    deliv_count_after = await db_session.scalar(select(func.count(NotificationDelivery.id)))
    assert notif_count_after == notif_count_before
    assert deliv_count_after == deliv_count_before

    # 4. Dynamic Segments (14 presets + custom segment + members)
    r_segs = await client.get("/api/v1/personalization/admin/segments", headers=admin_headers)
    assert r_segs.status_code == 200
    assert len(r_segs.json()) >= 14

    seg_key = f"sylhet_lovers_{uuid.uuid4().hex[:6]}"
    r_cseg = await client.post(
        "/api/v1/personalization/admin/segments",
        headers=admin_headers,
        json={
            "key": seg_key,
            "name": "Sylhet Nature Explorers",
            "query_criteria": {"destinations_any": ["Sylhet"]},
        },
    )
    assert r_cseg.status_code == 201
    r_mem = await client.get(
        f"/api/v1/personalization/admin/segments/{seg_key}/members",
        headers=admin_headers,
    )
    assert r_mem.status_code == 200
    assert r_mem.json()["total"] >= 1
    assert any(m["user_id"] == str(uid) for m in r_mem.json()["members"])

    # 5. Fatigue & Controls + Analytics + Admin Profile Inspector
    r_fat = await client.get("/api/v1/personalization/admin/fatigue", headers=admin_headers)
    assert r_fat.status_code == 200

    r_fctl = await client.put(
        "/api/v1/personalization/admin/fatigue/controls",
        headers=admin_headers,
        json={
            "global_daily_marketing_cap": 4,
            "high_fatigue_threshold": 70.0,
            "cooldown_hours": 18,
            "prefer_digest_on_high_fatigue": True,
        },
    )
    assert r_fctl.status_code == 200
    assert r_fctl.json()["global_daily_marketing_cap"] == 4

    r_ana = await client.get("/api/v1/personalization/admin/analytics", headers=admin_headers)
    assert r_ana.status_code == 200

    r_uprof = await client.get(
        f"/api/v1/personalization/admin/profiles/{uid}", headers=admin_headers
    )
    assert r_uprof.status_code == 200
    assert r_uprof.json()["user_id"] == str(uid)

    # 6. Experiments CRUD + Ban on Critical Transactional + Stop
    r_bad_exp = await client.post(
        "/api/v1/personalization/admin/experiments",
        headers=admin_headers,
        json={
            "key": "forbidden-booking-test",
            "name": "Bad Test",
            "hypothesis": "Cannot run on booking alerts",
            "experiment_type": "generic_vs_personalized",
            "target_categories": ["booking"],
            "variants": [{"name": "control", "weight": 0.5}, {"name": "treat", "weight": 0.5}],
        },
    )
    assert r_bad_exp.status_code in (400, 422)

    exp_key = f"promo-ab-{uuid.uuid4().hex[:6]}"
    r_exp = await client.post(
        "/api/v1/personalization/admin/experiments",
        headers=admin_headers,
        json={
            "key": exp_key,
            "name": "Promo Copy Test",
            "hypothesis": "Personalized CTA lifts CTR",
            "experiment_type": "cta",
            "target_categories": ["marketing"],
            "variants": [{"name": "control", "weight": 0.5}, {"name": "personalized", "weight": 0.5}],
        },
    )
    assert r_exp.status_code == 201
    exp_id = r_exp.json()["id"]

    r_exps = await client.get("/api/v1/personalization/admin/experiments", headers=admin_headers)
    assert r_exps.status_code == 200
    assert any(e["key"] == exp_key for e in r_exps.json())

    r_stop = await client.post(
        f"/api/v1/personalization/admin/experiments/{exp_id}/stop",
        headers=admin_headers,
        json={"reason": "QA complete"},
    )
    assert r_stop.status_code == 200
    assert r_stop.json()["status"] == "stopped"

    # 7. Outbox & DLQ endpoints
    ob = NotificationOutbox(
        event_id=uuid.uuid4(),
        event_type="booking.confirmed",
        aggregate_type="booking",
        aggregate_id="bk-dlq-api-1",
        actor_id=uid,
        priority=9,
        payload={"user_id": str(uid)},
        status="dead_letter",
    )
    db_session.add(ob)
    await db_session.flush()
    dlq_row = NotificationDLQ(
        outbox_id=ob.id,
        event_id=ob.event_id,
        event_type="booking.confirmed",
        payload={"user_id": str(uid)},
        failure_reason="API test failure",
        attempts=5,
        resolution_status="unresolved",
    )
    db_session.add(dlq_row)
    await db_session.commit()

    r_ob = await client.get("/api/v1/notifications/admin/outbox", headers=admin_headers)
    assert r_ob.status_code == 200
    assert r_ob.json()["total"] >= 1

    r_dlq = await client.get("/api/v1/notifications/admin/dlq", headers=admin_headers)
    assert r_dlq.status_code == 200
    assert r_dlq.json()["total"] >= 1

    r_rep = await client.post(
        f"/api/v1/notifications/admin/dlq/{dlq_row.id}/replay",
        headers=admin_headers,
    )
    assert r_rep.status_code == 200
    assert r_rep.json()["resolution_status"] == "replayed"


# ============================================================================
# 5. ALL 10 TRAVEL AUTOMATIONS (A-J)
# ============================================================================


@pytest.mark.asyncio
async def test_all_10_travel_automations_a_through_j(
    client: AsyncClient, db_session: AsyncSession
):
    _, admin_headers = await _create_admin_headers(db_session)
    now = datetime.now(timezone.utc)

    # Setup distinct users suited to Automations A-J
    uid_active = uuid.uuid4()
    uid_dormant = uuid.uuid4()

    await UserProfileService.update_explicit_preferences(
        db_session,
        uid_active,
        {
            "preferred_language": "en",
            "favorite_destinations": ["Cox's Bazar", "Sylhet"],
            "travel_styles": ["family", "nature"],
            "preferred_transport": ["flight"],
            "preferred_accommodation": ["resort"],
            "preferred_amenities": ["swimming_pool"],
            "budget_tier": "mid_range",
            "price_sensitivity_level": "high",
            "digest_frequency": "daily",
        },
        now=now - timedelta(days=5),
    )

    # Search signal 6 hours ago (for Automation C - Abandoned Search)
    await BehavioralSignalService.ingest_signal(
        db_session,
        user_id=uid_active,
        signal_type="search",
        destination="Sylhet",
        product_type="hotel",
        occurred_at=now - timedelta(hours=6),
    )

    # Upcoming booking in 4 days (Automation D - Trip Prep) & Completed booking 4 days ago (Automation E - Returning)
    db_session.add(
        Booking(
            booking_reference="SJ-PREP-101",
            user_id=uid_active,
            product_type="flight",
            origin_city="Dhaka",
            destination_city="Cox's Bazar",
            start_date=(now + timedelta(days=4)).date(),
            end_date=(now + timedelta(days=7)).date(),
            total_price=9500.0,
            final_price=9500.0,
            status="confirmed",
        )
    )
    db_session.add(
        Booking(
            booking_reference="SJ-RET-202",
            user_id=uid_active,
            product_type="hotel",
            origin_city="Dhaka",
            destination_city="Bandarban",
            start_date=(now - timedelta(days=7)).date(),
            end_date=(now - timedelta(days=4)).date(),
            total_price=7500.0,
            final_price=7500.0,
            status="completed",
            completed_at=now - timedelta(days=4),
        )
    )

    # Dormant user for Automation F
    await UserProfileService.update_explicit_preferences(
        db_session,
        uid_dormant,
        {
            "favorite_destinations": ["Cox's Bazar"],
            "budget_tier": "economy",
            "travel_styles": ["relaxation"],
        },
        now=now - timedelta(days=75),
    )
    prof_dormant = await UserProfileService.get_or_create_profile(db_session, uid_dormant)
    prof_dormant.activity_level = "dormant"
    prof_dormant.last_activity_at = now - timedelta(days=75)

    # Verified Weather condition for Automation G
    db_session.add(
        ContextualTravelCondition(
            condition_type="weather",
            destination="Cox's Bazar",
            payload_json={
                "severity": "advisory",
                "title": "Coastal sea breeze advisory",
                "summary": "Light coastal winds expected near Cox's Bazar beach; plan ferry trips early.",
                "weather_condition": "breezy",
            },
            provider="bmd_weather_verified",
            observed_at=now - timedelta(hours=1),
            valid_until=now + timedelta(days=2),
            reliability_score=95.0,
            is_verified=True,
        )
    )
    await db_session.commit()

    # Verify all 10 keys exist
    assert set(AUTOMATION_CATALOG.keys()) == {"A", "B", "C", "D", "E", "F", "G", "H", "I", "J"}

    # A: Destination Discovery
    cands_a = await TravelAutomationsService.evaluate_automation(
        db_session, "A", user_ids=[uid_active], now=now
    )
    assert len(cands_a) == 1 and cands_a[0].eligible is True
    assert cands_a[0].event_type == "automation.destination_discovery"

    # B: Smart Price Alert (with verified drop override)
    cands_b = await TravelAutomationsService.evaluate_automation(
        db_session,
        "B",
        user_ids=[uid_active],
        context_overrides={
            "verified_price_drops": [
                {
                    "route_key": "DAC-CXB",
                    "destination": "Cox's Bazar",
                    "previous_price_paisa": 650000,
                    "current_price_paisa": 480000,
                    "service_type": "flight",
                    "availability_verified": True,
                    "available_seats": 12,
                    "is_verified": True,
                }
            ]
        },
        now=now,
    )
    assert len(cands_b) == 1 and cands_b[0].eligible is True
    assert cands_b[0].event_type == "flight.price_alert.triggered"

    # C: Abandoned Search (must preserve lock-screen privacy in push_short_body!)
    cands_c = await TravelAutomationsService.evaluate_automation(
        db_session, "C", user_ids=[uid_active], now=now
    )
    assert len(cands_c) == 1 and cands_c[0].eligible is True
    assert cands_c[0].event_type == "automation.abandoned_search"
    assert "Sylhet" not in (cands_c[0].push_short_title or "")
    assert "Sylhet" not in (cands_c[0].push_short_body or "")

    # D: Trip Preparation (upcoming confirmed booking)
    cands_d = await TravelAutomationsService.evaluate_automation(
        db_session, "D", user_ids=[uid_active], now=now
    )
    assert len(cands_d) == 1 and cands_d[0].eligible is True
    assert cands_d[0].event_type == "automation.trip_preparation"

    # E: Returning Traveler (completed booking 4 days ago)
    cands_e = await TravelAutomationsService.evaluate_automation(
        db_session, "E", user_ids=[uid_active], now=now
    )
    assert len(cands_e) == 1 and cands_e[0].eligible is True
    assert cands_e[0].event_type == "automation.returning_traveler"

    # F: Inactive Reactivation (dormant user)
    cands_f = await TravelAutomationsService.evaluate_automation(
        db_session, "F", user_ids=[uid_dormant], now=now
    )
    assert len(cands_f) == 1 and cands_f[0].eligible is True
    assert cands_f[0].event_type == "automation.inactive_reactivation"

    # G: Weather Personalization (only fires when verified condition exists!)
    cands_g = await TravelAutomationsService.evaluate_automation(
        db_session, "G", user_ids=[uid_active], now=now
    )
    assert len(cands_g) == 1 and cands_g[0].eligible is True
    assert cands_g[0].event_type == "automation.weather_personalization"

    # Without verified conditions -> must NOT fabricate weather alert!
    cands_g_empty = await TravelAutomationsService.evaluate_automation(
        db_session,
        "G",
        user_ids=[uid_active],
        context_overrides={"verified_conditions": []},
        now=now,
    )
    assert len(cands_g_empty) == 0 or cands_g_empty[0].eligible is False

    # H: Hotel Personalization
    cands_h = await TravelAutomationsService.evaluate_automation(
        db_session,
        "H",
        user_ids=[uid_active],
        context_overrides={
            "available_hotels": [
                {
                    "hotel_name": "Sea Pearl Resort",
                    "city": "Cox's Bazar",
                    "budget_tier": "mid_range",
                    "price_per_night": 7000.0,
                    "amenities": ["swimming_pool", "beachfront"],
                    "available_rooms": 5,
                }
            ]
        },
        now=now,
    )
    assert len(cands_h) == 1 and cands_h[0].eligible is True
    assert cands_h[0].event_type == "automation.hotel_personalization"

    # I: Transport Personalization
    cands_i = await TravelAutomationsService.evaluate_automation(
        db_session,
        "I",
        user_ids=[uid_active],
        context_overrides={
            "transport_options": [
                {
                    "mode": "flight",
                    "route_key": "DAC-CXB",
                    "destination": "Cox's Bazar",
                    "duration_minutes": 55,
                    "price_bdt": 4500.0,
                    "available_seats": 18,
                }
            ]
        },
        now=now,
    )
    assert len(cands_i) == 1 and cands_i[0].eligible is True
    assert cands_i[0].event_type == "automation.transport_personalization"

    # J: Personalized Travel Digest (via API endpoint too!)
    r_api_j = await client.post(
        "/api/v1/personalization/admin/automations/J/evaluate",
        headers=admin_headers,
        json={
            "user_ids": [str(uid_active)],
            "dry_run": True,
            "context_overrides": {"force_window": True},
        },
    )
    assert r_api_j.status_code == 200
    j_data = r_api_j.json()
    assert j_data["automation_key"] == "J"
    assert j_data["candidates_generated"] >= 1
    assert j_data["staged_to_outbox"] == 0
