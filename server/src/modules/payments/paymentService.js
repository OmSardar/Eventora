import mongoose from 'mongoose';
import { Payment } from './Payment.js';
import { SeatReservation } from './SeatReservation.js';
import { Event } from '../events/Event.js';
import { Registration } from '../registrations/Registration.js';
import {
  EVENT_STATUS,
  PAYMENT_STATUS,
  REFUND_STATUS,
  RESERVATION_STATUS,
  REGISTRATION_STATUS,
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
  initiateRazorpayRefund
} from './razorpayService.js';
import { dispatchNotification } from '../notifications/notificationService.js';
import { logAuditEvent } from '../audit/AuditLog.js';
import { logger } from '../../infrastructure/logging/logger.js';

/**
 * Creates an authoritative Razorpay order and holds a temporary seat reservation.
 */
export async function createCheckoutOrder({
  eventId,
  attendeeId,
  ipAddress,
  userAgent
}) {
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    throw new BadRequestError('Invalid event ID format.');
  }

  // 1. Verify Event exists and is eligible
  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  if (event.status !== EVENT_STATUS.PUBLISHED) {
    throw new BadRequestError('Cannot purchase tickets for an unpublished or cancelled event.');
  }

  if (new Date(event.eventDate).getTime() <= Date.now()) {
    throw new BadRequestError('Cannot purchase tickets for a past event.');
  }

  if (!event.isPaid || !event.ticketPrice || event.ticketPrice <= 0) {
    throw new BadRequestError('This is a free event. Please use standard RSVP.');
  }

  // 2. Prevent duplicate confirmed registration
  const existingRegistration = await Registration.findOne({
    eventId: new mongoose.Types.ObjectId(eventId),
    attendeeId: new mongoose.Types.ObjectId(attendeeId),
    status: { $ne: REGISTRATION_STATUS.CANCELLED }
  });

  if (existingRegistration) {
    throw new ConflictError('You are already registered for this event.');
  }

  // 3. Clean up any prior expired reservations for this attendee on this event
  const priorExpired = await SeatReservation.find({
    eventId: new mongoose.Types.ObjectId(eventId),
    attendeeId: new mongoose.Types.ObjectId(attendeeId),
    status: RESERVATION_STATUS.PENDING,
    expiresAt: { $lt: new Date() }
  });

  for (const exp of priorExpired) {
    exp.status = RESERVATION_STATUS.EXPIRED;
    await exp.save();
    await Event.findByIdAndUpdate(eventId, { $inc: { seatsBooked: -1 } });
  }

  // 4. Atomically hold a seat reservation
  const updatedEvent = await Event.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(eventId),
      status: EVENT_STATUS.PUBLISHED,
      eventDate: { $gt: new Date() },
      $expr: { $lt: ['$seatsBooked', '$seatLimit'] }
    },
    { $inc: { seatsBooked: 1 } },
    { new: true }
  );

  if (!updatedEvent) {
    throw new BadRequestError('Event is sold out. No seats remaining.');
  }

  const amountInPaise = Math.round(event.ticketPrice * 100);
  const idempotencyKey = `ord_${attendeeId}_${eventId}_${Date.now()}`;

  let razorpayOrder;
  try {
    razorpayOrder = await createRazorpayOrder({
      amountInPaise,
      receipt: idempotencyKey,
      notes: {
        eventId: eventId.toString(),
        attendeeId: attendeeId.toString(),
        eventTitle: event.title
      }
    });
  } catch (err) {
    // Roll back held seat if Razorpay order creation fails
    await Event.findByIdAndUpdate(eventId, { $inc: { seatsBooked: -1 } });
    logger.error({ err: err?.message, eventId }, 'Failed to create Razorpay order');
    throw new BadRequestError('Failed to initialize payment gateway order. Please try again.');
  }

  const ttlMinutes = Number(process.env.PAYMENT_RESERVATION_TTL_MINUTES) || 10;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  // 5. Persist Seat Reservation Hold
  const reservation = await SeatReservation.create({
    eventId: new mongoose.Types.ObjectId(eventId),
    attendeeId: new mongoose.Types.ObjectId(attendeeId),
    orderId: razorpayOrder.id,
    status: RESERVATION_STATUS.PENDING,
    expiresAt
  });

  // 6. Persist Payment Record
  const payment = await Payment.create({
    attendeeId: new mongoose.Types.ObjectId(attendeeId),
    eventId: new mongoose.Types.ObjectId(eventId),
    orderId: razorpayOrder.id,
    amount: amountInPaise,
    currency: event.currency || 'INR',
    status: PAYMENT_STATUS.ORDER_CREATED,
    idempotencyKey
  });

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
      eventId,
      expiresAt
    }
  });

  return {
    keyId: process.env.RAZORPAY_KEY_ID || 'mock_key_id',
    orderId: razorpayOrder.id,
    amount: amountInPaise,
    currency: event.currency || 'INR',
    expiresAt: reservation.expiresAt,
    event: {
      id: event._id,
      title: event.title,
      ticketPrice: event.ticketPrice
    }
  };
}

