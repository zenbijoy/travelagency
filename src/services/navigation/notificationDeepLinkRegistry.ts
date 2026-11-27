/**
 * Typed Deep-Link Registry & Safe Navigation Validator for Notifications
 *
 * Centralizes allowlisted Expo Router destinations and ShopnoJatra custom/universal links
 * for Consumer Inbox, Bell Dropdown, Push Taps, and Admin Broadcast Validation.
 *
 * Security:
 * - Rejects open redirects (`https://evil.com`, `http://...`, `//...`), dangerous schemes
 *   (`javascript:`, `data:`, `vbscript:`, `file:`), path traversal (`..`, `\`, null bytes).
 * - Resolves `shopnojatra://` & `https://shopnojatra.com/*` links via DeepLinkingService
 *   to canonical internal routes.
 */

import { ROUTES } from "../../constants/routes";
import { deepLinkingService } from "./deepLinkingService";

export interface DeepLinkValidationResult {
  valid: boolean;
  normalizedRoute: string;
  isExternalRejected?: boolean;
  reason?: string;
}

const STATIC_ALLOWED_ROUTES = new Set<string>([
  ROUTES.ROOT,
  ROUTES.HOME,
  "/(tabs)/index",
  ROUTES.TABS.COMMUNITY,
  ROUTES.TABS.TRIPS,
  ROUTES.TABS.POST,
  ROUTES.TABS.MESSAGES,
  ROUTES.TABS.ACCOUNT,
  ROUTES.TABS.AGENCY,
  "/(tabs)/agency",
  "/admin",
  "/admin/index",
  "/agency",
  "/agency/index",
  "/hotel",
  "/hotel/index",
  "/hotel/bookings",
  "/hotel/calendar",
  "/hotel/contract",
  "/hotel/more",
  "/hotel/revenue",
  "/hotel/rooms",
  "/provider",
  "/provider/index",
  "/provider/contract",
  "/provider/earnings",
  "/provider/more",
  "/provider/schedule",
  "/provider/services",
  "/rider",
  "/rider/index",
  "/rider/deliveries",
  "/rider/dispatch",
  "/rider/earnings",
  "/rider/safety",
  "/rider/vehicle",
  "/onboarding",
  "/screens/abroad-agency",
  "/screens/active-devices",
  "/screens/active-trip",
  "/screens/admission-bus",
  "/screens/agencies",
  "/screens/agency-chat",
  "/screens/agency-detail",
  "/screens/booking-system",
  "/screens/bus-launch",
  "/screens/bus-live-tracking",
  "/screens/call",
  "/screens/car-rentals",
  "/screens/customer-support",
  "/screens/delete-account",
  "/screens/digital-passport",
  "/screens/emergency",
  "/screens/e-ticket",
  "/screens/events",
  "/screens/explore",
  "/screens/explore-trips",
  "/screens/flights",
  "/screens/group-trip",
  "/screens/help",
  "/screens/hotels-homes",
  "/screens/invite-earn",
  "/screens/itinerary-builder",
  "/screens/itinerary-clone",
  "/screens/itinerary-details",
  "/screens/landmark-scanner",
  "/screens/live",
  "/screens/local-marketplace",
  "/screens/luggage-measure",
  "/screens/notifications",
  "/screens/off-grid-mesh",
  "/screens/offline-survival",
  "/screens/packages",
  "/screens/payment-callback",
  "/screens/payment-details",
  "/screens/payment-failed",
  "/screens/payments",
  "/screens/payments-enhanced",
  "/screens/payment-success",
  "/screens/price-alerts",
  "/screens/profile",
  "/screens/recommended-tours",
  "/screens/reviews",
  "/screens/rewards",
  "/screens/ride-hailing",
  "/screens/saved",
  "/screens/search",
  "/screens/search-stays",
  "/screens/service-chat",
  "/screens/settings",
  "/screens/tour-guides",
  "/screens/train-live-tracking",
  "/screens/trains",
  "/screens/transaction-history",
  "/screens/travel-intelligence",
  "/screens/travel-match",
  "/screens/travel-preferences",
  "/screens/trip-checkout",
  "/screens/trip-planner",
  "/screens/user-profile",
]);

const DYNAMIC_ALLOWED_PREFIXES = [
  "/(tabs)/agency/",
  "/agency/",
  "/admin/",
  "/screens/",
] as const;

const LEGACY_ROUTE_ALIASES: Record<string, string> = {
  "/screens/community": ROUTES.TABS.COMMUNITY,
  "/home": ROUTES.HOME,
  "/notifications": ROUTES.SCREENS.NOTIFICATIONS,
  "/trips": ROUTES.TABS.TRIPS,
  "/messages": ROUTES.TABS.MESSAGES,
  "/settings": ROUTES.SCREENS.SETTINGS,
  "/travel-preferences": ROUTES.SCREENS.TRAVEL_PREFERENCES,
};

