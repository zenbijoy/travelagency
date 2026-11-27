/**
 * Modular Hotel PMS & Consumer Stays Domain Types
 * Aligned 1:1 with `20260623_rider_hotel_marketplace_production.sql`
 * Tables: hotel_room_units, hotel_housekeeping_tasks, hotel_maintenance_tickets,
 *         hotel_folios, hotel_folio_items, hotel_rate_rules, hotel_guest_keys
 */

export type RoomOccupancyStatus =
  | "vacant"
  | "reserved"
  | "occupied"
  | "due_out"
  | "blocked"
  | "out_of_order";

export type HousekeepingUnitStatus =
  | "dirty"
  | "cleaning"
  | "inspection"
  | "clean"
  | "ready"
  | "out_of_service";

export type HousekeepingTaskType =
  | "checkout_clean"
  | "stayover_refresh"
  | "deep_clean"
  | "vip_turndown"
  | "inspection";

export type HousekeepingPriority =
  | "low"
  | "normal"
  | "high"
  | "vip_arrival"
  | "urgent";

export type HousekeepingTaskStatus =
  | "dirty"
  | "cleaning"
  | "inspection"
  | "ready"
  | "cancelled";

export type MaintenanceCategory =
  | "plumbing"
  | "electrical"
  | "hvac"
  | "furniture"
  | "wifi_it"
  | "safety"
  | "appliance"
  | "other";

export type MaintenanceSeverity = "low" | "medium" | "high" | "critical";

export type MaintenanceTicketStatus =
  | "open"
  | "assigned"
  | "in_progress"
  | "parts_pending"
  | "resolved"
  | "closed";

export type FolioStatus =
  | "open"
  | "pending_settlement"
  | "partially_paid"
  | "settled"
  | "void";

export type FolioItemType =
  | "room_night"
  | "minibar"
  | "room_service"
  | "breakfast"
  | "airport_transfer"
  | "late_checkout"
  | "marketplace_concierge"
  | "laundry"
  | "spa"
  | "vat_tax"
  | "service_charge"
  | "deposit"
  | "payment"
  | "discount"
  | "adjustment";

export type FolioEntrySide = "charge" | "payment" | "credit";

export type RateRuleType =
  | "occupancy_surge"
  | "weekend"
  | "seasonal"
  | "flash_deal"
  | "early_bird"
  | "last_minute"
  | "length_of_stay";

export type GuestKeyStatus = "active" | "rotated" | "expired" | "revoked";

export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "checked_in"
  | "checked_out"
  | "cancelled";

export type HotelDepartment =
  | "Management"
  | "Front Desk"
  | "Housekeeping"
  | "Maintenance";

export interface HotelProperty {
  id: string;
  name: string;
  city: string;
  country: string;
  address?: string;
  starRating: number;
  basePriceBdt: number;
  checkInTime: string;
  checkOutTime: string;
  currency: string;
  commissionPct: number;
  operatingCostPerRoomBdt: number;
}

export interface HotelRoomTypeSummary {
  id: string;
  hotelId: string;
  roomType: string;
  description?: string;
  maxOccupancy: number;
  basePriceBdt: number;
  bedType: string;
  squareMeters: number;
  amenities: string[];
  photos: string[];
  dynamicPricingEnabled: boolean;
  seasonalMultiplier: number;
}

export interface HotelRoomUnit {
  id: string;
  hotelId: string;
  roomTypeId: string;
  roomTypeName: string;
  roomNumber: string;
  floorNumber: number;
  wing?: string;
  occupancyStatus: RoomOccupancyStatus;
  housekeepingStatus: HousekeepingUnitStatus;
  currentBookingId?: string | null;
  currentGuestId?: string | null;
  currentGuestName?: string | null;
  isVipRoom: boolean;
  dynamicPricingEnabled: boolean;
  baseNightlyRateBdt: number;
  maxGuests: number;
  amenities: string[];
  photos: string[];
  aiTags: string[];
  lastCleanedAt?: string | null;
  lastInspectedAt?: string | null;
  notes?: string | null;
  isActive: boolean;
}

export interface HotelReservation {
  id: string;
  hotelId: string;
  bookingReference: string;
  guestUserId?: string;
  guestName: string;
  guestAvatar?: string;
  guestPhone?: string;
  guestEmail?: string;
  guestCountry?: string;
  nidOrPassportNumber?: string;
  nidOrPassportVerified: boolean;
  roomTypeId?: string;
  roomType: string;
  roomUnitId?: string | null;
  roomNumber?: string | null;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string; // YYYY-MM-DD
  nights: number;
  adults: number;
  children: number;
  totalPriceBdt: number;
  currency: string;
  status: ReservationStatus;
  isPaid: boolean;
  isVip: boolean;
  isCorporate?: boolean;
  loyaltyPoints?: number;
  specialRequests: string[];
  sourceChannel: "Direct" | "ShopnoJatra" | "Corporate" | "Walk-in" | "OTA";
  folioId?: string | null;
  qrCodePayload?: string;
  createdAt: string;
}

