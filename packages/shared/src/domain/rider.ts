import { z } from "zod";

/**
 * Rider & Mobility Domain Contracts, Zod v4 Validators & Deterministic Calculators
 * Synchronized with supabase/migrations/20260623_rider_hotel_marketplace_production.sql
 */

// ============================================================================
// 1. CONSTANTS & GEOGRAPHIC GUARDRAILS
// ============================================================================

export const BANGLADESH_BBOX = {
  minLat: 20.3,
  maxLat: 26.75,
  minLng: 88.0,
  maxLng: 92.75,
} as const;

export const RIDER_PLATFORM_COMMISSION_RATE = 0.15;
export const RIDE_SURGE_CEILING = 1.25;
export const RIDER_MIN_CASHOUT_PAISA = 10000; // 100 BDT

// ============================================================================
// 2. STATUS ENUMS & SCHEMAS
// ============================================================================

export const RiderKycStatusSchema = z.enum([
  "pending",
  "submitted",
  "under_review",
  "verified",
  "rejected",
  "suspended",
]);
export type RiderKycStatus = z.infer<typeof RiderKycStatusSchema>;

export const RiderDutyStatusSchema = z.enum([
  "offline",
  "online",
  "on_trip",
  "break",
  "suspended",
]);
export type RiderDutyStatus = z.infer<typeof RiderDutyStatusSchema>;

export const VehicleModeSchema = z.enum([
  "bike",
  "cng",
  "sedan",
  "suv",
  "boat",
  "parcel_rider",
]);
export type VehicleMode = z.infer<typeof VehicleModeSchema>;

export const FuelTypeSchema = z.enum([
  "octane",
  "cng",
  "diesel",
  "electric",
  "human",
]);
export type FuelType = z.infer<typeof FuelTypeSchema>;

export const RideTypeSchema = z.enum([
  "on_demand",
  "scheduled",
  "airport_pickup",
  "hourly_rental",
  "intercity",
]);
export type RideType = z.infer<typeof RideTypeSchema>;

export const RideRequestStatusSchema = z.enum([
  "searching",
  "matched",
  "driver_en_route",
  "arrived",
  "in_progress",
  "completed",
  "cancelled",
  "expired",
]);
export type RideRequestStatus = z.infer<typeof RideRequestStatusSchema>;

export const RideTripStatusSchema = z.enum([
  "accepted",
  "arrived_pickup",
  "in_progress",
  "completed",
  "cancelled",
  "disputed",
]);
export type RideTripStatus = z.infer<typeof RideTripStatusSchema>;

export const RideSettlementStatusSchema = z.enum([
  "unsettled",
  "settled",
  "disputed",
  "refunded",
]);
export type RideSettlementStatus = z.infer<typeof RideSettlementStatusSchema>;

export const RidePaymentMethodSchema = z.enum([
  "cash",
  "wallet",
  "bkash",
  "nagad",
  "rocket",
  "card",
]);
export type RidePaymentMethod = z.infer<typeof RidePaymentMethodSchema>;

export const DeliveryTierSchema = z.enum([
  "shopno_express",
  "hotel_concierge",
  "inter_district_courier",
  "same_day",
]);
export type DeliveryTier = z.infer<typeof DeliveryTierSchema>;

export const DeliveryJobStatusSchema = z.enum([
  "open",
  "claimed",
  "en_route_pickup",
  "picked_up",
  "in_transit",
  "arrived_dropoff",
  "delivered",
  "failed",
  "cancelled",
  "returned",
]);
export type DeliveryJobStatus = z.infer<typeof DeliveryJobStatusSchema>;

export const RiderLedgerDirectionSchema = z.enum(["credit", "debit"]);
export type RiderLedgerDirection = z.infer<typeof RiderLedgerDirectionSchema>;

export const RiderLedgerEntryTypeSchema = z.enum([
  "ride_fare",
  "delivery_fee",
  "surge_bonus",
  "tip",
  "platform_commission",
  "fuel_estimate",
  "payout_hold",
  "payout_disbursed",
  "payout_reversal",
  "penalty",
  "adjustment",
]);
export type RiderLedgerEntryType = z.infer<typeof RiderLedgerEntryTypeSchema>;

export const PayoutChannelSchema = z.enum([
  "bkash",
  "nagad",
  "rocket",
  "bank_transfer",
]);
export type PayoutChannel = z.infer<typeof PayoutChannelSchema>;

