import crypto from 'crypto';
import mongoose from 'mongoose';
import { Booking } from './Booking.js';
import { Event } from '../events/Event.js';
import { EventSeat } from '../seating/EventSeat.js';
import { SeatHold } from '../seating/SeatHold.js';
import { Registration } from '../registrations/Registration.js';
import { User } from '../users/User.js';
import {
  BOOKING_STATUS,
  SEAT_STATUS,
  SEAT_HOLD_STATUS,
  REGISTRATION_STATUS,
  NOTIFICATION_TYPE,
  EVENT_STATUS
} from '../../shared/constants/status.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError
} from '../../shared/errors/AppError.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { generateSignedTicketToken, verifySignedTicketToken } from './ticketCrypto.js';
import { dispatchNotification } from '../notifications/notificationService.js';
import { sendRegistrationConfirmationEmail } from '../../infrastructure/email/emailService.js';
import { logAuditEvent } from '../audit/AuditLog.js';
import { logger } from '../../infrastructure/logging/logger.js';

/**
 * Generates an unguessable, human-readable booking reference.
 * Format: EVT-YYYYMMDD-XXXX (e.g. EVT-20261108-9A7B)
 */
export function generateBookingReference() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `EVT-${dateStr}-${randomHex}`;
}

/**
 * Creates and confirms a Booking document from an active SeatHold.
 * Executed within an existing transaction session or standalone withTransaction.
 */
export async function confirmBookingFromHold({
  holdId,
  attendeeId,
  paymentId = null,
  isPaid = false,
  session = null
}) {
  const hold = await SeatHold.findById(holdId, null, session ? { session } : {});
  if (!hold) {
    throw new NotFoundError('Seat hold not found.');
  }

  if (hold.attendeeId.toString() !== attendeeId.toString()) {
    throw new ForbiddenError('You are not authorized to claim this seat hold.');
  }

  if (hold.status !== SEAT_HOLD_STATUS.ACTIVE) {
    throw new ConflictError(`Cannot confirm booking for seat hold with status ${hold.status}.`);
  }

  if (new Date(hold.expiresAt).getTime() <= Date.now()) {
    throw new ConflictError('Seat hold has expired. Please select your seats again.', {
      code: 'ERR_HOLD_EXPIRED'
    });
  }

  const event = await Event.findById(hold.eventId, null, session ? { session } : {});
  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  const bookingRef = generateBookingReference();
  const ticketToken = generateSignedTicketToken({
    bookingReference: bookingRef,
    eventId: event._id,
    attendeeId
  });

  // 1. Create confirmed Booking record
  const [booking] = await Booking.create(
    [
      {
        bookingReference: bookingRef,
        eventId: event._id,
        attendeeId: new mongoose.Types.ObjectId(attendeeId),
        seatIds: hold.seatIds,
        seatLabels: hold.seatLabels,
        ticketCategory: 'ASSIGNED',
        subtotal: hold.totalAmount,
        fees: 0,
        totalAmount: hold.totalAmount,
        currency: event.currency || 'INR',
        status: BOOKING_STATUS.CONFIRMED,
        paymentId: paymentId ? new mongoose.Types.ObjectId(paymentId) : null,
        holdId: hold._id,
        confirmedAt: new Date(),
        ticketToken
      }
    ],
    session ? { session } : {}
  );

  // 2. Mark SeatHold as CONSUMED
  hold.status = SEAT_HOLD_STATUS.CONSUMED;
  hold.bookingId = booking._id;
  await hold.save(session ? { session } : {});

  // 3. Atomically transition physical seats to BOOKED
  const seatUpdate = await EventSeat.updateMany(
    {
      _id: { $in: hold.seatIds },
      eventId: event._id,
      status: SEAT_STATUS.HELD,
      holdId: hold._id
    },
    {
      $set: {
        status: SEAT_STATUS.BOOKED,
        bookingId: booking._id,
        holdId: null,
        heldBy: null,
        heldUntil: null
      },
      $inc: { version: 1 }
    },
    session ? { session } : {}
  );

  if (seatUpdate.modifiedCount !== hold.seatIds.length) {
    throw new ConflictError('Some seats could not be permanently confirmed due to state collision.');
  }

  return booking;
}

