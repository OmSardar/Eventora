import { reconcilePendingRefunds } from './paymentService.js';
import { logger } from '../../infrastructure/logging/logger.js';

let workerIntervalId = null;

/**
 * Runs a single reconciliation sweep safely without throwing.
 */
export async function runRefundReconciliationSweep() {
  try {
    return await reconcilePendingRefunds();
  } catch (err) {
    logger.error({ err: err?.message }, 'Unhandled error in refund reconciliation sweep');
    return { status: 'error', error: err?.message };
  }
}

/**
 * Starts the background refund reconciliation worker on a configurable interval.
 * @param {number} intervalMs - Poll interval in milliseconds (defaults to 60000ms / 1 min).
 */
export function startRefundReconciliationWorker(intervalMs = 60000) {
  if (workerIntervalId !== null) return;

  workerIntervalId = setInterval(() => {
    runRefundReconciliationSweep().catch((err) => {
      logger.error({ err: err?.message }, 'Unhandled error in scheduled refund reconciliation cycle');
    });
  }, intervalMs);

  // Prevent holding the Node event loop open during shutdown or tests
  if (workerIntervalId.unref) {
    workerIntervalId.unref();
  }

  logger.info({ intervalMs }, 'Refund reconciliation worker started');
}

/**
 * Stops the scheduled refund reconciliation worker cleanly.
 */
export function stopRefundReconciliationWorker() {
  if (workerIntervalId !== null) {
    clearInterval(workerIntervalId);
    workerIntervalId = null;
    logger.info('Refund reconciliation worker stopped');
  }
}

/**
 * Checks whether the worker timer is currently active.
 * @returns {boolean}
 */
export function isRefundReconciliationWorkerActive() {
  return workerIntervalId !== null;
}

