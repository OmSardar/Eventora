import mongoose from 'mongoose';
import { logger } from '../logging/logger.js';

let cachedSupportsTransactions = null;

/**
 * Checks if the current MongoDB connection supports multi-document transactions.
 * True for replica sets (e.g. MongoDB Atlas) and mongos; false for standalone local MongoDB.
 */
export async function checkTransactionSupport() {
  if (cachedSupportsTransactions !== null) {
    return cachedSupportsTransactions;
  }

  try {
    if (!mongoose.connection.db) {
      return false;
    }
    const admin = mongoose.connection.db.admin();
    const status = await admin.command({ replSetGetStatus: 1 }).catch(() => null);
    cachedSupportsTransactions = Boolean(status);
    return cachedSupportsTransactions;
  } catch (err) {
    logger.debug({ err }, 'MongoDB transactions not supported on current topology');
    cachedSupportsTransactions = false;
    return false;
  }
}

/**
 * Executes a function within a MongoDB session/transaction if supported.
 * Falls back to direct execution if running on a standalone database (e.g. local test environments).
 *
 * @template T
 * @param {function(mongoose.ClientSession|null): Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTransaction(fn) {
  const supported = await checkTransactionSupport();

  if (!supported) {
    return fn(null);
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    throw error;
  } finally {
    await session.endSession();
  }
}

