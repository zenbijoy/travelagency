import { z } from "zod";

/**
 * Shared Rider, Delivery Partner & Consumer Mobility Domain Types and Zod Schemas.
 * Aligned 1:1 with `20260623_rider_hotel_marketplace_production.sql` and `@shopnojatra/shared`.
 */

export const BANGLADESH_BBOX = {
  minLat: 20.3,
  maxLat: 26.75,
  minLng: 88.0,
  maxLng: 92.75,
} as const;

export const vehicleModeSchema = z.enum([
  "bike",
  "cng",
  "sedan",
  "suv",
  "boat",
  "parcel_rider",
]);
export type VehicleMode = z.infer<typeof vehicleModeSchema>;

export const fuelTypeSchema = z.enum([
  "octane",
  "cng",
  "diesel",
  "electric",
  "human",
]);
export type FuelType = z.infer<typeof fuelTypeSchema>;

export const dutyStatusSchema = z.enum([
  "offline",
  "online",
  "on_trip",
  "break",
  "suspended",
]);
export type DutyStatus = z.infer<typeof dutyStatusSchema>;

export const kycStatusSchema = z.enum([
  "pending",
  "submitted",
  "under_review",
  "verified",
  "rejected",
  "suspended",
]);
export type KycStatus = z.infer<typeof kycStatusSchema>;

export const rideTypeSchema = z.enum([
  "on_demand",
  "scheduled",
  "airport_pickup",
  "hourly_rental",
  "intercity",
]);
export type RideType = z.infer<typeof rideTypeSchema>;

export const rideRequestStatusSchema = z.enum([
  "searching",
  "matched",
  "driver_en_route",
  "arrived",
  "in_progress",
  "completed",
  "cancelled",
  "expired",
]);
export type RideRequestStatus = z.infer<typeof rideRequestStatusSchema>;

export const rideTripStatusSchema = z.enum([
  "accepted",
  "arrived_pickup",
  "in_progress",
  "completed",
  "cancelled",
  "disputed",
]);
export type RideTripStatus = z.infer<typeof rideTripStatusSchema>;

export const deliveryTierSchema = z.enum([
  "shopno_express",
  "hotel_concierge",
  "inter_district_courier",
  "same_day",
]);
export type DeliveryTier = z.infer<typeof deliveryTierSchema>;

