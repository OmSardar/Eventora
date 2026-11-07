import { z } from 'zod';
import { ROLES } from '../constants/roles.js';

export const registerSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters'),
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Please provide a valid email address')
    .max(255, 'Email cannot exceed 255 characters'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password cannot exceed 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  role: z.enum([ROLES.ATTENDEE, ROLES.ORGANIZER], {
    errorMap: () => ({ message: `Role must be either ${ROLES.ATTENDEE} or ${ROLES.ORGANIZER}` })
  })
});

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Please provide a valid email address'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required')
});

export const verifyEmailSchema = z.object({
  token: z.string({ required_error: 'Verification token is required' }).trim().min(1, 'Verification token is required')
});

export const resendVerificationSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Please provide a valid email address')
});

export const verifyOtpSchema = z.object({
  challengeId: z.string({ required_error: 'Challenge ID is required' }).min(1),
  otp: z.string({ required_error: 'OTP is required' }).trim().regex(/^\d{6}$/, 'OTP must be exactly 6 digits')
});

export const verifyTotpSchema = z.object({
  challengeId: z.string({ required_error: 'Challenge ID is required' }).min(1),
  code: z.string({ required_error: 'Authenticator code is required' }).trim().regex(/^\d{6}$/, 'Code must be exactly 6 digits')
});

export const verifyRecoverySchema = z.object({
  challengeId: z.string({ required_error: 'Challenge ID is required' }).min(1),
  recoveryCode: z.string({ required_error: 'Recovery code is required' }).trim().min(5, 'Invalid recovery code format')
});

export const switchFactorSchema = z.object({
  challengeId: z.string({ required_error: 'Challenge ID is required' }).min(1),
  factor: z.enum(['EMAIL_OTP', 'TOTP', 'RECOVERY_CODE'], {
    errorMap: () => ({ message: 'Invalid authentication factor' })
  })
});

export const reauthPasswordSchema = z.object({
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required')
});

export const confirmEmailOtpSetupSchema = z.object({
  otp: z.string({ required_error: 'OTP is required' }).trim().regex(/^\d{6}$/, 'OTP must be exactly 6 digits')
});

export const confirmTotpSetupSchema = z.object({
  code: z.string({ required_error: 'Authenticator code is required' }).trim().regex(/^\d{6}$/, 'Code must be exactly 6 digits')
});

export const disableMfaSchema = z.object({
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
  factor: z.enum(['EMAIL_OTP', 'TOTP'], {
    errorMap: () => ({ message: 'Factor must be EMAIL_OTP or TOTP' })
  })
});
