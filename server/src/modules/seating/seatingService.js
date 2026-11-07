import mongoose from 'mongoose';
import { EventSeat } from './EventSeat.js';
import { SeatHold } from './SeatHold.js';
import { Event } from '../events/Event.js';
import { SEAT_STATUS, SEAT_HOLD_STATUS, EVENT_STATUS, SEATING_TYPE } from '../../shared/constants/status.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError
} from '../../shared/errors/AppError.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { expireStaleHolds } from './holdExpirationWorker.js';
import { getDefaultVenueLayout } from './venueLayoutDefaults.js';
import { logger } from '../../infrastructure/logging/logger.js';

/**
 * Generates physical seat inventory for an assigned-seating event.
 */
export async function generateEventSeats(eventId, customLayout = null) {
  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  // Guard: Never alter seating when active holds or confirmed bookings exist
  const existingActiveSeats = await EventSeat.countDocuments({
    eventId: event._id,
    status: { $in: [SEAT_STATUS.HELD, SEAT_STATUS.BOOKED] }
  });

  if (existingActiveSeats > 0) {
    throw new ConflictError('Cannot regenerate venue layout when active holds or confirmed bookings exist.');
  }

  // Clear existing unreserved seats for this event
  await EventSeat.deleteMany({ eventId: event._id });

  const layout = customLayout || event.venueLayout || getDefaultVenueLayout(event.ticketPrice || 500);
  const seatsToInsert = [];

  for (const section of layout.sections || []) {
    const sectionPrice = section.price || event.ticketPrice || 500;
    for (const row of section.rows || []) {
      for (let num = 1; num <= row.seatCount; num++) {
        const seatLabel = `${row.rowLabel}${num}`;
        seatsToInsert.push({
          eventId: event._id,
          sectionId: section.sectionId,
          sectionName: section.name,
          rowLabel: row.rowLabel,
          seatNumber: num,
          seatLabel,
          category: section.category,
          price: sectionPrice,
          currency: event.currency || 'INR',
          status: SEAT_STATUS.AVAILABLE
        });
      }
    }
  }

  if (seatsToInsert.length > 0) {
    await EventSeat.insertMany(seatsToInsert);
    event.seatLimit = seatsToInsert.length;
    event.seatingType = SEATING_TYPE.ASSIGNED_SEATING;
    event.venueLayout = layout;
    await event.save();
  }

  logger.info({ eventId, seatCount: seatsToInsert.length }, 'Generated venue seats for event');
  return { seatCount: seatsToInsert.length, layout };
}

/**
 * Retrieves all seats and real-time availability for an event.
 */
export async function getEventSeats(eventId) {
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    throw new BadRequestError('Invalid event ID format.');
  }

  // Eagerly expire stale holds to maintain authoritative availability
  await expireStaleHolds();

  const seats = await EventSeat.find({ eventId: new mongoose.Types.ObjectId(eventId) })
    .sort({ sectionId: 1, rowLabel: 1, seatNumber: 1 })
    .lean();

  return seats.map((s) => ({
    id: s._id.toString(),
    sectionId: s.sectionId,
    sectionName: s.sectionName,
    rowLabel: s.rowLabel,
    seatNumber: s.seatNumber,
    seatLabel: s.seatLabel,
    category: s.category,
    price: s.price,
    currency: s.currency,
    status: s.status,
    heldUntil: s.heldUntil
  }));
}

/**
 * Atomically acquires a 10-minute hold for selected seats using database transactions.
 */
