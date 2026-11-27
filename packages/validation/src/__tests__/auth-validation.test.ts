import { describe, it, expect } from 'vitest';
import {
  checkEmailSchema,
  loginSchema,
  registerSchema,
  resetPasswordRequestSchema,
  resetPasswordConfirmSchema,
  bdPhoneRegex,
} from '../auth';

describe('Auth Validation Schemas', () => {
  describe('bdPhoneRegex', () => {
    it('validates authentic Bangladeshi mobile phone formats', () => {
      expect(bdPhoneRegex.test('01712345678')).toBe(true);
      expect(bdPhoneRegex.test('01899887766')).toBe(true);
      expect(bdPhoneRegex.test('+8801912345678')).toBe(true);
      expect(bdPhoneRegex.test('+8801312345678')).toBe(true);
    });

    it('rejects invalid phone numbers', () => {
      expect(bdPhoneRegex.test('01212345678')).toBe(false); // Invalid operator prefix (012)
      expect(bdPhoneRegex.test('1712345678')).toBe(false); // Missing leading 0
      expect(bdPhoneRegex.test('0171234567')).toBe(false); // Too short
      expect(bdPhoneRegex.test('017123456789')).toBe(false); // Too long
      expect(bdPhoneRegex.test('abcdefghijk')).toBe(false);
    });
  });

  describe('checkEmailSchema', () => {
    it('accepts valid email', () => {
      const result = checkEmailSchema.safeParse({ email: 'traveler@shopnojatra.com' });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const result = checkEmailSchema.safeParse({ email: 'not-an-email' });
      expect(result.success).toBe(false);
    });
  });

  describe('loginSchema', () => {
    it('accepts valid login credentials', () => {
      const result = loginSchema.safeParse({
        email: 'agency.owner@shopnojatra.com',
        password: 'SecurePassword123!',
      });
      expect(result.success).toBe(true);
    });

    it('rejects passwords shorter than 6 characters', () => {
      const result = loginSchema.safeParse({
        email: 'user@shopnojatra.com',
        password: '123',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('registerSchema', () => {
    it('accepts compliant registration payload', () => {
      const result = registerSchema.safeParse({
        fullName: 'Tanvir Hossain',
        email: 'tanvir@gmail.com',
        phone: '01712345678',
        password: 'Password123',
        confirmPassword: 'Password123',
        role: 'customer',
      });
      expect(result.success).toBe(true);
    });

    it('rejects password without uppercase letter', () => {
      const result = registerSchema.safeParse({
        fullName: 'Tanvir Hossain',
        email: 'tanvir@gmail.com',
        phone: '01712345678',
        password: 'password123',
        confirmPassword: 'password123',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.some((e) => e.message.includes('uppercase'))).toBe(true);
      }
    });

    it('rejects mismatched password and confirmPassword', () => {
      const result = registerSchema.safeParse({
        fullName: 'Tanvir Hossain',
        email: 'tanvir@gmail.com',
        phone: '01712345678',
        password: 'Password123',
        confirmPassword: 'DifferentPassword123',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.some((e) => e.message.includes('do not match'))).toBe(true);
      }
    });
  });

  describe('resetPasswordConfirmSchema', () => {
    it('validates password reset confirmation', () => {
      const valid = resetPasswordConfirmSchema.safeParse({
        token: 'token-abc-123',
        password: 'NewStrongPassword1',
        confirmPassword: 'NewStrongPassword1',
      });
      expect(valid.success).toBe(true);

      const invalid = resetPasswordConfirmSchema.safeParse({
        token: 'token-abc-123',
        password: 'NewStrongPassword1',
        confirmPassword: 'MismatchedPassword',
      });
      expect(invalid.success).toBe(false);
    });
  });
});
