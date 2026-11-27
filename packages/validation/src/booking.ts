import { z } from 'zod';

export const bookingPassengerSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required'),
  last_name: z.string().trim().min(1, 'Last name is required'),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  passenger_type: z.enum(['adult', 'child', 'infant']).default('adult'),
  passport_number: z.string().trim().optional().nullable(),
  seat_preference: z.string().trim().optional().nullable(),
  seat_id: z.string().uuid().optional().nullable(),
});

export const bookingItemSchema = z.object({
  product_type: z.enum(['flight', 'hotel', 'tour', 'activity', 'transfer', 'package']),
  product_id: z.string().min(1, 'Product ID is required'),
  product_name: z.string().min(1, 'Product name is required'),
  description: z.string().optional().nullable(),
  quantity: z.number().int().min(1).default(1),
  unit_price: z.number().min(0, 'Unit price must be non-negative'),
  item_metadata: z.record(z.string(), z.any()).default({}),
});

export const bookingCreateSchema = z.object({
  product_type: z.enum(['flight', 'hotel', 'tour', 'activity', 'transfer', 'package']),
  destination_city: z.string().trim().min(1, 'Destination city is required'),
  origin_city: z.string().trim().optional().nullable(),
  destination_country: z.string().trim().default('Bangladesh').optional().nullable(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD').optional().nullable(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD').optional().nullable(),
  number_of_guests: z.number().int().min(1, 'Must have at least 1 guest').default(1),
  agency_id: z.string().uuid().optional().nullable(),
  items: z.array(bookingItemSchema).min(1, 'At least one booking item is required'),
  passengers: z.array(bookingPassengerSchema).default([]),
  special_requests: z.string().max(1000).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  idempotency_key: z.string().optional().nullable(),
});

export const bookingQuoteSchema = z.object({
  provider_id: z.string().min(1, 'Provider ID is required'),
  service_id: z.string().min(1, 'Service ID is required'),
  tour_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tour date must be YYYY-MM-DD'),
  duration_days: z.number().int().min(1).default(1),
  number_of_guests: z.number().int().min(1).default(1),
});

export const bookingStatusUpdateSchema = z.object({
  target_status: z.enum([
    'PENDING_PAYMENT',
    'CONFIRMED',
    'CANCELLED',
    'COMPLETED',
    'REFUNDED',
    'EXPIRED',
    'FAILED',
  ]),
  payment_transaction_id: z.string().optional().nullable(),
  cancellation_reason: z.string().optional().nullable(),
  admin_override: z.boolean().default(false),
});

export type BookingPassengerInput = z.infer<typeof bookingPassengerSchema>;
export type BookingItemInput = z.infer<typeof bookingItemSchema>;
export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;
export type BookingQuoteInput = z.infer<typeof bookingQuoteSchema>;
export type BookingStatusUpdateInput = z.infer<typeof bookingStatusUpdateSchema>;
