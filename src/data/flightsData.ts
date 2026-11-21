import { formatLocalizedDate } from "../utils/formatters";

export const TRIP_BLUE = "#E5A93C"; // Luxury Gold Design Token
export const ACCENT_ORANGE = "#D4A03D";
export const ACCENT_GREEN = "#10b981";

// ============================================================================
// Configuration & Business Rules
// ============================================================================

export const FARE_RULES = {
  TAX_RATE: 0.12, // 12% Airport Authority, Terminal & Security Taxes
  FUEL_SURCHARGE_RATE: 0.08, // 8% Carrier Jet Fuel Fluctuation Surcharge
  CARBON_OFFSET_USD: 14, // $14 USD per passenger for certified climate contribution
  CARBON_OFFSET_BDT: 1200, // ৳1200 BDT per passenger
  CHILD_FARE_RATIO: 0.75, // 25% discount for children (2-11 yrs)
  INFANT_FARE_RATIO: 0.1, // 90% discount for lap infants (under 2 yrs)
};

export const formatDisplayDate = (d: Date, locale?: string): string => {
  return formatLocalizedDate(d, "short", locale);
};

export const formatIsoDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const getCurrencySymbol = (currency = "USD"): string => {
  const c = currency.toUpperCase();
  if (c === "BDT") return "৳";
  if (c === "EUR") return "€";
  if (c === "GBP") return "£";
  if (c === "JPY") return "¥";
  return "$";
};

// ============================================================================
// Types & Catalogs
// ============================================================================

export interface Airport {
  code: string;
  name: string;
  city: string;
  country: string;
  countryCode?: string;
  id?: string;
}

export type CabinClassType = "Economy" | "Premium" | "Business" | "First";

export interface PassengerCounts {
  adults: number;
  children: number;
  infants: number;
}

export type SortCriteria = "cheapest" | "fastest" | "best" | "price" | "duration" | "departure";
export type StopsFilterOption = "all" | "nonstop" | "stops";

export interface FlightItem {
  id: string;
  flight_number: string;
  airline_id?: string;
  departure_airport_id?: string;
  arrival_airport_id?: string;
  departure_time: string;
  arrival_time: string;
  flight_duration: number; // in minutes
  stops: number;
  aircraft_type: string;
  cabin_class: CabinClassType;
  base_price: number;
  currency: string;
  total_seats: number;
  available_seats: number;
  baggage_allowance?: string;
  amenities?: string[];
  layover_info?: string;
  layover_duration_minutes?: number;
  cancellation_policy?: string;
  is_live_db?: boolean;
  departure_airport?: {
    id?: string;
    iata_code: string;
    name: string;
    city: string;
    country?: string;
  };
  arrival_airport?: {
    id?: string;
    iata_code: string;
    name: string;
    city: string;
    country?: string;
  };
  airline?: {
    id?: string;
    name: string;
    iata_code?: string;
    logo_url?: string;
  };
}

export interface FareBreakdown {
  adultCost: number;
  childCost: number;
  infantCost: number;
  baseFare: number;
  airportTaxes: number;
  fuelSurcharge: number;
  carbonOffset: number;
  total: number;
  perPerson: number;
  totalPax: number;
  currencySymbol: string;
}

