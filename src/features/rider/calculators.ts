import {
  BANGLADESH_BBOX,
  BundledDeliveryBatch,
  DeliveryJob,
  LocationBreadcrumb,
  NetProfitSummary,
  RideQuote,
  RideType,
  RiderLedgerEntry,
  RiderPayout,
  RiderPayoutChannel,
  VehicleMode,
} from "./types";

export interface VehicleTierSpec {
  mode: VehicleMode;
  label: string;
  labelBn: string;
  tagline: string;
  icon: string;
  baseFareBdt: number;
  perKmBdt: number;
  perMinBdt: number;
  minFareBdt: number;
  avgSpeedKmh: number;
  fuelCostPerKmBdt: number;
  seats: number;
  maxCargoKg: number;
}

export const VEHICLE_TIERS: Record<VehicleMode, VehicleTierSpec> = {
  bike: {
    mode: "bike",
    label: "Moto",
    labelBn: "বাইক রাইড",
    tagline: "Beat Dhaka traffic fast",
    icon: "bicycle-outline",
    baseFareBdt: 25,
    perKmBdt: 12,
    perMinBdt: 1.5,
    minFareBdt: 40,
    avgSpeedKmh: 28,
    fuelCostPerKmBdt: 3.2,
    seats: 1,
    maxCargoKg: 15,
  },
  cng: {
    mode: "cng",
    label: "CNG Auto",
    labelBn: "সিএনজি অটো",
    tagline: "Meter-locked covered ride",
    icon: "car-outline",
    baseFareBdt: 40,
    perKmBdt: 16,
    perMinBdt: 2.0,
    minFareBdt: 60,
    avgSpeedKmh: 24,
    fuelCostPerKmBdt: 2.8,
    seats: 3,
    maxCargoKg: 40,
  },
  sedan: {
    mode: "sedan",
    label: "AC Sedan",
    labelBn: "এসি সেডান",
    tagline: "Comfort city & airport transfers",
    icon: "car-sport-outline",
    baseFareBdt: 65,
    perKmBdt: 24,
    perMinBdt: 3.0,
    minFareBdt: 120,
    avgSpeedKmh: 26,
    fuelCostPerKmBdt: 7.5,
    seats: 4,
    maxCargoKg: 80,
  },
  suv: {
    mode: "suv",
    label: "Tourist SUV",
    labelBn: "ট্যুরিস্ট এসইউভি",
    tagline: "6-7 seats, hill & highway ready",
    icon: "bus-outline",
    baseFareBdt: 120,
    perKmBdt: 36,
    perMinBdt: 4.5,
    minFareBdt: 220,
    avgSpeedKmh: 30,
    fuelCostPerKmBdt: 11.5,
    seats: 7,
    maxCargoKg: 180,
  },
  boat: {
    mode: "boat",
    label: "River Boat",
    labelBn: "নৌকা / ট্রলার",
    tagline: "Sadarghat, Haor & Sundarbans crossings",
    icon: "boat-outline",
    baseFareBdt: 90,
    perKmBdt: 32,
    perMinBdt: 3.5,
    minFareBdt: 150,
    avgSpeedKmh: 16,
    fuelCostPerKmBdt: 9.0,
    seats: 8,
    maxCargoKg: 250,
  },
  parcel_rider: {
    mode: "parcel_rider",
    label: "ShopnoExpress Parcel",
    labelBn: "পার্সেল ডেলিভারি",
    tagline: "Artisan & hotel concierge courier",
    icon: "cube-outline",
    baseFareBdt: 35,
    perKmBdt: 10,
    perMinBdt: 1.0,
    minFareBdt: 50,
    avgSpeedKmh: 27,
    fuelCostPerKmBdt: 3.0,
    seats: 1,
    maxCargoKg: 35,
  },
};

export interface PromoRule {
  code: string;
  type: "percent" | "flat_bdt";
  value: number;
  maxDiscountBdt: number;
  description: string;
}

