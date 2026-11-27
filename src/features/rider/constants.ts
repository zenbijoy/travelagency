import { DemandHotspotZone, OfflineMapPackStatus, VehicleMode } from "./types";

export interface MobilityHubPreset {
  id: string;
  code: string;
  name: string;
  nameBn: string;
  city: string;
  district: string;
  lat: number;
  lng: number;
  isAirport?: boolean;
}

export const BANGLADESH_MOBILITY_HUBS: MobilityHubPreset[] = [
  {
    id: "hub-dac-airport",
    code: "DAC",
    name: "Hazrat Shahjalal International Airport (Terminal 1 & 2)",
    nameBn: "হযরত শাহজালাল আন্তর্জাতিক বিমানবন্দর",
    city: "Dhaka",
    district: "Dhaka",
    lat: 23.8433,
    lng: 90.3978,
    isAirport: true,
  },
  {
    id: "hub-gulshan-2",
    code: "GUL2",
    name: "Gulshan 2 Circle, Diplomatic Zone",
    nameBn: "গুলশান ২ সার্কেল",
    city: "Dhaka",
    district: "Dhaka",
    lat: 23.7947,
    lng: 90.4144,
  },
  {
    id: "hub-banani-11",
    code: "BAN",
    name: "Banani Road 11 Bridge Hub",
    nameBn: "বনানী রোড ১১",
    city: "Dhaka",
    district: "Dhaka",
    lat: 23.7925,
    lng: 90.4078,
  },
  {
    id: "hub-motijheel",
    code: "MOT",
    name: "Motijheel Commercial CBD & Metro Station",
    nameBn: "মতিঝিল বাণিজ্যিক এলাকা",
    city: "Dhaka",
    district: "Dhaka",
    lat: 23.733,
    lng: 90.4172,
  },
  {
    id: "hub-dhanmondi-27",
    code: "DHN",
    name: "Dhanmondi 27 / Sobhanbagh",
    nameBn: "ধানমন্ডি ২৭",
    city: "Dhaka",
    district: "Dhaka",
    lat: 23.7549,
    lng: 90.3761,
  },
  {
    id: "hub-sadarghat",
    code: "SDG",
    name: "Sadarghat River Launch Terminal",
    nameBn: "সদরঘাট লঞ্চ টার্মিনাল",
    city: "Dhaka",
    district: "Dhaka",
    lat: 23.7056,
    lng: 90.4086,
  },
  {
    id: "hub-cxb-airport",
    code: "CXB",
    name: "Cox's Bazar Airport Arrival Concourse",
    nameBn: "কক্সবাজার বিমানবন্দর",
    city: "Cox's Bazar",
    district: "Cox's Bazar",
    lat: 21.4522,
    lng: 91.9639,
    isAirport: true,
  },
  {
    id: "hub-kolatoli",
    code: "KLT",
    name: "Kolatoli Marine Drive Beach Point",
    nameBn: "কলাতলী বিচ পয়েন্ট",
    city: "Cox's Bazar",
    district: "Cox's Bazar",
    lat: 21.4184,
    lng: 91.9815,
  },
  {
    id: "hub-cgp-airport",
    code: "CGP",
    name: "Shah Amanat International Airport",
    nameBn: "শাহ আমানত বিমানবন্দর, চট্টগ্রাম",
    city: "Chattogram",
    district: "Chattogram",
    lat: 22.2496,
    lng: 91.8133,
    isAirport: true,
  },
  {
    id: "hub-zyl-airport",
    code: "ZYL",
    name: "Osmani International Airport",
    nameBn: "ওসমানী বিমানবন্দর, সিলেট",
    city: "Sylhet",
    district: "Sylhet",
    lat: 24.9632,
    lng: 91.8668,
    isAirport: true,
  },
  {
    id: "hub-mongla-ghat",
    code: "MGL",
    name: "Mongla Sundarbans Boat Ghat",
    nameBn: "মোংলা সুন্দরবন বোট ঘাট",
    city: "Khulna",
    district: "Bagerhat",
    lat: 22.4876,
    lng: 89.5919,
  },
];

