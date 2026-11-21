import { z } from "zod";
import { Ionicons } from "@expo/vector-icons";
import type { UIScreen } from "./screens";

export const primary = "#287dfa";
export const primaryDark = "#1b5ec2";
export const primaryLight = "#e8f2ff";
export const success = "#10b981";
export const warning = "#f59e0b";
export const danger = "#ef4444";
export const slateDark = "#0f172a";
export const slateCard = "#1e293b";
export const cardBg = "#ffffff";
export const borderSubtle = "#e2e8f0";
export const textPrimary = "#0f172a";
export const textSecondary = "#64748b";
export const textMuted = "#94a3b8";

// ============================================================================
// DYNAMIC CURRENCY & RATE UTILITIES
// ============================================================================

export type CurrencyCode = "USD" | "BDT" | "EUR" | "GBP";

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: "$",
  BDT: "৳",
  EUR: "€",
  GBP: "£",
};

export const FX_RATES_FROM_USD: Record<CurrencyCode, number> = {
  USD: 1.0,
  BDT: 121.5,
  EUR: 0.92,
  GBP: 0.79,
};

export function formatCurrency(
  amount: number,
  currency: CurrencyCode = "USD",
): string {
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  const converted = Math.round(amount * (FX_RATES_FROM_USD[currency] || 1));
  return `${symbol}${converted.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function convertFromUSD(amount: number, currency: CurrencyCode = "USD"): number {
  return Math.round(amount * (FX_RATES_FROM_USD[currency] || 1));
}

export function getFutureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ============================================================================
// STRICT ZOD SCHEMAS FOR FORM VALIDATION
// ============================================================================

export const emailZodSchema = z
  .string()
  .trim()
  .min(1, "Email address is required")
  .max(254, "Email exceeds maximum length")
  .email("Enter a valid RFC 5322 email address (e.g. traveler@domain.com)");

export const phoneZodSchema = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .regex(
    /^(\+?8801[3-9]\d{8}|01[3-9]\d{8}|\+[1-9]\d{1,14}|\d{10,14})$/,
    "Enter a valid mobile or international phone (e.g. +8801712345678 or +15550198)",
  );

export const passportZodSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, "Passport number is required")
  .regex(
    /^[A-Z0-9]{6,12}$/,
    "Passport must be 6-12 uppercase alphanumeric characters (ICAO Doc 9303)",
  );

export const nidZodSchema = z
  .string()
  .trim()
  .min(1, "National ID (NID) is required")
  .regex(
    /^(\d{10}|\d{13}|\d{17})$/,
    "National ID (NID) must be 10, 13, or 17 numeric digits",
  );

export const dateOfBirthZodSchema = z
  .string()
  .trim()
  .min(1, "Date of birth is required")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be in YYYY-MM-DD format")
  .refine((val) => {
    const parts = val.split("-");
    if (parts.length !== 3) return false;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return false;
    const date = new Date(y, m - 1, d);
    if (
      date.getFullYear() !== y ||
      date.getMonth() !== m - 1 ||
      date.getDate() !== d
    ) {
      return false;
    }
    const today = new Date();
    if (date > today) return false;
    const age = today.getFullYear() - y;
    return age >= 0 && age <= 125;
  }, "Enter a valid past date of birth (YYYY-MM-DD)");

export const travelerFormZodSchema = z.object({
  first_name: z
    .string()
    .trim()
    .min(2, "First name must be at least 2 characters")
    .max(50),
  last_name: z
    .string()
    .trim()
    .min(2, "Last name must be at least 2 characters")
    .max(50),
  email: emailZodSchema,
  phone: phoneZodSchema,
  passport_number: passportZodSchema,
  national_id: nidZodSchema,
  date_of_birth: dateOfBirthZodSchema,
  gender: z.enum(["male", "female", "other"]).default("male"),
  nationality: z
    .string()
    .trim()
    .min(2, "Nationality is required")
    .default("Bangladeshi"),
});

export type TravelerFormData = z.infer<typeof travelerFormZodSchema>;

// ============================================================================
// CENTRALIZED PRODUCT CATALOG & TEMPLATES
// ============================================================================

export type CheckoutProductType =
  | "flight"
  | "hotel"
  | "train"
  | "bus"
  | "tour";

export interface ProductTemplate {
  type: CheckoutProductType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  destinationCity: string;
  destinationCountry: string;
  originCity: string;
  basePriceUSD: number;
  summary: string;
  departureOffsetDays: number;
  durationDays: number;
}

export const PRODUCT_TEMPLATES: Record<CheckoutProductType, ProductTemplate> = {
  flight: {
    type: "flight",
    label: "Flights",
    icon: "airplane-outline",
    title: "DAC → NRT (Tokyo Narita)",
    originCity: "Dhaka",
    destinationCity: "Tokyo",
    destinationCountry: "Japan",
    basePriceUSD: 1480,
    departureOffsetDays: 14,
    durationDays: 8,
    summary: "Biman Bangladesh Airlines Boeing 787-9 Dreamliner (Economy Class)",
  },
  hotel: {
    type: "hotel",
    label: "Hotels",
    icon: "bed-outline",
    title: "Shinjuku Prince Grand Hotel & Suites",
    originCity: "Tokyo",
    destinationCity: "Tokyo",
    destinationCountry: "Japan",
    basePriceUSD: 850,
    departureOffsetDays: 14,
    durationDays: 6,
    summary: "Deluxe Executive Twin Room with Skyline View & Daily Breakfast",
  },
  train: {
    type: "train",
    label: "Trains",
    icon: "train-outline",
    title: "Suborno Express (DAC → CTG)",
    originCity: "Dhaka",
    destinationCity: "Chittagong",
    destinationCountry: "Bangladesh",
    basePriceUSD: 45,
    departureOffsetDays: 3,
    durationDays: 1,
    summary: "AC Chair (Snigdha Class) with Reserved Ergonomic Seating",
  },
  bus: {
    type: "bus",
    label: "Buses",
    icon: "bus-outline",
    title: "Shohag Elite Scania Multi-Axle VIP",
    originCity: "Dhaka",
    destinationCity: "Cox's Bazar",
    destinationCountry: "Bangladesh",
    basePriceUSD: 35,
    departureOffsetDays: 5,
    durationDays: 3,
    summary: "Luxury Business Class Sleeper Coach with Onboard Refreshments",
  },
  tour: {
    type: "tour",
    label: "Tours",
    icon: "compass-outline",
    title: "Sajek Valley Clouds & Eco-Retreat",
    originCity: "Dhaka",
    destinationCity: "Sajek Valley",
    destinationCountry: "Bangladesh",
    basePriceUSD: 320,
    departureOffsetDays: 10,
    durationDays: 3,
    summary: "All-Inclusive Mountain Eco-Resort, 4x4 Chander Gari & Native Guide",
  },
};

// ============================================================================
// PROMO CODE REGISTRY
// ============================================================================

export interface PromoRule {
  code: string;
  title: string;
  description: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minSpendUSD: number;
  expiryDate: string;
  applicableCategory?: CheckoutProductType | "all";
}

export const REGISTERED_PROMOS: PromoRule[] = [
  {
    code: "SHOPNO10",
    title: "গ্লোবাল ১০% ছাড় (Global 10% Off)",
    description: "সকল সার্ভিসে বেস ফেয়ারে ১০% তাৎক্ষণিক ছাড়",
    discountType: "percentage",
    discountValue: 10,
    minSpendUSD: 40,
    expiryDate: "২০২৬-১২-৩১",
    applicableCategory: "all",
  },
  {
    code: "FLYMORE",
    title: "লং-হল $50 (৳6,000) ছাড়",
    description: "ফ্লাইট ও প্যাকেজ সার্ভিসে $50 ফ্ল্যাট ছাড়",
    discountType: "fixed",
    discountValue: 50,
    minSpendUSD: 250,
    expiryDate: "২০২৬-১১-৩০",
    applicableCategory: "flight",
  },
  {
    code: "EID15",
    title: "ছুটির উৎসব ১৫% ছাড় (Eid Special 15%)",
    description: "ডোমেস্টিক ও আন্তর্জাতিক বুকিংয়ে ১৫% সিজনাল সেভিংস",
    discountType: "percentage",
    discountValue: 15,
    minSpendUSD: 80,
    expiryDate: "২০২৬-১২-২৫",
    applicableCategory: "all",
  },
  {
    code: "EXPEDITION25",
    title: "ট্যুর ভাউচার $25 (৳3,000) ছাড়",
    description: "সকল ট্যুর ও এক্সপেডিশন বুকিংয়ে $25 তাৎক্ষণিক ছাড়",
    discountType: "fixed",
    discountValue: 25,
    minSpendUSD: 120,
    expiryDate: "২০২৬-১২-১৫",
    applicableCategory: "tour",
  },
  {
    code: "HOTELSTAY",
    title: "হোটেল ও রিসোর্ট ১২% ছাড়",
    description: "প্রিমিয়াম হোটেল ও হোমস্টে বুকিংয়ে ১২% এক্সক্লুসিভ ছাড়",
    discountType: "percentage",
    discountValue: 12,
    minSpendUSD: 60,
    expiryDate: "২০২৬-১১-২০",
    applicableCategory: "hotel",
  },
];

export const STEP_TITLES: Record<1 | 2 | 3 | 4, string> = {
  1: "যাত্রীর তথ্য (Traveler Details)",
  2: "অ্যাড-অন ও অতিরিক্ত সেবা (Addons & Extras)",
  3: "বুকিং সারাংশ ও নীতি (Summary & Policy)",
  4: "পেমেন্ট ও নিশ্চিতকরণ (Payment & Confirm)",
};

export const SAVED_PASSENGERS_STORAGE_KEY = "@travel_saved_passengers_v3";
export const BOOKING_DRAFT_STORAGE_KEY = "@booking_active_draft_v3";

export const DEFAULT_SAVED_PASSENGERS: TravelerFormData[] = [
  {
    first_name: "Tanvir",
    last_name: "Hossain",
    email: "tanvir.hossain@example.com",
    phone: "+8801712345678",
    passport_number: "A09876543",
    national_id: "1994123456789",
    date_of_birth: "1994-08-20",
    gender: "male",
    nationality: "Bangladeshi",
  },
  {
    first_name: "Nusrat",
    last_name: "Jahan",
    email: "nusrat.jahan@example.com",
    phone: "+8801812345678",
    passport_number: "B12345678",
    national_id: "1997987654321",
    date_of_birth: "1997-03-15",
    gender: "female",
    nationality: "Bangladeshi",
  },
  {
    first_name: "Rafiqul",
    last_name: "Islam",
    email: "rafiq.islam@example.com",
    phone: "+8801912345678",
    passport_number: "A11223344",
    national_id: "1988112233445",
    date_of_birth: "1988-11-10",
    gender: "male",
    nationality: "Bangladeshi",
  },
];

export const defaultScreen: UIScreen = {
  slug: "booking-system",
  source: "booking",
  title: "Booking Checkout Engine",
  subtitle: "Centralized Reservation & Payment Hub",
  kind: "booking",
  theme: "trip",
};
