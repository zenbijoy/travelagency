import {
  StandardResponse,
  PaginatedResponse,
  CheckEmailRequest,
  CheckEmailResponse,
  UserClaims,
  UserProfile,
  FlightSearchParams,
  FlightResponse,
  FlightSeatResponse,
  SeatLockRequest,
  HotelSearchParams,
  HotelResponse,
  HotelRoomResponse,
  RoomUnitCreateRequest,
  RoomUnitUpdateRequest,
  RoomUnitResponse,
  RoomMatrixResponse,
  HotelPmsAnalyticsResponse,
  BookingCreateRequest,
  BookingResponse,
  BookingQuoteRequest,
  BookingQuoteResponse,
  BookingStatusUpdateRequest,
  PaymentInitiateRequest,
  PaymentInitiateResponse,
  AgencyBalancesResponse,
  AgencyPayoutItem,
  AgencyStatementResponse,
  AdminProviderApproveRequest,
  AdminProviderRejectRequest,
  PayoutBatchResponse,
  KYCQueueItemResponse,
  KYCSubmissionResponse,
  KYCAdminApproveRequest,
  KYCAdminRejectRequest,
  KYCAdminRequestChangesRequest,
} from './types';

export interface ApiClientConfig {
  baseUrl?: string;
  getToken?: () => Promise<string | null> | string | null;
  apiKey?: string;
  defaultHeaders?: Record<string, string>;
  fetch?: typeof fetch;
}

export class ApiClientError extends Error {
  public status: number;
  public statusText: string;
  public data: unknown;

  constructor(status: number, statusText: string, data: unknown) {
    const msg =
      typeof data === 'object' && data !== null && 'detail' in data
        ? String((data as { detail: unknown }).detail)
        : `API Request failed with status ${status}: ${statusText}`;
    super(msg);
    this.name = 'ApiClientError';
    this.status = status;
    this.statusText = statusText;
    this.data = data;
  }
}

