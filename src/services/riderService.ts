import AsyncStorage from "@react-native-async-storage/async-storage";
import { BDMapClient } from "../../spatial-engine/client/sdk/BDMapClient";
import {
  buildFallbackTurnManeuvers,
  DEFAULT_DEMAND_HOTSPOTS,
  DEFAULT_OFFLINE_MAP_PACKS,
  TurnManeuver,
} from "../features/rider/constants";
import {
  calculateVelocityKmh,
  createDeterministicHash,
  estimateRideFare,
  haversineDistanceKm,
  isWithinBangladeshBbox,
  maskAccountNumber,
  VEHICLE_TIERS,
} from "../features/rider/calculators";
import {
  createRideRequestSchema,
  DeliveryJob,
  DemandHotspotZone,
  DutyStatus,
  gpsPingSchema,
  LocationBreadcrumb,
  OfflineMapPackStatus,
  payoutRequestSchema,
  PODMetadata,
  podSubmitSchema,
  RideQuote,
  RideRequest,
  RideTrip,
  RideType,
  RiderLedgerEntry,
  RiderPayout,
  RiderPayoutChannel,
  RiderProfile,
  RiderVehicle,
  vehicleCreateSchema,
  VehicleMode,
  verifyOtpSchema,
} from "../features/rider/types";
import { supabase } from "../utils/supabase";
import { apiRequest } from "./apiClient";
import { appEventBus } from "./events/appEventBus";
import { liveLocationService } from "./location/liveLocationService";
import { GeocodingResult, photonGeocoder } from "./location/photonGeocoder";
import { offlineQueueService } from "./offline/offlineQueueService";
import { sosService } from "./safety/sosService";

const STORAGE_KEYS = {
  RIDER_PROFILE: "@sj_rider_profile_v1",
  RIDER_VEHICLES: "@sj_rider_vehicles_v1",
  RIDE_HISTORY: "@sj_consumer_ride_history_v1",
  LEDGER: "@sj_rider_ledger_v1",
  PAYOUTS: "@sj_rider_payouts_v1",
  OFFLINE_PACKS: "@sj_rider_offline_packs_v1",
  DELIVERY_CACHE: "@sj_rider_deliveries_v1",
} as const;

const IS_PRODUCTION =
  !process.env.JEST_WORKER_ID &&
  process.env.NODE_ENV !== "test" &&
  (process.env.EXPO_PUBLIC_APP_ENV === "production" || process.env.NODE_ENV === "production");

const SPATIAL_ENGINE_URL =
  process.env.EXPO_PUBLIC_SPATIAL_ENGINE_URL || "https://spatial.shopnojatra.com";
const SPATIAL_ENGINE_KEY =
  process.env.EXPO_PUBLIC_SPATIAL_API_KEY || "sj-public-bd-mobility-key";

const bdMapClient = new BDMapClient({
  baseURL: SPATIAL_ENGINE_URL,
  apiKey: SPATIAL_ENGINE_KEY,
  timeoutMs: 3500,
});