export const deliveryJobStatusSchema = z.enum([
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
export type DeliveryJobStatus = z.infer<typeof deliveryJobStatusSchema>;

export const payoutChannelSchema = z.enum([
  "bkash",
  "nagad",
  "rocket",
  "bank_transfer",
]);
export type RiderPayoutChannel = z.infer<typeof payoutChannelSchema>;

export const riderPayoutStatusSchema = z.enum([
  "requested",
  "approved",
  "processing",
  "paid",
  "failed",
  "cancelled",
]);
export type RiderPayoutStatus = z.infer<typeof riderPayoutStatusSchema>;

export const ridePaymentMethodSchema = z.enum([
  "cash",
  "wallet",
  "bkash",
  "nagad",
  "rocket",
  "card",
]);
export type RidePaymentMethod = z.infer<typeof ridePaymentMethodSchema>;

export const ledgerEntryTypeSchema = z.enum([
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
export type RiderLedgerEntryType = z.infer<typeof ledgerEntryTypeSchema>;

export const bdCoordinateSchema = z.object({
  latitude: z.number().min(BANGLADESH_BBOX.minLat).max(BANGLADESH_BBOX.maxLat),
  longitude: z.number().min(BANGLADESH_BBOX.minLng).max(BANGLADESH_BBOX.maxLng),
});

export const createRideRequestSchema = z.object({
  vehicle_mode: vehicleModeSchema,
  ride_type: rideTypeSchema.default("on_demand"),
  pickup_address: z.string().min(3).max(300),
  pickup_lat: z.number().min(BANGLADESH_BBOX.minLat).max(BANGLADESH_BBOX.maxLat),
  pickup_lng: z.number().min(BANGLADESH_BBOX.minLng).max(BANGLADESH_BBOX.maxLng),
  dropoff_address: z.string().min(3).max(300),
  dropoff_lat: z.number().min(BANGLADESH_BBOX.minLat).max(BANGLADESH_BBOX.maxLat),
  dropoff_lng: z.number().min(BANGLADESH_BBOX.minLng).max(BANGLADESH_BBOX.maxLng),
  promo_code: z.string().trim().max(32).optional(),
  payment_method: ridePaymentMethodSchema.default("cash"),
  scheduled_for: z.string().optional(),
  notes: z.string().max(500).optional(),
  flight_number: z.string().max(32).optional(),
});

export const verifyOtpSchema = z.object({
  trip_id: z.string().min(1),
  otp: z
    .string()
    .trim()
    .regex(/^[0-9]{4,6}$/, "OTP must be 4 to 6 digits"),
  job_type: z.enum(["ride_start", "delivery_pickup", "delivery_dropoff"]),
});

export const podSubmitSchema = z.object({
  job_id: z.string().min(1),
  delivery_otp: z
    .string()
    .trim()
    .regex(/^[0-9]{4,6}$/, "Delivery OTP must be 4 to 6 digits"),
  recipient_name: z.string().trim().min(2, "Recipient name is required"),
  signature_svg_path: z.string().min(4, "Recipient signature is required"),
  signature_hash: z.string().min(8),
  photo_uri: z.string().optional(),
  photo_captured_at: z.string().optional(),
});

export const payoutRequestSchema = z.object({
  amount_paisa: z.number().int().min(10000, "Minimum cashout is ৳100"),
  channel: payoutChannelSchema,
  account_number: z.string().trim().min(6, "Valid account or wallet number is required").max(32),
});

export const vehicleCreateSchema = z.object({
  vehicle_mode: vehicleModeSchema,
  make_model: z.string().trim().min(2, "Make and model required"),
  color: z.string().trim().optional(),
  plate_number: z.string().trim().min(4, "BRTA plate number required"),
  registration_number: z.string().trim().optional(),
  fitness_expiry: z.string().optional(),
  insurance_expiry: z.string().optional(),
  seat_capacity: z.number().int().min(1).max(20),
  max_cargo_kg: z.number().min(0).max(2000),
  fuel_type: fuelTypeSchema,
  fuel_cost_per_km_bdt: z.number().min(0).max(100),
});

export const gpsPingSchema = z.object({
  latitude: z.number().min(BANGLADESH_BBOX.minLat).max(BANGLADESH_BBOX.maxLat),
  longitude: z.number().min(BANGLADESH_BBOX.minLng).max(BANGLADESH_BBOX.maxLng),
  accuracy_meters: z.number().min(0).optional(),
  speed_kmh: z.number().min(0).max(220).optional(),
  heading: z.number().min(0).max(360).optional(),
  battery_pct: z.number().int().min(0).max(100).optional(),
  is_mock_location: z.boolean().default(false),
});

export interface RiderProfile {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  nid_number?: string | null;
  driving_license_number?: string | null;
  brta_verified: boolean;
  kyc_status: KycStatus;
  duty_status: DutyStatus;
  active_vehicle_mode: VehicleMode;
  active_vehicle_id?: string | null;
  home_city: string;
  service_zones: string[];
  current_lat?: number | null;
  current_lng?: number | null;
  current_heading?: number | null;
  last_location_at?: string | null;
  rating: number;
  total_rides: number;
  total_deliveries: number;
  acceptance_rate: number;
  cancellation_rate: number;
  daily_goal_paisa: number;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  preferred_payout_method: RiderPayoutChannel;
  payout_account_masked?: string | null;
  avatar_url?: string | null;
  is_active: boolean;
  verified_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RiderVehicle {
  id: string;
  rider_id: string;
  vehicle_mode: VehicleMode;
  make_model: string;
  color?: string | null;
  plate_number: string;
  registration_number?: string | null;
  fitness_expiry?: string | null;
  insurance_expiry?: string | null;
  seat_capacity: number;
  max_cargo_kg: number;
  fuel_type: FuelType;
  fuel_cost_per_km_bdt: number;
  is_verified: boolean;
  is_primary: boolean;
  is_active: boolean;
  documents?: Array<{ type: string; url?: string; verified?: boolean }>;
  created_at?: string;
}

export interface RideRequest {
  id: string;
  request_reference: string;
  passenger_id: string;
  claimed_rider_id?: string | null;
  vehicle_mode: VehicleMode;
  ride_type: RideType;
  status: RideRequestStatus;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  estimated_distance_km: number;
  estimated_duration_min: number;
  base_fare_paisa: number;
  distance_fare_paisa: number;
  surge_multiplier: number;
  weather_guard_applied: boolean;
  promo_code?: string | null;
  discount_paisa: number;
  quoted_fare_paisa: number;
  currency: string;
  payment_method: RidePaymentMethod;
  scheduled_for?: string | null;
  expires_at: string;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  passenger_name?: string;
  passenger_rating?: number;
}

export interface RideTrip {
  id: string;
  ride_request_id: string;
  passenger_id: string;
  rider_id: string;
  vehicle_id?: string | null;
  status: RideTripStatus;
  otp_verified: boolean;
  otp_verified_at?: string | null;
  otp_attempts: number;
  accepted_at: string;
  arrived_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  actual_distance_km: number;
  actual_duration_min: number;
  gross_fare_paisa: number;
  platform_commission_paisa: number;
  rider_net_paisa: number;
  estimated_fuel_cost_paisa: number;
  tip_paisa: number;
  currency: string;
  settlement_status: "unsettled" | "settled" | "disputed" | "refunded";
  settled_at?: string | null;
  sos_triggered: boolean;
  passenger_rating?: number | null;
  rider_rating?: number | null;
  request?: RideRequest;
  rider_name?: string;
  rider_phone?: string;
  vehicle_plate?: string;
  start_otp_preview?: string;
}

export interface DeliveryJob {
  id: string;
  job_reference: string;
  order_id: string;
  seller_id: string;
  buyer_id: string;
  rider_id?: string | null;
  batch_group_id?: string | null;
  delivery_tier: DeliveryTier;
  status: DeliveryJobStatus;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  pickup_contact_name: string;
  pickup_contact_phone: string;
  dropoff_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_contact_name: string;
  dropoff_contact_phone: string;
  hotel_id?: string | null;
  hotel_room_number?: string | null;
  package_weight_kg: number;
  package_summary: string;
  is_fragile: boolean;
  is_perishable: boolean;
  estimated_distance_km: number;
  delivery_fee_paisa: number;
  rider_payout_paisa: number;
  platform_commission_paisa: number;
  cod_amount_paisa: number;
  currency: string;
  pickup_otp_verified_at?: string | null;
  delivery_otp_verified_at?: string | null;
  pod_photo_url?: string | null;
  pod_signature_hash?: string | null;
  pod_recipient_name?: string | null;
  claimed_at?: string | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  expires_at?: string | null;
  created_at: string;
  pickup_otp_hint?: string;
  delivery_otp_hint?: string;
}

export interface BundledDeliveryBatch {
  batchId: string;
  jobs: DeliveryJob[];
  stopCount: number;
  totalDistanceKm: number;
  totalPayoutPaisa: number;
  bonusPaisa: number;
  totalWeightKg: number;
  areaLabel: string;
}

export interface RiderLedgerEntry {
  id: string;
  rider_id: string;
  transaction_group: string;
  direction: "credit" | "debit";
  entry_type: RiderLedgerEntryType;
  amount_paisa: number;
  currency: string;
  ride_trip_id?: string | null;
  delivery_job_id?: string | null;
  payout_id?: string | null;
  memo?: string | null;
  created_at: string;
}

export interface RiderPayout {
  id: string;
  rider_id: string;
  payout_reference: string;
  amount_paisa: number;
  fee_paisa: number;
  net_amount_paisa: number;
  currency: string;
  channel: RiderPayoutChannel;
  account_number_masked: string;
  status: RiderPayoutStatus;
  gateway_reference?: string | null;
  requested_at: string;
  paid_at?: string | null;
}

export interface RideQuote {
  vehicle_mode: VehicleMode;
  distance_km: number;
  duration_min: number;
  base_fare_paisa: number;
  distance_fare_paisa: number;
  surge_multiplier: number;
  surge_paisa: number;
  weather_guard_applied: boolean;
  promo_code?: string;
  discount_paisa: number;
  quoted_fare_paisa: number;
  platform_commission_paisa: number;
  estimated_fuel_cost_paisa: number;
  rider_net_estimate_paisa: number;
  eta_minutes: number;
  currency: "BDT";
}

export interface DemandHotspotZone {
  id: string;
  name: string;
  nameBn: string;
  city: string;
  latitude: number;
  longitude: number;
  demandScore: number; // 1-100
  activeRequests: number;
  availableRiders: number;
  surgeMultiplier: number; // 1.00 - 1.25
  recommendedVehicle: VehicleMode;
  peakWindow: string;
}

export interface OfflineMapPackStatus {
  id: string;
  name: string;
  nameBn: string;
  region: string;
  bounds: [[number, number], [number, number]];
  sizeMb: number;
  version: string;
  status: "not_downloaded" | "downloading" | "cached";
  progressPct: number;
  lastSyncedAt?: string;
}

export interface LocationBreadcrumb {
  latitude: number;
  longitude: number;
  speedKmh: number;
  heading: number;
  accuracyMeters?: number;
  recordedAt: string;
}

export interface SafetyCheckInSession {
  active: boolean;
  intervalMinutes: number;
  nextCheckInAt: number | null;
  trustedContactName: string;
  trustedContactPhone: string;
  liveShareUrl: string | null;
  lastCheckInAt: number | null;
  sosActive: boolean;
  lastSosDispatchedAt: number | null;
}

export interface PODMetadata {
  jobId: string;
  deliveryOtp: string;
  recipientName: string;
  signatureSvgPath: string;
  signatureHash: string;
  photoUri?: string;
  photoCapturedAt?: string;
}

export interface NetProfitSummary {
  grossEarningsPaisa: number;
  platformCommissionPaisa: number;
  tipsPaisa: number;
  estimatedFuelCostPaisa: number;
  netTakeHomePaisa: number;
  availableForCashoutPaisa: number;
  pendingPayoutsPaisa: number;
  paidOutPaisa: number;
  dailyGoalPaisa: number;
  dailyProgressPct: number;
  todayGrossPaisa: number;
  todayNetPaisa: number;
  tripCount: number;
  deliveryCount: number;
}
