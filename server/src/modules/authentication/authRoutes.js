import { Router } from 'express';
import * as authController from './authController.js';
import { authenticate } from '../../shared/middleware/authMiddleware.js';
import { validateBody } from '../../shared/middleware/validate.js';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  verifyOtpSchema,
  verifyTotpSchema,
  verifyRecoverySchema,
  switchFactorSchema,
  reauthPasswordSchema,
  confirmEmailOtpSetupSchema,
  confirmTotpSetupSchema,
  disableMfaSchema
} from '../../shared/validation/authValidation.js';
import {
  authRateLimiter,
  mfaRateLimiter,
  resendVerificationRateLimiter
} from '../../shared/middleware/rateLimiter.js';
import { csrfProtection } from '../../shared/middleware/securityMiddleware.js';

const router = Router();

// CSRF & Session introspection
router.get('/csrf', authController.getCsrfToken);
router.get('/me', authController.getMe);

// Registration & Email Verification
router.post(
  '/register',
  authRateLimiter,
  csrfProtection,
  validateBody(registerSchema),
  authController.register
);

router.post(
  '/verify-email',
  csrfProtection,
  validateBody(verifyEmailSchema),
  authController.verifyEmail
);

router.post(
  '/resend-verification',
  resendVerificationRateLimiter,
  csrfProtection,
  validateBody(resendVerificationSchema),
  authController.resendVerificationEmail
);

// Standard Login & Logout
router.post(
  '/login',
  authRateLimiter,
  csrfProtection,
  validateBody(loginSchema),
  authController.login
);

router.post('/logout', csrfProtection, authController.logout);

// MFA Challenge Verification (Completes Authentication)
router.post(
  '/mfa/verify-otp',
  mfaRateLimiter,
  csrfProtection,
  validateBody(verifyOtpSchema),
  authController.verifyMfaOtp
);

router.post(
  '/mfa/verify-totp',
  mfaRateLimiter,
  csrfProtection,
  validateBody(verifyTotpSchema),
  authController.verifyMfaTotp
);

router.post(
  '/mfa/verify-recovery',
  mfaRateLimiter,
  csrfProtection,
  validateBody(verifyRecoverySchema),
  authController.verifyMfaRecovery
);

router.post(
  '/mfa/resend-otp',
  mfaRateLimiter,
  csrfProtection,
  authController.resendMfaOtp
);

router.post(
  '/mfa/switch-factor',
  mfaRateLimiter,
  csrfProtection,
  validateBody(switchFactorSchema),
  authController.switchMfaFactor
);

// Authenticated Account Security & MFA Management
router.get(
  '/security/status',
  authenticate,
  authController.getSecurityStatus
);

router.get(
  '/security/login-history',
  authenticate,
  authController.getLoginHistory
);

router.post(
  '/security/email-otp/initiate',
  authenticate,
  csrfProtection,
  validateBody(reauthPasswordSchema),
  authController.initiateEmailOtp
);

router.post(
  '/security/email-otp/confirm',
  authenticate,
  csrfProtection,
  validateBody(confirmEmailOtpSetupSchema),
  authController.confirmEmailOtp
);

router.post(
  '/security/totp/setup',
  authenticate,
  csrfProtection,
  validateBody(reauthPasswordSchema),
  authController.setupTotp
);

router.post(
  '/security/totp/confirm',
  authenticate,
  csrfProtection,
  validateBody(confirmTotpSetupSchema),
  authController.confirmTotp
);

router.post(
  '/security/mfa/disable',
  authenticate,
  csrfProtection,
  validateBody(disableMfaSchema),
  authController.disableMfa
);

router.post(
  '/security/recovery-codes/regenerate',
  authenticate,
  csrfProtection,
  validateBody(reauthPasswordSchema),
  authController.regenerateRecoveryCodes
);

export default router;
