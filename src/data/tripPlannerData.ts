import { Ionicons } from "@expo/vector-icons";
import {
  Currency,
  TravelStyle,
  BudgetLevel,
  TripPlannerEngineRequest,
  tripPlannerEngine,
  getCuratedFallbackItinerary,
  llmProviderRegistry,
} from "../services/ai";
import { buildTripPlannerEnginePrompt } from "../services/ai/prompts";

export const USD_TO_BDT_RATE = 120;
export const GENERATION_TIMEOUT_MS = 15000;
export const TRIVIA_INTERVAL_MS = 2500;

export const formatCurrency = (amount: number, currency: Currency): string => {
  const safeAmount = isNaN(amount) ? 0 : Math.round(amount);
  return currency === "BDT" ? `৳${safeAmount.toLocaleString()}` : `$${safeAmount.toLocaleString()}`;
};

export interface DestinationItem {
  name: string;
  country: string;
  tag: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export const DESTINATION_CATALOG: DestinationItem[] = [
  // Bangladesh Local Destinations
  { name: "Cox's Bazar", country: "Bangladesh", tag: "Beach & Waves", icon: "water-outline" },
  { name: "Sylhet", country: "Bangladesh", tag: "Tea & Waterfalls", icon: "leaf-outline" },
  { name: "Sreemangal", country: "Bangladesh", tag: "Rainforest & Birds", icon: "leaf-outline" },
  { name: "Bandarban", country: "Bangladesh", tag: "Hills & Clouds", icon: "trail-sign-outline" },
  { name: "Rangamati", country: "Bangladesh", tag: "Lake & Culture", icon: "boat-outline" },
  { name: "Sajek Valley", country: "Bangladesh", tag: "Cloud Haven", icon: "cloudy-outline" },
  { name: "Saint Martin", country: "Bangladesh", tag: "Coral Island", icon: "sunny-outline" },
  { name: "Kuakata", country: "Bangladesh", tag: "Sunrise & Sunset", icon: "sunny-outline" },
  { name: "Sundarbans", country: "Bangladesh", tag: "Mangrove & Tiger", icon: "footsteps-outline" },
  { name: "Dhaka", country: "Bangladesh", tag: "Heritage & Food", icon: "business-outline" },
  { name: "Chittagong", country: "Bangladesh", tag: "Port & Hills", icon: "boat-outline" },
  // International Popular Destinations
  { name: "Bali", country: "Indonesia", tag: "Tropical Island", icon: "sunny-outline" },
  { name: "Tokyo", country: "Japan", tag: "Futuristic & Culture", icon: "sparkles-outline" },
  { name: "Bangkok", country: "Thailand", tag: "Nightlife & Temples", icon: "restaurant-outline" },
  { name: "Dubai", country: "UAE", tag: "Skyline & Desert", icon: "diamond-outline" },
  { name: "Singapore", country: "Singapore", tag: "Garden City", icon: "leaf-outline" },
  { name: "Paris", country: "France", tag: "Art & Romance", icon: "heart-outline" },
  { name: "Istanbul", country: "Turkey", tag: "Eurasia Crossroads", icon: "color-palette-outline" },
  { name: "Rome", country: "Italy", tag: "Historic Wonders", icon: "book-outline" },
  { name: "Kuala Lumpur", country: "Malaysia", tag: "Metropolis & Food", icon: "business-outline" },
  { name: "Kathmandu", country: "Nepal", tag: "Himalayan Vistas", icon: "trail-sign-outline" },
];

export const ORIGIN_SUGGESTIONS = [
  "Dhaka",
  "Chittagong",
  "Sylhet",
  "Cox's Bazar",
  "Rajshahi",
  "Khulna",
  "Barisal",
  "Rangpur",
];

export const DURATION_PRESETS = [
  { label: "3 Days", days: 3, subtitle: "Weekend Getaway" },
  { label: "5 Days", days: 5, subtitle: "Classic Tour" },
  { label: "7 Days", days: 7, subtitle: "1-Week Explorer" },
  { label: "10 Days", days: 10, subtitle: "Deep Discovery" },
  { label: "14 Days", days: 14, subtitle: "Grand Voyage" },
];

export interface TravelStyleConfig {
  id: TravelStyle;
  label: string;
  desc: string;
  suggestedGuests: number;
  icon: keyof typeof Ionicons.glyphMap;
}

export const TRAVEL_STYLES: TravelStyleConfig[] = [
  {
    id: "backpacker",
    label: "Backpacker",
    desc: "Hostels, street eats & public transit",
    suggestedGuests: 1,
    icon: "bag-outline",
  },
  {
    id: "solo",
    label: "Solo Explorer",
    desc: "Freedom, local immersion & photography",
    suggestedGuests: 1,
    icon: "compass-outline",
  },
  {
    id: "couple",
    label: "Couple Getaway",
    desc: "Romantic dining, scenic views & sunsets",
    suggestedGuests: 2,
    icon: "heart-outline",
  },
  {
    id: "family",
    label: "Family Vacation",
    desc: "Kid-friendly pacing & comfortable stays",
    suggestedGuests: 4,
    icon: "people-outline",
  },
  {
    id: "luxury",
    label: "Luxury Escape",
    desc: "5-star resorts, private transit & fine dining",
    suggestedGuests: 2,
    icon: "diamond-outline",
  },
];

export interface BudgetTierConfig {
  id: BudgetLevel;
  label: string;
  dailyRateBdt: number;
  dailyRateUsd: number;
  tagline: string;
}

export const BUDGET_TIERS: BudgetTierConfig[] = [
  {
    id: "budget",
    label: "Budget",
    dailyRateBdt: 2500,
    dailyRateUsd: 25,
    tagline: "Essential & savvy",
  },
  {
    id: "moderate",
    label: "Moderate",
    dailyRateBdt: 6000,
    dailyRateUsd: 60,
    tagline: "Comfort & balanced",
  },
  {
    id: "luxury",
    label: "Luxury",
    dailyRateBdt: 15000,
    dailyRateUsd: 150,
    tagline: "Premium & lavish",
  },
  {
    id: "custom",
    label: "Custom",
    dailyRateBdt: 7000,
    dailyRateUsd: 70,
    tagline: "Tailored amount",
  },
];

export const INTEREST_OPTIONS = [
  { label: "Beach & Coast", icon: "water-outline" },
  { label: "Hiking & Nature", icon: "leaf-outline" },
  { label: "Authentic Food", icon: "restaurant-outline" },
  { label: "Culture & History", icon: "color-palette-outline" },
  { label: "Photography", icon: "camera-outline" },
  { label: "Local Shopping", icon: "cart-outline" },
  { label: "Wellness & Spa", icon: "flower-outline" },
  { label: "Nightlife & Cafes", icon: "wine-outline" },
  { label: "Water Sports", icon: "boat-outline" },
  { label: "Hidden Gems", icon: "sparkles-outline" },
];

export const TRAVEL_TRIVIA = [
  {
    category: "NATURAL WONDER",
    icon: "water-outline",
    fact: "Cox's Bazar in Bangladesh boasts the longest unbroken natural sand sea beach on Earth, extending over 120 km (75 miles) along the Bay of Bengal.",
  },
  {
    category: "TEA HERITAGE",
    icon: "leaf-outline",
    fact: "Sylhet's rolling emerald hills host over 150 tea estates, home to the legendary seven-layer tea served at Nilkantha Tea Cabin in Sreemangal.",
  },
  {
    category: "MOUNTAIN SECRET",
    icon: "trail-sign-outline",
    fact: "Bandarban's Nilgiri and Keokradong peaks allow early risers to stand above a majestic blanket of clouds as the morning sun crests the horizon.",
  },
  {
    category: "CULINARY TRADITION",
    icon: "restaurant-outline",
    fact: "Old Dhaka (Puran Dhaka) is celebrated worldwide for heritage mutton kacchi biryani, slow-baked bakarkhani bread, and centuries-old spice bazaars.",
  },
  {
    category: "CORAL HAVEN",
    icon: "sunny-outline",
    fact: "Saint Martin's Island (Narikel Jinjira) is Bangladesh's sole coral reef island, renowned for tranquil coconut groves, fresh green coconuts, and crystal lagoons.",
  },
  {
    category: "BUDGETING SCIENCE",
    icon: "pie-chart-outline",
    fact: "Our 40/30/20/10 formula allocates 40% for hotel comfort, 30% for seamless transit, 20% for culinary gems, and 10% for bucket-list experiences.",
  },
  {
    category: "TRANSIT ICON",
    icon: "train-outline",
    fact: "Tokyo's Shinjuku station is the world's busiest transportation hub, with more than 3.5 million commuters passing through its 200+ exits daily.",
  },
  {
    category: "PACKING PRO-TIP",
    icon: "bag-check-outline",
    fact: "Compression packing cubes and rolled clothing can reduce luggage volume by up to 40% while preventing creases on travel shirts.",
  },
];

export const tripPlanner = {
  async generateItinerary(
    request: TripPlannerEngineRequest,
    options?: { signal?: AbortSignal }
  ): Promise<string> {
    if (options?.signal?.aborted) {
      throw new DOMException("The request was aborted", "AbortError");
    }

    try {
      const { systemPrompt, userPrompt } = buildTripPlannerEnginePrompt(request);
      const completion = await llmProviderRegistry.executeWithFallback({
        systemPrompt,
        userPrompt,
        temperature: 0.2,
        abortSignal: options?.signal,
        responseMimeType: "application/json",
      });
      return completion.text;
    } catch (err: any) {
      if (err.name === "AbortError" || options?.signal?.aborted) {
        throw err;
      }
      try {
        const result = await tripPlannerEngine.planTrip(request);
        return JSON.stringify(result.plan);
      } catch {
        const fallback = getCuratedFallbackItinerary(request);
        return JSON.stringify(fallback);
      }
    }
  },
};

export interface EditingActivityContext {
  dayIndex: number;
  activityIndex: number;
  time: string;
  activity: string;
  location: string;
  estimatedCost: string;
  duration: string;
  notes: string;
}
