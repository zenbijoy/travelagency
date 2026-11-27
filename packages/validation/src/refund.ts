import { z } from 'zod';

export const refundReasonEnum = z.enum([
  'customer_cancellation',
  'flight_cancelled_by_airline',
  'hotel_overbooked',
  'service_deficiency',
  'duplicate_charge',
  'force_majeure',
  'other',
]);

export const refundMethodEnum = z.enum([
  'original_payment_method',
  'bank_transfer',
  'agency_credit_wallet',
  'bkash',
  'nagad',
]);

export const refundRequestSchema = z.object({
  booking_id: z.string().uuid('Booking ID must be a valid UUID'),
  reason: refundReasonEnum,
  reason_details: z
    .string()
    .trim()
    .min(10, 'Please provide detailed reason for refund (minimum 10 characters)')
    .max(1000),
  requested_amount: z.number().positive('Refund amount must be greater than zero'),
  refund_method: refundMethodEnum.default('original_payment_method'),
  payout_account_number: z.string().trim().optional().nullable(),
  payout_account_holder: z.string().trim().optional().nullable(),
  supporting_documents: z
    .array(
      z.object({
        file_name: z.string(),
        r2_key: z.string(),
        mime: z.string(),
      })
    )
    .default([]),
});

export const refundReviewSchema = z.object({
  refund_id: z.string().uuid(),
  action: z.enum(['approve', 'reject', 'request_more_info']),
  approved_amount: z.number().positive().optional(),
  admin_note: z.string().trim().min(2, 'Note is required for audit trail'),
});

export type RefundReason = z.infer<typeof refundReasonEnum>;
export type RefundMethod = z.infer<typeof refundMethodEnum>;
export type RefundRequestInput = z.infer<typeof refundRequestSchema>;
export type RefundReviewInput = z.infer<typeof refundReviewSchema>;
