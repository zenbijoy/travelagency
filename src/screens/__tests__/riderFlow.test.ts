/**
 * Rider, Delivery Partner, Provider Hub & Consumer Mobility Comprehensive Test Suite
 * Verifies:
 * 1. Bangladesh BBox & GPS Anti-Spoof Velocity Calculator
 * 2. Integer-Paisa Fare Estimator & Fair Surge / Weather Guard Shield
 * 3. Proximity Parcel Batching Algorithm & Route Bonus
 * 4. Smart Net-Profit & Double-Entry Ledger Summary
 * 5. Zod Contract Validation (Ride Create, OTP Verify, POD Submit, Cashout Min)
 * 6. Zustand useRiderStore End-to-End Rider & Consumer Flows
 * 7. Zustand useProviderHubStore Scheduling, Catalog, Staff & Photon Waypoints
 */

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("../../utils/supabase", () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: "rider-test-user-01", user_metadata: { full_name: "Kamrul Hasan" } } },
        error: null,
      }),
      getSession: jest.fn().mockResolvedValue({
        data: { session: null },
        error: null,
      }),
    },
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockResolvedValue({ data: [], error: null }),
      insert: jest.fn().mockResolvedValue({ data: [], error: null }),
    }),
    channel: jest.fn().mockReturnValue({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    }),
    removeChannel: jest.fn(),
  },
}));

jest.mock("../../services/safety/sosService", () => ({
  sosService: {
    triggerOneTapSOS: jest.fn().mockResolvedValue({
      success: true,
      dispatchTimestamp: Date.now(),
      coordinates: { latitude: 23.7925, longitude: 90.4078, timestamp: Date.now() },
      smsUrls: [],
      contactsNotifiedCount: 1,
      sosMessage: "Test SOS",
      recipients: [],
      emergencyCallNumber: "999",
      backendLogged: true,
      countryCode: "BD",
    }),
  },
}));

jest.mock("../../services/location/liveLocationService", () => ({
  liveLocationService: {
    getCurrentLocation: jest.fn().mockResolvedValue({
      latitude: 23.7925,
      longitude: 90.4078,
      timestamp: Date.now(),
    }),
    generateShareLink: jest.fn(
      (lat: number, lng: number) => `https://shopnojatra.com/live?lat=${lat}&lng=${lng}`
    ),
  },
}));

jest.mock("../../services/location/photonGeocoder", () => ({
  photonGeocoder: {
    searchPlaces: jest.fn().mockResolvedValue([
      {
        id: "osm_node_1",
        displayName: "Banani Road 11, Dhaka, Bangladesh",
        city: "Dhaka",
        district: "Dhaka",
        latitude: 23.7937,
        longitude: 90.4066,
        osmType: "street",
      },
    ]),
    reverseGeocode: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock("../../services/offline/offlineQueueService", () => ({
  offlineQueueService: {
    enqueue: jest.fn().mockResolvedValue("queue-id-1"),
    registerHandler: jest.fn(),
  },
}));

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: "Success", Error: "Error" },
  ImpactFeedbackStyle: { Light: "Light", Medium: "Medium" },
}));

import {
  batchDeliveryJobsByProximity,
  calculateNetProfitSummary,
  calculateVelocityKmh,
  clampFairSurgeMultiplier,
  createDeterministicHash,
  estimateRideFare,
  formatPaisaBDT,
  haversineDistanceKm,
  isWithinBangladeshBbox,
  maskAccountNumber,
  PLATFORM_COMMISSION_RATE,
} from "../../features/rider/calculators";
import {
  createRideRequestSchema,
  DeliveryJob,
  payoutRequestSchema,
  podSubmitSchema,
  RideRequest,
  verifyOtpSchema,
} from "../../features/rider/types";
import { useRiderStore } from "../../store/riderStore";
import { useProviderHubStore } from "../../features/rider/providerStore";

