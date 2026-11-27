/**
 * Notification Command Center Service
 *
 * Typed REST client + safe canonical fallbacks powering the 13 Admin Notification
 * Command Center modules and tenant-scoped Portal Alert streams.
 *
 * Error & Data Integrity Policy:
 * - Connects first to FastAPI `/api/v1/notifications/admin/*` & `/personalization/admin/*`.
 * - NEVER fabricates fake live delivery counts, log metrics, or provider health checks.
 * - Static deterministic catalogs (the 34 canonical Event Catalog schemas, system starter
 *   bilingual templates, local `{{variable}}` validation, PII masking) explicitly expose
 *   `source: "backend" | "local_catalog"` so the UI stays 100% honest.
 */

import { apiRequest } from "./apiClient";
import { notificationAdminService } from "./adminService";
import {
  formatPersonalizationError,
  personalizationService,
} from "./personalizationService";
import { supabase } from "../utils/supabase";

// ============================================================================
// PII Masking Helpers
// ============================================================================

export function maskEmail(email?: string | null): string {
  if (!email || typeof email !== "string" || !email.includes("@")) return "***";
  const [local, domain] = email.split("@");
  const visibleLocal = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);
  const [domName, ...rest] = (domain || "").split(".");
  const visibleDom = domName ? domName.slice(0, 1) : "*";
  const tld = rest.length > 0 ? `.${rest.join(".")}` : "";
  return `${visibleLocal}***@${visibleDom}***${tld}`;
}

export function maskPhone(phone?: string | null): string {
  if (!phone || typeof phone !== "string") return "***";
  const clean = phone.replace(/\s+/g, "");
  if (clean.length <= 4) return "****";
  return `${clean.slice(0, 4)}****${clean.slice(-2)}`;
}

export function maskUserId(userId?: string | null): string {
  if (!userId || typeof userId !== "string") return "usr_***";
  if (userId.length <= 10) return `${userId.slice(0, 3)}***`;
  return `${userId.slice(0, 6)}...${userId.slice(-4)}`;
}

export function maskRecipientAddress(raw?: string | null): string {
  if (!raw) return "***";
  if (raw.includes("@")) return maskEmail(raw);
  if (/^\+?\d[\d\s-]{6,}$/.test(raw)) return maskPhone(raw);
  return maskUserId(raw);
}

// ============================================================================
// Bilingual Template Variable Validation & Rendering
// ============================================================================

const MUSTACHE_VAR_REGEX = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export function extractTemplateVariables(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(MUSTACHE_VAR_REGEX.source, "g");
  while ((match = re.exec(text)) !== null) {
    if (match[1]) found.add(match[1]);
  }
  return Array.from(found);
}

export interface TemplateValidationResult {
  valid: boolean;
  requiredVariables: string[];
  providedVariables: string[];
  missingVariables: string[];
  unknownVariables: string[];
  enBnParityMismatch: string[];
}

export function validateTemplateVariables(params: {
  enTitle: string;
  enBody: string;
  bnTitle: string;
  bnBody: string;
  declaredVariables?: string[];
  sampleValues?: Record<string, unknown>;
}): TemplateValidationResult {
  const enVars = Array.from(
    new Set([
      ...extractTemplateVariables(params.enTitle),
      ...extractTemplateVariables(params.enBody),
    ])
  );
  const bnVars = Array.from(
    new Set([
      ...extractTemplateVariables(params.bnTitle),
      ...extractTemplateVariables(params.bnBody),
    ])
  );
  const allUsed = Array.from(new Set([...enVars, ...bnVars]));
  const declared = new Set(params.declaredVariables || allUsed);

  const missingVariables = allUsed.filter((v) => {
    const val = params.sampleValues?.[v];
    return val === undefined || val === null || String(val).trim() === "";
  });

  const unknownVariables = (params.declaredVariables && params.declaredVariables.length > 0)
    ? allUsed.filter((v) => !declared.has(v))
    : [];

  const enBnParityMismatch = [
    ...enVars.filter((v) => !bnVars.includes(v)),
    ...bnVars.filter((v) => !enVars.includes(v)),
  ];

  const valid =
    params.enTitle.trim().length > 0 &&
    params.enBody.trim().length > 0 &&
    params.bnTitle.trim().length > 0 &&
    params.bnBody.trim().length > 0 &&
    unknownVariables.length === 0;

  return {
    valid,
    requiredVariables: allUsed,
    providedVariables: Object.keys(params.sampleValues || {}),
    missingVariables,
    unknownVariables,
    enBnParityMismatch: Array.from(new Set(enBnParityMismatch)),
  };
}

export function interpolateTemplateText(
  text: string,
  variables: Record<string, unknown>
): string {
  return (text || "").replace(MUSTACHE_VAR_REGEX, (_, key: string) => {
    const val = variables[key];
    return val !== undefined && val !== null && String(val) !== ""
      ? String(val)
      : `{{${key}}}`;
  });
}

// ============================================================================
// 1. Domain Event Catalog (34 Canonical Events across 8 Domains)
// ============================================================================

export type EventDomainKey =
  | "user"
  | "security"
  | "booking"
  | "travel_product"
  | "agency"
  | "hotel"
  | "marketplace"
  | "system";

export interface EventCatalogEntry {
  event_type: string;
  domain: EventDomainKey;
  domain_label: string;
  aggregate_type: string;
  priority_tier: "P0" | "P1" | "P2" | "P3";
  priority_score: number;
  bypasses_quiet_hours: boolean;
  default_channels: string[];
  description: string;
  payload_fields: string[];
  sample_payload: Record<string, unknown>;
}