export const DEFAULT_DEMAND_HOTSPOTS: DemandHotspotZone[] = [
  {
    id: "zone-gulshan-banani",
    name: "Gulshan – Banani Corridor",
    nameBn: "গুলশান-বনানী করিডোর",
    city: "Dhaka",
    latitude: 23.7937,
    longitude: 90.4066,
    demandScore: 92,
    activeRequests: 38,
    availableRiders: 16,
    surgeMultiplier: 1.2,
    recommendedVehicle: "sedan",
    peakWindow: "08:30–11:30 & 17:30–21:00",
  },
  {
    id: "zone-dac-airport",
    name: "Shahjalal Airport (DAC) Arrivals",
    nameBn: "শাহজালাল বিমানবন্দর (DAC)",
    city: "Dhaka",
    latitude: 23.8433,
    longitude: 90.3978,
    demandScore: 89,
    activeRequests: 24,
    availableRiders: 11,
    surgeMultiplier: 1.25,
    recommendedVehicle: "suv",
    peakWindow: "22:00–02:30 & 06:00–09:30",
  },
  {
    id: "zone-motijheel-kawran",
    name: "Motijheel – Karwan Bazar Metro",
    nameBn: "মতিঝিল-কারওয়ান বাজার",
    city: "Dhaka",
    latitude: 23.7509,
    longitude: 90.3935,
    demandScore: 86,
    activeRequests: 45,
    availableRiders: 22,
    surgeMultiplier: 1.15,
    recommendedVehicle: "bike",
    peakWindow: "09:00–19:00",
  },
  {
    id: "zone-dhanmondi-mirpur",
    name: "Dhanmondi 27 & Mirpur Road",
    nameBn: "ধানমন্ডি ২৭ ও মিরপুর রোড",
    city: "Dhaka",
    latitude: 23.7549,
    longitude: 90.3761,
    demandScore: 78,
    activeRequests: 29,
    availableRiders: 19,
    surgeMultiplier: 1.1,
    recommendedVehicle: "cng",
    peakWindow: "13:00–20:30",
  },
  {
    id: "zone-old-dhaka-craft",
    name: "Old Dhaka & Jamdani Parcel Hub",
    nameBn: "পুরান ঢাকা ও জামদানি পার্সেল হাব",
    city: "Dhaka",
    latitude: 23.7115,
    longitude: 90.4071,
    demandScore: 84,
    activeRequests: 31,
    availableRiders: 12,
    surgeMultiplier: 1.15,
    recommendedVehicle: "parcel_rider",
    peakWindow: "11:00–18:00",
  },
  {
    id: "zone-coxs-kolatoli",
    name: "Cox's Bazar Kolatoli & Marine Drive",
    nameBn: "কক্সবাজার মেরিন ড্রাইভ",
    city: "Cox's Bazar",
    latitude: 21.4184,
    longitude: 91.9815,
    demandScore: 81,
    activeRequests: 19,
    availableRiders: 9,
    surgeMultiplier: 1.18,
    recommendedVehicle: "suv",
    peakWindow: "15:00–21:30",
  },
  {
    id: "zone-sundarbans-mongla",
    name: "Mongla River Ghat Crossing",
    nameBn: "মোংলা নৌ-ঘাট",
    city: "Khulna",
    latitude: 22.4876,
    longitude: 89.5919,
    demandScore: 74,
    activeRequests: 11,
    availableRiders: 5,
    surgeMultiplier: 1.12,
    recommendedVehicle: "boat",
    peakWindow: "06:30–14:00",
  },
];

