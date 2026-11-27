import { z } from "zod";

/**
 * Hotel PMS Domain Contracts, Zod v4 Validators & Yield/Folio Engines
 * Synchronized with supabase/migrations/20260623_rider_hotel_marketplace_production.sql
 */

// ============================================================================
// 1. CONSTANTS & STATE TRANSITIONS
// ============================================================================

export const HOTEL_DYNAMIC_MIN_MULTIPLIER = 0.5;
export const HOTEL_DYNAMIC_MAX_MULTIPLIER = 1.25;
export const HOTEL_VAT_RATE = 0.05;
export const HOTEL_SERVICE_CHARGE_RATE = 0.1;

// ============================================================================
// 2. STATUS ENUMS & SCHEMAS
// ============================================================================

export const RoomOccupancyStatusSchema = z.enum([
  "vacant",
  "reserved",
  "occupied",
  "due_out",
  "blocked",
  "out_of_order",
]);
export type RoomOccupancyStatus = z.infer<typeof RoomOccupancyStatusSchema>;

export const RoomHousekeepingStatusSchema = z.enum([
  "dirty",
  "cleaning",
  "inspection",
  "clean",
  "ready",
  "out_of_service",
]);
export type RoomHousekeepingStatus = z.infer<typeof RoomHousekeepingStatusSchema>;

export const HousekeepingTaskTypeSchema = z.enum([
  "checkout_clean",
  "stayover_refresh",
  "deep_clean",
  "vip_turndown",
  "inspection",
]);
export type HousekeepingTaskType = z.infer<typeof HousekeepingTaskTypeSchema>;

export const HousekeepingPrioritySchema = z.enum([
  "low",
  "normal",
  "high",
  "vip_arrival",
  "urgent",
]);
export type HousekeepingPriority = z.infer<typeof HousekeepingPrioritySchema>;

export const HousekeepingTaskStatusSchema = z.enum([
  "dirty",
  "cleaning",
  "inspection",
  "ready",
  "cancelled",
]);
export type HousekeepingTaskStatus = z.infer<typeof HousekeepingTaskStatusSchema>;

export const MaintenanceCategorySchema = z.enum([
  "plumbing",
  "electrical",
  "hvac",
  "furniture",
  "wifi_it",
  "safety",
  "appliance",
  "other",
]);
export type MaintenanceCategory = z.infer<typeof MaintenanceCategorySchema>;

export const MaintenanceSeveritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);
export type MaintenanceSeverity = z.infer<typeof MaintenanceSeveritySchema>;

export const MaintenanceTicketStatusSchema = z.enum([
  "open",
  "assigned",
  "in_progress",
  "parts_pending",
  "resolved",
  "closed",
]);
export type MaintenanceTicketStatus = z.infer<typeof MaintenanceTicketStatusSchema>;

export const HotelFolioStatusSchema = z.enum([
  "open",
  "pending_settlement",
  "partially_paid",
  "settled",
  "void",
]);
export type HotelFolioStatus = z.infer<typeof HotelFolioStatusSchema>;

export const FolioItemTypeSchema = z.enum([
  "room_night",
  "minibar",
  "room_service",
  "breakfast",
  "airport_transfer",
  "late_checkout",
  "marketplace_concierge",
  "laundry",
  "spa",
  "vat_tax",
  "service_charge",
  "deposit",
  "payment",
  "discount",
  "adjustment",
]);
export type FolioItemType = z.infer<typeof FolioItemTypeSchema>;

export const FolioEntrySideSchema = z.enum(["charge", "payment", "credit"]);
export type FolioEntrySide = z.infer<typeof FolioEntrySideSchema>;

export const HotelRateRuleTypeSchema = z.enum([
  "occupancy_surge",
  "weekend",
  "seasonal",
  "flash_deal",
  "early_bird",
  "last_minute",
  "length_of_stay",
]);
export type HotelRateRuleType = z.infer<typeof HotelRateRuleTypeSchema>;

export const GuestKeyStatusSchema = z.enum([
  "active",
  "rotated",
  "expired",
  "revoked",
]);
export type GuestKeyStatus = z.infer<typeof GuestKeyStatusSchema>;

// ============================================================================
// 3. ENTITY & INPUT SCHEMAS
// ============================================================================