/**
 * Validates checkout signature and confirms seat booking atomically.
 */
export async function verifyPaymentAndConfirmBooking({
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

  // Strict ownership check: only the buyer can verify their checkout
  if (payment.attendeeId.toString() !== attendeeId.toString()) {
    throw new ForbiddenError('Unauthorized payment verification attempt.');
  }

  // Idempotency: If already captured and confirmed, return existing registration safely
  if (payment.status === PAYMENT_STATUS.CAPTURED && payment.registrationId) {
    const existingReg = await Registration.findById(payment.registrationId).populate('eventId');
    return {
      registration: existingReg,
      payment,
      alreadyConfirmed: true
    };
  }

  // Cryptographic signature check
  const isValid = verifyRazorpaySignature({
    orderId,
    paymentId,
    signature
  });

  if (!isValid) {
    payment.status = PAYMENT_STATUS.FAILED;
    payment.failureDetails = {
      code: 'SIGNATURE_VERIFICATION_FAILED',
      description: 'HMAC-SHA256 signature mismatch'
    };
    await payment.save();

    await logAuditEvent({
      action: 'PAYMENT_VERIFICATION_FAILED',
      actorId: attendeeId,
      actorRole: 'ATTENDEE',
      resourceId: payment._id,
      resourceType: 'Payment',
      ipAddress,
      userAgent,
      details: { orderId, paymentId }
    });

    throw new BadRequestError('Payment signature verification failed. Untrusted payment details.');
  }

  // Check seat reservation hold status
  const reservation = await SeatReservation.findOne({ orderId });

  if (reservation && reservation.status === RESERVATION_STATUS.EXPIRED) {
    // Reservation expired before callback arrived! Attempt to re-allocate capacity safely:
    const reallocated = await Event.findOneAndUpdate(
      {
        _id: payment.eventId,
        status: EVENT_STATUS.PUBLISHED,
        $expr: { $lt: ['$seatsBooked', '$seatLimit'] }
      },
      { $inc: { seatsBooked: 1 } },
      { new: true }
    );

    if (!reallocated) {
      // Event is sold out! Trigger immediate automatic refund:
      logger.warn({ orderId, paymentId }, 'Paid for expired reservation and event is sold out. Initiating automatic refund.');
      try {
        const refundRes = await initiateRazorpayRefund({
          paymentId,
          amountInPaise: payment.amount,
          notes: { reason: 'Reservation expired and event capacity full' }
        });
        payment.status = PAYMENT_STATUS.REFUND_PENDING;
        payment.refundStatus = REFUND_STATUS.PENDING;
        payment.refundId = refundRes.id;
        await payment.save();
      } catch (refundErr) {
        logger.error({ err: refundErr?.message }, 'Failed to initiate auto-refund for expired checkout');
      }

      throw new BadRequestError(
        'Seat reservation hold expired and the event is now sold out. A full refund has been initiated to your account.'
      );
    }
  }

  // Update payment and reservation
  payment.status = PAYMENT_STATUS.CAPTURED;
  payment.paymentId = paymentId;
  await payment.save();

  if (reservation) {
    reservation.status = RESERVATION_STATUS.CONFIRMED;
    await reservation.save();
  }

  // Create confirmed registration (seat was already held upon order creation)
  const registration = await Registration.create({
    eventId: payment.eventId,
    attendeeId: payment.attendeeId,
    paymentId: payment._id,
    isPaid: true,
    ticketPrice: payment.amount / 100,
    currency: payment.currency,
    status: REGISTRATION_STATUS.CONFIRMED
  });

  payment.registrationId = registration._id;
  await payment.save();

  const event = await Event.findById(payment.eventId);

  // Trigger transactional notifications asynchronously
  dispatchNotification({
    userId: attendeeId,
    type: NOTIFICATION_TYPE.BOOKING_CONFIRMED,
    title: 'Booking Confirmed!',
    message: `Your seat for "${event?.title || 'Event'}" has been secured. Payment of ₹${payment.amount / 100} confirmed.`,
    eventId: payment.eventId,
    registrationId: registration._id,
    paymentId: payment._id,
    variables: { eventTitle: event?.title || 'Event', amount: `₹${payment.amount / 100}` }
  });

  if (event?.organizerId) {
    dispatchNotification({
      userId: event.organizerId,
      type: NOTIFICATION_TYPE.PAYMENT_SUCCESS,
      title: 'New Paid Booking',
      message: `A new ticket was purchased for "${event.title}". Revenue: ₹${payment.amount / 100}.`,
      eventId: event._id,
      registrationId: registration._id,
      paymentId: payment._id
    });
  }

  await logAuditEvent({
    action: 'PAYMENT_CAPTURED_AND_BOOKING_CONFIRMED',
    actorId: attendeeId,
    actorRole: 'ATTENDEE',
    resourceId: registration._id,
    resourceType: 'Registration',
    ipAddress,
    userAgent,
    details: { orderId, paymentId, amountInPaise: payment.amount }
  });

  return {
    registration,
    payment
  };
}

/**
 * Initiates an authoritative Razorpay refund upon organizer cancellation approval.
 */
export async function processRefundForCancellation({
  registrationId,
  organizerId,
  ipAddress,
  userAgent
}) {
  const registration = await Registration.findById(registrationId).populate('eventId');
  if (!registration) {
    throw new NotFoundError('Registration not found.');
  }

  if (!registration.eventId) {
    throw new NotFoundError('Associated event not found.');
  }

  // Strict ownership check: only the event's organizer can approve refund
  if (registration.eventId.organizerId.toString() !== organizerId.toString()) {
    throw new ForbiddenError('Unauthorized refund management attempt.');
  }

  if (!registration.isPaid || !registration.paymentId) {
    throw new BadRequestError('Registration is not a paid booking. No refund required.');
  }

  const payment = await Payment.findById(registration.paymentId);
  if (!payment) {
    throw new NotFoundError('Payment transaction record not found.');
  }

  if (payment.refundStatus === REFUND_STATUS.PROCESSED || payment.status === PAYMENT_STATUS.REFUNDED) {
    throw new ConflictError('This transaction has already been refunded.');
  }

  if (payment.status !== PAYMENT_STATUS.CAPTURED) {
    throw new BadRequestError(`Cannot refund payment with status ${payment.status}.`);
  }

  let refundRes;
  try {
    refundRes = await initiateRazorpayRefund({
      paymentId: payment.paymentId,
      amountInPaise: payment.amount,
      notes: {
        registrationId: registration._id.toString(),
        cancellationReason: registration.cancellationReason || 'Organizer approved cancellation'
      }
    });
  } catch (err) {
    logger.error({ err: err?.message, paymentId: payment.paymentId }, 'Razorpay refund API call failed');
    throw new BadRequestError(`Failed to process gateway refund: ${err.message}`);
  }

  payment.status = PAYMENT_STATUS.REFUND_PENDING;
  payment.refundStatus = REFUND_STATUS.PENDING;
  payment.refundId = refundRes.id;
  payment.refundAmount = payment.amount;
  payment.refundReason = registration.cancellationReason || 'Organizer approved cancellation';
  await payment.save();

  // If refund is instantly processed by provider
  if (refundRes.status === 'processed') {
    payment.status = PAYMENT_STATUS.REFUNDED;
    payment.refundStatus = REFUND_STATUS.PROCESSED;
    await payment.save();

    registration.status = REGISTRATION_STATUS.CANCELLED;
    registration.refundStatus = REFUND_STATUS.PROCESSED;
    await registration.save();

    // Release capacity atomically
    await Event.findByIdAndUpdate(registration.eventId._id, {
      $inc: { seatsBooked: -1 }
    });
  } else {
    registration.refundStatus = REFUND_STATUS.PENDING;
    await registration.save();
  }

  // Notify attendee
  dispatchNotification({
    userId: registration.attendeeId,
    type: NOTIFICATION_TYPE.REFUND_PROCESSED,
    title: 'Refund Processed',
    message: `Your cancellation request was approved. A refund of ₹${payment.amount / 100} has been issued.`,
    eventId: registration.eventId._id,
    registrationId: registration._id,
    paymentId: payment._id,
    variables: { amount: `₹${payment.amount / 100}`, refundId: refundRes.id }
  });

  await logAuditEvent({
    action: 'REFUND_INITIATED',
    actorId: organizerId,
    actorRole: 'ORGANIZER',
    resourceId: payment._id,
    resourceType: 'Payment',
    ipAddress,
    userAgent,
    details: { refundId: refundRes.id, amountInPaise: payment.amount }
  });

  return {
    registration,
    payment,
    refund: refundRes
  };
}

/**
 * Administrative reconciliation process to clean up expired holds and release capacity.
 */
export async function reconcileExpiredReservations() {
  const expiredHolds = await SeatReservation.find({
    status: RESERVATION_STATUS.PENDING,
    expiresAt: { $lt: new Date() }
  });

  let releasedCount = 0;
  for (const hold of expiredHolds) {
    // Check if payment was captured
    const payment = await Payment.findOne({ orderId: hold.orderId });
    if (!payment || payment.status !== PAYMENT_STATUS.CAPTURED) {
      hold.status = RESERVATION_STATUS.EXPIRED;
      await hold.save();

      // Release seat capacity
      await Event.findByIdAndUpdate(hold.eventId, { $inc: { seatsBooked: -1 } });

      if (payment && payment.status === PAYMENT_STATUS.ORDER_CREATED) {
        payment.status = PAYMENT_STATUS.FAILED;
        payment.failureDetails = {
          code: 'ORDER_EXPIRED',
          description: 'Payment window expired before checkout completion'
        };
        await payment.save();
      }

      releasedCount++;
    }
  }

  return { expiredFound: expiredHolds.length, seatsReleased: releasedCount };
}

/**
 * Generates an administrative reconciliation report.
 */
export async function getPaymentReconciliationReport() {
  const [
    totalPayments,
    capturedCount,
    failedCount,
    refundedCount,
    pendingRefunds,
    activeHolds
  ] = await Promise.all([
    Payment.countDocuments(),
    Payment.countDocuments({ status: PAYMENT_STATUS.CAPTURED }),
    Payment.countDocuments({ status: PAYMENT_STATUS.FAILED }),
    Payment.countDocuments({ status: PAYMENT_STATUS.REFUNDED }),
    Payment.find({ refundStatus: REFUND_STATUS.PENDING }).lean(),
    SeatReservation.find({ status: RESERVATION_STATUS.PENDING }).lean()
  ]);

  return {
    metrics: {
      totalPayments,
      capturedCount,
      failedCount,
      refundedCount,
      pendingRefundCount: pendingRefunds.length,
      activeHoldCount: activeHolds.length
    },
    pendingRefunds,
    activeHolds
  };
}
