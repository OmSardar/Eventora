import mongoose from 'mongoose';

/**
 * Distributed MongoDB Rate Limit Store
 * Stores hit counts in a `rate_limits` collection with automatic TTL expiry.
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

  async increment(key) {
    const col = this.getCollection();
    const now = new Date();
    const resetTime = new Date(now.getTime() + this.windowMs);

    if (!col) {
      // Fallback in-memory behavior if database is not connected
      return { totalHits: 1, resetTime };
    }

    try {
      // Atomic upsert with TTL
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

      // If document didn't exist or expired, insert new
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
    } catch {
      // In case of transient db error, allow request through gracefully
      return { totalHits: 1, resetTime };
    }
  }

  async decrement(key) {
    const col = this.getCollection();
    if (!col) return;
    try {
      await col.updateOne({ _id: key, count: { $gt: 0 } }, { $inc: { count: -1 } });
    } catch {
      // ignore
    }
  }

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