export const HotelRoomUnitSchema = z.object({
  id: z.uuid(),
  hotel_id: z.uuid(),
  room_type_id: z.uuid(),
  room_number: z.string().min(1),
  floor_number: z.int().min(0).max(100).default(1),
  wing: z.string().nullable().optional(),
  occupancy_status: RoomOccupancyStatusSchema.default("vacant"),
  housekeeping_status: RoomHousekeepingStatusSchema.default("clean"),
  current_booking_id: z.uuid().nullable().optional(),
  current_guest_id: z.uuid().nullable().optional(),
  is_vip_room: z.boolean().default(false),
  dynamic_pricing_enabled: z.boolean().default(true),
  base_nightly_rate_bdt: z.number().nonnegative(),
  amenities_override: z.array(z.string()).default([]),
  ai_tags: z.array(z.string()).default([]),
  last_cleaned_at: z.iso.datetime().nullable().optional(),
  last_inspected_at: z.iso.datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  created_at: z.iso.datetime().optional(),
  updated_at: z.iso.datetime().optional(),
});
export type HotelRoomUnit = z.infer<typeof HotelRoomUnitSchema>;

export const HotelHousekeepingTaskSchema = z.object({
  id: z.uuid(),
  hotel_id: z.uuid(),
  room_unit_id: z.uuid(),
  assigned_staff_id: z.uuid().nullable().optional(),
  assigned_user_id: z.uuid().nullable().optional(),
  task_type: HousekeepingTaskTypeSchema.default("checkout_clean"),
  priority: HousekeepingPrioritySchema.default("normal"),
  status: HousekeepingTaskStatusSchema.default("dirty"),
  sla_minutes: z.int().positive().default(45),
  due_by: z.iso.datetime().nullable().optional(),
  started_at: z.iso.datetime().nullable().optional(),
  inspected_at: z.iso.datetime().nullable().optional(),
  inspected_by: z.uuid().nullable().optional(),
  completed_at: z.iso.datetime().nullable().optional(),
  checklist: z.array(z.record(z.string(), z.unknown())).default([]),
  notes: z.string().nullable().optional(),
  created_at: z.iso.datetime().optional(),
  updated_at: z.iso.datetime().optional(),
});
export type HotelHousekeepingTask = z.infer<typeof HotelHousekeepingTaskSchema>;

export const HotelMaintenanceTicketSchema = z.object({
  id: z.uuid(),
  hotel_id: z.uuid(),
  room_unit_id: z.uuid().nullable().optional(),
  reported_by: z.uuid().nullable().optional(),
  assigned_staff_id: z.uuid().nullable().optional(),
  ticket_reference: z.string(),
  category: MaintenanceCategorySchema,
  severity: MaintenanceSeveritySchema.default("medium"),
  status: MaintenanceTicketStatusSchema.default("open"),
  title: z.string().min(3),
  description: z.string().nullable().optional(),
  blocks_room_sale: z.boolean().default(false),
  estimated_cost_bdt: z.number().nonnegative().default(0),
  actual_cost_bdt: z.number().nonnegative().default(0),
  currency: z.string().default("BDT"),
  resolution_notes: z.string().nullable().optional(),
  resolved_at: z.iso.datetime().nullable().optional(),
  created_at: z.iso.datetime().optional(),
  updated_at: z.iso.datetime().optional(),
});
export type HotelMaintenanceTicket = z.infer<typeof HotelMaintenanceTicketSchema>;

export const HotelFolioItemSchema = z.object({
  id: z.uuid(),
  folio_id: z.uuid(),
  hotel_id: z.uuid(),
  item_type: FolioItemTypeSchema,
  description: z.string().min(1),
  quantity: z.int().positive().default(1),
  unit_amount_paisa: z.int().positive(),
  tax_paisa: z.int().nonnegative().default(0),
  total_paisa: z.int().positive(),
  entry_side: FolioEntrySideSchema.default("charge"),
  payer_label: z.string().default("primary_guest"),
  reference_id: z.string().nullable().optional(),
  posted_by: z.uuid().nullable().optional(),
  idempotency_key: z.string().nullable().optional(),
  is_voided: z.boolean().default(false),
  posted_at: z.iso.datetime(),
  created_at: z.iso.datetime().optional(),
});
export type HotelFolioItem = z.infer<typeof HotelFolioItemSchema>;