export const DEFAULT_OFFLINE_MAP_PACKS: OfflineMapPackStatus[] = [
  {
    id: "dhaka-metro-core-v1",
    name: "Dhaka Metro Core (PMTiles + OSM)",
    nameBn: "ঢাকা মেট্রো অফলাইন ম্যাপ",
    region: "Dhaka Division",
    bounds: [
      [90.3, 23.68],
      [90.5, 23.9],
    ],
    sizeMb: 42.5,
    version: "v2026.11",
    status: "cached",
    progressPct: 100,
    lastSyncedAt: "2026-11-25T10:00:00Z",
  },
  {
    id: "ctg-port-corridor-v1",
    name: "Chattogram Port & Patenga",
    nameBn: "চট্টগ্রাম ও পতেঙ্গা প্যাক",
    region: "Chattogram",
    bounds: [
      [91.72, 22.2],
      [91.92, 22.45],
    ],
    sizeMb: 28.0,
    version: "v2026.11",
    status: "not_downloaded",
    progressPct: 0,
  },
  {
    id: "coxs-bazar-coastal-v1",
    name: "Cox's Bazar & Marine Drive",
    nameBn: "কক্সবাজার মেরিন ড্রাইভ",
    region: "Cox's Bazar",
    bounds: [
      [91.92, 21.15],
      [92.18, 21.5],
    ],
    sizeMb: 19.4,
    version: "v2026.11",
    status: "not_downloaded",
    progressPct: 0,
  },
  {
    id: "sylhet-haor-v1",
    name: "Sylhet & Sreemangal Tea Trails",
    nameBn: "সিলেট ও শ্রীমঙ্গল",
    region: "Sylhet",
    bounds: [
      [91.65, 24.25],
      [92.05, 25.05],
    ],
    sizeMb: 24.2,
    version: "v2026.11",
    status: "not_downloaded",
    progressPct: 0,
  },
];

export const VEHICLE_MODE_LABELS: Record<VehicleMode, { en: string; bn: string }> = {
  bike: { en: "Moto", bn: "বাইক" },
  cng: { en: "CNG", bn: "সিএনজি" },
  sedan: { en: "AC Sedan", bn: "এসি সেডান" },
  suv: { en: "Tourist SUV", bn: "ট্যুরিস্ট এসইউভি" },
  boat: { en: "River Boat", bn: "নৌকা" },
  parcel_rider: { en: "Parcel Rider", bn: "পার্সেল রাইডার" },
};

export interface TurnManeuver {
  instruction: string;
  distanceKm: number;
  timeSeconds: number;
  icon: "arrow-up" | "arrow-redo" | "arrow-undo" | "flag";
}

/**
 * Generates realistic turn-by-turn maneuvers between two coordinates when
 * the Valhalla/BDMapClient routing engine is offline.
 */
export function buildFallbackTurnManeuvers(
  originLabel: string,
  destLabel: string,
  totalDistanceKm: number,
  totalDurationMin: number
): TurnManeuver[] {
  const seg1 = Math.max(0.2, Math.round(totalDistanceKm * 0.25 * 10) / 10);
  const seg2 = Math.max(0.3, Math.round(totalDistanceKm * 0.55 * 10) / 10);
  const seg3 = Math.max(0.1, Math.round((totalDistanceKm - seg1 - seg2) * 10) / 10);
  const totalSec = Math.max(120, totalDurationMin * 60);

  return [
    {
      instruction: `Head out from ${originLabel.split(",")[0]} toward main arterial road`,
      distanceKm: seg1,
      timeSeconds: Math.round(totalSec * 0.25),
      icon: "arrow-up",
    },
    {
      instruction: `Continue straight via primary corridor toward ${destLabel.split(",")[0]}`,
      distanceKm: seg2,
      timeSeconds: Math.round(totalSec * 0.55),
      icon: "arrow-redo",
    },
    {
      instruction: `Arrive at ${destLabel.split(",")[0]} dropoff point`,
      distanceKm: seg3,
      timeSeconds: Math.round(totalSec * 0.2),
      icon: "flag",
    },
  ];
}
