"""
Strict Factual, PII, Lock-Screen Safety, and Deep-Link Validator for ShopnoJatra Notifications.

Guarantees that AI-generated or template-rendered notifications:
1. Never fabricate prices, discounts, seat/hotel availability, flight times, weather,
   advisories, or booking references absent from `verified_facts`.
2. Never use unsafe, external, or unapproved deep links (strictly `/(tabs)`, `/screens/`, `shopnojatra://`).
3. Never leak PII (passport, NID, phone, email, card/account numbers) or sensitive
   demographic/health/political/financial attributes in prompts or notification copy.
4. Never leak sensitive search queries on lock-screen push short copy.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple
from urllib.parse import parse_qs, unquote, urlparse


ALLOWED_DEEP_LINK_PREFIXES: Tuple[str, ...] = (
    "/(tabs)",
    "/screens/",
    "shopnojatra://",
)

# Forbidden URL schemes or redirect patterns
_FORBIDDEN_LINK_PATTERNS: Tuple[re.Pattern[str], ...] = (
    re.compile(r"javascript\s*:", re.IGNORECASE),
    re.compile(r"data\s*:", re.IGNORECASE),
    re.compile(r"vbscript\s*:", re.IGNORECASE),
    re.compile(r"file\s*:", re.IGNORECASE),
    re.compile(r"https?\s*://", re.IGNORECASE),
    re.compile(r"<\s*script", re.IGNORECASE),
    re.compile(r"\.\./|\.\.\\"),
    re.compile(r"[\r\n\x00-\x1f]"),
)

# Bengali to ASCII digit translation
_BN_DIGIT_TRANS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")

# Price / currency extraction patterns (EN & BN)
_PRICE_PATTERNS: Tuple[re.Pattern[str], ...] = (
    re.compile(r"(?:BDT|TK|৳|USD|\$|EUR|€|GBP|£)\s*([0-9][0-9,]*(?:\.[0-9]+)?)", re.IGNORECASE),
    re.compile(r"([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:BDT|TK|টাকা|taka|USD)", re.IGNORECASE),
)

# Percentage / discount patterns
_PERCENT_PATTERNS: Tuple[re.Pattern[str], ...] = (
    re.compile(r"([0-9]+(?:\.[0-9]+)?)\s*(?:%|percent|pct|শতাংশ)", re.IGNORECASE),
)
_DISCOUNT_PHRASE_PATTERN = re.compile(
    r"\b(?:half\s+price|50%\s+off|free\s+upgrade|flat\s+discount|instant\s+cashback)\b|অর্ধেক\s+দাম|ফ্রি\s+আপগ্রেড",
    re.IGNORECASE,
)

# Availability / artificial scarcity claims
_AVAILABILITY_PATTERNS: Tuple[re.Pattern[str], ...] = (
    re.compile(
        r"\b(?:only\s+\d+\s+(?:seats?|rooms?|tickets?|spots?)\s*(?:left|remaining)?|\d+\s+(?:seats?|rooms?)\s+left|last\s+(?:room|seat)|almost\s+sold\s+out|selling\s+fast|limited\s+(?:seats|rooms)\s+available)\b",
        re.IGNORECASE,
    ),
    re.compile(r"মাত্র\s*\d+\s*টি\s*(?:সিট|রুম|টিকিট)|সিট\s*শেষ|রুম\s*বাকি", re.IGNORECASE),
)

# Flight / transit codes & explicit clock times
# Match explicit flight context (`Flight TK 712`), hyphenated/compact (`BG-147`, `BG147`),
# or space-separated IATA codes while ignoring common English words & currencies (`TK 5000`, `TO 20`, `AT 10`).
_FLIGHT_CODE_PATTERN = re.compile(
    r"(?:\b(?i:flight)\s+([A-Z]{2})[-\s]?(\d{2,4})\b|\b([A-Z]{2})-(\d{2,4})\b|\b([A-Z]{2})(\d{2,4})\b|\b([A-Z]{2})\s+(\d{2,4})\b)"
)
_NON_FLIGHT_TWO_LETTER_TOKENS: Set[str] = {
    "AT", "IN", "ON", "TO", "OF", "BY", "UP", "OR", "IS", "NO", "AS", "IF",
    "SO", "GO", "DO", "HE", "WE", "ME", "MY", "US", "IT", "AN", "AM", "PM",
    "TK", "BD", "RS", "ID", "OK", "TV", "AC", "HR", "VS", "RE", "SJ", "ST",
    "RD", "TH", "ND", "KM", "KG", "GB", "MB", "HD", "AD", "EX", "PR",
}
_TIME_PATTERN = re.compile(
    r"\b((?:[01]?\d|2[0-3]):[0-5]\d(?:\s*(?:AM|PM))?)\b",
    re.IGNORECASE,
)

# Booking references / PNRs
_BOOKING_REF_PATTERN = re.compile(
    r"\b(SJ-[A-Z0-9-]{3,}|PNR[:\s#-]*[A-Z0-9]{4,}|Booking\s*#[A-Z0-9-]{3,})\b",
    re.IGNORECASE,
)

# Weather & advisory keywords
_WEATHER_KEYWORDS = re.compile(
    r"\b(?:cyclone|typhoon|hurricane|monsoon\s+warning|severe\s+storm|heavy\s+rain|flooding|heatwave|storm\s+warning|travel\s+advisory|road\s+blockade)\b|ঘূর্ণিঝড়|বন্যার\s+সতর্কতা|ভারী\s+বৃষ্টিপাত|দুর্যোগ\s+সতর্কতা",
    re.IGNORECASE,
)

# Urgency countdown claims
_URGENCY_PATTERN = re.compile(
    r"\b(?:expires?\s+in\s+\d+\s+(?:minutes?|hours?)|offer\s+ends\s+tonight|act\s+now\s+or\s+lose)\b",
    re.IGNORECASE,
)

# PII patterns
_EMAIL_PATTERN = re.compile(r"\b[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\b")
_BD_PHONE_PATTERN = re.compile(r"(?<!\d)(?:\+?880|0)1[3-9]\d{8}(?!\d)")
_INTL_PHONE_PATTERN = re.compile(r"(?<!\d)\+\d{1,3}[\s-]?\d{3,4}[\s-]?\d{4,6}(?!\d)")
_PASSPORT_PATTERN = re.compile(
    r"\b(?:passport(?:\s*(?:no|number|#|:))?\s*[A-Z]{1,2}\d{6,8}|[A-Z]{2}\d{7})\b",
    re.IGNORECASE,
)
_NID_PATTERN = re.compile(
    r"(?:\b(?:nid|national\s*id|জাতীয়\s*পরিচয়পত্র)\s*[:#-]?\s*\d{10,17}\b|(?<!\d)\d{10}(?!\d)|(?<!\d)\d{13}(?!\d)|(?<!\d)\d{17}(?!\d))",
    re.IGNORECASE,
)
_CARD_PATTERN = re.compile(r"\b(?:\d{4}[-\s]?){3}\d{4}\b")

# Sensitive demographic / non-consented personal attributes forbidden in copy & prompts
_SENSITIVE_ATTR_PATTERNS: Tuple[Tuple[str, re.Pattern[str]], ...] = (
    ("religion_profiling", re.compile(r"\b(?:muslim|hindu|christian|buddhist|islamic\s+faith|religious\s+belief|sect)\b", re.IGNORECASE)),
    ("health_data", re.compile(r"\b(?:diabetes|pregnant|pregnancy|cancer|hiv|mental\s+illness|medical\s+diagnosis|chronic\s+disease|disability\s+status)\b", re.IGNORECASE)),
    ("political_affiliation", re.compile(r"\b(?:political\s+party|voter\s+preference|election\s+stance|awami|bnp|jamaat)\b", re.IGNORECASE)),
    ("ethnicity_race", re.compile(r"\b(?:ethnicity|ethnic\s+group|racial\s+profile|caste)\b", re.IGNORECASE)),
    ("sensitive_financial", re.compile(r"\b(?:credit\s+score|bank\s+balance|loan\s+default|tax\s+id|tin\s+number|monthly\s+salary)\b", re.IGNORECASE)),
)

# Keys stripped before sending anything to external AI
PII_AND_SENSITIVE_KEYS: Set[str] = {
    "user_id",
    "email",
    "phone",
    "phone_number",
    "mobile",
    "nid",
    "national_id",
    "passport",
    "passport_number",
    "tin",
    "tax_id",
    "full_name",
    "first_name",
    "last_name",
    "customer_name",
    "customer_email",
    "customer_phone",
    "address",
    "street_address",
    "ip_address",
    "device_id",
    "push_token",
    "dob",
    "date_of_birth",
    "card_number",
    "cvv",
    "bank_account",
    "bkash_number",
    "nagad_number",
    "otp_code",
    "password",
    "religion",
    "religious_affiliation",
    "health",
    "medical_condition",
    "political_affiliation",
    "ethnicity",
    "race",
    "caste",
    "salary",
    "income",
    "credit_score",
    "bank_balance",
    "debt",
}


def _to_ascii_digits(text: str) -> str:
    return text.translate(_BN_DIGIT_TRANS)


def _collect_verified_numbers(verified_facts: Dict[str, Any]) -> Set[float]:
    """Extracts all verified numeric values from verified_facts (including paisa -> BDT)."""
    nums: Set[float] = set()

    def _walk(obj: Any, key_hint: str = "") -> None:
        if isinstance(obj, bool):
            return
        if isinstance(obj, (int, float)):
            val = float(obj)
            nums.add(round(val, 2))
            if "paisa" in key_hint.lower():
                nums.add(round(val / 100.0, 2))
        elif isinstance(obj, str):
            ascii_s = _to_ascii_digits(obj)
            for m in re.finditer(r"\b\d[\d,]*(?:\.\d+)?\b", ascii_s):
                try:
                    nums.add(round(float(m.group(0).replace(",", "")), 2))
                except ValueError:
                    pass
        elif isinstance(obj, dict):
            for k, v in obj.items():
                _walk(v, str(k))
        elif isinstance(obj, (list, tuple, set)):
            for item in obj:
                _walk(item, key_hint)

    _walk(verified_facts)
    return nums


def _collect_verified_strings(verified_facts: Dict[str, Any]) -> str:
    parts: List[str] = []

    def _walk(obj: Any) -> None:
        if isinstance(obj, str):
            parts.append(obj)
        elif isinstance(obj, (int, float)) and not isinstance(obj, bool):
            parts.append(str(obj))
        elif isinstance(obj, dict):
            for v in obj.values():
                _walk(v)
        elif isinstance(obj, (list, tuple, set)):
            for item in obj:
                _walk(item)

    _walk(verified_facts)
    return " ".join(parts)


class FactualValidator:
    """
    Deterministic gatekeeper validating deep links, PII absence, lock-screen safety,
    and factual grounding against verified_facts.
    """

    @staticmethod
    def validate_deep_link(deep_link: Optional[str]) -> Tuple[bool, List[str]]:
        reasons: List[str] = []
        if not deep_link or not isinstance(deep_link, str):
            return False, ["deep_link is missing or not a string"]

        cleaned = deep_link.strip()
        decoded = unquote(cleaned)

        for pat in _FORBIDDEN_LINK_PATTERNS:
            if pat.search(cleaned) or pat.search(decoded):
                reasons.append(f"deep_link contains forbidden scheme or traversal pattern: {cleaned}")
                return False, reasons

        if not any(cleaned.startswith(prefix) for prefix in ALLOWED_DEEP_LINK_PREFIXES):
            reasons.append(
                f"deep_link must start with an allowed ShopnoJatra prefix {ALLOWED_DEEP_LINK_PREFIXES}, got '{cleaned}'"
            )
            return False, reasons

        # Prevent open redirects via protocol-relative URLs or embedded redirect targets
        if cleaned.startswith("shopnojatra://"):
            rest = cleaned[len("shopnojatra://"):]
            if "//" in rest or "@" in rest:
                reasons.append("deep_link contains invalid authority or double-slash redirect")
        else:
            if cleaned.startswith("//") or "@" in cleaned.split("?")[0]:
                reasons.append("deep_link contains protocol-relative redirect or '@' authority")

        parsed = urlparse(cleaned)
        if parsed.query:
            qs = parse_qs(parsed.query, keep_blank_values=True)
            for param_key, vals in qs.items():
                for val in vals:
                    val_dec = unquote(val)
                    if (
                        "http://" in val_dec.lower()
                        or "https://" in val_dec.lower()
                        or val_dec.startswith("//")
                        or "javascript:" in val_dec.lower()
                        or "<script" in val_dec.lower()
                    ):
                        reasons.append(f"deep_link query param '{param_key}' contains unsafe redirect or script")

        return len(reasons) == 0, reasons

    @staticmethod
    def detect_pii(
        text: str,
        *,
        verified_facts: Optional[Dict[str, Any]] = None,
        allow_religious_travel_phrase: bool = True,
        allow_support_contact: bool = False,
    ) -> List[str]:
        """Returns a list of detected PII or sensitive attribute leak reasons."""
        if not text:
            return []

        reasons: List[str] = []
        facts_str = _collect_verified_strings(verified_facts or {})
        ascii_text = _to_ascii_digits(text)

        for email_match in _EMAIL_PATTERN.findall(text):
            if allow_support_contact and email_match.lower() == "support@shopnojatra.com":
                continue
            reasons.append("leaked email address detected")
            break

        for phone_match in _BD_PHONE_PATTERN.findall(ascii_text):
            if allow_support_contact and "9612000000" in phone_match:
                continue
            reasons.append("leaked Bangladesh mobile number detected")
            break

        for intl_match in _INTL_PHONE_PATTERN.findall(ascii_text):
            if allow_support_contact and "+880 9612-000000" in intl_match:
                continue
            reasons.append("leaked international phone number detected")
            break

        if _PASSPORT_PATTERN.search(ascii_text):
            reasons.append("potential passport number detected")

        for nid_match in _NID_PATTERN.finditer(ascii_text):
            token = nid_match.group(0)
            # Do not false-positive on verified booking/price numbers if explicitly in verified_facts
            digits_only = re.sub(r"\D", "", token)
            if digits_only and digits_only in facts_str and "nid" not in token.lower():
                continue
            reasons.append("potential NID / national identifier detected")
            break

        if _CARD_PATTERN.search(ascii_text):
            reasons.append("potential payment card number detected")

        for attr_name, pat in _SENSITIVE_ATTR_PATTERNS:
            if pat.search(text):
                if attr_name == "religion_profiling" and allow_religious_travel_phrase:
                    # Only permit explicit travel-package words like 'religious travel', 'umrah', 'hajj' without demographic labels
                    if not re.search(r"\b(?:muslim|hindu|christian|buddhist|islamic\s+faith|sect)\b", text, re.IGNORECASE):
                        continue
                reasons.append(f"sensitive personal attribute detected ({attr_name})")

        return reasons

    @staticmethod
    def sanitize_prompt_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Recursively removes PII and sensitive attribute keys from any context dictionary
        before constructing an AI prompt.
        """
        sanitized: Dict[str, Any] = {}
        for k, v in (payload or {}).items():
            key_lower = str(k).strip().lower()
            if key_lower in PII_AND_SENSITIVE_KEYS or any(
                bad in key_lower for bad in ("passport", "nid", "email", "phone", "mobile", "password", "otp", "token", "secret", "religion", "health", "politic", "ethnic", "salary", "income", "credit_score")
            ):
                continue
            if isinstance(v, dict):
                sanitized[k] = FactualValidator.sanitize_prompt_payload(v)
            elif isinstance(v, list):
                cleaned_list = []
                for item in v:
                    if isinstance(item, dict):
                        cleaned_list.append(FactualValidator.sanitize_prompt_payload(item))
                    elif isinstance(item, str):
                        if not FactualValidator.detect_pii(item):
                            cleaned_list.append(item)
                    else:
                        cleaned_list.append(item)
                sanitized[k] = cleaned_list
            elif isinstance(v, str):
                # Strip any inline PII strings even under neutral key names
                if not FactualValidator.detect_pii(v):
                    sanitized[k] = v
            else:
                sanitized[k] = v
        return sanitized

    @staticmethod
    def validate_no_pii_in_prompt(prompt_text: str) -> Tuple[bool, List[str]]:
        """Ensures an outgoing LLM prompt contains zero PII or sensitive demographic profiling."""
        reasons = FactualValidator.detect_pii(prompt_text, allow_support_contact=False)
        return len(reasons) == 0, reasons

    @staticmethod
    def validate_factual_grounding(
        text_fields: Dict[str, str],
        verified_facts: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, List[str]]:
        """
        Verifies no prices, discounts, availability counts, flight codes/times,
        weather advisories, or booking references were fabricated outside verified_facts.
        """
        facts = verified_facts or {}
        verified_nums = _collect_verified_numbers(facts)
        verified_str = _collect_verified_strings(facts).lower()
        reasons: List[str] = []

        combined = "\n".join(str(v) for v in text_fields.values() if v)
        ascii_combined = _to_ascii_digits(combined)

        # 1. Price / currency checks
        for pat in _PRICE_PATTERNS:
            for m in pat.finditer(ascii_combined):
                raw_num = m.group(1).replace(",", "")
                try:
                    val = round(float(raw_num), 2)
                except ValueError:
                    continue
                if val not in verified_nums:
                    reasons.append(f"unverified price claim '{m.group(0)}' not in verified_facts")

        # 2. Percentage / discount checks
        has_verified_discount = any(
            facts.get(k) is not None
            for k in ("discount_percent", "drop_percent", "savings_percent", "discount_verified")
        )
        for pat in _PERCENT_PATTERNS:
            for m in pat.finditer(ascii_combined):
                try:
                    pct = round(float(m.group(1)), 2)
                except ValueError:
                    continue
                if pct not in verified_nums:
                    reasons.append(f"unverified percentage/discount claim '{m.group(0)}' not in verified_facts")

        if _DISCOUNT_PHRASE_PATTERN.search(combined) and not has_verified_discount:
            reasons.append("unverified promotional discount phrase not backed by verified_facts")

        # 3. Availability / scarcity checks
        has_verified_availability = bool(
            facts.get("availability_verified")
            or facts.get("available_seats") is not None
            or facts.get("available_rooms") is not None
        )
        for pat in _AVAILABILITY_PATTERNS:
            m = pat.search(ascii_combined)
            if m:
                if not has_verified_availability:
                    reasons.append(f"fabricated availability/scarcity claim '{m.group(0)}'")
                else:
                    # Also ensure any specific digit mentioned matches verified available_seats/rooms
                    digits = re.findall(r"\d+", m.group(0))
                    allowed_counts = {
                        str(facts.get("available_seats")),
                        str(facts.get("available_rooms")),
                    }
                    if digits and not any(d in allowed_counts for d in digits):
                        reasons.append(f"mismatched availability count '{m.group(0)}'")

        # 4. Flight codes & explicit clock times
        for m in _FLIGHT_CODE_PATTERN.finditer(combined):
            groups = m.groups()
            if groups[0] is not None:
                # Explicit "flight XX 123"
                prefix, num = groups[0], groups[1]
                is_explicit_flight_ctx = True
            elif groups[2] is not None:
                # Hyphenated "XX-123"
                prefix, num = groups[2], groups[3]
                is_explicit_flight_ctx = False
            elif groups[4] is not None:
                # Compact "XX123"
                prefix, num = groups[4], groups[5]
                is_explicit_flight_ctx = False
            else:
                # Space-separated "XX 123"
                prefix, num = groups[6], groups[7]
                is_explicit_flight_ctx = False
                if prefix in _NON_FLIGHT_TWO_LETTER_TOKENS:
                    continue

            if prefix == "SJ":
                continue
            if not is_explicit_flight_ctx and prefix in {"AM", "PM", "ID", "BD", "TK", "AC", "GB", "MB", "KM", "KG"} and groups[6] is None:
                # Avoid false positives on e.g. 'TK-5000' or 'BD-100' unless explicit flight context
                if prefix in {"TK", "BD", "ID"} and groups[4] is None and groups[2] is None:
                    continue
                if prefix in {"AM", "PM", "GB", "MB", "KM", "KG"}:
                    continue

            code_norm = f"{prefix}{num}".lower()
            code_hyphen = f"{prefix}-{num}".lower()
            code_space = f"{prefix} {num}".lower()
            if (
                code_norm not in verified_str
                and code_hyphen not in verified_str
                and code_space not in verified_str
            ):
                reasons.append(f"unverified flight/route code '{m.group(0)}'")

        for m in _TIME_PATTERN.finditer(ascii_combined):
            t_str = m.group(1).strip().lower()
            if t_str not in verified_str and t_str.split()[0] not in verified_str:
                reasons.append(f"unverified schedule time '{m.group(0)}'")

        # 5. Booking references / PNRs
        for m in _BOOKING_REF_PATTERN.finditer(combined):
            ref = m.group(0).strip().lower()
            if ref not in verified_str and ref.replace("booking #", "").strip() not in verified_str:
                reasons.append(f"unverified booking reference '{m.group(0)}'")

        # 6. Weather & travel advisory claims
        weather_verified = bool(
            facts.get("weather_verified")
            or facts.get("is_verified")
            or facts.get("weather_summary")
            or facts.get("advisory_summary")
            or facts.get("condition_type") in ("weather", "advisory", "disruption")
        )
        if _WEATHER_KEYWORDS.search(combined) and not weather_verified:
            reasons.append("unverified weather or travel advisory claim")

        # 7. Urgency countdowns
        urgency_verified = bool(facts.get("valid_until") or facts.get("expires_at") or facts.get("urgency_verified"))
        if _URGENCY_PATTERN.search(ascii_combined) and not urgency_verified:
            reasons.append("unverified urgency/expiration claim")

        return len(reasons) == 0, reasons

    @staticmethod
    def validate_notification_output(
        candidate: Dict[str, Any],
        verified_facts: Optional[Dict[str, Any]] = None,
        *,
        is_abandoned_search: bool = False,
        sensitive_terms_to_hide_on_lockscreen: Optional[Iterable[str]] = None,
    ) -> Tuple[bool, List[str]]:
        """
        Comprehensive output validator for AI or template notifications.
        Returns (is_valid, reasons).
        """
        reasons: List[str] = []
        facts = verified_facts or {}

        for req_field in ("title", "body", "cta", "deep_link", "push_short_title", "push_short_body"):
            val = candidate.get(req_field)
            if not isinstance(val, str) or not val.strip():
                reasons.append(f"missing or empty required field '{req_field}'")

        deep_link_ok, dl_reasons = FactualValidator.validate_deep_link(candidate.get("deep_link"))
        if not deep_link_ok:
            reasons.extend(dl_reasons)

        text_fields: Dict[str, str] = {}
        for k in (
            "title",
            "body",
            "cta",
            "push_short_title",
            "push_short_body",
            "in_app_title",
            "in_app_body",
            "email_subject",
            "sms_text",
        ):
            v = candidate.get(k)
            if isinstance(v, str) and v:
                text_fields[k] = v

        factual_ok, factual_reasons = FactualValidator.validate_factual_grounding(text_fields, facts)
        if not factual_ok:
            reasons.extend(factual_reasons)

        for field_name, field_val in text_fields.items():
            pii_reasons = FactualValidator.detect_pii(
                field_val,
                verified_facts=facts,
                allow_support_contact=(field_name in ("email_subject", "sms_text")),
            )
            for pr in pii_reasons:
                reasons.append(f"{field_name}: {pr}")

        # Lock-screen safety checks
        push_title = str(candidate.get("push_short_title") or "")
        push_body = str(candidate.get("push_short_body") or "")
        if len(push_title) > 100:
            reasons.append("push_short_title exceeds lock-screen length limit (100 chars)")
        if len(push_body) > 200:
            reasons.append("push_short_body exceeds lock-screen length limit (200 chars)")

        hidden_terms: List[str] = []
        if sensitive_terms_to_hide_on_lockscreen:
            hidden_terms.extend(str(t).strip() for t in sensitive_terms_to_hide_on_lockscreen if t and len(str(t).strip()) >= 3)
        if facts.get("search_query"):
            hidden_terms.append(str(facts["search_query"]).strip())
        if is_abandoned_search:
            for key in ("destination", "hotel_name", "route_key"):
                if facts.get(key):
                    hidden_terms.append(str(facts[key]).strip())

        lockscreen_combined = f"{push_title} {push_body}".lower()
        for term in hidden_terms:
            if term and term.lower() in lockscreen_combined:
                reasons.append("lock-screen push text leaks private search query or destination on abandoned search")
                break

        return len(reasons) == 0, reasons