describe("1. Geographic & Anti-Spoof Validation", () => {
  test("validates Bangladesh bounding box coordinates accurately", () => {
    expect(isWithinBangladeshBbox(23.8103, 90.4125)).toBe(true); // Dhaka
    expect(isWithinBangladeshBbox(21.4272, 92.0058)).toBe(true); // Cox's Bazar
    expect(isWithinBangladeshBbox(24.8949, 91.8687)).toBe(true); // Sylhet
    expect(isWithinBangladeshBbox(51.5074, -0.1278)).toBe(false); // London
    expect(isWithinBangladeshBbox(23.8, 120.5)).toBe(false); // Far East
  });

  test("calculates accurate haversine distance and velocity sanity", () => {
    // Gulshan 2 -> HSIA Airport (~5.6 km)
    const dist = haversineDistanceKm(23.7947, 90.4144, 23.8433, 90.3978);
    expect(dist).toBeGreaterThan(4.5);
    expect(dist).toBeLessThan(7.5);

    const t0 = new Date(1700000000000).toISOString();
    const t10Min = new Date(1700000000000 + 600_000).toISOString();
    const speed = calculateVelocityKmh(
      { latitude: 23.7947, longitude: 90.4144, recordedAt: t0 },
      { latitude: 23.8433, longitude: 90.3978, recordedAt: t10Min }
    );
    expect(speed).toBeGreaterThan(25);
    expect(speed).toBeLessThan(50);

    // Impossible teleport detection (>220 km/h)
    const t5Sec = new Date(1700000000000 + 5_000).toISOString();
    const spoofSpeed = calculateVelocityKmh(
      { latitude: 23.7947, longitude: 90.4144, recordedAt: t0 },
      { latitude: 21.4272, longitude: 92.0058, recordedAt: t5Sec }
    );
    expect(spoofSpeed).toBeGreaterThan(220);
  });
});

describe("2. Fare Calculator & Weather Guard Surge Shield", () => {
  test("enforces max 1.25x normal surge and 1.10x during Weather Guard", () => {
    expect(clampFairSurgeMultiplier(1.8, false)).toBe(1.25);
    expect(clampFairSurgeMultiplier(1.5, true)).toBe(1.1);
    expect(clampFairSurgeMultiplier(0.7, false)).toBe(1.0);
  });

  test("calculates integer-paisa fares with promo discounts & vehicle tiers", () => {
    const sedanQuote = estimateRideFare({
      vehicleMode: "sedan",
      distanceKm: 10,
      surgeMultiplier: 1.25,
      promoCode: "AIRPORT15",
    });

    expect(Number.isInteger(sedanQuote.quoted_fare_paisa)).toBe(true);
    expect(sedanQuote.currency).toBe("BDT");
    expect(sedanQuote.discount_paisa).toBeGreaterThan(0);
    expect(sedanQuote.platform_commission_paisa).toBe(
      Math.round(sedanQuote.quoted_fare_paisa * PLATFORM_COMMISSION_RATE)
    );
    expect(sedanQuote.rider_net_estimate_paisa).toBeLessThan(
      sedanQuote.quoted_fare_paisa
    );

    const motoQuote = estimateRideFare({
      vehicleMode: "bike",
      distanceKm: 10,
      promoCode: "DHAKA50",
    });
    expect(motoQuote.quoted_fare_paisa).toBeLessThan(sedanQuote.quoted_fare_paisa);
  });

  test("formats integer paisa to clean BDT strings and masks payout accounts", () => {
    expect(formatPaisaBDT(25000)).toBe("৳250");
    expect(formatPaisaBDT(142550)).toContain("1,425.50");
    expect(maskAccountNumber("bkash", "01711223344")).toBe("BKASH ••••3344");
    expect(createDeterministicHash("sig-test")).toMatch(/^pod_[0-9a-f]{8}_8$/);
  });
});

