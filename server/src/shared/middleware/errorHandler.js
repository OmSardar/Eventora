import { AppError } from '../errors/AppError.js';
import { logger } from '../../infrastructure/logging/logger.js';

export function errorHandler(err, req, res, _next) {
  let error = err;

  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    error = new AppError(`Invalid resource identifier: ${err.value}`, 400);
  }

  // Handle Mongoose duplicate key error (e.g. unique email or compound registration)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    const message = field === 'normalizedEmail' || field === 'email'
      ? 'An account with this email address already exists.'
      : field === 'eventId'
      ? 'You have already registered for this event.'
      : `Duplicate value entered for ${field}.`;
    error = new AppError(message, 409);
  }

  // Handle Mongoose ValidationError
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message
    }));
    error = new AppError('Validation failed', 400, details);
  }

  // Handle third-party SDK error objects (e.g. Razorpay { statusCode, error: { description } })
  if (err && err.error && typeof err.error.description === 'string') {
    error = new AppError(err.error.description, err.statusCode || 400);
  }

  const statusCode = error.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // Log error with correlation details
  logger.error(
    {
      err: {
        message: error.message,
        statusCode,
        stack: isProduction ? undefined : error.stack,
        details: error.details
      },
      req: {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userId: req.session && req.session.user ? req.session.user.id : undefined
      }
    },
    `Request error: ${error.message}`
  );

  res.status(statusCode).json({
    success: false,
    error: {
      name: error.name || 'Error',
      message: error.message || 'An unexpected internal server error occurred',
      ...(error.details ? { details: error.details } : {}),
      ...(!isProduction && error.stack ? { stack: error.stack } : {})
    }
  });
}