// Global Hub Catalog
export const POPULAR_AIRPORTS: Airport[] = [
  {
    code: "DAC",
    name: "Hazrat Shahjalal International Airport",
    city: "Dhaka",
    country: "Bangladesh",
    countryCode: "BD",
  },
  {
    code: "BKK",
    name: "Suvarnabhumi Airport",
    city: "Bangkok",
    country: "Thailand",
    countryCode: "TH",
  },
  {
    code: "DXB",
    name: "Dubai International Airport",
    city: "Dubai",
    country: "United Arab Emirates",
    countryCode: "AE",
  },
  {
    code: "SIN",
    name: "Singapore Changi Airport",
    city: "Singapore",
    country: "Singapore",
    countryCode: "SG",
  },
  {
    code: "LHR",
    name: "London Heathrow Airport",
    city: "London",
    country: "United Kingdom",
    countryCode: "GB",
  },
  {
    code: "JFK",
    name: "John F. Kennedy International Airport",
    city: "New York",
    country: "United States",
    countryCode: "US",
  },
  {
    code: "PVG",
    name: "Shanghai Pudong International Airport",
    city: "Shanghai",
    country: "China",
    countryCode: "CN",
  },
  {
    code: "HND",
    name: "Tokyo Haneda Airport",
    city: "Tokyo",
    country: "Japan",
    countryCode: "JP",
  },
  {
    code: "CXB",
    name: "Cox's Bazar Airport",
    city: "Cox's Bazar",
    country: "Bangladesh",
    countryCode: "BD",
  },
  {
    code: "KUL",
    name: "Kuala Lumpur International Airport",
    city: "Kuala Lumpur",
    country: "Malaysia",
    countryCode: "MY",
  },
  {
    code: "DOH",
    name: "Hamad International Airport",
    city: "Doha",
    country: "Qatar",
    countryCode: "QA",
  },
  {
    code: "CDG",
    name: "Paris Charles de Gaulle Airport",
    city: "Paris",
    country: "France",
    countryCode: "FR",
  },
];

export const CABIN_CLASSES: {
  id: CabinClassType;
  title: string;
  subtitle: string;
  multiplier: number;
  badge: string;
}[] = [
  {
    id: "Economy",
    title: "Economy",
    subtitle: "Standard comfort & best value fare",
    multiplier: 1.0,
    badge: "Best Value",
  },
  {
    id: "Premium",
    title: "Premium",
    subtitle: "Extra 7\" legroom & priority boarding",
    multiplier: 1.45,
    badge: "Extra Comfort",
  },
  {
    id: "Business",
    title: "Business",
    subtitle: "180° Lie-flat bed, lounge & fine dining",
    multiplier: 2.3,
    badge: "Popular VIP",
  },
  {
    id: "First",
    title: "First",
    subtitle: "Private luxury suite & chauffeur service",
    multiplier: 3.8,
    badge: "Ultimate Luxury",
  },
];

export function calculateFareBreakdown(
  flight: FlightItem,
  passengerCounts: PassengerCounts,
  cabinClass: CabinClassType,
  includeCarbonOffset = true
): FareBreakdown {
  const classOption = CABIN_CLASSES.find((c) => c.id === cabinClass) || CABIN_CLASSES[0];
  const unitPrice = flight.base_price * classOption.multiplier;

  const adultCost = Math.round(unitPrice * passengerCounts.adults);
  const childCost = Math.round(unitPrice * FARE_RULES.CHILD_FARE_RATIO * passengerCounts.children);
  const infantCost = Math.round(unitPrice * FARE_RULES.INFANT_FARE_RATIO * passengerCounts.infants);
  const baseFare = adultCost + childCost + infantCost;

  const totalPax = Math.max(1, passengerCounts.adults + passengerCounts.children + passengerCounts.infants);

  const airportTaxes = Math.round(baseFare * FARE_RULES.TAX_RATE);
  const fuelSurcharge = Math.round(baseFare * FARE_RULES.FUEL_SURCHARGE_RATE);
  const carbonOffsetPerPax =
    flight.currency?.toUpperCase() === "BDT" ? FARE_RULES.CARBON_OFFSET_BDT : FARE_RULES.CARBON_OFFSET_USD;
  const carbonOffset = includeCarbonOffset ? totalPax * carbonOffsetPerPax : 0;

  const total = baseFare + airportTaxes + fuelSurcharge + carbonOffset;
  const perPerson = Math.round(total / totalPax);

  return {
    adultCost,
    childCost,
    infantCost,
    baseFare,
    airportTaxes,
    fuelSurcharge,
    carbonOffset,
    total,
    perPerson,
    totalPax,
    currencySymbol: getCurrencySymbol(flight.currency),
  };
}