export const RiderPayoutStatusSchema = z.enum([
  "requested",
  "approved",
  "processing",
  "paid",
  "failed",
  "cancelled",
]);
export type RiderPayoutStatus = z.infer<typeof RiderPayoutStatusSchema>;

// ============================================================================
// 3. ENTITY & INPUT SCHEMAS
// ============================================================================

export const BangladeshCoordsSchema = z.object({
  lat: z
    .number()
    .min(BANGLADESH_BBOX.minLat, "Latitude outside Bangladesh bounds")
    .max(BANGLADESH_BBOX.maxLat, "Latitude outside Bangladesh bounds"),
  lng: z
    .number()
    .min(BANGLADESH_BBOX.minLng, "Longitude outside Bangladesh bounds")
    .max(BANGLADESH_BBOX.maxLng, "Longitude outside Bangladesh bounds"),
});
export type BangladeshCoords = z.infer<typeof BangladeshCoordsSchema>;

export const RiderProfileSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  full_name: z.string().min(2),
  phone: z.string().min(6),
  nid_number: z.string().nullable().optional(),
  driving_license_number: z.string().nullable().optional(),
  brta_verified: z.boolean().default(false),
  kyc_status: RiderKycStatusSchema.default("pending"),
  duty_status: RiderDutyStatusSchema.default("offline"),
  active_vehicle_mode: VehicleModeSchema.default("bike"),
  active_vehicle_id: z.uuid().nullable().optional(),
  home_city: z.string().default("Dhaka"),
  service_zones: z.array(z.string()).default([]),
  current_lat: z.number().min(BANGLADESH_BBOX.minLat).max(BANGLADESH_BBOX.maxLat).nullable().optional(),
  current_lng: z.number().min(BANGLADESH_BBOX.minLng).max(BANGLADESH_BBOX.maxLng).nullable().optional(),
  current_heading: z.number().min(0).max(360).nullable().optional(),
  last_location_at: z.iso.datetime().nullable().optional(),
  rating: z.number().min(1).max(5).default(5),
  total_rides: z.int().nonnegative().default(0),
  total_deliveries: z.int().nonnegative().default(0),
  acceptance_rate: z.number().min(0).max(100).default(100),
  cancellation_rate: z.number().min(0).max(100).default(0),
  daily_goal_paisa: z.int().nonnegative().default(150000),
  emergency_contact_name: z.string().nullable().optional(),
  emergency_contact_phone: z.string().nullable().optional(),
  preferred_payout_method: PayoutChannelSchema.default("bkash"),
  payout_account_masked: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  verified_at: z.iso.datetime().nullable().optional(),
  created_at: z.iso.datetime().optional(),
  updated_at: z.iso.datetime().optional(),
});
export type RiderProfile = z.infer<typeof RiderProfileSchema>;

export const RiderVehicleSchema = z.object({
  id: z.uuid(),
  rider_id: z.uuid(),
  vehicle_mode: VehicleModeSchema,
  make_model: z.string().min(2),
  color: z.string().nullable().optional(),
  plate_number: z.string().min(3),
  registration_number: z.string().nullable().optional(),
  fitness_expiry: z.iso.date().nullable().optional(),
  insurance_expiry: z.iso.date().nullable().optional(),
  seat_capacity: z.int().min(1).max(20).default(1),
  max_cargo_kg: z.number().nonnegative().default(20),
  fuel_type: FuelTypeSchema.default("octane"),
  fuel_cost_per_km_bdt: z.number().nonnegative().default(3.5),
  is_verified: z.boolean().default(false),
  is_primary: z.boolean().default(false),
  is_active: z.boolean().default(true),
  documents: z.array(z.record(z.string(), z.unknown())).default([]),
  created_at: z.iso.datetime().optional(),
  updated_at: z.iso.datetime().optional(),
});
export type RiderVehicle = z.infer<typeof RiderVehicleSchema>;

export const RideQuoteRequestSchema = z.object({
  vehicle_mode: VehicleModeSchema,
  pickup: BangladeshCoordsSchema,
  dropoff: BangladeshCoordsSchema,
  ride_type: RideTypeSchema.default("on_demand"),
  promo_code: z.string().optional(),
});
export type RideQuoteRequest = z.infer<typeof RideQuoteRequestSchema>;

