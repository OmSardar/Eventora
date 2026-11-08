import mongoose from 'mongoose';
import { EventSeat } from './EventSeat.js';
import { SeatHold } from './SeatHold.js';
import { Event } from '../events/Event.js';
import { Registration } from '../registrations/Registration.js';
import {
  SEAT_STATUS,
  SEAT_HOLD_STATUS,
  EVENT_STATUS,
  SEATING_TYPE,
  REGISTRATION_STATUS
} from '../../shared/constants/status.js';
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
 * Builds an automatic venue layout grid (e.g. 50 seats = 5 rows of 10).
 */
export function buildAutomaticVenueLayout({
  totalSeats = 50,
  rows = 5,
  seatsPerRow = 10,
  startingRowLabel = 'A',
  category = 'STANDARD',
  price = 500
}) {
  const numRows = typeof rows === 'number' ? rows : parseInt(rows, 10) || 5;
  const numSeatsPerRow = typeof seatsPerRow === 'number' ? seatsPerRow : parseInt(seatsPerRow, 10) || 10;
  const startCharCode = (startingRowLabel || 'A').toUpperCase().charCodeAt(0);

  const rowList = [];
  let generatedSeats = 0;
  const targetTotal = totalSeats || numRows * numSeatsPerRow;

  for (let i = 0; i < numRows; i++) {
    const rowLabel = String.fromCharCode(startCharCode + i);
    const count = Math.min(numSeatsPerRow, targetTotal - generatedSeats);
    if (count <= 0) break;
    rowList.push({ rowLabel, seatCount: count });
    generatedSeats += count;
  }

  return {
    name: 'Automatic Layout',
    description: `Auto-generated ${generatedSeats} seats across ${rowList.length} rows`,
    sections: [
      {
        sectionId: 'main-hall',
        name: 'Main Hall',
        category,
        price,
        rows: rowList
      }
    ]
  };
}

/**
 * Generates physical seat inventory for an assigned-seating event.
 * Supports Option A (Automatic) and Option B (Custom).
 * Preserves existing registrations by accounting for their occupied capacity.
 */
export async function generateEventSeats(eventId, layoutOptions = null) {
  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  // Guard: Never alter seating when active holds or confirmed bookings exist in inventory
  const existingActiveSeats = await EventSeat.countDocuments({
    eventId: event._id,
    status: { $in: [SEAT_STATUS.HELD, SEAT_STATUS.BOOKED] }
  });

  if (existingActiveSeats > 0) {
    throw new ConflictError('Cannot regenerate venue layout when active holds or confirmed bookings exist.');
  }

  // Determine layout configuration
  let layout = null;
  if (layoutOptions) {
    if (layoutOptions.generationMode === 'AUTOMATIC' || layoutOptions.rows || layoutOptions.seatsPerRow) {
      layout = buildAutomaticVenueLayout({
        totalSeats: layoutOptions.totalSeats || event.seatLimit,
        rows: layoutOptions.rows || 5,
        seatsPerRow: layoutOptions.seatsPerRow || 10,
        startingRowLabel: layoutOptions.startingRowLabel || 'A',
        category: layoutOptions.category || 'STANDARD',
        price: layoutOptions.price || event.ticketPrice || 500
      });
    } else if (layoutOptions.customLayout) {
      layout = layoutOptions.customLayout;
    } else if (layoutOptions.sections) {
      layout = layoutOptions;
    }
  }

  if (!layout) {
    layout = event.venueLayout || getDefaultVenueLayout(event.ticketPrice || 500);
  }

  // Clear existing unreserved seats for this event
  await EventSeat.deleteMany({ eventId: event._id });

  const seatsToInsert = [];

  for (const section of layout.sections || []) {
    const sectionPrice = section.price ?? event.ticketPrice ?? 500;
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
          category: section.category || 'STANDARD',
          price: sectionPrice,
          currency: event.currency || 'INR',
          status: SEAT_STATUS.AVAILABLE,
          isAccessible: !!section.isAccessible,
          isBlocked: false,
          version: 0
        });
      }
    }
  }

  // Account for any pre-existing registrations (general admission backwards compatibility)
  const existingBookingsCount = await Registration.countDocuments({
    eventId: event._id,
    status: { $ne: REGISTRATION_STATUS.CANCELLED }
  });

  if (existingBookingsCount > 0) {
    if (seatsToInsert.length < existingBookingsCount) {
      throw new BadRequestError(
        `Cannot generate layout with ${seatsToInsert.length} seats because event already has ${existingBookingsCount} confirmed attendees.`
      );
    }

    // Reserve/block the first N seats for existing general admission attendees
    for (let i = 0; i < existingBookingsCount; i++) {
      seatsToInsert[i].status = SEAT_STATUS.BLOCKED;
      seatsToInsert[i].isBlocked = true;
    }
  }

  if (seatsToInsert.length > 0) {
    await EventSeat.insertMany(seatsToInsert);
    event.seatLimit = seatsToInsert.length;
    event.seatsBooked = existingBookingsCount;
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
    isAccessible: s.isAccessible || false,
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

  // Prevent holding seats if attendee is already registered or previously cancelled
  const existingRegistration = await Registration.findOne({
    eventId: new mongoose.Types.ObjectId(eventId),
    attendeeId: new mongoose.Types.ObjectId(attendeeId)
  });

  if (existingRegistration) {
    if (existingRegistration.status === REGISTRATION_STATUS.CANCELLED) {
      throw new BadRequestError('You have previously cancelled your registration for this event and cannot reserve seats.');
    }
    if (existingRegistration.status === REGISTRATION_STATUS.CANCELLATION_REQUESTED) {
      throw new ConflictError('A cancellation request is pending for this event.');
    }
    throw new ConflictError('You are already registered for this event.');
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
      // Compensating rollback for standalone environments (or when replica sets are not active)
      await SeatHold.deleteOne({ _id: hold._id });
      await EventSeat.updateMany(
        { holdId: hold._id },
        {
          $set: {
            status: SEAT_STATUS.AVAILABLE,
            holdId: null,
            heldBy: null,
            heldUntil: null
          }
        }
      );
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
    seat.isBlocked = true;
    seat.holdId = null;
    seat.heldBy = null;
    seat.heldUntil = null;
  } else {
    if (seat.status === SEAT_STATUS.BLOCKED) {
      seat.status = SEAT_STATUS.AVAILABLE;
      seat.isBlocked = false;
    }
  }

  await seat.save();
  return { success: true, seatId, status: seat.status };
}

