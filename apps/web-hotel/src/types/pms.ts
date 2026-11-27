export type RoomCategoryType = 'standard' | 'deluxe' | 'suite' | 'penthouse';

export type RoomOccupancyStatus = 
  | 'vacant'
  | 'occupied'
  | 'reserved'
  | 'due_out'
  | 'blocked'
  | 'out_of_order';

export type RoomHousekeepingStatus = 
  | 'dirty'
  | 'cleaning'
  | 'inspection'
  | 'ready';

export type MaintenanceCondition = 
  | 'operational'
  | 'minor_issue'
  | 'urgent_repair'
  | 'scheduled';

export interface RoomUnit {
  id: string;
  roomNumber: string;
  floor: number;
  category: RoomCategoryType;
  categoryLabel: string;
  occupancyStatus: RoomOccupancyStatus;
  housekeepingStatus: RoomHousekeepingStatus;
  maintenanceStatus: MaintenanceCondition;
  basePriceBdt: number;
  currentRateBdt: number;
  currentGuestName?: string;
  reservationId?: string;
  bedType: string;
  maxGuests: number;
  amenities: string[];
  lastCleaned?: string;
  assignedHousekeeper?: string;
}

export interface RoomCategorySummary {
  category: RoomCategoryType;
  label: string;
  totalRooms: number;
  availableRooms: number;
  occupiedRooms: number;
  cleaningRooms: number;
  maintenanceRooms: number;
  basePriceBdt: number;
  icon: string;
}

export type ReservationStatus = 
  | 'Confirmed'
  | 'Checked In'
  | 'Checked Out'
  | 'Upcoming'
  | 'Pending'
  | 'Cancelled';

export interface FolioItem {
  id: string;
  description: string;
  type: 'room_night' | 'dining' | 'minibar' | 'concierge' | 'laundry' | 'spa' | 'tax' | 'service_fee' | 'payment';
  amountBdt: number;
  date: string;
  isPaid?: boolean;
}

export interface FolioSummary {
  roomTotalBdt: number;
  extrasBdt: number;
  vatRate: number; // 0.05
  vatAmountBdt: number;
  serviceChargeRate: number; // 0.10
  serviceChargeAmountBdt: number;
  totalGrossBdt: number;
  paidAmountBdt: number;
  balanceDueBdt: number;
  items: FolioItem[];
}

export interface Reservation {
  id: string;
  bookingReference: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  guestNidPassport: string;
  guestAvatar: string;
  roomUnitId: string;
  roomNumber: string;
  roomCategory: RoomCategoryType;
  categoryLabel: string;
  checkInDate: string;
  checkOutDate: string;
  totalNights: number;
  numAdults: number;
  numChildren: number;
  status: ReservationStatus;
  isVIP: boolean;
  isPaid: boolean;
  specialRequests?: string;
  digitalPasscode: string;
  folio: FolioSummary;
  createdAt: string;
}

export type HousekeepingPriority = 'low' | 'normal' | 'high' | 'vip_arrival' | 'urgent';

export interface HousekeepingTask {
  id: string;
  roomUnitId: string;
  roomNumber: string;
  roomCategory: string;
  floor: number;
  status: RoomHousekeepingStatus; // dirty | cleaning | inspection | ready
  priority: HousekeepingPriority;
  taskType: 'checkout_clean' | 'stayover_refresh' | 'deep_clean' | 'vip_turndown' | 'inspection';
  assignedStaffId?: string;
  assignedStaffName?: string;
  notes?: string;
  updatedAt: string;
  estimatedMinutes: number;
}

export interface StaffMember {
  id: string;
  name: string;
  role: 'Housekeeper' | 'Inspector' | 'Front Desk' | 'General Manager' | 'Maintenance Engineer';
  department: 'Housekeeping' | 'Front Desk' | 'Management' | 'Maintenance';
  phone: string;
  status: 'Active' | 'On Break' | 'Off Duty';
  avatar: string;
  assignedCount: number;
}

export interface SeasonalRatePlan {
  id: string;
  name: string;
  description: string;
  multiplier: number; // e.g. 1.25 for +25%
  startDate: string;
  endDate: string;
  category: 'all' | RoomCategoryType;
  isActive: boolean;
  type: 'seasonal' | 'weekend' | 'flash_deal' | 'occupancy_surge';
}

export interface RoomAvailabilityBlock {
  id: string;
  roomUnitId?: string; // specific room, or undefined if category block
  roomNumber?: string;
  category?: RoomCategoryType;
  reason: 'Maintenance' | 'VIP Hold' | 'Renovation' | 'Private Event';
  startDate: string;
  endDate: string;
  notes: string;
  blockedBy: string;
}

export interface DashboardMetrics {
  totalRooms: number;
  availableRooms: number;
  occupiedRooms: number;
  cleaningRooms: number;
  maintenanceRooms: number;
  occupancyRate: number; // percentage (0 - 100)
  occupancyTrend: number; // e.g. +4.5%
  todayArrivalsCount: number;
  todayDeparturesCount: number;
  inHouseGuestsCount: number;
  vipInHouseCount: number;
  adrBdt: number; // Average Daily Rate in BDT
  revParBdt: number; // Revenue Per Available Room
  todayGrossRevenueBdt: number;
  monthGrossRevenueBdt: number;
}

export interface RevenueAnalyticsData {
  dailyMetrics: {
    date: string;
    adr: number;
    revPar: number;
    occupancyPct: number;
    revenueBdt: number;
  }[];
  channelMix: {
    channel: string;
    percentage: number;
    revenueBdt: number;
    color: string;
  }[];
  categoryRevenue: {
    category: string;
    revenueBdt: number;
    occupancyPct: number;
  }[];
}
