import {
  ApiClientError,
  ShopnoJatraClient,
  type HotelResponse,
  type StandardResponse,
} from "@shopnojatra/api-client";
import { DESTINATIONS } from "./mock-data";
import type {
  BookingReceipt,
  BookingSubmission,
  Destination,
  Flight,
  Hotel,
  Tour,
} from "../types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, "") ||
  "http://localhost:8000";

export const customApiClient = new ShopnoJatraClient({
  baseUrl: API_BASE_URL,
  getToken: async () => {
    if (typeof window === "undefined") return null;
    const { createSupabaseBrowserClient } = await import("./supabase-browser");
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  },
});

function mapHotel(hotel: HotelResponse): Hotel {
  return {
    id: hotel.id,
    name: hotel.name,
    tagline: hotel.description || hotel.city,
    city: hotel.city,
    division: hotel.address ? hotel.address.split(",").pop()?.trim() || hotel.country : hotel.country,
    address: hotel.address || hotel.city,
    starRating: hotel.star_rating,
    reviewScore: hotel.review_score || 0,
    reviewCount: hotel.review_count || 0,
    startingPriceBDT: hotel.rooms?.[0]?.base_price_per_night || 0,
    heroImage: hotel.hero_image || "/images/hotel-placeholder.svg",
    images: hotel.images?.length ? hotel.images : ["/images/hotel-placeholder.svg"],
    amenities: hotel.amenities || [],
    description: hotel.description || "",
    rooms: (hotel.rooms || []).map((room) => ({
      id: room.id,
      hotelId: room.hotel_id,
      name: room.name,
      category: (
        ["standard", "deluxe", "executive_suite", "presidential_suite", "villa"].includes(
          room.room_type,
        )
          ? room.room_type
          : "standard"
      ) as Hotel["rooms"][number]["category"],
      bedConfiguration: room.bed_type || "Standard bed",
      maxOccupancy: room.max_occupancy,
      sizeSqm: room.size_sqm,
      basePriceBDT: room.base_price_per_night,
      amenities: room.amenities || [],
      images: room.images || [],
      availableUnits: room.is_available ? 1 : 0,
    })),
    reviews: [],
    featured: hotel.is_featured,
  };
}

export async function searchFlights(params?: {
  origin?: string;
  destination?: string;
  departure_date?: string;
  cabin_class?: string;
}): Promise<Flight[]> {
  if (!params?.origin || !params.destination || !params.departure_date) {
    return [];
  }
  try {
    const result = await customApiClient.flights.search({
      origin: params.origin,
      destination: params.destination,
      departure_date: params.departure_date,
      cabin_class: params.cabin_class as
        | "economy"
        | "premium_economy"
        | "business"
        | "first"
        | undefined,
      page: 1,
      page_size: 20,
    });
    return result.items.map((flight) => ({
      id: flight.id,
      flightNumber: flight.flight_number,
      airline: flight.airline,
      airlineCode: flight.airline.slice(0, 2).toUpperCase(),
      origin: flight.origin_airport,
      originCity: flight.origin_airport,
      destination: flight.destination_airport,
      destinationCity: flight.destination_airport,
      departureTime: flight.departure_time,
      arrivalTime: flight.arrival_time,
      duration: `${Math.round(flight.duration_minutes / 60)}h`,
      stops: 0,
      cabinClass: "economy",
      priceBDT: flight.base_price,
      priceUSD: 0,
      refundable: flight.is_refundable,
      baggageAllowance: flight.baggage_allowance || "",
      seatsAvailable: flight.available_seats,
    }));
  } catch (error) {
    console.error("Flight search unavailable:", error);
    return [];
  }
}

export async function searchHotels(params?: {
  city?: string;
  check_in?: string;
  check_out?: string;
  guests?: number;
  rooms?: number;
  min_price?: number;
  max_price?: number;
  min_star_rating?: number;
}): Promise<Hotel[]> {
  if (!params?.city?.trim()) return [];

  try {
    const result = await customApiClient.hotels.search({
      city: params.city,
      check_in: params.check_in || defaultStayDates().checkIn,
      check_out: params.check_out || defaultStayDates().checkOut,
      guests: params.guests || 1,
      rooms: params.rooms || 1,
      min_star_rating: params.min_star_rating,
      min_price: params.min_price,
      max_price: params.max_price,
      sort_by: "popularity",
      page: 1,
      page_size: 20,
    });
    return result.items.map(mapHotel);
  } catch (error) {
    console.error("Hotel search unavailable:", error);
    return [];
  }
}

