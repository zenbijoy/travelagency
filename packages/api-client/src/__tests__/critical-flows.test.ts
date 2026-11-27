import { describe, it, expect, vi } from 'vitest';
import { ShopnoJatraClient, ApiClientError } from '../client';

describe('ShopnoJatra API Client - Critical Flow Integration Tests', () => {
  describe('Flow 1: Authentication & RBAC Flow', () => {
    it('injects Bearer token into Authorization header when getToken is provided', async () => {
      let capturedHeaders: Record<string, string> = {};

      const mockFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        capturedHeaders = init.headers as Record<string, string>;
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            success: true,
            data: { user_id: 'usr-123', email: 'agent@agency.com', role: 'agency_agent' },
          }),
        };
      });

      const client = new ShopnoJatraClient({
        baseUrl: 'http://localhost:8000',
        getToken: () => 'mock-jwt-bearer-token-xyz',
        fetch: mockFetch,
      });

      const result = await client.auth.getMe();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(capturedHeaders['Authorization']).toBe('Bearer mock-jwt-bearer-token-xyz');
      expect(result.data.role).toBe('agency_agent');
    });

    it('throws structured ApiClientError on 401 Unauthorized', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: async () => ({ detail: 'JWT expired or token invalid' }),
        };
      });

      const client = new ShopnoJatraClient({
        baseUrl: 'http://localhost:8000',
        getToken: () => 'expired-token',
        fetch: mockFetch,
      });

      await expect(client.auth.getMe()).rejects.toThrow(ApiClientError);
    });

    it('calls checkEmail endpoint cleanly', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            success: true,
            data: { exists: false, role: null },
          }),
        };
      });

      const client = new ShopnoJatraClient({ fetch: mockFetch });
      const resp = await client.auth.checkEmail('newuser@shopnojatra.com');
      expect(resp.data.exists).toBe(false);
    });
  });

  describe('Flow 2: Booking Search & Checkout Flow', () => {
    it('dispatches flight search with correct query parameters and pagination', async () => {
      let capturedUrl = '';

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            items: [
              {
                id: 'fl-1',
                airline_name: 'Biman Bangladesh Airlines',
                flight_number: 'BG-433',
                price_bdt: 4200,
              },
            ],
            total: 1,
            page: 1,
            page_size: 20,
            has_next: false,
          }),
        };
      });

      const client = new ShopnoJatraClient({ fetch: mockFetch });
      const results = await client.flights.search({
        origin: 'DAC',
        destination: 'CXB',
        departure_date: '2026-12-01',
        passengers: 2,
        cabin_class: 'economy',
      });

      expect(capturedUrl).toContain('origin=DAC');
      expect(capturedUrl).toContain('destination=CXB');
      expect(capturedUrl).toContain('departure_date=2026-12-01');
      expect(results.items).toHaveLength(1);
    });

    it('injects Idempotency-Key header on booking creation', async () => {
      let capturedHeaders: Record<string, string> = {};

      const mockFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        capturedHeaders = init.headers as Record<string, string>;
        return {
          ok: true,
          status: 201,
          statusText: 'Created',
          json: async () => ({
            id: 'bk-new-123',
            reference_code: 'SJ-2026-9988',
            status: 'PENDING_PAYMENT',
            total_amount_bdt: 8400,
          }),
        };
      });

      const client = new ShopnoJatraClient({
        getToken: () => 'token',
        fetch: mockFetch,
      });

      const booking = await client.bookings.create(
        {
          product_type: 'flight',
          destination_city: 'Coxs Bazar',
          origin_city: 'Dhaka',
          number_of_guests: 2,
          items: [
            {
              product_type: 'flight',
              product_id: 'fl-1',
              product_name: 'BG-433 DAC-CXB',
              quantity: 2,
              unit_price: 4200,
              item_metadata: {},
            },
          ],
          passengers: [],
        },
        'idem-booking-header-val-445'
      );

      expect(capturedHeaders['Idempotency-Key']).toBe('idem-booking-header-val-445');
      expect(booking.status).toBe('PENDING_PAYMENT');
      expect(booking.reference_code).toBe('SJ-2026-9988');
    });
  });

  describe('Flow 3: Hotel PMS Room Inventory Flow', () => {
    it('fetches room inventory matrix and updates room status', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
              id: 'room-301',
              room_number: '301',
              status: 'CLEANING',
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            hotel_id: 'hotel-royal-tulip',
            floors: [
              {
                floor_number: 3,
                rooms: [
                  { id: 'room-301', room_number: '301', status: 'AVAILABLE' },
                  { id: 'room-302', room_number: '302', status: 'OCCUPIED' },
                ],
              },
            ],
            occupancy_rate: 50.0,
          }),
        };
      });

      const client = new ShopnoJatraClient({
        getToken: () => 'staff-token',
        fetch: mockFetch,
      });

      // 1. Matrix fetch
      const matrix = await client.hotelPms.getRoomMatrix('hotel-royal-tulip');
      expect(matrix.occupancy_rate).toBe(50.0);
      expect(matrix.floors[0].rooms).toHaveLength(2);

      // 2. Room unit status transition (AVAILABLE -> CLEANING)
      const updated = await client.hotelPms.updateRoomUnit('room-301', {
        status: 'CLEANING',
      });
      expect(updated.status).toBe('CLEANING');
    });
  });

  describe('Flow 4: Platform Admin Audit & KYC Oversight Flow', () => {
    it('fetches pending KYC verification queue and executes approval action', async () => {
      let approvalCalledWith: unknown = null;

      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/approve') && init?.method === 'POST') {
          approvalCalledWith = JSON.parse(init.body as string);
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
              id: 'kyc-sub-001',
              agency_id: 'agency-horizon-001',
              status: 'APPROVED',
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => [
            {
              submission_id: 'kyc-sub-001',
              agency_id: 'agency-horizon-001',
              agency_name: 'Horizon Travel Group',
              trade_license_number: 'TRAD-DNCC-1234',
              submitted_at: '2026-11-27T10:00:00Z',
              status: 'PENDING',
            },
          ],
        };
      });

      const client = new ShopnoJatraClient({
        getToken: () => 'super-admin-token',
        fetch: mockFetch,
      });

      const queue = await client.admin.getKycQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].agency_name).toBe('Horizon Travel Group');

      const approved = await client.admin.approveKyc('kyc-sub-001', {
        admin_notes: 'Verified against DNCC trade registry. Compliant.',
      });
      expect(approved.status).toBe('APPROVED');
      expect(approvalCalledWith).toEqual({
        admin_notes: 'Verified against DNCC trade registry. Compliant.',
      });
    });
  });
});
