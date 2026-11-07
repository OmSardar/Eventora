import { IDLE_TIMEOUT_MS, ABSOLUTE_TIMEOUT_MS } from '../../infrastructure/session/sessionConfig.js';
import { UnauthorizedError } from '../errors/AppError.js';

export function sessionExpiryMiddleware(req, res, next) {
  if (!req.session || !req.session.user) {
    return next();
  }

  const now = Date.now();
  const createdAt = req.session.createdAt || now;
  const lastActivityAt = req.session.lastActivityAt || now;

  // Check absolute timeout
  if (now - createdAt > ABSOLUTE_TIMEOUT_MS) {
    req.session.destroy(() => {
      res.clearCookie('eventora.sid');
      next(new UnauthorizedError('Session has expired (maximum session duration exceeded). Please log in again.'));
    });
    return;
  }

  // Check idle timeout
  if (now - lastActivityAt > IDLE_TIMEOUT_MS) {
    req.session.destroy(() => {
      res.clearCookie('eventora.sid');
      next(new UnauthorizedError('Session has expired due to inactivity. Please log in again.'));
    });
    return;
  }

  // Update last activity
  req.session.lastActivityAt = now;
  next();
}