export const RideQuoteBreakdownSchema = z.object({
  vehicle_mode: VehicleModeSchema,
  distance_km: z.number().positive(),
  estimated_duration_min: z.int().positive(),
  base_fare_paisa: z.int().nonnegative(),
  distance_fare_paisa: z.int().nonnegative(),
  raw_surge_multiplier: z.number().min(1),
  applied_surge_multiplier: z.number().min(1).max(RIDE_SURGE_CEILING),
  is_surge_capped: z.boolean(),
  weather_guard_applied: z.boolean(),
  discount_paisa: z.int().nonnegative(),
  quoted_fare_paisa: z.int().nonnegative(),
  estimated_fuel_cost_paisa: z.int().nonnegative(),
  currency: z.string().default("BDT"),
});
export type RideQuoteBreakdown = z.infer<typeof RideQuoteBreakdownSchema>;

export const CreateRideRequestInputSchema = z.object({
  vehicle_mode: VehicleModeSchema,
  ride_type: RideTypeSchema.default("on_demand"),
  pickup_address: z.string().min(2),
  pickup_lat: z.number().min(BANGLADESH_BBOX.minLat).max(BANGLADESH_BBOX.maxLat),
  pickup_lng: z.number().min(BANGLADESH_BBOX.minLng).max(BANGLADESH_BBOX.maxLng),
  dropoff_address: z.string().min(2),
  dropoff_lat: z.number().min(BANGLADESH_BBOX.minLat).max(BANGLADESH_BBOX.maxLat),
  dropoff_lng: z.number().min(BANGLADESH_BBOX.minLng).max(BANGLADESH_BBOX.maxLng),
  payment_method: RidePaymentMethodSchema.default("cash"),
  promo_code: z.string().optional(),
  scheduled_for: z.iso.datetime().optional(),
  idempotency_key: z.string().min(8).optional(),
  notes: z.string().max(500).optional(),
});
export type CreateRideRequestInput = z.infer<typeof CreateRideRequestInputSchema>;

export const RideRequestSchema = CreateRideRequestInputSchema.extend({
  id: z.uuid(),
  request_reference: z.string(),
  passenger_id: z.uuid(),
  claimed_rider_id: z.uuid().nullable().optional(),
  status: RideRequestStatusSchema,
  estimated_distance_km: z.number().positive(),
  estimated_duration_min: z.int().positive(),
  base_fare_paisa: z.int().nonnegative(),
  distance_fare_paisa: z.int().nonnegative(),
  surge_multiplier: z.number().min(1).max(RIDE_SURGE_CEILING),
  weather_guard_applied: z.boolean(),
  discount_paisa: z.int().nonnegative(),
  quoted_fare_paisa: z.int().nonnegative(),
  currency: z.string().default("BDT"),
  expires_at: z.iso.datetime(),
  created_at: z.iso.datetime().optional(),
  updated_at: z.iso.datetime().optional(),
});
export type RideRequest = z.infer<typeof RideRequestSchema>;

export const RideTripSchema = z.object({
  id: z.uuid(),
  ride_request_id: z.uuid(),
  passenger_id: z.uuid(),
  rider_id: z.uuid(),
  vehicle_id: z.uuid().nullable().optional(),
  status: RideTripStatusSchema,
  otp_verified: z.boolean(),
  otp_verified_at: z.iso.datetime().nullable().optional(),
  otp_attempts: z.int().nonnegative().default(0),
  accepted_at: z.iso.datetime(),
  arrived_at: z.iso.datetime().nullable().optional(),
  started_at: z.iso.datetime().nullable().optional(),
  completed_at: z.iso.datetime().nullable().optional(),
  cancelled_at: z.iso.datetime().nullable().optional(),
  actual_distance_km: z.number().nonnegative(),
  actual_duration_min: z.int().nonnegative(),
  gross_fare_paisa: z.int().nonnegative(),
  platform_commission_paisa: z.int().nonnegative(),
  rider_net_paisa: z.int().nonnegative(),
  estimated_fuel_cost_paisa: z.int().nonnegative(),
  tip_paisa: z.int().nonnegative(),
  currency: z.string().default("BDT"),
  settlement_status: RideSettlementStatusSchema,
  settled_at: z.iso.datetime().nullable().optional(),
  sos_triggered: z.boolean().default(false),
  sos_triggered_at: z.iso.datetime().nullable().optional(),
  passenger_rating: z.number().min(1).max(5).nullable().optional(),
  rider_rating: z.number().min(1).max(5).nullable().optional(),
  created_at: z.iso.datetime().optional(),
  updated_at: z.iso.datetime().optional(),
});
export type RideTrip = z.infer<typeof RideTripSchema>;

