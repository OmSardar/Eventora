import mongoose from 'mongoose';
import { Payment } from './Payment.js';
import { SeatReservation } from './SeatReservation.js';
import { Event } from '../events/Event.js';
import { Registration } from '../registrations/Registration.js';
import { User } from '../users/User.js';
import {
  PAYMENT_STATUS,
  RESERVATION_STATUS,
  REGISTRATION_STATUS,
  EVENT_STATUS,
  NOTIFICATION_TYPE
} from '../../shared/constants/status.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError
} from '../../shared/errors/AppError.js';
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
  fetchRazorpayPayment,
  initiateRazorpayRefund
} from './razorpayService.js';
import { logAuditEvent } from '../audit/AuditLog.js';
import { dispatchNotification } from '../notifications/notificationService.js';
import { sendRegistrationConfirmationEmail } from '../../infrastructure/email/emailService.js';
import { logger } from '../../infrastructure/logging/logger.js';

/**
 * Creates an authoritative Razorpay order and holds a seat for 10 minutes.
 */
export async function createOrderWithSeatHold({
  eventId,
  attendeeId,
  ipAddress,
  userAgent
}) {
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    throw new BadRequestError('Invalid event ID format.');
  }

  // 1. Verify event exists
  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  if (event.status !== EVENT_STATUS.PUBLISHED) {
    throw new BadRequestError('Cannot book a cancelled or unpublished event.');
  }

  if (new Date(event.eventDate).getTime() <= Date.now()) {
    throw new BadRequestError('Cannot book a past event.');
  }

  // Ensure this is a paid event
  if (!event.isPaid || !event.ticketPrice || event.ticketPrice <= 0) {
    throw new BadRequestError('Event is free. Please use standard RSVP registration.');
  }

  // 2. Prevent organizer from booking their own event
  if (event.organizerId.toString() === attendeeId.toString()) {
    throw new ForbiddenError('Organizers cannot book seats for their own events.');
  }

  // 3. Check for existing confirmed registration
  const existingRegistration = await Registration.findOne({
    eventId: new mongoose.Types.ObjectId(eventId),
    attendeeId: new mongoose.Types.ObjectId(attendeeId),
    status: { $ne: REGISTRATION_STATUS.CANCELLED }
  });

  if (existingRegistration) {
    throw new ConflictError('You are already registered for this event.');
  }

  // 4. Reconcile expired holds for this event
  await SeatReservation.updateMany(
    {
      eventId: new mongoose.Types.ObjectId(eventId),
      status: RESERVATION_STATUS.PENDING,
      expiresAt: { $lt: new Date() }
    },
    { $set: { status: RESERVATION_STATUS.EXPIRED } }
  );

  // 5. Check if attendee already has an active pending hold for this event
  const existingHold = await SeatReservation.findOne({
    eventId: new mongoose.Types.ObjectId(eventId),
    attendeeId: new mongoose.Types.ObjectId(attendeeId),
    status: RESERVATION_STATUS.PENDING,
    expiresAt: { $gt: new Date() }
  });

  if (existingHold) {
    throw new ConflictError('You already have an active checkout in progress. Please complete payment or wait for the hold to expire.');
  }

  // 6. Check capacity: seatsBooked + active holds < seatLimit
  const activeHolds = await SeatReservation.countDocuments({
    eventId: new mongoose.Types.ObjectId(eventId),
    status: RESERVATION_STATUS.PENDING,
    expiresAt: { $gt: new Date() }
  });

  if ((event.seatsBooked || 0) + activeHolds >= event.seatLimit) {
    throw new BadRequestError('Event is sold out. No seats remaining.');
  }

  // 7. Calculate authoritative amount in paise
  const amountInPaise = Math.round(event.ticketPrice * 100);
  const idempotencyKey = `ord_${eventId}_${attendeeId}_${Date.now()}`;

  // 8. Create Razorpay order via SDK
  const razorpayOrder = await createRazorpayOrder({
    amountInPaise,
    receipt: idempotencyKey,
    notes: {
      eventId: eventId.toString(),
      attendeeId: attendeeId.toString(),
      eventTitle: event.title.substring(0, 40)
    }
  });

  // 9. Persist 10-minute temporary seat reservation
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const reservation = await SeatReservation.create({
    eventId: new mongoose.Types.ObjectId(eventId),
    attendeeId: new mongoose.Types.ObjectId(attendeeId),
    orderId: razorpayOrder.id,
    reservedSeats: 1,
    status: RESERVATION_STATUS.PENDING,
    expiresAt
  });

  // 10. Persist Payment record
  const payment = await Payment.create({
    attendeeId: new mongoose.Types.ObjectId(attendeeId),
    eventId: new mongoose.Types.ObjectId(eventId),
    reservationId: reservation._id,
    orderId: razorpayOrder.id,
    amount: amountInPaise,
    currency: razorpayOrder.currency || 'INR',
    status: PAYMENT_STATUS.CREATED,
    idempotencyKey
  });

  reservation.paymentId = payment._id;
  await reservation.save();

  await logAuditEvent({
    action: 'PAYMENT_ORDER_CREATED',
    actorId: attendeeId,
    actorRole: 'ATTENDEE',
    resourceId: payment._id,
    resourceType: 'Payment',
    ipAddress,
    userAgent,
    details: {
      orderId: razorpayOrder.id,
      amountInPaise,
      expiresAt
    }
  });

  return {
    orderId: razorpayOrder.id,
    keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
    amount: amountInPaise,
    currency: razorpayOrder.currency || 'INR',
    expiresAt: reservation.expiresAt
  };
}