export interface DateBlockRecord {
  id: string;
  hotelId: string;
  roomUnitId?: string | null; // null => whole property day block
  date: string; // YYYY-MM-DD
  reason: string;
  blockedBy?: string;
  createdAt: string;
}

export interface HousekeepingChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

export interface HotelHousekeepingTask {
  id: string;
  hotelId: string;
  roomUnitId: string;
  roomNumber: string;
  roomTypeName?: string;
  assignedStaffId?: string | null;
  assignedStaffName?: string | null;
  assignedUserId?: string | null;
  taskType: HousekeepingTaskType;
  priority: HousekeepingPriority;
  status: HousekeepingTaskStatus;
  slaMinutes: number;
  dueBy?: string | null;
  startedAt?: string | null;
  inspectedAt?: string | null;
  inspectedBy?: string | null;
  completedAt?: string | null;
  checklist: HousekeepingChecklistItem[];
  notes?: string | null;
  createdAt: string;
}

export interface HotelMaintenanceTicket {
  id: string;
  hotelId: string;
  roomUnitId?: string | null;
  roomNumber?: string | null;
  reportedBy?: string | null;
  reportedByLabel?: string;
  assignedStaffId?: string | null;
  assignedStaffName?: string | null;
  ticketReference: string;
  category: MaintenanceCategory;
  severity: MaintenanceSeverity;
  status: MaintenanceTicketStatus;
  title: string;
  description?: string | null;
  blocksRoomSale: boolean;
  estimatedCostBdt: number;
  actualCostBdt: number;
  currency: string;
  resolutionNotes?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
}

export interface SplitBillingAllocation {
  payerLabel: string;
  displayName: string;
  sharePercent?: number;
  allocatedPaisa: number;
  paidPaisa: number;
  balanceDuePaisa: number;
}

export interface HotelFolioItem {
  id: string;
  folioId: string;
  hotelId: string;
  itemType: FolioItemType;
  description: string;
  quantity: number;
  unitAmountPaisa: number;
  taxPaisa: number;
  totalPaisa: number;
  entrySide: FolioEntrySide;
  payerLabel: string;
  referenceId?: string | null;
  postedBy?: string | null;
  idempotencyKey?: string | null;
  isVoided: boolean;
  postedAt: string;
}

export interface HotelFolio {
  id: string;
  folioNumber: string;
  hotelId: string;
  bookingId?: string | null;
  bookingReference?: string;
  roomUnitId?: string | null;
  roomNumber?: string | null;
  guestUserId: string;
  guestName: string;
  guestPhone?: string | null;
  guestNidOrPassportVerified: boolean;
  status: FolioStatus;
  currency: string;
  roomChargesPaisa: number;
  addonChargesPaisa: number;
  taxPaisa: number;
  discountPaisa: number;
  totalChargesPaisa: number;
  paidPaisa: number;
  balanceDuePaisa: number;
  checkedInAt?: string | null;
  checkedOutAt?: string | null;
  settledAt?: string | null;
  splitBillingConfig: Record<string, number>; // payerLabel -> sharePct
  notes?: string | null;
  items: HotelFolioItem[];
  createdAt: string;
}

export interface HotelRateRule {
  id: string;
  hotelId: string;
  roomTypeId?: string | null;
  ruleName: string;
  ruleType: RateRuleType;
  priority: number;
  multiplier: number; // 0.400 .. 1.250
  flatAdjustmentBdt: number;
  minOccupancyPct?: number | null;
  maxOccupancyPct?: number | null;
  daysOfWeek?: number[] | null; // 0=Sun..6=Sat
  startDate?: string | null;
  endDate?: string | null;
  minNights?: number | null;
  isFlashDeal: boolean;
  isActive: boolean;
}

export interface HotelGuestKey {
  id: string;
  hotelId: string;
  roomUnitId: string;
  roomNumber: string;
  folioId?: string | null;
  bookingId?: string | null;
  bookingReference?: string;
  guestUserId: string;
  guestName?: string;
  keyTokenHash: string;
  qrPassCode: string;
  pinCodeLast4: string;
  wifiSsid: string;
  wifiPassword: string;
  status: GuestKeyStatus;
  validFrom: string;
  validUntil: string;
  rotatedCount: number;
  lastUnlockedAt?: string | null;
}