const DANGEROUS_PATTERNS = [
  /^javascript:/i,
  /^data:/i,
  /^vbscript:/i,
  /^file:/i,
  /^\/\//,
  /\\/,
  /\.\./,
  /%00/i,
  /[\u0000-\u001F\u007F]/,
];

function isPathAllowlisted(pathname: string): boolean {
  if (STATIC_ALLOWED_ROUTES.has(pathname)) return true;
  if (pathname.startsWith("/(tabs)/agency/") && /^\/\(tabs\)\/agency\/[A-Za-z0-9_-]+$/.test(pathname)) {
    return true;
  }
  if (pathname.startsWith("/agency/") && /^\/agency\/[A-Za-z0-9_-]+$/.test(pathname)) {
    return true;
  }
  if (pathname.startsWith("/admin/") && /^\/admin\/[A-Za-z0-9_-]+$/.test(pathname)) {
    return true;
  }
  if (pathname.startsWith("/screens/") && /^\/screens\/[A-Za-z0-9_-]+$/.test(pathname)) {
    const slug = pathname.slice("/screens/".length);
    return STATIC_ALLOWED_ROUTES.has(`/screens/${slug}`);
  }
  return false;
}

function buildSafeQuerySuffix(queryString: string): string {
  if (!queryString) return "";
  const safeParts: string[] = [];
  for (const part of queryString.split("&")) {
    if (!part) continue;
    const eqIdx = part.indexOf("=");
    const rawKey = eqIdx >= 0 ? part.slice(0, eqIdx) : part;
    const rawVal = eqIdx >= 0 ? part.slice(eqIdx + 1) : "";
    const cleanKey = rawKey.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!cleanKey) continue;
    if (/^(javascript:|data:|https?:\/\/|\/\/)/i.test(decodeURIComponent(rawVal || ""))) {
      continue;
    }
    safeParts.push(eqIdx >= 0 ? `${cleanKey}=${rawVal}` : cleanKey);
  }
  return safeParts.length > 0 ? `?${safeParts.join("&")}` : "";
}

/**
 * Validate a raw notification deep link (`/(tabs)`, `/screens/...`, `shopnojatra://...`,
 * or first-party `https://shopnojatra.com/...`). Rejects external domains & traversal.
 */
export function validateNotificationDeepLink(
  rawTarget?: string | null
): DeepLinkValidationResult {
  if (!rawTarget || typeof rawTarget !== "string") {
    return {
      valid: false,
      normalizedRoute: ROUTES.SCREENS.NOTIFICATIONS,
      reason: "Empty or missing deep link.",
    };
  }

  const trimmed = rawTarget.trim();
  if (!trimmed) {
    return {
      valid: false,
      normalizedRoute: ROUTES.SCREENS.NOTIFICATIONS,
      reason: "Blank deep link.",
    };
  }

  for (const pat of DANGEROUS_PATTERNS) {
    if (pat.test(trimmed)) {
      return {
        valid: false,
        normalizedRoute: ROUTES.SCREENS.NOTIFICATIONS,
        isExternalRejected: trimmed.startsWith("//"),
        reason: "Unsafe characters, traversal, or dangerous protocol blocked.",
      };
    }
  }

  // Handle full scheme or HTTPS URLs cleanly
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    if (!deepLinkingService.isSupportedUrl(trimmed)) {
      return {
        valid: false,
        normalizedRoute: ROUTES.SCREENS.NOTIFICATIONS,
        isExternalRejected: true,
        reason: "Untrusted external domain or unsupported URL scheme blocked.",
      };
    }
    const parsed = deepLinkingService.parseUrl(trimmed);
    if (!parsed || !parsed.targetRoute) {
      return {
        valid: false,
        normalizedRoute: ROUTES.SCREENS.NOTIFICATIONS,
        reason: "Could not parse ShopnoJatra deep link target.",
      };
    }
    const remapped = LEGACY_ROUTE_ALIASES[parsed.targetRoute] || parsed.targetRoute;
    const queryKeys = Object.entries(parsed.params || {})
      .filter(([, v]) => v !== undefined && v !== null && String(v).length > 0)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");

    if (!isPathAllowlisted(remapped)) {
      return {
        valid: false,
        normalizedRoute: ROUTES.SCREENS.NOTIFICATIONS,
        reason: `Unregistered target route '${remapped}'.`,
      };
    }

    return {
      valid: true,
      normalizedRoute: queryKeys ? `${remapped}?${queryKeys}` : remapped,
    };
  }

  // Internal Expo Router relative path
  if (!trimmed.startsWith("/")) {
    return {
      valid: false,
      normalizedRoute: ROUTES.SCREENS.NOTIFICATIONS,
      reason: "Internal routes must start with '/'.",
    };
  }

  const [rawPath, rawQuery = ""] = trimmed.split("?");
  const cleanedPath = rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;
  const canonicalPath = LEGACY_ROUTE_ALIASES[cleanedPath] || cleanedPath;

  // Reject dynamic prefixes with illegal segments
  if (
    !isPathAllowlisted(canonicalPath) &&
    !DYNAMIC_ALLOWED_PREFIXES.some((p) => canonicalPath.startsWith(p) && isPathAllowlisted(canonicalPath))
  ) {
    return {
      valid: false,
      normalizedRoute: ROUTES.SCREENS.NOTIFICATIONS,
      reason: `Route '${canonicalPath}' is not in the typed notification route registry.`,
    };
  }

  const querySuffix = buildSafeQuerySuffix(rawQuery);
  return {
    valid: true,
    normalizedRoute: `${canonicalPath}${querySuffix}`,
  };
}

