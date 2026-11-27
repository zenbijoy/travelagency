import { z } from 'zod';
import { bdPhoneRegex } from './auth';

export const agencyDocumentSchema = z.object({
  doc_type: z.enum(['trade_license', 'tin_certificate', 'nid', 'bank_statement', 'utility_bill']),
  r2_key: z.string().min(1, 'R2 storage key is required'),
  file_name: z.string().min(1, 'File name is required'),
  mime: z.string().default('application/pdf'),
  size_bytes: z.number().int().positive(),
  sha256: z.string().min(16),
  expires_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export const agencyBankAccountSchema = z.object({
  bank_name: z.string().trim().min(2, 'Bank name is required'),
  branch_name: z.string().trim().min(2, 'Branch name is required'),
  account_name: z.string().trim().min(2, 'Account holder name is required'),
  account_number: z.string().trim().min(6, 'Account number must be at least 6 characters'),
  routing_number: z.string().trim().regex(/^\d{9}$/, 'Routing number must be exactly 9 digits').optional().nullable(),
});

export const agencyOnboardingSchema = z.object({
  agency_name: z.string().trim().min(3, 'Agency name must be at least 3 characters'),
  business_type: z.enum(['proprietorship', 'partnership', 'limited_company']).default('proprietorship'),
  trade_license_number: z.string().trim().min(3, 'Valid Trade License number is required'),
  tin_number: z.string().trim().min(5, 'Valid TIN is required'),
  contact_person: z.string().trim().min(2, 'Contact person name is required'),
  contact_email: z.string().trim().email('Valid business email is required'),
  contact_phone: z.string().trim().regex(bdPhoneRegex, 'Valid Bangladesh phone number required'),
  division: z.enum([
    'Dhaka',
    'Chittagong',
    'Sylhet',
    'Rajshahi',
    'Khulna',
    'Barisal',
    'Rangpur',
    'Mymensingh',
  ]),
  district: z.string().trim().min(2, 'District is required'),
  address: z.string().trim().min(5, 'Full street address is required'),
  bank_account: agencyBankAccountSchema,
  documents: z.array(agencyDocumentSchema).min(1, 'At least one verification document is required'),
  terms_accepted: z.literal(true, {
    message: 'You must accept the Agency Partner terms and conditions',
  }),
});

export type AgencyDocumentInput = z.infer<typeof agencyDocumentSchema>;
export type AgencyBankAccountInput = z.infer<typeof agencyBankAccountSchema>;
export type AgencyOnboardingInput = z.infer<typeof agencyOnboardingSchema>;