/**
 * Authoritatively verifies payment signature and confirms booking.
 */
export async function verifyAndConfirmPayment({
  orderId,
  paymentId,
  signature,
  attendeeId,
  ipAddress,
  userAgent
}) {
  const payment = await Payment.findOne({ orderId });
  if (!payment) {
    throw new NotFoundError('Payment order not found.');
  }

  // Strict ownership check
  if (payment.attendeeId.toString() !== attendeeId.toString()) {
    throw new ForbiddenError('You are not authorized to verify this payment.');
  }

  // Idempotency check: if already captured, return existing confirmed booking
  if (payment.status === PAYMENT_STATUS.CAPTURED && payment.registrationId) {
    const existingReg = await Registration.findById(payment.registrationId);
    return { payment, registration: existingReg };
  }

  // 1. Cryptographically verify signature using RAZORPAY_KEY_SECRET
  const isValid = verifyRazorpaySignature({
    orderId,
    paymentId,
    signature
  });

  if (!isValid) {
    payment.status = PAYMENT_STATUS.FAILED;
    payment.failureDetails = {
      code: 'INVALID_SIGNATURE',
      description: 'HMAC-SHA256 signature mismatch'
    };
    await payment.save();

    await logAuditEvent({
      action: 'PAYMENT_VERIFICATION_FAILED',
      actorId: attendeeId,
      actorRole: 'ATTENDEE',
      resourceId: payment._id,
      resourceType: 'Payment',
      status: 'FAILURE',
      ipAddress,
      userAgent,
      details: { orderId, paymentId }
    });

    throw new BadRequestError('Invalid payment signature. Verification failed.');
  }

  // 2. Fetch authoritative status from Razorpay API
  let rzpPayment = null;
  try {
    rzpPayment = await fetchRazorpayPayment(paymentId);
  } catch (apiErr) {
    logger.warn({ err: apiErr?.message, paymentId }, 'Could not fetch payment from Razorpay API');
  }

  // 3. Inspect reservation
  const reservation = await SeatReservation.findOne({ orderId });
  const event = await Event.findById(payment.eventId);
  if (!event) {
    throw new NotFoundError('Associated event not found.');
  }

  // Handle late payment / expired reservation: ensure capacity isn't exceeded
  const isHoldActive = reservation && reservation.status === RESERVATION_STATUS.PENDING && reservation.expiresAt > new Date();

  // Atomically claim seat on the event
  // If hold was active, we increment seatsBooked (converting hold to permanent seat)
  // If hold expired, we check capacity before incrementing; if sold out, initiate refund
  let updatedEvent = null;
  if (isHoldActive) {
    updatedEvent = await Event.findOneAndUpdate(
      { _id: payment.eventId, status: EVENT_STATUS.PUBLISHED },
      { $inc: { seatsBooked: 1 } },
      { new: true }
    );
  } else {
    // Hold was expired: atomic check that seatsBooked < seatLimit
    updatedEvent = await Event.findOneAndUpdate(
      {
        _id: payment.eventId,
        status: EVENT_STATUS.PUBLISHED,
        $expr: { $lt: ['$seatsBooked', '$seatLimit'] }
      },
      { $inc: { seatsBooked: 1 } },
      { new: true }
    );

    if (!updatedEvent) {
      // Event sold out while hold expired! Initiate automated refund
      logger.warn({ orderId, paymentId }, 'Payment succeeded after reservation expired and event sold out. Triggering refund.');
      try {
        await initiateRazorpayRefund({
          paymentId,
          amountInPaise: payment.amount,
          notes: { reason: 'Capacity exceeded after hold expired' }
        });
        payment.status = PAYMENT_STATUS.REFUNDED;
        payment.refundStatus = 'PROCESSED';
      } catch (refundErr) {
        logger.error({ err: refundErr?.message }, 'Auto-refund for late expired payment failed');
      }
      await payment.save();
      throw new BadRequestError('Reservation expired and event is now sold out. A full refund has been initiated.');
    }
  }

  // 4. Update Payment to CAPTURED
  payment.status = PAYMENT_STATUS.CAPTURED;
  payment.paymentId = paymentId;
  payment.method = rzpPayment?.method || payment.method || 'online';

  // 5. Update Reservation to CONFIRMED
  if (reservation) {
    reservation.status = RESERVATION_STATUS.CONFIRMED;
    await reservation.save();
  }

  // 6. Create confirmed Registration
  const registration = await Registration.create({
    eventId: payment.eventId,
    attendeeId: payment.attendeeId,
    paymentId: payment._id,
    isPaid: true,
    ticketPrice: payment.amount / 100,
    currency: payment.currency,
    status: REGISTRATION_STATUS.CONFIRMED,
    confirmationEmailSent: false
  });

  payment.registrationId = registration._id;
  await payment.save();

  // 7. Dispatch post-confirmation email & in-app alert (non-blocking)
  try {
    const attendeeUser = await User.findById(attendeeId).select('name email');
    if (attendeeUser && attendeeUser.email) {
      sendRegistrationConfirmationEmail({
        registrationId: registration._id.toString(),
        attendee: {
          name: attendeeUser.name,
          email: attendeeUser.email
        },
        event: updatedEvent
      }).catch((emailErr) => {
        logger.error({ err: emailErr?.message }, 'Confirmation email delivery failed for paid booking');
      });
    }

    dispatchNotification({
      userId: attendeeId,
      type: NOTIFICATION_TYPE.BOOKING_CONFIRMED,
      title: 'Booking Confirmed!',
      message: `Payment confirmed for "${updatedEvent.title}". Your ticket is secured.`,
      eventId: updatedEvent._id,
      registrationId: registration._id
    });
  } catch (notifyErr) {
    logger.warn({ err: notifyErr?.message }, 'Notification dispatch failed safely for paid booking');
  }

  await logAuditEvent({
    action: 'PAYMENT_CAPTURED_AND_BOOKING_CONFIRMED',
    actorId: attendeeId,
    actorRole: 'ATTENDEE',
    resourceId: payment._id,
    resourceType: 'Payment',
    ipAddress,
    userAgent,
    details: {
      orderId,
      paymentId,
      registrationId: registration._id,
      amount: payment.amount
    }
  });

  return {
    success: true,
    payment,
    registration
  };
}

/**
 * Returns payments for an attendee.
 */
export async function getAttendeePayments(attendeeId) {
  return Payment.find({ attendeeId: new mongoose.Types.ObjectId(attendeeId) })
    .populate('eventId', 'title eventDate venue bannerUrl image')
    .sort({ createdAt: -1 })
    .lean();
}

/**
 * Reconciles expired seat holds across the system.
 */
export async function reconcileExpiredReservations() {
  const result = await SeatReservation.updateMany(
    {
      status: RESERVATION_STATUS.PENDING,
      expiresAt: { $lt: new Date() }
    },
    { $set: { status: RESERVATION_STATUS.EXPIRED } }
  );

  logger.info({ modifiedCount: result.modifiedCount }, 'Reconciled expired seat reservations');
  return { expiredCount: result.modifiedCount };
}
