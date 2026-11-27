/**
 * ShopnoJatra Platform Admin Control Center - Enterprise Domain Types
 */

export type AdminRole = 
  | 'super_admin' 
  | 'ops_admin' 
  | 'finance_admin' 
  | 'support_admin' 
  | 'readonly';

export type AdminPermission =
  | 'users.view'
  | 'users.manage'
  | 'agencies.view'
  | 'agencies.manage'
  | 'agencies.kyc_review'
  | 'hotels.view'
  | 'hotels.manage'
  | 'bookings.view'
  | 'bookings.manage'
  | 'payments.view'
  | 'payments.reconcile'
  | 'refunds.view'
  | 'refunds.approve'
  | 'refunds.reject'
  | 'monitoring.view'
  | 'monitoring.circuit_break'
  | 'audit.view'
  | 'rbac.manage';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  avatarUrl?: string;
  department: string;
  lastLogin: string;
  isActive: boolean;
  permissions: AdminPermission[];
}

export type AgencyVerificationStatus = 'pending' | 'verified' | 'suspended' | 'rejected';

export interface TenantAgency {
  id: string;
  name: string;
  tradeLicenseNumber: string;
  ownerName: string;
  email: string;
  phone: string;
  city: string;
  tier: 'Platinum' | 'Gold' | 'Silver' | 'Standard';
  status: AgencyVerificationStatus;
  kycSubmissionId?: string;
  commissionRate: number; // e.g. 7.5%
  totalBookings: number;
  totalGmvBDT: number;
  walletBalanceBDT: number;
  createdAt: string;
  updatedAt: string;
}

export type DocumentCheckResult = 'pass' | 'warn' | 'fail';

export interface DocumentCheck {
  id: string;
  name: string;
  result: DocumentCheckResult;
  detail: string;
}

export interface KycDocument {
  id: string;
  docType: 'trade_license' | 'tax_cert' | 'nid_owner' | 'bank_statement';
  title: string;
  fileUrl: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  extractedFields: Record<string, string | number>;
  checks: DocumentCheck[];
}

export type KycQueueStatus = 'submitted' | 'in_review' | 'needs_changes' | 'verified' | 'rejected';

export interface KycSubmission {
  id: string;
  agencyId: string;
  agencyName: string;
  submittedAt: string;
  status: KycQueueStatus;
  documentsCount: number;
  documents: KycDocument[];
  reviewedBy?: string;
  reviewedAt?: string;
  decisionReason?: string;
  auditTrail: Array<{
    id: string;
    action: string;
    actor: string;
    timestamp: string;
    note?: string;
  }>;
}

export type HotelStatus = 'verified' | 'pending' | 'suspended';

export interface TenantHotel {
  id: string;
  name: string;
  city: string;
  address: string;
  starRating: number;
  roomsCount: number;
  status: HotelStatus;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  commissionRate: number; // e.g. 10%
  totalBookings: number;
  totalGmvBDT: number;
  createdAt: string;
  updatedAt: string;
}

export type PaymentGatewayId = 'bkash' | 'nagad' | 'rocket' | 'sslcommerz' | 'stripe';
export type PaymentStatus = 'success' | 'pending' | 'failed' | 'refunded';

export interface PaymentTransaction {
  id: string;
  orderId: string;
  bookingRef: string;
  customerName: string;
  customerEmail: string;
  serviceType: 'flight' | 'hotel' | 'holiday_package' | 'bus';
  amountBDT: number;
  amountUSD: number;
  gateway: PaymentGatewayId;
  gatewayTransactionId: string;
  status: PaymentStatus;
  reconciled: boolean;
  reconciledAt?: string;
  reconciledBy?: string;
  createdAt: string;
}

export interface GatewayHealthStatus {
  gateway: PaymentGatewayId;
  label: string;
  status: 'operational' | 'degraded' | 'maintenance' | 'down';
  uptime24h: number; // e.g. 99.98
  latencyMs: number;
  successRate: number; // e.g. 98.4
  lastPingAt: string;
  activeDisputes: number;
}

export type RefundStatus = 'requested' | 'approved' | 'processing' | 'completed' | 'rejected' | 'on_hold';

export interface RefundRequest {
  id: string;
  bookingId: string;
  orderId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceType: 'flight' | 'hotel' | 'holiday_package' | 'bus';
  originalAmountBDT: number;
  refundAmountBDT: number;
  reasonCategory: 'flight_cancellation' | 'hotel_overbooking' | 'customer_change_mind' | 'double_charge' | 'other';
  reasonDetail: string;
  requestedAt: string;
  status: RefundStatus;
  slaExpiresAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  decisionNote?: string;
  refundMethod?: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: AdminRole;
  action: string;
  module: 'AUTH' | 'AGENCY' | 'KYC' | 'HOTEL' | 'PAYMENT' | 'REFUND' | 'RBAC' | 'SUPPLIER';
  entityType: string;
  entityId: string;
  details: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
}

export type SupplierCategory = 'Airlines' | 'GDS' | 'Payment Gateways';

export interface SupplierHealthMetric {
  id: string;
  name: string;
  category: SupplierCategory;
  endpoint: string;
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number;
  uptime24h: number;
  errorRate24h: number;
  p99LatencyMs: number;
  lastCheckedAt: string;
  circuitBreakerOpen: boolean;
}

export interface SystemHealthMetric {
  service: string;
  category: 'core' | 'database' | 'storage' | 'gateway' | 'push';
  latencyMs: number;
  status: 'operational' | 'degraded' | 'down';
  lastChecked: string;
}

export interface PlatformGmvMetrics {
  gmvBDT: number;
  gmvUSD: number;
  activeAgencies: number;
  activeHotels: number;
  totalBookings: number;
  completedBookings: number;
  pendingRefundsCount: number;
  pendingKycCount: number;
  grossMarginPercentage: number;
  currency: 'BDT' | 'USD';
  history30Days: Array<{
    date: string;
    gmvBDT: number;
    gmvUSD: number;
    bookings: number;
  }>;
}