export const RideLocationPingSchema = z.object({
  id: z.uuid().optional(),
  trip_id: z.uuid().nullable().optional(),
  delivery_job_id: z.uuid().nullable().optional(),
  rider_id: z.uuid(),
  latitude: z.number().min(BANGLADESH_BBOX.minLat).max(BANGLADESH_BBOX.maxLat),
  longitude: z.number().min(BANGLADESH_BBOX.minLng).max(BANGLADESH_BBOX.maxLng),
  accuracy_meters: z.number().nonnegative().nullable().optional(),
  speed_kmh: z.number().min(0).max(220).nullable().optional(),
  heading: z.number().min(0).max(360).nullable().optional(),
  altitude_meters: z.number().nullable().optional(),
  battery_pct: z.int().min(0).max(100).nullable().optional(),
  is_mock_location: z.boolean().default(false),
  recorded_at: z.iso.datetime().optional(),
});
export type RideLocationPing = z.infer<typeof RideLocationPingSchema>;

export const DeliveryJobSchema = z.object({
  id: z.uuid(),
  job_reference: z.string(),
  order_id: z.uuid(),
  seller_id: z.uuid(),
  buyer_id: z.uuid(),
  rider_id: z.uuid().nullable().optional(),
  batch_group_id: z.uuid().nullable().optional(),
  delivery_tier: DeliveryTierSchema,
  status: DeliveryJobStatusSchema,
  pickup_address: z.string(),
  pickup_lat: z.number().min(BANGLADESH_BBOX.minLat).max(BANGLADESH_BBOX.maxLat),
  pickup_lng: z.number().min(BANGLADESH_BBOX.minLng).max(BANGLADESH_BBOX.maxLng),
  pickup_contact_name: z.string(),
  pickup_contact_phone: z.string(),
  dropoff_address: z.string(),
  dropoff_lat: z.number().min(BANGLADESH_BBOX.minLat).max(BANGLADESH_BBOX.maxLat),
  dropoff_lng: z.number().min(BANGLADESH_BBOX.minLng).max(BANGLADESH_BBOX.maxLng),
  dropoff_contact_name: z.string(),
  dropoff_contact_phone: z.string(),
  hotel_id: z.uuid().nullable().optional(),
  hotel_room_number: z.string().nullable().optional(),
  package_weight_kg: z.number().positive(),
  package_summary: z.string(),
  is_fragile: z.boolean().default(false),
  is_perishable: z.boolean().default(false),
  estimated_distance_km: z.number().positive(),
  delivery_fee_paisa: z.int().nonnegative(),
  rider_payout_paisa: z.int().nonnegative(),
  platform_commission_paisa: z.int().nonnegative(),
  cod_amount_paisa: z.int().nonnegative().default(0),
  currency: z.string().default("BDT"),
  pickup_otp_verified_at: z.iso.datetime().nullable().optional(),
  delivery_otp_verified_at: z.iso.datetime().nullable().optional(),
  pod_photo_url: z.string().nullable().optional(),
  pod_signature_hash: z.string().nullable().optional(),
  pod_recipient_name: z.string().nullable().optional(),
  claimed_at: z.iso.datetime().nullable().optional(),
  picked_up_at: z.iso.datetime().nullable().optional(),
  delivered_at: z.iso.datetime().nullable().optional(),
  expires_at: z.iso.datetime().nullable().optional(),
  created_at: z.iso.datetime().optional(),
  updated_at: z.iso.datetime().optional(),
});
export type DeliveryJob = z.infer<typeof DeliveryJobSchema>;

export const RiderEarningsEntrySchema = z.object({
  id: z.uuid(),
  rider_id: z.uuid(),
  transaction_group: z.uuid(),
  direction: RiderLedgerDirectionSchema,
  entry_type: RiderLedgerEntryTypeSchema,
  amount_paisa: z.int().positive(),
  currency: z.string().default("BDT"),
  ride_trip_id: z.uuid().nullable().optional(),
  delivery_job_id: z.uuid().nullable().optional(),
  payout_id: z.uuid().nullable().optional(),
  memo: z.string().nullable().optional(),
  created_at: z.iso.datetime(),
});
export type RiderEarningsEntry = z.infer<typeof RiderEarningsEntrySchema>;

