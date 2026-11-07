import rateLimit from 'express-rate-limit';
import { MongoRateLimitStore } from '../../infrastructure/security/mongoRateLimitStore.js';
import { TooManyRequestsError } from '../errors/AppError.js';
import { logger } from '../../infrastructure/logging/logger.js';

/**
 * Factory for creating distributed MongoDB-backed rate limiters.
 */
export function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 100,
  message = 'Too many requests, please try again later.',
  prefix = 'rl:',
  keyType = 'auto' // 'auto', 'ip', 'user'
}) {
  const store = new MongoRateLimitStore(windowMs);

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    keyGenerator: (req) => {
      // Authoritative IP from Express request context
      const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
      const userId = req.session?.user?.id || req.session?.user?._id;

      if (keyType === 'user' && userId) {
        return `${prefix}u:${userId}`;
      }

      if (keyType === 'auto' && userId) {
        // Compound user account + IP isolation for authenticated requests
        return `${prefix}u:${userId}:${ip}`;
      }

      return `${prefix}ip:${ip}`;
    },
    handler: (req, res, next, options) => {
      const retryAfterSec = Math.ceil(options.windowMs / 1000);
      res.setHeader('Retry-After', retryAfterSec);

      logger.warn(
        {
          ip: req.ip,
          userId: req.session?.user?.id,
          path: req.originalUrl,
          method: req.method,
          prefix,
          retryAfterSec
        },
        'Rate limit exceeded'
      );

      next(new TooManyRequestsError(message));
    },
    skip: () => process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMIT !== 'true'
  });
}

// 1. Global API rate limiter: 300 requests per 15 minutes per IP
export const globalRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'API rate limit exceeded. Please try again in a few minutes.',
  prefix: 'api:'
});

// 2. Sensitive Authentication limiter: 15 requests (prod) / 100 requests (dev/test) per 15 minutes per IP (login & register)
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 15 : 100,
  message: 'Too many authentication attempts. Please wait 15 minutes before trying again.',
  prefix: 'auth:'
});

// 3. MFA Challenge & Verification limiter: 25 requests per 15 minutes per IP
export const mfaRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 25 : 100,
  message: 'Too many two-factor authentication attempts. Please wait before trying again.',
  prefix: 'mfa:'
});

// 4. Verification Resend limiter: 5 requests per 15 minutes per IP
export const resendVerificationRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 5 : 50,
  message: 'Too many verification email requests. Please wait a few minutes.',
  prefix: 'resend_verify:'
});

// 5. Event Mutation limiter: 30 requests per 15 minutes per organizer account/IP (create, update, cancel)
export const eventMutationRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many event management operations. Please slow down.',
  prefix: 'event_mutate:'
});

// 6. Event RSVP / booking limiter: 30 registrations per minute per attendee/IP
export const bookingRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many booking requests. Please wait a moment before trying again.',
  prefix: 'booking:'
});

// 7. Cancellation Workflow limiter: 30 requests per 15 minutes per user/IP (request, approve, reject)
export const cancellationRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many cancellation requests processed. Please try again later.',
  prefix: 'cancellation:'
});

// 8. Cloudinary Upload limiter: 20 image uploads per 15 minutes per organizer account/IP
export const uploadBannerRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many image upload attempts. Please wait a few minutes.',
  prefix: 'upload_banner:'
});

export const uploadSignatureRateLimiter = uploadBannerRateLimiter;
