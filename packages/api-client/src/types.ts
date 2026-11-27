/**
 * ShopnoJatra API Client - TypeScript Data Shapes & Contracts
 * Derived from docs/openapi.json
 */

export interface StandardResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

// ---------------- AUTH SCHEMAS ----------------
export interface CheckEmailRequest {
  email: string;
}

export interface CheckEmailResponse {
  exists: boolean;
  email: string;
}

export interface UserClaims {
  sub: string;
  email?: string;
  role?: string;
  agency_id?: string;
  hotel_id?: string;
  permissions?: string[];
  [key: string]: unknown;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  phone?: string;
  role: 'customer' | 'agency_agent' | 'agency_admin' | 'hotel_staff' | 'hotel_admin' | 'platform_admin';
  agency_id?: string;
  hotel_id?: string;
  avatar_url?: string;
  created_at: string;
}

// ---------------- FLIGHT SCHEMAS ----------------
export interface FlightSearchParams {
  origin: string;
  destination: string;
  departure_date: string;
  return_date?: string;
  passengers?: number;
  cabin_class?: 'economy' | 'premium_economy' | 'business' | 'first';
  max_price?: number;
  airline_code?: string;
  page?: number;
  page_size?: number;
}

export interface FlightResponse {
  id: string;
  flight_number: string;
  airline: string;
  origin_airport: string;
  destination_airport: string;
  departure_time: string;
  arrival_time: string;
  duration_minutes: number;
  aircraft_type?: string;
  base_price: number;
  currency: string;
  baggage_allowance?: string;
  available_seats: number;
  status: string;
  is_refundable: boolean;
}

export interface FlightSeatResponse {
  id: string;
  flight_id: string;
  seat_number: string;
  cabin_class: string;
  is_available: boolean;
  is_locked: boolean;
  price_modifier: number;
}

export interface SeatLockRequest {
  seat_id: string;
  passenger_id?: string;
  duration_seconds?: number;
}

// ---------------- HOTEL SCHEMAS ----------------
export interface HotelSearchParams {
  city: string;
  check_in: string;
  check_out: string;
  guests?: number;
  rooms?: number;
  min_star_rating?: number;
  min_price?: number;
  max_price?: number;
  sort_by?: 'price_asc' | 'price_desc' | 'rating_desc' | 'popularity';
  page?: number;
  page_size?: number;
}

export interface HotelResponse {
  id: string;
  name: string;
  slug: string;
  description?: string;
  address: string;
  city: string;
  country: string;
  star_rating: number;
  review_score?: number;
  review_count?: number;
  hero_image?: string;
  images: string[];
  amenities: string[];
  check_in_time?: string;
  check_out_time?: string;
  is_featured: boolean;
  rooms?: HotelRoomResponse[];
}

export interface HotelRoomResponse {
  id: string;
  hotel_id: string;
  name: string;
  room_type: string;
  description?: string;
  max_occupancy: number;
  bed_type?: string;
  size_sqm?: number;
  base_price_per_night: number;
  currency: string;
  images: string[];
  amenities: string[];
  is_available: boolean;
}

// PMS Unit & Operations
export interface RoomUnitCreateRequest {
  room_type_id: string;
  room_number: string;
  floor_number?: number;
  wing?: string | null;
  is_vip_room?: boolean;
  dynamic_pricing_enabled?: boolean;
  base_nightly_rate_bdt: number | string;
  amenities_override?: string[];
  ai_tags?: string[];
  notes?: string | null;
}

export interface RoomUnitUpdateRequest {
  room_type_id?: string;
  room_number?: string;
  floor_number?: number;
  wing?: string | null;
  is_vip_room?: boolean;
  dynamic_pricing_enabled?: boolean;
  base_nightly_rate_bdt?: number | string;
  status?: 'AVAILABLE' | 'OCCUPIED' | 'CLEANING' | 'MAINTENANCE' | 'OUT_OF_SERVICE';
  notes?: string | null;
}

export interface RoomUnitResponse {
  id: string;
  hotel_id: string;
  room_type_id: string;
  room_number: string;
  floor_number: number;
  wing?: string;
  is_vip_room: boolean;
  dynamic_pricing_enabled: boolean;
  base_nightly_rate_bdt: number;
  status: string;
  housekeeping_status: string;
  created_at: string;
  updated_at: string;
}

export interface RoomMatrixFloorGroup {
  floor_number: number;
  units: RoomUnitResponse[];
}

export interface RoomMatrixResponse {
  hotel_id: string;
  total_units: number;
  available_units: number;
  occupied_units: number;
  floors: RoomMatrixFloorGroup[];
}

export interface HotelPmsAnalyticsResponse {
  hotel_id: string;
  occupancy_rate: number;
  adr: number;
  rev_par: number;
  arrivals_today: number;
  departures_today: number;
  in_house_guests: number;
}

// ---------------- BOOKING SCHEMAS ----------------
export interface BookingPassengerCreate {
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  passenger_type?: string;
  passport_number?: string | null;
  seat_preference?: string | null;
  seat_id?: string | null;
}

export interface BookingPassengerResponse {
  id: string;
  booking_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  passenger_type: string;
  passport_number?: string;
  seat_number?: string;
}