/**
 * Returns a validated route ready for `router.push(...)`, or the safe fallback route.
 */
export function resolveSafeNotificationRoute(
  rawTarget?: string | null,
  fallback: string = ROUTES.SCREENS.NOTIFICATIONS
): string {
  const result = validateNotificationDeepLink(rawTarget);
  return result.valid ? result.normalizedRoute : fallback;
}

/**
 * Resolves a push notification tap payload (`data.deep_link`, `data.route`, or category fallback)
 * into a validated internal Expo Router path.
 */
export function resolveNotificationTapRoute(
  data: Record<string, any> | undefined | null
): string {
  if (!data || typeof data !== "object") {
    return ROUTES.SCREENS.NOTIFICATIONS;
  }

  const explicitTarget = data.deep_link || data.route;
  if (typeof explicitTarget === "string" && explicitTarget.trim()) {
    const validated = validateNotificationDeepLink(explicitTarget);
    if (validated.valid) {
      return validated.normalizedRoute;
    }
    return ROUTES.SCREENS.NOTIFICATIONS;
  }

  const type = String(data.category || data.type || "").toLowerCase();
  switch (type) {
    case "booking":
    case "flight_alert":
    case "flight":
      return ROUTES.TABS.TRIPS;
    case "price_alert": {
      const service = String(data.service_type || "flight").toLowerCase();
      const date = encodeURIComponent(String(data.travel_date || data.date || ""));
      const from = encodeURIComponent(String(data.origin || ""));
      const to = encodeURIComponent(String(data.destination || ""));
      if (service === "train") {
        return `${ROUTES.SCREENS.TRAINS}?from=${from}&to=${to}&date=${date}`;
      }
      if (service === "bus" || service === "launch") {
        return `/screens/bus-launch?from=${from}&to=${to}&date=${date}`;
      }
      return `${ROUTES.SCREENS.FLIGHTS}?from=${from}&to=${to}&date=${date}`;
    }
    case "promo":
    case "offer":
    case "discount":
      return ROUTES.SCREENS.REWARDS;
    case "community":
    case "travel_match":
      return ROUTES.TABS.COMMUNITY;
    case "chat":
    case "message":
      return ROUTES.TABS.MESSAGES;
    case "profile":
      return ROUTES.TABS.ACCOUNT;
    case "agency":
      return ROUTES.PORTALS.AGENCY;
    case "hotel":
      return ROUTES.PORTALS.HOTEL;
    default:
      return ROUTES.SCREENS.NOTIFICATIONS;
  }
}

export const TYPED_NOTIFICATION_QUICK_LINKS: ReadonlyArray<{
  label: string;
  route: string;
}> = [
  { label: "Home Discovery", route: ROUTES.HOME },
  { label: "My Trips", route: ROUTES.TABS.TRIPS },
  { label: "Flights", route: ROUTES.SCREENS.FLIGHTS },
  { label: "Hotels & Homes", route: ROUTES.SCREENS.HOTELS_HOMES },
  { label: "Tour Packages", route: ROUTES.SCREENS.PACKAGES },
  { label: "Price Alerts", route: ROUTES.SCREENS.PRICE_ALERTS },
  { label: "Rewards & Promos", route: ROUTES.SCREENS.REWARDS },
  { label: "Notification Inbox", route: ROUTES.SCREENS.NOTIFICATIONS },
  { label: "Travel Preferences", route: ROUTES.SCREENS.TRAVEL_PREFERENCES },
];