export const RIDE_PROMO_CODES: Record<string, PromoRule> = {
  SHOPNO10: {
    code: "SHOPNO10",
    type: "percent",
    value: 10,
    maxDiscountBdt: 80,
    description: "10% off up to ৳80 on any ride",
  },
  DHAKA50: {
    code: "DHAKA50",
    type: "flat_bdt",
    value: 50,
    maxDiscountBdt: 50,
    description: "৳50 instant discount in Dhaka Metro",
  },
  AIRPORT15: {
    code: "AIRPORT15",
    type: "percent",
    value: 15,
    maxDiscountBdt: 180,
    description: "15% off Airport Pickups (DAC/CXB/CGP/ZYL)",
  },
  EID20: {
    code: "EID20",
    type: "percent",
    value: 20,
    maxDiscountBdt: 150,
    description: "20% Festival Mobility Savings",
  },
};

export const PLATFORM_COMMISSION_RATE = 0.15; // 15%
export const MAX_FAIR_SURGE_MULTIPLIER = 1.25;

/**
 * Validates that coordinates fall inside Bangladesh's operational bounding box.
 */
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

/**
 * Computes great-circle distance in km between two WGS84 points.
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(0.2, Math.round(R * c * 100) / 100);
}

/**
 * Estimates GPS travel speed between two sequential breadcrumbs for anti-spoof sanity.
 */
export function calculateVelocityKmh(
  prev: Pick<LocationBreadcrumb, "latitude" | "longitude" | "recordedAt">,
  next: Pick<LocationBreadcrumb, "latitude" | "longitude" | "recordedAt">
): number {
  const t1 = new Date(prev.recordedAt).getTime();
  const t2 = new Date(next.recordedAt).getTime();
  const dtHours = Math.abs(t2 - t1) / 3_600_000;
  if (dtHours <= 0) return 0;
  const distKm = haversineDistanceKm(
    prev.latitude,
    prev.longitude,
    next.latitude,
    next.longitude
  );
  return Math.round((distKm / dtHours) * 10) / 10;
}

/**
 * Applies Fair Price Ceiling (1.00x .. 1.25x) and Weather Guard cap.
 */
export function clampFairSurgeMultiplier(
  requestedSurge: number,
  weatherGuardActive: boolean = false
): number {
  const safeSurge = Number.isFinite(requestedSurge) ? requestedSurge : 1.0;
  const clamped = Math.min(MAX_FAIR_SURGE_MULTIPLIER, Math.max(1.0, safeSurge));
  if (weatherGuardActive) {
    // Weather Guard locks surge at max 1.10x during rain/cyclone alerts so travelers aren't gouged
    return Math.min(1.1, clamped);
  }
  return Math.round(clamped * 100) / 100;
}

/**
 * Deterministic integer-paisa ride fare estimator (1 BDT = 100 paisa).
 */