export class ShopnoJatraClient {
  public baseUrl: string;
  private getToken?: () => Promise<string | null> | string | null;
  private apiKey?: string;
  private defaultHeaders: Record<string, string>;
  private fetchFn: typeof fetch;

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = config.baseUrl || 'http://localhost:8000';
    this.getToken = config.getToken;
    this.apiKey = config.apiKey;
    this.defaultHeaders = config.defaultHeaders || {};
    this.fetchFn = config.fetch || (typeof window !== 'undefined' ? window.fetch.bind(window) : globalThis.fetch);
  }

  /**
   * Core request dispatcher with automatic token injection and error wrapping
   */
  public async request<T>(
    endpoint: string,
    options: RequestInit & { params?: Record<string, unknown>; idempotencyKey?: string } = {}
  ): Promise<T> {
    const { params, idempotencyKey, headers: customHeaders, ...customOptions } = options;

    let url = `${this.baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;

    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          if (Array.isArray(value)) {
            value.forEach((v) => searchParams.append(key, String(v)));
          } else {
            searchParams.append(key, String(value));
          }
        }
      }
      const qs = searchParams.toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...this.defaultHeaders,
      ...((customHeaders as Record<string, string>) || {}),
    };

    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    if (this.getToken) {
      try {
        const token = await this.getToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      } catch (err) {
        console.warn('Failed to resolve auth token for API request', err);
      }
    }

    const response = await this.fetchFn(url, {
      ...customOptions,
      headers,
    });

    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');

    if (!response.ok) {
      let errorData: unknown = null;
      try {
        errorData = isJson ? await response.json() : await response.text();
      } catch {
        errorData = response.statusText;
      }
      throw new ApiClientError(response.status, response.statusText, errorData);
    }

    if (response.status === 204) {
      return null as unknown as T;
    }

    if (isJson) {
      return (await response.json()) as T;
    }

    return (await response.text()) as unknown as T;
  }

  // ==================== AUTH MODULE ====================
  public auth = {
    checkEmail: (email: string) => {
      return this.request<StandardResponse<CheckEmailResponse>>('/api/v1/auth/check-email', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
    },

    me: () => {
      return this.request<StandardResponse<UserProfile>>('/api/v1/auth/me', {
        method: 'GET',
      });
    },

    inspectClaims: () => {
      return this.request<StandardResponse<UserClaims>>('/api/v1/auth/inspect-claims', {
        method: 'GET',
      });
    },
  };

  // ==================== FLIGHTS MODULE ====================
  public flights = {
    search: (params: FlightSearchParams) => {
      return this.request<PaginatedResponse<FlightResponse>>('/api/v1/flights/search', {
        method: 'GET',
        params: params as unknown as Record<string, unknown>,
      });
    },

    getById: (flightId: string) => {
      return this.request<StandardResponse<FlightResponse>>(`/api/v1/flights/${flightId}`, {
        method: 'GET',
      });
    },

    getSeats: (flightId: string) => {
      return this.request<StandardResponse<FlightSeatResponse[]>>(`/api/v1/flights/${flightId}/seats`, {
        method: 'GET',
      });
    },

    lockSeat: (flightId: string, seatId: string, passengerId?: string) => {
      return this.request<StandardResponse<{ locked: boolean; expires_at: string }>>(
        `/api/v1/flights/${flightId}/seats/${seatId}/lock`,
        {
          method: 'POST',
          body: JSON.stringify({ passenger_id: passengerId }),
        }
      );
    },

    unlockSeat: (flightId: string, seatId: string) => {
      return this.request<StandardResponse<{ unlocked: boolean }>>(
        `/api/v1/flights/${flightId}/seats/${seatId}/lock`,
        {
          method: 'DELETE',
        }
      );
    },
  };

  // ==================== HOTELS MODULE ====================
  public hotels = {
    search: (params: HotelSearchParams) => {
      return this.request<PaginatedResponse<HotelResponse>>('/api/v1/hotels/search', {
        method: 'GET',
        params: params as unknown as Record<string, unknown>,
      });
    },

    getById: (hotelId: string) => {
      return this.request<StandardResponse<HotelResponse>>(`/api/v1/hotels/${hotelId}`, {
        method: 'GET',
      });
    },

    getRooms: (hotelId: string) => {
      return this.request<StandardResponse<HotelRoomResponse[]>>(`/api/v1/hotels/${hotelId}/rooms`, {
        method: 'GET',
      });
    },
  };

  // ==================== HOTEL PMS MODULE ====================
  public hotelPms = {
    getMatrix: (hotelId: string) => {
      return this.request<StandardResponse<RoomMatrixResponse>>(`/api/v1/hotel-pms/${hotelId}/matrix`, {
        method: 'GET',
      });
    },

    getUnits: (hotelId: string) => {
      return this.request<StandardResponse<RoomUnitResponse[]>>(`/api/v1/hotel-pms/${hotelId}/units`, {
        method: 'GET',
      });
    },

    createUnit: (hotelId: string, data: RoomUnitCreateRequest) => {
      return this.request<StandardResponse<RoomUnitResponse>>(`/api/v1/hotel-pms/${hotelId}/units`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    updateUnit: (unitId: string, data: RoomUnitUpdateRequest) => {
      return this.request<StandardResponse<RoomUnitResponse>>(`/api/v1/hotel-pms/units/${unitId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    checkIn: (data: { folio_id?: string; guest_name: string; unit_id: string; check_in_notes?: string }) => {
      return this.request<StandardResponse<{ success: boolean; check_in_time: string }>>('/api/v1/hotel-pms/check-in', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    getHousekeeping: (hotelId: string) => {
      return this.request<StandardResponse<any>>(`/api/v1/hotel-pms/${hotelId}/housekeeping`, {
        method: 'GET',
      });
    },

    transitionHousekeeping: (taskId: string, targetStatus: string, notes?: string) => {
      return this.request<StandardResponse<any>>(`/api/v1/hotel-pms/housekeeping/${taskId}/transition`, {
        method: 'POST',
        body: JSON.stringify({ target_status: targetStatus, notes }),
      });
    },

    getAnalytics: (hotelId: string) => {
      return this.request<StandardResponse<HotelPmsAnalyticsResponse>>(`/api/v1/hotel-pms/${hotelId}/analytics`, {
        method: 'GET',
      });
    },
  };

  // ==================== BOOKINGS MODULE ====================
  public bookings = {
    create: (data: BookingCreateRequest) => {
      return this.request<StandardResponse<BookingResponse>>('/api/v1/bookings', {
        method: 'POST',
        body: JSON.stringify(data),
        idempotencyKey: data.idempotency_key || undefined,
      });
    },

    list: (params?: {
      status?: string;
      agency_id?: string;
      page?: number;
      page_size?: number;
      search?: string;
    }) => {
      return this.request<PaginatedResponse<BookingResponse>>('/api/v1/bookings', {
        method: 'GET',
        params: params as unknown as Record<string, unknown>,
      });
    },

    getById: (bookingId: string) => {
      return this.request<StandardResponse<BookingResponse>>(`/api/v1/bookings/${bookingId}`, {
        method: 'GET',
      });
    },

    getQuote: (data: BookingQuoteRequest) => {
      return this.request<StandardResponse<BookingQuoteResponse>>('/api/v1/bookings/quote', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    updateStatus: (bookingId: string, data: BookingStatusUpdateRequest) => {
      return this.request<StandardResponse<BookingResponse>>(`/api/v1/bookings/${bookingId}/status`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    cancel: (bookingId: string, reason?: string) => {
      return this.request<StandardResponse<BookingResponse>>(`/api/v1/bookings/${bookingId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ cancellation_reason: reason }),
      });
    },

    getTicket: (bookingId: string) => {
      return this.request<StandardResponse<{ ticket_url: string; qr_data: string }>>(
        `/api/v1/bookings/${bookingId}/ticket`,
        {
          method: 'GET',
        }
      );
    },

    scanTicket: (bookingId: string, qrPayload: string) => {
      return this.request<StandardResponse<{ valid: boolean; status: string; scanned_at: string }>>(
        `/api/v1/bookings/${bookingId}/scan-ticket`,
        {
          method: 'POST',
          body: JSON.stringify({ qr_payload: qrPayload }),
        }
      );
    },
  };

  // ==================== PAYMENTS MODULE ====================
  public payments = {
    initiate: (data: PaymentInitiateRequest) => {
      return this.request<StandardResponse<PaymentInitiateResponse>>('/api/v1/payments/initiate', {
        method: 'POST',
        body: JSON.stringify(data),
        idempotencyKey: data.idempotency_key || undefined,
      });
    },

    webhookBkash: (payload: unknown) => {
      return this.request<any>('/api/v1/payments/webhook/bkash', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    webhookNagad: (payload: unknown) => {
      return this.request<any>('/api/v1/payments/webhook/nagad', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    webhookRocket: (payload: unknown) => {
      return this.request<any>('/api/v1/payments/webhook/rocket', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    webhookStripe: (payload: unknown) => {
      return this.request<any>('/api/v1/payments/webhook/stripe', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    webhookCard: (payload: unknown) => {
      return this.request<any>('/api/v1/payments/webhook/card', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
  };

  // ==================== AGENCY MODULE ====================
  public agency = {
    getEarningsSummary: () => {
      return this.request<StandardResponse<AgencyBalancesResponse>>('/api/v1/agency/earnings/summary', {
        method: 'GET',
      });
    },

    getEarningsStatement: (params?: { start_date?: string; end_date?: string }) => {
      return this.request<StandardResponse<AgencyStatementResponse>>('/api/v1/agency/earnings/statement', {
        method: 'GET',
        params: params as unknown as Record<string, unknown>,
      });
    },

    getPayouts: (params?: { page?: number; page_size?: number }) => {
      return this.request<PaginatedResponse<AgencyPayoutItem>>('/api/v1/agency/earnings/payouts', {
        method: 'GET',
        params: params as unknown as Record<string, unknown>,
      });
    },
  };

  // ==================== ADMIN MODULE ====================
  public admin = {
    getPendingProviders: () => {
      return this.request<StandardResponse<any[]>>('/api/v1/admin/marketplace/providers/pending', {
        method: 'GET',
      });
    },

    approveProvider: (providerId: string, data?: AdminProviderApproveRequest) => {
      return this.request<StandardResponse<{ approved: boolean }>>(
        `/api/v1/admin/marketplace/providers/${providerId}/approve`,
        {
          method: 'POST',
          body: JSON.stringify(data || {}),
        }
      );
    },

    rejectProvider: (providerId: string, data: AdminProviderRejectRequest) => {
      return this.request<StandardResponse<{ rejected: boolean }>>(
        `/api/v1/admin/marketplace/providers/${providerId}/reject`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
    },

    getPayoutBatches: (params?: { status?: string }) => {
      return this.request<StandardResponse<PayoutBatchResponse[]>>('/api/v1/admin/payouts/batches', {
        method: 'GET',
        params: params as unknown as Record<string, unknown>,
      });
    },

    createPayoutBatch: (data: { agency_ids?: string[]; min_amount_bdt?: number }) => {
      return this.request<StandardResponse<PayoutBatchResponse>>('/api/v1/admin/payouts/batches/create', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    getPayoutBatch: (batchId: string) => {
      return this.request<StandardResponse<PayoutBatchResponse>>(`/api/v1/admin/payouts/batches/${batchId}`, {
        method: 'GET',
      });
    },

    approvePayoutBatch: (batchId: string) => {
      return this.request<StandardResponse<PayoutBatchResponse>>(`/api/v1/admin/payouts/batches/${batchId}/approve`, {
        method: 'POST',
      });
    },

    markPayoutBatchPaid: (batchId: string) => {
      return this.request<StandardResponse<PayoutBatchResponse>>(`/api/v1/admin/payouts/batches/${batchId}/mark-paid`, {
        method: 'POST',
      });
    },

    exportPayoutCsv: (batchId: string) => {
      return this.request<string>(`/api/v1/admin/payouts/batches/${batchId}/export-csv`, {
        method: 'GET',
      });
    },

    // KYC Admin queue
    kyc: {
      getQueue: () => {
        return this.request<StandardResponse<KYCQueueItemResponse[]>>('/api/v1/kyc/admin/queue', {
          method: 'GET',
        });
      },

      getSubmission: (submissionId: string) => {
        return this.request<StandardResponse<KYCSubmissionResponse>>(`/api/v1/kyc/admin/submissions/${submissionId}`, {
          method: 'GET',
        });
      },

      approve: (submissionId: string, data?: KYCAdminApproveRequest) => {
        return this.request<StandardResponse<KYCSubmissionResponse>>(
          `/api/v1/kyc/admin/submissions/${submissionId}/approve`,
          {
            method: 'POST',
            body: JSON.stringify(data || {}),
          }
        );
      },

      reject: (submissionId: string, data: KYCAdminRejectRequest) => {
        return this.request<StandardResponse<KYCSubmissionResponse>>(
          `/api/v1/kyc/admin/submissions/${submissionId}/reject`,
          {
            method: 'POST',
            body: JSON.stringify(data),
          }
        );
      },

      requestChanges: (submissionId: string, data: KYCAdminRequestChangesRequest) => {
        return this.request<StandardResponse<KYCSubmissionResponse>>(
          `/api/v1/kyc/admin/submissions/${submissionId}/request-changes`,
          {
            method: 'POST',
            body: JSON.stringify(data),
          }
        );
      },
    },
  };
}

export function createApiClient(config?: ApiClientConfig): ShopnoJatraClient {
  return new ShopnoJatraClient(config);
}
