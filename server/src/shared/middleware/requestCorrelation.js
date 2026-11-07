import crypto from 'crypto';
import { logger } from '../../infrastructure/logging/logger.js';

export function requestCorrelation(req, res, next) {
  const correlationId = req.headers['x-correlation-id'] || req.headers['x-request-id'] || crypto.randomUUID();
  req.id = correlationId;
  res.setHeader('X-Request-Id', correlationId);

  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(
      {
        reqId: req.id,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: duration,
        userId: req.session && req.session.user ? req.session.user.id : undefined,
        ip: req.ip
      },
      `${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`
    );
  });

  next();
}