export const CANONICAL_EVENT_CATALOG: ReadonlyArray<EventCatalogEntry> = [
  // Category 1: User & Account (4)
  {
    event_type: "user.registered",
    domain: "user",
    domain_label: "User & Account",
    aggregate_type: "user",
    priority_tier: "P2",
    priority_score: 5,
    bypasses_quiet_hours: false,
    default_channels: ["email", "in_app"],
    description: "New traveler or partner completed account registration.",
    payload_fields: ["user_id", "full_name", "signup_method", "locale"],
    sample_payload: { full_name: "Tanvir Ahmed", signup_method: "google", locale: "bn" },
  },
  {
    event_type: "user.profile_updated",
    domain: "user",
    domain_label: "User & Account",
    aggregate_type: "profile",
    priority_tier: "P3",
    priority_score: 3,
    bypasses_quiet_hours: false,
    default_channels: ["in_app"],
    description: "Traveler updated contact, passport, or profile preferences.",
    payload_fields: ["user_id", "updated_fields"],
    sample_payload: { updated_fields: ["preferred_language", "home_city"] },
  },
  {
    event_type: "user.loyalty.tier_upgraded",
    domain: "user",
    domain_label: "User & Account",
    aggregate_type: "loyalty",
    priority_tier: "P2",
    priority_score: 6,
    bypasses_quiet_hours: false,
    default_channels: ["in_app", "push", "email"],
    description: "ShopnoMiles loyalty tier upgraded (Silver/Gold/Platinum).",
    payload_fields: ["user_id", "previous_tier", "new_tier", "perks_summary"],
    sample_payload: { previous_tier: "Silver", new_tier: "Gold" },
  },
  {
    event_type: "user.loyalty.points_awarded",
    domain: "user",
    domain_label: "User & Account",
    aggregate_type: "loyalty",
    priority_tier: "P3",
    priority_score: 4,
    bypasses_quiet_hours: false,
    default_channels: ["in_app"],
    description: "Bonus ShopnoMiles credited after verified trip completion.",
    payload_fields: ["user_id", "points_awarded", "new_balance"],
    sample_payload: { points_awarded: 650, new_balance: 3450 },
  },
  // Category 2: Security & Defense (4)
  {
    event_type: "security.auth.otp_requested",
    domain: "security",
    domain_label: "Security & Defense",
    aggregate_type: "session",
    priority_tier: "P0",
    priority_score: 10,
    bypasses_quiet_hours: true,
    default_channels: ["sms", "email"],
    description: "One-time verification passcode requested for login/payment.",
    payload_fields: ["user_id", "purpose", "expires_minutes"],
    sample_payload: { purpose: "login_verification", expires_minutes: 5 },
  },
  {
    event_type: "security.auth.new_device_login",
    domain: "security",
    domain_label: "Security & Defense",
    aggregate_type: "device",
    priority_tier: "P0",
    priority_score: 9,
    bypasses_quiet_hours: true,
    default_channels: ["push", "email", "in_app"],
    description: "Unrecognized device signed into account.",
    payload_fields: ["user_id", "device_name", "location_city"],
    sample_payload: { device_name: "Pixel 8 Android", location_city: "Dhaka" },
  },
  {
    event_type: "security.defense.bot_detected",
    domain: "security",
    domain_label: "Security & Defense",
    aggregate_type: "security_gate",
    priority_tier: "P0",
    priority_score: 10,
    bypasses_quiet_hours: true,
    default_channels: ["in_app", "email"],
    description: "Automated scraping or brute-force anomaly flagged by WAF.",
    payload_fields: ["target_endpoint", "risk_score", "action_taken"],
    sample_payload: { target_endpoint: "/api/v1/auth/otp", risk_score: 0.96, action_taken: "blocked" },
  },
  {
    event_type: "security.auth.password_changed",
    domain: "security",
    domain_label: "Security & Defense",
    aggregate_type: "session",
    priority_tier: "P0",
    priority_score: 9,
    bypasses_quiet_hours: true,
    default_channels: ["email", "in_app", "push"],
    description: "Account password or biometric credential rotated.",
    payload_fields: ["user_id", "changed_at"],
    sample_payload: { changed_at: "2026-11-26T09:00:00Z" },
  },
  // Category 3: Booking & Reservation (6)
  {
    event_type: "booking.created",
    domain: "booking",
    domain_label: "Booking & Reservation",
    aggregate_type: "booking",
    priority_tier: "P2",
    priority_score: 6,
    bypasses_quiet_hours: false,
    default_channels: ["in_app", "push"],
    description: "Booking hold / checkout initiated and awaiting payment.",
    payload_fields: ["booking_reference", "destination", "total_bdt"],
    sample_payload: { booking_reference: "SJ-BK-9012", destination: "Sylhet", total_bdt: 14500 },
  },
  {
    event_type: "booking.confirmed",
    domain: "booking",
    domain_label: "Booking & Reservation",
    aggregate_type: "booking",
    priority_tier: "P0",
    priority_score: 9,
    bypasses_quiet_hours: true,
    default_channels: ["push", "in_app", "email", "sms"],
    description: "Reservation confirmed with supplier and e-voucher issued.",
    payload_fields: ["booking_reference", "destination", "check_in_date"],
    sample_payload: { booking_reference: "SJ-BK-9012", destination: "Sylhet", check_in_date: "2026-12-05" },
  },
  {
    event_type: "booking.payment_succeeded",
    domain: "booking",
    domain_label: "Booking & Reservation",
    aggregate_type: "payment",
    priority_tier: "P0",
    priority_score: 9,
    bypasses_quiet_hours: true,
    default_channels: ["push", "in_app", "email"],
    description: "bKash/Nagad/Card payment captured and verified.",
    payload_fields: ["booking_reference", "amount_bdt", "gateway"],
    sample_payload: { booking_reference: "SJ-BK-9012", amount_bdt: 14500, gateway: "bKash" },
  },
  {
    event_type: "booking.payment_failed",
    domain: "booking",
    domain_label: "Booking & Reservation",
    aggregate_type: "payment",
    priority_tier: "P1",
    priority_score: 8,
    bypasses_quiet_hours: true,
    default_channels: ["push", "in_app", "sms"],
    description: "Payment declined or timed out before booking hold expired.",
    payload_fields: ["booking_reference", "failure_reason", "amount_bdt"],
    sample_payload: { booking_reference: "SJ-BK-9012", failure_reason: "Gateway timeout", amount_bdt: 14500 },
  },
  {
    event_type: "booking.cancelled",
    domain: "booking",
    domain_label: "Booking & Reservation",
    aggregate_type: "booking",
    priority_tier: "P1",
    priority_score: 8,
    bypasses_quiet_hours: false,
    default_channels: ["push", "in_app", "email"],
    description: "Reservation cancelled and refund workflow triggered.",
    payload_fields: ["booking_reference", "refund_bdt", "cancelled_by"],
    sample_payload: { booking_reference: "SJ-BK-9012", refund_bdt: 12000, cancelled_by: "user" },
  },
  {
    event_type: "booking.ticket_issued",
    domain: "booking",
    domain_label: "Booking & Reservation",
    aggregate_type: "ticket",
    priority_tier: "P0",
    priority_score: 9,
    bypasses_quiet_hours: true,
    default_channels: ["push", "in_app", "email"],
    description: "E-ticket PNR issued and downloadable offline.",
    payload_fields: ["pnr", "carrier", "departure_iso"],
    sample_payload: { pnr: "BG7718", carrier: "Biman Bangladesh", departure_iso: "2026-12-05T08:15:00+06:00" },
  },
  // Category 4: Travel Products & Inventory (4)
  {
    event_type: "flight.price_alert.triggered",
    domain: "travel_product",
    domain_label: "Travel Products & Inventory",
    aggregate_type: "price_alert",
    priority_tier: "P2",
    priority_score: 6,
    bypasses_quiet_hours: false,
    default_channels: ["push", "in_app"],
    description: "Tracked route fare dropped below target BDT threshold.",
    payload_fields: ["origin", "destination", "current_bdt", "drop_pct"],
    sample_payload: { origin: "DAC", destination: "CXB", current_bdt: 4299, drop_pct: 18 },
  },
  {
    event_type: "flight.schedule_changed",
    domain: "travel_product",
    domain_label: "Travel Products & Inventory",
    aggregate_type: "flight",
    priority_tier: "P1",
    priority_score: 8,
    bypasses_quiet_hours: true,
    default_channels: ["push", "sms", "in_app", "email"],
    description: "Airline shifted departure gate or flight timing.",
    payload_fields: ["flight_no", "new_departure", "delay_minutes"],
    sample_payload: { flight_no: "BS-141", new_departure: "14:20", delay_minutes: 45 },
  },
  {
    event_type: "hotel.booking.confirmed",
    domain: "travel_product",
    domain_label: "Travel Products & Inventory",
    aggregate_type: "hotel",
    priority_tier: "P0",
    priority_score: 9,
    bypasses_quiet_hours: true,
    default_channels: ["push", "in_app", "email"],
    description: "Hotel property acknowledged reservation & room allocation.",
    payload_fields: ["hotel_name", "room_type", "nights"],
    sample_payload: { hotel_name: "Grand Sultan Tea Resort", room_type: "King Deluxe", nights: 2 },
  },
  {
    event_type: "travel.disruption.detected",
    domain: "travel_product",
    domain_label: "Travel Products & Inventory",
    aggregate_type: "flight",
    priority_tier: "P0",
    priority_score: 9,
    bypasses_quiet_hours: true,
    default_channels: ["push", "sms", "in_app"],
    description: "Weather or transit disruption detected on upcoming itinerary.",
    payload_fields: ["destination", "severity", "advisory"],
    sample_payload: { destination: "Cox's Bazar", severity: "high", advisory: "Coastal cyclone signal 4" },
  },
  // Category 5: Agency & B2B Operations (4)
  {
    event_type: "agency.kyc.submitted",
    domain: "agency",
    domain_label: "Agency & B2B Operations",
    aggregate_type: "agency",
    priority_tier: "P2",
    priority_score: 5,
    bypasses_quiet_hours: false,
    default_channels: ["in_app", "email"],
    description: "B2B agency uploaded Trade License / IATA credentials.",
    payload_fields: ["agency_id", "agency_name", "doc_count"],
    sample_payload: { agency_id: "ag-101", agency_name: "SkyWings Holidays", doc_count: 4 },
  },
  {
    event_type: "agency.kyc.approved",
    domain: "agency",
    domain_label: "Agency & B2B Operations",
    aggregate_type: "kyc",
    priority_tier: "P1",
    priority_score: 7,
    bypasses_quiet_hours: false,
    default_channels: ["in_app", "email", "push"],
    description: "Agency verification approved; live ticketing enabled.",
    payload_fields: ["agency_id", "agency_name", "approved_by"],
    sample_payload: { agency_id: "ag-101", agency_name: "SkyWings Holidays", approved_by: "Admin" },
  },
  {
    event_type: "agency.kyc.expiring_warning",
    domain: "agency",
    domain_label: "Agency & B2B Operations",
    aggregate_type: "kyc",
    priority_tier: "P1",
    priority_score: 7,
    bypasses_quiet_hours: false,
    default_channels: ["in_app", "email"],
    description: "Agency license or IATA bond expiring within 14 days.",
    payload_fields: ["agency_id", "document_type", "days_remaining"],
    sample_payload: { agency_id: "ag-101", document_type: "ATAB License", days_remaining: 11 },
  },
  {
    event_type: "agency.payout.batch_processed",
    domain: "agency",
    domain_label: "Agency & B2B Operations",
    aggregate_type: "payout",
    priority_tier: "P2",
    priority_score: 6,
    bypasses_quiet_hours: false,
    default_channels: ["in_app", "email"],
    description: "Agency commission settlement batch disbursed.",
    payload_fields: ["agency_id", "batch_ref", "amount_bdt"],
    sample_payload: { agency_id: "ag-101", batch_ref: "PAY-2026-11", amount_bdt: 150000 },
  },
  // Category 6: Hotel Partner & Hospitality (4)
  {
    event_type: "hotel.room.inventory_low",
    domain: "hotel",
    domain_label: "Hotel Partner & Hospitality",
    aggregate_type: "room",
    priority_tier: "P1",
    priority_score: 7,
    bypasses_quiet_hours: false,
    default_channels: ["in_app", "push"],
    description: "Room category availability dropped below partner threshold.",
    payload_fields: ["hotel_id", "room_type", "remaining_units"],
    sample_payload: { hotel_id: "htl-201", room_type: "Sea View Suite", remaining_units: 2 },
  },
  {
    event_type: "hotel.guest.check_in_reminder",
    domain: "hotel",
    domain_label: "Hotel Partner & Hospitality",
    aggregate_type: "hotel",
    priority_tier: "P2",
    priority_score: 6,
    bypasses_quiet_hours: false,
    default_channels: ["push", "in_app", "sms"],
    description: "24-hour check-in readiness reminder for guest and front desk.",
    payload_fields: ["hotel_id", "guest_name", "check_in_date"],
    sample_payload: { hotel_id: "htl-201", guest_name: "Nusrat Jahan", check_in_date: "2026-11-27" },
  },
  {
    event_type: "hotel.review.submitted",
    domain: "hotel",
    domain_label: "Hotel Partner & Hospitality",
    aggregate_type: "review",
    priority_tier: "P3",
    priority_score: 4,
    bypasses_quiet_hours: false,
    default_channels: ["in_app"],
    description: "Verified guest submitted post-stay rating and review.",
    payload_fields: ["hotel_id", "rating", "booking_reference"],
    sample_payload: { hotel_id: "htl-201", rating: 4.8, booking_reference: "HTL-8821" },
  },
  {
    event_type: "hotel.staff.assigned",
    domain: "hotel",
    domain_label: "Hotel Partner & Hospitality",
    aggregate_type: "hotel",
    priority_tier: "P2",
    priority_score: 5,
    bypasses_quiet_hours: false,
    default_channels: ["in_app", "push"],
    description: "Housekeeping or concierge staff assigned to unit turnaround.",
    payload_fields: ["hotel_id", "room_number", "assignee_role"],
    sample_payload: { hotel_id: "htl-201", room_number: "405", assignee_role: "Housekeeping" },
  },
  // Category 7: Marketplace & Local Guides (4)
  {
    event_type: "marketplace.trip.sos_triggered",
    domain: "marketplace",
    domain_label: "Marketplace & Local Guides",
    aggregate_type: "emergency",
    priority_tier: "P0",
    priority_score: 10,
    bypasses_quiet_hours: true,
    default_channels: ["push", "sms", "in_app"],
    description: "Emergency SOS beacon triggered during active trip.",
    payload_fields: ["trip_id", "country_code", "emergency_hotline"],
    sample_payload: { trip_id: "trp-552", country_code: "BD", emergency_hotline: "999" },
  },
  {
    event_type: "marketplace.guide.quote_requested",
    domain: "marketplace",
    domain_label: "Marketplace & Local Guides",
    aggregate_type: "guide",
    priority_tier: "P2",
    priority_score: 6,
    bypasses_quiet_hours: false,
    default_channels: ["push", "in_app"],
    description: "Traveler requested custom itinerary quote from local guide.",
    payload_fields: ["guide_id", "destination", "travelers_count"],
    sample_payload: { guide_id: "gd-19", destination: "Bandarban", travelers_count: 4 },
  },
  {
    event_type: "marketplace.guide.booked",
    domain: "marketplace",
    domain_label: "Marketplace & Local Guides",
    aggregate_type: "guide",
    priority_tier: "P1",
    priority_score: 7,
    bypasses_quiet_hours: false,
    default_channels: ["push", "in_app", "email"],
    description: "Verified local guide engagement confirmed and escrowed.",
    payload_fields: ["guide_name", "destination", "start_date"],
    sample_payload: { guide_name: "Kamrul Hasan", destination: "Sajek Valley", start_date: "2026-12-10" },
  },
  {
    event_type: "marketplace.itinerary.cloned",
    domain: "marketplace",
    domain_label: "Marketplace & Local Guides",
    aggregate_type: "trip_session",
    priority_tier: "P3",
    priority_score: 3,
    bypasses_quiet_hours: false,
    default_channels: ["in_app"],
    description: "Community traveler cloned a published creator itinerary.",
    payload_fields: ["itinerary_title", "destination"],
    sample_payload: { itinerary_title: "3-Day Sreemangal Tea Trail", destination: "Sreemangal" },
  },
  // Category 8: System Telemetry & Health (4)
  {
    event_type: "system.worker.health_heartbeat",
    domain: "system",
    domain_label: "System Telemetry & Health",
    aggregate_type: "worker",
    priority_tier: "P3",
    priority_score: 2,
    bypasses_quiet_hours: false,
    default_channels: ["in_app"],
    description: "Notification outbox processor periodic health pulse.",
    payload_fields: ["worker_id", "pending_count", "lag_ms"],
    sample_payload: { worker_id: "outbox-worker-1", pending_count: 0, lag_ms: 42 },
  },
  {
    event_type: "system.dlq.message_quarantined",
    domain: "system",
    domain_label: "System Telemetry & Health",
    aggregate_type: "dlq",
    priority_tier: "P1",
    priority_score: 8,
    bypasses_quiet_hours: true,
    default_channels: ["in_app", "email"],
    description: "Notification exceeded max retries and moved to Dead-Letter Queue.",
    payload_fields: ["dlq_id", "event_type", "error_code"],
    sample_payload: { dlq_id: "dlq-109", event_type: "booking.confirmed", error_code: "PROVIDER_TIMEOUT" },
  },
  {
    event_type: "system.provider.circuit_breaker_tripped",
    domain: "system",
    domain_label: "System Telemetry & Health",
    aggregate_type: "provider",
    priority_tier: "P0",
    priority_score: 9,
    bypasses_quiet_hours: true,
    default_channels: ["in_app", "email"],
    description: "External Email/SMS/Push adapter tripped consecutive error circuit.",
    payload_fields: ["provider", "channel", "failure_rate_pct"],
    sample_payload: { provider: "ssl_wireless_sms", channel: "sms", failure_rate_pct: 48.5 },
  },
  {
    event_type: "system.campaign.completed",
    domain: "system",
    domain_label: "System Telemetry & Health",
    aggregate_type: "worker",
    priority_tier: "P3",
    priority_score: 4,
    bypasses_quiet_hours: false,
    default_channels: ["in_app"],
    description: "Scheduled personalized campaign batch finished dispatching.",
    payload_fields: ["campaign_id", "dispatched_count", "suppressed_count"],
    sample_payload: { campaign_id: "cmp-401", dispatched_count: 142, suppressed_count: 19 },
  },
];