/**
 * Completes a free assigned-seating reservation directly without payment gateway.
 */
export async function confirmFreeAssignedBooking({
  eventId,
  holdId,
  attendeeId,
  ipAddress,
  userAgent
}) {
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    throw new BadRequestError('Invalid event ID format.');
  }

  const event = await Event.findById(eventId);
  if (!event) throw new NotFoundError('Event not found.');

  if (event.isPaid && event.ticketPrice > 0) {
    throw new BadRequestError('Event is paid. Please complete payment checkout.');
  }

  // Prevent organizer booking own event
  if (event.organizerId.toString() === attendeeId.toString()) {
    throw new ForbiddenError('Organizers cannot reserve seats for their own events.');
  }

  // Check existing registration (including cancelled registrations to prevent re-booking)
  const existingReg = await Registration.findOne({
    eventId: new mongoose.Types.ObjectId(eventId),
    attendeeId: new mongoose.Types.ObjectId(attendeeId)
  });

  if (existingReg) {
    if (existingReg.status === REGISTRATION_STATUS.CANCELLED) {
      throw new BadRequestError('You have previously cancelled your registration for this event and cannot re-book.');
    }
    if (existingReg.status === REGISTRATION_STATUS.CANCELLATION_REQUESTED) {
      throw new ConflictError('A cancellation request is pending for this event.');
    }
    throw new ConflictError('You are already registered for this event.');
  }

  return withTransaction(async (session) => {
    // 1. Confirm booking and physical seats
    const booking = await confirmBookingFromHold({
      holdId,
      attendeeId,
      paymentId: null,
      isPaid: false,
      session
    });

    // 2. Update event seatsBooked count
    const updatedEvent = await Event.findOneAndUpdate(
      { _id: event._id, status: EVENT_STATUS.PUBLISHED },
      { $inc: { seatsBooked: booking.seatIds.length } },
      { new: true, session: session || undefined }
    );

    // 3. Create confirmed Registration for compatibility
    const [registration] = await Registration.create(
      [
        {
          eventId: event._id,
          attendeeId: new mongoose.Types.ObjectId(attendeeId),
          status: REGISTRATION_STATUS.CONFIRMED,
          isPaid: false,
          ticketPrice: 0,
          currency: event.currency || 'INR',
          confirmationEmailSent: false
        }
      ],
      session ? { session } : {}
    );

    booking.registrationId = registration._id;
    await booking.save(session ? { session } : {});

    // 4. Non-blocking confirmation email & alerts
    const attendeeUser = await User.findById(attendeeId).select('name email');
    if (attendeeUser && attendeeUser.email) {
      sendRegistrationConfirmationEmail({
        registrationId: booking.bookingReference,
        attendee: { name: attendeeUser.name, email: attendeeUser.email },
        event: updatedEvent,
        seatNumbers: booking.seatLabels
      }).catch((emailErr) => {
        logger.error({ err: emailErr?.message }, 'Free seat booking confirmation email delivery failed');
      });
    }

    dispatchNotification({
      userId: attendeeId,
      type: NOTIFICATION_TYPE.BOOKING_CONFIRMED,
      title: 'Booking Confirmed!',
      message: `Your seats (${booking.seatLabels.join(', ')}) for "${event.title}" have been confirmed.`,
      eventId: event._id,
      registrationId: registration._id
    });

    await logAuditEvent({
      action: 'FREE_ASSIGNED_SEAT_BOOKING_CONFIRMED',
      actorId: attendeeId,
      actorRole: 'ATTENDEE',
      resourceId: booking._id,
      resourceType: 'Booking',
      ipAddress,
      userAgent,
      details: {
        bookingReference: booking.bookingReference,
        seats: booking.seatLabels,
        seatCount: booking.seatIds.length
      }
    });

    return {
      success: true,
      booking,
      registration
    };
  });
}

/**
 * Retrieves digital tickets for a confirmed booking.
 * Generates structured ticket passes for each seat.
 */
