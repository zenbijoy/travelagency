"""
10 Dynamic Personalized Travel Automations (A-J) (Agent 10) for ShopnoJatra.

Automations:
- A: Destination Discovery (interest + style + budget + seasonality; suppresses repeated pushes)
- B: Smart Price Alert (subscription/price-sensitivity + verified drop + delta threshold + cooldown + verified availability)
- C: Abandoned Search (search without booking + recency + post-booking suppression + lock-screen safety)
- D: Trip Preparation (booked trip departure date, transport, ticket status, hotel check-in, passenger completeness)
- E: Returning Traveler (post-trip delay window, review prompt, related destinations, no immediate promo spam)
- F: Inactive User Reactivation (dormant/inactive + historical interests + consent + low fatigue; never generic spam)
- G: Weather-Based Personalization (ONLY verified non-expired weather condition; calm non-urgent wording)
- H: Hotel Personalization (matches budget, amenities, location, travel style, dates)
- I: Transport Personalization (matches preferred transport, history, duration, route, price sensitivity)
- J: Personalized Travel Digest (respects daily | weekly | disabled; bundles destinations, deals, alerts, trip prep)
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta, timezone
import logging
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking, BookingPassenger
from app.models.flight import Airport, Flight
from app.models.hotel import Hotel, HotelRoom, HotelRoomAvailability
from app.models.notification import NotificationUserPreference
from app.models.personalization import (
    PersonalizationDecisionLog,
    UserBehavioralSignal,
    UserNotificationFatigue,
)
from app.models.price_alert import PriceAlert, PriceSnapshot
from app.models.ticket import Ticket
from app.notifications.events.base import DomainEvent
from app.notifications.personalization.dimensions import UserProfile20DSnapshot
from app.notifications.personalization.profile_service import UserProfileService
from app.notifications.personalization.relevance import (
    NotificationCandidate,
    RelevanceEngine,
)
from app.notifications.personalization.travel_context import (
    BUDGET_TIER_DAILY_BDT_RANGES,
    TRAVEL_CATALOG,
    ContextualConditionRecord,
    TravelContextEngine,
    evaluate_seasonal_suitability,
    get_destination_deep_link,
    get_destination_info,
    normalize_destination_key,
)

logger = logging.getLogger(__name__)


AUTOMATION_CATALOG: Dict[str, Dict[str, str]] = {
    "A": {
        "name": "Destination Discovery",
        "event_type": "automation.destination_discovery",
        "category": "marketing",
    },
    "B": {
        "name": "Smart Price Alert",
        "event_type": "flight.price_alert.triggered",
        "category": "price_alerts",
    },
    "C": {
        "name": "Abandoned Search",
        "event_type": "automation.abandoned_search",
        "category": "marketing",
    },
    "D": {
        "name": "Trip Preparation",
        "event_type": "automation.trip_preparation",
        "category": "booking",
    },
    "E": {
        "name": "Returning Traveler",
        "event_type": "automation.returning_traveler",
        "category": "community",
    },
    "F": {
        "name": "Inactive User Reactivation",
        "event_type": "automation.inactive_reactivation",
        "category": "marketing",
    },
    "G": {
        "name": "Weather-Based Personalization",
        "event_type": "automation.weather_personalization",
        "category": "flight_alerts",
    },
    "H": {
        "name": "Hotel Personalization",
        "event_type": "automation.hotel_personalization",
        "category": "marketing",
    },
    "I": {
        "name": "Transport Personalization",
        "event_type": "automation.transport_personalization",
        "category": "marketing",
    },
    "J": {
        "name": "Personalized Travel Digest",
        "event_type": "automation.personalized_digest",
        "category": "digest",
    },
}


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _extract_attr(obj: Any, key: str, default: Any = None) -> Any:
    if isinstance(obj, Mapping):
        return obj.get(key, default)
    return getattr(obj, key, default)


@dataclass
class AutomationCandidateSpec:
    """Generated candidate specification from one of the 10 travel automations (A-J)."""

    user_id: uuid.UUID
    automation_key: str
    automation_name: str
    event_type: str
    category: str
    priority: int
    title: str
    body: str
    push_short_title: str
    push_short_body: str
    cta: str
    deep_link: str
    destination: Optional[str] = None
    route_key: Optional[str] = None
    verified_facts: Dict[str, Any] = field(default_factory=dict)
    relevance_score: float = 0.0
    confidence_score: float = 0.0
    personalization_tier: str = "generic"
    matching_factors: List[str] = field(default_factory=list)
    eligible: bool = True
    suppression_reason: Optional[str] = None
    candidate: Optional[NotificationCandidate] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data.pop("candidate", None)
        return data

    def to_domain_event(self) -> DomainEvent:
        """Convert this automation candidate into an outbox-ready CloudEvents DomainEvent."""
        payload: Dict[str, Any] = {
            "user_id": str(self.user_id),
            "recipient_id": str(self.user_id),
            "automation_key": self.automation_key,
            "category": self.category,
            "title": self.title,
            "message": self.body,
            "body": self.body,
            "push_short_title": self.push_short_title,
            "push_short_body": self.push_short_body,
            "cta": self.cta,
            "deep_link": self.deep_link,
            "destination": self.destination,
            "route_key": self.route_key,
            "verified_facts": dict(self.verified_facts),
            "is_abandoned_search": self.automation_key == "C",
            "relevance_score": self.relevance_score,
            "confidence_score": self.confidence_score,
            "personalization_tier": self.personalization_tier,
            "matching_factors": list(self.matching_factors),
        }
        if self.candidate is not None:
            if self.candidate.budget_tier:
                payload["budget_tier"] = self.candidate.budget_tier
            if self.candidate.transport_mode:
                payload["transport_mode"] = self.candidate.transport_mode
            if self.candidate.travel_styles:
                payload["travel_styles"] = list(self.candidate.travel_styles)
            if self.candidate.price_paisa is not None:
                payload["price_paisa"] = self.candidate.price_paisa
            if self.candidate.discount_pct is not None:
                payload["discount_pct"] = self.candidate.discount_pct

        return DomainEvent(
            event_type=self.event_type,
            aggregate_type="user",
            aggregate_id=str(self.user_id),
            actor_id=self.user_id,
            priority=self.priority,
            payload=payload,
        )


def _score_spec(
    snapshot: UserProfile20DSnapshot,
    spec: AutomationCandidateSpec,
    candidate: NotificationCandidate,
    *,
    now: datetime,
) -> AutomationCandidateSpec:
    rel = RelevanceEngine.evaluate(snapshot, candidate, now=now)
    spec.relevance_score = rel.relevance_score
    spec.confidence_score = rel.confidence_score
    spec.personalization_tier = rel.recommended_tier
    spec.matching_factors = rel.matching_factors
    spec.candidate = candidate
    return spec


def _get_user_styles_and_budget(snapshot: UserProfile20DSnapshot, now: datetime) -> Tuple[List[str], Optional[str], List[str]]:
    styles: List[str] = []
    style_dim = snapshot.get_value("travel_style", default="unknown", now=now)
    if isinstance(style_dim, Mapping):
        styles.extend(str(s).lower() for s in (style_dim.get("styles") or []) if s)
    styles.extend(str(s).lower() for s in (snapshot.explicit_preferences.get("travel_styles") or []) if s)
    styles = list(dict.fromkeys(styles))

    budget_tier: Optional[str] = None
    b_dim = snapshot.get_value("budget_profile", default="unknown", now=now)
    if isinstance(b_dim, Mapping):
        budget_tier = b_dim.get("tier") or b_dim.get("budget_tier")
    if not budget_tier:
        budget_tier = snapshot.explicit_preferences.get("budget_tier")
    if budget_tier:
        budget_tier = str(budget_tier).strip().lower()

    trans_modes: List[str] = []
    t_dim = snapshot.get_value("transport_preference", default="unknown", now=now)
    if isinstance(t_dim, Mapping):
        trans_modes.extend(
            str(m).lower()
            for m in (t_dim.get("preferred_modes") or t_dim.get("modes") or [])
            if m
        )
        if t_dim.get("primary_mode"):
            trans_modes.append(str(t_dim["primary_mode"]).lower())
    trans_modes.extend(
        str(m).lower() for m in (snapshot.explicit_preferences.get("preferred_transport") or []) if m
    )
    trans_modes = [m for m in dict.fromkeys(trans_modes) if m != "unknown"]

    return styles, budget_tier, trans_modes


def _marketing_consent_ok(snapshot: UserProfile20DSnapshot, notif_pref: Optional[Any], now: datetime) -> bool:
    if notif_pref is not None and not bool(getattr(notif_pref, "category_marketing", True)):
        return False
    consent_val = snapshot.get_value("consent_communication_preferences", default="unknown", now=now)
    if isinstance(consent_val, Mapping) and consent_val.get("category_marketing") is False:
        return False
    return True


def _price_alert_consent_ok(snapshot: UserProfile20DSnapshot, notif_pref: Optional[Any], now: datetime) -> bool:
    if notif_pref is not None and not bool(getattr(notif_pref, "category_price_alerts", True)):
        return False
    consent_val = snapshot.get_value("consent_communication_preferences", default="unknown", now=now)
    if isinstance(consent_val, Mapping) and consent_val.get("category_price_alerts") is False:
        return False
    return True


# ============================================================================
# Individual Automation Evaluators (A - J)
# ============================================================================

def evaluate_automation_a_destination_discovery(
    snapshot: UserProfile20DSnapshot,
    *,
    notif_pref: Optional[Any] = None,
    recently_pushed_destinations: Sequence[str] = (),
    now: Optional[datetime] = None,
) -> AutomationCandidateSpec:
    """A. Destination Discovery: compares style, budget & seasonality; suppresses repeated pushes."""
    ref = _ensure_utc(now or datetime.now(timezone.utc))
    lang = snapshot.preferred_language if snapshot.preferred_language in ("en", "bn") else "en"
    styles, budget_tier, trans_modes = _get_user_styles_and_budget(snapshot, ref)
    recent_keys = {normalize_destination_key(d) for d in recently_pushed_destinations if d}

    # Build candidate pool ordered by user interests + catalog seasonality/style fit
    ranked_entries = []
    interest_by_key = {
        normalize_destination_key(k): float(v.get("score", 0.0) or 0.0)
        for k, v in snapshot.destination_interests.items()
        if normalize_destination_key(k)
    }
    fav_keys = {
        normalize_destination_key(d)
        for d in (snapshot.explicit_preferences.get("favorite_destinations") or [])
        if d
    }

    for entry in TRAVEL_CATALOG:
        season = evaluate_seasonal_suitability(entry.key, target_date=ref)
        style_fit = len(set(styles) & set(entry.travel_styles)) * 18.0 if styles else 10.0
        budget_fit = (
            18.0
            if (not budget_tier or budget_tier == "flexible" or budget_tier in entry.budget_tiers)
            else 0.0
        )
        interest_fit = interest_by_key.get(entry.key, 0.0) * 0.55 + (25.0 if entry.key in fav_keys else 0.0)
        total = season["score"] * 0.35 + style_fit + budget_fit + interest_fit
        ranked_entries.append((total, entry, season))

    ranked_entries.sort(key=lambda item: item[0], reverse=True)

    chosen_entry = None
    chosen_season = None
    all_recent_suppressed = False
    for _, entry, season in ranked_entries:
        if entry.key in recent_keys:
            all_recent_suppressed = True
            continue
        chosen_entry = entry
        chosen_season = season
        break

    if chosen_entry is None:
        fallback = ranked_entries[0][1]
        spec = AutomationCandidateSpec(
            user_id=snapshot.user_id,
            automation_key="A",
            automation_name=AUTOMATION_CATALOG["A"]["name"],
            event_type=AUTOMATION_CATALOG["A"]["event_type"],
            category="marketing",
            priority=3,
            destination=fallback.name,
            title=f"Discover {fallback.name}",
            body="Suppressed due to recent destination push cooldown.",
            push_short_title="Travel Ideas",
            push_short_body="Explore fresh destinations in ShopnoJatra.",
            cta="Explore",
            deep_link=get_destination_deep_link(fallback.name, intent="explore"),
            eligible=False,
            suppression_reason="recent_destination_push_suppressed",
        )
        return spec

    dest_name = chosen_entry.name_bn if lang == "bn" else chosen_entry.name
    deep_link = get_destination_deep_link(chosen_entry.name, intent="explore")

    if not snapshot.personalization_enabled or not _marketing_consent_ok(snapshot, notif_pref, ref):
        return AutomationCandidateSpec(
            user_id=snapshot.user_id,
            automation_key="A",
            automation_name=AUTOMATION_CATALOG["A"]["name"],
            event_type=AUTOMATION_CATALOG["A"]["event_type"],
            category="marketing",
            priority=3,
            destination=chosen_entry.name,
            title=f"Explore {dest_name}" if lang == "en" else f"{dest_name} ঘুরে দেখুন",
            body="Suppressed because marketing or personalization consent is disabled.",
            push_short_title="Explore Bangladesh",
            push_short_body="Curated destinations on ShopnoJatra.",
            cta="Explore",
            deep_link=deep_link,
            eligible=False,
            suppression_reason="marketing_or_personalization_disabled",
        )

    if lang == "bn":
        title = f"{dest_name} ভ্রমণের দারুণ সময় এখন"
        body = f"আপনার ভ্রমণ পছন্দ অনুযায়ী {dest_name}-এ মৌসুমি রিসোর্ট ও যাতায়াত অপশন দেখুন।"
        short_title = f"{dest_name} ভ্রমণ"
        short_body = "মৌসুমি ভ্রমণ ও থাকার অপশন দেখুন।"
        cta = "বিস্তারিত দেখুন"
    else:
        season_tag = chosen_season["suitability"] if chosen_season else "good"
        title = f"Discover {chosen_entry.name} This Season"
        body = (
            f"Based on {season_tag} seasonal conditions and your travel preferences, "
            f"explore stays and routes for {chosen_entry.name}."
        )
        short_title = f"Explore {chosen_entry.name}"
        short_body = "Browse seasonal stays and travel ideas in ShopnoJatra."
        cta = f"Explore {chosen_entry.name}"

    cand = NotificationCandidate(
        event_type="automation.destination_discovery",
        category="marketing",
        title=title,
        body=body,
        destination=chosen_entry.name,
        travel_styles=styles or list(chosen_entry.travel_styles[:2]),
        budget_tier=budget_tier,
        transport_mode=trans_modes[0] if trans_modes else None,
        target_date=ref,
        priority=4,
        automation_key="A",
    )
    spec = AutomationCandidateSpec(
        user_id=snapshot.user_id,
        automation_key="A",
        automation_name=AUTOMATION_CATALOG["A"]["name"],
        event_type="automation.destination_discovery",
        category="marketing",
        priority=4,
        destination=chosen_entry.name,
        title=title,
        body=body,
        push_short_title=short_title,
        push_short_body=short_body,
        cta=cta,
        deep_link=deep_link,
        verified_facts={
            "destination": chosen_entry.name,
            "season_suitability": chosen_season["suitability"] if chosen_season else "good",
            "suppressed_recent_repeats": all_recent_suppressed,
        },
        metadata={"recently_pushed_skipped": list(recent_keys)},
    )
    return _score_spec(snapshot, spec, cand, now=ref)


def evaluate_automation_b_smart_price_alert(
    snapshot: UserProfile20DSnapshot,
    *,
    notif_pref: Optional[Any] = None,
    price_alerts: Sequence[Any] = (),
    verified_price_drops: Sequence[Mapping[str, Any]] = (),
    min_drop_percent: float = 5.0,
    cooldown_hours: int = 24,
    now: Optional[datetime] = None,
) -> AutomationCandidateSpec:
    """
    B. Smart Price Alert: requires explicit subscription or price-interest,
    verified price drop, meaningful delta threshold, cooldown check, verified availability,
    and deep-link directly to search.
    """
    ref = _ensure_utc(now or datetime.now(timezone.utc))
    lang = snapshot.preferred_language if snapshot.preferred_language in ("en", "bn") else "en"
    ps_val = snapshot.get_value("price_sensitivity", default="unknown", now=now)
    is_price_interested = bool(
        price_alerts
        or (isinstance(ps_val, Mapping) and str(ps_val.get("level", "")).lower() in {"high", "medium"})
        or snapshot.explicit_preferences.get("price_sensitivity_level") in {"high", "medium"}
    )

    if not _price_alert_consent_ok(snapshot, notif_pref, ref):
        return AutomationCandidateSpec(
            user_id=snapshot.user_id,
            automation_key="B",
            automation_name=AUTOMATION_CATALOG["B"]["name"],
            event_type="flight.price_alert.triggered",
            category="price_alerts",
            priority=6,
            title="Price Alert Update",
            body="Price alerts disabled by user preference.",
            push_short_title="Price Alert",
            push_short_body="Price alert preferences disabled.",
            cta="Manage Alerts",
            deep_link="/screens/price-alerts",
            eligible=False,
            suppression_reason="price_alerts_opted_out",
        )

    if not is_price_interested:
        return AutomationCandidateSpec(
            user_id=snapshot.user_id,
            automation_key="B",
            automation_name=AUTOMATION_CATALOG["B"]["name"],
            event_type="flight.price_alert.triggered",
            category="price_alerts",
            priority=6,
            title="Price Alert Update",
            body="User has no active price alert subscription or price-drop affinity.",
            push_short_title="Price Alert",
            push_short_body="No active price alert subscriptions.",
            cta="Set Price Alert",
            deep_link="/screens/price-alerts",
            eligible=False,
            suppression_reason="not_subscribed_or_price_interested",
        )

    # Check active alert cooldown
    active_alerts = [
        a for a in price_alerts if str(_extract_attr(a, "status", "active")).lower() == "active"
    ]
    for alert in active_alerts:
        last_notified = _extract_attr(alert, "last_notified_at")
        if isinstance(last_notified, datetime):
            hours_since = (ref - _ensure_utc(last_notified)).total_seconds() / 3600.0
            if hours_since < float(cooldown_hours):
                dest = _extract_attr(alert, "destination")
                return AutomationCandidateSpec(
                    user_id=snapshot.user_id,
                    automation_key="B",
                    automation_name=AUTOMATION_CATALOG["B"]["name"],
                    event_type="flight.price_alert.triggered",
                    category="price_alerts",
                    priority=6,
                    destination=dest,
                    title="Price Alert Cooldown",
                    body=f"Price alert already notified {hours_since:.1f}h ago.",
                    push_short_title="Fare Watch",
                    push_short_body="Recent price alert within cooldown window.",
                    cta="View Alerts",
                    deep_link="/screens/price-alerts",
                    eligible=False,
                    suppression_reason="price_alert_cooldown",
                )

    # Find verified price drop matching alert or user interest
    chosen_drop: Optional[Dict[str, Any]] = None
    for drop in verified_price_drops:
        if not drop.get("is_verified", True):
            continue
        prev_p = drop.get("previous_price_paisa")
        curr_p = drop.get("current_price_paisa")
        pct = drop.get("drop_percent")
        if pct is None and prev_p and curr_p and float(prev_p) > 0:
            pct = ((float(prev_p) - float(curr_p)) / float(prev_p)) * 100.0
        if pct is None or float(pct) < min_drop_percent:
            continue
        # Availability verification check
        avail_verified = drop.get("availability_verified")
        avail_seats = drop.get("available_seats")
        if avail_verified is False or (avail_seats is not None and int(avail_seats) <= 0):
            return AutomationCandidateSpec(
                user_id=snapshot.user_id,
                automation_key="B",
                automation_name=AUTOMATION_CATALOG["B"]["name"],
                event_type="flight.price_alert.triggered",
                category="price_alerts",
                priority=6,
                destination=drop.get("destination"),
                route_key=drop.get("route_key"),
                title="Fare Unavailable",
                body="Detected fare drop had no verified inventory availability.",
                push_short_title="Fare Check",
                push_short_body="Inventory unavailable.",
                cta="Search Fares",
                deep_link=get_destination_deep_link(drop.get("destination"), intent="search"),
                eligible=False,
                suppression_reason="availability_not_verified",
            )
        if avail_verified is not True and (avail_seats is None or int(avail_seats) <= 0):
            continue
        chosen_drop = dict(drop)
        chosen_drop["computed_drop_pct"] = round(float(pct), 1)
        break

    if chosen_drop is None:
        return AutomationCandidateSpec(
            user_id=snapshot.user_id,
            automation_key="B",
            automation_name=AUTOMATION_CATALOG["B"]["name"],
            event_type="flight.price_alert.triggered",
            category="price_alerts",
            priority=6,
            title="Price Alert Monitoring",
            body="No verified price drop meeting delta and availability thresholds.",
            push_short_title="Fare Monitor",
            push_short_body="No qualifying price drop yet.",
            cta="View Alerts",
            deep_link="/screens/price-alerts",
            eligible=False,
            suppression_reason="no_verified_qualifying_price_drop",
        )

    dest = chosen_drop.get("destination") or "Sylhet"
    route_key = chosen_drop.get("route_key")
    curr_paisa = int(chosen_drop.get("current_price_paisa") or 0)
    curr_bdt = int(round(curr_paisa / 100.0)) if curr_paisa > 0 else None
    drop_pct = chosen_drop["computed_drop_pct"]
    service_type = str(chosen_drop.get("service_type") or "flight").lower()
    deep_link = get_destination_deep_link(dest, intent="search", product_type=service_type)

    if lang == "bn":
        price_str = f"৳{curr_bdt}" if curr_bdt else ""
        title = f"{dest} ভাড়ায় {drop_pct:.0f}% দাম কমেছে"
        body = f"আপনার প্রাইস অ্যালার্ট অনুযায়ী {dest} রুটে যাচাইকৃত ভাড়া {price_str} ({drop_pct:.0f}% সাশ্রয়)। এখনই সার্চ করুন।"
        short_title = f"{dest} ভাড়া কমেছে"
        short_body = f"যাচাইকৃত {drop_pct:.0f}% ভাড়া হ্রাস।"
        cta = "সার্চ দেখুন"
    else:
        price_str = f"BDT {curr_bdt}" if curr_bdt else ""
        title = f"Verified {drop_pct:.0f}% Price Drop to {dest}"
        body = f"Fare alert triggered for {dest}: verified rate {price_str} ({drop_pct:.0f}% below previous snapshot) with live availability."
        short_title = f"{dest} Price Drop ({drop_pct:.0f}%)"
        short_body = f"Verified fare now {price_str} on ShopnoJatra."
        cta = "Search Fares"

    verified_facts = {
        "destination": dest,
        "route_key": route_key,
        "price_paisa": curr_paisa,
        "price_bdt": curr_bdt,
        "discount_pct": drop_pct,
        "drop_percent": drop_pct,
        "availability_verified": True,
        "available_seats": chosen_drop.get("available_seats"),
        "provider": chosen_drop.get("provider", "price_snapshots"),
    }
    cand = NotificationCandidate(
        event_type="flight.price_alert.triggered",
        category="price_alerts",
        title=title,
        body=body,
        destination=dest,
        route_key=route_key,
        product_type=service_type,
        price_paisa=curr_paisa or None,
        discount_pct=drop_pct,
        transport_mode=service_type if service_type in {"flight", "train", "bus"} else None,
        priority=6,
        automation_key="B",
    )
    spec = AutomationCandidateSpec(
        user_id=snapshot.user_id,
        automation_key="B",
        automation_name=AUTOMATION_CATALOG["B"]["name"],
        event_type="flight.price_alert.triggered",
        category="price_alerts",
        priority=6,
        destination=dest,
        route_key=route_key,
        title=title,
        body=body,
        push_short_title=short_title,
        push_short_body=short_body,
        cta=cta,
        deep_link=deep_link,
        verified_facts=verified_facts,
    )
    return _score_spec(snapshot, spec, cand, now=ref)


def evaluate_automation_c_abandoned_search(
    snapshot: UserProfile20DSnapshot,
    *,
    notif_pref: Optional[Any] = None,
    recent_signals: Sequence[Any] = (),
    bookings: Sequence[Any] = (),
    min_age_hours: float = 2.0,
    max_age_hours: float = 72.0,
    now: Optional[datetime] = None,
) -> AutomationCandidateSpec:
    """
    C. Abandoned Search: detects search intent without booking within recency window,
    suppresses immediately if user booked after searching, and keeps lock-screen push
    100% free of specific search query/destination details!
    """
    ref = _ensure_utc(now or datetime.now(timezone.utc))
    lang = snapshot.preferred_language if snapshot.preferred_language in ("en", "bn") else "en"

    search_sigs: List[Tuple[datetime, Any]] = []
    for s in recent_signals:
        st = str(_extract_attr(s, "signal_type", "") or "").lower()
        if st in {"search", "repeated_search", "booking_attempt", "hotel_view"}:
            occ = _extract_attr(s, "occurred_at")
            if isinstance(occ, datetime):
                occ_utc = _ensure_utc(occ)
                age_h = (ref - occ_utc).total_seconds() / 3600.0
                if min_age_hours <= age_h <= max_age_hours:
                    search_sigs.append((occ_utc, s))

    # Also support search_behavior dimension fallback when no raw signal list passed
    dest: Optional[str] = None
    latest_search_at: Optional[datetime] = None
    product_type: Optional[str] = None
    route_key: Optional[str] = None

    if search_sigs:
        search_sigs.sort(key=lambda item: item[0], reverse=True)
        latest_search_at, top_sig = search_sigs[0]
        dest = _extract_attr(top_sig, "destination")
        product_type = _extract_attr(top_sig, "product_type")
        route_key = _extract_attr(top_sig, "route_key")
    else:
        sb = snapshot.get_value("search_behavior", default="unknown", now=ref)
        if isinstance(sb, Mapping):
            rec_dests = sb.get("repeated_destinations") or sb.get("recent_destinations") or []
            if rec_dests:
                dest = str(rec_dests[0])
            last_str = sb.get("last_search_at")
            if isinstance(last_str, str):
                try:
                    latest_search_at = _ensure_utc(datetime.fromisoformat(last_str))
                except ValueError:
                    latest_search_at = None

    if not dest and latest_search_at is None:
        return AutomationCandidateSpec(
            user_id=snapshot.user_id,
            automation_key="C",
            automation_name=AUTOMATION_CATALOG["C"]["name"],
            event_type="automation.abandoned_search",
            category="marketing",
            priority=4,
            title="Trip Planning Reminder",
            body="No recent unbooked search detected.",
            push_short_title="Trip Planning Reminder",
            push_short_body="Explore stays and routes on ShopnoJatra.",
            cta="Search Trips",
            deep_link="/screens/search",
            eligible=False,
            suppression_reason="no_abandoned_search_found",
        )

    # Suppress if user already booked after the search!
    dest_norm = normalize_destination_key(dest)
    for b in bookings:
        b_status = str(_extract_attr(b, "status", "") or "").lower()
        if b_status in {"cancelled", "refunded"}:
            continue
        if b_status in {"confirmed", "paid", "completed", "checked_in", "in_progress"}:
            b_dest = normalize_destination_key(_extract_attr(b, "destination_city"))
            b_created = _extract_attr(b, "confirmed_at") or _extract_attr(b, "created_at")
            same_dest = (dest_norm is None) or (b_dest == dest_norm)
            after_search = True
            if isinstance(b_created, datetime) and latest_search_at is not None:
                after_search = _ensure_utc(b_created) >= latest_search_at
            if same_dest and after_search:
                return AutomationCandidateSpec(
                    user_id=snapshot.user_id,
                    automation_key="C",
                    automation_name=AUTOMATION_CATALOG["C"]["name"],
                    event_type="automation.abandoned_search",
                    category="marketing",
                    priority=4,
                    destination=dest,
                    title="Booking Already Completed",
                    body="Suppressed because a booking was completed after the search.",
                    push_short_title="Trip Update",
                    push_short_body="Your booking is confirmed in ShopnoJatra.",
                    cta="View Trips",
                    deep_link="/(tabs)/trips",
                    eligible=False,
                    suppression_reason="already_booked_after_search",
                )

    if not snapshot.personalization_enabled or not _marketing_consent_ok(snapshot, notif_pref, ref):
        return AutomationCandidateSpec(
            user_id=snapshot.user_id,
            automation_key="C",
            automation_name=AUTOMATION_CATALOG["C"]["name"],
            event_type="automation.abandoned_search",
            category="marketing",
            priority=4,
            destination=dest,
            title="Continue Your Trip Planning",
            body="Suppressed by user marketing/personalization preference.",
            push_short_title="Continue Planning",
            push_short_body="Open ShopnoJatra to browse travel options.",
            cta="Open App",
            deep_link="/screens/search",
            eligible=False,
            suppression_reason="marketing_or_personalization_disabled",
        )

    deep_link = get_destination_deep_link(dest, intent="search", product_type=product_type)
    # CRITICAL PRIVACY INVARIANT: push_short_title & push_short_body NEVER reveal searched destination/query!
    if lang == "bn":
        title = f"{dest or 'আপনার'} ভ্রমণ পরিকল্পনা সম্পূর্ণ করুন"
        body = f"আপনি সম্প্রতি {dest or 'ভ্রমণ'} অপশন দেখেছেন। তুলনা করতে চাইলে অ্যাপে ফিরে আসুন।"
        short_title = "আপনার ভ্রমণ পরিকল্পনা"
        short_body = "নতুন অপশন দেখতে ShopnoJatra অ্যাপ খুলুন।"
        cta = "তুলনা করুন"
    else:
        title = f"Continue Planning Your {dest or 'Upcoming'} Trip"
        body = (
            f"You were recently comparing travel options for {dest or 'your trip'}. "
            "Open ShopnoJatra whenever you are ready to review updated itineraries."
        )
        short_title = "Continue Your Trip Planning"
        short_body = "Saved travel options are ready to review in ShopnoJatra."
        cta = "Resume Search"

    cand = NotificationCandidate(
        event_type="automation.abandoned_search",
        category="marketing",
        title=title,
        body=body,
        destination=dest,
        route_key=route_key,
        product_type=product_type,
        priority=4,
        automation_key="C",
    )
    spec = AutomationCandidateSpec(
        user_id=snapshot.user_id,
        automation_key="C",
        automation_name=AUTOMATION_CATALOG["C"]["name"],
        event_type="automation.abandoned_search",
        category="marketing",
        priority=4,
        destination=dest,
        route_key=route_key,
        title=title,
        body=body,
        push_short_title=short_title,
        push_short_body=short_body,
        cta=cta,
        deep_link=deep_link,
        verified_facts={
            "destination": dest,
            "is_abandoned_search": True,
            "lock_screen_safe": True,
        },
        metadata={"is_abandoned_search": True, "lock_screen_safe": True},
    )
    return _score_spec(snapshot, spec, cand, now=ref)


def evaluate_automation_d_trip_preparation(
    snapshot: UserProfile20DSnapshot,
    *,
    bookings: Sequence[Any] = (),
    tickets_by_booking: Mapping[str, Sequence[Any]] = (),
    passengers_by_booking: Mapping[str, Sequence[Any]] = (),
    prep_window_days: int = 14,
    now: Optional[datetime] = None,
) -> AutomationCandidateSpec:
    """
    D. Trip Preparation: reminds travelers with booked upcoming trips about departure date,
    transport mode, ticket status, hotel check-in, and passenger detail completeness.
    """
    ref = _ensure_utc(now or datetime.now(timezone.utc))
    today = ref.date()
    lang = snapshot.preferred_language if snapshot.preferred_language in ("en", "bn") else "en"

    upcoming: List[Tuple[int, Any]] = []
    for b in bookings:
        status = str(_extract_attr(b, "status", "") or "").lower()
        if status not in {"confirmed", "paid", "checked_in"}:
            continue
        start_d = _extract_attr(b, "start_date")
        if isinstance(start_d, datetime):
            start_d = start_d.date()
        if isinstance(start_d, date):
            days_left = (start_d - today).days
            if 0 <= days_left <= prep_window_days:
                upcoming.append((days_left, b))

    if not upcoming:
        return AutomationCandidateSpec(
            user_id=snapshot.user_id,
            automation_key="D",
            automation_name=AUTOMATION_CATALOG["D"]["name"],
            event_type="automation.trip_preparation",
            category="booking",
            priority=7,
            title="Trip Preparation",
            body="No upcoming confirmed booking within preparation window.",
            push_short_title="Trip Checklist",
            push_short_body="View your trips in ShopnoJatra.",
            cta="View Trips",
            deep_link="/(tabs)/trips",
            eligible=False,
            suppression_reason="no_upcoming_confirmed_trip",
        )

    upcoming.sort(key=lambda x: x[0])
    days_left, booking = upcoming[0]
    b_id = str(_extract_attr(booking, "id", ""))
    b_ref = _extract_attr(booking, "booking_reference")
    dest = _extract_attr(booking, "destination_city") or "your destination"
    origin = _extract_attr(booking, "origin_city")
    product_type = str(_extract_attr(booking, "product_type", "trip") or "trip").lower()
    start_d = _extract_attr(booking, "start_date")
    if isinstance(start_d, datetime):
        start_d = start_d.date()
    guests_expected = int(_extract_attr(booking, "number_of_guests", 1) or 1)

    tickets = list(tickets_by_booking.get(b_id, ()))
    ticket_status = (
        "issued"
        if any(str(_extract_attr(t, "status", "")).lower() == "active" for t in tickets)
        else "pending_verification"
    )
    passengers = list(passengers_by_booking.get(b_id, ()))
    passengers_complete = len(passengers) >= guests_expected

    checklist_items: List[str] = []
    if start_d:
        checklist_items.append(f"Departure: {start_d.isoformat()}")
    if product_type == "hotel":
        checklist_items.append("Hotel check-in details ready")
    else:
        checklist_items.append(f"Transport ({product_type}) ticket: {ticket_status}")
    if not passengers_complete:
        checklist_items.append(
            f"Passenger details incomplete ({len(passengers)}/{guests_expected} guests)"
        )
    else:
        checklist_items.append("Passenger details complete")

    if lang == "bn":
        title = f"{dest} যাত্রার প্রস্তুতি ({days_left} দিন বাকি)"
        body = f"বুকিং {b_ref or ''}: " + " • ".join(checklist_items)
        short_title = f"{dest} যাত্রার চেকলিস্ট"
        short_body = f"যাত্রা {days_left} দিন বাকি — টিকিট ও তথ্য যাচাই করুন।"
        cta = "চেকলিস্ট দেখুন"
    else:
        title = f"Trip Prep for {dest}: {days_left} Day(s) to Departure"
        body = f"Booking {b_ref or ''} ({product_type}): " + " | ".join(checklist_items) + "."
        short_title = f"{dest} Trip Prep"
        short_body = f"Departure in {days_left} day(s). Review ticket and passenger details."
        cta = "View Trip Checklist"

    verified_facts = {
        "booking_reference": b_ref,
        "destination": dest,
        "origin": origin,
        "departure_date": start_d.isoformat() if isinstance(start_d, date) else None,
        "days_until_departure": days_left,
        "product_type": product_type,
        "ticket_status": ticket_status,
        "passengers_complete": passengers_complete,
        "passengers_recorded": len(passengers),
        "guests_expected": guests_expected,
    }
    cand = NotificationCandidate(
        event_type="automation.trip_preparation",
        category="booking",
        title=title,
        body=body,
        destination=dest,
        product_type=product_type,
        transport_mode=product_type if product_type in {"flight", "train", "bus"} else None,
        priority=8,
        automation_key="D",
    )
    spec = AutomationCandidateSpec(
        user_id=snapshot.user_id,
        automation_key="D",
        automation_name=AUTOMATION_CATALOG["D"]["name"],
        event_type="automation.trip_preparation",
        category="booking",
        priority=8,
        destination=dest,
        title=title,
        body=body,
        push_short_title=short_title,
        push_short_body=short_body,
        cta=cta,
        deep_link="/(tabs)/trips",
        verified_facts=verified_facts,
    )
    return _score_spec(snapshot, spec, cand, now=ref)


def evaluate_automation_e_returning_traveler(
    snapshot: UserProfile20DSnapshot,
    *,
    bookings: Sequence[Any] = (),
    min_post_trip_delay_days: int = 2,
    max_post_trip_days: int = 14,
    now: Optional[datetime] = None,
) -> AutomationCandidateSpec:
    """
    E. Returning Traveler: waits for post-trip delay window (>= 2 days),
    never blasts immediate promo spam right on return, prompts for a review,
    and suggests related destinations.
    """
    ref = _ensure_utc(now or datetime.now(timezone.utc))
    today = ref.date()
    lang = snapshot.preferred_language if snapshot.preferred_language in ("en", "bn") else "en"

    recent_completed: List[Tuple[int, Any]] = []
    for b in bookings:
        status = str(_extract_attr(b, "status", "") or "").lower()
        if status not in {"completed", "confirmed", "paid"}:
            continue
        end_d = _extract_attr(b, "end_date") or _extract_attr(b, "start_date")
        comp_at = _extract_attr(b, "completed_at")
        if isinstance(comp_at, datetime):
            end_d = comp_at.date()
        elif isinstance(end_d, datetime):
            end_d = end_d.date()
        if isinstance(end_d, date) and end_d <= today:
            days_since = (today - end_d).days
            if 0 <= days_since <= max_post_trip_days:
                recent_completed.append((days_since, b))

    if not recent_completed:
        return AutomationCandidateSpec(
            user_id=snapshot.user_id,
            automation_key="E",
            automation_name=AUTOMATION_CATALOG["E"]["name"],
            event_type="automation.returning_traveler",
            category="community",
            priority=4,
            title="Welcome Back",
            body="No completed trip in post-trip window.",
            push_short_title="Welcome Back",
            push_short_body="Share your travel story on ShopnoJatra.",
            cta="Write Review",
            deep_link="/screens/reviews",
            eligible=False,
            suppression_reason="no_post_trip_booking",
        )

    recent_completed.sort(key=lambda x: x[0])
    days_since, booking = recent_completed[0]
    dest = _extract_attr(booking, "destination_city") or "your recent destination"

    if days_since < min_post_trip_delay_days:
        return AutomationCandidateSpec(
            user_id=snapshot.user_id,
            automation_key="E",
            automation_name=AUTOMATION_CATALOG["E"]["name"],
            event_type="automation.returning_traveler",
            category="community",
            priority=4,
            destination=dest,
            title="Post-Trip Cooldown",
            body="Suppressed during immediate post-trip cooldown to avoid promo spam.",
            push_short_title="Welcome Back",
            push_short_body="Rest up after your journey.",
            cta="View Trips",
            deep_link="/(tabs)/trips",
            eligible=False,
            suppression_reason="post_trip_cooldown_no_immediate_promo",
        )

    info = get_destination_info(dest)
    related_names: List[str] = []
    if info:
        for rel_key in info.related_destinations[:2]:
            rel_info = get_destination_info(rel_key)
            if rel_info:
                related_names.append(rel_info.name_bn if lang == "bn" else rel_info.name)
    related_str = ", ".join(related_names) if related_names else ("Sreemangal" if lang == "en" else "শ্রীমঙ্গল")

    if lang == "bn":
        title = f"{dest} ভ্রমণ কেমন ছিল? আপনার অভিজ্ঞতা শেয়ার করুন"
        body = f"আপনার {dest} ভ্রমণের রিভিউ দিন। পরবর্তীতে {related_str} ঘুরে দেখার আইডিয়াও পেতে পারেন।"
        short_title = "ভ্রমণের রিভিউ দিন"
        short_body = f"{dest} অভিজ্ঞতা শেয়ার করুন ও পরবর্তী গন্তব্য দেখুন।"
        cta = "রিভিউ লিখুন"
    else:
        title = f"How Was Your Trip to {dest}?"
        body = (
            f"Share a quick review from your recent {dest} stay to help fellow travelers. "
            f"When you're ready next, travelers who enjoyed {dest} also love {related_str}."
        )
        short_title = f"Review Your {dest} Trip"
        short_body = f"Share feedback and discover related destinations like {related_str}."
        cta = "Leave a Review"

    cand = NotificationCandidate(
        event_type="automation.returning_traveler",
        category="community",
        title=title,
        body=body,
        destination=dest,
        priority=4,
        automation_key="E",
    )
    spec = AutomationCandidateSpec(
        user_id=snapshot.user_id,
        automation_key="E",
        automation_name=AUTOMATION_CATALOG["E"]["name"],
        event_type="automation.returning_traveler",
        category="community",
        priority=4,
        destination=dest,
        title=title,
        body=body,
        push_short_title=short_title,
        push_short_body=short_body,
        cta=cta,
        deep_link=get_destination_deep_link(dest, intent="review"),
        verified_facts={
            "completed_destination": dest,
            "days_since_return": days_since,
            "related_destinations": related_names,
        },
    )
    return _score_spec(snapshot, spec, cand, now=ref)


def evaluate_automation_f_inactive_reactivation(
    snapshot: UserProfile20DSnapshot,
    *,
    notif_pref: Optional[Any] = None,
    max_fatigue_threshold: float = 50.0,
    now: Optional[datetime] = None,
) -> AutomationCandidateSpec:
    """
    F. Inactive User Reactivation: dormant/inactive users with historical interests,
    active consent, and low fatigue receive a tailored seasonal value offer — never
    generic 'We miss you' spam.
    """
    ref = _ensure_utc(now or datetime.now(timezone.utc))
    lang = snapshot.preferred_language if snapshot.preferred_language in ("en", "bn") else "en"

    if snapshot.activity_level not in {"inactive", "dormant"}:
        return AutomationCandidateSpec(
            user_id=snapshot.user_id,
            automation_key="F",
            automation_name=AUTOMATION_CATALOG["F"]["name"],
            event_type="automation.inactive_reactivation",
            category="marketing",
            priority=3,
            title="Reactivation",
            body="User is not inactive or dormant.",
            push_short_title="Travel Update",
            push_short_body="Explore ShopnoJatra.",
            cta="Explore",
            deep_link="/(tabs)",
            eligible=False,
            suppression_reason="user_not_inactive_or_dormant",
        )

    if not snapshot.personalization_enabled or not _marketing_consent_ok(snapshot, notif_pref, ref):
        return AutomationCandidateSpec(
            user_id=snapshot.user_id,
            automation_key="F",
            automation_name=AUTOMATION_CATALOG["F"]["name"],
            event_type="automation.inactive_reactivation",
            category="marketing",
            priority=3,
            title="Reactivation",
            body="Reactivation blocked: marketing or personalization consent disabled.",
            push_short_title="Travel Update",
            push_short_body="Consent disabled.",
            cta="Manage Preferences",
            deep_link="/screens/travel-preferences",
            eligible=False,
            suppression_reason="consent_disabled",
        )

    max_fatigue = max(
        (float(v.get("fatigue_score", 0.0) or 0.0) for v in snapshot.fatigue_by_category.values()),
        default=0.0,
    )
    in_cooldown = any(bool(v.get("in_cooldown")) for v in snapshot.fatigue_by_category.values())
    if max_fatigue >= max_fatigue_threshold or in_cooldown:
        return AutomationCandidateSpec(
            user_id=snapshot.user_id,
            automation_key="F",
            automation_name=AUTOMATION_CATALOG["F"]["name"],
            event_type="automation.inactive_reactivation",
            category="marketing",
            priority=3,
            title="Reactivation",
            body="Suppressed because user fatigue is above low-fatigue threshold.",
            push_short_title="Travel Update",
            push_short_body="Fatigue threshold active.",
            cta="Explore",
            deep_link="/(tabs)",
            eligible=False,
            suppression_reason="high_fatigue_reactivation_suppressed",
        )

    top_dests = snapshot.top_destinations(limit=1)
    styles, budget_tier, _ = _get_user_styles_and_budget(snapshot, ref)
    dest = str(top_dests[0]["destination"]) if top_dests else None
    if not dest:
        favs = snapshot.explicit_preferences.get("favorite_destinations") or []
        dest = str(favs[0]) if favs else None

    if not dest and not styles:
        return AutomationCandidateSpec(
            user_id=snapshot.user_id,
            automation_key="F",
            automation_name=AUTOMATION_CATALOG["F"]["name"],
            event_type="automation.inactive_reactivation",
            category="marketing",
            priority=3,
            title="Reactivation",
            body="No historical travel interests available for relevant reactivation.",
            push_short_title="Explore",
            push_short_body="Browse ShopnoJatra.",
            cta="Explore",
            deep_link="/(tabs)",
            eligible=False,
            suppression_reason="no_historical_interests_for_reactivation",
        )

    target_dest = dest or "Sylhet"
    season = evaluate_seasonal_suitability(target_dest, target_date=ref)
    if lang == "bn":
        dest_info = get_destination_info(target_dest)
        dest_bn = dest_info.name_bn if dest_info else target_dest
        title = f"{dest_bn}-এর বর্তমান মৌসুমি ভ্রমণ আপডেট"
        body = f"আপনার পূর্ববর্তী আগ্রহের ভিত্তিতে {dest_bn}-এর নতুন রুট ও মৌসুমি থাকার অপশনগুলো দেখুন।"
        short_title = f"{dest_bn} ভ্রমণ আপডেট"
        short_body = f"{dest_bn}-এর মৌসুমি রুট ও রিসোর্ট দেখুন।"
        cta = "অপশন দেখুন"
    else:
        title = f"Seasonal Update for {target_dest}"
        body = (
            f"Based on your past interest in {target_dest} ({season['suitability']} season now), "
            f"browse updated routes and stays tailored to your {budget_tier or 'preferred'} pace."
        )
        short_title = f"{target_dest} Seasonal Guide"
        short_body = f"Updated stays and routes for {target_dest} are now live."
        cta = f"Explore {target_dest}"

    cand = NotificationCandidate(
        event_type="automation.inactive_reactivation",
        category="marketing",
        title=title,
        body=body,
        destination=target_dest,
        travel_styles=styles,
        budget_tier=budget_tier,
        priority=3,
        automation_key="F",
    )
    spec = AutomationCandidateSpec(
        user_id=snapshot.user_id,
        automation_key="F",
        automation_name=AUTOMATION_CATALOG["F"]["name"],
        event_type="automation.inactive_reactivation",
        category="marketing",
        priority=3,
        destination=target_dest,
        title=title,
        body=body,
        push_short_title=short_title,
        push_short_body=short_body,
        cta=cta,
        deep_link=get_destination_deep_link(target_dest, intent="explore"),
        verified_facts={
            "historical_destination": target_dest,
            "season_suitability": season["suitability"],
            "fatigue_score": max_fatigue,
        },
    )
    return _score_spec(snapshot, spec, cand, now=ref)


def evaluate_automation_g_weather_personalization(
    snapshot: UserProfile20DSnapshot,
    *,
    verified_conditions: Sequence[ContextualConditionRecord] = (),
    now: Optional[datetime] = None,
) -> AutomationCandidateSpec:
    """
    G. Weather-Based Personalization: triggers ONLY when a verified, non-expired weather
    condition exists for user's booked/interested destination. Avoids false urgency!
    """
    ref = _ensure_utc(now or datetime.now(timezone.utc))
    lang = snapshot.preferred_language if snapshot.preferred_language in ("en", "bn") else "en"

    target_dests: List[str] = []
    if snapshot.active_trip_context.get("destination_city"):
        target_dests.append(str(snapshot.active_trip_context["destination_city"]))
    if snapshot.active_trip_context.get("destination"):
        target_dests.append(str(snapshot.active_trip_context["destination"]))
    for top in snapshot.top_destinations(limit=3):
        if top.get("destination"):
            target_dests.append(str(top["destination"]))
    target_keys = {normalize_destination_key(d) for d in target_dests if d}

    matched_cond: Optional[ContextualConditionRecord] = None
    for cond in verified_conditions:
        ok, _ = cond.is_usable(now=ref, min_reliability=0.5)
        if not ok:
            continue
        if cond.condition_type not in {"weather", "travel_advisory"}:
            continue
        c_key = normalize_destination_key(cond.destination) if cond.destination else None
        if c_key is None or (target_keys and c_key in target_keys):
            matched_cond = cond
            break

    if matched_cond is None:
        return AutomationCandidateSpec(
            user_id=snapshot.user_id,
            automation_key="G",
            automation_name=AUTOMATION_CATALOG["G"]["name"],
            event_type="automation.weather_personalization",
            category="flight_alerts",
            priority=5,
            title="Weather Outlook",
            body="No verified non-expired weather condition available.",
            push_short_title="Weather Outlook",
            push_short_body="No verified weather updates right now.",
            cta="Check Travel Intel",
            deep_link="/screens/travel-intelligence",
            eligible=False,
            suppression_reason="no_verified_weather_condition",
        )

    dest = matched_cond.destination or "your destination"
    payload = matched_cond.payload or {}
    summary = str(
        payload.get("weather_summary")
        or payload.get("summary")
        or payload.get("description")
        or "Verified weather update available"
    ).strip()
    severity = str(payload.get("severity") or "info").lower()
    is_caution = severity in {"medium", "high", "critical"}
    priority = 7 if is_caution else 5

    if lang == "bn":
        title = f"{dest}-এর যাচাইকৃত আবহাওয়া তথ্য"
        body = f"{matched_cond.provider} থেকে প্রাপ্ত তথ্য: {summary}। আপনার যাত্রা অনুযায়ী পরিকল্পনা করুন।"
        short_title = f"{dest} আবহাওয়া আপডেট"
        short_body = summary[:120]
        cta = "বিস্তারিত দেখুন"
    else:
        title = (
            f"Verified Weather Notice for {dest}"
            if is_caution
            else f"Weather Outlook for {dest}"
        )
        body = f"Verified update via {matched_cond.provider}: {summary}. Plan smoothly without last-minute surprises."
        short_title = f"{dest} Weather Outlook"
        short_body = summary[:120]
        cta = "View Outlook"

    verified_facts = {
        "destination": dest,
        "weather_verified": True,
        "weather_summary": summary,
        "condition_type": matched_cond.condition_type,
        "provider": matched_cond.provider,
        "observed_at": _ensure_utc(matched_cond.observed_at).isoformat(),
        "valid_until": _ensure_utc(matched_cond.valid_until).isoformat(),
        "reliability_score": matched_cond.reliability_score,
        "severity": severity,
    }
    cand = NotificationCandidate(
        event_type="automation.weather_personalization",
        category="flight_alerts",
        title=title,
        body=body,
        destination=dest,
        priority=priority,
        automation_key="G",
    )
    spec = AutomationCandidateSpec(
        user_id=snapshot.user_id,
        automation_key="G",
        automation_name=AUTOMATION_CATALOG["G"]["name"],
        event_type="automation.weather_personalization",
        category="flight_alerts",
        priority=priority,
        destination=dest,
        title=title,
        body=body,
        push_short_title=short_title,
        push_short_body=short_body,
        cta=cta,
        deep_link="/screens/travel-intelligence",
        verified_facts=verified_facts,
    )
    return _score_spec(snapshot, spec, cand, now=ref)


def evaluate_automation_h_hotel_personalization(
    snapshot: UserProfile20DSnapshot,
    *,
    notif_pref: Optional[Any] = None,
    available_hotels: Sequence[Mapping[str, Any]] = (),
    now: Optional[datetime] = None,
) -> AutomationCandidateSpec:
    """
    H. Hotel Personalization: matches budget, preferred amenities, location,
    travel style, and available dates from verified hotel inventory.
    """
    ref = _ensure_utc(now or datetime.now(timezone.utc))
    lang = snapshot.preferred_language if snapshot.preferred_language in ("en", "bn") else "en"
    styles, budget_tier, _ = _get_user_styles_and_budget(snapshot, ref)

    acc_dim = snapshot.get_value("accommodation_preference", default="unknown", now=ref)
    pref_amenities: List[str] = []
    if isinstance(acc_dim, Mapping):
        pref_amenities.extend(str(a).lower() for a in (acc_dim.get("amenities") or []) if a)
    pref_amenities.extend(
        str(a).lower() for a in (snapshot.explicit_preferences.get("preferred_amenities") or []) if a
    )
    pref_amenities = list(dict.fromkeys(pref_amenities))

    top_dests = snapshot.top_destinations(limit=3)
    target_dest = (
        snapshot.active_trip_context.get("destination_city")
        or snapshot.active_trip_context.get("destination")
        or (top_dests[0]["destination"] if top_dests else None)
    )
    target_key = normalize_destination_key(target_dest) if target_dest else None

    if not snapshot.personalization_enabled or not _marketing_consent_ok(snapshot, notif_pref, ref):
        return AutomationCandidateSpec(
            user_id=snapshot.user_id,
            automation_key="H",
            automation_name=AUTOMATION_CATALOG["H"]["name"],
            event_type="automation.hotel_personalization",
            category="marketing",
            priority=4,
            destination=target_dest,
            title="Hotel Recommendations",
            body="Suppressed due to marketing or personalization consent.",
            push_short_title="Stay Picks",
            push_short_body="Preferences disabled.",
            cta="Browse Stays",
            deep_link="/screens/hotels-homes",
            eligible=False,
            suppression_reason="marketing_or_personalization_disabled",
        )

    best_hotel: Optional[Dict[str, Any]] = None
    best_score = -1.0
    budget_range = BUDGET_TIER_DAILY_BDT_RANGES.get(budget_tier or "flexible", (1500, 30000))

    for h in available_hotels:
        if h.get("is_available") is False:
            continue
        h_city = str(h.get("city") or "")
        h_key = normalize_destination_key(h_city)
        score = 0.0
        if target_key and h_key == target_key:
            score += 45.0
        price_bdt = float(h.get("price_per_night_bdt") or 0.0)
        if price_bdt > 0:
            if budget_range[0] <= price_bdt <= budget_range[1]:
                score += 30.0
            elif price_bdt <= budget_range[1] * 1.25:
                score += 12.0
        h_amenities = {str(a).lower() for a in (h.get("amenities") or [])}
        amenity_hits = len(set(pref_amenities) & h_amenities)
        score += amenity_hits * 10.0
        h_tags = {str(t).lower() for t in (h.get("styles") or h.get("tags") or [])}
        if styles and (set(styles) & h_tags):
            score += 15.0
        if score > best_score:
            best_score = score
            best_hotel = dict(h)

    if best_hotel is None:
        return AutomationCandidateSpec(
            user_id=snapshot.user_id,
            automation_key="H",
            automation_name=AUTOMATION_CATALOG["H"]["name"],
            event_type="automation.hotel_personalization",
            category="marketing",
            priority=4,
            destination=target_dest,
            title="Stay Options",
            body="No matching verified hotel availability found for dates/preferences.",
            push_short_title="Stay Options",
            push_short_body="No matching hotel rooms available.",
            cta="Search Stays",
            deep_link=get_destination_deep_link(target_dest, intent="hotel"),
            eligible=False,
            suppression_reason="no_verified_hotel_match",
        )

    hotel_name = str(best_hotel.get("name") or "Partner Stay")
    city = str(best_hotel.get("city") or target_dest or "Sylhet")
    nightly_bdt = best_hotel.get("price_per_night_bdt")
    matched_am = sorted(set(pref_amenities) & {str(a).lower() for a in (best_hotel.get("amenities") or [])})
    deep_link = get_destination_deep_link(city, intent="search", product_type="hotel")

    if lang == "bn":
        am_note = f" ({', '.join(matched_am[:2])})" if matched_am else ""
        price_note = f" প্রতি রাত ৳{int(round(float(nightly_bdt)))} থেকে" if nightly_bdt else ""
        title = f"{city}-এ আপনার উপযোগী হোটেল: {hotel_name}"
        body = f"আপনার বাজেট ও পছন্দের সাথে মানানসই {hotel_name}{am_note}{price_note}।"
        short_title = f"{city} হোটেল সুপারিশ"
        short_body = f"{hotel_name}-এ থাকার অপশন দেখুন।"
        cta = "রুম দেখুন"
    else:
        am_note = f" featuring {', '.join(matched_am[:2])}" if matched_am else ""
        price_note = f" from BDT {int(round(float(nightly_bdt)))}/night" if nightly_bdt else ""
        title = f"Handpicked Stay in {city}: {hotel_name}"
        body = f"Matched to your travel style and budget: {hotel_name}{am_note}{price_note}."
        short_title = f"Stay Pick in {city}"
        short_body = f"Explore {hotel_name}{price_note}."
        cta = "View Stay"

    cand = NotificationCandidate(
        event_type="automation.hotel_personalization",
        category="marketing",
        title=title,
        body=body,
        destination=city,
        product_type="hotel",
        travel_styles=styles,
        budget_tier=budget_tier,
        price_paisa=int(float(nightly_bdt) * 100) if nightly_bdt else None,
        amenities=matched_am,
        priority=4,
        automation_key="H",
    )
    spec = AutomationCandidateSpec(
        user_id=snapshot.user_id,
        automation_key="H",
        automation_name=AUTOMATION_CATALOG["H"]["name"],
        event_type="automation.hotel_personalization",
        category="marketing",
        priority=4,
        destination=city,
        title=title,
        body=body,
        push_short_title=short_title,
        push_short_body=short_body,
        cta=cta,
        deep_link=deep_link,
        verified_facts={
            "hotel_name": hotel_name,
            "destination": city,
            "price_bdt": int(round(float(nightly_bdt))) if nightly_bdt else None,
            "matched_amenities": matched_am,
            "availability_verified": True,
        },
    )
    return _score_spec(snapshot, spec, cand, now=ref)


def evaluate_automation_i_transport_personalization(
    snapshot: UserProfile20DSnapshot,
    *,
    notif_pref: Optional[Any] = None,
    transport_options: Sequence[Mapping[str, Any]] = (),
    now: Optional[datetime] = None,
) -> AutomationCandidateSpec:
    """
    I. Transport Personalization: matches preferred transport mode, travel history,
    duration, route, and price sensitivity.
    """
    ref = _ensure_utc(now or datetime.now(timezone.utc))
    lang = snapshot.preferred_language if snapshot.preferred_language in ("en", "bn") else "en"
    styles, budget_tier, trans_modes = _get_user_styles_and_budget(snapshot, ref)

    loc_val = snapshot.get_value("location_context", default="unknown", now=ref)
    origin = (
        (loc_val.get("travel_origin") or loc_val.get("home_city"))
        if isinstance(loc_val, Mapping)
        else None
    ) or "Dhaka"
    top_dests = snapshot.top_destinations(limit=1)
    dest = (
        snapshot.active_trip_context.get("destination_city")
        or (top_dests[0]["destination"] if top_dests else None)
    )
    dest_info = get_destination_info(dest) if dest else None

    if not snapshot.personalization_enabled or not _marketing_consent_ok(snapshot, notif_pref, ref):
        return AutomationCandidateSpec(
            user_id=snapshot.user_id,
            automation_key="I",
            automation_name=AUTOMATION_CATALOG["I"]["name"],
            event_type="automation.transport_personalization",
            category="marketing",
            priority=4,
            destination=dest,
            title="Transport Options",
            body="Suppressed due to user marketing/personalization preference.",
            push_short_title="Route Options",
            push_short_body="Preferences disabled.",
            cta="Browse Routes",
            deep_link="/screens/search",
            eligible=False,
            suppression_reason="marketing_or_personalization_disabled",
        )

    chosen_mode = trans_modes[0] if trans_modes else None
    if not chosen_mode and dest_info:
        chosen_mode = dest_info.typical_transport_modes[0]
    chosen_mode = chosen_mode or "bus"
    target_dest = dest_info.name if dest_info else (dest or "Cox's Bazar")

    # Match explicit transport options if provided
    best_opt: Optional[Dict[str, Any]] = None
    for opt in transport_options:
        opt_mode = str(opt.get("mode") or "").lower()
        if opt_mode == chosen_mode or (not trans_modes):
            best_opt = dict(opt)
            chosen_mode = opt_mode or chosen_mode
            break

    route_key = (
        best_opt.get("route_key")
        if best_opt and best_opt.get("route_key")
        else f"{origin} -> {target_dest}"
    )
    duration_min = best_opt.get("duration_minutes") if best_opt else None
    price_bdt = best_opt.get("price_bdt") if best_opt else None

    deep_link = get_destination_deep_link(
        target_dest,
        intent=chosen_mode if chosen_mode in {"flight", "train", "bus"} else "search",
    )

    if lang == "bn":
        dur_txt = f" ({duration_min} মিনিট)" if duration_min else ""
        price_txt = f" ৳{int(round(float(price_bdt)))}" if price_bdt else ""
        title = f"{target_dest} রুটে আপনার পছন্দের {chosen_mode.upper()} অপশন"
        body = f"{route_key} রুটে {chosen_mode} অপশন{dur_txt}{price_txt} দেখুন।"
        short_title = f"{target_dest} যাতায়াত"
        short_body = f"{route_key} রুটে সুবিধাজনক যাত্রা দেখুন।"
        cta = "রুট দেখুন"
    else:
        dur_txt = f" (~{duration_min} mins)" if duration_min else ""
        price_txt = f" from BDT {int(round(float(price_bdt)))}" if price_bdt else ""
        title = f"Preferred {chosen_mode.title()} Routes for {target_dest}"
        body = f"Tailored {chosen_mode} options along {route_key}{dur_txt}{price_txt} matching your travel style and budget."
        short_title = f"{target_dest} {chosen_mode.title()} Options"
        short_body = f"Compare {chosen_mode} schedules on {route_key}."
        cta = f"Compare {chosen_mode.title()}"

    verified_facts: Dict[str, Any] = {
        "destination": target_dest,
        "route_key": route_key,
        "transport_mode": chosen_mode,
    }
    if duration_min is not None:
        verified_facts["duration_minutes"] = duration_min
    if price_bdt is not None:
        verified_facts["price_bdt"] = int(round(float(price_bdt)))

    cand = NotificationCandidate(
        event_type="automation.transport_personalization",
        category="marketing",
        title=title,
        body=body,
        destination=target_dest,
        route_key=route_key,
        product_type=chosen_mode,
        travel_styles=styles,
        budget_tier=budget_tier,
        transport_mode=chosen_mode,
        price_paisa=int(float(price_bdt) * 100) if price_bdt else None,
        priority=4,
        automation_key="I",
    )
    spec = AutomationCandidateSpec(
        user_id=snapshot.user_id,
        automation_key="I",
        automation_name=AUTOMATION_CATALOG["I"]["name"],
        event_type="automation.transport_personalization",
        category="marketing",
        priority=4,
        destination=target_dest,
        route_key=route_key,
        title=title,
        body=body,
        push_short_title=short_title,
        push_short_body=short_body,
        cta=cta,
        deep_link=deep_link,
        verified_facts=verified_facts,
    )
    return _score_spec(snapshot, spec, cand, now=ref)


def evaluate_automation_j_personalized_digest(
    snapshot: UserProfile20DSnapshot,
    *,
    notif_pref: Optional[Any] = None,
    last_digest_sent_at: Optional[datetime] = None,
    force_window: bool = False,
    now: Optional[datetime] = None,
) -> AutomationCandidateSpec:
    """
    J. Personalized Travel Digest: strictly respects `daily` | `weekly` | `disabled`
    and bundles relevant destinations, seasonal ideas, price alert mentions, and upcoming trip prep.
    """
    ref = _ensure_utc(now or datetime.now(timezone.utc))
    lang = snapshot.preferred_language if snapshot.preferred_language in ("en", "bn") else "en"
    freq = (snapshot.digest_frequency or "weekly").lower()

    if freq == "disabled":
        return AutomationCandidateSpec(
            user_id=snapshot.user_id,
            automation_key="J",
            automation_name=AUTOMATION_CATALOG["J"]["name"],
            event_type="automation.personalized_digest",
            category="digest",
            priority=3,
            title="Travel Digest",
            body="Digest disabled by user preference.",
            push_short_title="Travel Digest",
            push_short_body="Digest disabled.",
            cta="Manage Preferences",
            deep_link="/screens/travel-preferences",
            eligible=False,
            suppression_reason="digest_disabled",
        )

    if last_digest_sent_at is not None and not force_window:
        hours_since = (ref - _ensure_utc(last_digest_sent_at)).total_seconds() / 3600.0
        min_hours = 20.0 if freq == "daily" else 144.0  # 6 days for weekly
        if hours_since < min_hours:
            return AutomationCandidateSpec(
                user_id=snapshot.user_id,
                automation_key="J",
                automation_name=AUTOMATION_CATALOG["J"]["name"],
                event_type="automation.personalized_digest",
                category="digest",
                priority=3,
                title="Travel Digest",
                body=f"Digest cadence ({freq}) window not yet elapsed.",
                push_short_title="Travel Digest",
                push_short_body="Already delivered in current cadence.",
                cta="Explore",
                deep_link="/(tabs)",
                eligible=False,
                suppression_reason="digest_cadence_cooldown",
            )

    top_dests = [str(d["destination"]) for d in snapshot.top_destinations(limit=2) if d.get("destination")]
    dest_summary = ", ".join(top_dests) if top_dests else "Sylhet & Cox's Bazar"
    primary_dest = top_dests[0] if top_dests else "Sylhet"

    sections: List[str] = [f"Destinations: {dest_summary}"]
    if snapshot.travel_timeline_stage in {"booked", "preparing_for_departure"}:
        trip_dest = snapshot.active_trip_context.get("destination_city") or primary_dest
        sections.append(f"Upcoming trip prep: {trip_dest}")
    ps = snapshot.get_value("price_sensitivity", default="unknown", now=ref)
    if isinstance(ps, Mapping) and int(ps.get("price_alert_count", 0) or 0) > 0:
        sections.append("Active fare alerts monitored")

    freq_label_en = "Daily" if freq == "daily" else "Weekly"
    freq_label_bn = "দৈনিক" if freq == "daily" else "সাপ্তাহিক"

    if lang == "bn":
        title = f"আপনার {freq_label_bn} ShopnoJatra ট্রাভেল ডাইজেস্ট"
        body = f"এই {freq_label_bn} সারাংশে থাকছে {dest_summary}-এর মৌসুমি আইডিয়া ও প্রাসঙ্গিক ভ্রমণ আপডেট।"
        short_title = f"{freq_label_bn} ট্রাভেল ডাইজেস্ট"
        short_body = f"{dest_summary} সহ আপনার নির্বাচিত আপডেট দেখুন।"
        cta = "ডাইজেস্ট দেখুন"
    else:
        title = f"Your {freq_label_en} ShopnoJatra Travel Digest"
        body = " | ".join(sections) + "."
        short_title = f"{freq_label_en} Travel Digest"
        short_body = f"Curated travel ideas for {dest_summary}."
        cta = "Read Digest"

    cand = NotificationCandidate(
        event_type="automation.personalized_digest",
        category="digest",
        title=title,
        body=body,
        destination=primary_dest,
        priority=3,
        automation_key="J",
    )
    spec = AutomationCandidateSpec(
        user_id=snapshot.user_id,
        automation_key="J",
        automation_name=AUTOMATION_CATALOG["J"]["name"],
        event_type="automation.personalized_digest",
        category="digest",
        priority=3,
        destination=primary_dest,
        title=title,
        body=body,
        push_short_title=short_title,
        push_short_body=short_body,
        cta=cta,
        deep_link=get_destination_deep_link(primary_dest, intent="explore"),
        verified_facts={
            "digest_frequency": freq,
            "bundled_destinations": top_dests or ["Sylhet", "Cox's Bazar"],
            "sections": sections,
        },
    )
    return _score_spec(snapshot, spec, cand, now=ref)


# ============================================================================
# TravelAutomationsService (DB-Backed + Batch Evaluation)
# ============================================================================

class TravelAutomationsService:
    """
    Evaluates all 10 dynamic personalized travel automations (A-J) against live
    20D user intelligence snapshots, bookings, price alerts, inventory, and
    verified contextual conditions.
    """

    @staticmethod
    def list_automations() -> List[Dict[str, str]]:
        return [{"key": k, **v} for k, v in AUTOMATION_CATALOG.items()]

    @classmethod
    def evaluate_snapshot_automation(
        cls,
        automation_key: str,
        snapshot: UserProfile20DSnapshot,
        *,
        notif_pref: Optional[Any] = None,
        bookings: Sequence[Any] = (),
        tickets_by_booking: Mapping[str, Sequence[Any]] = (),
        passengers_by_booking: Mapping[str, Sequence[Any]] = (),
        recent_signals: Sequence[Any] = (),
        price_alerts: Sequence[Any] = (),
        verified_price_drops: Sequence[Mapping[str, Any]] = (),
        verified_conditions: Sequence[ContextualConditionRecord] = (),
        available_hotels: Sequence[Mapping[str, Any]] = (),
        transport_options: Sequence[Mapping[str, Any]] = (),
        recently_pushed_destinations: Sequence[str] = (),
        last_digest_sent_at: Optional[datetime] = None,
        context_overrides: Optional[Mapping[str, Any]] = None,
        now: Optional[datetime] = None,
    ) -> AutomationCandidateSpec:
        """Pure synchronous evaluation of one automation (A-J) for one user snapshot."""
        key = automation_key.strip().upper()
        if key not in AUTOMATION_CATALOG:
            raise ValueError(f"Unsupported automation key '{automation_key}'. Expected A-J.")

        overrides = dict(context_overrides or {})
        ref = _ensure_utc(now or datetime.now(timezone.utc))

        if key == "A":
            return evaluate_automation_a_destination_discovery(
                snapshot,
                notif_pref=notif_pref,
                recently_pushed_destinations=overrides.get(
                    "recently_pushed_destinations", recently_pushed_destinations
                ),
                now=ref,
            )
        if key == "B":
            return evaluate_automation_b_smart_price_alert(
                snapshot,
                notif_pref=notif_pref,
                price_alerts=price_alerts,
                verified_price_drops=overrides.get("verified_price_drops", verified_price_drops),
                min_drop_percent=float(overrides.get("min_drop_percent", 5.0)),
                cooldown_hours=int(overrides.get("cooldown_hours", 24)),
                now=ref,
            )
        if key == "C":
            return evaluate_automation_c_abandoned_search(
                snapshot,
                notif_pref=notif_pref,
                recent_signals=recent_signals,
                bookings=bookings,
                min_age_hours=float(overrides.get("min_age_hours", 2.0)),
                max_age_hours=float(overrides.get("max_age_hours", 72.0)),
                now=ref,
            )
        if key == "D":
            return evaluate_automation_d_trip_preparation(
                snapshot,
                bookings=bookings,
                tickets_by_booking=tickets_by_booking,
                passengers_by_booking=passengers_by_booking,
                prep_window_days=int(overrides.get("prep_window_days", 14)),
                now=ref,
            )
        if key == "E":
            return evaluate_automation_e_returning_traveler(
                snapshot,
                bookings=bookings,
                min_post_trip_delay_days=int(overrides.get("min_post_trip_delay_days", 2)),
                max_post_trip_days=int(overrides.get("max_post_trip_days", 14)),
                now=ref,
            )
        if key == "F":
            return evaluate_automation_f_inactive_reactivation(
                snapshot,
                notif_pref=notif_pref,
                max_fatigue_threshold=float(overrides.get("max_fatigue_threshold", 50.0)),
                now=ref,
            )
        if key == "G":
            return evaluate_automation_g_weather_personalization(
                snapshot,
                verified_conditions=overrides.get("verified_conditions", verified_conditions),
                now=ref,
            )
        if key == "H":
            return evaluate_automation_h_hotel_personalization(
                snapshot,
                notif_pref=notif_pref,
                available_hotels=overrides.get("available_hotels", available_hotels),
                now=ref,
            )
        if key == "I":
            return evaluate_automation_i_transport_personalization(
                snapshot,
                notif_pref=notif_pref,
                transport_options=overrides.get("transport_options", transport_options),
                now=ref,
            )
        return evaluate_automation_j_personalized_digest(
            snapshot,
            notif_pref=notif_pref,
            last_digest_sent_at=last_digest_sent_at,
            force_window=bool(overrides.get("force_window", False)),
            now=ref,
        )

    @classmethod
    async def evaluate_automation(
        cls,
        db: AsyncSession,
        automation_key: str,
        *,
        user_ids: Optional[Sequence[uuid.UUID]] = None,
        limit: int = 50,
        context_overrides: Optional[Mapping[str, Any]] = None,
        now: Optional[datetime] = None,
    ) -> List[AutomationCandidateSpec]:
        """Evaluate automation A-J across target users using batched DB queries."""
        key = automation_key.strip().upper()
        if key not in AUTOMATION_CATALOG:
            raise ValueError(f"Unsupported automation key '{automation_key}'. Expected A-J.")

        ref = _ensure_utc(now or datetime.now(timezone.utc))

        if user_ids is None:
            from app.models.personalization import UserPersonalizationProfile

            res = await db.execute(
                select(UserPersonalizationProfile.user_id).limit(max(1, min(500, limit)))
            )
            target_ids = list(res.scalars().all())
        else:
            target_ids = list(dict.fromkeys(user_ids))[: max(1, min(500, limit))]

        if not target_ids:
            return []

        snapshots = await UserProfileService.build_20d_snapshots_batch(db, target_ids, now=ref)

        pref_res = await db.execute(
            select(NotificationUserPreference).where(
                NotificationUserPreference.user_id.in_(target_ids)
            )
        )
        prefs_by_user = {p.user_id: p for p in pref_res.scalars().all()}

        # Load supporting tables only as needed for the selected automation
        bookings_by_user: Dict[uuid.UUID, List[Booking]] = {}
        tickets_by_booking: Dict[str, List[Ticket]] = {}
        passengers_by_booking: Dict[str, List[BookingPassenger]] = {}
        if key in {"C", "D", "E"}:
            b_res = await db.execute(
                select(Booking).where(Booking.user_id.in_(target_ids))
            )
            all_bookings = list(b_res.scalars().all())
            for b in all_bookings:
                bookings_by_user.setdefault(b.user_id, []).append(b)
            if key == "D" and all_bookings:
                b_ids = [b.id for b in all_bookings]
                t_res = await db.execute(select(Ticket).where(Ticket.booking_id.in_(b_ids)))
                for t in t_res.scalars().all():
                    tickets_by_booking.setdefault(str(t.booking_id), []).append(t)
                p_res = await db.execute(
                    select(BookingPassenger).where(BookingPassenger.booking_id.in_(b_ids))
                )
                for pax in p_res.scalars().all():
                    passengers_by_booking.setdefault(str(pax.booking_id), []).append(pax)

        signals_by_user: Dict[uuid.UUID, List[UserBehavioralSignal]] = {}
        if key == "C":
            cutoff = ref - timedelta(days=7)
            s_res = await db.execute(
                select(UserBehavioralSignal).where(
                    UserBehavioralSignal.user_id.in_(target_ids),
                    UserBehavioralSignal.occurred_at >= cutoff,
                )
            )
            for s in s_res.scalars().all():
                signals_by_user.setdefault(s.user_id, []).append(s)

        alerts_by_user: Dict[uuid.UUID, List[PriceAlert]] = {}
        verified_drops: List[Dict[str, Any]] = []
        if key == "B":
            a_res = await db.execute(
                select(PriceAlert).where(
                    PriceAlert.user_id.in_(target_ids),
                    PriceAlert.status == "active",
                )
            )
            alerts = list(a_res.scalars().all())
            for al in alerts:
                alerts_by_user.setdefault(al.user_id, []).append(al)

            # Derive verified drops from recent PriceSnapshots + Flight inventory when available
            if alerts:
                snap_res = await db.execute(
                    select(PriceSnapshot)
                    .order_by(PriceSnapshot.captured_at.desc())
                    .limit(100)
                )
                snaps_by_route: Dict[str, List[PriceSnapshot]] = {}
                for ps in snap_res.scalars().all():
                    snaps_by_route.setdefault(ps.route_key, []).append(ps)

                # Load active airport/flight availability to avoid alerting sold-out routes
                airports_res = await db.execute(select(Airport))
                ap_by_id = {ap.id: ap for ap in airports_res.scalars().all()}
                fl_res = await db.execute(select(Flight).where(Flight.status == "scheduled"))
                flights_list = list(fl_res.scalars().all())

                for route_k, route_snaps in snaps_by_route.items():
                    if len(route_snaps) >= 2:
                        latest = route_snaps[0]
                        prev = route_snaps[1]
                        if latest.lowest_price_paisa < prev.lowest_price_paisa:
                            matching_alert = next(
                                (
                                    a
                                    for a in alerts
                                    if f"{a.origin}-{a.destination}".upper() == route_k.upper()
                                    or a.destination.lower() in route_k.lower()
                                ),
                                None,
                            )
                            dest_name = matching_alert.destination if matching_alert else route_k.split("-")[-1]
                            svc_type = matching_alert.service_type if matching_alert else "flight"

                            # Verify seat availability against Flight records when route flights exist
                            avail_verified = True
                            avail_seats: Optional[int] = None
                            if svc_type == "flight" and flights_list:
                                route_flights = [
                                    fl
                                    for fl in flights_list
                                    if (
                                        (ap_by_id.get(fl.destination_airport_id) and ap_by_id[fl.destination_airport_id].city.lower() in dest_name.lower())
                                        or (ap_by_id.get(fl.destination_airport_id) and ap_by_id[fl.destination_airport_id].code.upper() in route_k.upper())
                                    )
                                ]
                                if route_flights:
                                    max_seats = max(int(fl.available_seats or 0) for fl in route_flights)
                                    avail_seats = max_seats
                                    avail_verified = max_seats > 0

                            verified_drops.append(
                                {
                                    "route_key": route_k,
                                    "destination": dest_name,
                                    "previous_price_paisa": prev.lowest_price_paisa,
                                    "current_price_paisa": latest.lowest_price_paisa,
                                    "service_type": svc_type,
                                    "availability_verified": avail_verified,
                                    "available_seats": avail_seats,
                                    "provider": latest.source,
                                    "is_verified": True,
                                }
                            )

        recent_dests_by_user: Dict[uuid.UUID, List[str]] = {}
        last_digest_by_user: Dict[uuid.UUID, datetime] = {}
        if key in {"A", "J"}:
            log_cutoff = ref - timedelta(days=14)
            d_res = await db.execute(
                select(PersonalizationDecisionLog).where(
                    PersonalizationDecisionLog.user_id.in_(target_ids),
                    PersonalizationDecisionLog.eligibility_passed.is_(True),
                    PersonalizationDecisionLog.created_at >= log_cutoff,
                )
            )
            for dl in d_res.scalars().all():
                if dl.event_type == "automation.personalized_digest":
                    prev_dt = last_digest_by_user.get(dl.user_id)
                    if prev_dt is None or _ensure_utc(dl.created_at) > prev_dt:
                        last_digest_by_user[dl.user_id] = _ensure_utc(dl.created_at)
                if dl.rendered_title:
                    # Extract catalog destination names present in recently sent titles
                    for cat_entry in TRAVEL_CATALOG:
                        if cat_entry.name.lower() in dl.rendered_title.lower():
                            recent_dests_by_user.setdefault(dl.user_id, []).append(cat_entry.name)

        verified_weather: List[ContextualConditionRecord] = []
        if key == "G":
            verified_weather = await TravelContextEngine.get_verified_conditions(
                db, condition_type="weather", now=ref
            )

        available_hotels: List[Dict[str, Any]] = []
        if key == "H":
            h_res = await db.execute(
                select(Hotel, HotelRoom)
                .join(HotelRoom, HotelRoom.hotel_id == Hotel.id)
                .where(Hotel.is_active.is_(True), HotelRoom.is_available.is_(True))
                .limit(60)
            )
            hotel_room_pairs = list(h_res.all())
            avail_by_room: Dict[uuid.UUID, List[HotelRoomAvailability]] = {}
            if hotel_room_pairs:
                room_ids = [r.id for _, r in hotel_room_pairs]
                hra_res = await db.execute(
                    select(HotelRoomAvailability).where(
                        HotelRoomAvailability.room_id.in_(room_ids)
                    )
                )
                for hra in hra_res.scalars().all():
                    avail_by_room.setdefault(hra.room_id, []).append(hra)

            target_checkin: Optional[date] = None
            if context_overrides and context_overrides.get("check_in_date"):
                raw_ci = context_overrides["check_in_date"]
                if isinstance(raw_ci, date):
                    target_checkin = raw_ci
                elif isinstance(raw_ci, str):
                    try:
                        target_checkin = date.fromisoformat(raw_ci[:10])
                    except ValueError:
                        target_checkin = None

            for h_obj, r_obj in hotel_room_pairs:
                room_avail_rows = avail_by_room.get(r_obj.id, [])
                is_room_avail = bool(r_obj.is_available)
                if target_checkin is not None and room_avail_rows:
                    matching_date_rows = [
                        row for row in room_avail_rows if row.available_date == target_checkin
                    ]
                    if matching_date_rows:
                        is_room_avail = any(
                            (not row.is_blocked and row.available_count > 0)
                            for row in matching_date_rows
                        )
                available_hotels.append(
                    {
                        "hotel_id": str(h_obj.id),
                        "name": h_obj.name,
                        "city": h_obj.city,
                        "amenities": list(h_obj.amenities or []) + list(r_obj.amenities or []),
                        "price_per_night_bdt": float(r_obj.base_price_per_night),
                        "is_available": is_room_avail,
                        "styles": [r_obj.room_type],
                    }
                )

        transport_options: List[Dict[str, Any]] = []
        if key == "I":
            f_res = await db.execute(
                select(Flight)
                .where(Flight.available_seats > 0, Flight.status == "scheduled")
                .limit(40)
            )
            airports_res = await db.execute(select(Airport))
            airports_by_id = {ap.id: ap for ap in airports_res.scalars().all()}
            for fl in f_res.scalars().all():
                orig_ap = airports_by_id.get(fl.origin_airport_id)
                dest_ap = airports_by_id.get(fl.destination_airport_id)
                orig_city = orig_ap.city if orig_ap else "Dhaka"
                dest_city = dest_ap.city if dest_ap else "Cox's Bazar"
                transport_options.append(
                    {
                        "mode": "flight",
                        "route_key": f"{orig_city} -> {dest_city}",
                        "duration_minutes": fl.duration_minutes,
                        "price_bdt": float(fl.base_price),
                    }
                )

        results: List[AutomationCandidateSpec] = []
        for uid in target_ids:
            snap = snapshots.get(uid)
            if snap is None:
                continue
            spec = cls.evaluate_snapshot_automation(
                key,
                snap,
                notif_pref=prefs_by_user.get(uid),
                bookings=bookings_by_user.get(uid, ()),
                tickets_by_booking=tickets_by_booking,
                passengers_by_booking=passengers_by_booking,
                recent_signals=signals_by_user.get(uid, ()),
                price_alerts=alerts_by_user.get(uid, ()),
                verified_price_drops=verified_drops,
                verified_conditions=verified_weather,
                available_hotels=available_hotels,
                transport_options=transport_options,
                recently_pushed_destinations=recent_dests_by_user.get(uid, ()),
                last_digest_sent_at=last_digest_by_user.get(uid),
                context_overrides=context_overrides,
                now=ref,
            )
            results.append(spec)

        return results