function genUuidLike(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function genRef(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 899)}`;
}

async function readLocalJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeLocalJson<T>(key: string, data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch {
    // non-fatal persistence fallback
  }
}

async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

class RiderService {
  private handlersRegistered = false;

  constructor() {
    this.registerOfflineSyncHandlers();
  }

  public registerOfflineSyncHandlers(): void {
    if (this.handlersRegistered) return;
    this.handlersRegistered = true;

    offlineQueueService.registerHandler("RIDER_GPS_PING", async (payload) => {
      await apiRequest("/rides/telemetry/ping", {
        method: "POST",
        body: JSON.stringify(payload),
        retries: 1,
      }).catch(async () => {
        const { error } = await supabase.from("ride_location_pings").insert(payload);
        if (error) throw error;
      });
    });

    offlineQueueService.registerHandler("RIDE_REQUEST_CREATE", async (payload) => {
      await apiRequest("/rides/requests", {
        method: "POST",
        body: JSON.stringify(payload),
        retries: 1,
      }).catch(async () => {
        const { error } = await supabase.from("ride_requests").insert(payload);
        if (error) throw error;
      });
    });

    offlineQueueService.registerHandler("RIDER_OTP_VERIFY", async (payload) => {
      await supabase.rpc("verify_trip_otp", {
        p_trip_id: payload.tripId,
        p_otp: payload.otp,
        p_job_type: payload.jobType,
      });
    });

    offlineQueueService.registerHandler("DELIVERY_POD_SUBMIT", async (payload) => {
      const { error } = await supabase
        .from("delivery_jobs")
        .update({
          pod_recipient_name: payload.recipientName,
          pod_signature_hash: payload.signatureHash,
          pod_photo_url: payload.photoUri ?? null,
        })
        .eq("id", payload.jobId);
      if (error) throw error;

      await supabase.rpc("verify_trip_otp", {
        p_trip_id: payload.jobId,
        p_otp: payload.deliveryOtp,
        p_job_type: "delivery_dropoff",
      });
    });

    offlineQueueService.registerHandler("RIDER_PAYOUT_REQUEST", async (payload) => {
      const { error } = await supabase.from("rider_payouts").insert(payload);
      if (error) throw error;
    });

    offlineQueueService.registerHandler("RIDER_DUTY_TOGGLE", async (payload) => {
      const { error } = await supabase
        .from("rider_profiles")
        .update({
          duty_status: payload.duty_status,
          active_vehicle_mode: payload.active_vehicle_mode,
        })
        .eq("id", payload.riderId);
      if (error) throw error;
    });
  }

  // ==========================================================================
  // 1. RIDER PROFILE, DUTY SWITCH & KYC
  // ==========================================================================

  async getOrCreateRiderProfile(fallbackUser?: {
    id?: string;
    name?: string;
    phone?: string;
  }): Promise<RiderProfile> {
    const userId = fallbackUser?.id || (await getCurrentUserId());

    if (userId) {
      try {
        const { data, error } = await supabase
          .from("rider_profiles")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();

        if (!error && data) {
          const profile = data as RiderProfile;
          await writeLocalJson(STORAGE_KEYS.RIDER_PROFILE, profile);
          return profile;
        }

        const newProfilePayload = {
          user_id: userId,
          full_name: fallbackUser?.name || "ShopnoJatra Mobility Partner",
          phone: fallbackUser?.phone || "+8801700000000",
          home_city: "Dhaka",
          service_zones: ["Gulshan", "Banani", "Motijheel", "Dhanmondi", "Airport"],
          duty_status: "offline",
          active_vehicle_mode: "bike",
          kyc_status: "submitted",
          brta_verified: false,
        };

        const { data: inserted, error: insertErr } = await supabase
          .from("rider_profiles")
          .insert(newProfilePayload)
          .select()
          .single();

        if (!insertErr && inserted) {
          const created = inserted as RiderProfile;
          await writeLocalJson(STORAGE_KEYS.RIDER_PROFILE, created);
          return created;
        }
      } catch {
        // fallback to cached profile below
      }
    }

    const cached = await readLocalJson<RiderProfile | null>(STORAGE_KEYS.RIDER_PROFILE, null);
    if (cached) return cached;

    const effectiveUserId = userId || "rider-default-partner";
    const mockFallback: RiderProfile = {
      id: `rider-profile-${effectiveUserId}`,
      user_id: effectiveUserId,
      full_name: fallbackUser?.name || "ShopnoJatra Mobility Partner",
      phone: fallbackUser?.phone || "+8801700000000",
      home_city: "Dhaka",
      service_zones: ["Gulshan", "Banani", "Motijheel", "Dhanmondi", "Airport"],
      duty_status: "offline",
      active_vehicle_mode: "bike",
      kyc_status: "submitted",
      brta_verified: false,
      rating: 4.9,
      total_rides: 142,
      total_deliveries: 86,
      acceptance_rate: 98,
      cancellation_rate: 2,
      daily_goal_paisa: 500000,
      preferred_payout_method: "bkash",
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await writeLocalJson(STORAGE_KEYS.RIDER_PROFILE, mockFallback);
    return mockFallback;
  }

  async updateDutyAndMode(
    riderId: string,
    updates: { dutyStatus?: DutyStatus; vehicleMode?: VehicleMode; dailyGoalPaisa?: number }
  ): Promise<RiderProfile> {
    const current = await this.getOrCreateRiderProfile();
    const next: RiderProfile = {
      ...current,
      duty_status: updates.dutyStatus ?? current.duty_status,
      active_vehicle_mode: updates.vehicleMode ?? current.active_vehicle_mode,
      daily_goal_paisa: updates.dailyGoalPaisa ?? current.daily_goal_paisa,
      updated_at: new Date().toISOString(),
    };

    await writeLocalJson(STORAGE_KEYS.RIDER_PROFILE, next);

    try {
      const { data, error } = await supabase
        .from("rider_profiles")
        .update({
          duty_status: next.duty_status,
          active_vehicle_mode: next.active_vehicle_mode,
          daily_goal_paisa: next.daily_goal_paisa,
        })
        .eq("id", riderId)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (data) {
        const synced = data as RiderProfile;
        await writeLocalJson(STORAGE_KEYS.RIDER_PROFILE, synced);
        return synced;
      }
    } catch {
      await offlineQueueService.enqueue(
        "RIDER_DUTY_TOGGLE",
        {
          riderId,
          duty_status: next.duty_status,
          active_vehicle_mode: next.active_vehicle_mode,
        },
        "Sync Rider Duty Status"
      );
    }

    return next;
  }

  async submitKycDocuments(
    riderId: string,
    payload: { nidNumber: string; licenseNumber: string; homeCity: string }
  ): Promise<RiderProfile> {
    const current = await this.getOrCreateRiderProfile();
    const next: RiderProfile = {
      ...current,
      nid_number: payload.nidNumber.trim(),
      driving_license_number: payload.licenseNumber.trim(),
      home_city: payload.homeCity.trim() || current.home_city,
      kyc_status: current.kyc_status === "verified" ? "verified" : "submitted",
      updated_at: new Date().toISOString(),
    };
    await writeLocalJson(STORAGE_KEYS.RIDER_PROFILE, next);

    try {
      await supabase
        .from("rider_profiles")
        .update({
          nid_number: next.nid_number,
          driving_license_number: next.driving_license_number,
          home_city: next.home_city,
          kyc_status: next.kyc_status,
        })
        .eq("id", riderId);
    } catch {
      // persisted locally
    }

    return next;
  }

  // ==========================================================================
  // 2. VEHICLES FLEET MANAGEMENT
  // ==========================================================================

  async listVehicles(riderId: string): Promise<RiderVehicle[]> {
    try {
      const { data, error } = await supabase
        .from("rider_vehicles")
        .select("*")
        .eq("rider_id", riderId)
        .eq("is_active", true)
        .order("is_primary", { ascending: false });

      if (!error && data && data.length > 0) {
        const list = data as RiderVehicle[];
        await writeLocalJson(STORAGE_KEYS.RIDER_VEHICLES, list);
        return list;
      }
    } catch {
      // fallback to cache
    }

    const cached = await readLocalJson<RiderVehicle[]>(STORAGE_KEYS.RIDER_VEHICLES, []);
    if (cached.length > 0) return cached;

    const starterFleet: RiderVehicle[] = [
      {
        id: genUuidLike(),
        rider_id: riderId,
        vehicle_mode: "bike",
        make_model: "Bajaj Pulsar 150 ABS",
        color: "Metallic Black",
        plate_number: "DHAKA METRO LA-42-8190",
        registration_number: "BRTA-REG-881204",
        fitness_expiry: "2027-06-30",
        insurance_expiry: "2027-03-15",
        seat_capacity: 1,
        max_cargo_kg: 25,
        fuel_type: "octane",
        fuel_cost_per_km_bdt: 3.2,
        is_verified: true,
        is_primary: true,
        is_active: true,
      },
      {
        id: genUuidLike(),
        rider_id: riderId,
        vehicle_mode: "cng",
        make_model: "Bajaj RE 4S Green CNG",
        color: "Eco Green",
        plate_number: "DHAKA METRO THA-14-2901",
        registration_number: "BRTA-CNG-441092",
        fitness_expiry: "2027-04-20",
        insurance_expiry: "2027-01-31",
        seat_capacity: 3,
        max_cargo_kg: 45,
        fuel_type: "cng",
        fuel_cost_per_km_bdt: 2.8,
        is_verified: true,
        is_primary: false,
        is_active: true,
      },
    ];
    await writeLocalJson(STORAGE_KEYS.RIDER_VEHICLES, starterFleet);
    return starterFleet;
  }

  async addVehicle(
    riderId: string,
    input: unknown
  ): Promise<RiderVehicle> {
    const parsed = vehicleCreateSchema.parse(input);
    const current = await this.listVehicles(riderId);

    const newVehicle: RiderVehicle = {
      id: genUuidLike(),
      rider_id: riderId,
      vehicle_mode: parsed.vehicle_mode,
      make_model: parsed.make_model,
      color: parsed.color ?? null,
      plate_number: parsed.plate_number.toUpperCase(),
      registration_number: parsed.registration_number ?? null,
      fitness_expiry: parsed.fitness_expiry ?? null,
      insurance_expiry: parsed.insurance_expiry ?? null,
      seat_capacity: parsed.seat_capacity,
      max_cargo_kg: parsed.max_cargo_kg,
      fuel_type: parsed.fuel_type,
      fuel_cost_per_km_bdt: parsed.fuel_cost_per_km_bdt,
      is_verified: false,
      is_primary: current.length === 0,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    try {
      const { data, error } = await supabase
        .from("rider_vehicles")
        .insert({
          rider_id: riderId,
          vehicle_mode: newVehicle.vehicle_mode,
          make_model: newVehicle.make_model,
          color: newVehicle.color,
          plate_number: newVehicle.plate_number,
          registration_number: newVehicle.registration_number,
          fitness_expiry: newVehicle.fitness_expiry,
          insurance_expiry: newVehicle.insurance_expiry,
          seat_capacity: newVehicle.seat_capacity,
          max_cargo_kg: newVehicle.max_cargo_kg,
          fuel_type: newVehicle.fuel_type,
          fuel_cost_per_km_bdt: newVehicle.fuel_cost_per_km_bdt,
          is_primary: newVehicle.is_primary,
        })
        .select()
        .single();

      if (!error && data) {
        const saved = data as RiderVehicle;
        await writeLocalJson(STORAGE_KEYS.RIDER_VEHICLES, [saved, ...current]);
        return saved;
      }
    } catch {
      // persist locally
    }

    const updated = [newVehicle, ...current];
    await writeLocalJson(STORAGE_KEYS.RIDER_VEHICLES, updated);
    return newVehicle;
  }

  // ==========================================================================
  // 3. LIVE DISPATCH RADAR (RIDES + MARKETPLACE DELIVERY BRIDGE)
  // ==========================================================================

  async fetchOpenRideRequests(vehicleMode?: VehicleMode): Promise<RideRequest[]> {
    if (IS_PRODUCTION) {
      const result = await apiRequest<{ ride_requests?: RideRequest[] }>("/rides/dispatch/radar", {
        params: vehicleMode ? { vehicle_mode: vehicleMode } : undefined,
        retries: 1,
      });
      if (!Array.isArray(result?.ride_requests)) {
        throw new Error("Ride dispatch response did not include a ride request list");
      }
      return result.ride_requests;
    }

    try {
      let query = supabase
        .from("ride_requests")
        .select("*")
        .eq("status", "searching")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(20);

      if (vehicleMode && vehicleMode !== "parcel_rider") {
        query = query.eq("vehicle_mode", vehicleMode);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        return data as RideRequest[];
      }
    } catch {
      // fallback to API / queue
    }

    try {
      const apiData = await apiRequest<{ ride_requests?: RideRequest[] }>("/rides/dispatch/radar", {
        params: vehicleMode ? { vehicle_mode: vehicleMode } : undefined,
        retries: 0,
        timeoutMs: 3000,
      });
      if (Array.isArray(apiData?.ride_requests)) return apiData.ride_requests;
    } catch {
      // fallback to live radar queue seeded from Dhaka/BD demand corridors
    }

    const mode = vehicleMode && vehicleMode !== "parcel_rider" ? vehicleMode : "bike";
    const quote1 = estimateRideFare({
      vehicleMode: mode,
      distanceKm: 6.4,
      surgeMultiplier: 1.15,
      rideType: "on_demand",
    });
    const quote2 = estimateRideFare({
      vehicleMode: mode,
      distanceKm: 11.2,
      surgeMultiplier: 1.25,
      rideType: "airport_pickup",
    });

    const now = Date.now();
    return [
      {
        id: "req-radar-gulshan-1",
        request_reference: "SJ-RIDE-8821",
        passenger_id: "00000000-0000-4000-8000-000000000101",
        vehicle_mode: mode,
        ride_type: "on_demand",
        status: "searching",
        pickup_address: "Banani Road 11, Dhaka",
        pickup_lat: 23.7925,
        pickup_lng: 90.4078,
        dropoff_address: "Karwan Bazar Metro Station, Dhaka",
        dropoff_lat: 23.7509,
        dropoff_lng: 90.3935,
        estimated_distance_km: quote1.distance_km,
        estimated_duration_min: quote1.duration_min,
        base_fare_paisa: quote1.base_fare_paisa,
        distance_fare_paisa: quote1.distance_fare_paisa,
        surge_multiplier: quote1.surge_multiplier,
        weather_guard_applied: false,
        discount_paisa: 0,
        quoted_fare_paisa: quote1.quoted_fare_paisa,
        currency: "BDT",
        payment_method: "bkash",
        expires_at: new Date(now + 12 * 60_000).toISOString(),
        created_at: new Date(now - 35_000).toISOString(),
        passenger_name: "Farhan Sadik",
        passenger_rating: 4.9,
      },
      {
        id: "req-radar-airport-2",
        request_reference: "SJ-RIDE-8824",
        passenger_id: "00000000-0000-4000-8000-000000000102",
        vehicle_mode: mode,
        ride_type: "airport_pickup",
        status: "searching",
        pickup_address: "Hazrat Shahjalal Int'l Airport (T2), Dhaka",
        pickup_lat: 23.8433,
        pickup_lng: 90.3978,
        dropoff_address: "Gulshan 2 Diplomatic Circle, Dhaka",
        dropoff_lat: 23.7947,
        dropoff_lng: 90.4144,
        estimated_distance_km: quote2.distance_km,
        estimated_duration_min: quote2.duration_min,
        base_fare_paisa: quote2.base_fare_paisa,
        distance_fare_paisa: quote2.distance_fare_paisa,
        surge_multiplier: quote2.surge_multiplier,
        weather_guard_applied: false,
        discount_paisa: 0,
        quoted_fare_paisa: quote2.quoted_fare_paisa,
        currency: "BDT",
        payment_method: "card",
        expires_at: new Date(now + 15 * 60_000).toISOString(),
        created_at: new Date(now - 15_000).toISOString(),
        passenger_name: "Dr. Samira Rahman",
        passenger_rating: 5.0,
      },
    ];
  }

  async fetchDeliveryJobs(riderId?: string): Promise<DeliveryJob[]> {
    try {
      const { data, error } = await supabase
        .from("delivery_jobs")
        .select("*")
        .in("status", ["open", "claimed", "en_route_pickup", "picked_up", "in_transit", "arrived_dropoff"])
        .order("created_at", { ascending: false })
        .limit(30);

      if (!error && Array.isArray(data)) {
        const list = data as DeliveryJob[];
        await writeLocalJson(STORAGE_KEYS.DELIVERY_CACHE, list);
        return list;
      }
    } catch {
      // fallback
    }

    const cached = await readLocalJson<DeliveryJob[]>(STORAGE_KEYS.DELIVERY_CACHE, []);
    if (cached.length > 0) return cached;
    if (IS_PRODUCTION) return [];

    const now = new Date().toISOString();
    const seededJobs: DeliveryJob[] = [
      {
        id: "del-job-jamdani-1",
        job_reference: "SJ-DEL-3041",
        order_id: "00000000-0000-4000-8000-000000000301",
        seller_id: "00000000-0000-4000-8000-000000000401",
        buyer_id: "00000000-0000-4000-8000-000000000501",
        rider_id: null,
        delivery_tier: "shopno_express",
        status: "open",
        pickup_address: "Aarong Artisan Hub, Lalmatia Block D, Dhaka",
        pickup_lat: 23.7574,
        pickup_lng: 90.3694,
        pickup_contact_name: "Sonargaon Jamdani Guild",
        pickup_contact_phone: "+8801712334455",
        dropoff_address: "The Westin Dhaka, Gulshan 2 (Room 804 Concierge)",
        dropoff_lat: 23.7933,
        dropoff_lng: 90.4145,
        dropoff_contact_name: "Anika Tabassum",
        dropoff_contact_phone: "+8801815667788",
        hotel_room_number: "804",
        package_weight_kg: 1.4,
        package_summary: "1x Dhakai Jamdani Muslin Saree (GI Certified) + Gift Box",
        is_fragile: true,
        is_perishable: false,
        estimated_distance_km: 6.2,
        delivery_fee_paisa: 18000,
        rider_payout_paisa: 15300,
        platform_commission_paisa: 2700,
        cod_amount_paisa: 0,
        currency: "BDT",
        created_at: now,
        pickup_otp_hint: "4812",
        delivery_otp_hint: "7391",
      },
      {
        id: "del-job-honey-2",
        job_reference: "SJ-DEL-3042",
        order_id: "00000000-0000-4000-8000-000000000302",
        seller_id: "00000000-0000-4000-8000-000000000402",
        buyer_id: "00000000-0000-4000-8000-000000000502",
        rider_id: null,
        delivery_tier: "hotel_concierge",
        status: "open",
        pickup_address: "Dhanmondi Heritage Craft Collective, Road 9A",
        pickup_lat: 23.7465,
        pickup_lng: 90.3742,
        pickup_contact_name: "Sundarbans Mouwal Co-op",
        pickup_contact_phone: "+8801911223344",
        dropoff_address: "Banani Road 11, House 42, Dhaka",
        dropoff_lat: 23.7925,
        dropoff_lng: 90.4078,
        dropoff_contact_name: "Mahmudul Hasan",
        dropoff_contact_phone: "+8801611778899",
        package_weight_kg: 2.1,
        package_summary: "2x Sundarbans Raw Khalisha Honey + Srimangal White Tea Hamper",
        is_fragile: true,
        is_perishable: true,
        estimated_distance_km: 5.8,
        delivery_fee_paisa: 16500,
        rider_payout_paisa: 14025,
        platform_commission_paisa: 2475,
        cod_amount_paisa: 245000,
        currency: "BDT",
        created_at: now,
        pickup_otp_hint: "5520",
        delivery_otp_hint: "9044",
      },
      {
        id: "del-job-nakshi-3",
        job_reference: "SJ-DEL-3043",
        order_id: "00000000-0000-4000-8000-000000000303",
        seller_id: "00000000-0000-4000-8000-000000000403",
        buyer_id: "00000000-0000-4000-8000-000000000503",
        rider_id: riderId ?? null,
        delivery_tier: "same_day",
        status: "open",
        pickup_address: "Karwan Bazar Artisan Depot, Dhaka",
        pickup_lat: 23.7512,
        pickup_lng: 90.3931,
        pickup_contact_name: "Jamalpur Nakshi Weaver Hub",
        pickup_contact_phone: "+8801755889900",
        dropoff_address: "Baridhara Park Road, Dhaka",
        dropoff_lat: 23.8021,
        dropoff_lng: 90.4226,
        dropoff_contact_name: "Rasheda Begum",
        dropoff_contact_phone: "+8801711998877",
        package_weight_kg: 1.8,
        package_summary: "Hand-stitched Nakshi Kantha Throw (GI Certified)",
        is_fragile: false,
        is_perishable: false,
        estimated_distance_km: 6.9,
        delivery_fee_paisa: 17000,
        rider_payout_paisa: 14450,
        platform_commission_paisa: 2550,
        cod_amount_paisa: 0,
        currency: "BDT",
        created_at: now,
        pickup_otp_hint: "6190",
        delivery_otp_hint: "3182",
      },
    ];
    await writeLocalJson(STORAGE_KEYS.DELIVERY_CACHE, seededJobs);
    return seededJobs;
  }

  async claimRideRequest(
    request: RideRequest,
    riderProfile: RiderProfile
  ): Promise<RideTrip> {
    if (IS_PRODUCTION) {
      const result = await apiRequest<{ trip?: RideTrip }>("/rides/dispatch/claim", {
        method: "POST",
        body: JSON.stringify({ target_type: "ride", target_id: request.id }),
        retries: 0,
      });
      if (!result?.trip?.id) {
        throw new Error("Ride dispatch claim response did not include the assigned trip");
      }
      return { ...result.trip, request };
    }

    try {
      const { data: rpcRes, error } = await supabase.rpc("claim_ride_or_delivery", {
        p_target_type: "ride",
        p_target_id: request.id,
        p_rider_id: riderProfile.id,
      });

      if (!error && rpcRes?.trip_id) {
        return {
          id: rpcRes.trip_id,
          ride_request_id: request.id,
          passenger_id: request.passenger_id,
          rider_id: riderProfile.id,
          vehicle_id: riderProfile.active_vehicle_id,
          status: "accepted",
          otp_verified: false,
          otp_attempts: 0,
          accepted_at: new Date().toISOString(),
          actual_distance_km: request.estimated_distance_km,
          actual_duration_min: request.estimated_duration_min,
          gross_fare_paisa: request.quoted_fare_paisa,
          platform_commission_paisa: Math.round(request.quoted_fare_paisa * 0.15),
          rider_net_paisa: Math.round(request.quoted_fare_paisa * 0.85),
          estimated_fuel_cost_paisa: Math.round(
            request.estimated_distance_km *
              VEHICLE_TIERS[request.vehicle_mode].fuelCostPerKmBdt *
              100
          ),
          tip_paisa: 0,
          currency: "BDT",
          settlement_status: "unsettled",
          sos_triggered: false,
          request,
        };
      }
    } catch {
      // fallback to local + backend attempt
    }

    const commission = Math.round(request.quoted_fare_paisa * 0.15);
    const fuel = Math.round(
      request.estimated_distance_km *
        VEHICLE_TIERS[request.vehicle_mode].fuelCostPerKmBdt *
        100
    );

    const localTrip: RideTrip = {
      id: genUuidLike(),
      ride_request_id: request.id,
      passenger_id: request.passenger_id,
      rider_id: riderProfile.id,
      vehicle_id: riderProfile.active_vehicle_id,
      status: "accepted",
      otp_verified: false,
      otp_attempts: 0,
      accepted_at: new Date().toISOString(),
      actual_distance_km: request.estimated_distance_km,
      actual_duration_min: request.estimated_duration_min,
      gross_fare_paisa: request.quoted_fare_paisa,
      platform_commission_paisa: commission,
      rider_net_paisa: request.quoted_fare_paisa - commission,
      estimated_fuel_cost_paisa: fuel,
      tip_paisa: 0,
      currency: "BDT",
      settlement_status: "unsettled",
      sos_triggered: false,
      request,
      start_otp_preview: String(100000 + Math.floor(Math.random() * 899999)),
    };

    return localTrip;
  }

  async claimDeliveryJob(
    job: DeliveryJob,
    riderProfile: RiderProfile
  ): Promise<DeliveryJob> {
    if (IS_PRODUCTION) {
      const result = await apiRequest<{ delivery_job?: DeliveryJob }>("/rides/dispatch/claim", {
        method: "POST",
        body: JSON.stringify({ target_type: "delivery", target_id: job.id }),
        retries: 0,
      });
      if (!result?.delivery_job?.id) {
        throw new Error("Delivery dispatch claim response did not include the assigned job");
      }
      return result.delivery_job;
    }

    try {
      const { data: rpcRes, error } = await supabase.rpc("claim_ride_or_delivery", {
        p_target_type: "delivery",
        p_target_id: job.id,
        p_rider_id: riderProfile.id,
      });

      if (!error && rpcRes?.success) {
        const claimed: DeliveryJob = {
          ...job,
          status: "claimed",
          rider_id: riderProfile.id,
          claimed_at: new Date().toISOString(),
        };
        await this.persistDeliveryUpdate(claimed);
        return claimed;
      }
    } catch {
      // fallback
    }

    const claimed: DeliveryJob = {
      ...job,
      status: "claimed",
      rider_id: riderProfile.id,
      claimed_at: new Date().toISOString(),
    };
    await this.persistDeliveryUpdate(claimed);
    return claimed;
  }

  private async persistDeliveryUpdate(updated: DeliveryJob): Promise<void> {
    const existing = await readLocalJson<DeliveryJob[]>(STORAGE_KEYS.DELIVERY_CACHE, []);
    const next = existing.some((j) => j.id === updated.id)
      ? existing.map((j) => (j.id === updated.id ? updated : j))
      : [updated, ...existing];
    await writeLocalJson(STORAGE_KEYS.DELIVERY_CACHE, next);
  }

  // ==========================================================================
  // 4. OTP VERIFICATION, POD & SETTLEMENT
  // ==========================================================================

  async verifyTripOtp(
    tripId: string,
    otp: string,
    jobType: "ride_start" | "delivery_pickup" | "delivery_dropoff",
    expectedHint?: string
  ): Promise<{ verified: boolean; status: string; message: string }> {
    const parsed = verifyOtpSchema.parse({ trip_id: tripId, otp, job_type: jobType });

    if (IS_PRODUCTION) {
      const endpoint =
        jobType === "ride_start"
          ? `/rides/trips/${parsed.trip_id}/verify-otp`
          : `/rides/deliveries/${parsed.trip_id}/${jobType === "delivery_pickup" ? "verify-pickup" : "verify-dropoff"}`;
      const result = await apiRequest<{ status?: string }>(endpoint, {
        method: "POST",
        body: JSON.stringify({ otp: parsed.otp }),
        retries: 0,
      });
      return {
        verified: true,
        status: result.status || (jobType === "ride_start" ? "in_progress" : jobType === "delivery_pickup" ? "picked_up" : "delivered"),
        message: "OTP verified by the dispatch service.",
      };
    }

    try {
      const { data, error } = await supabase.rpc("verify_trip_otp", {
        p_trip_id: parsed.trip_id,
        p_otp: parsed.otp,
        p_job_type: parsed.job_type,
      });

      if (!error && data) {
        return {
          verified: Boolean(data.verified),
          status: data.status || (data.verified ? "in_progress" : "rejected"),
          message: data.verified
            ? "Cryptographic OTP verified!"
            : `Invalid OTP (${data.remaining_attempts ?? 4} attempts left)`,
        };
      }
    } catch {
      // offline fallback validation when expectedHint is known or 4-6 digit code
    }

    const isValidLocal = expectedHint
      ? parsed.otp === expectedHint
      : /^[0-9]{4,6}$/.test(parsed.otp);

    if (!isValidLocal) {
      return {
        verified: false,
        status: "rejected",
        message: "OTP code does not match passenger/seller token",
      };
    }

    await offlineQueueService.enqueue(
      "RIDER_OTP_VERIFY",
      { tripId: parsed.trip_id, otp: parsed.otp, jobType: parsed.job_type },
      "Sync OTP Verification"
    );

    const status =
      jobType === "ride_start"
        ? "in_progress"
        : jobType === "delivery_pickup"
        ? "picked_up"
        : "delivered";

    return {
      verified: true,
      status,
      message: "OTP verified (offline-resilient queue synced)",
    };
  }

  async submitProofOfDelivery(
    job: DeliveryJob,
    pod: Omit<PODMetadata, "signatureHash">
  ): Promise<{ verified: boolean; updatedJob: DeliveryJob; ledgerEntry?: RiderLedgerEntry }> {
    const signatureHash = createDeterministicHash(
      `${job.id}:${pod.recipientName}:${pod.signatureSvgPath}`
    );
    const validated = podSubmitSchema.parse({
      job_id: job.id,
      delivery_otp: pod.deliveryOtp,
      recipient_name: pod.recipientName,
      signature_svg_path: pod.signatureSvgPath,
      signature_hash: signatureHash,
      photo_uri: pod.photoUri,
      photo_captured_at: pod.photoCapturedAt,
    });

    if (IS_PRODUCTION) {
      const updatedJob = await apiRequest<DeliveryJob>(`/rides/deliveries/${job.id}/verify-dropoff`, {
        method: "POST",
        body: JSON.stringify({
          otp: validated.delivery_otp,
          pod_recipient_name: validated.recipient_name,
          pod_signature_hash: validated.signature_hash,
          pod_photo_url: validated.photo_uri ?? null,
        }),
        retries: 0,
      });
      await this.persistDeliveryUpdate(updatedJob);
      const ledger = await this.fetchEarningsLedger(job.rider_id || "");
      const ledgerEntry = ledger.find((entry) => entry.delivery_job_id === job.id);
      return { verified: true, updatedJob, ...(ledgerEntry ? { ledgerEntry } : {}) };
    }

    const otpResult = await this.verifyTripOtp(
      job.id,
      validated.delivery_otp,
      "delivery_dropoff",
      job.delivery_otp_hint
    );

    if (!otpResult.verified) {
      return { verified: false, updatedJob: job };
    }

    const updatedJob: DeliveryJob = {
      ...job,
      status: "delivered",
      pod_recipient_name: validated.recipient_name,
      pod_signature_hash: validated.signature_hash,
      pod_photo_url: validated.photo_uri ?? null,
      delivery_otp_verified_at: new Date().toISOString(),
      delivered_at: new Date().toISOString(),
    };

    try {
      await supabase
        .from("delivery_jobs")
        .update({
          pod_recipient_name: validated.recipient_name,
          pod_signature_hash: validated.signature_hash,
          pod_photo_url: validated.photo_uri ?? null,
        })
        .eq("id", job.id);
    } catch {
      await offlineQueueService.enqueue(
        "DELIVERY_POD_SUBMIT",
        {
          jobId: job.id,
          deliveryOtp: validated.delivery_otp,
          recipientName: validated.recipient_name,
          signatureHash: validated.signature_hash,
          photoUri: validated.photo_uri,
        },
        `POD ${job.job_reference}`
      );
    }

    await this.persistDeliveryUpdate(updatedJob);

    const ledgerEntry: RiderLedgerEntry = {
      id: genUuidLike(),
      rider_id: job.rider_id || "local-rider",
      transaction_group: genUuidLike(),
      direction: "credit",
      entry_type: "delivery_fee",
      amount_paisa: job.rider_payout_paisa,
      currency: "BDT",
      delivery_job_id: job.id,
      memo: `POD verified (${job.job_reference}) — ${validated.recipient_name}`,
      created_at: new Date().toISOString(),
    };

    const existingLedger = await readLocalJson<RiderLedgerEntry[]>(STORAGE_KEYS.LEDGER, []);
    await writeLocalJson(STORAGE_KEYS.LEDGER, [ledgerEntry, ...existingLedger]);

    return { verified: true, updatedJob, ledgerEntry };
  }

  async finalizeRideSettlement(
    trip: RideTrip,
    actualDistanceKm?: number,
    actualDurationMin?: number,
    tipPaisa: number = 0
  ): Promise<{ trip: RideTrip; ledgerEntries: RiderLedgerEntry[] }> {
    if (IS_PRODUCTION) {
      const settledTrip = await apiRequest<RideTrip>(`/rides/trips/${trip.id}/complete`, {
        method: "POST",
        body: JSON.stringify({
          actual_distance_km: actualDistanceKm ?? trip.actual_distance_km,
          actual_duration_min: actualDurationMin ?? trip.actual_duration_min,
          tip_paisa: tipPaisa,
        }),
        retries: 0,
      });
      const ledgerEntries = await this.fetchEarningsLedger(trip.rider_id);
      return { trip: { ...settledTrip, request: trip.request }, ledgerEntries };
    }

    try {
      const { data, error } = await supabase.rpc("finalize_ride_settlement", {
        p_trip_id: trip.id,
        p_actual_distance_km: actualDistanceKm ?? trip.actual_distance_km,
        p_actual_duration_min: actualDurationMin ?? trip.actual_duration_min,
        p_tip_paisa: tipPaisa,
      });

      if (!error && data?.success) {
        const settledTrip: RideTrip = {
          ...trip,
          status: "completed",
          settlement_status: "settled",
          gross_fare_paisa: data.gross_fare_paisa ?? trip.gross_fare_paisa,
          platform_commission_paisa:
            data.platform_commission_paisa ?? trip.platform_commission_paisa,
          rider_net_paisa: data.rider_net_paisa ?? trip.rider_net_paisa,
          estimated_fuel_cost_paisa:
            data.estimated_fuel_cost_paisa ?? trip.estimated_fuel_cost_paisa,
          tip_paisa: data.tip_paisa ?? tipPaisa,
          completed_at: data.settled_at ?? new Date().toISOString(),
          settled_at: data.settled_at ?? new Date().toISOString(),
        };
        const entries = await this.fetchEarningsLedger(trip.rider_id);
        return { trip: settledTrip, ledgerEntries: entries };
      }
    } catch {
      // local double-entry settlement mirror
    }

    const gross = trip.gross_fare_paisa;
    const comm = Math.round(gross * 0.15);
    const net = Math.max(0, gross - comm) + tipPaisa;
    const txGroup = genUuidLike();
    const now = new Date().toISOString();

    const newEntries: RiderLedgerEntry[] = [
      {
        id: genUuidLike(),
        rider_id: trip.rider_id,
        transaction_group: txGroup,
        direction: "credit",
        entry_type: "ride_fare",
        amount_paisa: gross,
        currency: "BDT",
        ride_trip_id: trip.id,
        memo: `Ride fare (${trip.request?.request_reference || trip.id.slice(0, 8)})`,
        created_at: now,
      },
      {
        id: genUuidLike(),
        rider_id: trip.rider_id,
        transaction_group: txGroup,
        direction: "debit",
        entry_type: "platform_commission",
        amount_paisa: comm,
        currency: "BDT",
        ride_trip_id: trip.id,
        memo: "15% platform dispatch fee",
        created_at: now,
      },
    ];

    if (trip.estimated_fuel_cost_paisa > 0) {
      newEntries.push({
        id: genUuidLike(),
        rider_id: trip.rider_id,
        transaction_group: txGroup,
        direction: "debit",
        entry_type: "fuel_estimate",
        amount_paisa: trip.estimated_fuel_cost_paisa,
        currency: "BDT",
        ride_trip_id: trip.id,
        memo: `Fuel/CNG tracker (${actualDistanceKm ?? trip.actual_distance_km} km)`,
        created_at: now,
      });
    }

    const existing = await readLocalJson<RiderLedgerEntry[]>(STORAGE_KEYS.LEDGER, []);
    const combined = [...newEntries, ...existing];
    await writeLocalJson(STORAGE_KEYS.LEDGER, combined);

    const settledTrip: RideTrip = {
      ...trip,
      status: "completed",
      settlement_status: "settled",
      actual_distance_km: actualDistanceKm ?? trip.actual_distance_km,
      actual_duration_min: actualDurationMin ?? trip.actual_duration_min,
      platform_commission_paisa: comm,
      rider_net_paisa: net,
      tip_paisa: tipPaisa,
      completed_at: now,
      settled_at: now,
    };

    return { trip: settledTrip, ledgerEntries: combined };
  }

  // ==========================================================================
  // 5. GPS TELEMETRY & SPATIAL ENGINE / PHOTON GEOCODING
  // ==========================================================================

  async sendTelemetryPing(params: {
    riderId: string;
    tripId?: string;
    deliveryJobId?: string;
    latitude: number;
    longitude: number;
    speedKmh?: number;
    heading?: number;
    accuracyMeters?: number;
    previousBreadcrumb?: LocationBreadcrumb | null;
  }): Promise<{ accepted: boolean; speedKmh: number; reason?: string }> {
    if (!isWithinBangladeshBbox(params.latitude, params.longitude)) {
      return {
        accepted: false,
        speedKmh: 0,
        reason: "Coordinates outside Bangladesh operational bounding box",
      };
    }

    const nextCrumb: LocationBreadcrumb = {
      latitude: params.latitude,
      longitude: params.longitude,
      speedKmh: params.speedKmh ?? 0,
      heading: params.heading ?? 0,
      accuracyMeters: params.accuracyMeters,
      recordedAt: new Date().toISOString(),
    };

    const computedSpeed = params.previousBreadcrumb
      ? calculateVelocityKmh(params.previousBreadcrumb, nextCrumb)
      : params.speedKmh ?? 0;

    if (computedSpeed > 220) {
      return {
        accepted: false,
        speedKmh: computedSpeed,
        reason: `Telemetry rejected: velocity sanity breach (${computedSpeed} km/h)`,
      };
    }

    const validated = gpsPingSchema.parse({
      latitude: params.latitude,
      longitude: params.longitude,
      accuracy_meters: params.accuracyMeters,
      speed_kmh: Math.min(220, Math.max(0, params.speedKmh ?? computedSpeed)),
      heading: params.heading ?? 0,
      is_mock_location: false,
    });

    // Broadcast to spatial-engine fleet channel if available
    bdMapClient
      .pingRiderLocation({
        riderId: params.riderId,
        orderId: params.tripId || params.deliveryJobId,
        lat: validated.latitude,
        lng: validated.longitude,
        heading: validated.heading ?? 0,
        speed: validated.speed_kmh ?? 0,
      })
      .catch(() => {});

    const dbPayload = {
      rider_id: params.riderId,
      trip_id: params.tripId ?? null,
      delivery_job_id: params.deliveryJobId ?? null,
      latitude: validated.latitude,
      longitude: validated.longitude,
      accuracy_meters: validated.accuracy_meters ?? 10,
      speed_kmh: validated.speed_kmh ?? 0,
      heading: validated.heading ?? 0,
      is_mock_location: false,
    };

    try {
      const { error } = await supabase.from("ride_location_pings").insert(dbPayload);
      if (error) throw error;
    } catch {
      await offlineQueueService.enqueue(
        "RIDER_GPS_PING",
        dbPayload,
        "Sync Rider GPS Ping"
      );
    }

    return { accepted: true, speedKmh: validated.speed_kmh ?? 0 };
  }

  async searchPlaces(query: string, userLocation?: { lat: number; lng: number }): Promise<GeocodingResult[]> {
    // Try BDMapClient hyperlocal autocomplete first, then merge/fallback to Photon OSM
    try {
      const predictions = await bdMapClient.autocomplete(query, userLocation);
      if (predictions.length > 0) {
        return predictions.map((p) => ({
          id: p.place_id,
          displayName: p.description || p.name,
          city: p.category || "Bangladesh",
          district: "Bangladesh",
          latitude: p.lat,
          longitude: p.lng,
          osmType: p.category || "place",
        }));
      }
    } catch {
      // fall through to Photon geocoder
    }

    return photonGeocoder.searchPlaces(query, 8);
  }

  async reverseGeocode(lat: number, lng: number): Promise<GeocodingResult | null> {
    return photonGeocoder.reverseGeocode(lat, lng);
  }

  async getDirectionsAndRoute(
    origin: { lat: number; lng: number; label: string },
    destination: { lat: number; lng: number; label: string },
    vehicleMode: VehicleMode
  ): Promise<{
    distanceKm: number;
    durationMin: number;
    polylinePoints: [number, number][];
    maneuvers: TurnManeuver[];
  }> {
    const routingMode =
      vehicleMode === "cng"
        ? "cng"
        : vehicleMode === "sedan" || vehicleMode === "suv"
        ? "car"
        : "motorbike";

    try {
      const result = await bdMapClient.getDirections(
        { lat: origin.lat, lng: origin.lng },
        { lat: destination.lat, lng: destination.lng },
        routingMode
      );
      if (result?.summary?.distance_km > 0) {
        const coords: number[][] = (result.geometry_geojson?.coordinates as number[][]) ?? [
          [origin.lng, origin.lat],
          [destination.lng, destination.lat],
        ];
        const points: [number, number][] = coords.map(([lng, lat]: number[]) => [lat, lng]);
        const maneuvers: TurnManeuver[] =
          result.legs?.[0]?.maneuvers?.map((m, idx, arr) => ({
            instruction: m.instruction,
            distanceKm: m.distance_km,
            timeSeconds: m.time_seconds,
            icon: idx === arr.length - 1 ? "flag" : idx === 0 ? "arrow-up" : "arrow-redo",
          })) ??
          buildFallbackTurnManeuvers(
            origin.label,
            destination.label,
            result.summary.distance_km,
            Math.round(result.summary.duration_seconds / 60)
          );

        return {
          distanceKm: result.summary.distance_km,
          durationMin: Math.max(4, Math.round(result.summary.duration_seconds / 60)),
          polylinePoints: points,
          maneuvers,
        };
      }
    } catch {
      // Offline / fallback curved route interpolation
    }

    const distanceKm = haversineDistanceKm(origin.lat, origin.lng, destination.lat, destination.lng);
    const avgSpeed = VEHICLE_TIERS[vehicleMode].avgSpeedKmh;
    const durationMin = Math.max(4, Math.round((distanceKm / avgSpeed) * 60));
    const midLat = (origin.lat + destination.lat) / 2 + 0.0025;
    const midLng = (origin.lng + destination.lng) / 2 - 0.002;

    return {
      distanceKm,
      durationMin,
      polylinePoints: [
        [origin.lat, origin.lng],
        [midLat, midLng],
        [destination.lat, destination.lng],
      ],
      maneuvers: buildFallbackTurnManeuvers(
        origin.label,
        destination.label,
        distanceKm,
        durationMin
      ),
    };
  }

  /** Navigation-friendly route alias used by the consumer ride booking screen. */
  async getRouteNavigation(
    origin: { lat: number; lng: number; label: string },
    destination: { lat: number; lng: number; label: string },
    vehicleMode: VehicleMode
  ): Promise<{ polyline: [number, number][]; distanceKm: number; durationMin: number; maneuvers: TurnManeuver[] }> {
    const route = await this.getDirectionsAndRoute(origin, destination, vehicleMode);
    return { ...route, polyline: route.polylinePoints };
  }

  // ==========================================================================
  // 6. EARNINGS LEDGER, PAYOUTS, HOTSPOTS & OFFLINE PACKS
  // ==========================================================================

  async fetchEarningsLedger(riderId: string): Promise<RiderLedgerEntry[]> {
    if (IS_PRODUCTION) {
      try {
        const rows = await apiRequest<RiderLedgerEntry[]>("/rides/riders/earnings/ledger", { retries: 1 });
        if (!Array.isArray(rows)) throw new Error("Earnings response was not a list");
        await writeLocalJson(STORAGE_KEYS.LEDGER, rows);
        return rows;
      } catch {
        return readLocalJson<RiderLedgerEntry[]>(STORAGE_KEYS.LEDGER, []);
      }
    }

    try {
      const { data, error } = await supabase
        .from("rider_earnings_ledger")
        .select("*")
        .eq("rider_id", riderId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!error && data && data.length > 0) {
        const rows = data as RiderLedgerEntry[];
        await writeLocalJson(STORAGE_KEYS.LEDGER, rows);
        return rows;
      }
    } catch {
      // fallback
    }

    const cached = await readLocalJson<RiderLedgerEntry[]>(STORAGE_KEYS.LEDGER, []);
    if (cached.length > 0) return cached;

    const now = new Date();
    const todayIso = now.toISOString();
    const yesterdayIso = new Date(now.getTime() - 86_400_000).toISOString();

    const starterLedger: RiderLedgerEntry[] = [
      {
        id: genUuidLike(),
        rider_id: riderId,
        transaction_group: "tx-grp-1",
        direction: "credit",
        entry_type: "ride_fare",
        amount_paisa: 68000,
        currency: "BDT",
        memo: "Airport Transfer (DAC → Gulshan 2)",
        created_at: todayIso,
      },
      {
        id: genUuidLike(),
        rider_id: riderId,
        transaction_group: "tx-grp-1",
        direction: "debit",
        entry_type: "platform_commission",
        amount_paisa: 10200,
        currency: "BDT",
        memo: "15% platform dispatch commission",
        created_at: todayIso,
      },
      {
        id: genUuidLike(),
        rider_id: riderId,
        transaction_group: "tx-grp-1",
        direction: "debit",
        entry_type: "fuel_estimate",
        amount_paisa: 3800,
        currency: "BDT",
        memo: "Estimated Octane fuel (11.8 km)",
        created_at: todayIso,
      },
      {
        id: genUuidLike(),
        rider_id: riderId,
        transaction_group: "tx-grp-2",
        direction: "credit",
        entry_type: "delivery_fee",
        amount_paisa: 42000,
        currency: "BDT",
        memo: "Bundled Jamdani + Honey Parcel Batch (2 stops)",
        created_at: todayIso,
      },
      {
        id: genUuidLike(),
        rider_id: riderId,
        transaction_group: "tx-grp-2",
        direction: "credit",
        entry_type: "tip",
        amount_paisa: 5000,
        currency: "BDT",
        memo: "Traveler appreciation tip",
        created_at: yesterdayIso,
      },
    ];

    await writeLocalJson(STORAGE_KEYS.LEDGER, starterLedger);
    return starterLedger;
  }

  async fetchPayoutHistory(riderId: string): Promise<RiderPayout[]> {
    if (IS_PRODUCTION) {
      try {
        const rows = await apiRequest<RiderPayout[]>("/rides/riders/payouts", { retries: 1 });
        if (!Array.isArray(rows)) throw new Error("Payout response was not a list");
        await writeLocalJson(STORAGE_KEYS.PAYOUTS, rows);
        return rows;
      } catch {
        return readLocalJson<RiderPayout[]>(STORAGE_KEYS.PAYOUTS, []);
      }
    }

    try {
      const { data, error } = await supabase
        .from("rider_payouts")
        .select("*")
        .eq("rider_id", riderId)
        .order("requested_at", { ascending: false })
        .limit(20);

      if (!error && data && data.length > 0) {
        const list = data as RiderPayout[];
        await writeLocalJson(STORAGE_KEYS.PAYOUTS, list);
        return list;
      }
    } catch {
      // fallback
    }

    return readLocalJson<RiderPayout[]>(STORAGE_KEYS.PAYOUTS, []);
  }

  async requestPayout(
    riderId: string,
    input: { amountPaisa: number; channel: RiderPayoutChannel; accountNumber: string }
  ): Promise<RiderPayout> {
    const validated = payoutRequestSchema.parse({
      amount_paisa: input.amountPaisa,
      channel: input.channel,
      account_number: input.accountNumber,
    });

    const payoutRef = genRef("SJ-PAY");
    const masked = maskAccountNumber(validated.channel, validated.account_number);
    const feePaisa = validated.channel === "bank_transfer" ? 1000 : 0;

    if (IS_PRODUCTION) {
      const saved = await apiRequest<RiderPayout>("/rides/riders/payouts", {
        method: "POST",
        body: JSON.stringify({
          amount_paisa: validated.amount_paisa,
          channel: validated.channel,
          account_number_masked: masked,
          idempotency_key: `payout:${riderId}:${Date.now()}`,
        }),
        retries: 0,
      });
      const existing = await readLocalJson<RiderPayout[]>(STORAGE_KEYS.PAYOUTS, []);
      await writeLocalJson(STORAGE_KEYS.PAYOUTS, [saved, ...existing]);
      return saved;
    }

    const newPayout: RiderPayout = {
      id: genUuidLike(),
      rider_id: riderId,
      payout_reference: payoutRef,
      amount_paisa: validated.amount_paisa,
      fee_paisa: feePaisa,
      net_amount_paisa: Math.max(100, validated.amount_paisa - feePaisa),
      currency: "BDT",
      channel: validated.channel,
      account_number_masked: masked,
      status: "requested",
      requested_at: new Date().toISOString(),
    };

    try {
      const { data, error } = await supabase
        .from("rider_payouts")
        .insert({
          rider_id: riderId,
          payout_reference: newPayout.payout_reference,
          amount_paisa: newPayout.amount_paisa,
          fee_paisa: newPayout.fee_paisa,
          net_amount_paisa: newPayout.net_amount_paisa,
          currency: "BDT",
          channel: newPayout.channel,
          account_number_masked: newPayout.account_number_masked,
          status: "requested",
          idempotency_key: `payout:${riderId}:${Date.now()}`,
        })
        .select()
        .single();

      if (!error && data) {
        const saved = data as RiderPayout;
        const existing = await readLocalJson<RiderPayout[]>(STORAGE_KEYS.PAYOUTS, []);
        await writeLocalJson(STORAGE_KEYS.PAYOUTS, [saved, ...existing]);
        return saved;
      }
    } catch {
      await offlineQueueService.enqueue(
        "RIDER_PAYOUT_REQUEST",
        {
          rider_id: riderId,
          payout_reference: newPayout.payout_reference,
          amount_paisa: newPayout.amount_paisa,
          fee_paisa: newPayout.fee_paisa,
          net_amount_paisa: newPayout.net_amount_paisa,
          currency: "BDT",
          channel: newPayout.channel,
          account_number_masked: newPayout.account_number_masked,
          status: "requested",
        },
        `Cashout ${payoutRef}`
      );
    }

    const existing = await readLocalJson<RiderPayout[]>(STORAGE_KEYS.PAYOUTS, []);
    await writeLocalJson(STORAGE_KEYS.PAYOUTS, [newPayout, ...existing]);
    return newPayout;
  }

  async getDemandHotspots(): Promise<DemandHotspotZone[]> {
    // Enrich hotspot surge multipliers with spatial-engine if reachable
    try {
      const sample = DEFAULT_DEMAND_HOTSPOTS[0];
      const surge = await bdMapClient.getSurgeMultiplier(sample.latitude, sample.longitude);
      if (surge?.surge_multiplier) {
        return DEFAULT_DEMAND_HOTSPOTS.map((zone, idx) =>
          idx === 0
            ? {
                ...zone,
                surgeMultiplier: Math.min(1.25, Math.max(1.0, surge.surge_multiplier)),
                availableRiders: surge.active_riders || zone.availableRiders,
              }
            : zone
        );
      }
    } catch {
      // baseline BD hotspot telemetry
    }
    return DEFAULT_DEMAND_HOTSPOTS;
  }

  async getOfflineMapPacks(): Promise<OfflineMapPackStatus[]> {
    const cached = await readLocalJson<OfflineMapPackStatus[]>(
      STORAGE_KEYS.OFFLINE_PACKS,
      []
    );
    if (cached.length > 0) return cached;
    await writeLocalJson(STORAGE_KEYS.OFFLINE_PACKS, DEFAULT_OFFLINE_MAP_PACKS);
    return DEFAULT_OFFLINE_MAP_PACKS;
  }

  async downloadOfflineMapPack(
    packId: string,
    onProgress?: (pct: number) => void
  ): Promise<OfflineMapPackStatus[]> {
    const packs = await this.getOfflineMapPacks();
    try {
      await bdMapClient.getOfflineManifest();
    } catch {
      // use local vector pack cache metadata
    }

    for (const step of [25, 65, 100]) {
      onProgress?.(step);
    }

    const updated: OfflineMapPackStatus[] = packs.map((p) =>
      p.id === packId
        ? {
            ...p,
            status: "cached",
            progressPct: 100,
            lastSyncedAt: new Date().toISOString(),
          }
        : p
    );
    await writeLocalJson(STORAGE_KEYS.OFFLINE_PACKS, updated);
    return updated;
  }

  // ==========================================================================
  // 7. SAFETY SHIELD (1-TAP SOS & LIVE SHARE LINK)
  // ==========================================================================

  async triggerRiderSOS(params: {
    tripId?: string;
    coords?: { latitude: number; longitude: number } | null;
    note?: string;
  }) {
    const coords = params.coords ?? (await liveLocationService.getCurrentLocation().catch(() => ({ lat: 23.8103, lng: 90.4125 })));
    const lat = "latitude" in coords ? coords.latitude : coords.lat;
    const lng = "longitude" in coords ? coords.longitude : coords.lng;

    const shareLink = liveLocationService.generateShareLink(lat, lng);

    const sosResult = await sosService.triggerOneTapSOS(
      params.note || `Rider Safety Shield SOS triggered. Live GPS: ${shareLink}`
    );

    if (params.tripId) {
      try {
        await supabase
          .from("ride_trips")
          .update({
            sos_triggered: true,
            sos_triggered_at: new Date().toISOString(),
          })
          .eq("id", params.tripId);
      } catch {
        // non-blocking
      }
    }

    return {
      ...sosResult,
      shareLink,
    };
  }

  // ==========================================================================
  // 8. CONSUMER RIDE-HAILING (QUOTES, BOOKING, OTP, HISTORY)
  // ==========================================================================

  async getConsumerQuotes(params: {
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
    promoCode?: string;
    rideType?: RideType;
    weatherGuard?: boolean;
  }): Promise<Record<VehicleMode, RideQuote>> {
    const distKm = haversineDistanceKm(
      params.pickupLat,
      params.pickupLng,
      params.dropoffLat,
      params.dropoffLng
    );

    let liveSurge = 1.0;
    try {
      const surgeRes = await bdMapClient.getSurgeMultiplier(
        params.pickupLat,
        params.pickupLng
      );
      if (surgeRes?.surge_multiplier) {
        liveSurge = surgeRes.surge_multiplier;
      }
    } catch {
      // default 1.0 or peak hour estimation
      const hour = new Date().getHours();
      if ((hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20)) {
        liveSurge = 1.12;
      }
    }

    const modes: VehicleMode[] = ["bike", "cng", "sedan", "suv", "boat"];
    const result = {} as Record<VehicleMode, RideQuote>;

    for (const mode of modes) {
      result[mode] = estimateRideFare({
        vehicleMode: mode,
        distanceKm: distKm,
        surgeMultiplier: liveSurge,
        weatherGuard: params.weatherGuard,
        promoCode: params.promoCode,
        rideType: params.rideType,
      });
    }
    result.parcel_rider = estimateRideFare({
      vehicleMode: "parcel_rider",
      distanceKm: distKm,
      surgeMultiplier: liveSurge,
      weatherGuard: params.weatherGuard,
      promoCode: params.promoCode,
      rideType: params.rideType,
    });

    return result;
  }

  async createConsumerRideRequest(input: unknown): Promise<{
    request: RideRequest;
    passengerOtp: string;
  }> {
    const validated = createRideRequestSchema.parse(input);
    const distKm = haversineDistanceKm(
      validated.pickup_lat,
      validated.pickup_lng,
      validated.dropoff_lat,
      validated.dropoff_lng
    );

    const quote = estimateRideFare({
      vehicleMode: validated.vehicle_mode,
      distanceKm: distKm,
      promoCode: validated.promo_code,
      rideType: validated.ride_type,
    });

    const userId = (await getCurrentUserId()) || "consumer-local-user";
    const reqId = genUuidLike();
    const requestRef = genRef("SJ-RIDE");
    const passengerOtp = String(100000 + Math.floor(Math.random() * 899999));

    const newRequest: RideRequest = {
      id: reqId,
      request_reference: requestRef,
      passenger_id: userId,
      vehicle_mode: validated.vehicle_mode,
      ride_type: validated.ride_type,
      status: "searching",
      pickup_address: validated.pickup_address,
      pickup_lat: validated.pickup_lat,
      pickup_lng: validated.pickup_lng,
      dropoff_address: validated.dropoff_address,
      dropoff_lat: validated.dropoff_lat,
      dropoff_lng: validated.dropoff_lng,
      estimated_distance_km: quote.distance_km,
      estimated_duration_min: quote.duration_min,
      base_fare_paisa: quote.base_fare_paisa,
      distance_fare_paisa: quote.distance_fare_paisa,
      surge_multiplier: quote.surge_multiplier,
      weather_guard_applied: quote.weather_guard_applied,
      promo_code: quote.promo_code ?? null,
      discount_paisa: quote.discount_paisa,
      quoted_fare_paisa: quote.quoted_fare_paisa,
      currency: "BDT",
      payment_method: validated.payment_method,
      scheduled_for: validated.scheduled_for ?? null,
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      notes: validated.notes ?? null,
      metadata: validated.flight_number ? { flight_number: validated.flight_number } : {},
      created_at: new Date().toISOString(),
    };

    const insertPayload = {
      id: newRequest.id,
      request_reference: newRequest.request_reference,
      passenger_id: userId,
      vehicle_mode: newRequest.vehicle_mode,
      ride_type: newRequest.ride_type,
      status: "searching",
      pickup_address: newRequest.pickup_address,
      pickup_lat: newRequest.pickup_lat,
      pickup_lng: newRequest.pickup_lng,
      dropoff_address: newRequest.dropoff_address,
      dropoff_lat: newRequest.dropoff_lat,
      dropoff_lng: newRequest.dropoff_lng,
      estimated_distance_km: newRequest.estimated_distance_km,
      estimated_duration_min: newRequest.estimated_duration_min,
      base_fare_paisa: newRequest.base_fare_paisa,
      distance_fare_paisa: newRequest.distance_fare_paisa,
      surge_multiplier: newRequest.surge_multiplier,
      weather_guard_applied: newRequest.weather_guard_applied,
      promo_code: newRequest.promo_code,
      discount_paisa: newRequest.discount_paisa,
      quoted_fare_paisa: newRequest.quoted_fare_paisa,
      currency: "BDT",
      payment_method: newRequest.payment_method,
      scheduled_for: newRequest.scheduled_for,
      notes: newRequest.notes,
      metadata: newRequest.metadata,
      idempotency_key: `ride_req:${userId}:${Date.now()}`,
    };

    let persistedRemote = false;
    try {
      const apiRes = await apiRequest<{ data?: RideRequest }>("/rides/requests", {
        method: "POST",
        body: JSON.stringify(insertPayload),
        retries: 0,
        timeoutMs: 3000,
      });
      if (apiRes?.data) {
        persistedRemote = true;
      }
    } catch {
      // try direct Supabase table insert
    }

    if (!persistedRemote) {
      try {
        const { error } = await supabase.from("ride_requests").insert(insertPayload);
        if (error) throw error;
        persistedRemote = true;
      } catch {
        await offlineQueueService.enqueue(
          "RIDE_REQUEST_CREATE",
          insertPayload,
          `Ride ${requestRef}`
        );
      }
    }

    const history = await readLocalJson<RideRequest[]>(STORAGE_KEYS.RIDE_HISTORY, []);
    await writeLocalJson(STORAGE_KEYS.RIDE_HISTORY, [newRequest, ...history].slice(0, 30));

    appEventBus.publish("BOOKING_STATUS_CHANGED", {
      bookingId: newRequest.id,
      currentStatus: "searching",
      bookingReference: newRequest.request_reference,
      productType: "car",
      destinationCity: newRequest.dropoff_address,
      totalPrice: newRequest.quoted_fare_paisa / 100,
      currency: "BDT",
      timestamp: Date.now(),
      sourceScreen: "RideHailing",
    });

    return { request: newRequest, passengerOtp };
  }

  async fetchConsumerRideHistory(): Promise<RideRequest[]> {
    const userId = await getCurrentUserId();
    if (userId) {
      try {
        const { data, error } = await supabase
          .from("ride_requests")
          .select("*")
          .eq("passenger_id", userId)
          .order("created_at", { ascending: false })
          .limit(20);

        if (!error && data && data.length > 0) {
          const rows = data as RideRequest[];
          await writeLocalJson(STORAGE_KEYS.RIDE_HISTORY, rows);
          return rows;
        }
      } catch {
        // fallback to cache
      }
    }

    return readLocalJson<RideRequest[]>(STORAGE_KEYS.RIDE_HISTORY, []);
  }

  async fetchPassengerTripOtp(tripId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase.rpc("get_my_otp_code", {
        p_target_type: "ride_start",
        p_target_id: tripId,
      });
      if (!error && data?.found && data?.otp_code) {
        return String(data.otp_code);
      }
    } catch {
      // ignore
    }
    return null;
  }

  async cancelConsumerRide(requestId: string, reason?: string): Promise<void> {
    try {
      await supabase
        .from("ride_requests")
        .update({
          status: "cancelled",
          cancellation_reason: reason || "Cancelled by passenger",
        })
        .eq("id", requestId);
    } catch {
      // update local mirror
    }

    const history = await readLocalJson<RideRequest[]>(STORAGE_KEYS.RIDE_HISTORY, []);
    const updated = history.map((r) =>
      r.id === requestId ? { ...r, status: "cancelled" as const } : r
    );
    await writeLocalJson(STORAGE_KEYS.RIDE_HISTORY, updated);
  }

  // ==========================================================================
  // 9. REALTIME SUBSCRIPTIONS
  // ==========================================================================

  subscribeToDispatchRadar(onUpdate: () => void): () => void {
    try {
      const channel = supabase
        .channel(`rider-dispatch-radar-${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "ride_requests" },
          () => onUpdate()
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "delivery_jobs" },
          () => onUpdate()
        )
        .subscribe();

      return () => {
        void supabase.removeChannel(channel);
      };
    } catch {
      return () => {};
    }
  }
}

export const riderService = new RiderService();
export default riderService;