export async function createSeatHold({ eventId, attendeeId, seatIds, ipAddress, userAgent }) {
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    throw new BadRequestError('Invalid event ID format.');
  }

  if (!Array.isArray(seatIds) || seatIds.length === 0) {
    throw new BadRequestError('At least one seat must be selected.');
  }

  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  if (event.status !== EVENT_STATUS.PUBLISHED) {
    throw new BadRequestError('Cannot reserve seats for an unpublished or cancelled event.');
  }

  if (new Date(event.eventDate).getTime() <= Date.now()) {
    throw new BadRequestError('Cannot book seats for a past event.');
  }

  const maxTickets = event.maxTicketsPerBooking || 6;
  if (seatIds.length > maxTickets) {
    throw new BadRequestError(`You cannot reserve more than ${maxTickets} seats in a single booking.`);
  }

  if (event.organizerId.toString() === attendeeId.toString()) {
    throw new ForbiddenError('Organizers cannot hold seats for their own events.');
  }

  // Pre-cleanup of any expired holds
  await expireStaleHolds();

  const objectSeatIds = seatIds.map((id) => new mongoose.Types.ObjectId(id));
  const holdDurationMs = 10 * 60 * 1000; // 10 minutes
  const expiresAt = new Date(Date.now() + holdDurationMs);

  return withTransaction(async (session) => {
    // 1. Fetch requested seats
    const seats = await EventSeat.find(
      {
        _id: { $in: objectSeatIds },
        eventId: new mongoose.Types.ObjectId(eventId)
      },
      null,
      session ? { session } : {}
    );

    if (seats.length !== seatIds.length) {
      throw new BadRequestError('One or more requested seats could not be found for this event.');
    }

    // 2. Validate availability of every seat
    const unavailableSeats = [];
    let calculatedTotal = 0;
    const seatLabels = [];

    for (const seat of seats) {
      seatLabels.push(seat.seatLabel);
      calculatedTotal += seat.price;

      if (seat.status === SEAT_STATUS.BLOCKED) {
        unavailableSeats.push({ seatLabel: seat.seatLabel, reason: 'BLOCKED' });
        continue;
      }

      if (seat.status === SEAT_STATUS.BOOKED) {
        unavailableSeats.push({ seatLabel: seat.seatLabel, reason: 'ALREADY_BOOKED' });
        continue;
      }

      // If currently HELD, verify if it's still active
      if (seat.status === SEAT_STATUS.HELD) {
        if (seat.heldUntil && new Date(seat.heldUntil).getTime() > Date.now()) {
          // Check if held by this same user
          if (seat.heldBy && seat.heldBy.toString() !== attendeeId.toString()) {
            unavailableSeats.push({ seatLabel: seat.seatLabel, reason: 'HELD_BY_ANOTHER_USER' });
          }
        }
      }
    }

    if (unavailableSeats.length > 0) {
      throw new ConflictError('One or more of the selected seats are no longer available.', {
        code: 'ERR_SEAT_UNAVAILABLE',
        unavailableSeats
      });
    }

    // 3. Create the SeatHold document
    const [hold] = await SeatHold.create(
      [
        {
          eventId: new mongoose.Types.ObjectId(eventId),
          attendeeId: new mongoose.Types.ObjectId(attendeeId),
          seatIds: objectSeatIds,
          seatLabels,
          totalAmount: calculatedTotal,
          status: SEAT_HOLD_STATUS.ACTIVE,
          expiresAt
        }
      ],
      session ? { session } : {}
    );

    // 4. Atomically claim each requested seat
    const updateRes = await EventSeat.updateMany(
      {
        _id: { $in: objectSeatIds },
        eventId: new mongoose.Types.ObjectId(eventId),
        $or: [
          { status: SEAT_STATUS.AVAILABLE },
          { status: SEAT_STATUS.HELD, heldUntil: { $lte: new Date() } },
          { status: SEAT_STATUS.HELD, heldBy: new mongoose.Types.ObjectId(attendeeId) }
        ]
      },
      {
        $set: {
          status: SEAT_STATUS.HELD,
          holdId: hold._id,
          heldBy: new mongoose.Types.ObjectId(attendeeId),
          heldUntil: expiresAt
        },
        $inc: { version: 1 }
      },
      session ? { session } : {}
    );

    // Concurrency guarantee: if even one seat was claimed by a competing request in parallel, abort!
    if (updateRes.modifiedCount !== seatIds.length) {
      throw new ConflictError('A concurrent booking conflict occurred. Please select your seats again.', {
        code: 'ERR_CONCURRENT_HOLD_COLLISION'
      });
    }

    logger.info(
      { holdId: hold._id, attendeeId, seatCount: seatIds.length, totalAmount: calculatedTotal },
      'Successfully acquired atomic seat hold'
    );

    return {
      holdId: hold._id.toString(),
      eventId: eventId.toString(),
      seatIds: objectSeatIds.map((id) => id.toString()),
      seatLabels,
      totalAmount: calculatedTotal,
      expiresAt: hold.expiresAt
    };
  });
}

/**
 * Manually releases an active seat hold early when an attendee deselects or cancels.
 */
export async function releaseSeatHold({ holdId, attendeeId }) {
  if (!mongoose.Types.ObjectId.isValid(holdId)) {
    throw new BadRequestError('Invalid hold ID format.');
  }

  const hold = await SeatHold.findById(holdId);
  if (!hold) {
    throw new NotFoundError('Seat hold not found.');
  }

  if (hold.attendeeId.toString() !== attendeeId.toString()) {
    throw new ForbiddenError('You are not authorized to release this seat hold.');
  }

  if (hold.status !== SEAT_HOLD_STATUS.ACTIVE) {
    return { success: true, message: 'Hold was already inactive.' };
  }

  hold.status = SEAT_HOLD_STATUS.RELEASED;
  hold.releasedAt = new Date();
  await hold.save();

  await EventSeat.updateMany(
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

  logger.info({ holdId, attendeeId }, 'Seat hold explicitly released by attendee');
  return { success: true, message: 'Seat hold successfully released.' };
}

/**
 * Organizer seat blocking function.
 */
export async function toggleSeatBlock({ eventId, seatId, organizerId, block = true }) {
  const event = await Event.findById(eventId);
  if (!event) throw new NotFoundError('Event not found.');

  if (event.organizerId.toString() !== organizerId.toString()) {
    throw new ForbiddenError('Only the event organizer can block or unblock seats.');
  }

  const seat = await EventSeat.findOne({ _id: seatId, eventId });
  if (!seat) throw new NotFoundError('Seat not found in this event.');

  if (block) {
    if (seat.status === SEAT_STATUS.BOOKED) {
      throw new ConflictError('Cannot block a seat that has already been booked.');
    }
    seat.status = SEAT_STATUS.BLOCKED;
    seat.holdId = null;
    seat.heldBy = null;
    seat.heldUntil = null;
  } else {
    if (seat.status === SEAT_STATUS.BLOCKED) {
      seat.status = SEAT_STATUS.AVAILABLE;
    }
  }

  await seat.save();
  return { success: true, seatId, status: seat.status };
}
