import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/connection.js';
import { createRateLimiter } from '../../src/shared/middleware/rateLimiter.js';
import { errorHandler } from '../../src/shared/middleware/errorHandler.js';
import mongoose from 'mongoose';

describe('Distributed MongoDB Rate Limiting (Security & Resilience)', () => {
  let app;
  let client1;
  let client2;

  before(async () => {
    // Explicitly enable rate limiting for this test suite
    process.env.ENABLE_RATE_LIMIT = 'true';
    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora');

    // Clean rate_limits test documents
    if (mongoose.connection?.collection('rate_limits')) {
      await mongoose.connection.collection('rate_limits').deleteMany({ _id: { $regex: '^test_rl:' } });
    }

    // Build dedicated test app with small threshold (3 requests per window) to test boundary conditions
    app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    app.use(
      session({
        secret: 'test-rate-limit-secret-key-32-chars-long!',
        resave: false,
        saveUninitialized: true
      })
    );

    const testLimiter = createRateLimiter({
      windowMs: 60 * 1000,
      max: 3,
      message: 'Threshold exceeded. Please try again later.',
      prefix: 'test_rl:'
    });

    app.get('/api/test-action', testLimiter, (req, res) => {
      res.status(200).json({ success: true, message: 'Action allowed' });
    });

    app.use(errorHandler);

    client1 = request(app);
    client2 = request(app);
  });

  after(async () => {
    if (mongoose.connection?.collection('rate_limits')) {
      await mongoose.connection.collection('rate_limits').deleteMany({ _id: { $regex: '^test_rl:' } });
    }
    delete process.env.ENABLE_RATE_LIMIT;
    await disconnectDatabase();
  });

  test('Requests below the configured threshold succeed', async () => {
    // First 3 requests from Client 1 should succeed with 200
    for (let i = 1; i <= 3; i++) {
      const res = await client1
        .get('/api/test-action')
        .set('X-Forwarded-For', '198.51.100.1');

      assert.equal(res.status, 200, `Request ${i} must succeed`);
      assert.equal(res.body.success, true);
    }
  });

  test('Requests exceeding threshold return HTTP 429 with meaningful Retry-After header', async () => {
    // 4th request from same IP (198.51.100.1) must be rejected with 429
    const res = await client1
      .get('/api/test-action')
      .set('X-Forwarded-For', '198.51.100.1');

    assert.equal(res.status, 429, 'Excess request must return HTTP 429');
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /Threshold exceeded/);

    // Verify Retry-After header exists and is a positive number
    const retryAfter = res.headers['retry-after'];
    assert.ok(retryAfter, 'Must return Retry-After header');
    assert.ok(parseInt(retryAfter, 10) > 0, 'Retry-After must be positive seconds');
  });

  test('Different IPs/users receive appropriately isolated limits', async () => {
    // Client 2 with a different IP (198.51.100.2) should still be below threshold and succeed
    const res = await client2
      .get('/api/test-action')
      .set('X-Forwarded-For', '198.51.100.2');

    assert.equal(res.status, 200, 'Different IP must have its own isolated rate-limit bucket');
    assert.equal(res.body.success, true);
  });

  test('The shared store persists hit counts in MongoDB across instances', async () => {
    // Check directly in the MongoDB `rate_limits` collection
    const rateLimitDoc = await mongoose.connection
      .collection('rate_limits')
      .findOne({ _id: 'test_rl:ip:198.51.100.1' });

    assert.ok(rateLimitDoc, 'Rate limit document must exist in MongoDB');
    assert.ok(rateLimitDoc.count >= 4, 'Hit count must be recorded in database');
    assert.ok(rateLimitDoc.expiresAt instanceof Date, 'TTL expiry date must be set');
  });

  test('Sensitive endpoints cannot bypass the rate limiter via rapid replay', async () => {
    // Attempt 3 rapid calls from blocked IP (198.51.100.1)
    const responses = await Promise.all([
      client1.get('/api/test-action').set('X-Forwarded-For', '198.51.100.1'),
      client1.get('/api/test-action').set('X-Forwarded-For', '198.51.100.1'),
      client1.get('/api/test-action').set('X-Forwarded-For', '198.51.100.1')
    ]);

    for (const res of responses) {
      assert.equal(res.status, 429, 'Replayed requests must strictly return HTTP 429');
    }
  });
});
