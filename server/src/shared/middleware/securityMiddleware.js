import crypto from 'crypto';
import { ForbiddenError } from '../errors/AppError.js';
import { logger } from '../../infrastructure/logging/logger.js';

// Get list of allowed origins from environment
export function getAllowedOrigins() {
  const envOrigins = process.env.ALLOWED_ORIGINS;
  if (envOrigins) {
    return envOrigins.split(',').map((o) => o.trim());
  }
  return [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5000'
  ];
}

// Generate or retrieve CSRF token for the session
export function getOrCreateCsrfToken(req) {
  if (!req.session) {
    throw new Error('Session is required to generate CSRF token');
  }
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

// Validate Origin / Referer headers for state-changing requests
export function originCheckMiddleware(req, _res, next) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Exempt external webhooks authenticated via HMAC signature
  if (req.originalUrl?.includes('/webhooks/')) {
    return next();
  }

  // Skip origin check in isolated unit tests if configured
  if (process.env.SKIP_SECURITY_CHECKS === 'true') {
    return next();
  }

  const origin = req.headers['origin'];
  const referer = req.headers['referer'];
  const allowedOrigins = getAllowedOrigins();

  if (origin) {
    if (!allowedOrigins.includes(origin)) {
      logger.warn({ origin, allowedOrigins }, 'Rejected request due to disallowed Origin header');
      return next(new ForbiddenError('Invalid Origin header'));
    }
    return next();
  }

  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (!allowedOrigins.includes(refererOrigin)) {
        logger.warn({ refererOrigin, allowedOrigins }, 'Rejected request due to disallowed Referer header');
        return next(new ForbiddenError('Invalid Referer header'));
      }
      return next();
    } catch {
      return next(new ForbiddenError('Malformed Referer header'));
    }
  }

  // In production or browser clients, state-changing requests must include Origin or Referer
  if (process.env.NODE_ENV === 'production') {
    return next(new ForbiddenError('Missing Origin or Referer header on state-changing request'));
  }

  next();
}

// CSRF synchronizer token verification middleware
export function csrfProtection(req, _res, next) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  if (process.env.SKIP_CSRF === 'true') {
    return next();
  }

  // Check header token
  const clientToken = req.headers['x-csrf-token'] || req.headers['csrf-token'];
  const sessionToken = req.session ? req.session.csrfToken : null;

  if (!sessionToken || !clientToken) {
    return next(new ForbiddenError('Missing CSRF token'));
  }

  // Timing-safe comparison to prevent timing attacks
  try {
    const bufClient = Buffer.from(clientToken, 'utf8');
    const bufSession = Buffer.from(sessionToken, 'utf8');

    if (bufClient.length !== bufSession.length || !crypto.timingSafeEqual(bufClient, bufSession)) {
      return next(new ForbiddenError('Invalid CSRF token'));
    }
  } catch {
    return next(new ForbiddenError('Invalid CSRF token'));
  }

  next();
}