// ============================================================================
// 2. Bilingual Templates Catalog & CRUD Contracts
// ============================================================================

export interface NotificationTemplateRecord {
  id: string;
  key: string;
  name: string;
  category: string;
  event_type?: string | null;
  en_title: string;
  en_body: string;
  bn_title: string;
  bn_body: string;
  cta_label_en?: string;
  cta_label_bn?: string;
  default_deep_link: string;
  channels: string[];
  declared_variables: string[];
  is_active: boolean;
  updated_at?: string;
  source?: "backend" | "local_catalog";
}

export const STARTER_BILINGUAL_TEMPLATES: NotificationTemplateRecord[] = [
  {
    id: "tpl-booking-confirmed",
    key: "booking_confirmed_v1",
    name: "Booking Confirmed (EN/BN)",
    category: "booking",
    event_type: "booking.confirmed",
    en_title: "Booking {{booking_reference}} Confirmed",
    en_body: "Your trip to {{destination}} checking in {{check_in_date}} is confirmed. View your e-ticket anytime.",
    bn_title: "বুকিং {{booking_reference}} নিশ্চিত হয়েছে",
    bn_body: "{{destination}} ভ্রমণের ({{check_in_date}}) বুকিং সফলভাবে নিশ্চিত হয়েছে। আপনার ই-টিকেট দেখুন।",
    cta_label_en: "View Trip",
    cta_label_bn: "ট্রিপ দেখুন",
    default_deep_link: "/(tabs)/trips",
    channels: ["push", "in_app", "email"],
    declared_variables: ["booking_reference", "destination", "check_in_date"],
    is_active: true,
    source: "local_catalog",
  },
  {
    id: "tpl-price-drop",
    key: "flight_price_drop_v1",
    name: "Smart Flight Price Drop (EN/BN)",
    category: "price_alerts",
    event_type: "flight.price_alert.triggered",
    en_title: "{{origin}} → {{destination}} Fare Dropped {{drop_pct}}%",
    en_body: "Flights for {{origin}} to {{destination}} are now starting from ৳{{current_bdt}}.",
    bn_title: "{{origin}} → {{destination}} ভাড়া {{drop_pct}}% কমেছে",
    bn_body: "{{origin}} থেকে {{destination}} ফ্লাইট এখন মাত্র ৳{{current_bdt}} থেকে শুরু।",
    cta_label_en: "Check Fares",
    cta_label_bn: "ভাড়া দেখুন",
    default_deep_link: "/screens/price-alerts",
    channels: ["push", "in_app"],
    declared_variables: ["origin", "destination", "drop_pct", "current_bdt"],
    is_active: true,
    source: "local_catalog",
  },
  {
    id: "tpl-agency-payout",
    key: "agency_payout_settled_v1",
    name: "Agency Payout Disbursed (EN/BN)",
    category: "agency",
    event_type: "agency.payout.batch_processed",
    en_title: "Payout Batch {{batch_ref}} Credited",
    en_body: "৳{{amount_bdt}} net commission payout for {{agency_name}} has been processed.",
    bn_title: "পেআউট ব্যাচ {{batch_ref}} সম্পন্ন",
    bn_body: "{{agency_name}}-এর ৳{{amount_bdt}} কমিশন পেআউট প্রসেস করা হয়েছে।",
    cta_label_en: "View Wallet",
    cta_label_bn: "ওয়ালেট দেখুন",
    default_deep_link: "/agency",
    channels: ["in_app", "email"],
    declared_variables: ["batch_ref", "amount_bdt", "agency_name"],
    is_active: true,
    source: "local_catalog",
  },
];

