export type ProductType = 'flight' | 'hotel' | 'tour' | 'holiday_package';

export interface FlightSegment {
  airline: string;
  flightNumber: string;
  aircraft: string;
  departureAirport: string;
  departureCity: string;
  departureTerminal?: string;
  departureTime: string;
  arrivalAirport: string;
  arrivalCity: string;
  arrivalTerminal?: string;
  arrivalTime: string;
  duration: string;
}

export interface Flight {
  id: string;
  flightNumber: string;
  airline: string;
  airlineCode: string;
  airlineLogo?: string;
  origin: string;
  originCity: string;
  destination: string;
  destinationCity: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  stops: number;
  stopDetails?: string[];
  cabinClass: 'economy' | 'premium_economy' | 'business' | 'first';
  priceBDT: number;
  priceUSD: number;
  refundable: boolean;
  baggageAllowance: string;
  seatsAvailable: number;
  segments?: FlightSegment[];
}

export interface HotelAmenity {
  id: string;
  label: string;
  iconName: string;
}

export interface HotelRoom {
  id: string;
  hotelId: string;
  name: string;
  category: 'standard' | 'deluxe' | 'executive_suite' | 'presidential_suite' | 'villa';
  bedConfiguration: string;
  maxOccupancy: number;
  sizeSqm?: number;
  basePriceBDT: number;
  amenities: string[];
  images: string[];
  availableUnits: number;
}

export interface HotelReview {
  id: string;
  author: string;
  rating: number;
  date: string;
  comment: string;
  avatar?: string;
}

export interface Hotel {
  id: string;
  name: string;
  tagline: string;
  city: string;
  division: string;
  address: string;
  starRating: number;
  reviewScore: number;
  reviewCount: number;
  startingPriceBDT: number;
  heroImage: string;
  images: string[];
  amenities: string[];
  description: string;
  rooms: HotelRoom[];
  reviews: HotelReview[];
  featured?: boolean;
}

export interface TourDayItinerary {
  day: number;
  title: string;
  description: string;
  activities: string[];
  mealsIncluded: string[];
  overnightStay?: string;
}

export interface Tour {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  destinationSlug: string;
  destinationName: string;
  durationDays: number;
  durationNights: number;
  difficulty: 'Easy' | 'Moderate' | 'Challenging';
  groupSize: string;
  startingPriceBDT: number;
  heroImage: string;
  gallery: string[];
  overview: string;
  itinerary: TourDayItinerary[];
  inclusions: string[];
  exclusions: string[];
  rating: number;
  reviewCount: number;
  departureDates: string[];
  featured?: boolean;
}

export interface DestinationAttraction {
  name: string;
  description: string;
  image: string;
}

export interface Destination {
  id: string;
  slug: string;
  name: string;
  bengaliName: string;
  tagline: string;
  division: string;
  category: 'Beach' | 'Hill' | 'Heritage' | 'Wildlife' | 'Adventure';
  heroImage: string;
  gallery: string[];
  overview: string;
  bestTimeToVisit: string;
  highlights: string[];
  topAttractions: DestinationAttraction[];
  tourCount: number;
  hotelCount: number;
  startingPriceBDT: number;
  featured?: boolean;
  trendingRank?: number;
}

export interface PassengerDetail {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  passengerType: 'adult' | 'child' | 'infant';
  passportNumber?: string;
  seatPreference?: string;
}

export interface BookingSubmission {
  productType: ProductType;
  productId: string;
  productTitle: string;
  destinationCity: string;
  startDate: string;
  endDate?: string;
  guestsCount: number;
  passengers: PassengerDetail[];
  selectedRoomId?: string;
  selectedRoomName?: string;
  paymentMethod: 'bkash' | 'nagad' | 'rocket' | 'card' | 'bank_transfer';
  promoCode?: string;
  subtotalBDT: number;
  discountBDT: number;
  vatTaxBDT: number;
  totalBDT: number;
}

export interface BookingReceipt {
  bookingId: string;
  pnr: string;
  confirmationCode: string;
  productType: ProductType;
  productTitle: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  travelDates: string;
  totalAmountBDT: number;
  paymentMethod: string;
  paymentStatus: 'PAID' | 'CONFIRMED' | 'PENDING';
  bookedAt: string;
  redirectUrl?: string;
}