describe("3. Proximity Batching & Net-Profit Accounting", () => {
  const sampleJobs: DeliveryJob[] = [
    {
      id: "job-1",
      job_reference: "DLV-1",
      order_id: "ord-1",
      seller_id: "sel-1",
      buyer_id: "buy-1",
      delivery_tier: "shopno_express",
      status: "open",
      pickup_address: "Banani Shop 1",
      pickup_lat: 23.793,
      pickup_lng: 90.405,
      pickup_contact_name: "Seller 1",
      pickup_contact_phone: "01710000001",
      dropoff_address: "Gulshan 2 Drop",
      dropoff_lat: 23.796,
      dropoff_lng: 90.414,
      dropoff_contact_name: "Buyer 1",
      dropoff_contact_phone: "01720000001",
      package_weight_kg: 1.5,
      package_summary: "Jamani Saree Box",
      is_fragile: false,
      is_perishable: false,
      estimated_distance_km: 2.1,
      delivery_fee_paisa: 12000,
      rider_payout_paisa: 9500,
      platform_commission_paisa: 2500,
      cod_amount_paisa: 0,
      currency: "BDT",
      created_at: new Date().toISOString(),
    },
    {
      id: "job-2",
      job_reference: "DLV-2",
      order_id: "ord-2",
      seller_id: "sel-2",
      buyer_id: "buy-2",
      delivery_tier: "shopno_express",
      status: "open",
      pickup_address: "Banani Shop 2",
      pickup_lat: 23.7945,
      pickup_lng: 90.4065,
      pickup_contact_name: "Seller 2",
      pickup_contact_phone: "01710000002",
      dropoff_address: "Gulshan 1 Drop",
      dropoff_lat: 23.781,
      dropoff_lng: 90.416,
      dropoff_contact_name: "Buyer 2",
      dropoff_contact_phone: "01720000002",
      package_weight_kg: 2.0,
      package_summary: "Tea & Honey Hamper",
      is_fragile: true,
      is_perishable: false,
      estimated_distance_km: 2.8,
      delivery_fee_paisa: 14000,
      rider_payout_paisa: 11000,
      platform_commission_paisa: 3000,
      cod_amount_paisa: 85000,
      currency: "BDT",
      created_at: new Date().toISOString(),
    },
  ];

  test("groups nearby delivery jobs into bundled route batches with bonus", () => {
    const batches = batchDeliveryJobsByProximity(sampleJobs, 2.5);
    expect(batches).toHaveLength(1);
    expect(batches[0].stopCount).toBe(2);
    expect(batches[0].bonusPaisa).toBeGreaterThan(0);
    expect(batches[0].totalPayoutPaisa).toBe(9500 + 11000 + batches[0].bonusPaisa);
  });

  test("computes accurate double-entry net profit summary", () => {
    const nowIso = new Date().toISOString();
    const summary = calculateNetProfitSummary({
      entries: [
        {
          id: "l1",
          rider_id: "r1",
          transaction_group: "g1",
          direction: "credit",
          entry_type: "ride_fare",
          amount_paisa: 40000,
          currency: "BDT",
          created_at: nowIso,
        },
        {
          id: "l2",
          rider_id: "r1",
          transaction_group: "g1",
          direction: "debit",
          entry_type: "platform_commission",
          amount_paisa: 6000,
          currency: "BDT",
          created_at: nowIso,
        },
        {
          id: "l3",
          rider_id: "r1",
          transaction_group: "g1",
          direction: "debit",
          entry_type: "fuel_estimate",
          amount_paisa: 4000,
          currency: "BDT",
          created_at: nowIso,
        },
      ],
      payouts: [
        {
          id: "p1",
          rider_id: "r1",
          payout_reference: "PAY-1",
          amount_paisa: 15000,
          fee_paisa: 0,
          net_amount_paisa: 15000,
          currency: "BDT",
          channel: "bkash",
          account_number_masked: "*******1234",
          status: "paid",
          requested_at: nowIso,
        },
      ],
      dailyGoalPaisa: 100000,
    });

    expect(summary.grossEarningsPaisa).toBe(40000);
    expect(summary.platformCommissionPaisa).toBe(6000);
    expect(summary.estimatedFuelCostPaisa).toBe(4000);
    expect(summary.netTakeHomePaisa).toBe(30000);
    expect(summary.availableForCashoutPaisa).toBe(15000); // 40k - 6k - 15k paid
    expect(summary.dailyProgressPct).toBe(30);
  });
});