export const HotelFolioSchema = z.object({
  id: z.uuid(),
  folio_number: z.string(),
  hotel_id: z.uuid(),
  booking_id: z.uuid().nullable().optional(),
  room_unit_id: z.uuid().nullable().optional(),
  guest_user_id: z.uuid(),
  guest_name: z.string(),
  guest_phone: z.string().nullable().optional(),
  guest_nid_or_passport_verified: z.boolean().default(false),
  status: HotelFolioStatusSchema.default("open"),
  currency: z.string().default("BDT"),
  room_charges_paisa: z.int().nonnegative(),
  addon_charges_paisa: z.int().nonnegative(),
  tax_paisa: z.int().nonnegative(),
  discount_paisa: z.int().nonnegative(),
  total_charges_paisa: z.int().nonnegative(),
  paid_paisa: z.int().nonnegative(),
  balance_due_paisa: z.int(),
  checked_in_at: z.iso.datetime().nullable().optional(),
  checked_out_at: z.iso.datetime().nullable().optional(),
  settled_at: z.iso.datetime().nullable().optional(),
  split_billing_config: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().nullable().optional(),
  items: z.array(HotelFolioItemSchema).optional(),
  created_at: z.iso.datetime().optional(),
  updated_at: z.iso.datetime().optional(),
});
export type HotelFolio = z.infer<typeof HotelFolioSchema>;

export const HotelRateRuleSchema = z.object({
  id: z.uuid(),
  hotel_id: z.uuid(),
  room_type_id: z.uuid().nullable().optional(),
  rule_name: z.string().min(2),
  rule_type: HotelRateRuleTypeSchema,
  priority: z.int().default(100),
  multiplier: z
    .number()
    .min(0.4)
    .max(HOTEL_DYNAMIC_MAX_MULTIPLIER)
    .default(1),
  flat_adjustment_bdt: z.number().default(0),
  min_occupancy_pct: z.number().min(0).max(100).nullable().optional(),
  max_occupancy_pct: z.number().min(0).max(100).nullable().optional(),
  days_of_week: z.array(z.int().min(0).max(6)).nullable().optional(),
  start_date: z.iso.date().nullable().optional(),
  end_date: z.iso.date().nullable().optional(),
  min_nights: z.int().min(1).nullable().optional(),
  is_flash_deal: z.boolean().default(false),
  is_active: z.boolean().default(true),
  created_at: z.iso.datetime().optional(),
  updated_at: z.iso.datetime().optional(),
});
export type HotelRateRule = z.infer<typeof HotelRateRuleSchema>;

export const HotelGuestKeySchema = z.object({
  id: z.uuid(),
  hotel_id: z.uuid(),
  room_unit_id: z.uuid(),
  folio_id: z.uuid().nullable().optional(),
  booking_id: z.uuid().nullable().optional(),
  guest_user_id: z.uuid(),
  qr_pass_code: z.string(),
  pin_code_last4: z.string().nullable().optional(),
  wifi_ssid: z.string().nullable().optional(),
  wifi_password: z.string().nullable().optional(),
  status: GuestKeyStatusSchema.default("active"),
  valid_from: z.iso.datetime(),
  valid_until: z.iso.datetime(),
  rotated_count: z.int().nonnegative().default(0),
  last_unlocked_at: z.iso.datetime().nullable().optional(),
  created_at: z.iso.datetime().optional(),
});
export type HotelGuestKey = z.infer<typeof HotelGuestKeySchema>;

export const ExpressCheckinInputSchema = z.object({
  hotel_id: z.uuid(),
  booking_ref: z.string().min(3),
  room_unit_id: z.uuid().optional(),
  nid_verified: z.boolean().default(true),
  wifi_ssid: z.string().optional(),
});
export type ExpressCheckinInput = z.infer<typeof ExpressCheckinInputSchema>;

export const PostFolioChargeInputSchema = z.object({
  folio_id: z.uuid(),
  charges: z
    .array(
      z.object({
        item_type: FolioItemTypeSchema,
        description: z.string().min(1),
        quantity: z.int().positive().default(1),
        unit_amount_paisa: z.int().positive(),
        tax_paisa: z.int().nonnegative().default(0),
        entry_side: FolioEntrySideSchema.default("charge"),
        payer_label: z.string().default("primary_guest"),
        reference_id: z.string().optional(),
      })
    )
    .default([]),
  payment_amount_paisa: z.int().nonnegative().default(0),
  payment_method: z.string().default("card"),
  checkout: z.boolean().default(false),
  idempotency_key: z.string().min(8).optional(),
});
export type PostFolioChargeInput = z.infer<typeof PostFolioChargeInputSchema>;

