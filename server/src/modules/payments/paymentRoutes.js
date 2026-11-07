import express from 'express';
import {
  createOrder,
  verifyPayment,
  getMyPayments,
  getReconciliation,
  triggerHoldReconciliation
} from './paymentController.js';
import {
  requireAuth,
  requireAttendee,
  requireOrganizer
} from '../../shared/middleware/authMiddleware.js';
import { csrfProtection } from '../../shared/middleware/securityMiddleware.js';
import { bookingRateLimiter } from '../../shared/middleware/rateLimiter.js';
import { validate } from '../../shared/middleware/validate.js';
import {
  createOrderSchema,
  verifyPaymentSchema
} from './paymentValidation.js';

const router = express.Router();

// Attendee checkout endpoints
router.post(
  '/create-order',
  requireAuth,
  requireAttendee,
  bookingRateLimiter,
  csrfProtection,
  validate(createOrderSchema),
  createOrder
);

router.post(
  '/verify',
  requireAuth,
  requireAttendee,
  bookingRateLimiter,
  csrfProtection,
  validate(verifyPaymentSchema),
  verifyPayment
);

router.get('/me', requireAuth, getMyPayments);

// Administrative reconciliation endpoints
router.get('/reconciliation', requireAuth, requireOrganizer, getReconciliation);
router.post('/reconcile-holds', requireAuth, requireOrganizer, csrfProtection, triggerHoldReconciliation);

export default router;
