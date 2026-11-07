import crypto from 'crypto';
import { ForbiddenError } from '../errors/AppError.js';
import { logger } from '../../infrastructure/logging/logger.js';

// Normalizes an origin string (trims, removes trailing slash, lowercases)
export function normalizeOrigin(origin) {
  if (!origin || typeof origin !== 'string') return '';
  return origin.trim().replace(/\/+$/, '').toLowerCase();
}

// Get list of allowed origins dynamically from environment
export function getAllowedOrigins() {
  const origins = new Set();

  // 1. Collect from ALLOWED_ORIGINS env var (comma-separated)
  const envOrigins = process.env.ALLOWED_ORIGINS;
  if (envOrigins) {
    envOrigins
      .split(',')
      .map(normalizeOrigin)
      .filter(Boolean)
      .forEach((o) => origins.add(o));
  }

  // 2. Collect from known app/client base URL variables
  const urlVars = [
    process.env.APP_BASE_URL,
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL
  ];

  for (const url of urlVars) {
    if (url) {
      try {
        const parsed = new URL(url).origin;
        origins.add(normalizeOrigin(parsed));
      } catch {
        const norm = normalizeOrigin(url);
        if (norm) origins.add(norm);
      }
    }
  }

  // 3. In non-production or test environments, add local loopback origins
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000');
    origins.add('http://127.0.0.1:3000');
    origins.add('http://localhost:5000');
    origins.add('http://127.0.0.1:5000');
    origins.add('http://localhost:5173');
  }

  return Array.from(origins);
}

// Checks whether an incoming origin is permitted
export function isOriginAllowed(origin) {
  if (!origin) return false;

  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;

  const allowedList = getAllowedOrigins();

  // Wildcard catch-all if explicitly configured
  if (allowedList.includes('*')) {
    return true;
  }

  // Exact normalized match
  if (allowedList.includes(normalized)) {
    return true;
  }

  // Check wildcard patterns in allowed list (e.g., https://*.vercel.app, *.onrender.com)
  for (const pattern of allowedList) {
    if (pattern.includes('*')) {
      const regexStr = '^' + pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[a-zA-Z0-9._-]+') + '$';
      const regex = new RegExp(regexStr, 'i');
      if (regex.test(normalized)) {
        return true;
      }
    }
  }

  // Automatically permit all Vercel deployments (production domain & preview branches)
  const isVercel = /^https:\/\/[a-z0-9._-]+\.vercel\.app$/i.test(normalized);
  if (isVercel) {
    return true;
  }

  // Automatically permit Render deployments
  const isRender = /^https:\/\/[a-z0-9._-]+\.onrender\.com$/i.test(normalized);
  if (isRender) {
    return true;
  }

  return false;
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

  // Exempt server-to-server webhook endpoints (authenticated via cryptographic HMAC signature)
  if (req.originalUrl?.startsWith('/api/v1/webhooks/razorpay') || req.path?.startsWith('/api/v1/webhooks/razorpay')) {
    return next();
  }

  // Skip origin check in isolated unit tests if configured
  if (process.env.SKIP_SECURITY_CHECKS === 'true') {
    return next();
  }

  const origin = req.headers['origin'];
  const referer = req.headers['referer'];

  if (origin) {
    if (!isOriginAllowed(origin)) {
      logger.warn({ origin }, 'Rejected request due to disallowed Origin header');
      return next(new ForbiddenError('Invalid Origin header'));
    }
    return next();
  }

  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (!isOriginAllowed(refererOrigin)) {
        logger.warn({ refererOrigin }, 'Rejected request due to disallowed Referer header');
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

  // Exempt server-to-server webhook endpoints (authenticated via HMAC signature)
  if (req.originalUrl?.startsWith('/api/v1/webhooks/razorpay') || req.path?.startsWith('/api/v1/webhooks/razorpay')) {
    return next();
  }

  const reqPath = (req.originalUrl || req.path || '').split('?')[0];
  const isPublicAuth =
    reqPath.endsWith('/auth/register') ||
    reqPath.endsWith('/auth/verify-email') ||
    reqPath.endsWith('/auth/resend-verification') ||
    reqPath.endsWith('/auth/login');

  const clientToken = req.headers['x-csrf-token'] || req.headers['csrf-token'];
  const sessionToken = req.session ? req.session.csrfToken : null;

  // On public auth onboarding endpoints, allow cross-origin Incognito & first-time requests
  // provided the Origin/Referer has already passed originCheckMiddleware
  if (isPublicAuth) {
    if (clientToken && /^[a-f0-9]{64}$/i.test(clientToken)) {
      if (req.session) {
        req.session.csrfToken = clientToken;
      }
      return next();
    }
    const origin = req.headers['origin'] || (req.headers['referer'] ? new URL(req.headers['referer']).origin : null);
    if (!origin || isOriginAllowed(origin) || process.env.NODE_ENV !== 'production') {
      return next();
    }
  }

  // If session token is missing (e.g. cross-origin incognito environments or newly initialized session)
  if (!sessionToken) {
    if (clientToken && /^[a-f0-9]{64}$/i.test(clientToken)) {
      if (req.session) {
        req.session.csrfToken = clientToken;
      }
      return next();
    }
    return next(new ForbiddenError('Missing CSRF token'));
  }

  if (!clientToken) {
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