describe("4. Zod Contract Schemas", () => {
  test("validates ride request bounds & OTP/POD/cashout rules", () => {
    expect(
      createRideRequestSchema.safeParse({
        vehicle_mode: "cng",
        ride_type: "airport_pickup",
        pickup_address: "Hazrat Shahjalal Airport",
        pickup_lat: 23.8433,
        pickup_lng: 90.3978,
        dropoff_address: "Gulshan 2",
        dropoff_lat: 23.7947,
        dropoff_lng: 90.4144,
        payment_method: "bkash",
      }).success
    ).toBe(true);

    // Out-of-Bangladesh rejection
    expect(
      createRideRequestSchema.safeParse({
        vehicle_mode: "sedan",
        pickup_address: "London",
        pickup_lat: 51.5,
        pickup_lng: -0.1,
        dropoff_address: "Paris",
        dropoff_lat: 48.8,
        dropoff_lng: 2.3,
      }).success
    ).toBe(false);

    expect(verifyOtpSchema.safeParse({ trip_id: "t1", otp: "4821", job_type: "ride_start" }).success).toBe(true);
    expect(verifyOtpSchema.safeParse({ trip_id: "t1", otp: "12", job_type: "ride_start" }).success).toBe(false);

    expect(
      podSubmitSchema.safeParse({
        job_id: "j1",
        delivery_otp: "5582",
        recipient_name: "Nadia Rahman",
        signature_svg_path: "M10,10 L40,35",
        signature_hash: "abcdef123456",
      }).success
    ).toBe(true);

    expect(
      payoutRequestSchema.safeParse({
        amount_paisa: 5000, // Below 100 BDT min
        channel: "bkash",
        account_number: "01711223344",
      }).success
    ).toBe(false);
  });
});

describe("5. Zustand useRiderStore End-to-End Lifecycle", () => {
  beforeEach(() => {
    useRiderStore.setState({
      profile: null,
      vehicles: [],
      dutyStatus: "offline",
      activeVehicleMode: "bike",
      openRideRequests: [],
      declinedRequestIds: [],
      deliveryJobs: [],
      bundledBatches: [],
      activeRideTrip: null,
      activeDeliveryJob: null,
      ledgerEntries: [],
      payouts: [],
      consumerActiveRide: null,
      consumerPassengerOtp: null,
      consumerRideHistory: [],
      isHydrated: false,
    });
  });

  test("bootstraps rider portal, toggles duty, claims ride, verifies OTP, and settles ledger", async () => {
    const store = useRiderStore.getState();
    await store.bootstrapRiderPortal({ id: "rider-test-user-01", name: "Kamrul Hasan" });

    expect(useRiderStore.getState().profile).not.toBeNull();
    expect(useRiderStore.getState().isLoading).toBe(false);
    expect(useRiderStore.getState().openRideRequests.length).toBeGreaterThan(0);

    await useRiderStore.getState().toggleDutyStatus();
    expect(useRiderStore.getState().dutyStatus).toBe("online");

    await useRiderStore.getState().setVehicleMode("cng");
    expect(useRiderStore.getState().activeVehicleMode).toBe("cng");

    const req: RideRequest = useRiderStore.getState().openRideRequests[0];
    const trip = await useRiderStore.getState().claimRideRequest(req);
    expect(useRiderStore.getState().activeRideTrip?.id).toBe(trip.id);
    expect(useRiderStore.getState().dutyStatus).toBe("on_trip");

    const otpHint = trip.start_otp_preview || "1234";
    const otpResult = await useRiderStore
      .getState()
      .verifyTripOtp(trip.id, otpHint, "ride_start", otpHint);
    expect(otpResult.verified).toBe(true);
    expect(useRiderStore.getState().activeRideTrip?.status).toBe("in_progress");

    const prevLedgerLen = useRiderStore.getState().ledgerEntries.length;
    await useRiderStore.getState().completeActiveRideTrip(2500);
    expect(useRiderStore.getState().activeRideTrip).toBeNull();
    expect(useRiderStore.getState().dutyStatus).toBe("online");
    expect(useRiderStore.getState().ledgerEntries.length).toBeGreaterThan(prevLedgerLen);
  });

  test("claims parcel delivery, submits POD with signature, and processes cashout", async () => {
    const store = useRiderStore.getState();
    await store.bootstrapRiderPortal();

    const firstParcel = useRiderStore.getState().deliveryJobs[0];
    expect(firstParcel).toBeDefined();

    const claimed = await useRiderStore.getState().claimDeliveryJob(firstParcel);
    const podOtp = claimed.delivery_otp_hint || "5582";

    const podRes = await useRiderStore.getState().submitDeliveryPOD(claimed, {
      jobId: claimed.id,
      deliveryOtp: podOtp,
      recipientName: "Farzana Yasmin",
      signatureSvgPath: "M5,5 L25,30 L45,15",
    });
    expect(podRes.verified).toBe(true);
    expect(podRes.updatedJob.status).toBe("delivered");

    const available = useRiderStore.getState().profitSummary.availableForCashoutPaisa;
    if (available >= 10000) {
      const payout = await useRiderStore.getState().requestCashout({
        amountPaisa: 10000,
        channel: "bkash",
        accountNumber: "01711223344",
      });
      expect(payout.amount_paisa).toBe(10000);
      expect(useRiderStore.getState().payouts.length).toBeGreaterThan(0);
    }
  });

  test("completes consumer ride-hailing quote comparison, booking, OTP issue, and safety SOS", async () => {
    const quotes = await useRiderStore.getState().refreshConsumerQuotes({
      pickupLat: 23.7947,
      pickupLng: 90.4144,
      dropoffLat: 23.8433,
      dropoffLng: 90.3978,
      promoCode: "AIRPORT15",
      rideType: "airport_pickup",
      weatherGuard: true,
    });
    expect(quotes.sedan.quoted_fare_paisa).toBeGreaterThan(0);
    expect(quotes.sedan.discount_paisa).toBeGreaterThan(0);

    const booked = await useRiderStore.getState().bookConsumerRide({
      vehicle_mode: "sedan",
      ride_type: "airport_pickup",
      pickup_address: "Gulshan 2 Circle, Dhaka",
      pickup_lat: 23.7947,
      pickup_lng: 90.4144,
      dropoff_address: "Hazrat Shahjalal Airport",
      dropoff_lat: 23.8433,
      dropoff_lng: 90.3978,
      payment_method: "bkash",
      flight_number: "BG-148",
    });

    expect(booked.passengerOtp).toHaveLength(6);
    expect(useRiderStore.getState().consumerActiveRide?.id).toBe(booked.request.id);

    const sos = await useRiderStore.getState().triggerSOS("Test SOS check");
    expect(sos.success).toBe(true);
    expect(useRiderStore.getState().safetySession.sosActive).toBe(true);

    await useRiderStore.getState().cancelConsumerRide(booked.request.id, "Plan changed");
    expect(useRiderStore.getState().consumerActiveRide).toBeNull();
  });
});