export function estimateRideFare(params: {
  vehicleMode: VehicleMode;
  distanceKm: number;
  durationMin?: number;
  surgeMultiplier?: number;
  weatherGuard?: boolean;
  promoCode?: string;
  rideType?: RideType;
  fuelCostPerKmBdtOverride?: number;
}): RideQuote {
  const spec = VEHICLE_TIERS[params.vehicleMode];
  const distanceKm = Math.max(0.5, Math.round(params.distanceKm * 100) / 100);
  const durationMin = Math.max(
    4,
    params.durationMin ?? Math.round((distanceKm / spec.avgSpeedKmh) * 60)
  );

  const weatherGuardApplied = Boolean(params.weatherGuard);
  const effectiveSurge = clampFairSurgeMultiplier(
    params.surgeMultiplier ?? 1.0,
    weatherGuardApplied
  );

  const airportFeeBdt = params.rideType === "airport_pickup" ? 45 : 0;
  const baseFarePaisa = Math.round((spec.baseFareBdt + airportFeeBdt) * 100);
  const distanceFarePaisa = Math.round(
    (distanceKm * spec.perKmBdt + durationMin * spec.perMinBdt) * 100
  );
  const minFarePaisa = Math.round(spec.minFareBdt * 100);
  const preSurgePaisa = Math.max(minFarePaisa, baseFarePaisa + distanceFarePaisa);
  const surgedTotalPaisa = Math.round(preSurgePaisa * effectiveSurge);
  const surgePaisa = Math.max(0, surgedTotalPaisa - preSurgePaisa);

  const normalizedPromo = params.promoCode?.trim().toUpperCase();
  const promo = normalizedPromo ? RIDE_PROMO_CODES[normalizedPromo] : undefined;
  let discountPaisa = 0;

  if (promo) {
    if (promo.type === "percent") {
      discountPaisa = Math.min(
        Math.round(surgedTotalPaisa * (promo.value / 100)),
        promo.maxDiscountBdt * 100
      );
    } else {
      discountPaisa = Math.min(surgedTotalPaisa - 1000, promo.value * 100);
    }
    discountPaisa = Math.max(0, discountPaisa);
  }

  const quotedFarePaisa = Math.max(minFarePaisa, surgedTotalPaisa - discountPaisa);
  const platformCommissionPaisa = Math.round(quotedFarePaisa * PLATFORM_COMMISSION_RATE);
  const fuelRate = params.fuelCostPerKmBdtOverride ?? spec.fuelCostPerKmBdt;
  const estimatedFuelCostPaisa = Math.round(distanceKm * fuelRate * 100);
  const riderNetEstimatePaisa = Math.max(
    0,
    quotedFarePaisa - platformCommissionPaisa - estimatedFuelCostPaisa
  );

  const etaMap: Record<VehicleMode, number> = {
    bike: 3,
    cng: 5,
    sedan: 6,
    suv: 8,
    boat: 10,
    parcel_rider: 4,
  };

  return {
    vehicle_mode: params.vehicleMode,
    distance_km: distanceKm,
    duration_min: durationMin,
    base_fare_paisa: baseFarePaisa,
    distance_fare_paisa: distanceFarePaisa,
    surge_multiplier: effectiveSurge,
    surge_paisa: surgePaisa,
    weather_guard_applied: weatherGuardApplied,
    promo_code: promo ? promo.code : undefined,
    discount_paisa: discountPaisa,
    quoted_fare_paisa: quotedFarePaisa,
    platform_commission_paisa: platformCommissionPaisa,
    estimated_fuel_cost_paisa: estimatedFuelCostPaisa,
    rider_net_estimate_paisa: riderNetEstimatePaisa,
    eta_minutes: etaMap[params.vehicleMode],
    currency: "BDT",
  };
}

/**
 * Bundles nearby open delivery jobs into multi-stop route batches for higher rider hourly profit.
 */
export function batchDeliveryJobsByProximity(
  jobs: DeliveryJob[],
  maxBatchRadiusKm: number = 3.5,
  maxStops: number = 4
): BundledDeliveryBatch[] {
  const openJobs = jobs.filter((j) => j.status === "open");
  const visited = new Set<string>();
  const batches: BundledDeliveryBatch[] = [];

  for (const seed of openJobs) {
    if (visited.has(seed.id)) continue;
    visited.add(seed.id);
    const group: DeliveryJob[] = [seed];

    for (const candidate of openJobs) {
      if (visited.has(candidate.id) || group.length >= maxStops) continue;
      const pickupGap = haversineDistanceKm(
        seed.pickup_lat,
        seed.pickup_lng,
        candidate.pickup_lat,
        candidate.pickup_lng
      );
      const dropGap = haversineDistanceKm(
        seed.dropoff_lat,
        seed.dropoff_lng,
        candidate.dropoff_lat,
        candidate.dropoff_lng
      );

      if (pickupGap <= maxBatchRadiusKm || dropGap <= maxBatchRadiusKm) {
        group.push(candidate);
        visited.add(candidate.id);
      }
    }

    const totalDistanceKm =
      Math.round(
        group.reduce((sum, j) => sum + Number(j.estimated_distance_km || 1), 0) * 100
      ) / 100;
    const basePayout = group.reduce((sum, j) => sum + Number(j.rider_payout_paisa || 0), 0);
    const bonusPaisa = group.length > 1 ? Math.round(basePayout * 0.08) : 0;
    const totalWeightKg =
      Math.round(group.reduce((sum, j) => sum + Number(j.package_weight_kg || 1), 0) * 10) /
      10;

    batches.push({
      batchId: `BATCH-${group.map((j) => j.job_reference.slice(-4)).join("-")}`,
      jobs: group,
      stopCount: group.length,
      totalDistanceKm,
      totalPayoutPaisa: basePayout + bonusPaisa,
      bonusPaisa,
      totalWeightKg,
      areaLabel: seed.dropoff_address.split(",")[0] || "Dhaka Metro",
    });
  }

  return batches.sort((a, b) => b.stopCount - a.stopCount || b.totalPayoutPaisa - a.totalPayoutPaisa);
}

