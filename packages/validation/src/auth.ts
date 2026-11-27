import { z } from 'zod';

/**
 * Bangladesh phone number regex: +8801[3-9]XXXXXXXX or 01[3-9]XXXXXXXX
 */
export const bdPhoneRegex = /^(?:\+8801|01)[3-9]\d{8}$/;

export const checkEmailSchema = z.object({
  email: z.string().trim().email('Invalid email address format'),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  rememberMe: z.boolean().default(false).optional(),
});

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Full name must be at least 2 characters'),
    email: z.string().trim().email('Please enter a valid email address'),
    phone: z
      .string()
      .trim()
      .regex(bdPhoneRegex, 'Please enter a valid Bangladeshi phone number (e.g., 01712345678 or +8801712345678)'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must include at least one uppercase letter')
      .regex(/[0-9]/, 'Must include at least one number'),
    confirmPassword: z.string(),
    role: z.enum(['customer', 'agency_agent', 'hotel_staff']).default('customer'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const resetPasswordRequestSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
});

export const resetPasswordConfirmSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).optional(),
  phone: z.string().trim().regex(bdPhoneRegex).optional(),
  avatarUrl: z.string().url().optional().nullable(),
  bio: z.string().max(300).optional(),
});

export type CheckEmailInput = z.infer<typeof checkEmailSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ResetPasswordRequestInput = z.infer<typeof resetPasswordRequestSchema>;
export type ResetPasswordConfirmInput = z.infer<typeof resetPasswordConfirmSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
