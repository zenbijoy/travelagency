import { describe, it, expect } from 'vitest';
import {
  bookingCreateSchema,
  bookingItemSchema,
  bookingPassengerSchema,
  bookingQuoteSchema,
} from '../booking';
import { flightSearchSchema } from '../flight';

describe('Booking & Flight Validation Schemas', () => {
  describe('bookingPassengerSchema', () => {
    it('validates standard passenger information', () => {
      const valid = bookingPassengerSchema.safeParse({
        first_name: 'Habib',
        last_name: 'Rahman',
        email: 'habib@example.com',
        passenger_type: 'adult',
      });
      expect(valid.success).toBe(true);
    });

    it('rejects missing first or last name', () => {
      const invalid = bookingPassengerSchema.safeParse({
        first_name: '',
        last_name: 'Rahman',
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('bookingCreateSchema', () => {
    it('validates a complete multi-item booking request', () => {
      const valid = bookingCreateSchema.safeParse({
        product_type: 'flight',
        destination_city: 'Coxs Bazar',
        origin_city: 'Dhaka',
        start_date: '2026-12-01',
        end_date: '2026-12-05',
        number_of_guests: 2,
        items: [
          {
            product_type: 'flight',
            product_id: 'FL-DAC-CXB-001',
            product_name: 'Biman Bangladesh Airlines BG-433',
            quantity: 2,
            unit_price: 4500,
          },
        ],
        passengers: [
          {
            first_name: 'Habib',
            last_name: 'Rahman',
            passenger_type: 'adult',
          },
          {
            first_name: 'Nasrin',
            last_name: 'Akter',
            passenger_type: 'adult',
          },
        ],
        idempotency_key: 'idem-test-uuid-999',
      });
      expect(valid.success).toBe(true);
    });

    it('rejects booking request with empty items array', () => {
      const invalid = bookingCreateSchema.safeParse({
        product_type: 'flight',
        destination_city: 'Coxs Bazar',
        items: [],
      });
      expect(invalid.success).toBe(false);
    });

    it('rejects non-compliant date strings', () => {
      const invalid = bookingCreateSchema.safeParse({
        product_type: 'hotel',
        destination_city: 'Sylhet',
        start_date: '01-12-2026', // wrong format
        items: [
          {
            product_type: 'hotel',
            product_id: 'HT-SYL-001',
            product_name: 'Grand Sylhet Resort',
            unit_price: 12000,
          },
        ],
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('flightSearchSchema', () => {
    it('validates valid one-way flight search', () => {
      const result = flightSearchSchema.safeParse({
        origin: 'DAC',
        destination: 'CXB',
        departure_date: '2026-12-10',
        passengers: 1,
        cabin_class: 'economy',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.trip_type).toBe('one_way');
      }
    });

    it('validates valid round-trip search', () => {
      const result = flightSearchSchema.safeParse({
        origin: 'DAC',
        destination: 'BKK',
        departure_date: '2026-12-10',
        return_date: '2026-12-15',
        trip_type: 'round_trip',
        passengers: 2,
      });
      expect(result.success).toBe(true);
    });

    it('rejects round-trip search where return date precedes departure date', () => {
      const result = flightSearchSchema.safeParse({
        origin: 'DAC',
        destination: 'BKK',
        departure_date: '2026-12-20',
        return_date: '2026-12-15',
        trip_type: 'round_trip',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((e) => e.path.includes('return_date'))).toBe(true);
      }
    });

    it('enforces 3-letter IATA uppercase airport codes', () => {
      const result = flightSearchSchema.safeParse({
        origin: 'dac',
        destination: 'cxb',
        departure_date: '2026-12-10',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.origin).toBe('DAC');
        expect(result.data.destination).toBe('CXB');
      }
    });
  });
});
