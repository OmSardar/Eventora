import { Router } from 'express';
import * as seatingController from './seatingController.js';
import { authenticate, requireVerifiedEmail, requireOrganizer } from '../../shared/middleware/authMiddleware.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { csrfProtection } from '../../shared/middleware/securityMiddleware.js';
import { bookingRateLimiter } from '../../shared/middleware/rateLimiter.js';
import {
  createSeatHoldSchema,
  toggleSeatBlockSchema,
  generateLayoutSchema,
  confirmFreeSeatBookingSchema,
  verifyTicketSchema
} from './seatingValidation.js';

const router = Router({ mergeParams: true });

// 1. Public or authenticated seat retrieval for an event
router.get('/:eventId/seats', seatingController.getSeats);

// 2. Concurrency-safe seat hold creation (Attendee, verified email required, 10-minute hold)
router.post(
  '/:eventId/seat-holds',
  bookingRateLimiter,
  authenticate,
  requireVerifiedEmail,
  csrfProtection,
  validateBody(createSeatHoldSchema),
  seatingController.createHold
);

// 3. Voluntary release of seat hold
router.delete(
  '/seat-holds/:holdId',
  authenticate,
  csrfProtection,
  seatingController.releaseHold
);

// 4. Organizer seat layout generation
router.post(
  '/:eventId/seats/generate',
  authenticate,
  requireOrganizer,
  csrfProtection,
  validateBody(generateLayoutSchema),
  seatingController.generateSeats
);

// 5. Organizer block / unblock individual seat
router.patch(
  '/:eventId/seats/:seatId/block',
  authenticate,
  requireOrganizer,
  csrfProtection,
  validateBody(toggleSeatBlockSchema),
  seatingController.toggleBlock
);

// 6. Organizer seating inventory dashboard
router.get(
  '/:eventId/seating/dashboard',
  authenticate,
  requireOrganizer,
  seatingController.getSeatingDashboard
);

// 7. Attendee free assigned seat confirmation
router.post(
  '/:eventId/bookings/confirm-free',
  bookingRateLimiter,
  authenticate,
  requireVerifiedEmail,
  csrfProtection,
  validateBody(confirmFreeSeatBookingSchema),
  seatingController.confirmFreeBooking
);

// 8. Digital ticket pass retrieval
router.get(
  '/bookings/:bookingId/tickets',
  authenticate,
  seatingController.getDigitalTickets
);

// 9. Public QR ticket verification
router.get('/tickets/verify', seatingController.verifyTicket);

// 10. Organizer QR ticket admission redemption
router.post(
  '/tickets/validate',
  authenticate,
  requireOrganizer,
  csrfProtection,
  validateBody(verifyTicketSchema),
  seatingController.verifyTicket
);

export default router;
