import rateLimit from 'express-rate-limit';
import { MongoRateLimitStore } from '../../infrastructure/security/mongoRateLimitStore.js';
import { TooManyRequestsError } from '../errors/AppError.js';

export function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 100,
  message = 'Too many requests, please try again later.',
  prefix = 'rl:'
}) {
  const store = new MongoRateLimitStore(windowMs);

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    keyGenerator: (req) => {
      const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      return `${prefix}${ip}`;
    },
    handler: (_req, _res, next) => {
      next(new TooManyRequestsError(message));
    },
    skip: () => process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMIT !== 'true'
  });
}

// Global API rate limiter: 300 requests per 15 minutes
export const globalRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'API rate limit exceeded. Please try again in a few minutes.',
  prefix: 'api:'
});

// Sensitive Auth limiter: 15 requests per 15 minutes (protects register & login)
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many authentication attempts. Please wait 15 minutes before trying again.',
  prefix: 'auth:'
});

// Event booking limiter: 30 registrations per minute per user/IP
export const bookingRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many booking requests. Please wait a moment.',
  prefix: 'booking:'
});
