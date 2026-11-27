import { describe, it, expect } from 'vitest';
import {
  hotelSearchSchema,
  hotelRoomCreateSchema,
  hotelRoomTypeCreateSchema,
} from '../hotel';

describe('Hotel & Room Inventory Validation Schemas', () => {
  describe('hotelSearchSchema', () => {
    it('validates standard hotel query with proper date bounds', () => {
      const valid = hotelSearchSchema.safeParse({
        city: 'Coxs Bazar',
        check_in: '2026-12-20',
        check_out: '2026-12-24',
        guests: 2,
        rooms: 1,
      });
      expect(valid.success).toBe(true);
    });

    it('rejects hotel search where check-out date is not after check-in date', () => {
      const invalid = hotelSearchSchema.safeParse({
        city: 'Coxs Bazar',
        check_in: '2026-12-25',
        check_out: '2026-12-20', // earlier!
        guests: 2,
      });
      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error.issues.some((e) => e.path.includes('check_out'))).toBe(true);
      }
    });

    it('rejects same-day check-out when strictly after is required', () => {
      const invalid = hotelSearchSchema.safeParse({
        city: 'Dhaka',
        check_in: '2026-12-20',
        check_out: '2026-12-20',
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('hotelRoomCreateSchema', () => {
    it('validates PMS room creation payload', () => {
      const valid = hotelRoomCreateSchema.safeParse({
        room_type_id: 'rt-deluxe-001',
        room_number: '302',
        floor_number: 3,
        wing: 'North Wing',
        is_vip_room: true,
        base_nightly_rate_bdt: 8500,
        amenities_override: ['Balcony Sea View', 'Jacuzzi'],
      });
      expect(valid.success).toBe(true);
    });

    it('rejects empty room number', () => {
      const invalid = hotelRoomCreateSchema.safeParse({
        room_type_id: 'rt-deluxe-001',
        room_number: '',
        base_nightly_rate_bdt: 8500,
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('hotelRoomTypeCreateSchema', () => {
    it('validates comprehensive room type definition', () => {
      const valid = hotelRoomTypeCreateSchema.safeParse({
        hotel_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        name: 'Presidential Ocean Suite',
        category: 'presidential_suite',
        max_occupancy: 4,
        max_adults: 2,
        max_children: 2,
        bed_configuration: '1 Super King + 1 Rollaway',
        room_size_sqm: 110,
        base_price_bdt: 35000,
        amenities: ['Private Pool', 'Butler Service', 'Sea View'],
        images: ['https://images.shopnojatra.com/hotels/cxb-pres-1.jpg'],
      });
      expect(valid.success).toBe(true);
    });

    it('rejects invalid hotel UUID', () => {
      const invalid = hotelRoomTypeCreateSchema.safeParse({
        hotel_id: 'not-a-uuid',
        name: 'Standard Room',
        bed_configuration: '1 Queen',
        base_price_bdt: 3000,
      });
      expect(invalid.success).toBe(false);
    });
  });
});