export async function getDigitalTickets(bookingId, userId) {
  let booking = null;

  if (mongoose.Types.ObjectId.isValid(bookingId)) {
    booking = await Booking.findById(bookingId)
      .populate('eventId')
      .populate('attendeeId', 'name email');
  } else {
    // Also support lookup by bookingReference
    booking = await Booking.findOne({ bookingReference: bookingId.toUpperCase() })
      .populate('eventId')
      .populate('attendeeId', 'name email');
  }

  if (!booking) {
    throw new NotFoundError('Booking not found.');
  }

  const isOwner = booking.attendeeId?._id?.toString() === userId.toString();
  const isOrganizer = booking.eventId?.organizerId?.toString() === userId.toString();

  if (!isOwner && !isOrganizer) {
    throw new ForbiddenError('You are not authorized to view tickets for this booking.');
  }

  // Populate seat items
  const seats = await EventSeat.find({ _id: { $in: booking.seatIds } }).lean();

  const appBaseUrl = process.env.APP_BASE_URL || 'https://eventora-black.vercel.app';
  const qrCodePayload = `${appBaseUrl}/tickets/verify?token=${encodeURIComponent(booking.ticketToken || '')}`;

  return {
    bookingId: booking._id.toString(),
    bookingReference: booking.bookingReference,
    event: {
      id: booking.eventId._id.toString(),
      title: booking.eventId.title,
      eventDate: booking.eventId.eventDate,
      venue: booking.eventId.venue,
      bannerUrl: booking.eventId.bannerUrl || booking.eventId.image?.url
    },
    attendee: {
      id: booking.attendeeId?._id?.toString(),
      name: booking.attendeeId?.name || 'Attendee',
      email: booking.attendeeId?.email || ''
    },
    status: booking.status,
    totalAmount: booking.totalAmount,
    currency: booking.currency,
    confirmedAt: booking.confirmedAt,
    isRedeemed: booking.isRedeemed,
    redeemedAt: booking.redeemedAt,
    ticketToken: booking.ticketToken,
    qrCodePayload,
    seats: seats.map((s) => ({
      seatId: s._id.toString(),
      seatLabel: s.seatLabel,
      sectionName: s.sectionName,
      rowLabel: s.rowLabel,
      seatNumber: s.seatNumber,
      category: s.category,
      price: s.price,
      isAccessible: s.isAccessible || false
    }))
  };
}

/**
 * Validates a digital ticket token from QR scan.
 * Prevents duplicate redemption.
 */
