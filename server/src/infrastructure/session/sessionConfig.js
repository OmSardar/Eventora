import session from 'express-session';
import MongoStore from 'connect-mongo';

const isProduction = process.env.NODE_ENV === 'production';
const sameSiteSetting = (process.env.COOKIE_SAME_SITE || (isProduction ? 'none' : 'lax')).toLowerCase();
const isSecure = isProduction || process.env.COOKIE_SECURE === 'true';

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const ABSOLUTE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Validates the session secret. Fails fast in production if missing, weak, or using development fallback.
 * In development and test environments, falls back to a development secret.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {string} Validated session secret
 */
export function validateSessionSecret(env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  const secret = env.SESSION_SECRET;

  if (isProd) {
    if (!secret || typeof secret !== 'string' || secret.trim().length < 32) {
      throw new Error(
        'FATAL CONFIGURATION ERROR: SESSION_SECRET is missing or less than 32 characters in production. Refusing to start server with insecure session secret.'
      );
    }
    if (secret.includes('eventora-super-secure-secret-key') || secret.includes('change-in-production')) {
      throw new Error(
        'FATAL CONFIGURATION ERROR: Default development SESSION_SECRET detected in production environment. A unique, cryptographically random secret is required.'
      );
    }
    return secret;
  }

  return secret || 'eventora-super-secure-secret-key-change-in-production-min-32-chars!';
}

export function createSessionMiddleware(mongoUrl = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora') {
  const sessionSecret = validateSessionSecret(process.env);
  const store = MongoStore.create({
    mongoUrl,
    collectionName: 'sessions',
    ttl: 24 * 60 * 60, // 1 day in seconds
    autoRemove: 'native',
    touchAfter: 10 * 60 // 10 minutes lazy update unless data changes
  });

  return session({
    name: 'eventora.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store,
    proxy: isProduction, // Trust reverse proxy TLS for secure cookies
    cookie: {
      httpOnly: true,
      secure: isSecure,
      sameSite: sameSiteSetting,
      maxAge: ABSOLUTE_TIMEOUT_MS,
      path: '/'
    }
  });
}
