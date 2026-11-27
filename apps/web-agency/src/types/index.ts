export type AgencyRole =
  | 'AGENCY_OWNER'
  | 'AGENCY_MANAGER'
  | 'AGENCY_AGENT'
  | 'AGENCY_FINANCE';

export type AgencyPermission =
  | 'team.manage'
  | 'team.view'
  | 'banking.manage'
  | 'banking.view'
  | 'verification.upload'
  | 'bookings.manage'
  | 'bookings.view'
  | 'finance.view'
  | 'settings.manage';

export const ROLE_PERMISSIONS: Record<AgencyRole, AgencyPermission[]> = {
  AGENCY_OWNER: [
    'team.manage',
    'team.view',
    'banking.manage',
    'banking.view',
    'verification.upload',
    'bookings.manage',
    'bookings.view',
    'finance.view',
    'settings.manage',
  ],
  AGENCY_MANAGER: [
    'team.manage',
    'team.view',
    'banking.view',
    'verification.upload',
    'bookings.manage',
    'bookings.view',
    'finance.view',
    'settings.manage',
  ],
  AGENCY_AGENT: ['team.view', 'bookings.manage', 'bookings.view'],
  AGENCY_FINANCE: ['team.view', 'banking.view', 'finance.view', 'bookings.view'],
};

export interface AgencyTenant {
  id: string;
  name: string;
  slug: string;
  tradeLicenseNumber: string;
  tin: string;
  kycStatus: 'verified' | 'pending' | 'rejected' | 'unsubmitted';
  logoUrl?: string;
  commissionTier: 'Standard' | 'Silver' | 'Gold' | 'Platinum';
  balanceBDT: number;
  pendingPayoutBDT: number;
  currency: string;
  phone: string;
  email: string;
  address: string;
}

export type ServiceType = 'flight' | 'hotel' | 'tour' | 'holiday';
export type BookingStatus = 'confirmed' | 'pending' | 'cancelled' | 'completed';
export type PaymentStatus = 'paid' | 'partial' | 'unpaid' | 'refunded';

export interface Passenger {
  id: string;
  name: string;
  type: 'adult' | 'child' | 'infant';
  passportNo?: string;
  seatPreference?: string;
  nationality?: string;
}

export interface Booking {
  id: string;
  bookingReference: string;
  pnr: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceType: ServiceType;
  title: string;
  routeOrDetails: string;
  travelDate: string;
  returnDate?: string;
  guestsCount: number;
  status: BookingStatus;
  totalPriceBDT: number;
  commissionBDT: number;
  markupBDT: number;
  paymentStatus: PaymentStatus;
  assignedAgent: string;
  assignedAgentId: string;
  createdAt: string;
  updatedAt: string;
  passengers: Passenger[];
  notes?: string;
  specialRequests?: string;
  supplierName: string;
}

export interface CustomerHistoryItem {
  bookingId: string;
  reference: string;
  serviceTitle: string;
  date: string;
  amountBDT: number;
  status: BookingStatus;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatarUrl: string;
  isVIP: boolean;
  totalBookings: number;
  totalSpentBDT: number;
  outstandingBalanceBDT: number;
  lastBookingDate: string;
  notes?: string;
  nationality: string;
  passportExpiry?: string;
  frequentDestinations: string[];
  travelHistory: CustomerHistoryItem[];
}

export interface CommissionRecord {
  id: string;
  bookingReference: string;
  serviceType: ServiceType;
  customerName: string;
  grossVolumeBDT: number;
  commissionRatePercent: number;
  commissionEarnedBDT: number;
  status: 'available' | 'pending_clearance' | 'settled';
  date: string;
  invoiceNumber: string;
}

export interface PayoutRequest {
  id: string;
  amountBDT: number;
  bankAccountId: string;
  bankName: string;
  accountNumberMasked: string;
  status: 'pending_approval' | 'processing' | 'completed' | 'rejected';
  requestedAt: string;
  processedAt?: string;
  referenceNumber: string;
  requestedBy: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: AgencyRole;
  status: 'active' | 'inactive' | 'pending_invite';
  joinedDate: string;
  bookingsHandledCount: number;
  salesVolumeBDT: number;
  avatarUrl?: string;
}

export interface BankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  routingNumber: string;
  branchName: string;
  isPrimary: boolean;
  verificationStatus: 'verified' | 'pending' | 'action_required';
  accountType: 'Current' | 'Savings' | 'Escrow';
}

export interface KycDocument {
  type: 'trade_licence' | 'tin' | 'owner_nid' | 'address_proof';
  title: string;
  subtitle: string;
  fileUrl?: string;
  fileName?: string;
  fileSizeBytes?: number;
  status: 'verified' | 'pending_review' | 'rejected' | 'not_uploaded';
  uploadedAt?: string;
  rejectionReason?: string;
  required: boolean;
}

export interface DashboardMetrics {
  totalBookings: number;
  totalBookingsGrowthPercent: number;
  grossVolumeBDT: number;
  grossVolumeGrowthPercent: number;
  commissionsEarnedBDT: number;
  commissionsGrowthPercent: number;
  activeAgentsCount: number;
  pendingBookingsCount: number;
  monthlyRevenueTrend: {
    month: string;
    volumeBDT: number;
    commissionBDT: number;
  }[];
  serviceDistribution: {
    service: string;
    percentage: number;
    bookingsCount: number;
  }[];
}
