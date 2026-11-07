import { Router } from 'express';
import * as paymentController from './paymentController.js';
import { authenticate, requireRole } from '../../shared/middleware/authMiddleware.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { createOrderSchema, verifyPaymentSchema } from './paymentValidation.js';
import { ROLES } from '../../shared/constants/roles.js';
import { bookingRateLimiter } from '../../shared/middleware/rateLimiter.js';
import { csrfProtection } from '../../shared/middleware/securityMiddleware.js';

const router = Router();

// Attendee checkout endpoints
router.post(
  '/create-order',
  authenticate,
  requireRole(ROLES.ATTENDEE),
  bookingRateLimiter,
  csrfProtection,
  validateBody(createOrderSchema),
  paymentController.createOrder
);

router.post(
  '/verify',
  authenticate,
  requireRole(ROLES.ATTENDEE),
  bookingRateLimiter,
  csrfProtection,
  validateBody(verifyPaymentSchema),
  paymentController.verifyPayment
);

router.get(
  '/me',
  authenticate,
  requireRole(ROLES.ATTENDEE),
  paymentController.getMyPayments
);

export default router;

