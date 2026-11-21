export type SubScreenType =
  | "dashboard"
  | "add_agency"
  | "details"
  | "agency_ads"
  | "global_ads"
  | "verification"
  | "contracts"
  | "analytics"
  | "documents"
  | "payments"
  | "agency_payments"
  | "bookings"
  | "support_center"
  | "commission_tiers";

export interface AgencyItem {
  id: string;
  name: string;
  avatarText: string;
  status: "Verified" | "Pending" | "Suspended" | "Inactive";
  rating: number;
  reviewsCount: number;
  location: string;
  revenue: string;
  bookings: number;
  customers: number;
  responseTime: string;
  acceptanceRate: string;
  cancellationRate: string;
  agencyId: string;
  ownerName: string;
  ownerPhone: string;
  managerName: string;
  managerPhone: string;
  supportPhone: string;
  email?: string;
  agencyType?: string;
}

export interface AgencySecurityModalState {
  visible: boolean;
  actionType: "suspend" | "revoke_license" | "ban";
  agency: AgencyItem | null;
  reason: string;
  confirmationPhrase: string;
  acknowledged: boolean;
  isSubmitting: boolean;
}

export interface AgencyPayoutItem {
  id: string;
  agency_id: string;
  agency_name: string;
  license_number: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  routing_number: string;
  amount: string;
  currency: string;
  commission_fee: string;
  net_amount: string;
  commission_balance: string;
  status: "pending" | "paid_out" | "rejected";
  requested_at: string;
  reference: string;
}

export interface AgencyAdCard {
  id: string;
  title: string;
  adType: "Banner Ad" | "Sponsored Package" | "Video Ad";
  packageName: string;
  agencyName: string;
  status: "Active" | "Paused" | "Pending Approval" | "Expired";
  dailyBudget: string;
  impressions: string;
  clicks: string;
  ctr: string;
  totalSpent: string;
}

export interface BookingRecord {
  id: string;
  bookingRef: string;
  customerName: string;
  packageName: string;
  agencyName: string;
  date: string;
  amount: string;
  status: "Confirmed" | "Pending" | "Completed" | "Cancelled";
}

export interface GlobalPaymentItem {
  id: string;
  invoiceRef: string;
  agencyName: string;
  date: string;
  amount: string;
  status: "Pending" | "Completed" | "On Hold" | "Failed" | "Success";
  iconName: string;
}

export const INITIAL_AGENCIES: AgencyItem[] = [];

export const SAMPLE_AGENCY_ADS: AgencyAdCard[] = [];

export const GLOBAL_PAYMENTS_DATA: GlobalPaymentItem[] = [];
export const SAMPLE_BOOKINGS: BookingRecord[] = [];

export const INITIAL_PAYOUT_REQUESTS: AgencyPayoutItem[] = [
  {
    id: "payout-8941",
    agency_id: "ag-1",
    agency_name: "Chalo Shobai Tours Ltd",
    license_number: "TL-DHK-2024-8921",
    bank_name: "City Bank PLC",
    account_name: "Chalo Shobai Tours Ltd",
    account_number: "•••• •••• •••• 9201",
    routing_number: "225271890",
    amount: "৳185,000",
    currency: "BDT",
    commission_fee: "10.0%",
    net_amount: "৳166,500",
    commission_balance: "৳240,000",
    status: "pending",
    requested_at: "Today, 09:30 AM",
    reference: "PAY-2026-8941",
  },
  {
    id: "payout-8940",
    agency_id: "ag-2",
    agency_name: "Bengal Heritage Expeditions",
    license_number: "TL-CTG-2023-4410",
    bank_name: "BRAC Bank PLC",
    account_name: "Bengal Heritage Expeditions",
    account_number: "•••• •••• •••• 4482",
    routing_number: "060271420",
    amount: "৳320,000",
    currency: "BDT",
    commission_fee: "8.0%",
    net_amount: "৳294,400",
    commission_balance: "৳450,000",
    status: "pending",
    requested_at: "Yesterday, 04:15 PM",
    reference: "PAY-2026-8940",
  },
  {
    id: "payout-8938",
    agency_id: "ag-3",
    agency_name: "Skyline Travel & Holiday",
    license_number: "TL-SYL-2025-1029",
    bank_name: "Standard Chartered Bank",
    account_name: "Skyline Holiday BD",
    account_number: "•••• •••• •••• 1150",
    routing_number: "010271100",
    amount: "৳95,000",
    currency: "BDT",
    commission_fee: "12.0%",
    net_amount: "৳83,600",
    commission_balance: "৳120,000",
    status: "paid_out",
    requested_at: new Date(Date.now() - 3 * 86400000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    reference: "PAY-2026-8938",
  },
];