export const CreateRiderPayoutInputSchema = z.object({
  amount_paisa: z.int().min(RIDER_MIN_CASHOUT_PAISA, "Minimum payout is 100 BDT (10000 paisa)"),
  channel: PayoutChannelSchema,
  account_number_masked: z.string().min(4),
  idempotency_key: z.string().min(8).optional(),
});
export type CreateRiderPayoutInput = z.infer<typeof CreateRiderPayoutInputSchema>;

export const RiderPayoutSchema = CreateRiderPayoutInputSchema.extend({
  id: z.uuid(),
  rider_id: z.uuid(),
  payout_reference: z.string(),
  fee_paisa: z.int().nonnegative(),
  net_amount_paisa: z.int().positive(),
  currency: z.string().default("BDT"),
  status: RiderPayoutStatusSchema,
  gateway_reference: z.string().nullable().optional(),
  failure_reason: z.string().nullable().optional(),
  requested_at: z.iso.datetime(),
  processed_at: z.iso.datetime().nullable().optional(),
  paid_at: z.iso.datetime().nullable().optional(),
});
export type RiderPayout = z.infer<typeof RiderPayoutSchema>;

export const VerifyTripOtpInputSchema = z.object({
  target_id: z.uuid(),
  otp: z.string().regex(/^[0-9]{4,6}$/, "OTP must be 4 to 6 digits"),
  job_type: z.enum(["ride_start", "delivery_pickup", "delivery_dropoff"]).default("ride_start"),
});
export type VerifyTripOtpInput = z.infer<typeof VerifyTripOtpInputSchema>;

// ============================================================================
// 4. DETERMINISTIC CALCULATORS & VALIDATORS
// ============================================================================

export const VEHICLE_TIER_RATES: Record<
  VehicleMode,
  {
    baseFarePaisa: number;
    perKmPaisa: number;
    minFarePaisa: number;
    avgSpeedKmh: number;
    fuelCostPerKmBdt: number;
  }
> = {
  bike: {
    baseFarePaisa: 3000,
    perKmPaisa: 1200,
    minFarePaisa: 4000,
    avgSpeedKmh: 24,
    fuelCostPerKmBdt: 2.8,
  },
  cng: {
    baseFarePaisa: 5000,
    perKmPaisa: 1800,
    minFarePaisa: 6500,
    avgSpeedKmh: 20,
    fuelCostPerKmBdt: 3.4,
  },
  sedan: {
    baseFarePaisa: 8000,
    perKmPaisa: 2800,
    minFarePaisa: 12000,
    avgSpeedKmh: 22,
    fuelCostPerKmBdt: 8.5,
  },
  suv: {
    baseFarePaisa: 12000,
    perKmPaisa: 3800,
    minFarePaisa: 18000,
    avgSpeedKmh: 22,
    fuelCostPerKmBdt: 11.5,
  },
  boat: {
    baseFarePaisa: 15000,
    perKmPaisa: 4500,
    minFarePaisa: 20000,
    avgSpeedKmh: 12,
    fuelCostPerKmBdt: 14.0,
  },
  parcel_rider: {
    baseFarePaisa: 4000,
    perKmPaisa: 1000,
    minFarePaisa: 5000,
    avgSpeedKmh: 25,
    fuelCostPerKmBdt: 2.5,
  },
};

export function isWithinBangladeshBbox(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= BANGLADESH_BBOX.minLat &&
    lat <= BANGLADESH_BBOX.maxLat &&
    lng >= BANGLADESH_BBOX.minLng &&
    lng <= BANGLADESH_BBOX.maxLng
  );
}

export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusKm * c * 1000) / 1000;
}

export function validateLocationVelocity(
  prev: { lat: number; lng: number; recordedAtIso: string },
  next: { lat: number; lng: number; recordedAtIso: string },
  maxSpeedKmh: number = 160
): { valid: boolean; speedKmh: number; distanceKm: number; reason?: string } {
  if (!isWithinBangladeshBbox(next.lat, next.lng)) {
    return {
      valid: false,
      speedKmh: 0,
      distanceKm: 0,
      reason: "Coordinates outside Bangladesh service boundary",
    };
  }

  const prevMs = Date.parse(prev.recordedAtIso);
  const nextMs = Date.parse(next.recordedAtIso);
  if (!Number.isFinite(prevMs) || !Number.isFinite(nextMs) || nextMs <= prevMs) {
    return {
      valid: false,
      speedKmh: 0,
      distanceKm: 0,
      reason: "Timestamp must strictly advance",
    };
  }

  const elapsedHours = (nextMs - prevMs) / 3_600_000;
  const distanceKm = haversineDistanceKm(prev.lat, prev.lng, next.lat, next.lng);
  const speedKmh = Math.round((distanceKm / elapsedHours) * 100) / 100;

  if (speedKmh > maxSpeedKmh && distanceKm > 0.25) {
    return {
      valid: false,
      speedKmh,
      distanceKm,
      reason: `Unrealistic velocity (${speedKmh} km/h > ${maxSpeedKmh} km/h)`,
    };
  }

  return { valid: true, speedKmh, distanceKm };
}