function defaultStayDates() {
  const checkIn = new Date();
  checkIn.setUTCDate(checkIn.getUTCDate() + 1);
  const checkOut = new Date(checkIn);
  checkOut.setUTCDate(checkOut.getUTCDate() + 1);
  return {
    checkIn: checkIn.toISOString().slice(0, 10),
    checkOut: checkOut.toISOString().slice(0, 10),
  };
}

export async function getHotelById(id: string): Promise<Hotel | null> {
  try {
    const result = await customApiClient.hotels.getById(id);
    if (!result.data) return null;
    const rooms = await customApiClient.hotels.getRooms(id);
    return mapHotel({
      ...result.data,
      rooms: rooms.data || result.data.rooms || [],
    });
  } catch (error) {
    console.error("Hotel detail unavailable:", error);
    return null;
  }
}

export async function getDestinations(): Promise<Destination[]> {
  return DESTINATIONS;
}

export async function getDestinationBySlug(slug: string): Promise<Destination | null> {
  return DESTINATIONS.find((destination) => destination.slug === slug) || null;
}

type ItineraryApiItem = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  cover_image: string;
  destination: string;
  duration_days: number;
  estimated_budget: number;
  currency: string;
  travel_category: string;
  difficulty_level: string;
  highlights: string[];
  rating: number;
  review_count: number;
  days: {
    day_number: number;
    title: string;
    subtitle?: string;
    notes?: string;
    items: { title: string; subtitle?: string }[];
  }[];
};

function mapTour(item: ItineraryApiItem): Tour {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    subtitle: item.description || item.destination,
    destinationSlug: item.destination.toLowerCase().replace(/\s+/g, "-"),
    destinationName: item.destination,
    durationDays: item.duration_days,
    durationNights: Math.max(item.duration_days - 1, 0),
    difficulty:
      item.difficulty_level === "challenging"
        ? "Challenging"
        : item.difficulty_level === "moderate"
          ? "Moderate"
          : "Easy",
    groupSize: "Small group",
    startingPriceBDT: item.estimated_budget,
    heroImage: item.cover_image,
    gallery: [],
    overview: item.description || "",
    itinerary: item.days.map((day) => ({
      day: day.day_number,
      title: day.title,
      description: day.notes || day.subtitle || "",
      activities: day.items.map((entry) => entry.title),
      mealsIncluded: [],
      overnightStay: undefined,
    })),
    inclusions: item.highlights || [],
    exclusions: [],
    rating: item.rating || 0,
    reviewCount: item.review_count || 0,
    departureDates: [],
  };
}

export async function getTours(destinationSlug?: string): Promise<Tour[]> {
  try {
    const destination = destinationSlug
      ? DESTINATIONS.find((item) => item.slug === destinationSlug)?.name
      : undefined;
    const response = await customApiClient.request<
      StandardResponse<ItineraryApiItem[]>
    >("/api/v1/itineraries", {
      params: destination ? { destination, limit: 50 } : { limit: 50 },
    });
    return (response.data || []).map(mapTour);
  } catch (error) {
    console.error("Tour marketplace unavailable:", error);
    return [];
  }
}

export async function getTourBySlug(slug: string): Promise<Tour | null> {
  try {
    const tours = await getTours();
    return tours.find((tour) => tour.slug === slug || tour.id === slug) || null;
  } catch {
    return null;
  }
}

export async function submitBooking(
  _submission: BookingSubmission,
): Promise<BookingReceipt> {
  throw new ApiClientError(
    501,
    "Checkout requires a server-generated, verifiable price quote. This API currently accepts caller-supplied booking prices, so checkout is unavailable until that contract is added.",
    null,
  );
}