// ============================================================================
// 3. Deterministic Automation Rule Contracts
// ============================================================================

export type RuleConditionOperator = "eq" | "neq" | "gte" | "lte" | "contains" | "in";

export interface AutomationRuleCondition {
  field: string;
  operator: RuleConditionOperator;
  value: string;
}

export interface DeterministicAutomationRule {
  id: string;
  name: string;
  event_type: string;
  template_key: string;
  channels: string[];
  priority: "low" | "normal" | "high" | "critical";
  respect_quiet_hours: boolean;
  conditions: AutomationRuleCondition[];
  is_active: boolean;
  dry_run_count?: number;
  source?: "backend" | "local_catalog";
}

export interface RuleDryRunResponse {
  matched: boolean;
  event_type: string;
  evaluated_conditions: Array<{
    field: string;
    operator: string;
    expected: string;
    actual: unknown;
    passed: boolean;
  }>;
  suppressed_by?: string | null;
  selected_channels: string[];
  dispatched: false;
  note: string;
}

// ============================================================================
// 4. Delivery Logs, Providers, Live Ops, Funnel, Campaigns & AI Copilot Types
// ============================================================================

export interface DeliveryLogRecord {
  id: string;
  event_type: string;
  category: string;
  channel: string;
  status: string;
  recipient_masked: string;
  provider?: string;
  latency_ms?: number | null;
  error_message?: string | null;
  created_at: string;
}

export interface DeliveryLogsResult {
  items: DeliveryLogRecord[];
  total: number;
  source: "backend" | "outbox_derived" | "unavailable";
  error?: string;
}