export function calculateRideFareQuote(params: {
  vehicleMode: VehicleMode;
  distanceKm: number;
  durationMin?: number;
  surgeMultiplier?: number;
  weatherWarning?: boolean;
  discountPaisa?: number;
  fuelCostPerKmBdt?: number;
}): RideQuoteBreakdown {
  const tier = VEHICLE_TIER_RATES[params.vehicleMode];
  const distanceKm = Math.max(0.5, Math.round(params.distanceKm * 100) / 100);
  const estimatedDurationMin = Math.max(
    3,
    params.durationMin ?? Math.ceil((distanceKm / tier.avgSpeedKmh) * 60)
  );

  // Weather guard caps surge at 1.15x during adverse weather to protect travelers
  const rawSurge = Math.max(1, params.surgeMultiplier ?? 1);
  const ceiling = params.weatherWarning ? 1.15 : RIDE_SURGE_CEILING;
  const appliedSurge = Math.min(ceiling, rawSurge);
  const isSurgeCapped = rawSurge > appliedSurge;

  const baseFarePaisa = tier.baseFarePaisa;
  const distanceFarePaisa = Math.round(distanceKm * tier.perKmPaisa);
  const rawTotal = Math.max(
    tier.minFarePaisa,
    Math.round((baseFarePaisa + distanceFarePaisa) * appliedSurge)
  );
  const discountPaisa = Math.min(rawTotal, Math.max(0, Math.round(params.discountPaisa ?? 0)));
  const quotedFarePaisa = Math.max(0, rawTotal - discountPaisa);
  const fuelRate = params.fuelCostPerKmBdt ?? tier.fuelCostPerKmBdt;
  const estimatedFuelCostPaisa = Math.round(distanceKm * fuelRate * 100);

  return {
    vehicle_mode: params.vehicleMode,
    distance_km: distanceKm,
    estimated_duration_min: estimatedDurationMin,
    base_fare_paisa: baseFarePaisa,
    distance_fare_paisa: distanceFarePaisa,
    raw_surge_multiplier: rawSurge,
    applied_surge_multiplier: Math.round(appliedSurge * 100) / 100,
    is_surge_capped: isSurgeCapped,
    weather_guard_applied: Boolean(params.weatherWarning),
    discount_paisa: discountPaisa,
    quoted_fare_paisa: quotedFarePaisa,
    estimated_fuel_cost_paisa: estimatedFuelCostPaisa,
    currency: "BDT",
  };
}

export function calculateRiderNetProfit(params: {
  grossFarePaisa: number;
  tipPaisa?: number;
  commissionRate?: number;
  distanceKm: number;
  fuelCostPerKmBdt?: number;
}): {
  grossFarePaisa: number;
  commissionPaisa: number;
  tipPaisa: number;
  estimatedFuelCostPaisa: number;
  netEarningsPaisa: number;
  netProfitAfterFuelPaisa: number;
} {
  const grossFarePaisa = Math.max(0, Math.round(params.grossFarePaisa));
  const tipPaisa = Math.max(0, Math.round(params.tipPaisa ?? 0));
  const rate = params.commissionRate ?? RIDER_PLATFORM_COMMISSION_RATE;
  const commissionPaisa = Math.round(grossFarePaisa * rate);
  const estimatedFuelCostPaisa = Math.round(
    Math.max(0, params.distanceKm) * Math.max(0, params.fuelCostPerKmBdt ?? 3.5) * 100
  );
  const netEarningsPaisa = Math.max(0, grossFarePaisa - commissionPaisa) + tipPaisa;
  const netProfitAfterFuelPaisa = netEarningsPaisa - estimatedFuelCostPaisa;

  return {
    grossFarePaisa,
    commissionPaisa,
    tipPaisa,
    estimatedFuelCostPaisa,
    netEarningsPaisa,
    netProfitAfterFuelPaisa,
  };
}
