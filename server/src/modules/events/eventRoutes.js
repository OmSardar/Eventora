import { Router } from 'express';
import * as eventController from './eventController.js';
import { authenticate, requireRole } from '../../shared/middleware/authMiddleware.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { createEventSchema, updateEventSchema } from '../../shared/validation/eventValidation.js';
import { ROLES } from '../../shared/constants/roles.js';
import { csrfProtection } from '../../shared/middleware/securityMiddleware.js';

const router = Router();

// Public routes
router.get('/', eventController.getEvents);

// Organizer specific route to fetch their created events (placed before :eventId to avoid route param collision)
router.get(
  '/organizer/my-events',
  authenticate,
  requireRole(ROLES.ORGANIZER),
  eventController.getMyEvents
);

router.get('/:eventId', eventController.getEventById);

// Organizer protected routes
router.post(
  '/',
  authenticate,
  requireRole(ROLES.ORGANIZER),
  csrfProtection,
  validateBody(createEventSchema),
  eventController.createEvent
);

router.patch(
  '/:eventId',
  authenticate,
  requireRole(ROLES.ORGANIZER),
  csrfProtection,
  validateBody(updateEventSchema),
  eventController.updateEvent
);

router.post(
  '/:eventId/cancel',
  authenticate,
  requireRole(ROLES.ORGANIZER),
  csrfProtection,
  eventController.cancelEvent
);

router.get(
  '/:eventId/attendees',
  authenticate,
  requireRole(ROLES.ORGANIZER),
  eventController.getEventAttendees
);

export default router;