export interface BookingItemCreate {
  product_type: 'flight' | 'hotel' | 'tour' | 'activity' | 'transfer' | 'package';
  product_id: string;
  product_name: string;
  description?: string | null;
  quantity?: number;
  unit_price: number;
  item_metadata?: Record<string, unknown>;
}

export interface BookingItemResponse {
  id: string;
  booking_id: string;
  product_type: string;
  product_id: string;
  product_name: string;
  description?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  item_metadata?: Record<string, unknown>;
}

export interface BookingCreateRequest {
  product_type: 'flight' | 'hotel' | 'tour' | 'activity' | 'transfer' | 'package';
  destination_city: string;
  origin_city?: string | null;
  destination_country?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  number_of_guests?: number;
  agency_id?: string | null;
  items: BookingItemCreate[];
  passengers?: BookingPassengerCreate[];
  special_requests?: string | null;
  notes?: string | null;
  idempotency_key?: string | null;
}

export interface BookingQuoteRequest {
  provider_id: string;
  service_id: string;
  tour_date: string;
  duration_days?: number;
  number_of_guests?: number;
}

export interface BookingQuoteResponse {
  quote_id: string;
  provider_id: string;
  service_id: string;
  base_price: number;
  discount: number;
  taxes: number;
  service_fee: number;
  total_price: number;
  currency: string;
  expires_at: string;
}

export interface BookingResponse {
  id: string;
  booking_reference: string;
  product_type: string;
  status: 'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'REFUNDED' | 'EXPIRED' | 'FAILED';
  flow_step?: string;
  origin_city?: string;
  destination_city: string;
  start_date?: string;
  end_date?: string;
  number_of_guests: number;
  total_price: number;
  discount_amount: number;
  tax_amount: number;
  service_fee: number;
  final_price: number;
  currency: string;
  created_at: string;
  confirmed_at?: string;
  items: BookingItemResponse[];
  passengers: BookingPassengerResponse[];
}

export interface BookingStatusUpdateRequest {
  target_status: 'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'REFUNDED' | 'EXPIRED' | 'FAILED';
  payment_transaction_id?: string | null;
  cancellation_reason?: string | null;
  admin_override?: boolean;
}

// ---------------- PAYMENT SCHEMAS ----------------
export interface PaymentInitiateRequest {
  booking_id?: string | null;
  amount: number;
  currency?: string;
  method: 'bkash' | 'nagad' | 'rocket' | 'stripe' | 'card' | 'wallet';
  phone?: string | null;
  email?: string | null;
  reference?: string | null;
  nonce?: string | null;
  timestamp_ms?: number | null;
  idempotency_key?: string | null;
}

export interface PaymentInitiateResponse {
  payment_id: string;
  redirect_url?: string;
  gateway_reference?: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  amount: number;
  currency: string;
}

// ---------------- AGENCY SCHEMAS ----------------
export interface AgencyBalancesResponse {
  agency_id: string;
  currency: string;
  pending_paisa: number;
  available_paisa: number;
  paid_paisa: number;
  pending_bdt: number;
  available_bdt: number;
  paid_bdt: number;
}

export interface AgencyPayoutItem {
  id: string;
  batch_id?: string;
  amount_paisa: number;
  amount_bdt: number;
  reference?: string;
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'REJECTED';
  created_at: string;
  paid_at?: string;
}

export interface AgencyStatementResponse {
  agency_id: string;
  start_date: string;
  end_date: string;
  total_sales: number;
  commission_earned: number;
  payouts_completed: number;
  current_balance: number;
  entries: Array<{
    date: string;
    description: string;
    reference: string;
    type: 'CREDIT' | 'DEBIT';
    amount: number;
    balance_after: number;
  }>;
}

// ---------------- ADMIN SCHEMAS ----------------
export interface AdminProviderApproveRequest {
  admin_notes?: string;
  badge?: string;
}

export interface AdminProviderRejectRequest {
  reason: string;
  admin_notes?: string;
}

export interface PayoutBatchResponse {
  id: string;
  status: 'DRAFT' | 'APPROVED' | 'PROCESSING' | 'COMPLETED';
  total_amount_bdt: number;
  payout_count: number;
  created_at: string;
  approved_at?: string;
}

export interface KYCQueueItemResponse {
  id: string;
  agency_id: string;
  agency_name: string;
  status: 'PENDING' | 'UNDER_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED';
  submitted_at: string;
  documents_count: number;
  created_at: string;
}

export interface KYCSubmissionResponse {
  id: string;
  agency_id: string;
  agency_name: string;
  status: string;
  submitted_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  decision_reason?: string;
  created_at: string;
  updated_at: string;
  documents: Array<{
    id: string;
    doc_type: string;
    r2_key: string;
    file_name: string;
    size_bytes: number;
    sha256: string;
    expires_on?: string;
  }>;
  audit_logs: Array<{
    id: string;
    actor_id: string;
    action: string;
    note?: string;
    created_at: string;
  }>;
}

export interface KYCAdminApproveRequest {
  admin_notes?: string;
}

export interface KYCAdminRejectRequest {
  reason: string;
  admin_notes?: string;
}

export interface KYCAdminRequestChangesRequest {
  requested_changes: string[];
  admin_notes?: string;
}