export interface HotelStaffMember {
  id: string;
  hotelId: string;
  userId?: string;
  name: string;
  role: string;
  department: HotelDepartment;
  phone: string;
  status: "Active" | "On Leave" | "Off Duty";
  avatar: string;
  shift?: string;
}

export interface CompetitorRate {
  id: string;
  hotelName: string;
  distanceKm: number;
  starRating: number;
  nightlyRateBdt: number;
  occupancyHintPct: number;
}

export interface HotelPayoutRecord {
  id: string;
  hotelId: string;
  amountBdt: number;
  method: "bkash" | "nagad" | "bank_transfer";
  accountRef: string;
  requestedAt: string;
  status: "Pending" | "Processing" | "Completed";
}

export interface ConciergeMessage {
  id: string;
  threadId: string;
  senderRole: "guest" | "hotel" | "system";
  senderName: string;
  text: string;
  tag?: string;
  sentAt: string;
  read: boolean;
}

export interface GuestConciergeThread {
  id: string;
  hotelId: string;
  bookingId?: string;
  bookingReference?: string;
  guestUserId?: string;
  guestName: string;
  guestAvatar: string;
  roomNumber?: string;
  checkOutDate?: string;
  isVip: boolean;
  unreadCount: number;
  specialRequestTags: string[];
  messages: ConciergeMessage[];
  updatedAt: string;
}

export interface HotelContractRecord {
  id: string;
  hotelId: string;
  type: "booking_agreement" | "maintenance_agreement" | "agency_commission";
  title: string;
  party: {
    name: string;
    phone: string;
    email: string;
  };
  terms: string;
  ownerId: string;
  status: "draft" | "sent" | "signed" | "expired";
  signatureBase64?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConsumerStayAddon {
  id: "airport_pickup" | "breakfast_buffet" | "late_checkout" | "heritage_hamper";
  label: string;
  labelBn: string;
  description: string;
  priceBdt: number;
  perNight: boolean;
  icon: string;
}

export interface OfflinePmsMutation {
  id: string;
  action:
    | "UNIT_STATUS_UPDATE"
    | "BLOCK_DATES"
    | "EXPRESS_CHECKIN"
    | "POST_FOLIO_AND_CHECKOUT"
    | "HOUSEKEEPING_TRANSITION"
    | "MAINTENANCE_UPSERT"
    | "RATE_RULE_UPSERT"
    | "CONCIERGE_MESSAGE"
    | "RESERVATION_STATUS"
    | "PAYOUT_REQUEST"
    | "ROTATE_GUEST_KEY"
    | "STAFF_ADD";
  hotelId: string;
  payload: Record<string, any>;
  idempotencyKey: string;
  createdAt: string;
  retryCount: number;
  lastError?: string;
}

export interface DynamicRateQuote {
  hotelId: string;
  roomTypeId: string;
  checkInDate: string;
  nights: number;
  occupancyPct: number;
  baseNightlyBdt: number;
  effectiveMultiplier: number;
  isCapped: boolean;
  dynamicNightlyBdt: number;
  subtotalPaisa: number;
  vatPaisa: number;
  serviceChargePaisa: number;
  totalPaisa: number;
  currency: string;
  appliedRules: Array<{
    ruleId: string;
    ruleName: string;
    ruleType: RateRuleType;
    multiplier: number;
    flatAdjustmentBdt: number;
    isFlashDeal: boolean;
  }>;
}

export interface HotelKpiSnapshot {
  totalUnits: number;
  occupiedUnits: number;
  vacantReadyUnits: number;
  reservedUnits: number;
  dueOutUnits: number;
  blockedOrOooUnits: number;
  occupancyRatePct: number;
  adrBdt: number;
  revParBdt: number;
  gopparBdt: number;
  grossRevenueBdt: number;
  roomRevenueBdt: number;
  addonRevenueBdt: number;
  platformCommissionBdt: number;
  netPayoutBdt: number;
  todayCheckIns: number;
  todayCheckOuts: number;
  vipArrivals: number;
  pendingBookings: number;
  dirtyRooms: number;
  cleaningRooms: number;
  inspectionRooms: number;
  readyRooms: number;
  priorityCleans: number;
  openMaintenanceCount: number;
  urgentMaintenanceCount: number;
  inProgressMaintenanceCount: number;
  resolvedMaintenanceCount: number;
  maintenanceCostTotalBdt: number;
  operationalHealthPct: number;
  dailyRevenueSeries: Array<{ label: string; date: string; amountBdt: number }>;
  revenueByChannel: Array<{ channel: string; amountBdt: number; sharePct: number }>;
  aiInsights: string[];
}