/**
 * Organizer Seating Inventory Dashboard service.
 * Delivers detailed inspection data, metrics, and booked attendee info for event owners.
 */
export async function getOrganizerSeatingDashboard({ eventId, organizerId }) {
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    throw new BadRequestError('Invalid event ID format.');
  }

  const event = await Event.findById(eventId);
  if (!event) throw new NotFoundError('Event not found.');

  if (event.organizerId.toString() !== organizerId.toString()) {
    throw new ForbiddenError('Only the event organizer can access the seating dashboard.');
  }

  await expireStaleHolds();

  const seats = await EventSeat.find({ eventId: event._id })
    .populate({
      path: 'bookingId',
      select: 'bookingReference status totalAmount confirmedAt paymentId attendeeId',
      populate: [
        { path: 'attendeeId', select: 'name email' },
        { path: 'paymentId', select: 'status paymentId amount' }
      ]
    })
    .populate('heldBy', 'name email')
    .sort({ sectionId: 1, rowLabel: 1, seatNumber: 1 })
    .lean();

  let availableCount = 0;
  let heldCount = 0;
  let bookedCount = 0;
  let blockedCount = 0;
  let totalRevenue = 0;

  const formattedSeats = seats.map((s) => {
    if (s.status === SEAT_STATUS.AVAILABLE) availableCount++;
    else if (s.status === SEAT_STATUS.HELD) heldCount++;
    else if (s.status === SEAT_STATUS.BOOKED) {
      bookedCount++;
      totalRevenue += s.price || 0;
    } else if (s.status === SEAT_STATUS.BLOCKED) blockedCount++;

    return {
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
      isAccessible: s.isAccessible || false,
      isBlocked: s.isBlocked || false,
      heldUntil: s.heldUntil,
      booking: s.bookingId
        ? {
            id: s.bookingId._id?.toString(),
            bookingReference: s.bookingId.bookingReference,
            bookingStatus: s.bookingId.status,
            confirmedAt: s.bookingId.confirmedAt,
            attendee: s.bookingId.attendeeId
              ? {
                  name: s.bookingId.attendeeId.name,
                  email: s.bookingId.attendeeId.email
                }
              : null,
            paymentStatus: s.bookingId.paymentId?.status || (s.bookingId.totalAmount === 0 ? 'FREE' : 'CAPTURED')
          }
        : null,
      hold: s.heldBy
        ? {
            attendeeName: s.heldBy.name,
            attendeeEmail: s.heldBy.email,
            heldUntil: s.heldUntil
          }
        : null
    };
  });

  const totalSeats = seats.length;
  const occupancyRate = totalSeats > 0 ? parseFloat(((bookedCount / totalSeats) * 100).toFixed(1)) : 0;

  return {
    event: {
      id: event._id.toString(),
      title: event.title,
      eventDate: event.eventDate,
      venue: event.venue,
      seatLimit: event.seatLimit,
      seatsBooked: bookedCount,
      seatingType: event.seatingType
    },
    metrics: {
      totalSeats,
      availableSeats: availableCount,
      heldSeats: heldCount,
      bookedSeats: bookedCount,
      blockedSeats: blockedCount,
      occupancyRate,
      totalRevenue
    },
    layout: event.venueLayout,
    seats: formattedSeats
  };
}
