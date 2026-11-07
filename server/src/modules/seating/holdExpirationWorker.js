import { SeatHold } from './SeatHold.js';
import { EventSeat } from './EventSeat.js';
import { SEAT_HOLD_STATUS, SEAT_STATUS } from '../../shared/constants/status.js';
import { logger } from '../../infrastructure/logging/logger.js';

let workerIntervalId = null;

/**
 * Sweeps the database for expired holds and releases only the seats
 * still bound to those specific holds.
 *
 * Fully idempotent: safe against concurrent runs and process restarts.
 */
export async function expireStaleHolds() {
  try {
    const now = new Date();
    // 1. Find all active holds that have passed their expiration timestamp
    const staleHolds = await SeatHold.find({
      status: SEAT_HOLD_STATUS.ACTIVE,
      expiresAt: { $lte: now }
    });

    if (!staleHolds.length) {
      return { expiredHoldsCount: 0, releasedSeatsCount: 0 };
    }

    let expiredHoldsCount = 0;
    let releasedSeatsCount = 0;

    for (const hold of staleHolds) {
      // 2. Atomically transition hold status from ACTIVE to EXPIRED
      const updatedHold = await SeatHold.findOneAndUpdate(
        {
          _id: hold._id,
          status: SEAT_HOLD_STATUS.ACTIVE
        },
        {
          $set: {
            status: SEAT_HOLD_STATUS.EXPIRED,
            releasedAt: now
          }
        },
        { new: true }
      );

      // If already transitioned by another worker/process, skip to maintain idempotency
      if (!updatedHold) {
        continue;
      }

      expiredHoldsCount++;

      // 3. Atomically release ONLY seats still owned by this hold that are currently HELD
      // (Never touch seats that have been confirmed as BOOKED or reassigned to a newer hold)
      const seatUpdateRes = await EventSeat.updateMany(
        {
          holdId: hold._id,
          status: SEAT_STATUS.HELD
        },
        {
          $set: {
            status: SEAT_STATUS.AVAILABLE,
            holdId: null,
            heldBy: null,
            heldUntil: null
          },
          $inc: { version: 1 }
        }
      );

      releasedSeatsCount += seatUpdateRes.modifiedCount || 0;

      logger.info(
        { holdId: hold._id, eventId: hold.eventId, releasedCount: seatUpdateRes.modifiedCount },
        'Expired stale seat hold and released reserved seats'
      );
    }

    return { expiredHoldsCount, releasedSeatsCount };
  } catch (err) {
    logger.error({ err: err?.message }, 'Error in expireStaleHolds worker');
    return { expiredHoldsCount: 0, releasedSeatsCount: 0, error: err?.message };
  }
}

/**
 * Starts the background hold expiration worker on a configurable interval.
 */
export function startHoldExpirationWorker(intervalMs = 30000) {
  if (workerIntervalId !== null) return;

  workerIntervalId = setInterval(() => {
    expireStaleHolds().catch((err) => {
      logger.error({ err }, 'Unhandled error in scheduled hold expiration cycle');
    });
  }, intervalMs);

  // Prevent holding the Node event loop open during shutdown or tests
  if (workerIntervalId.unref) {
    workerIntervalId.unref();
  }

  logger.info({ intervalMs }, 'Seat hold expiration worker started');
}

/**
 * Stops the scheduled hold expiration worker.
 */
export function stopHoldExpirationWorker() {
  if (workerIntervalId !== null) {
    clearInterval(workerIntervalId);
    workerIntervalId = null;
    logger.info('Seat hold expiration worker stopped');
  }
}
