import { Router } from 'express';
import * as registrationController from './registrationController.js';
import { authenticate, requireRole } from '../../shared/middleware/authMiddleware.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { cancellationRequestSchema } from '../../shared/validation/eventValidation.js';
import { ROLES } from '../../shared/constants/roles.js';
import { bookingRateLimiter, cancellationRateLimiter } from '../../shared/middleware/rateLimiter.js';
import { csrfProtection } from '../../shared/middleware/securityMiddleware.js';

const router = Router();

// Attendee endpoints
router.post(
  '/events/:eventId/registrations',
  authenticate,
  requireRole(ROLES.ATTENDEE),
  bookingRateLimiter,
  csrfProtection,
  registrationController.registerForEvent
);

router.get(
  '/registrations/me',
  authenticate,
  requireRole(ROLES.ATTENDEE),
  registrationController.getMyRegistrations
);

router.post(
  '/registrations/:registrationId/cancellation-request',
  authenticate,
  requireRole(ROLES.ATTENDEE),
  cancellationRateLimiter,
  csrfProtection,
  validateBody(cancellationRequestSchema),
  registrationController.requestCancellation
);

// Organizer cancellation review endpoints
router.get(
  '/organizer/cancellation-requests',
  authenticate,
  requireRole(ROLES.ORGANIZER),
  registrationController.getPendingCancellationRequests
);

router.post(
  '/cancellation-requests/:requestId/approve',
  authenticate,
  requireRole(ROLES.ORGANIZER),
  cancellationRateLimiter,
  csrfProtection,
  registrationController.approveCancellation
);

router.post(
  '/cancellation-requests/:requestId/reject',
  authenticate,
  requireRole(ROLES.ORGANIZER),
  cancellationRateLimiter,
  csrfProtection,
  registrationController.rejectCancellation
);

export default router;

