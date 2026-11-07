import session from 'express-session';
import MongoStore from 'connect-mongo';

const isProduction = process.env.NODE_ENV === 'production';
const sameSiteSetting = (process.env.COOKIE_SAME_SITE || (isProduction ? 'none' : 'lax')).toLowerCase();
const isSecure = isProduction || process.env.COOKIE_SECURE === 'true';

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const ABSOLUTE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

export function createSessionMiddleware(mongoUrl = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora') {
  const store = MongoStore.create({
    mongoUrl,
    collectionName: 'sessions',
    ttl: 24 * 60 * 60, // 1 day in seconds
    autoRemove: 'native',
    touchAfter: 10 * 60 // 10 minutes lazy update unless data changes
  });

  return session({
    name: 'eventora.sid',
    secret: process.env.SESSION_SECRET || 'eventora-super-secure-secret-key-change-in-production-min-32-chars!',
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
