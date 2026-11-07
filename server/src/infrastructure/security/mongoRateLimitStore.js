import mongoose from 'mongoose';
import { logger } from '../logging/logger.js';

/**
 * Distributed MongoDB Rate Limit Store
 * Stores hit counts in a `rate_limits` collection with automatic MongoDB TTL expiry.
 */
export class MongoRateLimitStore {
  constructor(windowMs = 15 * 60 * 1000) {
    this.windowMs = windowMs;
  }

  getCollection() {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      return mongoose.connection.collection('rate_limits');
    }
    return null;
  }

  /**
   * Ensures the MongoDB TTL index exists on `expiresAt`
   */
  async ensureIndex() {
    const col = this.getCollection();
    if (!col) return;
    try {
      await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, background: true });
    } catch (err) {
      logger.warn({ err }, 'Failed to create rate_limits TTL index');
    }
  }

  /**
   * Increment the hit count for a given key within the time window.
   */
  async increment(key) {
    const col = this.getCollection();
    const now = new Date();
    const resetTime = new Date(now.getTime() + this.windowMs);

    if (!col) {
      // Graceful in-memory fallback if database is disconnecting
      return { totalHits: 1, resetTime };
    }

    try {
      // 1. Atomically increment an active window document
      const res = await col.findOneAndUpdate(
        { _id: key, expiresAt: { $gt: now } },
        { $inc: { count: 1 } },
        { returnDocument: 'after' }
      );

      if (res && res.count) {
        return {
          totalHits: res.count,
          resetTime: res.expiresAt
        };
      }

      // 2. If no active window exists, initialize or replace expired document
      try {
        await col.updateOne(
          { _id: key },
          {
            $set: {
              count: 1,
              expiresAt: resetTime,
              createdAt: now
            }
          },
          { upsert: true }
        );

        return {
          totalHits: 1,
          resetTime
        };
      } catch (upsertErr) {
        // Handle instantaneous concurrent upsert collision
        const retryDoc = await col.findOneAndUpdate(
          { _id: key },
          { $inc: { count: 1 } },
          { returnDocument: 'after' }
        );

        return {
          totalHits: retryDoc ? retryDoc.count : 2,
          resetTime: retryDoc?.expiresAt || resetTime
        };
      }
    } catch {
      // Fail open gracefully in case of transient DB error
      return { totalHits: 1, resetTime };
    }
  }

  /**
   * Decrement the hit count for a given key.
   */
  async decrement(key) {
    const col = this.getCollection();
    if (!col) return;
    try {
      await col.updateOne({ _id: key, count: { $gt: 0 } }, { $inc: { count: -1 } });
    } catch {
      // ignore
    }
  }

  /**
   * Reset hit count for a given key.
   */
  async resetKey(key) {
    const col = this.getCollection();
    if (!col) return;
    try {
      await col.deleteOne({ _id: key });
    } catch {
      // ignore
    }
  }
}
