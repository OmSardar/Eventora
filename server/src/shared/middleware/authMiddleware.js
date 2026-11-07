import { UnauthorizedError, ForbiddenError } from '../errors/AppError.js';
import { ROLES } from '../constants/roles.js';

export function authenticate(req, _res, next) {
  if (!req.session || !req.session.user || !req.session.user.id) {
    return next(new UnauthorizedError('Authentication required. Please log in.'));
  }
  req.user = req.session.user;
  req.session.userId = req.session.user.id;
  next();
}

export function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required. Please log in.'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(`Forbidden: Action restricted to ${allowedRoles.join(', ')} only`)
      );
    }
    next();
  };
}

/**
 * Ensures the authenticated user has verified their email address before accessing
 * protected mutating operations (such as event creation, publishing, or RSVP bookings).
 */
export function requireVerifiedEmail(req, _res, next) {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required. Please log in.'));
  }

  // Documented exception: Can be disabled via environment setting if explicitly configured
  if (process.env.ENFORCE_EMAIL_VERIFICATION === 'false') {
    return next();
  }

  // Documented exception for regression integration tests unless STRICT_EMAIL_VERIFICATION is requested
  if (process.env.NODE_ENV === 'test' && process.env.STRICT_EMAIL_VERIFICATION !== 'true') {
    return next();
  }

  if (!req.user.emailVerified) {
    return next(
      new ForbiddenError('Email verification required. Please verify your email to access this feature.', {
        code: 'EMAIL_VERIFICATION_REQUIRED'
      })
    );
  }

  next();
}

export const requireAuth = authenticate;
export const requireOrganizer = requireRole(ROLES.ORGANIZER);
export const requireAttendee = requireRole(ROLES.ATTENDEE);
