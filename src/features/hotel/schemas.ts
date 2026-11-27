import { z } from "zod";

export const roomOccupancyStatusSchema = z.enum([
  "vacant",
  "reserved",
  "occupied",
  "due_out",
  "blocked",
  "out_of_order",
]);

export const housekeepingStatusSchema = z.enum([
  "dirty",
  "cleaning",
  "inspection",
  "clean",
  "ready",
  "out_of_service",
]);

export const housekeepingTaskStatusSchema = z.enum([
  "dirty",
  "cleaning",
  "inspection",
  "ready",
  "cancelled",
]);

export const maintenanceCategorySchema = z.enum([
  "plumbing",
  "electrical",
  "hvac",
  "furniture",
  "wifi_it",
  "safety",
  "appliance",
  "other",
]);

export const maintenanceSeveritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

export const maintenanceStatusSchema = z.enum([
  "open",
  "assigned",
  "in_progress",
  "parts_pending",
  "resolved",
  "closed",
]);

export const folioItemTypeSchema = z.enum([
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

export const expressCheckInInputSchema = z.object({
  hotelId: z.string().min(1),
  bookingReference: z.string().trim().min(3, "Booking reference is required"),
  roomUnitId: z.string().min(1).optional(),
  nidOrPassportVerified: z.boolean().default(true),
  nidOrPassportNumber: z.string().trim().optional(),
  wifiSsid: z.string().trim().min(2).default("ShopnoJatra-Guest-5G"),
  wifiPassword: z.string().trim().min(4).optional(),
});

export const folioChargeInputSchema = z.object({
  folioId: z.string().min(1),
  itemType: folioItemTypeSchema,
  description: z.string().trim().min(2, "Description is required"),
  quantity: z.number().int().min(1).max(100),
  unitAmountBdt: z.number().positive("Amount must be greater than zero"),
  applyTax: z.boolean().default(true),
  entrySide: z.enum(["charge", "payment", "credit"]).default("charge"),
  payerLabel: z.string().trim().min(1).default("primary_guest"),
  referenceId: z.string().optional(),
});

export const rateRuleInputSchema = z.object({
  hotelId: z.string().min(1),
  roomTypeId: z.string().nullable().optional(),
  ruleName: z.string().trim().min(2, "Rule name is required"),
  ruleType: z.enum([
    "occupancy_surge",
    "weekend",
    "seasonal",
    "flash_deal",
    "early_bird",
    "last_minute",
    "length_of_stay",
  ]),
  priority: z.number().int().min(1).max(1000).default(100),
  multiplier: z.number().min(0.4).max(1.25),
  flatAdjustmentBdt: z.number().min(-5000).max(5000).default(0),
  minOccupancyPct: z.number().min(0).max(100).nullable().optional(),
  maxOccupancyPct: z.number().min(0).max(100).nullable().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  minNights: z.number().int().min(1).nullable().optional(),
  isFlashDeal: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const maintenanceTicketInputSchema = z.object({
  hotelId: z.string().min(1),
  roomUnitId: z.string().nullable().optional(),
  roomNumber: z.string().optional(),
  category: maintenanceCategorySchema,
  severity: maintenanceSeveritySchema,
  title: z.string().trim().min(3, "Issue title is required"),
  description: z.string().trim().optional(),
  blocksRoomSale: z.boolean().default(false),
  estimatedCostBdt: z.number().min(0).default(0),
  assignedStaffId: z.string().nullable().optional(),
  assignedStaffName: z.string().optional(),
});

export const payoutRequestInputSchema = z.object({
  hotelId: z.string().min(1),
  amountBdt: z.number().positive("Withdrawal amount must be positive"),
  method: z.enum(["bkash", "nagad", "bank_transfer"]),
  accountRef: z.string().trim().min(4, "Account reference is required"),
});

export const roomUpsertInputSchema = z.object({
  hotelId: z.string().min(1),
  roomNumber: z.string().trim().min(1, "Room number is required"),
  roomTypeName: z.string().trim().min(1, "Room type is required"),
  floorNumber: z.number().int().min(0).max(100),
  baseNightlyRateBdt: z.number().positive("Nightly rate must be positive"),
  maxGuests: z.number().int().min(1).max(20).default(2),
  amenities: z.array(z.string()).default([]),
  photos: z.array(z.string()).max(10).default([]),
  dynamicPricingEnabled: z.boolean().default(true),
  isVipRoom: z.boolean().default(false),
});

export const consumerStayCheckoutSchema = z.object({
  hotelId: z.string().min(1),
  checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(16),
  children: z.number().int().min(0).max(12),
  selectedAddonIds: z.array(z.string()).default([]),
  redeemedLoyaltyPoints: z.number().int().min(0).default(0),
  promoCode: z.string().trim().optional(),
});

export type ExpressCheckInInput = z.infer<typeof expressCheckInInputSchema>;
export type FolioChargeInput = z.infer<typeof folioChargeInputSchema>;
export type RateRuleInput = z.infer<typeof rateRuleInputSchema>;
export type MaintenanceTicketInput = z.infer<typeof maintenanceTicketInputSchema>;
export type PayoutRequestInput = z.infer<typeof payoutRequestInputSchema>;
export type RoomUpsertInput = z.infer<typeof roomUpsertInputSchema>;
export type ConsumerStayCheckoutInput = z.infer<typeof consumerStayCheckoutSchema>;