describe("6. Zustand useProviderHubStore Scheduling, Services & Photon Waypoints", () => {
  test("creates services, blocks calendar date ranges, resolves Photon waypoints, and cycles staff/maintenance", async () => {
    const provider = useProviderHubStore.getState();

    await provider.addService({
      title: "Sylhet Ratargul Boat & Guide",
      category: "Tour Guide",
      priceBdt: 3200,
      priceType: "fixed",
      duration: "6h",
      maxGroup: 5,
      area: "Sylhet",
      description: "Certified local nature guide",
      certifications: "BTB Licensed",
      instantBooking: true,
      photoUrls: [],
    });

    expect(
      useProviderHubStore
        .getState()
        .services.some((s) => s.title === "Sylhet Ratargul Boat & Guide")
    ).toBe(true);

    const blockedDays = useProviderHubStore
      .getState()
      .blockDateRange("2026-12-10", "2026-12-12");
    expect(blockedDays).toBe(3);
    expect(useProviderHubStore.getState().blockedDates["2026-12-11"]).toBe(true);

    const wp = await useProviderHubStore.getState().addWaypointBySearch("Banani Road 11");
    expect(wp).not.toBeNull();
    expect(wp?.label).toContain("Banani");

    const firstStaff = useProviderHubStore.getState().staff[0];
    useProviderHubStore.getState().toggleStaffStatus(firstStaff.id);
    expect(useProviderHubStore.getState().staff[0].status).not.toBe(firstStaff.status);

    const firstLog = useProviderHubStore.getState().maintenanceLogs[0];
    useProviderHubStore.getState().advanceMaintenanceStatus(firstLog.id);
    expect(useProviderHubStore.getState().maintenanceLogs[0].status).toBe("in_progress");
  });
});
