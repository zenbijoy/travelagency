import {
  PlatformGmvMetrics,
  TenantAgency,
  AgencyVerificationStatus,
  KycSubmission,
  TenantHotel,
  HotelStatus,
  PaymentTransaction,
  GatewayHealthStatus,
  RefundRequest,
  RefundStatus,
  AdminUser,
  AdminRole,
  AuditLogEntry,
  SupplierHealthMetric,
  SystemHealthMetric
} from '@/types';
import { ShopnoJatraClient } from '@shopnojatra/api-client';

const API_BASE_URL =
  (typeof process !== 'undefined' && process.env?.VITE_API_URL) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:8000';

export const adminApiClient = new ShopnoJatraClient({
  baseUrl: API_BASE_URL,
  getToken: () => {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem('shopnojatra_access_token') || localStorage.getItem('sj_admin_token');
  },
});
import {
  INITIAL_PLATFORM_METRICS,
  INITIAL_SYSTEM_HEALTH,
  INITIAL_AGENCIES,
  INITIAL_KYC_QUEUE,
  INITIAL_HOTELS,
  INITIAL_TRANSACTIONS,
  INITIAL_GATEWAYS,
  INITIAL_REFUNDS,
  INITIAL_ADMIN_USERS,
  INITIAL_AUDIT_LOGS,
  INITIAL_SUPPLIER_METRICS
} from './mockData';

class AdminDataStore {
  private metrics = { ...INITIAL_PLATFORM_METRICS };
  private systemHealth = [...INITIAL_SYSTEM_HEALTH];
  private agencies = [...INITIAL_AGENCIES];
  private kycQueue = [...INITIAL_KYC_QUEUE];
  private hotels = [...INITIAL_HOTELS];
  private transactions = [...INITIAL_TRANSACTIONS];
  private gateways = [...INITIAL_GATEWAYS];
  private refunds = [...INITIAL_REFUNDS];
  private adminUsers = [...INITIAL_ADMIN_USERS];
  private auditLogs = [...INITIAL_AUDIT_LOGS];
  private suppliers = [...INITIAL_SUPPLIER_METRICS];

  private logAudit(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
    const timestamp = new Date().toISOString();
    const newLog: AuditLogEntry = {
      ...entry,
      id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp
    };
    this.auditLogs.unshift(newLog);
    return newLog;
  }

  // 1. Dashboard Metrics
  async getPlatformMetrics(): Promise<PlatformGmvMetrics> {
    await new Promise((r) => setTimeout(r, 120));
    return {
      ...this.metrics,
      activeAgencies: this.agencies.filter(a => a.status === 'verified').length,
      activeHotels: this.hotels.filter(h => h.status === 'verified').length,
      pendingRefundsCount: this.refunds.filter(r => r.status === 'requested' || r.status === 'processing').length,
      pendingKycCount: this.kycQueue.filter(k => k.status === 'submitted' || k.status === 'in_review').length,
    };
  }

  async getSystemHealth(): Promise<SystemHealthMetric[]> {
    await new Promise((r) => setTimeout(r, 80));
    return [...this.systemHealth];
  }

  // 2. Tenant Management: Agencies
  async getAgencies(statusFilter = 'all', search = ''): Promise<TenantAgency[]> {
    await new Promise((r) => setTimeout(r, 150));
    return this.agencies.filter((agency) => {
      const matchStatus = statusFilter === 'all' || agency.status === statusFilter;
      const matchSearch = !search || 
        agency.name.toLowerCase().includes(search.toLowerCase()) ||
        agency.tradeLicenseNumber.toLowerCase().includes(search.toLowerCase()) ||
        agency.city.toLowerCase().includes(search.toLowerCase()) ||
        agency.ownerName.toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchSearch;
    });
  }

  async updateAgencyStatus(
    id: string, 
    status: AgencyVerificationStatus, 
    actor: { id: string; name: string; role: AdminRole }, 
    reason: string
  ): Promise<TenantAgency> {
    const idx = this.agencies.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error('Agency not found');

    const prev = this.agencies[idx];
    const updated: TenantAgency = {
      ...prev,
      status,
      updatedAt: new Date().toISOString()
    };
    this.agencies[idx] = updated;

    this.logAudit({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: `AGENCY_STATUS_${status.toUpperCase()}`,
      module: 'AGENCY',
      entityType: 'TenantAgency',
      entityId: id,
      details: {
        agencyName: prev.name,
        fromStatus: prev.status,
        toStatus: status,
        reason
      },
      ipAddress: '103.145.118.24',
      userAgent: navigator.userAgent
    });

    return updated;
  }