export const DynamicRateQuoteSchema = z.object({
  base_nightly_bdt: z.number().nonnegative(),
  effective_multiplier: z.number().min(HOTEL_DYNAMIC_MIN_MULTIPLIER).max(HOTEL_DYNAMIC_MAX_MULTIPLIER),
  is_capped: z.boolean(),
  dynamic_nightly_bdt: z.number().nonnegative(),
  nights: z.int().positive(),
  subtotal_paisa: z.int().nonnegative(),
  vat_paisa: z.int().nonnegative(),
  service_charge_paisa: z.int().nonnegative(),
  total_paisa: z.int().nonnegative(),
  applied_rules: z.array(
    z.object({
      rule_name: z.string(),
      rule_type: HotelRateRuleTypeSchema,
      multiplier: z.number(),
      flat_adjustment_bdt: z.number(),
    })
  ),
});
export type DynamicRateQuote = z.infer<typeof DynamicRateQuoteSchema>;

// ============================================================================
// 4. HOUSEKEEPING STATE MACHINE, YIELD PRICING & FOLIO CALCULATORS
// ============================================================================

export const HOUSEKEEPING_ALLOWED_TRANSITIONS: Record<
  HousekeepingTaskStatus,
  HousekeepingTaskStatus[]
> = {
  dirty: ["cleaning", "cancelled"],
  cleaning: ["inspection", "dirty", "cancelled"],
  inspection: ["ready", "dirty", "cancelled"],
  ready: ["dirty"],
  cancelled: ["dirty"],
};

export function canTransitionHousekeeping(
  from: HousekeepingTaskStatus,
  to: HousekeepingTaskStatus
): boolean {
  return HOUSEKEEPING_ALLOWED_TRANSITIONS[from].includes(to);
}

export function calculateDynamicRoomRate(params: {
  baseNightlyBdt: number;
  checkInDate: string;
  nights: number;
  occupancyPct: number;
  rules?: Array<
    Pick<
      HotelRateRule,
      | "rule_name"
      | "rule_type"
      | "multiplier"
      | "flat_adjustment_bdt"
      | "min_occupancy_pct"
      | "max_occupancy_pct"
      | "days_of_week"
      | "start_date"
      | "end_date"
      | "min_nights"
      | "is_active"
    >
  >;
}): DynamicRateQuote {
  const nights = Math.max(1, Math.min(90, Math.round(params.nights)));
  const base = Math.max(100, params.baseNightlyBdt);
  const checkIn = new Date(params.checkInDate);
  const dow = Number.isNaN(checkIn.getTime()) ? 0 : checkIn.getUTCDay();

  let effectiveMult = 1;
  let flatDelta = 0;
  const appliedRules: DynamicRateQuote["applied_rules"] = [];

  for (const rule of params.rules ?? []) {
    if (!rule.is_active) continue;
    if (rule.start_date && params.checkInDate < rule.start_date) continue;
    if (rule.end_date && params.checkInDate > rule.end_date) continue;
    if (rule.days_of_week && rule.days_of_week.length > 0 && !rule.days_of_week.includes(dow)) {
      continue;
    }
    if (rule.min_occupancy_pct != null && params.occupancyPct < rule.min_occupancy_pct) continue;
    if (rule.max_occupancy_pct != null && params.occupancyPct > rule.max_occupancy_pct) continue;
    if (rule.min_nights != null && nights < rule.min_nights) continue;

    effectiveMult *= rule.multiplier;
    flatDelta += rule.flat_adjustment_bdt;
    appliedRules.push({
      rule_name: rule.rule_name,
      rule_type: rule.rule_type,
      multiplier: rule.multiplier,
      flat_adjustment_bdt: rule.flat_adjustment_bdt,
    });
  }

  const clampedMult = Math.min(
    HOTEL_DYNAMIC_MAX_MULTIPLIER,
    Math.max(HOTEL_DYNAMIC_MIN_MULTIPLIER, effectiveMult)
  );
  const maxAllowedBdt = Math.round(base * HOTEL_DYNAMIC_MAX_MULTIPLIER * 100) / 100;
  const rawNightly = Math.max(100, Math.round((base * clampedMult + flatDelta) * 100) / 100);
  const dynamicNightlyBdt = Math.min(maxAllowedBdt, rawNightly);
  const isCapped = effectiveMult > HOTEL_DYNAMIC_MAX_MULTIPLIER || rawNightly > maxAllowedBdt;

  const subtotalPaisa = Math.round(dynamicNightlyBdt * nights * 100);
  const vatPaisa = Math.round(subtotalPaisa * HOTEL_VAT_RATE);
  const serviceChargePaisa = Math.round(subtotalPaisa * HOTEL_SERVICE_CHARGE_RATE);

  return {
    base_nightly_bdt: base,
    effective_multiplier: Math.round(clampedMult * 1000) / 1000,
    is_capped: isCapped,
    dynamic_nightly_bdt: dynamicNightlyBdt,
    nights,
    subtotal_paisa: subtotalPaisa,
    vat_paisa: vatPaisa,
    service_charge_paisa: serviceChargePaisa,
    total_paisa: subtotalPaisa + vatPaisa + serviceChargePaisa,
    applied_rules: appliedRules,
  };
}