/**
 * Computes Smart Net-Profit & Fuel Tracker metrics directly from double-entry ledger & payouts.
 */
export function calculateNetProfitSummary(params: {
  entries: RiderLedgerEntry[];
  payouts: RiderPayout[];
  dailyGoalPaisa: number;
  totalRideCount?: number;
  totalDeliveryCount?: number;
}): NetProfitSummary {
  const todayIso = new Date().toISOString().slice(0, 10);

  let grossEarningsPaisa = 0;
  let platformCommissionPaisa = 0;
  let tipsPaisa = 0;
  let estimatedFuelCostPaisa = 0;
  let totalCreditsPaisa = 0;
  let totalNonPayoutDebitsPaisa = 0;
  let todayGrossPaisa = 0;
  let todayDeductionsPaisa = 0;

  for (const entry of params.entries) {
    const isToday = entry.created_at.slice(0, 10) === todayIso;
    if (entry.direction === "credit") {
      totalCreditsPaisa += entry.amount_paisa;
      if (
        entry.entry_type === "ride_fare" ||
        entry.entry_type === "delivery_fee" ||
        entry.entry_type === "surge_bonus"
      ) {
        grossEarningsPaisa += entry.amount_paisa;
        if (isToday) todayGrossPaisa += entry.amount_paisa;
      } else if (entry.entry_type === "tip") {
        tipsPaisa += entry.amount_paisa;
        if (isToday) todayGrossPaisa += entry.amount_paisa;
      }
    } else {
      if (entry.entry_type === "platform_commission") {
        platformCommissionPaisa += entry.amount_paisa;
        totalNonPayoutDebitsPaisa += entry.amount_paisa;
        if (isToday) todayDeductionsPaisa += entry.amount_paisa;
      } else if (entry.entry_type === "fuel_estimate") {
        estimatedFuelCostPaisa += entry.amount_paisa;
        if (isToday) todayDeductionsPaisa += entry.amount_paisa;
      } else if (entry.entry_type === "penalty") {
        totalNonPayoutDebitsPaisa += entry.amount_paisa;
        if (isToday) todayDeductionsPaisa += entry.amount_paisa;
      }
    }
  }

  let pendingPayoutsPaisa = 0;
  let paidOutPaisa = 0;
  for (const p of params.payouts) {
    if (p.status === "paid") {
      paidOutPaisa += p.amount_paisa;
    } else if (
      p.status === "requested" ||
      p.status === "approved" ||
      p.status === "processing"
    ) {
      pendingPayoutsPaisa += p.amount_paisa;
    }
  }

  const netBeforeFuelPaisa = Math.max(0, totalCreditsPaisa - totalNonPayoutDebitsPaisa);
  const netTakeHomePaisa = Math.max(0, netBeforeFuelPaisa - estimatedFuelCostPaisa);
  const availableForCashoutPaisa = Math.max(
    0,
    netTakeHomePaisa - paidOutPaisa - pendingPayoutsPaisa
  );

  const todayNetPaisa = Math.max(0, todayGrossPaisa - todayDeductionsPaisa);
  const goal = Math.max(10000, params.dailyGoalPaisa || 150000);
  const dailyProgressPct = Math.min(100, Math.round((todayNetPaisa / goal) * 100));

  return {
    grossEarningsPaisa,
    platformCommissionPaisa,
    tipsPaisa,
    estimatedFuelCostPaisa,
    netTakeHomePaisa,
    availableForCashoutPaisa,
    pendingPayoutsPaisa,
    paidOutPaisa,
    dailyGoalPaisa: goal,
    dailyProgressPct,
    todayGrossPaisa,
    todayNetPaisa,
    tripCount: params.totalRideCount ?? 0,
    deliveryCount: params.totalDeliveryCount ?? 0,
  };
}

export function formatPaisaBDT(paisa: number): string {
  const bdt = Math.round(paisa) / 100;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: bdt % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(bdt);
  return `৳${formatted}`;
}

export function maskAccountNumber(channel: RiderPayoutChannel, raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= 4) return `${channel.toUpperCase()} ••${trimmed}`;
  return `${channel.toUpperCase()} ••••${trimmed.slice(-4)}`;
}

export function createDeterministicHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `pod_${(hash >>> 0).toString(16).padStart(8, "0")}_${input.length.toString(16)}`;
}