  // 3. Tenant Management: KYC Review Queue
  async getKycQueue(statusFilter = 'all'): Promise<KycSubmission[]> {
    await new Promise((r) => setTimeout(r, 150));
    return this.kycQueue
      .filter((k) => statusFilter === 'all' || k.status === statusFilter)
      .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()); // Oldest first (FIFO)
  }

  async getKycSubmission(id: string): Promise<KycSubmission | null> {
    await new Promise((r) => setTimeout(r, 100));
    return this.kycQueue.find((k) => k.id === id) || null;
  }

  async reviewKycSubmission(
    id: string,
    decision: 'approve' | 'reject' | 'request_changes',
    note: string,
    actor: { id: string; name: string; role: AdminRole }
  ): Promise<KycSubmission> {
    const idx = this.kycQueue.findIndex((k) => k.id === id);
    if (idx === -1) throw new Error('Submission not found');

    const sub = this.kycQueue[idx];
    const statusMap: Record<string, KycSubmission['status']> = {
      approve: 'verified',
      reject: 'rejected',
      request_changes: 'needs_changes'
    };

    const newStatus = statusMap[decision];
    const timestamp = new Date().toISOString();

    const updatedSub: KycSubmission = {
      ...sub,
      status: newStatus,
      reviewedBy: actor.name,
      reviewedAt: timestamp,
      decisionReason: note,
      auditTrail: [
        ...sub.auditTrail,
        {
          id: `at-${Date.now()}`,
          action: `DECISION_${decision.toUpperCase()}`,
          actor: actor.name,
          timestamp,
          note
        }
      ]
    };
    this.kycQueue[idx] = updatedSub;

    // Automatically update the agency's verification status
    const agIdx = this.agencies.findIndex((a) => a.id === sub.agencyId);
    if (agIdx !== -1) {
      this.agencies[agIdx].status = decision === 'approve' ? 'verified' : (decision === 'reject' ? 'rejected' : 'pending');
    }

    this.logAudit({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: `KYC_${decision.toUpperCase()}`,
      module: 'KYC',
      entityType: 'KycSubmission',
      entityId: id,
      details: {
        agencyId: sub.agencyId,
        agencyName: sub.agencyName,
        decision,
        note
      },
      ipAddress: '103.145.118.24',
      userAgent: navigator.userAgent
    });

    return updatedSub;
  }

  // 4. Tenant Management: Hotels
  async getHotels(statusFilter = 'all', search = ''): Promise<TenantHotel[]> {
    await new Promise((r) => setTimeout(r, 150));
    return this.hotels.filter((h) => {
      const matchStatus = statusFilter === 'all' || h.status === statusFilter;
      const matchSearch = !search ||
        h.name.toLowerCase().includes(search.toLowerCase()) ||
        h.city.toLowerCase().includes(search.toLowerCase()) ||
        h.contactPerson.toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchSearch;
    });
  }

  async updateHotelStatus(
    id: string,
    status: HotelStatus,
    actor: { id: string; name: string; role: AdminRole },
    reason: string
  ): Promise<TenantHotel> {
    const idx = this.hotels.findIndex((h) => h.id === id);
    if (idx === -1) throw new Error('Hotel not found');

    const prev = this.hotels[idx];
    const updated: TenantHotel = {
      ...prev,
      status,
      updatedAt: new Date().toISOString()
    };
    this.hotels[idx] = updated;

    this.logAudit({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: `HOTEL_STATUS_${status.toUpperCase()}`,
      module: 'HOTEL',
      entityType: 'TenantHotel',
      entityId: id,
      details: {
        hotelName: prev.name,
        fromStatus: prev.status,
        toStatus: status,
        reason
      },
      ipAddress: '103.145.118.24',
      userAgent: navigator.userAgent
    });

    return updated;
  }

  // 5. Booking & Payment Oversight: Transactions
  async getTransactions(
    statusFilter = 'all',
    gatewayFilter = 'all',
    search = ''
  ): Promise<PaymentTransaction[]> {
    await new Promise((r) => setTimeout(r, 150));
    return this.transactions.filter((t) => {
      const matchStatus = statusFilter === 'all' || t.status === statusFilter;
      const matchGateway = gatewayFilter === 'all' || t.gateway === gatewayFilter;
      const matchSearch = !search ||
        t.orderId.toLowerCase().includes(search.toLowerCase()) ||
        t.bookingRef.toLowerCase().includes(search.toLowerCase()) ||
        t.customerName.toLowerCase().includes(search.toLowerCase()) ||
        t.customerEmail.toLowerCase().includes(search.toLowerCase()) ||
        t.gatewayTransactionId.toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchGateway && matchSearch;
    });
  }

  async reconcileTransaction(
    id: string,
    actor: { id: string; name: string; role: AdminRole }
  ): Promise<PaymentTransaction> {
    const idx = this.transactions.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error('Transaction not found');

    const t = this.transactions[idx];
    const updated: PaymentTransaction = {
      ...t,
      reconciled: true,
      reconciledAt: new Date().toISOString(),
      reconciledBy: actor.name
    };
    this.transactions[idx] = updated;

    this.logAudit({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'TRANSACTION_RECONCILED',
      module: 'PAYMENT',
      entityType: 'PaymentTransaction',
      entityId: id,
      details: {
        orderId: t.orderId,
        amountBDT: t.amountBDT,
        gateway: t.gateway,
        gatewayTxnId: t.gatewayTransactionId
      },
      ipAddress: '103.145.118.24',
      userAgent: navigator.userAgent
    });

    return updated;
  }

  // 6. Gateways
  async getGateways(): Promise<GatewayHealthStatus[]> {
    await new Promise((r) => setTimeout(r, 100));
    return [...this.gateways];
  }

  // 7. Refunds & Disputes
  async getRefunds(statusFilter = 'all', search = ''): Promise<RefundRequest[]> {
    await new Promise((r) => setTimeout(r, 150));
    return this.refunds.filter((ref) => {
      const matchStatus = statusFilter === 'all' || ref.status === statusFilter;
      const matchSearch = !search ||
        ref.id.toLowerCase().includes(search.toLowerCase()) ||
        ref.bookingId.toLowerCase().includes(search.toLowerCase()) ||
        ref.orderId.toLowerCase().includes(search.toLowerCase()) ||
        ref.customerName.toLowerCase().includes(search.toLowerCase()) ||
        ref.reasonDetail.toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchSearch;
    });
  }

  async processRefundDecision(
    id: string,
    decision: 'approve' | 'reject' | 'hold',
    note: string,
    actor: { id: string; name: string; role: AdminRole }
  ): Promise<RefundRequest> {
    const idx = this.refunds.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error('Refund request not found');

    const r = this.refunds[idx];
    const statusMap: Record<string, RefundStatus> = {
      approve: 'approved',
      reject: 'rejected',
      hold: 'on_hold'
    };

    const updated: RefundRequest = {
      ...r,
      status: statusMap[decision],
      reviewedBy: actor.name,
      reviewedAt: new Date().toISOString(),
      decisionNote: note
    };
    this.refunds[idx] = updated;

    this.logAudit({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: `REFUND_${decision.toUpperCase()}`,
      module: 'REFUND',
      entityType: 'RefundRequest',
      entityId: id,
      details: {
        bookingId: r.bookingId,
        amountBDT: r.refundAmountBDT,
        customerName: r.customerName,
        decision,
        note
      },
      ipAddress: '103.145.118.24',
      userAgent: navigator.userAgent
    });

    return updated;
  }

  // 8. RBAC: Admin Users
  async getAdminUsers(): Promise<AdminUser[]> {
    await new Promise((r) => setTimeout(r, 120));
    return [...this.adminUsers];
  }

  async updateAdminRole(
    userId: string,
    newRole: AdminRole,
    actor: { id: string; name: string; role: AdminRole }
  ): Promise<AdminUser> {
    const idx = this.adminUsers.findIndex((u) => u.id === userId);
    if (idx === -1) throw new Error('Admin user not found');

    const prev = this.adminUsers[idx];
    const updated: AdminUser = {
      ...prev,
      role: newRole
    };
    this.adminUsers[idx] = updated;

    this.logAudit({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'ADMIN_ROLE_UPDATED',
      module: 'RBAC',
      entityType: 'AdminUser',
      entityId: userId,
      details: {
        targetUser: prev.email,
        fromRole: prev.role,
        toRole: newRole
      },
      ipAddress: '103.145.118.24',
      userAgent: navigator.userAgent
    });

    return updated;
  }

  async createAdminUser(
    data: { name: string; email: string; role: AdminRole; department: string },
    actor: { id: string; name: string; role: AdminRole }
  ): Promise<AdminUser> {
    const newUser: AdminUser = {
      id: `usr-${Date.now()}`,
      name: data.name,
      email: data.email,
      role: data.role,
      department: data.department,
      lastLogin: 'Never',
      isActive: true,
      permissions: []
    };
    this.adminUsers.push(newUser);

    this.logAudit({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'ADMIN_USER_CREATED',
      module: 'RBAC',
      entityType: 'AdminUser',
      entityId: newUser.id,
      details: {
        createdEmail: data.email,
        assignedRole: data.role
      },
      ipAddress: '103.145.118.24',
      userAgent: navigator.userAgent
    });

    return newUser;
  }

  // 9. RBAC: Audit Logs
  async getAuditLogs(moduleFilter = 'ALL', search = ''): Promise<AuditLogEntry[]> {
    await new Promise((r) => setTimeout(r, 120));
    return this.auditLogs.filter((l) => {
      const matchModule = moduleFilter === 'ALL' || l.module === moduleFilter;
      const matchSearch = !search ||
        l.actorName.toLowerCase().includes(search.toLowerCase()) ||
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        l.entityId.toLowerCase().includes(search.toLowerCase()) ||
        l.entityId.toLowerCase().includes(search.toLowerCase());
      return matchModule && matchSearch;
    });
  }

  // 10. Supplier Monitoring
  async getSuppliers(category = 'all'): Promise<SupplierHealthMetric[]> {
    await new Promise((r) => setTimeout(r, 100));
    return this.suppliers.filter((s) => category === 'all' || s.category === category);
  }

  async toggleCircuitBreaker(
    supplierId: string,
    actor: { id: string; name: string; role: AdminRole }
  ): Promise<SupplierHealthMetric> {
    const idx = this.suppliers.findIndex((s) => s.id === supplierId);
    if (idx === -1) throw new Error('Supplier not found');

    const s = this.suppliers[idx];
    const updated: SupplierHealthMetric = {
      ...s,
      circuitBreakerOpen: !s.circuitBreakerOpen,
      status: !s.circuitBreakerOpen ? 'down' : 'healthy'
    };
    this.suppliers[idx] = updated;

    this.logAudit({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: `SUPPLIER_CIRCUIT_BREAKER_${updated.circuitBreakerOpen ? 'TRIPPED' : 'RESET'}`,
      module: 'SUPPLIER',
      entityType: 'SupplierHealthMetric',
      entityId: supplierId,
      details: {
        supplierName: s.name,
        endpoint: s.endpoint,
        circuitBreakerOpen: updated.circuitBreakerOpen
      },
      ipAddress: '103.145.118.24',
      userAgent: navigator.userAgent
    });

    return updated;
  }

  // ==========================================
  // REALTIME BACKEND ADMIN INTEGRATIONS
  // ==========================================

  async fetchLivePayoutBatches(params?: { status?: string }) {
    try {
      const res = await adminApiClient.admin.getPayoutBatches(params);
      return res.data;
    } catch (err) {
      console.warn('Realtime admin payout batches unavailable, using local ledger:', err);
      return null;
    }
  }

  async approveLivePayoutBatch(batchId: string) {
    try {
      const res = await adminApiClient.admin.approvePayoutBatch(batchId);
      return res.data;
    } catch (err) {
      console.warn('Realtime payout batch approval unavailable, updating local ledger:', err);
      return null;
    }
  }

  async fetchLivePendingProviders() {
    try {
      const res = await adminApiClient.admin.getPendingProviders();
      return res.data;
    } catch (err) {
      console.warn('Realtime marketplace provider queue unavailable, using local store:', err);
      return null;
    }
  }
}

export const adminService = new AdminDataStore();
