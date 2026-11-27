import { z } from 'zod';

export const hotelSearchSchema = z
  .object({
    city: z.string().trim().min(2, 'City name is required'),
    check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Check-in date must be YYYY-MM-DD'),
    check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Check-out date must be YYYY-MM-DD'),
    guests: z.number().int().min(1).default(1),
    rooms: z.number().int().min(1).default(1),
    min_star_rating: z.number().min(1).max(5).optional().nullable(),
    min_price: z.number().min(0).optional().nullable(),
    max_price: z.number().positive().optional().nullable(),
    sort_by: z.enum(['price_asc', 'price_desc', 'rating_desc', 'popularity']).default('popularity'),
    page: z.number().int().min(1).default(1),
    page_size: z.number().int().min(1).max(50).default(20),
  })
  .refine(
    (data) => {
      return new Date(data.check_out) > new Date(data.check_in);
    },
    {
      message: 'Check-out date must be strictly after check-in date',
      path: ['check_out'],
    }
  );

export const hotelRoomCreateSchema = z.object({
  room_type_id: z.string().min(1, 'Room type ID is required'),
  room_number: z.string().trim().min(1, 'Room number is required').max(20),
  floor_number: z.number().int().min(0, 'Floor must be 0 or higher').default(1),
  wing: z.string().trim().max(40).optional().nullable(),
  is_vip_room: z.boolean().default(false),
  dynamic_pricing_enabled: z.boolean().default(true),
  base_nightly_rate_bdt: z.union([z.number().positive(), z.string().min(1)]),
  amenities_override: z.array(z.string()).default([]),
  ai_tags: z.array(z.string()).default([]),
  notes: z.string().max(500).optional().nullable(),
});

export const hotelRoomTypeCreateSchema = z.object({
  hotel_id: z.string().uuid('Valid Hotel UUID required'),
  name: z.string().trim().min(2, 'Room type name required'),
  description: z.string().max(1000).optional().nullable(),
  category: z.enum(['standard', 'deluxe', 'executive_suite', 'presidential_suite', 'family_room', 'villa']).default('standard'),
  max_occupancy: z.number().int().min(1).default(2),
  max_adults: z.number().int().min(1).default(2),
  max_children: z.number().int().min(0).default(1),
  bed_configuration: z.string().min(1, 'Bed configuration required (e.g. 1 King or 2 Twin)'),
  room_size_sqm: z.number().positive().optional().nullable(),
  base_price_bdt: z.number().positive('Base price must be greater than 0'),
  amenities: z.array(z.string()).default([]),
  images: z.array(z.string().url()).default([]),
});

export type HotelSearchInput = z.infer<typeof hotelSearchSchema>;
export type HotelRoomCreateInput = z.infer<typeof hotelRoomCreateSchema>;
export type HotelRoomTypeCreateInput = z.infer<typeof hotelRoomTypeCreateSchema>;
