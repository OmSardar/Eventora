import mongoose from 'mongoose';
import { Payment } from './Payment.js';
import { SeatReservation } from './SeatReservation.js';
import { SeatHold } from '../seating/SeatHold.js';
import { EventSeat } from '../seating/EventSeat.js';
import { RefundOperation } from './RefundOperation.js';
import { Event } from '../events/Event.js';
import { Registration } from '../registrations/Registration.js';
import { User } from '../users/User.js';
import { Booking } from '../bookings/Booking.js';
import { confirmBookingFromHold } from '../bookings/bookingService.js';
import {
  PAYMENT_STATUS,
  REFUND_STATUS,
  RESERVATION_STATUS,
  REGISTRATION_STATUS,
  EVENT_STATUS,
  NOTIFICATION_TYPE,
  SEAT_STATUS,
  SEAT_HOLD_STATUS
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
import { withTransaction } from '../../infrastructure/database/transaction.js';
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

  // 3. Check for existing registration (including cancelled ones to prevent re-booking)
  const existingRegistration = await Registration.findOne({
    eventId: new mongoose.Types.ObjectId(eventId),
    attendeeId: new mongoose.Types.ObjectId(attendeeId)
  });

  if (existingRegistration) {
    if (existingRegistration.status === REGISTRATION_STATUS.CANCELLED) {
      throw new BadRequestError('You have previously cancelled your registration for this event and cannot re-book.');
    }
    if (existingRegistration.status === REGISTRATION_STATUS.CANCELLATION_REQUESTED) {
      throw new ConflictError('A cancellation request is pending for this event.');
    }
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

  // Check if attendee has an active SeatHold (from interactive seat map)
  const activeSeatHold = await SeatHold.findOne({
    eventId: new mongoose.Types.ObjectId(eventId),
    attendeeId: new mongoose.Types.ObjectId(attendeeId),
    status: SEAT_HOLD_STATUS.ACTIVE,
    expiresAt: { $gt: new Date() }
  });

  let amountInPaise = Math.round(event.ticketPrice * 100);
  let seatCount = 1;

  if (activeSeatHold && activeSeatHold.totalAmount > 0) {
    amountInPaise = Math.round(activeSeatHold.totalAmount * 100);
    seatCount = activeSeatHold.seatIds.length;
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

  const idempotencyKey = `rcpt_${eventId.toString().slice(-8)}_${attendeeId.toString().slice(-8)}_${Date.now().toString(36)}`;

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
  const expiresAt = activeSeatHold ? activeSeatHold.expiresAt : new Date(Date.now() + 10 * 60 * 1000);
  const reservation = await SeatReservation.create({
    eventId: new mongoose.Types.ObjectId(eventId),
    attendeeId: new mongoose.Types.ObjectId(attendeeId),
    holdId: activeSeatHold ? activeSeatHold._id : null,
    orderId: razorpayOrder.id,
    reservedSeats: seatCount,
    status: RESERVATION_STATUS.PENDING,
    expiresAt
  });

  // 10. Persist Payment record
  const payment = await Payment.create({
    attendeeId: new mongoose.Types.ObjectId(attendeeId),
    eventId: new mongoose.Types.ObjectId(eventId),
    reservationId: reservation._id,
    holdId: activeSeatHold ? activeSeatHold._id : null,
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
 * Single authoritative confirmation service for captured payments.
 * Shared by client checkout verify callback AND asynchronous Razorpay webhooks.
 * Transitions payment, reservations, seat holds, and physical seats to confirmed status atomically.
 */
export async function confirmCapturedPayment({
  payment,
  paymentId,
  paymentMethod,
  paymentAmount,
  paymentCurrency,
  ipAddress = '127.0.0.1',
  userAgent = 'System/AuthoritativePaymentService',
  source = 'CLIENT_CALLBACK'
}) {
  // 1. Idempotency check: if already captured and confirmed, return existing records
  if (payment.status === PAYMENT_STATUS.CAPTURED && payment.registrationId) {
    const existingReg = await Registration.findById(payment.registrationId);
    const existingBooking = await Booking.findOne({ paymentId: payment._id });
    return {
      success: true,
      payment,
      registration: existingReg,
      booking: existingBooking,
      alreadyProcessed: true
    };
  }

  // 2. Authoritative amount & currency verification against database record
  if (paymentAmount !== undefined && paymentAmount !== null) {
    if (Number(paymentAmount) !== Number(payment.amount)) {
      payment.status = PAYMENT_STATUS.FAILED;
      payment.failureDetails = {
        code: 'AMOUNT_MISMATCH',
        description: `Captured amount ${paymentAmount} paise does not match order amount ${payment.amount} paise`
      };
      await payment.save();
      throw new BadRequestError(`Payment amount mismatch: gateway reported ${paymentAmount} paise, expected ${payment.amount} paise.`);
    }
  }

  if (paymentCurrency) {
    if (paymentCurrency.toUpperCase() !== payment.currency.toUpperCase()) {
      payment.status = PAYMENT_STATUS.FAILED;
      payment.failureDetails = {
        code: 'CURRENCY_MISMATCH',
        description: `Captured currency ${paymentCurrency} does not match order currency ${payment.currency}`
      };
      await payment.save();
      throw new BadRequestError(`Payment currency mismatch: gateway reported ${paymentCurrency}, expected ${payment.currency}.`);
    }
  }

  // 3. Resolve Event
  const event = await Event.findById(payment.eventId);
  if (!event) {
    throw new NotFoundError('Associated event not found.');
  }

  // 4. Resolve Reservation & SeatHold
  const reservation = await SeatReservation.findOne({ orderId: payment.orderId });
  let seatHold = null;

  if (payment.holdId) {
    seatHold = await SeatHold.findById(payment.holdId);
  } else if (reservation?.holdId) {
    seatHold = await SeatHold.findById(reservation.holdId);
  } else {
    // Fallback lookup: active hold for attendee on this event
    seatHold = await SeatHold.findOne({
      eventId: payment.eventId,
      attendeeId: payment.attendeeId,
      status: { $in: [SEAT_HOLD_STATUS.ACTIVE, SEAT_HOLD_STATUS.EXPIRED] }
    }).sort({ createdAt: -1 });
  }

  // 5. Evaluate Seat Availability & Safety Check
  let canConfirmAssignedSeats = false;
  let seatsToClaim = [];

  if (seatHold) {
    seatsToClaim = await EventSeat.find({ _id: { $in: seatHold.seatIds }, eventId: event._id });

    // Check if hold is not expired and all seats are held by this user/hold
    const holdNotExpired =
      seatHold.status === SEAT_HOLD_STATUS.ACTIVE &&
      new Date(seatHold.expiresAt).getTime() > Date.now();

    const allSeatsHeldForUser =
      seatsToClaim.length === seatHold.seatIds.length &&
      seatsToClaim.every((s) => {
        if (
          s.status === SEAT_STATUS.HELD &&
          (s.holdId?.toString() === seatHold._id.toString() ||
            s.heldBy?.toString() === payment.attendeeId.toString())
        ) {
          return true;
        }
        return false;
      });

    if (holdNotExpired && allSeatsHeldForUser) {
      canConfirmAssignedSeats = true;
    } else {
      // Hold expired or reassigned: check if any seat was taken by ANOTHER attendee or blocked
      const seatsTakenByOther = seatsToClaim.some((s) => {
        if (s.status === SEAT_STATUS.BOOKED) return true;
        if (s.status === SEAT_STATUS.BLOCKED) return true;
        if (
          s.status === SEAT_STATUS.HELD &&
          s.heldBy &&
          s.heldBy.toString() !== payment.attendeeId.toString()
        ) {
          if (s.heldUntil && new Date(s.heldUntil).getTime() > Date.now()) return true;
        }
        return false;
      });

      if (seatsTakenByOther) {
        canConfirmAssignedSeats = false;
      } else if (seatsToClaim.length === seatHold.seatIds.length) {
        // Seats are unassigned / available: safe to claim
        canConfirmAssignedSeats = true;
      }
    }
  }

  // If assigned seating event but original seats cannot safely be confirmed:
  if (seatHold && !canConfirmAssignedSeats) {
    logger.warn(
      { orderId: payment.orderId, paymentId, holdId: seatHold._id },
      'Payment captured after hold expired and seats were reassigned. Initiating automated refund.'
    );

    try {
      const refundResult = await initiateRazorpayRefund({
        paymentId,
        amountInPaise: payment.amount,
        notes: { reason: 'Seats reassigned after hold expired' }
      });
      payment.status = PAYMENT_STATUS.REFUND_PENDING;
      payment.refundStatus = REFUND_STATUS.PENDING;
      payment.refundId = refundResult?.id || `rfnd_${Date.now()}`;
      payment.refundAmount = payment.amount;
      payment.refundReason = 'Seats reassigned after hold expired';
    } catch (refundErr) {
      logger.error({ err: refundErr?.message }, 'Auto-refund dispatch failed for reassigned seats');
      payment.refundStatus = REFUND_STATUS.PENDING;
      payment.failureDetails = { code: 'REFUND_DISPATCH_FAILED', description: refundErr?.message };
    }
    await payment.save();
    throw new BadRequestError('Seat hold expired and selected seats were assigned to another attendee. A full refund has been initiated.');
  }

  // 6. Capacity check: if general admission or hold expired
  const isHoldActive =
    reservation &&
    reservation.status === RESERVATION_STATUS.PENDING &&
    new Date(reservation.expiresAt).getTime() > Date.now();
  const seatsNeeded = seatHold ? seatHold.seatIds.length : 1;

  let updatedEvent = null;
  if (isHoldActive) {
    updatedEvent = await Event.findOneAndUpdate(
      { _id: payment.eventId, status: EVENT_STATUS.PUBLISHED },
      { $inc: { seatsBooked: seatsNeeded } },
      { new: true }
    );
  } else {
    updatedEvent = await Event.findOneAndUpdate(
      {
        _id: payment.eventId,
        status: EVENT_STATUS.PUBLISHED,
        $expr: { $lte: [{ $add: ['$seatsBooked', seatsNeeded] }, '$seatLimit'] }
      },
      { $inc: { seatsBooked: seatsNeeded } },
      { new: true }
    );

    if (!updatedEvent) {
      // Sold out: trigger refund
      logger.warn({ orderId: payment.orderId, paymentId }, 'Payment captured but event capacity exceeded. Initiating refund.');
      try {
        const refundResult = await initiateRazorpayRefund({
          paymentId,
          amountInPaise: payment.amount,
          notes: { reason: 'Capacity exceeded after hold expired' }
        });
        payment.status = PAYMENT_STATUS.REFUND_PENDING;
        payment.refundStatus = REFUND_STATUS.PENDING;
        payment.refundId = refundResult?.id || `rfnd_${Date.now()}`;
        payment.refundAmount = payment.amount;
        payment.refundReason = 'Capacity exceeded after hold expired';
      } catch (refundErr) {
        logger.error({ err: refundErr?.message }, 'Auto-refund dispatch failed for capacity exceeded');
        payment.refundStatus = REFUND_STATUS.PENDING;
        payment.failureDetails = { code: 'REFUND_DISPATCH_FAILED', description: refundErr?.message };
      }
      await payment.save();
      throw new BadRequestError('Reservation expired and event is now sold out. A full refund has been initiated.');
    }
  }

  // 7. Execute durable state updates within transaction where supported
  return withTransaction(async (session) => {
    // A. Update Payment to CAPTURED
    payment.status = PAYMENT_STATUS.CAPTURED;
    payment.paymentId = paymentId;
    payment.method = paymentMethod || payment.method || 'online';

    // B. Update Reservation to CONFIRMED
    if (reservation) {
      reservation.status = RESERVATION_STATUS.CONFIRMED;
      await reservation.save(session ? { session } : {});
    }

    // C. Create Confirmed Registration
    const [registration] = await Registration.create(
      [
        {
          eventId: payment.eventId,
          attendeeId: payment.attendeeId,
          paymentId: payment._id,
          isPaid: true,
          ticketPrice: payment.amount / 100,
          currency: payment.currency,
          status: REGISTRATION_STATUS.CONFIRMED,
          confirmationEmailSent: false
        }
      ],
      session ? { session } : {}
    );

    payment.registrationId = registration._id;
    await payment.save(session ? { session } : {});

    // D. If assigned seating, confirm Booking and transition EventSeat records to BOOKED
    let booking = null;
    if (seatHold && canConfirmAssignedSeats) {
      booking = await confirmBookingFromHold({
        holdId: seatHold._id,
        attendeeId: payment.attendeeId,
        paymentId: payment._id,
        isPaid: true,
        session
      });
      booking.registrationId = registration._id;
      await booking.save(session ? { session } : {});
    }

    return { payment, registration, booking };
  }).then(async (result) => {
    // 8. Post-confirmation Notifications & Audit (non-blocking)
    try {
      const attendeeUser = await User.findById(payment.attendeeId).select('name email');
      if (attendeeUser && attendeeUser.email) {
        sendRegistrationConfirmationEmail({
          registrationId: result.registration._id.toString(),
          attendee: { name: attendeeUser.name, email: attendeeUser.email },
          event: updatedEvent || event
        }).catch(() => {});
      }

      dispatchNotification({
        userId: payment.attendeeId,
        type: NOTIFICATION_TYPE.BOOKING_CONFIRMED,
        title: 'Booking Confirmed!',
        message: `Payment confirmed for "${(updatedEvent || event).title}". Your seat is reserved.`,
        eventId: payment.eventId,
        registrationId: result.registration._id
      });

      await logAuditEvent({
        action: source === 'WEBHOOK' ? 'PAYMENT_CAPTURED_VIA_WEBHOOK' : 'PAYMENT_CAPTURED_AND_BOOKING_CONFIRMED',
        actorId: payment.attendeeId,
        actorRole: 'ATTENDEE',
        resourceId: payment._id,
        resourceType: 'Payment',
        ipAddress,
        userAgent,
        details: {
          orderId: payment.orderId,
          paymentId,
          registrationId: result.registration._id,
          bookingId: result.booking?._id,
          amount: payment.amount,
          source
        }
      });
    } catch (notifErr) {
      logger.warn({ err: notifErr?.message }, 'Notification dispatch failed safely for paid booking');
    }

    return {
      success: true,
      payment: result.payment,
      registration: result.registration,
      booking: result.booking
    };
  });
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

  // Strict Production Check: Reject simulated signatures and mock orders in production
  if (
    process.env.NODE_ENV === 'production' &&
    (signature === 'simulated_test_signature' || (typeof orderId === 'string' && orderId.startsWith('order_mock_')))
  ) {
    throw new BadRequestError('Security Violation: Simulated payments are not permitted in production.');
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

  // 3. Delegate to the single authoritative confirmation service
  return confirmCapturedPayment({
    payment,
    paymentId,
    paymentMethod: rzpPayment?.method || payment.method,
    paymentAmount: rzpPayment?.amount,
    paymentCurrency: rzpPayment?.currency,
    ipAddress,
    userAgent,
    source: 'CLIENT_CALLBACK'
  });
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

let isRefundReconciliationRunning = false;

/**
 * Reconciles pending refund operations across the platform.
 * Concurrency-safe: skips sweep if an active reconciliation is in flight.
 * Checks authoritative state on Razorpay before initiating any retry.
 */
export async function reconcilePendingRefunds() {
  if (isRefundReconciliationRunning) {
    logger.info('Refund reconciliation sweep already in progress. Skipping overlapping execution.');
    return { status: 'in_progress', reconciledCount: 0 };
  }

  isRefundReconciliationRunning = true;
  let reconciledCount = 0;
  let failedCount = 0;

  try {
    const pendingOps = await RefundOperation.find({
      status: { $in: ['INITIATED', 'PENDING'] },
      $or: [
        { nextRetryAt: null },
        { nextRetryAt: { $lte: new Date() } }
      ]
    }).limit(20);

    for (const op of pendingOps) {
      try {
        // Enforce maximum retry limit to avoid infinite loops
        if (op.retryCount >= op.maxRetries) {
          op.status = 'MANUAL_RECONCILIATION_REQUIRED';
          op.lastError = 'Maximum retry limit exceeded. Flagged for manual review.';
          await op.save();
          continue;
        }

        // Authoritative query against Razorpay to see if payment was already refunded
        const rzpPayment = await fetchRazorpayPayment(op.gatewayPaymentId);

        // If Razorpay already reports payment as refunded:
        if (rzpPayment && (rzpPayment.amount_refunded >= op.amount || rzpPayment.refund_status === 'full')) {
          op.status = 'PROCESSED';
          await op.save();

          await Payment.findByIdAndUpdate(op.paymentId, {
            status: PAYMENT_STATUS.REFUNDED,
            refundStatus: REFUND_STATUS.PROCESSED,
            refundAmount: rzpPayment.amount_refunded || op.amount
          });

          await Registration.findByIdAndUpdate(op.registrationId, {
            refundStatus: REFUND_STATUS.PROCESSED
          });

          reconciledCount++;
          continue;
        }

        // If payment was not refunded and operation is INITIATED or PENDING, attempt safe dispatch
        const refundResult = await initiateRazorpayRefund({
          paymentId: op.gatewayPaymentId,
          amountInPaise: op.amount,
          notes: {
            refundOpId: op.refundOpId,
            registrationId: op.registrationId.toString(),
            reconciled: 'true'
          }
        });

        op.status = 'PENDING';
        op.gatewayRefundId = refundResult?.id || op.gatewayRefundId;
        op.lastAttemptAt = new Date();
        await op.save();

        if (refundResult?.id) {
          await Payment.findByIdAndUpdate(op.paymentId, {
            refundId: refundResult.id,
            status: PAYMENT_STATUS.REFUND_PENDING,
            refundStatus: REFUND_STATUS.PENDING
          });
        }

        reconciledCount++;
      } catch (opErr) {
        logger.error(
          { err: opErr?.message, refundOpId: op.refundOpId },
          'Error during refund operation reconciliation attempt'
        );
        op.retryCount += 1;
        op.lastError = opErr?.message || 'Reconciliation failed';
        // Exponential backoff
        op.nextRetryAt = new Date(Date.now() + Math.pow(2, op.retryCount) * 60000);
        await op.save();
        failedCount++;
      }
    }
  } finally {
    isRefundReconciliationRunning = false;
  }

  logger.info({ reconciledCount, failedCount }, 'Completed refund reconciliation sweep');
  return { reconciledCount, failedCount };
}


