"""
Travel Context Engine (Agent 10) for ShopnoJatra Hyper-Personalized Notification Intelligence.

Implements:
1. Bangladesh + Regional Travel Catalog & Seasonality Metadata (15 core destinations)
   with seasonal suitability, transport modes, budget tiers, and travel styles.
2. Dimension 16 (`travel_timeline`): Evaluates all 10 trip lifecycle stages from
   active bookings, saved trips/itineraries, price alerts, and behavioral signals.
3. Dimension 18 (`contextual_travel_conditions`): Stores and queries verified,
   non-expired external context (weather, season, destination events, advisories,
   flight status, route conditions, price trends, hotel availability) with mandatory
   provenance (`provider`, `observed_at`, `valid_until`, `reliability_score`, `is_verified`).
   Strictly rejects or ignores expired/unverified context and never fabricates facts.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta, timezone
import logging
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple
from urllib.parse import quote_plus
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import TripPlan
from app.models.booking import Booking
from app.models.itinerary import Itinerary, ItineraryClone, ItinerarySave
from app.models.price_alert import PriceAlert
from app.notifications.personalization.dimensions import (
    DIMENSION_REGISTRY,
    TRAVEL_TIMELINE_STAGES,
    DimensionValue,
    compute_data_quality,
    compute_expires_at,
)

logger = logging.getLogger(__name__)


# ============================================================================
# Canonical Context Types & Constants
# ============================================================================

CONTEXT_CONDITION_TYPES: Tuple[str, ...] = (
    "weather",
    "season",
    "destination_events",
    "travel_advisory",
    "flight_status",
    "route_conditions",
    "price_trends",
    "hotel_availability",
)

TIMELINE_STAGE_PRIORITY: Tuple[str, ...] = TRAVEL_TIMELINE_STAGES

ACTIVE_BOOKING_STATUSES = frozenset({"confirmed", "paid", "checked_in", "in_progress"})
IN_PROGRESS_BOOKING_STATUSES = frozenset({"draft", "pending", "pending_payment"})
COMPLETED_BOOKING_STATUSES = frozenset({"completed"})
CANCELLED_BOOKING_STATUSES = frozenset({"cancelled", "refunded"})

SEARCH_SIGNAL_TYPES = frozenset(
    {
        "search",
        "repeated_search",
        "destination_view",
        "hotel_view",
        "filter_used",
        "transport_selected",
        "transport_selection",
        "price_alert_subscribe",
    }
)
COMPARE_SIGNAL_TYPES = frozenset({"filter_used", "repeated_search", "hotel_view"})
WISHLIST_SIGNAL_TYPES = frozenset({"wishlist", "saved_destination", "explicit_favorite"})

BUDGET_TIER_DAILY_BDT_RANGES: Dict[str, Tuple[int, int]] = {
    "budget": (1200, 3500),
    "economy": (2500, 5500),
    "mid_range": (4500, 10000),
    "premium": (9000, 22000),
    "luxury": (18000, 75000),
    "flexible": (2000, 25000),
}

MONTH_TO_SEASON_BD: Dict[int, str] = {
    11: "winter",
    12: "winter",
    1: "winter",
    2: "winter",
    3: "spring_summer",
    4: "summer",
    5: "summer",
    6: "monsoon",
    7: "monsoon",
    8: "monsoon",
    9: "autumn",
    10: "autumn",
}


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _to_date(val: Any) -> Optional[date]:
    if val is None:
        return None
    if isinstance(val, datetime):
        return _ensure_utc(val).date()
    if isinstance(val, date):
        return val
    if isinstance(val, str):
        text = val.strip()
        if not text:
            return None
        try:
            return date.fromisoformat(text[:10])
        except ValueError:
            return None
    return None


def _normalize_reliability(score: float) -> float:
    """Normalize reliability score into [0.0, 1.0]. Accepts 0-1 or 0-100 inputs."""
    val = float(score)
    if val < 0.0:
        raise ValueError("reliability_score cannot be negative")
    if val > 1.0:
        if val <= 100.0:
            val = val / 100.0
        else:
            raise ValueError("reliability_score must be within [0.0, 1.0] or [0, 100]")
    return round(val, 4)


# ============================================================================
# 1. Bangladesh + Regional Travel Catalog & Seasonality Metadata
# ============================================================================

@dataclass(frozen=True)
class DestinationCatalogEntry:
    """Metadata and seasonal intelligence for a Bangladesh or regional destination."""

    key: str
    name: str
    name_bn: str
    country: str
    is_domestic: bool
    airport_code: Optional[str]
    region_cluster: str
    aliases: Tuple[str, ...]
    peak_months: Tuple[int, ...]
    good_months: Tuple[int, ...]
    off_peak_months: Tuple[int, ...]
    seasonal_notes: Dict[str, str]
    typical_transport_modes: Tuple[str, ...]
    budget_tiers: Tuple[str, ...]
    typical_daily_budget_bdt: Tuple[int, int]
    travel_styles: Tuple[str, ...]
    interests: Tuple[str, ...]
    accommodation_types: Tuple[str, ...]
    related_destinations: Tuple[str, ...]
    highlights: Tuple[str, ...]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


TRAVEL_CATALOG: Tuple[DestinationCatalogEntry, ...] = (
    DestinationCatalogEntry(
        key="coxs_bazar",
        name="Cox's Bazar",
        name_bn="কক্সবাজার",
        country="Bangladesh",
        is_domestic=True,
        airport_code="CXB",
        region_cluster="coastal",
        aliases=("cox's bazar", "coxs bazar", "cox bazar", "coxs_bazar", "cxb", "himchari", "inani"),
        peak_months=(11, 12, 1, 2),
        good_months=(3, 10),
        off_peak_months=(6, 7, 8),
        seasonal_notes={
            "winter": "Clear skies, calm Bay of Bengal waters, ideal beach and Marine Drive weather.",
            "summer": "Warm coastal breeze with lighter crowds and resort value deals.",
            "monsoon": "Heavy coastal rain and rough sea swells; check BMD marine advisories before travel.",
            "autumn": "Post-monsoon greenery along Himchari hills and pleasant sunset evenings.",
        },
        typical_transport_modes=("flight", "bus", "train", "private_vehicle"),
        budget_tiers=("budget", "economy", "mid_range", "premium", "luxury"),
        typical_daily_budget_bdt=(2500, 18000),
        travel_styles=("family", "couple", "friends", "solo", "relaxation", "luxury", "budget"),
        interests=("beach", "nature", "food", "wellness"),
        accommodation_types=("resort", "family_hotel", "premium_hotel", "hotel", "budget_stay"),
        related_destinations=("saint_martin", "kuakata", "bandarban"),
        highlights=("World's longest natural sea beach", "Marine Drive", "Inani Coral Beach", "Himchari"),
    ),
    DestinationCatalogEntry(
        key="sajek",
        name="Sajek Valley",
        name_bn="সাজেক ভ্যালি",
        country="Bangladesh",
        is_domestic=True,
        airport_code=None,
        region_cluster="hill_tracts",
        aliases=("sajek", "sajek valley", "sajek_valley", "konglak", "ruilui"),
        peak_months=(9, 10, 11, 12, 1, 2),
        good_months=(6, 7, 8, 3),
        off_peak_months=(4, 5),
        seasonal_notes={
            "winter": "Crisp mountain mornings with dense cloud blankets below Ruilui Para.",
            "monsoon": "Dramatic drifting clouds across hilltops; verify hill road conditions ahead of departure.",
            "autumn": "Clear golden sunrises over Konglak Peak and comfortable trekking weather.",
            "summer": "Warm daytime hills; cooler evenings at ridge eco-cottages.",
        },
        typical_transport_modes=("bus", "private_vehicle", "mixed"),
        budget_tiers=("budget", "economy", "mid_range"),
        typical_daily_budget_bdt=(2000, 7500),
        travel_styles=("friends", "couple", "adventure", "solo", "nature", "budget"),
        interests=("mountains", "nature", "food", "wellness"),
        accommodation_types=("eco_stay", "resort", "guesthouse", "budget_stay"),
        related_destinations=("bandarban", "sylhet", "chittagong"),
        highlights=("Konglak Peak", "Ruilui Para", "Cloud valley sunrise", "Indigenous bamboo cottages"),
    ),
    DestinationCatalogEntry(
        key="sylhet",
        name="Sylhet",
        name_bn="সিলেট",
        country="Bangladesh",
        is_domestic=True,
        airport_code="ZYL",
        region_cluster="tea_hills",
        aliases=("sylhet", "zyl", "ratargul", "jaflong", "lalakhal", "bisnakandi", "sada pathor"),
        peak_months=(6, 7, 8, 9, 10, 11, 12, 1),
        good_months=(2, 3),
        off_peak_months=(4, 5),
        seasonal_notes={
            "monsoon": "Peak lush waterfalls, flooded Ratargul swamp forest, and vibrant green tea slopes.",
            "autumn": "Clear emerald river waters at Lalakhal and pleasant outdoor boat excursions.",
            "winter": "Comfortable dry weather ideal for family resort stays and heritage shrines.",
            "summer": "Warm days; morning tea estate walks recommended.",
        },
        typical_transport_modes=("flight", "train", "bus", "private_vehicle"),
        budget_tiers=("budget", "economy", "mid_range", "premium", "luxury"),
        typical_daily_budget_bdt=(2000, 15000),
        travel_styles=("family", "couple", "friends", "solo", "nature", "relaxation", "cultural", "religious_travel"),
        interests=("tea_gardens", "nature", "heritage", "food", "wellness"),
        accommodation_types=("resort", "family_hotel", "premium_hotel", "hotel", "eco_stay", "guesthouse"),
        related_destinations=("sreemangal", "sajek", "sundarbans"),
        highlights=("Ratargul Swamp Forest", "Jaflong", "Lalakhal", "Tea Estates", "Hazrat Shahjalal Shrine"),
    ),
    DestinationCatalogEntry(
        key="sreemangal",
        name="Sreemangal",
        name_bn="শ্রীমঙ্গল",
        country="Bangladesh",
        is_domestic=True,
        airport_code="ZYL",
        region_cluster="tea_hills",
        aliases=("sreemangal", "srimangal", "lawachara", "madhabpur", "baikkabeel"),
        peak_months=(10, 11, 12, 1, 2, 7, 8, 9),
        good_months=(3, 6),
        off_peak_months=(4, 5),
        seasonal_notes={
            "winter": "Migratory birds at Baikka Beel, misty tea estates, and cool forest trails.",
            "monsoon": "Lush rainforest canopy in Lawachara National Park.",
            "autumn": "Mild cycling weather across tea plantations.",
            "summer": "Early morning trail hikes and tranquil eco-resort retreats.",
        },
        typical_transport_modes=("train", "bus", "private_vehicle", "flight"),
        budget_tiers=("budget", "economy", "mid_range", "premium", "luxury"),
        typical_daily_budget_bdt=(2200, 16000),
        travel_styles=("family", "couple", "solo", "relaxation", "nature", "cultural"),
        interests=("tea_gardens", "wildlife", "nature", "wellness", "food"),
        accommodation_types=("eco_stay", "resort", "premium_hotel", "family_hotel", "guesthouse"),
        related_destinations=("sylhet", "sundarbans", "bandarban"),
        highlights=("Lawachara National Park", "Tea estates", "Baikka Beel", "Seven-layer tea"),
    ),
    DestinationCatalogEntry(
        key="bandarban",
        name="Bandarban",
        name_bn="বান্দরবান",
        country="Bangladesh",
        is_domestic=True,
        airport_code=None,
        region_cluster="hill_tracts",
        aliases=("bandarban", "nilgiri", "boga lake", "keokradong", "nafakhum", "chimbuk"),
        peak_months=(10, 11, 12, 1, 2),
        good_months=(3, 9),
        off_peak_months=(6, 7, 8),
        seasonal_notes={
            "winter": "Dry ridge trails, crisp views from Nilgiri, and safe trekking to Boga Lake.",
            "monsoon": "Lush hills and swollen waterfalls; trekking trails may require local route clearance.",
            "autumn": "Cloud-filled valleys and clear post-rain visibility.",
            "summer": "Warm valley floor with breezy evening hilltops.",
        },
        typical_transport_modes=("bus", "private_vehicle", "mixed"),
        budget_tiers=("budget", "economy", "mid_range", "premium"),
        typical_daily_budget_bdt=(1800, 10000),
        travel_styles=("adventure", "friends", "solo", "couple", "nature", "cultural"),
        interests=("mountains", "nature", "heritage", "food"),
        accommodation_types=("eco_stay", "resort", "guesthouse", "budget_stay"),
        related_destinations=("sajek", "chittagong", "coxs_bazar"),
        highlights=("Nilgiri", "Boga Lake", "Buddha Dhatu Jadi", "Nafakhum Waterfall"),
    ),
    DestinationCatalogEntry(
        key="saint_martin",
        name="Saint Martin's Island",
        name_bn="সেন্ট মার্টিন",
        country="Bangladesh",
        is_domestic=True,
        airport_code="CXB",
        region_cluster="coastal",
        aliases=("saint martin", "saint martin's", "saint martins", "st martin", "st. martin", "saint_martin", "chera dwip"),
        peak_months=(11, 12, 1, 2),
        good_months=(3, 10),
        off_peak_months=(5, 6, 7, 8, 9),
        seasonal_notes={
            "winter": "Tourist ships operate smoothly with calm turquoise coral waters.",
            "monsoon": "Tourist ferry/launch routes are typically suspended due to Bay of Bengal sea conditions.",
            "autumn": "Late autumn reopening window subject to marine weather clearance.",
            "summer": "Early April wind shifts; verify ship schedule before booking.",
        },
        typical_transport_modes=("launch", "bus", "flight", "mixed"),
        budget_tiers=("budget", "economy", "mid_range", "premium"),
        typical_daily_budget_bdt=(2800, 11000),
        travel_styles=("friends", "couple", "adventure", "relaxation", "solo"),
        interests=("beach", "nature", "food"),
        accommodation_types=("eco_stay", "resort", "guesthouse", "budget_stay"),
        related_destinations=("coxs_bazar", "kuakata", "sundarbans"),
        highlights=("Coral reef beaches", "Chera Dwip", "Stargazing", "Fresh seafood"),
    ),
    DestinationCatalogEntry(
        key="sundarbans",
        name="Sundarbans",
        name_bn="সুন্দরবন",
        country="Bangladesh",
        is_domestic=True,
        airport_code=None,
        region_cluster="mangrove",
        aliases=("sundarbans", "sundarban", "khulna", "kotka", "karamjal", "mongla"),
        peak_months=(11, 12, 1, 2),
        good_months=(10, 3),
        off_peak_months=(6, 7, 8, 9),
        seasonal_notes={
            "winter": "Calm river channels, pleasant deck weather, prime wildlife spotting along Kotka.",
            "monsoon": "Heavy tidal rain and choppy estuarine crossings; limited cruise departures.",
            "autumn": "Post-monsoon green canopy as winter cruise season opens.",
            "summer": "Warm midday cruising with tranquil early morning canals.",
        },
        typical_transport_modes=("launch", "train", "bus", "flight"),
        budget_tiers=("economy", "mid_range", "premium", "luxury"),
        typical_daily_budget_bdt=(3500, 16000),
        travel_styles=("adventure", "family", "friends", "nature", "cultural"),
        interests=("wildlife", "nature", "heritage"),
        accommodation_types=("eco_stay", "resort", "hotel"),
        related_destinations=("kuakata", "sylhet", "sreemangal"),
        highlights=("UNESCO Mangrove Biosphere", "Kotka Sanctuary", "Spotted deer & wildlife", "River cruise"),
    ),
    DestinationCatalogEntry(
        key="kuakata",
        name="Kuakata",
        name_bn="কুয়াকাটা",
        country="Bangladesh",
        is_domestic=True,
        airport_code=None,
        region_cluster="coastal",
        aliases=("kuakata", "patuakhali", "gangamati", "fatrar char"),
        peak_months=(11, 12, 1, 2),
        good_months=(10, 3),
        off_peak_months=(6, 7, 8),
        seasonal_notes={
            "winter": "Clear horizons for both sunrise and sunset over the Bay of Bengal.",
            "monsoon": "High tide swells and heavy rainfall along coastal roads.",
            "autumn": "Quiet beaches and mild evening sea breeze.",
            "summer": "Uncrowded beach stays and coastal mango groves.",
        },
        typical_transport_modes=("bus", "launch", "private_vehicle"),
        budget_tiers=("budget", "economy", "mid_range"),
        typical_daily_budget_bdt=(1800, 6500),
        travel_styles=("family", "couple", "friends", "relaxation", "budget"),
        interests=("beach", "nature", "food"),
        accommodation_types=("hotel", "family_hotel", "resort", "budget_stay"),
        related_destinations=("coxs_bazar", "sundarbans", "saint_martin"),
        highlights=("Sunrise & sunset sea beach", "Gangamati Reserved Forest", "Fatrar Char"),
    ),
    DestinationCatalogEntry(
        key="dhaka",
        name="Dhaka",
        name_bn="ঢাকা",
        country="Bangladesh",
        is_domestic=True,
        airport_code="DAC",
        region_cluster="metro",
        aliases=("dhaka", "dac", "old dhaka", "lalbagh", "uttara", "gulshan", "banani"),
        peak_months=(11, 12, 1, 2),
        good_months=(3, 10),
        off_peak_months=(6, 7, 8),
        seasonal_notes={
            "winter": "Pleasant walking weather for Old Dhaka heritage tours and cultural festivals.",
            "monsoon": "Heavy afternoon showers; indoor heritage museums and dining experiences shine.",
            "autumn": "Festive season with cultural fairs and cooler evenings.",
            "summer": "Warm urban days; business and staycation hotel deals available.",
        },
        typical_transport_modes=("flight", "train", "bus", "private_vehicle"),
        budget_tiers=("budget", "economy", "mid_range", "premium", "luxury"),
        typical_daily_budget_bdt=(2500, 22000),
        travel_styles=("business", "solo", "family", "cultural", "couple"),
        interests=("heritage", "food", "wellness"),
        accommodation_types=("hotel", "premium_hotel", "family_hotel", "budget_stay", "guesthouse"),
        related_destinations=("sylhet", "chittagong", "sreemangal"),
        highlights=("Lalbagh Fort", "Ahsan Manzil", "National Parliament", "Old Dhaka culinary walks"),
    ),
    DestinationCatalogEntry(
        key="chittagong",
        name="Chittagong",
        name_bn="চট্টগ্রাম",
        country="Bangladesh",
        is_domestic=True,
        airport_code="CGP",
        region_cluster="metro_coastal",
        aliases=("chittagong", "chattogram", "cgp", "patenga", "bhatiary", "sitakunda"),
        peak_months=(11, 12, 1, 2),
        good_months=(10, 3),
        off_peak_months=(6, 7, 8),
        seasonal_notes={
            "winter": "Ideal gateway weather for Patenga beach, Sitakunda hills, and business travel.",
            "monsoon": "Vibrant green Sitakunda waterfalls; check hill slope advisories.",
            "autumn": "Clear harbor views and mild hillside excursions.",
            "summer": "Coastal breeze evenings along Patenga.",
        },
        typical_transport_modes=("flight", "train", "bus", "private_vehicle"),
        budget_tiers=("budget", "economy", "mid_range", "premium"),
        typical_daily_budget_bdt=(2200, 14000),
        travel_styles=("business", "family", "friends", "adventure", "cultural"),
        interests=("beach", "mountains", "heritage", "food"),
        accommodation_types=("hotel", "premium_hotel", "family_hotel", "budget_stay"),
        related_destinations=("coxs_bazar", "bandarban", "sajek"),
        highlights=("Patenga Beach", "Sitakunda Eco Park", "Foy's Lake", "Kaptai"),
    ),
    DestinationCatalogEntry(
        key="kathmandu",
        name="Kathmandu",
        name_bn="কাঠমান্ডু",
        country="Nepal",
        is_domestic=False,
        airport_code="KTM",
        region_cluster="international_south_asia",
        aliases=("kathmandu", "ktm", "nepal", "pokhara", "nagarkot"),
        peak_months=(10, 11, 12, 3, 4),
        good_months=(1, 2, 5, 9),
        off_peak_months=(6, 7, 8),
        seasonal_notes={
            "autumn": "Crystal-clear Himalayan visibility and major cultural festivals.",
            "spring_summer": "Rhododendron blooms and mild mountain valley temperatures.",
            "winter": "Crisp sunny days and cool mornings; great value off-crowds.",
            "monsoon": "Lush valleys with frequent rain showers and cloudy mountain vistas.",
        },
        typical_transport_modes=("flight",),
        budget_tiers=("economy", "mid_range", "premium", "luxury"),
        typical_daily_budget_bdt=(5500, 22000),
        travel_styles=("adventure", "cultural", "friends", "couple", "family", "solo"),
        interests=("mountains", "heritage", "nature", "food"),
        accommodation_types=("hotel", "resort", "eco_stay", "guesthouse", "premium_hotel"),
        related_destinations=("bangkok", "singapore", "bandarban"),
        highlights=("Durbar Square", "Swayambhunath", "Nagarkot sunrise", "Himalayan gateway"),
    ),
    DestinationCatalogEntry(
        key="bangkok",
        name="Bangkok",
        name_bn="ব্যাংকক",
        country="Thailand",
        is_domestic=False,
        airport_code="BKK",
        region_cluster="international_sea",
        aliases=("bangkok", "bkk", "thailand", "pattaya", "phuket"),
        peak_months=(11, 12, 1, 2),
        good_months=(3, 4, 7, 8),
        off_peak_months=(5, 9, 10),
        seasonal_notes={
            "winter": "Cooler dry season ideal for river cruises, temples, and street markets.",
            "summer": "Vibrant shopping festivals and tropical resort deals.",
            "monsoon": "Afternoon tropical showers balanced by indoor malls and spa retreats.",
            "autumn": "Transition season with competitive airfare and hotel rates.",
        },
        typical_transport_modes=("flight",),
        budget_tiers=("economy", "mid_range", "premium", "luxury"),
        typical_daily_budget_bdt=(7000, 32000),
        travel_styles=("family", "couple", "friends", "solo", "relaxation", "cultural", "business"),
        interests=("food", "heritage", "wellness", "beach"),
        accommodation_types=("hotel", "premium_hotel", "family_hotel", "resort"),
        related_destinations=("kuala_lumpur", "singapore", "dubai"),
        highlights=("Grand Palace", "Chao Phraya Cruise", "Culinary markets", "Family attractions"),
    ),
    DestinationCatalogEntry(
        key="dubai",
        name="Dubai",
        name_bn="দুবাই",
        country="UAE",
        is_domestic=False,
        airport_code="DXB",
        region_cluster="international_middle_east",
        aliases=("dubai", "dxb", "uae", "abu dhabi"),
        peak_months=(11, 12, 1, 2, 3),
        good_months=(4, 10),
        off_peak_months=(6, 7, 8),
        seasonal_notes={
            "winter": "Mild sunny 22-26C weather ideal for desert safaris, beaches, and outdoor dining.",
            "summer": "Hot desert temperatures; luxury indoor attractions and off-peak hotel rates.",
            "autumn": "Outdoor season opens in late October.",
            "spring_summer": "Pleasant evenings before summer heat.",
        },
        typical_transport_modes=("flight",),
        budget_tiers=("mid_range", "premium", "luxury"),
        typical_daily_budget_bdt=(12000, 65000),
        travel_styles=("luxury", "family", "couple", "business", "relaxation"),
        interests=("wellness", "food", "beach", "heritage"),
        accommodation_types=("premium_hotel", "resort", "family_hotel", "hotel"),
        related_destinations=("singapore", "kuala_lumpur", "bangkok"),
        highlights=("Burj Khalifa", "Desert Safari", "Dubai Marina", "Palm Jumeirah"),
    ),
    DestinationCatalogEntry(
        key="singapore",
        name="Singapore",
        name_bn="সিঙ্গাপুর",
        country="Singapore",
        is_domestic=False,
        airport_code="SIN",
        region_cluster="international_sea",
        aliases=("singapore", "sin", "sentosa", "marina bay"),
        peak_months=(12, 1, 2, 6, 7, 8),
        good_months=(3, 4, 5, 9, 10),
        off_peak_months=(11,),
        seasonal_notes={
            "winter": "Festive waterfront lights and family theme park season.",
            "summer": "Dry sunny days ideal for Sentosa Island and Gardens by the Bay.",
            "monsoon": "Brief tropical showers; seamless indoor-outdoor transit.",
            "autumn": "Great shoulder value outside major events.",
        },
        typical_transport_modes=("flight",),
        budget_tiers=("mid_range", "premium", "luxury"),
        typical_daily_budget_bdt=(12000, 55000),
        travel_styles=("family", "couple", "business", "luxury", "cultural"),
        interests=("food", "wellness", "nature", "heritage"),
        accommodation_types=("premium_hotel", "family_hotel", "hotel", "resort"),
        related_destinations=("kuala_lumpur", "bangkok", "dubai"),
        highlights=("Gardens by the Bay", "Sentosa", "Marina Bay", "Universal Studios"),
    ),
    DestinationCatalogEntry(
        key="kuala_lumpur",
        name="Kuala Lumpur",
        name_bn="কুয়ালালামপুর",
        country="Malaysia",
        is_domestic=False,
        airport_code="KUL",
        region_cluster="international_sea",
        aliases=("kuala lumpur", "kuala_lumpur", "kul", "kl", "malaysia", "genting", "langkawi"),
        peak_months=(12, 1, 2, 6, 7, 8),
        good_months=(3, 4, 5, 9),
        off_peak_months=(10, 11),
        seasonal_notes={
            "winter": "Cool highland escapes to Genting and vibrant city festivities.",
            "summer": "Sunny days for Petronas Towers, Batu Caves, and Langkawi extensions.",
            "monsoon": "Short tropical afternoon showers with great hotel deals.",
            "autumn": "Inter-monsoon showers; mild indoor cultural experiences.",
        },
        typical_transport_modes=("flight",),
        budget_tiers=("economy", "mid_range", "premium", "luxury"),
        typical_daily_budget_bdt=(7500, 30000),
        travel_styles=("family", "couple", "friends", "business", "cultural", "religious_travel"),
        interests=("food", "heritage", "nature", "wellness"),
        accommodation_types=("hotel", "family_hotel", "premium_hotel", "resort"),
        related_destinations=("singapore", "bangkok", "dubai"),
        highlights=("Petronas Twin Towers", "Batu Caves", "Genting Highlands", "Halal culinary scene"),
    ),
)

TRAVEL_CATALOG_BY_KEY: Dict[str, DestinationCatalogEntry] = {
    entry.key: entry for entry in TRAVEL_CATALOG
}

_DESTINATION_ALIAS_INDEX: Dict[str, str] = {}
for _entry in TRAVEL_CATALOG:
    _DESTINATION_ALIAS_INDEX[_entry.key] = _entry.key
    _DESTINATION_ALIAS_INDEX[_entry.name.lower()] = _entry.key
    if _entry.airport_code:
        _DESTINATION_ALIAS_INDEX[_entry.airport_code.lower()] = _entry.key
    for _alias in _entry.aliases:
        _DESTINATION_ALIAS_INDEX[_alias.lower()] = _entry.key


def normalize_destination_key(raw: Optional[str]) -> Optional[str]:
    """Normalize a destination name, airport code, or alias to its canonical catalog key."""
    if not raw:
        return None
    cleaned = str(raw).strip().lower()
    if not cleaned:
        return None
    if cleaned in _DESTINATION_ALIAS_INDEX:
        return _DESTINATION_ALIAS_INDEX[cleaned]
    underscore = cleaned.replace("-", "_").replace(" ", "_")
    if underscore in _DESTINATION_ALIAS_INDEX:
        return _DESTINATION_ALIAS_INDEX[underscore]
    # Substring match fallback for composite names like "Sylhet Tea Gardens"
    for alias, key in _DESTINATION_ALIAS_INDEX.items():
        if len(alias) >= 4 and alias in cleaned:
            return key
    return underscore


def get_destination_info(destination: Optional[str]) -> Optional[DestinationCatalogEntry]:
    """Return catalog metadata for a destination name, slug, or airport code."""
    key = normalize_destination_key(destination)
    if not key:
        return None
    return TRAVEL_CATALOG_BY_KEY.get(key)


def list_catalog_destinations() -> List[DestinationCatalogEntry]:
    """Return all 15 supported Bangladesh and regional destinations."""
    return list(TRAVEL_CATALOG)


def get_destination_deep_link(
    destination: Optional[str],
    *,
    intent: str = "explore",
    product_type: Optional[str] = None,
) -> str:
    """Build a validated internal ShopnoJatra deep link for a destination."""
    info = get_destination_info(destination)
    dest_label = info.name if info else (str(destination).strip() if destination else "")
    q = f"?destination={quote_plus(dest_label)}" if dest_label else ""

    if intent == "price_alert":
        return f"/screens/price-alerts{q}"
    if intent == "search":
        if product_type == "hotel":
            return f"/screens/search-stays{q}"
        if product_type == "flight":
            return f"/screens/flights{q}"
        if product_type == "train":
            return f"/screens/trains{q}"
        return f"/screens/search{q}"
    if intent == "hotel":
        return f"/screens/hotels-homes{q}"
    if intent == "flight":
        return f"/screens/flights{q}"
    if intent == "train":
        return f"/screens/trains{q}"
    if intent == "bus":
        return f"/screens/bus-live-tracking{q}"
    if intent == "trips":
        return "/(tabs)/trips"
    if intent == "review":
        return f"/screens/reviews{q}"
    if intent == "packages":
        return f"/screens/packages{q}"
    return f"/screens/explore{q}" if dest_label else "/(tabs)"


def evaluate_seasonal_suitability(
    destination: Optional[str],
    target_date: Optional[date | datetime] = None,
) -> Dict[str, Any]:
    """
    Evaluate 0-100 seasonal suitability for a destination and date.
    Returns neutral 50.0 with 'unknown' suitability for uncatalogued destinations.
    """
    ref_date = _to_date(target_date) or datetime.now(timezone.utc).date()
    month = ref_date.month
    season = MONTH_TO_SEASON_BD.get(month, "winter")

    info = get_destination_info(destination)
    if info is None:
        return {
            "destination_key": normalize_destination_key(destination),
            "score": 50.0,
            "suitability": "unknown",
            "season": season,
            "month": month,
            "reason": "Destination not in regional seasonal catalog; using neutral suitability.",
        }

    if month in info.peak_months:
        score = 92.0
        suitability = "peak"
    elif month in info.good_months:
        score = 72.0
        suitability = "good"
    elif month in info.off_peak_months:
        score = 32.0
        suitability = "off_peak"
    else:
        score = 55.0
        suitability = "shoulder"

    note = info.seasonal_notes.get(season) or f"{suitability.title()} season for {info.name}."
    return {
        "destination_key": info.key,
        "destination_name": info.name,
        "score": score,
        "suitability": suitability,
        "season": season,
        "month": month,
        "reason": note,
    }


# ============================================================================
# 2. Dimension 16: Travel Timeline Evaluation (10 Lifecycle Stages)
# ============================================================================

@dataclass
class TravelTimelineResult:
    """Evaluated Dimension 16 (`travel_timeline`) state."""

    stage: str
    confidence: float
    source: str
    active_destination: Optional[str] = None
    active_booking_id: Optional[str] = None
    departure_date: Optional[date] = None
    return_date: Optional[date] = None
    days_until_departure: Optional[int] = None
    days_since_return: Optional[int] = None
    active_trip_context: Dict[str, Any] = field(default_factory=dict)
    reason: str = "No active bookings, saved trips, or recent travel searches."

    def to_dimension_value(self, now: Optional[datetime] = None) -> DimensionValue:
        ref = _ensure_utc(now or datetime.now(timezone.utc))
        val: Dict[str, Any] = {
            "stage": self.stage,
            "active_destination": self.active_destination,
            "active_booking_id": self.active_booking_id,
            "departure_date": self.departure_date.isoformat() if self.departure_date else None,
            "return_date": self.return_date.isoformat() if self.return_date else None,
            "days_until_departure": self.days_until_departure,
            "days_since_return": self.days_since_return,
            "reason": self.reason,
        }
        # Clean None entries for compact storage while always preserving stage
        compact_val = {k: v for k, v in val.items() if v is not None}
        return DimensionValue(
            dimension_key="travel_timeline",
            value=compact_val,
            confidence=self.confidence,
            source=self.source,  # type: ignore[arg-type]
            updated_at=ref,
            data_quality=compute_data_quality(compact_val, self.confidence, self.source),
            expiration_policy=DIMENSION_REGISTRY["travel_timeline"].expiration_policy,
            expires_at=compute_expires_at("travel_timeline", reference_time=ref),
            is_user_provided=False,
            permission_granted=True,
        )


def _extract_attr(obj: Any, key: str, default: Any = None) -> Any:
    if isinstance(obj, Mapping):
        return obj.get(key, default)
    return getattr(obj, key, default)


def evaluate_travel_timeline_from_records(
    *,
    bookings: Sequence[Any] = (),
    saved_trips: Sequence[Any] = (),
    recent_signals: Sequence[Any] = (),
    price_alerts: Sequence[Any] = (),
    explicit_favorites: Sequence[str] = (),
    now: Optional[datetime] = None,
    prep_window_days: int = 7,
    post_trip_window_days: int = 14,
    search_window_days: int = 14,
    wishlist_window_days: int = 60,
) -> TravelTimelineResult:
    """
    Pure deterministic evaluation of Dimension 16 (`travel_timeline`) across all 10 stages:
    `no_planned_trip`, `destination_wishlisted`, `searching_for_trip`, `comparing_options`,
    `booking_in_progress`, `booked`, `preparing_for_departure`, `traveling`,
    `returning`, `post_trip`.
    """
    ref_dt = _ensure_utc(now or datetime.now(timezone.utc))
    today = ref_dt.date()

    # ── 1. Partition Bookings ────────────────────────────────────────────────
    confirmed_current_or_upcoming: List[Tuple[int, Any, Optional[date], Optional[date]]] = []
    in_progress_bookings: List[Any] = []
    completed_recent_bookings: List[Tuple[int, Any, date]] = []

    for b in bookings:
        status = str(_extract_attr(b, "status", "") or "").lower().strip()
        if status in CANCELLED_BOOKING_STATUSES:
            continue

        start_d = _to_date(_extract_attr(b, "start_date"))
        end_d = _to_date(_extract_attr(b, "end_date")) or start_d

        if status in ACTIVE_BOOKING_STATUSES:
            if start_d is not None and end_d is not None:
                if start_d <= today <= end_d:
                    # Multi-day return day OR single-day late afternoon/evening return
                    if (end_d > start_d and today == end_d) or (
                        start_d == end_d == today and ref_dt.hour >= 16
                    ):
                        return TravelTimelineResult(
                            stage="returning",
                            confidence=96.0,
                            source="transactional",
                            active_destination=_extract_attr(b, "destination_city"),
                            active_booking_id=str(_extract_attr(b, "id")) if _extract_attr(b, "id") else None,
                            departure_date=start_d,
                            return_date=end_d,
                            days_until_departure=0,
                            active_trip_context={
                                "booking_reference": _extract_attr(b, "booking_reference"),
                                "product_type": _extract_attr(b, "product_type"),
                                "origin_city": _extract_attr(b, "origin_city"),
                                "destination_city": _extract_attr(b, "destination_city"),
                                "status": status,
                            },
                            reason="Traveler is on the scheduled return date of an active confirmed trip.",
                        )
                    return TravelTimelineResult(
                        stage="traveling",
                        confidence=98.0,
                        source="transactional",
                        active_destination=_extract_attr(b, "destination_city"),
                        active_booking_id=str(_extract_attr(b, "id")) if _extract_attr(b, "id") else None,
                        departure_date=start_d,
                        return_date=end_d,
                        days_until_departure=0,
                        active_trip_context={
                            "booking_reference": _extract_attr(b, "booking_reference"),
                            "product_type": _extract_attr(b, "product_type"),
                            "origin_city": _extract_attr(b, "origin_city"),
                            "destination_city": _extract_attr(b, "destination_city"),
                            "status": status,
                        },
                        reason="Active confirmed booking overlaps the current travel date.",
                    )
                if start_d > today:
                    days_until = (start_d - today).days
                    confirmed_current_or_upcoming.append((days_until, b, start_d, end_d))
                elif end_d < today:
                    days_since = (today - end_d).days
                    if 1 <= days_since <= post_trip_window_days:
                        completed_recent_bookings.append((days_since, b, end_d))
            else:
                # Confirmed booking without dates
                confirmed_current_or_upcoming.append((999, b, None, None))

        elif status in IN_PROGRESS_BOOKING_STATUSES:
            created_at = _extract_attr(b, "updated_at") or _extract_attr(b, "created_at")
            is_fresh = True
            if isinstance(created_at, datetime):
                age_days = (ref_dt - _ensure_utc(created_at)).total_seconds() / 86400.0
                is_fresh = age_days <= 14.0
            if is_fresh and (start_d is None or start_d >= today):
                in_progress_bookings.append(b)

        elif status in COMPLETED_BOOKING_STATUSES:
            comp_dt = _to_date(_extract_attr(b, "completed_at")) or end_d or start_d
            if comp_dt is not None:
                days_since = (today - comp_dt).days
                if 0 <= days_since <= post_trip_window_days:
                    completed_recent_bookings.append((days_since, b, comp_dt))

    # ── 2. Upcoming Confirmed Trips (preparing_for_departure vs booked) ──────
    if confirmed_current_or_upcoming:
        confirmed_current_or_upcoming.sort(key=lambda item: item[0])
        days_until, b, start_d, end_d = confirmed_current_or_upcoming[0]
        ctx = {
            "booking_reference": _extract_attr(b, "booking_reference"),
            "product_type": _extract_attr(b, "product_type"),
            "origin_city": _extract_attr(b, "origin_city"),
            "destination_city": _extract_attr(b, "destination_city"),
            "start_date": start_d.isoformat() if start_d else None,
            "end_date": end_d.isoformat() if end_d else None,
            "status": _extract_attr(b, "status"),
        }
        if start_d is not None and 1 <= days_until <= prep_window_days:
            return TravelTimelineResult(
                stage="preparing_for_departure",
                confidence=95.0,
                source="transactional",
                active_destination=_extract_attr(b, "destination_city"),
                active_booking_id=str(_extract_attr(b, "id")) if _extract_attr(b, "id") else None,
                departure_date=start_d,
                return_date=end_d,
                days_until_departure=days_until,
                active_trip_context=ctx,
                reason=f"Confirmed departure is in {days_until} day(s), inside preparation window.",
            )
        return TravelTimelineResult(
            stage="booked",
            confidence=94.0,
            source="transactional",
            active_destination=_extract_attr(b, "destination_city"),
            active_booking_id=str(_extract_attr(b, "id")) if _extract_attr(b, "id") else None,
            departure_date=start_d,
            return_date=end_d,
            days_until_departure=days_until if start_d is not None else None,
            active_trip_context=ctx,
            reason="Confirmed future booking recorded.",
        )

    # ── 3. Booking in Progress (draft/pending_payment or 48h checkout attempt) ─
    if in_progress_bookings:
        b = in_progress_bookings[0]
        start_d = _to_date(_extract_attr(b, "start_date"))
        end_d = _to_date(_extract_attr(b, "end_date"))
        return TravelTimelineResult(
            stage="booking_in_progress",
            confidence=88.0,
            source="transactional",
            active_destination=_extract_attr(b, "destination_city"),
            active_booking_id=str(_extract_attr(b, "id")) if _extract_attr(b, "id") else None,
            departure_date=start_d,
            return_date=end_d,
            days_until_departure=(start_d - today).days if start_d else None,
            active_trip_context={
                "booking_reference": _extract_attr(b, "booking_reference"),
                "product_type": _extract_attr(b, "product_type"),
                "flow_step": _extract_attr(b, "flow_step"),
                "status": _extract_attr(b, "status"),
            },
            reason="Unfinished booking in draft or pending payment state.",
        )

    attempt_signals = []
    recent_search_signals = []
    recent_wishlist_signals = []
    for sig in recent_signals:
        sig_type = str(_extract_attr(sig, "signal_type", "") or "").lower()
        occ = _extract_attr(sig, "occurred_at")
        if isinstance(occ, datetime):
            age_days = (ref_dt - _ensure_utc(occ)).total_seconds() / 86400.0
        else:
            age_days = 0.0
        if age_days < 0:
            age_days = 0.0

        if sig_type == "booking_attempt" and age_days <= 2.0:
            attempt_signals.append((age_days, sig))
        if sig_type in SEARCH_SIGNAL_TYPES and age_days <= float(search_window_days):
            recent_search_signals.append((age_days, sig))
        if sig_type in WISHLIST_SIGNAL_TYPES and age_days <= float(wishlist_window_days):
            recent_wishlist_signals.append((age_days, sig))

    if attempt_signals:
        attempt_signals.sort(key=lambda x: x[0])
        _, sig = attempt_signals[0]
        dest = _extract_attr(sig, "destination")
        return TravelTimelineResult(
            stage="booking_in_progress",
            confidence=78.0,
            source="behavioral",
            active_destination=dest,
            active_trip_context={
                "product_type": _extract_attr(sig, "product_type"),
                "route_key": _extract_attr(sig, "route_key"),
            },
            reason="Recent booking attempt recorded within last 48 hours without confirmation.",
        )

    # ── 4. Post-Trip Window ──────────────────────────────────────────────────
    # If traveler ended a trip within post_trip_window_days AND has not already
    # started searching for a newer trip after returning, classify as post_trip.
    if completed_recent_bookings:
        completed_recent_bookings.sort(key=lambda item: item[0])
        days_since, b, comp_dt = completed_recent_bookings[0]
        comp_cutoff_dt = datetime.combine(comp_dt, datetime.min.time(), tzinfo=timezone.utc) + timedelta(days=1)
        has_newer_search = any(
            isinstance(_extract_attr(sig, "occurred_at"), datetime)
            and _ensure_utc(_extract_attr(sig, "occurred_at")) >= comp_cutoff_dt
            for _, sig in recent_search_signals
        )
        if not has_newer_search:
            return TravelTimelineResult(
                stage="post_trip",
                confidence=90.0,
                source="transactional",
                active_destination=_extract_attr(b, "destination_city"),
                active_booking_id=str(_extract_attr(b, "id")) if _extract_attr(b, "id") else None,
                return_date=comp_dt,
                days_since_return=days_since,
                active_trip_context={
                    "booking_reference": _extract_attr(b, "booking_reference"),
                    "product_type": _extract_attr(b, "product_type"),
                    "completed_destination": _extract_attr(b, "destination_city"),
                },
                reason=f"Completed trip ended {days_since} day(s) ago.",
            )

    # ── 5. Comparing Options vs Searching for Trip ───────────────────────────
    if recent_search_signals:
        recent_search_signals.sort(key=lambda x: x[0])
        dest_counts: Dict[str, int] = {}
        compare_hits = 0
        for _, sig in recent_search_signals:
            sig_type = str(_extract_attr(sig, "signal_type", "") or "").lower()
            if sig_type in COMPARE_SIGNAL_TYPES:
                compare_hits += 1
            d = _extract_attr(sig, "destination")
            if d:
                key = normalize_destination_key(d) or str(d).lower()
                dest_counts[key] = dest_counts.get(key, 0) + 1

        top_sig = recent_search_signals[0][1]
        top_dest = _extract_attr(top_sig, "destination")
        if not top_dest and dest_counts:
            best_key = max(dest_counts, key=lambda k: dest_counts[k])
            info = TRAVEL_CATALOG_BY_KEY.get(best_key)
            top_dest = info.name if info else best_key

        max_dest_repeat = max(dest_counts.values(), default=0)
        if compare_hits >= 1 or len(recent_search_signals) >= 3 or max_dest_repeat >= 2:
            return TravelTimelineResult(
                stage="comparing_options",
                confidence=min(85.0, 55.0 + len(recent_search_signals) * 6.0),
                source="behavioral",
                active_destination=top_dest,
                active_trip_context={
                    "recent_search_count": len(recent_search_signals),
                    "destination_counts": dest_counts,
                },
                reason="Multiple recent searches, filters, or hotel/route comparisons detected.",
            )

        return TravelTimelineResult(
            stage="searching_for_trip",
            confidence=min(75.0, 45.0 + len(recent_search_signals) * 8.0),
            source="behavioral",
            active_destination=top_dest,
            active_trip_context={
                "recent_search_count": len(recent_search_signals),
            },
            reason="Recent destination or route search observed within search window.",
        )

    active_alerts = [
        a for a in price_alerts
        if str(_extract_attr(a, "status", "active") or "").lower() == "active"
    ]
    if active_alerts:
        alert = active_alerts[0]
        return TravelTimelineResult(
            stage="searching_for_trip",
            confidence=72.0,
            source="behavioral",
            active_destination=_extract_attr(alert, "destination"),
            departure_date=_to_date(_extract_attr(alert, "travel_date")),
            active_trip_context={
                "service_type": _extract_attr(alert, "service_type"),
                "origin": _extract_attr(alert, "origin"),
                "destination": _extract_attr(alert, "destination"),
            },
            reason="Active price alert monitoring indicates ongoing trip search.",
        )

    # ── 6. Destination Wishlisted ────────────────────────────────────────────
    if saved_trips:
        trip = saved_trips[0]
        dest = _extract_attr(trip, "destination") or _extract_attr(trip, "title")
        return TravelTimelineResult(
            stage="destination_wishlisted",
            confidence=74.0,
            source="user_preference",
            active_destination=dest,
            departure_date=_to_date(_extract_attr(trip, "travel_start_date") or _extract_attr(trip, "start_date")),
            active_trip_context={"saved_trips_count": len(saved_trips)},
            reason="Saved trip plan or cloned itinerary found.",
        )

    if recent_wishlist_signals or explicit_favorites:
        dest = (
            _extract_attr(recent_wishlist_signals[0][1], "destination")
            if recent_wishlist_signals
            else explicit_favorites[0]
        )
        return TravelTimelineResult(
            stage="destination_wishlisted",
            confidence=70.0 if recent_wishlist_signals else 78.0,
            source="user_preference" if explicit_favorites else "behavioral",
            active_destination=dest,
            active_trip_context={"wishlist_destinations": list(explicit_favorites)[:5]},
            reason="Wishlisted or explicit favorite destination without active search/booking.",
        )

    # ── 7. Default: No Planned Trip ──────────────────────────────────────────
    return TravelTimelineResult(
        stage="no_planned_trip",
        confidence=60.0 if (bookings or saved_trips or recent_signals) else 35.0,
        source="contextual",
        reason="No upcoming bookings, active searches, or wishlisted trips detected.",
    )


# ============================================================================
# 3. Dimension 18: Contextual Travel Conditions Validation & Record Helper
# ============================================================================

@dataclass
class ContextualConditionRecord:
    """Verified external travel context record (Dimension 18)."""

    condition_type: str
    provider: str
    observed_at: datetime
    valid_until: datetime
    reliability_score: float
    is_verified: bool
    payload: Dict[str, Any] = field(default_factory=dict)
    destination: Optional[str] = None
    route_key: Optional[str] = None
    id: Optional[str] = None

    def is_usable(
        self,
        now: Optional[datetime] = None,
        min_reliability: float = 0.5,
    ) -> Tuple[bool, Optional[str]]:
        ref = _ensure_utc(now or datetime.now(timezone.utc))
        if not self.is_verified:
            return False, "unverified_context"
        if not self.provider or not str(self.provider).strip():
            return False, "missing_provider"
        obs = _ensure_utc(self.observed_at)
        val = _ensure_utc(self.valid_until)
        if val <= obs:
            return False, "invalid_validity_window"
        if val <= ref:
            return False, "expired_context"
        try:
            rel = _normalize_reliability(self.reliability_score)
        except ValueError:
            return False, "invalid_reliability_score"
        if rel < min_reliability:
            return False, "low_reliability_score"
        return True, None


def validate_condition_inputs(
    *,
    condition_type: str,
    provider: str,
    observed_at: datetime,
    valid_until: datetime,
    reliability_score: float,
    is_verified: bool,
    destination: Optional[str] = None,
    route_key: Optional[str] = None,
) -> float:
    """Validate mandatory fields for a Dimension 18 contextual condition; returns normalized reliability."""
    cond_norm = str(condition_type or "").strip().lower()
    if cond_norm not in CONTEXT_CONDITION_TYPES:
        raise ValueError(
            f"Unsupported condition_type '{condition_type}'. Allowed: {CONTEXT_CONDITION_TYPES}"
        )
    if not provider or not str(provider).strip():
        raise ValueError("Contextual travel condition requires a non-empty 'provider'.")
    if not destination and not route_key:
        raise ValueError("Contextual travel condition requires 'destination' or 'route_key'.")
    obs = _ensure_utc(observed_at)
    val = _ensure_utc(valid_until)
    if val <= obs:
        raise ValueError("valid_until must be strictly later than observed_at.")
    norm_rel = _normalize_reliability(reliability_score)
    if not isinstance(is_verified, bool):
        raise ValueError("is_verified must be a boolean.")
    return norm_rel


def filter_verified_conditions(
    conditions: Sequence[Any],
    *,
    destination: Optional[str] = None,
    route_key: Optional[str] = None,
    condition_type: Optional[str] = None,
    min_reliability: float = 0.5,
    now: Optional[datetime] = None,
) -> List[ContextualConditionRecord]:
    """
    Strictly filters out expired, unverified, missing-provider, or low-reliability conditions.
    Never fabricates missing conditions.
    """
    ref = _ensure_utc(now or datetime.now(timezone.utc))
    target_dest_key = normalize_destination_key(destination) if destination else None
    target_route = route_key.strip().upper() if route_key else None
    target_type = condition_type.strip().lower() if condition_type else None

    usable: List[ContextualConditionRecord] = []
    for item in conditions:
        if isinstance(item, ContextualConditionRecord):
            rec = item
        else:
            obs = _extract_attr(item, "observed_at")
            val = _extract_attr(item, "valid_until")
            if not isinstance(obs, datetime) or not isinstance(val, datetime):
                continue
            rec = ContextualConditionRecord(
                id=str(_extract_attr(item, "id")) if _extract_attr(item, "id") else None,
                destination=_extract_attr(item, "destination"),
                route_key=_extract_attr(item, "route_key"),
                condition_type=str(_extract_attr(item, "condition_type", "") or "").lower(),
                payload=dict(_extract_attr(item, "payload_json") or _extract_attr(item, "payload") or {}),
                provider=str(_extract_attr(item, "provider", "") or ""),
                observed_at=obs,
                valid_until=val,
                reliability_score=float(_extract_attr(item, "reliability_score", 0.0) or 0.0),
                is_verified=bool(_extract_attr(item, "is_verified", False)),
            )

        ok, _ = rec.is_usable(now=ref, min_reliability=min_reliability)
        if not ok:
            continue
        if target_type and rec.condition_type != target_type:
            continue
        if target_dest_key:
            rec_dest_key = normalize_destination_key(rec.destination) if rec.destination else None
            if rec_dest_key != target_dest_key:
                continue
        if target_route:
            if not rec.route_key or rec.route_key.strip().upper() != target_route:
                continue
        usable.append(rec)

    usable.sort(key=lambda c: (_normalize_reliability(c.reliability_score), _ensure_utc(c.observed_at)), reverse=True)
    return usable


# ============================================================================
# 4. TravelContextEngine Service (DB-Backed + Pure Methods)
# ============================================================================

class TravelContextEngine:
    """
    Coordinates Dimension 16 (`travel_timeline`), Dimension 18 (`contextual_travel_conditions`),
    and the Bangladesh + Regional Destination Catalog & Seasonality Intelligence.
    """

    @staticmethod
    def get_catalog() -> List[DestinationCatalogEntry]:
        return list_catalog_destinations()

    @staticmethod
    def get_destination(destination: Optional[str]) -> Optional[DestinationCatalogEntry]:
        return get_destination_info(destination)

    @staticmethod
    def normalize_destination(destination: Optional[str]) -> Optional[str]:
        return normalize_destination_key(destination)

    @staticmethod
    def get_seasonal_suitability(
        destination: Optional[str],
        target_date: Optional[date | datetime] = None,
    ) -> Dict[str, Any]:
        return evaluate_seasonal_suitability(destination, target_date=target_date)

    @staticmethod
    def evaluate_timeline_sync(
        *,
        bookings: Sequence[Any] = (),
        saved_trips: Sequence[Any] = (),
        recent_signals: Sequence[Any] = (),
        price_alerts: Sequence[Any] = (),
        explicit_favorites: Sequence[str] = (),
        now: Optional[datetime] = None,
    ) -> TravelTimelineResult:
        return evaluate_travel_timeline_from_records(
            bookings=bookings,
            saved_trips=saved_trips,
            recent_signals=recent_signals,
            price_alerts=price_alerts,
            explicit_favorites=explicit_favorites,
            now=now,
        )

    @classmethod
    async def evaluate_travel_timeline(
        cls,
        db: AsyncSession,
        user_id: uuid.UUID,
        *,
        now: Optional[datetime] = None,
        explicit_favorites: Sequence[str] = (),
    ) -> TravelTimelineResult:
        """
        Evaluate Dimension 16 (`travel_timeline`) from live bookings, saved trips/itineraries,
        active price alerts, and recent behavioral signals.
        """
        ref = _ensure_utc(now or datetime.now(timezone.utc))
        signal_cutoff = ref - timedelta(days=60)

        bookings_res = await db.execute(
            select(Booking)
            .where(Booking.user_id == user_id)
            .order_by(Booking.created_at.desc())
            .limit(25)
        )
        bookings = list(bookings_res.scalars().all())

        trip_plans_res = await db.execute(
            select(TripPlan)
            .where(TripPlan.user_id == user_id, TripPlan.is_saved.is_(True))
            .order_by(TripPlan.updated_at.desc())
            .limit(10)
        )
        saved_trips: List[Any] = list(trip_plans_res.scalars().all())

        # Also inspect saved & cloned marketplace itineraries
        try:
            saves_res = await db.execute(
                select(Itinerary)
                .join(ItinerarySave, ItinerarySave.itinerary_id == Itinerary.id)
                .where(ItinerarySave.user_id == user_id)
                .limit(10)
            )
            saved_trips.extend(saves_res.scalars().all())

            clones_res = await db.execute(
                select(ItineraryClone)
                .where(ItineraryClone.cloning_user_id == user_id, ItineraryClone.status == "draft")
                .limit(10)
            )
            saved_trips.extend(clones_res.scalars().all())
        except Exception as exc:
            logger.debug(f"Itinerary timeline lookup skipped/empty for user {user_id}: {exc}")

        alerts_res = await db.execute(
            select(PriceAlert)
            .where(PriceAlert.user_id == user_id, PriceAlert.status == "active")
            .order_by(PriceAlert.created_at.desc())
            .limit(10)
        )
        price_alerts = list(alerts_res.scalars().all())

        recent_signals: List[Any] = []
        try:
            from app.models.personalization import UserBehavioralSignal

            sig_res = await db.execute(
                select(UserBehavioralSignal)
                .where(
                    UserBehavioralSignal.user_id == user_id,
                    UserBehavioralSignal.occurred_at >= signal_cutoff,
                )
                .order_by(UserBehavioralSignal.occurred_at.desc())
                .limit(100)
            )
            recent_signals = list(sig_res.scalars().all())
        except ImportError:
            logger.debug("UserBehavioralSignal model not yet available; evaluating timeline without signal table.")

        return evaluate_travel_timeline_from_records(
            bookings=bookings,
            saved_trips=saved_trips,
            recent_signals=recent_signals,
            price_alerts=price_alerts,
            explicit_favorites=explicit_favorites,
            now=ref,
        )

    @classmethod
    async def record_condition(
        cls,
        db: AsyncSession,
        *,
        condition_type: str,
        provider: str,
        observed_at: datetime,
        valid_until: datetime,
        reliability_score: float,
        is_verified: bool,
        payload: Dict[str, Any],
        destination: Optional[str] = None,
        route_key: Optional[str] = None,
        require_verified: bool = False,
        now: Optional[datetime] = None,
    ) -> ContextualConditionRecord:
        """
        Validate and persist a Dimension 18 (`contextual_travel_conditions`) observation.
        When `require_verified=True`, rejects unverified or already-expired observations immediately.
        """
        norm_rel = validate_condition_inputs(
            condition_type=condition_type,
            provider=provider,
            observed_at=observed_at,
            valid_until=valid_until,
            reliability_score=reliability_score,
            is_verified=is_verified,
            destination=destination,
            route_key=route_key,
        )
        ref = _ensure_utc(now or datetime.now(timezone.utc))
        obs_utc = _ensure_utc(observed_at)
        val_utc = _ensure_utc(valid_until)
        if require_verified:
            if not is_verified:
                raise ValueError("Unverified contextual travel condition rejected.")
            if val_utc <= ref:
                raise ValueError("Expired contextual travel condition rejected.")

        from app.models.personalization import ContextualTravelCondition

        dest_norm = normalize_destination_key(destination) if destination else None
        route_norm = route_key.strip().upper() if route_key else None
        row = ContextualTravelCondition(
            destination=dest_norm or destination,
            route_key=route_norm,
            condition_type=condition_type.strip().lower(),
            payload_json=dict(payload or {}),
            provider=provider.strip(),
            observed_at=obs_utc,
            valid_until=val_utc,
            reliability_score=norm_rel,
            is_verified=bool(is_verified),
        )
        db.add(row)
        await db.flush()
        return ContextualConditionRecord(
            id=str(row.id),
            destination=row.destination,
            route_key=row.route_key,
            condition_type=row.condition_type,
            payload=dict(row.payload_json or {}),
            provider=row.provider,
            observed_at=row.observed_at,
            valid_until=row.valid_until,
            reliability_score=float(row.reliability_score),
            is_verified=bool(row.is_verified),
        )

    @classmethod
    async def get_verified_conditions(
        cls,
        db: AsyncSession,
        *,
        destination: Optional[str] = None,
        route_key: Optional[str] = None,
        condition_type: Optional[str] = None,
        min_reliability: float = 0.5,
        now: Optional[datetime] = None,
    ) -> List[ContextualConditionRecord]:
        """
        Query ONLY verified, non-expired external conditions with valid provider & reliability.
        Never fabricates missing weather, availability, or advisory records.
        """
        ref = _ensure_utc(now or datetime.now(timezone.utc))
        from app.models.personalization import ContextualTravelCondition

        stmt = select(ContextualTravelCondition).where(
            ContextualTravelCondition.is_verified.is_(True),
            ContextualTravelCondition.valid_until > ref,
            ContextualTravelCondition.reliability_score >= min_reliability,
        )
        if condition_type:
            stmt = stmt.where(
                ContextualTravelCondition.condition_type == condition_type.strip().lower()
            )
        if route_key:
            stmt = stmt.where(
                ContextualTravelCondition.route_key == route_key.strip().upper()
            )

        res = await db.execute(stmt.order_by(ContextualTravelCondition.observed_at.desc()).limit(50))
        rows = list(res.scalars().all())
        return filter_verified_conditions(
            rows,
            destination=destination,
            route_key=route_key,
            condition_type=condition_type,
            min_reliability=min_reliability,
            now=ref,
        )

    @classmethod
    async def build_contextual_dimension(
        cls,
        db: Optional[AsyncSession],
        *,
        destinations: Sequence[str] = (),
        conditions_override: Optional[Sequence[Any]] = None,
        now: Optional[datetime] = None,
    ) -> DimensionValue:
        """
        Build Dimension 18 (`contextual_travel_conditions`) DimensionValue from verified
        non-expired DB records (or supplied records in unit evaluation) plus seasonality.
        """
        ref = _ensure_utc(now or datetime.now(timezone.utc))
        verified: List[ContextualConditionRecord] = []

        if conditions_override is not None:
            for item in conditions_override:
                verified.extend(filter_verified_conditions([item], now=ref))
        elif db is not None:
            if destinations:
                for dest in list(destinations)[:5]:
                    verified.extend(
                        await cls.get_verified_conditions(db, destination=dest, now=ref)
                    )
            else:
                verified = await cls.get_verified_conditions(db, now=ref)

        seasonal_entries: Dict[str, Any] = {}
        for dest in list(destinations)[:5]:
            s_info = evaluate_seasonal_suitability(dest, target_date=ref)
            if s_info["suitability"] != "unknown":
                seasonal_entries[s_info["destination_key"]] = s_info

        if not verified and not seasonal_entries:
            return DimensionValue(
                dimension_key="contextual_travel_conditions",
                value="unknown",
                confidence=0.0,
                source="unknown",
                updated_at=None,
                data_quality="unknown",
                expiration_policy=DIMENSION_REGISTRY["contextual_travel_conditions"].expiration_policy,
                expires_at=None,
                is_user_provided=False,
                permission_granted=True,
            )

        earliest_expiry = min((_ensure_utc(c.valid_until) for c in verified), default=None)
        avg_rel = (
            sum(_normalize_reliability(c.reliability_score) for c in verified) / len(verified)
            if verified
            else 0.65
        )
        confidence = round(min(98.0, avg_rel * 100.0 if verified else 60.0), 2)
        val = {
            "verified_conditions": [
                {
                    "destination": c.destination,
                    "route_key": c.route_key,
                    "condition_type": c.condition_type,
                    "provider": c.provider,
                    "observed_at": _ensure_utc(c.observed_at).isoformat(),
                    "valid_until": _ensure_utc(c.valid_until).isoformat(),
                    "reliability_score": _normalize_reliability(c.reliability_score),
                    "payload": c.payload,
                }
                for c in verified[:10]
            ],
            "seasonal_suitability": seasonal_entries,
        }
        return DimensionValue(
            dimension_key="contextual_travel_conditions",
            value=val,
            confidence=confidence,
            source="contextual",
            updated_at=ref,
            data_quality=compute_data_quality(val, confidence, "contextual"),
            expiration_policy="external_ttl",
            expires_at=earliest_expiry or compute_expires_at("contextual_travel_conditions", reference_time=ref),
            is_user_provided=False,
            permission_granted=True,
        )
