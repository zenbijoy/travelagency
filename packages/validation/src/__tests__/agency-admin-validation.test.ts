import { describe, it, expect } from 'vitest';
import {
  agencyOnboardingSchema,
  agencyBankAccountSchema,
} from '../agency';
import {
  refundRequestSchema,
  refundReviewSchema,
} from '../refund';

describe('Agency Onboarding & Admin Audit Validation Schemas', () => {
  describe('agencyBankAccountSchema', () => {
    it('validates Bangladeshi commercial bank account details', () => {
      const valid = agencyBankAccountSchema.safeParse({
        bank_name: 'Dutch-Bangla Bank PLC',
        branch_name: 'Gulshan Branch',
        account_name: 'Shopno Horizon Travels Ltd',
        account_number: '1161200045678',
        routing_number: '090261168',
      });
      expect(valid.success).toBe(true);
    });

    it('rejects invalid routing number (not 9 digits)', () => {
      const invalid = agencyBankAccountSchema.safeParse({
        bank_name: 'BRAC Bank',
        branch_name: 'Banani',
        account_name: 'Test Agency',
        account_number: '1501200000000',
        routing_number: '12345', // only 5 digits
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('agencyOnboardingSchema', () => {
    it('validates complete agency partner application', () => {
      const valid = agencyOnboardingSchema.safeParse({
        agency_name: 'Bengal Odyssey Travels',
        business_type: 'limited_company',
        trade_license_number: 'TRAD/DNCC/012938/2026',
        tin_number: '489201928312',
        contact_person: 'Shahed Ahmed',
        contact_email: 'shahed@bengalodyssey.com',
        contact_phone: '01711223344',
        division: 'Dhaka',
        district: 'Dhaka',
        address: 'House 42, Road 11, Banani, Dhaka-1213',
        bank_account: {
          bank_name: 'City Bank PLC',
          branch_name: 'Banani',
          account_name: 'Bengal Odyssey Travels Ltd',
          account_number: '3101928301001',
          routing_number: '225260814',
        },
        documents: [
          {
            doc_type: 'trade_license',
            r2_key: 'kyc/agencies/trade_license_2026.pdf',
            file_name: 'Trade_License_2026.pdf',
            mime: 'application/pdf',
            size_bytes: 450200,
            sha256: 'a1b2c3d4e5f678901234567890abcdef',
          },
        ],
        terms_accepted: true,
      });
      expect(valid.success).toBe(true);
    });

    it('rejects when terms are not accepted', () => {
      const invalid = agencyOnboardingSchema.safeParse({
        agency_name: 'Bengal Odyssey Travels',
        business_type: 'proprietorship',
        trade_license_number: 'TRAD/1234',
        tin_number: '1234567',
        contact_person: 'Shahed',
        contact_email: 'shahed@test.com',
        contact_phone: '01711223344',
        division: 'Dhaka',
        district: 'Dhaka',
        address: 'Dhaka City',
        bank_account: {
          bank_name: 'City Bank',
          branch_name: 'Banani',
          account_name: 'Test',
          account_number: '1234567',
        },
        documents: [
          {
            doc_type: 'nid',
            r2_key: 'kyc/nid.pdf',
            file_name: 'nid.pdf',
            mime: 'application/pdf',
            size_bytes: 1000,
            sha256: '1234567890123456',
          },
        ],
        terms_accepted: false,
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('refundRequestSchema & refundReviewSchema', () => {
    it('validates refund request submission', () => {
      const valid = refundRequestSchema.safeParse({
        booking_id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b22',
        reason: 'flight_cancelled_by_airline',
        reason_details: 'Flight BG-433 was cancelled due to inclement weather conditions in Chittagong.',
        requested_amount: 9000,
        refund_method: 'bkash',
        payout_account_number: '01712345678',
      });
      expect(valid.success).toBe(true);
    });

    it('rejects refund request with reason details less than 10 characters', () => {
      const invalid = refundRequestSchema.safeParse({
        booking_id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b22',
        reason: 'other',
        reason_details: 'Cancel', // too short (< 10)
        requested_amount: 1000,
      });
      expect(invalid.success).toBe(false);
    });

    it('validates admin refund review action', () => {
      const validApproval = refundReviewSchema.safeParse({
        refund_id: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380c33',
        action: 'approve',
        approved_amount: 9000,
        admin_note: 'Approved after verification of airline cancellation circular.',
      });
      expect(validApproval.success).toBe(true);
    });
  });
});
