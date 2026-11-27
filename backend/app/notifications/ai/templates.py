"""
Deterministic Bilingual (English & Bangla) Notification Template & Variable Pipeline.

Supports:
- Languages: 'en' (English), 'bn' (Bengali / বাংলা)
- Tones: 'concise', 'informative', 'friendly', 'formal'
- Confidence Tiers: 'low' (generic safe discovery), 'medium' (light context), 'high' (deep personalization)
- Multi-channel rendered outputs:
  title, body, cta, deep_link, push_short_title, push_short_body (lock-screen safe!),
  in_app_title, in_app_body, email_subject, email_html, sms_text.
- Genuine persona & automation differentiation without ever fabricating facts or leaking sensitive data.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
import html
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus


SUPPORTED_LANGUAGES = ("en", "bn")
SUPPORTED_TONES = ("concise", "informative", "friendly", "formal")
SUPPORTED_TIERS = ("low", "medium", "high")

# Canonical ShopnoJatra destination display names (EN / BN)
DESTINATION_LABELS_BN: Dict[str, str] = {
    "sylhet": "সিলেট",
    "cox's bazar": "কক্সবাজার",
    "coxs bazar": "কক্সবাজার",
    "sajek": "সাজেক ভ্যালি",
    "sajek valley": "সাজেক ভ্যালি",
    "sreemangal": "শ্রীমঙ্গল",
    "bandarban": "বান্দরবান",
    "saint martin": "সেন্ট মার্টিন",
    "sundarbans": "সুন্দরবন",
    "kuakata": "কুয়াকাটা",
    "dhaka": "ঢাকা",
    "chittagong": "চট্টগ্রাম",
    "chattogram": "চট্টগ্রাম",
    "rangamati": "রাঙ্গামাটি",
    "khagrachari": "খাগড়াছড়ি",
    "kathmandu": "কাঠমান্ডু",
    "bangkok": "ব্যাংকক",
    "dubai": "দুবাই",
    "singapore": "সিঙ্গাপুর",
    "kuala lumpur": "কুয়ালালামপুর",
}

STYLE_LABELS_EN: Dict[str, str] = {
    "family": "family-friendly",
    "couple": "couple getaway",
    "solo": "solo exploration",
    "friends": "friends trip",
    "business": "business travel",
    "adventure": "adventure & trekking",
    "relaxation": "relaxing retreat",
    "cultural": "heritage & cultural",
    "nature": "nature & scenic",
    "religious_travel": "spiritual & religious travel",
}

STYLE_LABELS_BN: Dict[str, str] = {
    "family": "পরিবারবান্ধব",
    "couple": "কাপল রিট্রিট",
    "solo": "সোলো ভ্রমণ",
    "friends": "বন্ধুদের সাথে ট্রিপ",
    "business": "বিজনেস ট্রাভেল",
    "adventure": "অ্যাডভেঞ্চার ও ট্রেকিং",
    "relaxation": "রিল্যাক্সিং অবকাশ",
    "cultural": "ঐতিহ্য ও সংস্কৃতি",
    "nature": "প্রকৃতি ও সবুজ পরিবেশ",
    "religious_travel": "ধর্মীয় ভ্রমণ",
}

BUDGET_LABELS_EN: Dict[str, str] = {
    "budget": "budget-friendly",
    "economy": "value-focused",
    "mid_range": "mid-range comfort",
    "mid-range": "mid-range comfort",
    "premium": "premium",
    "luxury": "luxury resort",
    "flexible": "flexible",
}

BUDGET_LABELS_BN: Dict[str, str] = {
    "budget": "সাশ্রয়ী বাজেট",
    "economy": "সাশ্রয়ী মানসম্মত",
    "mid_range": "মিড-রেঞ্জ আরামদায়ক",
    "mid-range": "মিড-রেঞ্জ আরামদায়ক",
    "premium": "প্রিমিয়াম",
    "luxury": "লাক্সারি রিসোর্ট",
    "flexible": "নমনীয় বাজেট",
}

TRANSPORT_LABELS_EN: Dict[str, str] = {
    "bus": "AC/Express bus",
    "train": "intercity train",
    "flight": "domestic/international flight",
    "launch": "river launch",
    "private_vehicle": "private car",
    "mixed": "flexible transit",
}

TRANSPORT_LABELS_BN: Dict[str, str] = {
    "bus": "এসি/এক্সপ্রেস বাস",
    "train": "আন্তঃনগর ট্রেন",
    "flight": "ফ্লাইট",
    "launch": "লঞ্চ",
    "private_vehicle": "প্রাইভেট কার",
    "mixed": "সুবিধাজনক যাতায়াত",
}


@dataclass
class RenderedNotificationContent:
    """Complete multi-channel notification copy rendered by template or AI."""

    title: str
    body: str
    cta: str
    deep_link: str
    push_short_title: str
    push_short_body: str
    in_app_title: str
    in_app_body: str
    email_subject: str
    email_html: str
    sms_text: str
    language: str = "en"
    tone: str = "friendly"
    confidence_tier: str = "low"
    template_code: str = "generic_discovery"
    ai_used: bool = False
    fallback_used: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def normalize_language(lang: Optional[str]) -> str:
    if lang and str(lang).strip().lower() in ("bn", "bangla", "bengali"):
        return "bn"
    return "en"


def normalize_tone(tone: Optional[str]) -> str:
    if tone and str(tone).strip().lower() in SUPPORTED_TONES:
        return str(tone).strip().lower()
    return "friendly"


def confidence_to_tier(confidence_score: Optional[float]) -> str:
    if confidence_score is None:
        return "low"
    if confidence_score > 70.0:
        return "high"
    if confidence_score >= 35.0:
        return "medium"
    return "low"


def _dest_label(destination: Optional[str], lang: str) -> str:
    if not destination:
        return "বাংলাদেশ" if lang == "bn" else "Bangladesh"
    dest_clean = str(destination).strip()
    if lang == "bn":
        return DESTINATION_LABELS_BN.get(dest_clean.lower(), dest_clean)
    return dest_clean


def _format_verified_price(verified_facts: Dict[str, Any], lang: str) -> Optional[str]:
    """Formats price ONLY if explicitly present in verified_facts."""
    price = verified_facts.get("price_bdt") or verified_facts.get("discounted_price") or verified_facts.get("price") or verified_facts.get("total_price")
    if price is None and verified_facts.get("price_paisa") is not None:
        try:
            price = round(float(verified_facts["price_paisa"]) / 100.0, 2)
        except (TypeError, ValueError):
            price = None
    if price is None:
        return None
    try:
        numeric = float(price)
        if numeric <= 0:
            return None
        formatted = f"{int(numeric):,}" if numeric.is_integer() else f"{numeric:,.2f}"
    except (TypeError, ValueError):
        return None
    currency = str(verified_facts.get("currency") or "BDT").upper()
    if lang == "bn":
        return f"{formatted} টাকা" if currency == "BDT" else f"{currency} {formatted}"
    return f"BDT {formatted}" if currency == "BDT" else f"{currency} {formatted}"


def _format_verified_discount(verified_facts: Dict[str, Any], lang: str) -> Optional[str]:
    pct = verified_facts.get("discount_percent") or verified_facts.get("drop_percent") or verified_facts.get("savings_percent")
    if pct is None:
        return None
    try:
        val = float(pct)
        if val <= 0 or val > 95:
            return None
        pct_str = f"{int(val)}" if val.is_integer() else f"{val:.1f}"
    except (TypeError, ValueError):
        return None
    return f"{pct_str}% ছাড়" if lang == "bn" else f"{pct_str}% off"


def _build_safe_deep_link(
    event_type: str,
    verified_facts: Dict[str, Any],
    persona: Dict[str, Any],
) -> str:
    """Builds a validated internal ShopnoJatra deep link based on event & persona."""
    explicit_link = verified_facts.get("deep_link")
    if isinstance(explicit_link, str) and (
        explicit_link.startswith("/(tabs)")
        or explicit_link.startswith("/screens/")
        or explicit_link.startswith("shopnojatra://")
    ):
        # Basic safety strip of newlines or external redirect queries
        if "http://" not in explicit_link and "https://" not in explicit_link and "//" not in explicit_link.replace("shopnojatra://", ""):
            return explicit_link

    et = (event_type or "").lower()
    dest = verified_facts.get("destination") or persona.get("top_destination") or ""
    dest_q = quote_plus(str(dest)) if dest else ""
    budget = str(persona.get("budget_tier") or "").lower()
    transport = str(persona.get("transport_preference") or "").lower()

    if "otp" in et or "password" in et or "new_device_login" in et or et.startswith("security."):
        return "/screens/settings"
    if "ticket" in et:
        booking_id = verified_facts.get("booking_id")
        return f"/screens/e-ticket?booking_id={quote_plus(str(booking_id))}" if booking_id else "/screens/e-ticket"
    if "booking" in et or "trip_prep" in et or "trip.preparation" in et or "disruption" in et or "schedule_changed" in et:
        return "/(tabs)/trips"
    if "price_alert" in et:
        route_key = verified_facts.get("route_key")
        if route_key:
            return f"/screens/price-alerts?route={quote_plus(str(route_key))}"
        return "/screens/price-alerts"
    if "hotel" in et:
        return f"/screens/search-stays?destination={dest_q}" if dest_q else "/screens/hotels-homes"
    if "flight" in et or transport == "flight":
        return f"/screens/flights?destination={dest_q}" if dest_q else "/screens/flights"
    if "train" in et or transport == "train":
        return f"/screens/trains?destination={dest_q}" if dest_q else "/screens/trains"
    if "abandoned_search" in et or "search" in et:
        return f"/screens/search?q={dest_q}" if dest_q else "/screens/search"
    if "returning" in et or "review" in et:
        return "/screens/reviews"
    if "weather" in et:
        return f"/screens/travel-intelligence?destination={dest_q}" if dest_q else "/screens/travel-intelligence"
    if "digest" in et:
        return "/screens/explore"

    # Persona-tailored discovery deep link
    if budget == "luxury" or persona.get("accommodation_preference") == "resort":
        return f"/screens/search-stays?destination={dest_q}&tier=luxury" if dest_q else "/screens/hotels-homes"
    if dest_q:
        return f"/screens/explore?destination={dest_q}"
    return "/screens/explore"


def _build_email_html(title: str, body: str, cta: str, deep_link: str, lang: str) -> str:
    safe_title = html.escape(title)
    safe_body = html.escape(body)
    safe_cta = html.escape(cta)
    safe_link = html.escape(deep_link)
    brand = "স্বপ্ন যাত্রা (ShopnoJatra)" if lang == "bn" else "ShopnoJatra"
    footer = (
        "আপনি চাইলে যেকোনো সময় অ্যাপের Travel Preferences থেকে নোটিফিকেশন পছন্দ পরিবর্তন করতে পারবেন।"
        if lang == "bn"
        else "You can update your notification preferences anytime inside Travel Preferences in the ShopnoJatra app."
    )
    return (
        "<div style=\"font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc;color:#0f172a;\">"
        f"<div style=\"font-size:13px;font-weight:700;color:#0f766e;margin-bottom:8px;\">{brand}</div>"
        f"<h2 style=\"margin:0 0 12px 0;font-size:20px;color:#0f172a;\">{safe_title}</h2>"
        f"<p style=\"margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#334155;\">{safe_body}</p>"
        f"<a href=\"{safe_link}\" style=\"display:inline-block;padding:12px 20px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;\">{safe_cta}</a>"
        f"<p style=\"margin-top:24px;font-size:12px;color:#64748b;\">{html.escape(footer)}</p>"
        "</div>"
    )


def _apply_tone(text: str, tone: str, lang: str, is_critical: bool = False) -> str:
    if is_critical:
        return text
    if tone == "concise":
        # Keep first sentence or concise clause
        sep = "।" if lang == "bn" and "।" in text else "."
        parts = [p.strip() for p in text.split(sep) if p.strip()]
        if len(parts) > 1:
            return f"{parts[0]}{sep}"
        return text
    if tone == "formal":
        if lang == "bn":
            if not text.startswith("প্রিয় ভ্রমণকারী"):
                return f"প্রিয় ভ্রমণকারী, {text}"
        else:
            if not text.startswith("Dear traveler"):
                return f"Dear traveler, {text}"
    elif tone == "informative":
        return text
    return text


def _extract_persona(profile_context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    ctx = profile_context or {}
    styles = ctx.get("travel_styles") or ctx.get("travel_style") or []
    if isinstance(styles, str):
        styles = [styles]
    styles_lower = [str(s).strip().lower() for s in styles if s]

    interests = ctx.get("interests") or []
    if isinstance(interests, str):
        interests = [interests]

    return {
        "top_destination": ctx.get("top_destination") or ctx.get("destination"),
        "budget_tier": str(ctx.get("budget_tier") or ctx.get("budget_profile") or "").strip().lower(),
        "travel_styles": styles_lower,
        "primary_style": styles_lower[0] if styles_lower else "",
        "transport_preference": str(ctx.get("transport_preference") or "").strip().lower(),
        "accommodation_preference": str(ctx.get("accommodation_preference") or "").strip().lower(),
        "interests": [str(i).strip().lower() for i in interests if i],
        "activity_level": str(ctx.get("activity_level") or "").strip().lower(),
        "loyalty_tier": str(ctx.get("loyalty_tier") or "").strip().lower(),
        "home_city": ctx.get("home_city") if ctx.get("location_consent") else None,
        "travel_timeline": str(ctx.get("travel_timeline") or "").strip().lower(),
        "price_sensitivity": str(ctx.get("price_sensitivity") or "").strip().lower(),
        "is_new_user": bool(ctx.get("is_new_user") or ctx.get("activity_level") == "new_user"),
        "is_dormant": str(ctx.get("activity_level") or "").lower() in ("inactive", "dormant"),
    }


def _render_critical_event(
    event_type: str,
    verified_facts: Dict[str, Any],
    lang: str,
    tone: str,
    deep_link: str,
) -> RenderedNotificationContent:
    et = event_type.lower()
    ref = str(verified_facts.get("booking_reference") or verified_facts.get("ticket_id") or "").strip()
    dest = _dest_label(verified_facts.get("destination"), lang)
    price_txt = _format_verified_price(verified_facts, lang)

    if "otp" in et:
        # Lock-screen safe: never put OTP code inside push_short_body!
        title = "নিরাপত্তা যাচাইকরণ কোড" if lang == "bn" else "Security Verification Code"
        body = (
            "আপনার অ্যাকাউন্ট যাচাইয়ের জন্য একটি এককালীন কোড অনুরোধ করা হয়েছে। এটি কারো সাথে শেয়ার করবেন না।"
            if lang == "bn"
            else "A one-time verification code was requested for your account. Never share your code with anyone."
        )
        push_short_title = title
        push_short_body = (
            "নিরাপত্তা যাচাইকরণ কোড প্রস্তুত। অ্যাপ বা এসএমএস দেখুন।"
            if lang == "bn"
            else "Your security verification notification is ready."
        )
        cta = "নিরাপত্তা সেটিংস" if lang == "bn" else "Review Security"
    elif "new_device_login" in et or "password_changed" in et:
        location = str(verified_facts.get("location") or "").strip()
        title = "অ্যাকাউন্ট নিরাপত্তা সতর্কতা" if lang == "bn" else "Account Security Alert"
        if lang == "bn":
            loc_part = f" ({location})" if location else ""
            body = f"আপনার অ্যাকাউন্টে নিরাপত্তা পরিবর্তন বা নতুন ডিভাইস থেকে লগইন শনাক্ত হয়েছে{loc_part}। আপনি না হলে দ্রুত পাসওয়ার্ড পরিবর্তন করুন।"
            cta = "অ্যাকাউন্ট সুরক্ষিত করুন"
        else:
            loc_part = f" from {location}" if location else ""
            body = f"A security sign-in or credential update was detected on your account{loc_part}. If this was not you, secure your account immediately."
            cta = "Secure Account"
        push_short_title = title
        push_short_body = (
            "অ্যাকাউন্টে নতুন নিরাপত্তা কার্যক্রম হয়েছে।"
            if lang == "bn"
            else "New security activity detected on your account."
        )
    elif "disruption" in et or "schedule_changed" in et:
        title = f"{dest} যাত্রা আপডেট" if lang == "bn" else f"Important Travel Update: {dest}"
        summary = str(verified_facts.get("advisory_summary") or verified_facts.get("new_time") or "").strip()
        if lang == "bn":
            extra = f" বিস্তারিত: {summary}।" if summary else ""
            body = f"{dest} রুটে সময়সূচি বা ভ্রমণ সংক্রান্ত গুরুত্বপূর্ণ পরিবর্তন হয়েছে।{extra} সর্বশেষ তথ্য ট্রিপস ট্যাবে দেখুন।"
            cta = "ট্রিপ আপডেট দেখুন"
        else:
            extra = f" Details: {summary}." if summary else ""
            body = f"There is an important schedule or travel condition update affecting {dest}.{extra} Check your Trips tab for live details."
            cta = "View Trip Update"
        push_short_title = title
        push_short_body = body
    elif "booking.confirmed" in et or "hotel.booking.confirmed" in et:
        ref_part_bn = f" (রেফারেন্স: {ref})" if ref else ""
        ref_part_en = f" (Ref: {ref})" if ref else ""
        price_part_bn = f" মোট পরিশোধ: {price_txt}।" if price_txt else ""
        price_part_en = f" Total paid: {price_txt}." if price_txt else ""
        title = f"বুকিং নিশ্চিত হয়েছে{ref_part_bn}" if lang == "bn" else f"Booking Confirmed{ref_part_en}"
        body = (
            f"{dest} এর জন্য আপনার বুকিং সফলভাবে নিশ্চিত হয়েছে।{price_part_bn} ই-টিকিট ও বিবরণ ট্রিপস ট্যাবে দেখুন।"
            if lang == "bn"
            else f"Your booking for {dest} is confirmed.{price_part_en} View your itinerary and pass in Trips."
        )
        push_short_title = "বুকিং নিশ্চিত হয়েছে" if lang == "bn" else "Booking Confirmed"
        push_short_body = (
            f"{dest} বুকিং নিশ্চিত হয়েছে। বিস্তারিত দেখতে ট্যাপ করুন।"
            if lang == "bn"
            else f"Your {dest} booking is confirmed. Tap to view details."
        )
        cta = "ট্রিপ দেখুন" if lang == "bn" else "View Booking"
    elif "ticket_issued" in et:
        title = "ই-টিকিট প্রস্তুত" if lang == "bn" else "Your E-Ticket Is Ready"
        ref_part = f" ({ref})" if ref else ""
        body = (
            f"আপনার ই-টিকিট{ref_part} ইস্যু করা হয়েছে। অফলাইন অ্যাক্সেসের জন্য টিকিট সেভ করুন।"
            if lang == "bn"
            else f"Your verified e-ticket{ref_part} has been issued and is ready for offline access."
        )
        push_short_title = title
        push_short_body = body
        cta = "ই-টিকিট দেখুন" if lang == "bn" else "Open E-Ticket"
    elif "payment_failed" in et:
        title = "পেমেন্ট সম্পন্ন হয়নি" if lang == "bn" else "Payment Could Not Be Completed"
        body = (
            "আপনার সাম্প্রতিক পেমেন্ট সম্পন্ন হয়নি। বুকিং ধরে রাখতে অনুগ্রহ করে পুনরায় চেষ্টা করুন।"
            if lang == "bn"
            else "Your recent payment attempt did not complete. Please retry in Trips to keep your reservation."
        )
        push_short_title = title
        push_short_body = (
            "পেমেন্ট আপডেট প্রয়োজন। বিস্তারিত দেখতে ট্যাপ করুন।"
            if lang == "bn"
            else "Action needed on your recent payment."
        )
        cta = "আবার চেষ্টা করুন" if lang == "bn" else "Retry Payment"
    else:
        title = "গুরুত্বপূর্ণ বুকিং ও পেমেন্ট আপডেট" if lang == "bn" else "Important Booking & Account Update"
        body = (
            f"{dest} সংক্রান্ত আপনার সাম্প্রতিক বুকিং বা পেমেন্টের একটি গুরুত্বপূর্ণ আপডেট রয়েছে।"
            if lang == "bn"
            else f"There is an important transactional update regarding your reservation for {dest}."
        )
        push_short_title = title
        push_short_body = body
        cta = "বিস্তারিত দেখুন" if lang == "bn" else "View Details"

    return RenderedNotificationContent(
        title=title,
        body=body,
        cta=cta,
        deep_link=deep_link,
        push_short_title=push_short_title[:65],
        push_short_body=push_short_body[:135],
        in_app_title=title,
        in_app_body=body,
        email_subject=title,
        email_html=_build_email_html(title, body, cta, deep_link, lang),
        sms_text=f"{title}: {body}"[:158],
        language=lang,
        tone=tone,
        confidence_tier="high",
        template_code=f"critical:{et or 'transactional'}",
        metadata={"is_critical": True, "lock_screen_safe": True},
    )


def render_deterministic_notification(
    *,
    event_type: str,
    verified_facts: Optional[Dict[str, Any]] = None,
    profile_context: Optional[Dict[str, Any]] = None,
    language: Optional[str] = None,
    tone: Optional[str] = None,
    confidence_score: Optional[float] = None,
    confidence_tier: Optional[str] = None,
    is_critical: bool = False,
) -> RenderedNotificationContent:
    """
    Deterministically renders personalized bilingual multi-channel notification content.
    Guarantees:
    - Zero invented prices/discounts/availability/flight times/weather.
    - Lock-screen safe push_short_body (never leaks sensitive search queries).
    - Meaningful differentiation across personas and confidence tiers in EN and BN.
    """
    facts = dict(verified_facts or {})
    persona = _extract_persona(profile_context)
    lang = normalize_language(language or facts.get("language") or (profile_context or {}).get("preferred_language"))
    chosen_tone = normalize_tone(tone or (profile_context or {}).get("communication_tone"))
    tier = confidence_tier if confidence_tier in SUPPORTED_TIERS else confidence_to_tier(confidence_score)

    et = (event_type or "campaign.discovery").strip().lower()
    deep_link = _build_safe_deep_link(et, facts, persona)

    if is_critical or et.startswith("security.") or et in (
        "booking.confirmed",
        "booking.cancelled",
        "booking.refunded",
        "booking.payment_succeeded",
        "booking.payment_failed",
        "booking.ticket_issued",
        "payment.completed",
        "payment.refunded",
        "flight.schedule_changed",
        "hotel.booking.confirmed",
        "travel.disruption.detected",
        "travel.sos.triggered",
        "marketplace.trip.sos_triggered",
    ):
        return _render_critical_event(et, facts, lang, chosen_tone, deep_link)

    # Determine target destination ONLY when relevant & medium/high confidence or explicit in verified_facts
    raw_dest = facts.get("destination") or (persona["top_destination"] if tier != "low" else None)
    dest = _dest_label(raw_dest, lang)
    price_txt = _format_verified_price(facts, lang)
    discount_txt = _format_verified_discount(facts, lang)

    # 1. Abandoned Search (Lock-screen safe! Never put raw searched query on lock-screen push)
    if "abandoned_search" in et or et == "search.abandoned":
        if lang == "bn":
            if tier == "low":
                title = "আপনার ভ্রমণ পরিকল্পনা চালিয়ে যান"
                body = "আপনার সাম্প্রতিক দেখা ভ্রমণ অপশনগুলো এখনো স্বপ্ন যাত্রায় দেখার জন্য প্রস্তুত।"
            else:
                style_bn = STYLE_LABELS_BN.get(persona["primary_style"], "স্বস্তিদায়ক")
                title = f"{dest} ট্রিপের পরিকল্পনা সম্পূর্ণ করুন"
                body = f"{dest}-এ আপনার {style_bn} ভ্রমণের জন্য বাছাইকৃত অপশনগুলো সহজেই তুলনা ও বুক করতে পারবেন।"
                if price_txt:
                    body += f" বর্তমান যাচাইকৃত মূল্য {price_txt} থেকে শুরু।"
            push_short_title = "ভ্রমণ পরিকল্পনা অপেক্ষমাণ"
            push_short_body = "আপনার বাছাইকৃত ভ্রমণ অপশনগুলো দেখতে স্বপ্ন যাত্রা অ্যাপ খুলুন।"
            cta = "অপশন দেখুন"
        else:
            if tier == "low":
                title = "Continue planning your next trip"
                body = "Travel options you explored recently are ready to review inside ShopnoJatra."
            else:
                style_en = STYLE_LABELS_EN.get(persona["primary_style"], "tailored")
                title = f"Still planning your {dest} trip?"
                body = f"Compare {style_en} stays and routes for {dest} right where you left off."
                if price_txt:
                    body += f" Verified rates currently start from {price_txt}."
            push_short_title = "Your trip options are ready"
            push_short_body = "Open ShopnoJatra to review your saved travel options."
            cta = "Compare Options"

        body = _apply_tone(body, chosen_tone, lang)
        return RenderedNotificationContent(
            title=title,
            body=body,
            cta=cta,
            deep_link=deep_link,
            push_short_title=push_short_title[:65],
            push_short_body=push_short_body[:135],
            in_app_title=title,
            in_app_body=body,
            email_subject=title,
            email_html=_build_email_html(title, body, cta, deep_link, lang),
            sms_text=f"{push_short_title}: {cta}"[:158],
            language=lang,
            tone=chosen_tone,
            confidence_tier=tier,
            template_code="abandoned_search",
            metadata={"lock_screen_safe": True},
        )

    # 2. Smart Price Alert
    if "price_alert" in et:
        route_label = str(facts.get("route_label") or facts.get("route_key") or dest)
        if lang == "bn":
            disc_part = f" ({discount_txt})" if discount_txt else ""
            price_part = f" নতুন ভাড়া {price_txt}।" if price_txt else ""
            title = f"{route_label} ভাড়া কমেছে{disc_part}"
            body = f"আপনার প্রাইস অ্যালার্ট অনুযায়ী {route_label} রুটে মূল্য হ্রাস পাওয়া গেছে।{price_part} যাচাইকৃত সময়সূচি দেখুন।"
            push_short_title = f"{dest} প্রাইস অ্যালার্ট"
            push_short_body = f"{route_label} রুটে ভাড়া কমেছে{disc_part}। এখনই দেখুন।"
            cta = "ভাড়া দেখুন"
        else:
            disc_part = f" ({discount_txt})" if discount_txt else ""
            price_part = f" Verified fare now {price_txt}." if price_txt else ""
            title = f"Price Drop Alert: {route_label}{disc_part}"
            body = f"A subscribed route ({route_label}) matched your price alert.{price_part} Check verified options in the app."
            push_short_title = f"{dest} Price Drop"
            push_short_body = f"{route_label} fare dropped{disc_part}. Tap to view."
            cta = "Check Fare"

        body = _apply_tone(body, chosen_tone, lang)
        return RenderedNotificationContent(
            title=title,
            body=body,
            cta=cta,
            deep_link=deep_link,
            push_short_title=push_short_title[:65],
            push_short_body=push_short_body[:135],
            in_app_title=title,
            in_app_body=body,
            email_subject=title,
            email_html=_build_email_html(title, body, cta, deep_link, lang),
            sms_text=f"{title} {cta}"[:158],
            language=lang,
            tone=chosen_tone,
            confidence_tier=tier,
            template_code="price_alert",
        )

    # 3. Trip Preparation
    if "trip_prep" in et or "trip.preparation" in et:
        days_left = facts.get("days_until_departure")
        if lang == "bn":
            day_str = f" আর {days_left} দিন বাকি।" if days_left is not None else ""
            title = f"{dest} যাত্রার প্রস্তুতি চেকলিস্ট"
            body = f"আপনার আগামী {dest} ভ্রমণের সময়সূচি, ই-টিকিট ও হোটেল চেক-ইন তথ্য প্রস্তুত রয়েছে।{day_str}"
            cta = "প্রস্তুতি দেখুন"
        else:
            day_str = f" Departure in {days_left} day(s)." if days_left is not None else ""
            title = f"Get ready for your {dest} trip"
            body = f"Review your e-ticket, transit details, and check-in essentials for {dest}.{day_str}"
            cta = "View Checklist"
        body = _apply_tone(body, chosen_tone, lang)
        return RenderedNotificationContent(
            title=title,
            body=body,
            cta=cta,
            deep_link=deep_link,
            push_short_title=title[:65],
            push_short_body=body[:135],
            in_app_title=title,
            in_app_body=body,
            email_subject=title,
            email_html=_build_email_html(title, body, cta, deep_link, lang),
            sms_text=f"{title}: {body}"[:158],
            language=lang,
            tone=chosen_tone,
            confidence_tier=tier,
            template_code="trip_preparation",
        )

    # 4. Returning Traveler
    if "returning" in et:
        if lang == "bn":
            title = f"{dest} ভ্রমণ কেমন হলো?"
            body = f"স্বপ্ন যাত্রার সাথে {dest} ভ্রমণের অভিজ্ঞতা শেয়ার করুন এবং পরবর্তী ভ্রমণের জন্য অনুপ্রেরণা খুঁজুন।"
            cta = "রিভিউ দিন"
        else:
            title = f"Welcome back from {dest}"
            body = f"Share a quick review of your {dest} stay or explore similar destinations when you are ready for your next trip."
            cta = "Share Feedback"
        body = _apply_tone(body, chosen_tone, lang)
        return RenderedNotificationContent(
            title=title,
            body=body,
            cta=cta,
            deep_link=deep_link,
            push_short_title=title[:65],
            push_short_body=body[:135],
            in_app_title=title,
            in_app_body=body,
            email_subject=title,
            email_html=_build_email_html(title, body, cta, deep_link, lang),
            sms_text=f"{title}: {cta}"[:158],
            language=lang,
            tone=chosen_tone,
            confidence_tier=tier,
            template_code="returning_traveler",
        )

    # 5. Weather-Based Personalization (ONLY from verified weather data)
    if "weather" in et:
        weather_summary = str(facts.get("weather_summary") or facts.get("condition") or "").strip()
        if lang == "bn":
            cond_txt = f" ({weather_summary})" if weather_summary else ""
            title = f"{dest} আবহাওয়া ও ভ্রমণ তথ্য"
            body = f"{dest} অঞ্চলের যাচাইকৃত আবহাওয়ার তথ্য{cond_txt} অনুযায়ী ভ্রমণ পরিকল্পনা সাজাতে পারেন।"
            cta = "বিস্তারিত দেখুন"
        else:
            cond_txt = f" ({weather_summary})" if weather_summary else ""
            title = f"Weather & Travel Outlook for {dest}"
            body = f"Verified travel outlook for {dest}{cond_txt} is available to help plan your timing smoothly."
            cta = "View Travel Intel"
        body = _apply_tone(body, chosen_tone, lang)
        return RenderedNotificationContent(
            title=title,
            body=body,
            cta=cta,
            deep_link=deep_link,
            push_short_title=title[:65],
            push_short_body=body[:135],
            in_app_title=title,
            in_app_body=body,
            email_subject=title,
            email_html=_build_email_html(title, body, cta, deep_link, lang),
            sms_text=f"{title}: {cta}"[:158],
            language=lang,
            tone=chosen_tone,
            confidence_tier=tier,
            template_code="weather_personalization",
        )

    # 6. Personalized Digest
    if "digest" in et:
        if lang == "bn":
            title = f"আপনার ব্যক্তিগতকৃত ভ্রমণ ডাইজেস্ট: {dest}" if tier != "low" else "সাপ্তাহিক ভ্রমণ ডাইজেস্ট"
            body = (
                f"{dest} ও আপনার পছন্দের ক্যাটাগরির সেরা প্যাকেজ, প্রাইস অ্যালার্ট ও আসন্ন ট্রিপের তথ্য একসাথে দেখুন।"
                if tier != "low"
                else "এই সপ্তাহের জনপ্রিয় গন্তব্য, ভ্রমণ টিপস এবং নির্বাচিত ডিলগুলো একসাথে দেখুন।"
            )
            cta = "ডাইজেস্ট দেখুন"
        else:
            title = f"Your Travel Digest: {dest} & More" if tier != "low" else "Your ShopnoJatra Travel Digest"
            body = (
                f"Curated routes for {dest}, active price alerts, and seasonal recommendations tailored to your travel style."
                if tier != "low"
                else "A concise roundup of popular routes, travel guides, and helpful seasonal picks across Bangladesh."
            )
            cta = "Open Digest"
        body = _apply_tone(body, chosen_tone, lang)
        return RenderedNotificationContent(
            title=title,
            body=body,
            cta=cta,
            deep_link=deep_link,
            push_short_title=title[:65],
            push_short_body=body[:135],
            in_app_title=title,
            in_app_body=body,
            email_subject=title,
            email_html=_build_email_html(title, body, cta, deep_link, lang),
            sms_text=f"{title}: {cta}"[:158],
            language=lang,
            tone=chosen_tone,
            confidence_tier=tier,
            template_code="travel_digest",
        )

    # 7. Discovery / Campaign / Reactivation / Hotel / Transport Personalization
    # Distinguishes genuinely between personas & confidence tiers!
    if tier == "low" or persona["is_new_user"] and not persona["top_destination"]:
        # Safe generic discovery without assuming unverified user preferences
        if lang == "bn":
            title = "বাংলাদেশের সেরা গন্তব্যগুলো আবিষ্কার করুন"
            body = "কক্সবাজার, সিলেট ও সাজেক ভ্যালির যাচাইকৃত ট্রিপ, হোটেল এবং সহজ যাতায়াত অপশন ঘুরে দেখুন।"
            if price_txt:
                body += f" প্যাকেজ শুরু {price_txt} থেকে।"
            cta = "গন্তব্য দেখুন"
            push_short_title = "ভ্রমণ অনুপ্রেরণা"
            push_short_body = "জনপ্রিয় গন্তব্য ও আপনার পছন্দ অনুযায়ী ভ্রমণ অপশন দেখুন।"
        else:
            title = "Explore curated trips across Bangladesh"
            body = "Discover verified stays, routes, and seasonal experiences in Cox's Bazar, Sylhet, and Sajek Valley."
            if price_txt:
                body += f" Options start from {price_txt}."
            cta = "Explore Destinations"
            push_short_title = "Travel inspiration awaits"
            push_short_body = "Browse verified destinations and customize your travel preferences."

        body = _apply_tone(body, chosen_tone, lang)
        return RenderedNotificationContent(
            title=title,
            body=body,
            cta=cta,
            deep_link=deep_link,
            push_short_title=push_short_title[:65],
            push_short_body=push_short_body[:135],
            in_app_title=title,
            in_app_body=body,
            email_subject=title,
            email_html=_build_email_html(title, body, cta, deep_link, lang),
            sms_text=f"{title} {cta}"[:158],
            language=lang,
            tone=chosen_tone,
            confidence_tier="low",
            template_code="generic_discovery",
        )

    # Medium vs High confidence persona-specific rendering
    budget = persona["budget_tier"]
    style = persona["primary_style"]
    transport = persona["transport_preference"]
    accom = persona["accommodation_preference"]
    origin = persona["home_city"]

    # Persona-rich descriptors
    if lang == "bn":
        style_phrase = STYLE_LABELS_BN.get(style, "আরামদায়ক ভ্রমণ")
        budget_phrase = BUDGET_LABELS_BN.get(budget, "")
        transport_phrase = TRANSPORT_LABELS_BN.get(transport, "")

        if tier == "medium":
            title = f"{dest} ভ্রমণের নতুন অপশন"
            body = f"{dest}-এ আপনার আগ্রহের সাথে মানানসই হোটেল ও যাতায়াত অপশন এখন যাচাই করে দেখতে পারেন।"
            if price_txt:
                body += f" যাচাইকৃত মূল্য {price_txt}।"
            cta = f"{dest} দেখুন"
            push_short_title = f"{dest} ভ্রমণ পরামর্শ"
            push_short_body = f"{dest} এর জন্য বাছাইকৃত ভ্রমণ অপশন দেখুন।"
            code = "light_persona_discovery"
        else:
            # High confidence deep personalization: distinctly tailored by persona!
            if budget == "luxury" or accom == "resort" or style == "couple":
                title = f"{dest}-এ প্রিমিয়াম {style_phrase} ও রিসোর্ট অভিজ্ঞতা"
                detail_parts = [f"{dest}-এর নির্বাচিত লাক্সারি রিসোর্ট ও নিরিবিলি পরিবেশ"]
                if transport_phrase:
                    detail_parts.append(f"{transport_phrase} সুবিধা")
                body = f"{' এবং '.join(detail_parts)} নিয়ে আপনার পরবর্তী {style_phrase} সাজান।"
                cta = "প্রিমিয়াম রিসোর্ট দেখুন"
            elif budget in ("budget", "economy") or transport == "bus":
                title = f"{dest} সাশ্রয়ী ভ্রমণ: বাজেট স্টেই ও বাস রুট"
                origin_txt = f"{_dest_label(origin, 'bn')} থেকে " if origin else ""
                bus_txt = transport_phrase or "এসি/নন-এসি বাস"
                body = f"{origin_txt}{dest} রুটে সাশ্রয়ী {bus_txt} ও বাজেট-বান্ধব থাকার ব্যবস্থা সহজেই তুলনা করুন।"
                cta = "সাশ্রয়ী অপশন দেখুন"
            elif style == "family":
                title = f"পরিবার নিয়ে {dest} ভ্রমণের সেরা আয়োজন"
                body = f"{dest}-এ পরিবারের সবার উপযোগী প্রশস্ত ফ্যামিলি রুম, প্রাকৃতিক দৃশ্য ও নিরাপদ যাতায়াত অপশন দেখুন।"
                cta = "ফ্যামিলি ট্রিপ দেখুন"
            elif style == "adventure" or "trekking" in persona["interests"] or "mountains" in persona["interests"] or "nature" in persona["interests"]:
                title = f"{dest}-এ অ্যাডভেঞ্চার ও প্রকৃতি-ভ্রমণ"
                body = f"{dest}-এর পাহাড়, ট্রেইল ও {style_phrase} উপযোগী ইকো-স্টে ও গাইডেড অভিজ্ঞতা দেখুন।"
                cta = "অ্যাডভেঞ্চার প্ল্যান দেখুন"
            elif persona["price_sensitivity"] == "high":
                title = f"{dest} ভ্রমণে যাচাইকৃত সেরা ডিল ও ভাড়া"
                body = f"{dest} রুটে আপনার পছন্দের সাথে মানানসই যাচাইকৃত সাশ্রয়ী ডিল এবং হোটেল অফারগুলো দেখুন।"
                cta = "ডিল দেখুন"
            else:
                qualifiers = " ও ".join(p for p in [budget_phrase, style_phrase] if p)
                title = f"{dest}-এ আপনার পছন্দের {qualifiers or 'বিশেষ'} ট্রিপ"
                body = f"{dest} ভ্রমণের জন্য আপনার পছন্দের {transport_phrase or 'যাতায়াত'} ও থাকার সেরা অপশনগুলো প্রস্তুত।"
                cta = f"{dest} অপশন দেখুন"

            if discount_txt:
                body += f" নির্বাচিত অফারে {discount_txt}।"
            if price_txt:
                body += f" যাচাইকৃত মূল্য {price_txt}।"

            push_short_title = title[:65]
            push_short_body = f"{dest}-এ আপনার পছন্দ অনুযায়ী যাচাইকৃত ভ্রমণ অপশন দেখুন।"
            code = f"deep_persona:{style or budget or 'tailored'}"
    else:
        style_phrase = STYLE_LABELS_EN.get(style, "tailored travel")
        budget_phrase = BUDGET_LABELS_EN.get(budget, "")
        transport_phrase = TRANSPORT_LABELS_EN.get(transport, "")

        if tier == "medium":
            title = f"Explore verified stays & routes in {dest}"
            body = f"Based on your recent interest in {dest}, browse updated stays and transport options in ShopnoJatra."
            if price_txt:
                body += f" Verified rates start at {price_txt}."
            cta = f"Explore {dest}"
            push_short_title = f"{dest} travel picks"
            push_short_body = f"View updated stays and travel routes in {dest}."
            code = "light_persona_discovery"
        else:
            if budget == "luxury" or accom == "resort" or style == "couple":
                title = f"Curated {dest} Luxury Resort & {style_phrase.title()}"
                transit_note = f" with convenient {transport_phrase} connections" if transport_phrase else ""
                body = f"Experience handpicked boutique resorts and serene hospitality in {dest}{transit_note}, tailored to your {style_phrase} preferences."
                cta = "View Luxury Stays"
            elif budget in ("budget", "economy") or transport == "bus":
                origin_txt = f" from {origin}" if origin else ""
                bus_label = "AC/Express Bus" if transport == "bus" else (transport_phrase.title() if transport_phrase else "Value Transit")
                bus_txt = transport_phrase or "express bus"
                title = f"Budget-Friendly {dest}: {bus_label} & Value Stays"
                body = f"Compare affordable {bus_txt} routes{origin_txt} to {dest} alongside clean, high-value guesthouses."
                cta = "Compare Budget Deals"
            elif style == "family":
                title = f"Family-Friendly {dest} Nature & Comfort Picks"
                transit_note = f" and comfortable {transport_phrase}" if transport_phrase else ""
                body = f"Discover spacious family rooms, scenic spots, and mid-range comfort stays in {dest}{transit_note} designed for relaxed family time."
                cta = "View Family Options"
            elif style == "adventure" or "trekking" in persona["interests"] or "mountains" in persona["interests"] or "nature" in persona["interests"]:
                title = f"{dest} Adventure Trails & Eco-Stays"
                body = f"Plan an active {style_phrase} escape in {dest} with scenic viewpoints, local guides, and mountain eco-stays."
                cta = "Plan Adventure"
            elif persona["price_sensitivity"] == "high":
                title = f"Verified {dest} Deals & Fare Picks"
                body = f"Explore verified value offers and price-tracked routes for {dest} matching your travel preferences."
                cta = "View Deals"
            else:
                qualifiers = ", ".join(p for p in [budget_phrase, style_phrase] if p)
                title = f"Tailored {dest} Picks ({qualifiers})" if qualifiers else f"Tailored {dest} Travel Picks"
                transit_note = f" via {transport_phrase}" if transport_phrase else ""
                body = f"Explore verified {dest} stays and routes{transit_note} aligned with your travel preferences."
                cta = f"Explore {dest}"

            if discount_txt:
                body += f" Verified savings of {discount_txt} available."
            if price_txt:
                body += f" Verified price: {price_txt}."

            push_short_title = title[:65]
            push_short_body = f"Curated {dest} travel picks matching your style are ready."
            code = f"deep_persona:{style or budget or 'tailored'}"

    if persona["is_dormant"] and "reactivation" in et:
        # Value-first reactivation, never generic "We miss you" spam
        if lang == "bn":
            title = f"{dest}-এ নতুন মৌসুমি ভ্রমণ অপশন"
            body = f"আপনার পূর্বের পছন্দের {dest} রুটে এখন যাচাইকৃত নতুন হোটেল ও ভ্রমণ সুবিধা যুক্ত হয়েছে।"
        else:
            title = f"New seasonal options in {dest}"
            body = f"Updated verified stays and routes are now available for {dest}, aligned with your saved travel style."

    body = _apply_tone(body, chosen_tone, lang)
    return RenderedNotificationContent(
        title=title,
        body=body,
        cta=cta,
        deep_link=deep_link,
        push_short_title=push_short_title[:65],
        push_short_body=push_short_body[:135],
        in_app_title=title,
        in_app_body=body,
        email_subject=title,
        email_html=_build_email_html(title, body, cta, deep_link, lang),
        sms_text=f"{title} — {cta}"[:158],
        language=lang,
        tone=chosen_tone,
        confidence_tier=tier,
        template_code=code,
    )