export async function verifyAndRedeemTicket({ token, scannerUserId = null, markRedeemed = false }) {
  if (!token) {
    throw new BadRequestError('Ticket verification token is required.');
  }

  // 1. Sanitize token (extract if passed as full URL)
  let cleanToken = String(token).trim();
  if (cleanToken.includes('token=')) {
    try {
      const urlObj = new URL(cleanToken);
      cleanToken = urlObj.searchParams.get('token') || cleanToken;
    } catch (_) {
      const match = cleanToken.match(/token=([^&]+)/);
      if (match && match[1]) {
        cleanToken = decodeURIComponent(match[1]);
      }
    }
  }

  // 2. Attempt HMAC cryptographic signature verification
  const payload = verifySignedTicketToken(cleanToken);

  let booking = null;
  let registration = null;

  if (payload) {
    // A. Signed token: search Booking by reference
    if (payload.ref) {
      booking = await Booking.findOne({ bookingReference: payload.ref })
        .populate('eventId', 'title eventDate venue organizerId status')
        .populate('attendeeId', 'name email');
    }

    // B. If not found in Booking, search Registration
    if (!booking && payload.evt && payload.att) {
      registration = await Registration.findOne({
        eventId: new mongoose.Types.ObjectId(payload.evt),
        attendeeId: new mongoose.Types.ObjectId(payload.att)
      })
        .populate('eventId', 'title eventDate venue organizerId status')
        .populate('attendeeId', 'name email');
    }
  } else {
    // C. Non-signed fallback (manual booking reference or direct ID lookup)
    const upperToken = cleanToken.toUpperCase();

    // Check Booking by reference
    booking = await Booking.findOne({ bookingReference: upperToken })
      .populate('eventId', 'title eventDate venue organizerId status')
      .populate('attendeeId', 'name email');

    // Check by ObjectId if valid
    if (!booking && mongoose.Types.ObjectId.isValid(cleanToken)) {
      const objId = new mongoose.Types.ObjectId(cleanToken);
      booking = await Booking.findById(objId)
        .populate('eventId', 'title eventDate venue organizerId status')
        .populate('attendeeId', 'name email');

      if (!booking) {
        registration = await Registration.findById(objId)
          .populate('eventId', 'title eventDate venue organizerId status')
          .populate('attendeeId', 'name email');
      }
    }

    // Check Registration by reference prefix (EVT-XXXXXXXX)
    if (!booking && !registration && upperToken.startsWith('EVT-')) {
      const hexPrefix = cleanToken.slice(4).toLowerCase();
      if (/^[0-9a-f]{6,8}$/i.test(hexPrefix)) {
        const potentialRegs = await Registration.find()
          .populate('eventId', 'title eventDate venue organizerId status')
          .populate('attendeeId', 'name email')
          .sort({ createdAt: -1 })
          .limit(20);

        registration =
          potentialRegs.find((r) => r._id.toString().toLowerCase().startsWith(hexPrefix)) || null;
      }
    }
  }

  // 3. Process Booking admission
  if (booking) {
    if (booking.eventId?.status === EVENT_STATUS.CANCELLED) {
      return {
        isValid: false,
        reason: 'EVENT_CANCELLED',
        message: 'This event has been cancelled by the organizer. Admission is not permitted.'
      };
    }

    if (booking.status !== BOOKING_STATUS.CONFIRMED) {
      return {
        isValid: false,
        reason: 'BOOKING_INACTIVE',
        message: `Booking is currently ${booking.status}. Admission not permitted.`
      };
    }

    if (booking.isRedeemed) {
      return {
        isValid: false,
        isAlreadyRedeemed: true,
        reason: 'ALREADY_REDEEMED',
        message: `This ticket was already redeemed on ${booking.redeemedAt ? new Date(booking.redeemedAt).toLocaleString() : 'a previous scan'}.`,
        bookingReference: booking.bookingReference,
        eventTitle: booking.eventId?.title,
        attendeeName: booking.attendeeId?.name,
        seats: booking.seatLabels,
        redeemedAt: booking.redeemedAt
      };
    }

    // Authorization check: only the organizer of this event can admit attendees
    if (markRedeemed && scannerUserId) {
      const eventOrganizerId = booking.eventId?.organizerId?._id?.toString() || booking.eventId?.organizerId?.toString();
      if (eventOrganizerId && eventOrganizerId !== scannerUserId.toString()) {
        throw new ForbiddenError('You are not authorized to admit attendees for an event you do not organize.');
      }
    }

    if (markRedeemed) {
      const redeemedAt = new Date();
      // Atomic conditional update guarantees that concurrent scans cannot double-redeem
      const updatedBooking = await Booking.findOneAndUpdate(
        {
          _id: booking._id,
          isRedeemed: false,
          status: BOOKING_STATUS.CONFIRMED
        },
        {
          $set: {
            isRedeemed: true,
            redeemedAt,
            ...(scannerUserId ? { redeemedBy: new mongoose.Types.ObjectId(scannerUserId) } : {})
          }
        },
        { new: true }
      );

      if (!updatedBooking) {
        const fresh = await Booking.findById(booking._id).lean();
        return {
          isValid: false,
          isAlreadyRedeemed: true,
          reason: 'ALREADY_REDEEMED',
          message: `This ticket was already redeemed on ${fresh?.redeemedAt ? new Date(fresh.redeemedAt).toLocaleString() : 'a concurrent scan'}.`,
          bookingReference: booking.bookingReference,
          eventTitle: booking.eventId?.title,
          attendeeName: booking.attendeeId?.name,
          seats: booking.seatLabels,
          redeemedAt: fresh?.redeemedAt || redeemedAt
        };
      }

      booking.isRedeemed = true;
      booking.redeemedAt = redeemedAt;
      logger.info({ bookingReference: booking.bookingReference }, 'Booking ticket atomically marked redeemed');
    }

    return {
      isValid: true,
      isAlreadyRedeemed: false,
      bookingReference: booking.bookingReference,
      eventTitle: booking.eventId?.title,
      eventDate: booking.eventId?.eventDate,
      venue: booking.eventId?.venue,
      attendeeName: booking.attendeeId?.name,
      seats: booking.seatLabels && booking.seatLabels.length > 0 ? booking.seatLabels : ['Reserved Admission'],
      ticketCount: booking.seatLabels?.length || 1,
      redeemed: markRedeemed
    };
  }

  // 4. Process Registration admission
  if (registration) {
    if (registration.eventId?.status === EVENT_STATUS.CANCELLED) {
      return {
        isValid: false,
        reason: 'EVENT_CANCELLED',
        message: 'This event has been cancelled by the organizer. Admission is not permitted.'
      };
    }

    if (registration.status !== REGISTRATION_STATUS.CONFIRMED) {
      return {
        isValid: false,
        reason: 'REGISTRATION_INACTIVE',
        message: `Registration is currently ${registration.status}. Admission not permitted.`
      };
    }

    const regRef = payload?.ref || `EVT-${registration._id.toString().substring(0, 8).toUpperCase()}`;

    if (registration.isRedeemed) {
      return {
        isValid: false,
        isAlreadyRedeemed: true,
        reason: 'ALREADY_REDEEMED',
        message: `This ticket was already redeemed on ${registration.redeemedAt ? new Date(registration.redeemedAt).toLocaleString() : 'a previous scan'}.`,
        bookingReference: regRef,
        eventTitle: registration.eventId?.title,
        attendeeName: registration.attendeeId?.name,
        seats: ['General Admission'],
        redeemedAt: registration.redeemedAt
      };
    }

    // Authorization check: only the organizer of this event can admit attendees
    if (markRedeemed && scannerUserId) {
      const eventOrganizerId = registration.eventId?.organizerId?._id?.toString() || registration.eventId?.organizerId?.toString();
      if (eventOrganizerId && eventOrganizerId !== scannerUserId.toString()) {
        throw new ForbiddenError('You are not authorized to admit attendees for an event you do not organize.');
      }
    }

    if (markRedeemed) {
      const redeemedAt = new Date();
      // Atomic conditional update guarantees concurrent safety
      const updatedRegistration = await Registration.findOneAndUpdate(
        {
          _id: registration._id,
          isRedeemed: false,
          status: REGISTRATION_STATUS.CONFIRMED
        },
        {
          $set: {
            isRedeemed: true,
            redeemedAt,
            ...(scannerUserId ? { redeemedBy: new mongoose.Types.ObjectId(scannerUserId) } : {})
          }
        },
        { new: true }
      );

      if (!updatedRegistration) {
        const fresh = await Registration.findById(registration._id).lean();
        return {
          isValid: false,
          isAlreadyRedeemed: true,
          reason: 'ALREADY_REDEEMED',
          message: `This ticket was already redeemed on ${fresh?.redeemedAt ? new Date(fresh.redeemedAt).toLocaleString() : 'a concurrent scan'}.`,
          bookingReference: regRef,
          eventTitle: registration.eventId?.title,
          attendeeName: registration.attendeeId?.name,
          seats: ['General Admission'],
          redeemedAt: fresh?.redeemedAt || redeemedAt
        };
      }

      registration.isRedeemed = true;
      registration.redeemedAt = redeemedAt;
      logger.info({ registrationId: registration._id }, 'Registration ticket atomically marked redeemed');
    }

    return {
      isValid: true,
      isAlreadyRedeemed: false,
      bookingReference: regRef,
      eventTitle: registration.eventId?.title,
      eventDate: registration.eventId?.eventDate,
      venue: registration.eventId?.venue,
      attendeeName: registration.attendeeId?.name,
      seats: ['General Admission'],
      ticketCount: 1,
      redeemed: markRedeemed
    };
  }

  // 5. Neither Booking nor Registration found
  return {
    isValid: false,
    reason: payload ? 'BOOKING_NOT_FOUND' : 'INVALID_SIGNATURE',
    message: 'No valid ticket pass or booking matching this token could be found.'
  };
}

