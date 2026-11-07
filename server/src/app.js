import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import authRoutes from './modules/authentication/authRoutes.js';
import eventRoutes from './modules/events/eventRoutes.js';
import registrationRoutes from './modules/registrations/registrationRoutes.js';
import paymentRoutes from './modules/payments/paymentRoutes.js';
import notificationRoutes from './modules/notifications/notificationRoutes.js';
import { handleRazorpayWebhook } from './modules/payments/webhook/razorpayWebhookController.js';
import { createSessionMiddleware } from './infrastructure/session/sessionConfig.js';
import { sessionExpiryMiddleware } from './shared/middleware/sessionExpiryMiddleware.js';
import { originCheckMiddleware, getAllowedOrigins } from './shared/middleware/securityMiddleware.js';
import { globalRateLimiter } from './shared/middleware/rateLimiter.js';
import { requestCorrelation } from './shared/middleware/requestCorrelation.js';
import { errorHandler } from './shared/middleware/errorHandler.js';
import { NotFoundError } from './shared/errors/AppError.js';

dotenv.config();

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

// Trust proxy if deployed behind reverse proxy (Vercel/Render/Nginx)
app.set('trust proxy', 1);

// HTTP Security Headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://images.unsplash.com', 'https://*.unsplash.com'],
        connectSrc: ["'self'", ...getAllowedOrigins()],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);

// Strict CORS with exact origin matching and credentials support
const allowedOrigins = getAllowedOrigins();
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server) in development
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Do not reflect unallowed origin
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'csrf-token', 'X-Request-Id']
  })
);

// Limit JSON request body size and preserve raw buffer for webhook signature validation
app.use(
  express.json({
    limit: '50kb',
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    }
  })
);
app.use(express.urlencoded({ extended: true, limit: '50kb' }));
app.use(cookieParser());

// Request correlation and logging
app.use(requestCorrelation);

// Session management
app.use(createSessionMiddleware(process.env.MONGODB_URI));
app.use(sessionExpiryMiddleware);

// Origin validation for state-changing HTTP methods
app.use(originCheckMiddleware);

// Global API rate limiter
app.use('/api', globalRateLimiter);

// Health check endpoint
app.get(['/api/v1/health', '/health'], (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Webhook endpoint (authenticated via HMAC-SHA256 signature, exempt from CSRF & browser-origin requirements)
app.post('/api/v1/webhooks/razorpay', handleRazorpayWebhook);

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/events', eventRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1', registrationRoutes);

// Handle 404 for undefined routes
app.use('*', (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
});

// Centralized error handler
app.use(errorHandler);

export default app;
