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

export const requireAuth = authenticate;
export const requireOrganizer = requireRole(ROLES.ORGANIZER);
export const requireAttendee = requireRole(ROLES.ATTENDEE);