export interface ProviderHealthItem {
  provider: string;
  channel: string;
  status: "healthy" | "degraded" | "circuit_open" | "mock_mode" | "unavailable";
  circuit_state?: string;
  mock_mode?: boolean;
  success_rate_pct?: number | null;
  avg_latency_ms?: number | null;
  last_checked_at?: string;
  detail?: string;
}

export interface ProviderHealthResult {
  providers: ProviderHealthItem[];
  source: "backend" | "unavailable";
  error?: string;
}

export interface LiveOpsFeedItem {
  id: string;
  kind: "outbox" | "dlq" | "campaign" | "decision";
  event_type: string;
  channel: string;
  status: string;
  recipient_masked: string;
  summary: string;
  timestamp: string;
}

export interface LiveOpsResult {
  items: LiveOpsFeedItem[];
  outbox_counts: Record<string, number>;
  dlq_count: number;
  source: "backend" | "composed";
  error?: string;
}

export interface FunnelStageMetric {
  stage: "queued" | "accepted" | "delivered" | "read" | "clicked" | "converted";
  label: string;
  count: number;
  conversion_from_prev_pct?: number;
}

export interface FunnelAnalyticsResult {
  stages: FunnelStageMetric[];
  source: "backend" | "unavailable";
  error?: string;
}

export interface ScheduledCampaignRecord {
  id: string;
  title: string;
  message: string;
  channel: string;
  target_audience: string;
  deep_link?: string;
  scheduled_time: string;
  timezone: string;
  status: "scheduled" | "paused" | "running" | "completed" | "sent" | "cancelled";
  sent_count?: number;
  source: "backend" | "supabase";
}

export interface AudiencePreviewResult {
  estimated_count: number;
  sample_recipients_masked: string[];
  source: "backend" | "segment_estimate" | "unavailable";
  note: string;
}

export interface AiCopilotSuggestion {
  preview_only: true;
  dispatched: false;
  en_title: string;
  en_body: string;
  bn_title: string;
  bn_body: string;
  suggested_event_type: string;
  suggested_channels: string[];
  suggested_deep_link: string;
  rationale: string[];
  source: "backend" | "unavailable";
  error?: string;
}

export interface PortalScopedAlert {
  id: string;
  portal_type: "agency" | "hotel";
  tenant_id: string;
  title: string;
  body: string;
  category: string;
  priority: "low" | "normal" | "high" | "critical";
  deep_link: string;
  is_read: boolean;
  created_at: string;
  source: "backend" | "supabase" | "realtime";
}

// ============================================================================
// Client Implementation
// ============================================================================

