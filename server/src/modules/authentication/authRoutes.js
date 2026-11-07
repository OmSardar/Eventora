import { Router } from 'express';
import * as authController from './authController.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { registerSchema, loginSchema } from '../../shared/validation/authValidation.js';
import { authRateLimiter } from '../../shared/middleware/rateLimiter.js';
import { csrfProtection } from '../../shared/middleware/securityMiddleware.js';

const router = Router();

router.get('/csrf', authController.getCsrfToken);
router.get('/me', authController.getMe);

// Auth endpoints protected by rate limiting and CSRF protection
router.post(
  '/register',
  authRateLimiter,
  csrfProtection,
  validateBody(registerSchema),
  authController.register
);

router.post(
  '/login',
  authRateLimiter,
  csrfProtection,
  validateBody(loginSchema),
  authController.login
);

router.post('/logout', csrfProtection, authController.logout);

export default router;