export function calculateFolioSummary(
  items: Array<
    Pick<
      HotelFolioItem,
      "item_type" | "entry_side" | "total_paisa" | "tax_paisa" | "is_voided" | "payer_label"
    >
  >
): {
  roomChargesPaisa: number;
  addonChargesPaisa: number;
  taxPaisa: number;
  discountPaisa: number;
  totalChargesPaisa: number;
  paidPaisa: number;
  balanceDuePaisa: number;
  splitByPayer: Record<string, number>;
} {
  let roomChargesPaisa = 0;
  let addonChargesPaisa = 0;
  let taxPaisa = 0;
  let discountPaisa = 0;
  let chargeSum = 0;
  let paidPaisa = 0;
  const splitByPayer: Record<string, number> = {};

  for (const item of items) {
    if (item.is_voided) continue;
    const payer = item.payer_label || "primary_guest";
    if (item.entry_side === "charge") {
      const preTax = Math.max(0, item.total_paisa - item.tax_paisa);
      if (item.item_type === "room_night") {
        roomChargesPaisa += preTax;
      } else {
        addonChargesPaisa += preTax;
      }
      taxPaisa += item.tax_paisa;
      chargeSum += item.total_paisa;
      splitByPayer[payer] = (splitByPayer[payer] ?? 0) + item.total_paisa;
    } else if (item.entry_side === "credit") {
      discountPaisa += item.total_paisa;
      splitByPayer[payer] = Math.max(0, (splitByPayer[payer] ?? 0) - item.total_paisa);
    } else if (item.entry_side === "payment") {
      paidPaisa += item.total_paisa;
    }
  }

  const totalChargesPaisa = Math.max(0, chargeSum - discountPaisa);
  const balanceDuePaisa = Math.max(0, totalChargesPaisa - paidPaisa);

  return {
    roomChargesPaisa,
    addonChargesPaisa,
    taxPaisa,
    discountPaisa,
    totalChargesPaisa,
    paidPaisa,
    balanceDuePaisa,
    splitByPayer,
  };
}

export function calculateHotelYieldKpis(params: {
  totalUnits: number;
  occupiedUnits: number;
  totalRoomRevenueBdt: number;
  operatingExpensesBdt?: number;
  periodDays?: number;
}): {
  occupancyRatePct: number;
  adrBdt: number;
  revParBdt: number;
  gopParBdt: number;
} {
  const days = Math.max(1, params.periodDays ?? 1);
  const totalAvailableRoomNights = Math.max(1, params.totalUnits * days);
  const soldRoomNights = Math.max(0, params.occupiedUnits * days);
  const occupancyRatePct = Math.min(
    100,
    Math.round((soldRoomNights / totalAvailableRoomNights) * 10000) / 100
  );
  const adrBdt =
    soldRoomNights > 0 ? Math.round((params.totalRoomRevenueBdt / soldRoomNights) * 100) / 100 : 0;
  const revParBdt =
    Math.round((params.totalRoomRevenueBdt / totalAvailableRoomNights) * 100) / 100;
  const grossOperatingProfit = params.totalRoomRevenueBdt - (params.operatingExpensesBdt ?? 0);
  const gopParBdt =
    Math.round((grossOperatingProfit / totalAvailableRoomNights) * 100) / 100;

  return { occupancyRatePct, adrBdt, revParBdt, gopParBdt };
}