export const notificationCommandService = {
  // 1. Event Catalog
  async getEventCatalog(): Promise<{
    events: EventCatalogEntry[];
    source: "backend" | "local_catalog";
    warning?: string;
  }> {
    try {
      const res = await apiRequest<{ items?: EventCatalogEntry[]; events?: EventCatalogEntry[] }>(
        "/notifications/admin/events",
        { method: "GET", retries: 0, timeoutMs: 8000 }
      );
      const list = res?.events || res?.items;
      if (Array.isArray(list) && list.length > 0) {
        return { events: list, source: "backend" };
      }
      return {
        events: [...CANONICAL_EVENT_CATALOG],
        source: "local_catalog",
        warning: "Backend returned empty event list; displaying canonical 34-event registry.",
      };
    } catch (err) {
      return {
        events: [...CANONICAL_EVENT_CATALOG],
        source: "local_catalog",
        warning: `Using canonical 34-event registry (${formatPersonalizationError(err).message}).`,
      };
    }
  },

  async dryRunEvent(
    event: EventCatalogEntry,
    personaPreset: "family_midrange" | "budget_student" | "premium_luxury" = "family_midrange"
  ) {
    try {
      return await apiRequest<Record<string, unknown>>(
        `/notifications/admin/events/${encodeURIComponent(event.event_type)}/dry-run`,
        {
          method: "POST",
          body: JSON.stringify({
            event_type: event.event_type,
            payload: event.sample_payload,
            persona_preset: personaPreset,
            dry_run: true,
          }),
          retries: 0,
          timeoutMs: 10000,
        }
      );
    } catch {
      // Fall back to existing 24-Step Decision Preview endpoint (PREVIEW ONLY — NEVER SENDS)
      const category =
        event.domain === "booking"
          ? "booking"
          : event.domain === "security"
          ? "security"
          : event.domain === "travel_product"
          ? "flight_alerts"
          : "marketing";
      return personalizationService.previewDecision({
        persona_preset: personaPreset,
        event_type: event.event_type,
        category,
        base_title: `Preview: ${event.event_type}`,
        base_body: event.description,
        priority: event.priority_score,
        deep_link: "/(tabs)/trips",
        allow_ai_enrichment: true,
        verified_facts: event.sample_payload,
      });
    }
  },

  // 2. Bilingual Templates
  async getTemplates(): Promise<{
    templates: NotificationTemplateRecord[];
    source: "backend" | "local_catalog";
    warning?: string;
  }> {
    try {
      const res = await apiRequest<{ items?: NotificationTemplateRecord[]; templates?: NotificationTemplateRecord[] }>(
        "/notifications/admin/templates",
        { method: "GET", retries: 0, timeoutMs: 8000 }
      );
      const list = res?.templates || res?.items;
      if (Array.isArray(list) && list.length > 0) {
        return {
          templates: list.map((t) => ({ ...t, source: "backend" })),
          source: "backend",
        };
      }
      return {
        templates: STARTER_BILINGUAL_TEMPLATES.map((t) => ({ ...t })),
        source: "local_catalog",
        warning: "Showing starter EN/BN templates (backend templates table empty or unconfigured).",
      };
    } catch (err) {
      return {
        templates: STARTER_BILINGUAL_TEMPLATES.map((t) => ({ ...t })),
        source: "local_catalog",
        warning: `Showing starter EN/BN templates (${formatPersonalizationError(err).message}).`,
      };
    }
  },

  async saveTemplate(
    tpl: Omit<NotificationTemplateRecord, "source">
  ): Promise<{ saved: NotificationTemplateRecord; source: "backend" | "local_draft"; warning?: string }> {
    try {
      const isEdit = tpl.id && !tpl.id.startsWith("local-");
      const endpoint = isEdit
        ? `/notifications/admin/templates/${encodeURIComponent(tpl.id)}`
        : "/notifications/admin/templates";
      const res = await apiRequest<NotificationTemplateRecord>(endpoint, {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify(tpl),
        retries: 0,
        timeoutMs: 10000,
      });
      return { saved: { ...res, source: "backend" }, source: "backend" };
    } catch (err) {
      return {
        saved: { ...tpl, source: "local_catalog" },
        source: "local_draft",
        warning: `Saved in local workspace only (${formatPersonalizationError(err).message}).`,
      };
    }
  },

  async previewTemplateServerOrLocal(params: {
    template: NotificationTemplateRecord;
    variables: Record<string, string>;
    language: "en" | "bn";
  }) {
    const localValidation = validateTemplateVariables({
      enTitle: params.template.en_title,
      enBody: params.template.en_body,
      bnTitle: params.template.bn_title,
      bnBody: params.template.bn_body,
      declaredVariables: params.template.declared_variables,
      sampleValues: params.variables,
    });

    try {
      const serverRes = await apiRequest<Record<string, unknown>>(
        "/notifications/admin/templates/preview",
        {
          method: "POST",
          body: JSON.stringify({
            template_key: params.template.key,
            en_title: params.template.en_title,
            en_body: params.template.en_body,
            bn_title: params.template.bn_title,
            bn_body: params.template.bn_body,
            variables: params.variables,
            language: params.language,
          }),
          retries: 0,
          timeoutMs: 8000,
        }
      );
      return {
        validation: localValidation,
        renderedEnTitle: String(serverRes.en_title || interpolateTemplateText(params.template.en_title, params.variables)),
        renderedEnBody: String(serverRes.en_body || interpolateTemplateText(params.template.en_body, params.variables)),
        renderedBnTitle: String(serverRes.bn_title || interpolateTemplateText(params.template.bn_title, params.variables)),
        renderedBnBody: String(serverRes.bn_body || interpolateTemplateText(params.template.bn_body, params.variables)),
        source: "backend" as const,
      };
    } catch {
      return {
        validation: localValidation,
        renderedEnTitle: interpolateTemplateText(params.template.en_title, params.variables),
        renderedEnBody: interpolateTemplateText(params.template.en_body, params.variables),
        renderedBnTitle: interpolateTemplateText(params.template.bn_title, params.variables),
        renderedBnBody: interpolateTemplateText(params.template.bn_body, params.variables),
        source: "local_catalog" as const,
      };
    }
  },

  // 3. Deterministic Automation Rules + Dry-Run
  async getAutomationRules(): Promise<{
    rules: DeterministicAutomationRule[];
    source: "backend" | "local_catalog";
    warning?: string;
  }> {
    try {
      const res = await apiRequest<{ items?: DeterministicAutomationRule[]; rules?: DeterministicAutomationRule[] }>(
        "/notifications/admin/rules",
        { method: "GET", retries: 0, timeoutMs: 8000 }
      );
      const list = res?.rules || res?.items;
      if (Array.isArray(list) && list.length > 0) {
        return {
          rules: list.map((r) => ({ ...r, source: "backend" })),
          source: "backend",
        };
      }
      return {
        rules: getStarterAutomationRules(),
        source: "local_catalog",
        warning: "Showing default ShopnoJatra automation rules catalog.",
      };
    } catch (err) {
      return {
        rules: getStarterAutomationRules(),
        source: "local_catalog",
        warning: `Showing default automation rules catalog (${formatPersonalizationError(err).message}).`,
      };
    }
  },

  async saveAutomationRule(
    rule: Omit<DeterministicAutomationRule, "source">
  ): Promise<{ saved: DeterministicAutomationRule; source: "backend" | "local_draft"; warning?: string }> {
    try {
      const isEdit = Boolean(rule.id && !rule.id.startsWith("local-"));
      const path = isEdit
        ? `/notifications/admin/rules/${encodeURIComponent(rule.id)}`
        : "/notifications/admin/rules";
      const res = await apiRequest<DeterministicAutomationRule>(path, {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify(rule),
        retries: 0,
        timeoutMs: 10000,
      });
      return { saved: { ...res, source: "backend" }, source: "backend" };
    } catch (err) {
      return {
        saved: { ...rule, source: "local_catalog" },
        source: "local_draft",
        warning: `Rule staged locally (${formatPersonalizationError(err).message}).`,
      };
    }
  },

  async dryRunAutomationRule(
    rule: DeterministicAutomationRule,
    sampleEventPayload: Record<string, unknown>
  ): Promise<RuleDryRunResponse> {
    try {
      const res = await apiRequest<RuleDryRunResponse>("/notifications/admin/rules/dry-run", {
        method: "POST",
        body: JSON.stringify({ rule, sample_payload: sampleEventPayload, dry_run: true }),
        retries: 0,
        timeoutMs: 8000,
      });
      return { ...res, dispatched: false };
    } catch {
      const evaluated = rule.conditions.map((cond) => {
        const actual = sampleEventPayload[cond.field];
        const expected = cond.value;
        let passed = false;
        if (cond.operator === "eq") passed = String(actual ?? "").toLowerCase() === expected.toLowerCase();
        else if (cond.operator === "neq") passed = String(actual ?? "").toLowerCase() !== expected.toLowerCase();
        else if (cond.operator === "gte") passed = Number(actual) >= Number(expected);
        else if (cond.operator === "lte") passed = Number(actual) <= Number(expected);
        else if (cond.operator === "contains") passed = String(actual ?? "").toLowerCase().includes(expected.toLowerCase());
        else if (cond.operator === "in") {
          const choices = expected.split(",").map((s) => s.trim().toLowerCase());
          passed = choices.includes(String(actual ?? "").toLowerCase());
        }
        return { field: cond.field, operator: cond.operator, expected, actual, passed };
      });
      const matched = rule.is_active && evaluated.every((c) => c.passed);
      return {
        matched,
        event_type: rule.event_type,
        evaluated_conditions: evaluated,
        suppressed_by: rule.is_active ? (matched ? null : "condition_unmatched") : "rule_disabled",
        selected_channels: matched ? rule.channels : [],
        dispatched: false,
        note: "Evaluated locally using deterministic rule condition evaluator (dry-run only).",
      };
    }
  },

  // 4. Broadcast Audience Preview & Timezone-Aware Scheduler
  async previewBroadcastAudience(params: {
    targetingMode: "audience" | "segment";
    targetAudience?: string;
    segmentKey?: string;
  }): Promise<AudiencePreviewResult> {
    try {
      const res = await apiRequest<{
        estimated_count?: number;
        total_candidates?: number;
        sample_user_ids?: string[];
      }>("/notifications/admin/broadcast/preview-audience", {
        method: "POST",
        body: JSON.stringify({
          targeting_mode: params.targetingMode,
          target_audience: params.targetAudience,
          segment_key: params.segmentKey,
        }),
        retries: 0,
        timeoutMs: 8000,
      });
      const count = res?.estimated_count ?? res?.total_candidates ?? 0;
      const samples = (res?.sample_user_ids || []).slice(0, 5).map(maskUserId);
      return {
        estimated_count: count,
        sample_recipients_masked: samples,
        source: "backend",
        note: "Live backend audience estimate.",
      };
    } catch {
      if (params.targetingMode === "segment" && params.segmentKey) {
        try {
          const members = await personalizationService.getSegmentMembers(params.segmentKey, 1, 5);
          return {
            estimated_count: members.total_count ?? members.total,
            sample_recipients_masked: (members.members || []).map((m) => maskUserId(m.user_id)),
            source: "segment_estimate",
            note: `Estimated from segment '${params.segmentKey}' membership.`,
          };
        } catch {
          // Fall through cleanly
        }
      }
      return {
        estimated_count: 0,
        sample_recipients_masked: [],
        source: "unavailable",
        note: "Audience count preview endpoint unavailable; verify backend connectivity before large dispatch.",
      };
    }
  },

  async listCampaigns(): Promise<ScheduledCampaignRecord[]> {
    try {
      const res = await apiRequest<{ items?: any[]; campaigns?: any[] }>(
        "/notifications/admin/campaigns",
        { method: "GET", retries: 0, timeoutMs: 8000 }
      );
      const rows = res?.campaigns || res?.items;
      if (Array.isArray(rows) && rows.length > 0) {
        return rows.map((r) => ({
          id: String(r.id),
          title: String(r.title || "Campaign"),
          message: String(r.description || r.message || ""),
          channel: String(r.channel || "push"),
          target_audience: String(r.target_audience?.segment_key || r.target_audience || "all"),
          deep_link: r.custom_payload?.deep_link || "/(tabs)",
          scheduled_time: String(r.scheduled_for || r.scheduled_time || r.created_at),
          timezone: String(r.timezone || r.custom_payload?.timezone || "Asia/Dhaka"),
          status: (r.status || "scheduled") as ScheduledCampaignRecord["status"],
          sent_count: r.sent_count ?? 0,
          source: "backend",
        }));
      }
    } catch {
      // Fallback to Supabase scheduled_notifications below
    }

    const sched = await notificationAdminService.getScheduledNotifications();
    return (sched || []).map((item: any) => ({
      id: String(item.id),
      title: String(item.title || "Scheduled Broadcast"),
      message: String(item.message || ""),
      channel: String(item.channel || "push"),
      target_audience: String(item.target_audience || "all"),
      deep_link: item.deep_link || "/(tabs)",
      scheduled_time: String(item.scheduled_time || item.created_at),
      timezone: String(item.timezone || "Asia/Dhaka"),
      status: (item.status || "scheduled") as ScheduledCampaignRecord["status"],
      sent_count: item.sent_count ?? 0,
      source: "supabase" as const,
    }));
  },

  async controlCampaign(
    campaignId: string,
    action: "pause" | "resume" | "cancel"
  ): Promise<{ ok: boolean; status: string; source: "backend" | "supabase" }> {
    try {
      await apiRequest(`/notifications/admin/campaigns/${encodeURIComponent(campaignId)}/${action}`, {
        method: "POST",
        retries: 0,
        timeoutMs: 8000,
      });
      return {
        ok: true,
        status: action === "pause" ? "paused" : action === "resume" ? "scheduled" : "cancelled",
        source: "backend",
      };
    } catch {
      const nextStatus =
        action === "pause" ? "paused" : action === "resume" ? "scheduled" : "cancelled";
      if (action === "cancel") {
        await notificationAdminService.cancelScheduledNotification(campaignId);
      } else {
        await supabase
          .from("scheduled_notifications")
          .update({ status: nextStatus, updated_at: new Date().toISOString() })
          .eq("id", campaignId);
      }
      return { ok: true, status: nextStatus, source: "supabase" };
    }
  },

  // 5. Delivery Logs (Strictly Masked PII)
  async getDeliveryLogs(filters?: {
    channel?: string;
    status?: string;
    event_type?: string;
    limit?: number;
  }): Promise<DeliveryLogsResult> {
    try {
      const res = await apiRequest<{ items?: any[]; logs?: any[]; total?: number }>(
        "/notifications/admin/delivery-logs",
        {
          method: "GET",
          params: {
            channel: filters?.channel && filters.channel !== "all" ? filters.channel : undefined,
            status: filters?.status && filters.status !== "all" ? filters.status : undefined,
            event_type: filters?.event_type || undefined,
            limit: filters?.limit ?? 40,
          },
          retries: 0,
          timeoutMs: 8000,
        }
      );
      const rows = res?.logs || res?.items || [];
      return {
        items: rows.map((row: any) => ({
          id: String(row.id),
          event_type: String(row.event_type || "notification.sent"),
          category: String(row.category || "system"),
          channel: String(row.channel || "in_app"),
          status: String(row.status || "delivered"),
          recipient_masked: maskRecipientAddress(
            row.recipient_masked || row.recipient || row.user_id
          ),
          provider: row.provider || undefined,
          latency_ms: typeof row.latency_ms === "number" ? row.latency_ms : null,
          error_message: row.error_message || null,
          created_at: String(row.created_at || new Date().toISOString()),
        })),
        total: res?.total ?? rows.length,
        source: "backend",
      };
    } catch (err) {
      // Derive sanitized log rows from transactional outbox if dedicated endpoint isn't deployed
      try {
        const outbox = await personalizationService.getOutbox({
          page: 1,
          page_size: filters?.limit ?? 30,
          status: filters?.status && filters.status !== "all" ? filters.status : undefined,
        });
        const items: DeliveryLogRecord[] = (outbox.items || [])
          .filter((item) => {
            if (filters?.event_type && !item.event_type.includes(filters.event_type)) return false;
            return true;
          })
          .map((item) => ({
            id: item.id,
            event_type: item.event_type,
            category: item.aggregate_type,
            channel: "pipeline",
            status: item.status,
            recipient_masked: maskUserId(item.aggregate_id),
            provider: "decision_pipeline",
            latency_ms: null,
            error_message: item.last_error,
            created_at: item.created_at,
          }));
        return {
          items,
          total: outbox.total_count ?? outbox.total,
          source: "outbox_derived",
          error: `Dedicated /delivery-logs unavailable (${formatPersonalizationError(err).message}); showing sanitized outbox records.`,
        };
      } catch (fallbackErr) {
        return {
          items: [],
          total: 0,
          source: "unavailable",
          error: formatPersonalizationError(fallbackErr).message,
        };
      }
    }
  },

  // 6. Provider Health (Never Fake Statuses)
  async getProviderHealth(): Promise<ProviderHealthResult> {
    try {
      const res = await apiRequest<{ providers?: ProviderHealthItem[] }>(
        "/notifications/admin/providers/health",
        { method: "GET", retries: 0, timeoutMs: 8000 }
      );
      return {
        providers: Array.isArray(res?.providers) ? res.providers : [],
        source: "backend",
      };
    } catch (err) {
      return {
        providers: [],
        source: "unavailable",
        error: `Provider health endpoint unreachable: ${formatPersonalizationError(err).message}`,
      };
    }
  },

  // 7. Live Ops Stream
  async getLiveOpsFeed(): Promise<LiveOpsResult> {
    try {
      const res = await apiRequest<LiveOpsResult>("/notifications/admin/live-ops", {
        method: "GET",
        retries: 0,
        timeoutMs: 8000,
      });
      if (res && Array.isArray(res.items)) {
        return {
          ...res,
          items: res.items.map((item) => ({
            ...item,
            recipient_masked: maskRecipientAddress(item.recipient_masked),
          })),
          source: "backend",
        };
      }
    } catch {
      // Compose from live outbox & DLQ endpoints
    }

    const [outboxRes, dlqRes] = await Promise.allSettled([
      personalizationService.getOutbox({ page: 1, page_size: 15 }),
      personalizationService.getDlq({ page: 1, page_size: 10 }),
    ]);

    const items: LiveOpsFeedItem[] = [];
    let outboxCounts: Record<string, number> = {};
    let dlqCount = 0;

    if (outboxRes.status === "fulfilled") {
      outboxCounts = outboxRes.value.status_counts || {};
      for (const ob of outboxRes.value.items || []) {
        items.push({
          id: ob.id,
          kind: "outbox",
          event_type: ob.event_type,
          channel: "decision_pipeline",
          status: ob.status,
          recipient_masked: maskUserId(ob.aggregate_id),
          summary: `${ob.aggregate_type} • attempts ${ob.attempts}/${ob.max_attempts}`,
          timestamp: ob.created_at,
        });
      }
    }
    if (dlqRes.status === "fulfilled") {
      dlqCount = dlqRes.value.total_count ?? dlqRes.value.total;
      for (const dlq of dlqRes.value.items || []) {
        items.push({
          id: dlq.id,
          kind: "dlq",
          event_type: dlq.event_type,
          channel: dlq.channel || "unknown",
          status: dlq.resolution_status,
          recipient_masked: maskUserId(dlq.outbox_event_id || dlq.outbox_id || dlq.event_id),
          summary: dlq.failure_reason || "Quarantined in DLQ",
          timestamp: dlq.failed_at || dlq.created_at,
        });
      }
    }

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const errorMsg =
      outboxRes.status === "rejected" && dlqRes.status === "rejected"
        ? formatPersonalizationError(outboxRes.reason).message
        : undefined;

    return {
      items,
      outbox_counts: outboxCounts,
      dlq_count: dlqCount,
      source: "composed",
      error: errorMsg,
    };
  },

  // 8. Delivery Funnel Analytics (queued -> accepted -> delivered -> read -> clicked -> converted)
  async getDeliveryFunnel(windowDays = 30): Promise<FunnelAnalyticsResult> {
    try {
      const res = await apiRequest<{ stages?: FunnelStageMetric[] }>(
        "/notifications/admin/analytics/funnel",
        {
          method: "GET",
          params: { window_days: windowDays },
          retries: 0,
          timeoutMs: 8000,
        }
      );
      if (Array.isArray(res?.stages) && res.stages.length > 0) {
        return { stages: res.stages, source: "backend" };
      }
    } catch (err) {
      return {
        stages: [],
        source: "unavailable",
        error: `Funnel analytics endpoint unavailable: ${formatPersonalizationError(err).message}`,
      };
    }
    return {
      stages: [],
      source: "unavailable",
      error: "No funnel stages returned from backend.",
    };
  },

  // 9. AI Copilot (Preview Only) & Global Toggle
  async generateAiCopilotDraft(params: {
    prompt: string;
    language: "en" | "bn";
    category: string;
    destination?: string;
  }): Promise<AiCopilotSuggestion> {
    try {
      const res = await apiRequest<Omit<AiCopilotSuggestion, "source" | "preview_only" | "dispatched">>(
        "/notifications/admin/ai/copilot",
        {
          method: "POST",
          body: JSON.stringify(params),
          retries: 0,
          timeoutMs: 12000,
        }
      );
      return {
        ...res,
        preview_only: true,
        dispatched: false,
        source: "backend",
      };
    } catch (err) {
      return {
        preview_only: true,
        dispatched: false,
        en_title: "",
        en_body: "",
        bn_title: "",
        bn_body: "",
        suggested_event_type: "booking.confirmed",
        suggested_channels: ["in_app", "push"],
        suggested_deep_link: "/(tabs)",
        rationale: [],
        source: "unavailable",
        error: `AI Copilot backend unavailable: ${formatPersonalizationError(err).message}`,
      };
    }
  },

  async setGlobalAiEnabled(enabled: boolean): Promise<{ ok: boolean; error?: string }> {
    try {
      await apiRequest("/notifications/admin/ai/config", {
        method: "PUT",
        body: JSON.stringify({ ai_enabled: enabled }),
        retries: 0,
        timeoutMs: 8000,
      });
      return { ok: true };
    } catch {
      try {
        const rules = await personalizationService.getAdminRules();
        const active = rules.active_rule;
        await personalizationService.updateAdminRules({
          weights: active?.weights || {},
          ai_config: { ...(active?.ai_config || {}), ai_enabled: enabled, enabled },
          change_notes: `AI Notification Lab toggled global ai_enabled=${enabled}`,
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: formatPersonalizationError(err).message };
      }
    }
  },

  // 10. Scoped Portal Alerts (Strict Tenant Isolation for Agency / Hotel)
  async fetchScopedPortalAlerts(
    portalType: "agency" | "hotel",
    tenantId: string
  ): Promise<PortalScopedAlert[]> {
    const cleanTenantId = String(tenantId || "").trim();
    if (!cleanTenantId) {
      return [];
    }

    try {
      const res = await apiRequest<{ items?: any[]; notifications?: any[] }>(
        "/notifications",
        {
          method: "GET",
          params: {
            portal_type: portalType,
            tenant_id: cleanTenantId,
            page: 1,
            page_size: 25,
          },
          retries: 0,
          timeoutMs: 8000,
        }
      );
      const rawItems = res?.items || res?.notifications || [];
      return rawItems
        .filter((item) => {
          const itemTenant = item.tenant_id || item.data?.tenant_id || item.data?.[`${portalType}_id`];
          return !itemTenant || String(itemTenant) === cleanTenantId;
        })
        .map((item) => ({
          id: String(item.id),
          portal_type: portalType,
          tenant_id: cleanTenantId,
          title: String(item.title || `${portalType.toUpperCase()} Alert`),
          body: String(item.body || item.message || ""),
          category: String(item.category || portalType),
          priority: (item.priority || "normal") as PortalScopedAlert["priority"],
          deep_link: String(
            item.deep_link || (portalType === "agency" ? "/agency" : "/hotel")
          ),
          is_read: Boolean(item.is_read),
          created_at: String(item.created_at || new Date().toISOString()),
          source: "backend" as const,
        }));
    } catch {
      // Fall back safely to Supabase tenant-filtered operational alerts (strict tenant match)
      try {
        const tenantCol = portalType === "agency" ? "agency_id" : "hotel_id";
        const { data } = await supabase
          .from("bookings")
          .select("id, booking_reference, status, destination_city, created_at")
          .eq(tenantCol, cleanTenantId)
          .order("created_at", { ascending: false })
          .limit(8);

        return (data || []).map((row: any) => ({
          id: `${portalType}-bk-${row.id}`,
          portal_type: portalType,
          tenant_id: cleanTenantId,
          title: `Booking ${row.booking_reference || row.id}`,
          body: `Status: ${String(row.status || "pending").toUpperCase()}${
            row.destination_city ? ` • ${row.destination_city}` : ""
          }`,
          category: portalType,
          priority: row.status === "cancelled" ? "high" : "normal",
          deep_link: portalType === "agency" ? "/agency" : "/hotel/bookings",
          is_read: false,
          created_at: row.created_at || new Date().toISOString(),
          source: "supabase" as const,
        }));
      } catch {
        return [];
      }
    }
  },
};

function getStarterAutomationRules(): DeterministicAutomationRule[] {
  return [
    {
      id: "rule-booking-confirmed",
      name: "Critical Booking Confirmation",
      event_type: "booking.confirmed",
      template_key: "booking_confirmed_v1",
      channels: ["push", "in_app", "email"],
      priority: "critical",
      respect_quiet_hours: false,
      conditions: [{ field: "total_bdt", operator: "gte", value: "0" }],
      is_active: true,
      source: "local_catalog",
    },
    {
      id: "rule-price-drop",
      name: "Smart Price Alert >= 10% Drop",
      event_type: "flight.price_alert.triggered",
      template_key: "flight_price_drop_v1",
      channels: ["push", "in_app"],
      priority: "normal",
      respect_quiet_hours: true,
      conditions: [{ field: "drop_pct", operator: "gte", value: "10" }],
      is_active: true,
      source: "local_catalog",
    },
    {
      id: "rule-agency-payout",
      name: "Agency Payout Disbursed",
      event_type: "agency.payout.batch_processed",
      template_key: "agency_payout_settled_v1",
      channels: ["in_app", "email"],
      priority: "normal",
      respect_quiet_hours: true,
      conditions: [{ field: "amount_bdt", operator: "gte", value: "100" }],
      is_active: true,
      source: "local_catalog",
    },
  ];
}
