import crypto from 'crypto';
import mongoose from 'mongoose';
import { Registration } from './Registration.js';
import { Event } from '../events/Event.js';
import { User } from '../users/User.js';
import { Payment } from '../payments/Payment.js';
import { RefundOperation } from '../payments/RefundOperation.js';
import {
  EVENT_STATUS,
  REGISTRATION_STATUS,
  NOTIFICATION_TYPE,
  PAYMENT_STATUS,
  REFUND_STATUS
} from '../../shared/constants/status.js';
import { initiateRazorpayRefund } from '../payments/razorpayService.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError
} from '../../shared/errors/AppError.js';
import { logAuditEvent } from '../audit/AuditLog.js';
import { dispatchNotification } from '../notifications/notificationService.js';
import { sendRegistrationConfirmationEmail } from '../../infrastructure/email/emailService.js';
import { logger } from '../../infrastructure/logging/logger.js';

function canUseReplicaSetTransactions() {
  const topologyType = mongoose.connection?.client?.topology?.description?.type;
  return topologyType === 'ReplicaSet' || topologyType === 'Sharded';
}

/**
 * Registers an attendee for an event with atomic capacity guarantee.
 * After the registration is successfully persisted, triggers a confirmation email via Resend.
 */
export async function registerForEvent({
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

  // 2. Business rule: Event must be published
  if (event.status !== EVENT_STATUS.PUBLISHED) {
    throw new BadRequestError('Cannot register for a cancelled or unpublished event.');
  }

  // 3. Business rule: Event must be in the future
  if (new Date(event.eventDate).getTime() <= Date.now()) {
    throw new BadRequestError('Cannot register for a past event.');
  }

  // 4. Business rule: Event must be free for direct RSVP endpoint
  if (event.isPaid && event.ticketPrice > 0) {
    throw new BadRequestError('This is a paid event. Please complete booking through Razorpay checkout.');
  }

  // 5. Check if attendee is already registered
  const existingRegistration = await Registration.findOne({
    eventId: new mongoose.Types.ObjectId(eventId),
    attendeeId: new mongoose.Types.ObjectId(attendeeId)
  });

  if (existingRegistration) {
    throw new ConflictError('You are already registered for this event.');
  }

  // 5. Atomic seat reservation
  const useReplicaSet = canUseReplicaSetTransactions();
  let session = null;
  let seatAllocated = false;
  let registration = null;

  if (useReplicaSet) {
    session = await mongoose.startSession();
    session.startTransaction();
  }

  let updatedEvent = null;

  try {
    // Atomically reserve seat ONLY if seatsBooked < seatLimit
    updatedEvent = await Event.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(eventId),
        status: EVENT_STATUS.PUBLISHED,
        eventDate: { $gt: new Date() },
        $expr: { $lt: ['$seatsBooked', '$seatLimit'] }
      },
      { $inc: { seatsBooked: 1 } },
      { new: true, session: session || undefined }
    );

    if (!updatedEvent) {
      throw new BadRequestError('Event is sold out. No seats remaining.');
    }
    seatAllocated = true;

    // Insert registration
    if (useReplicaSet) {
      const [newReg] = await Registration.create(
        [
          {
            eventId: new mongoose.Types.ObjectId(eventId),
            attendeeId: new mongoose.Types.ObjectId(attendeeId),
            status: REGISTRATION_STATUS.CONFIRMED,
            confirmationEmailSent: false
          }
        ],
        { session }
      );
      registration = newReg;
      await session.commitTransaction();
    } else {
      registration = await Registration.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        attendeeId: new mongoose.Types.ObjectId(attendeeId),
        status: REGISTRATION_STATUS.CONFIRMED,
        confirmationEmailSent: false
      });
    }

    await logAuditEvent({
      action: 'EVENT_REGISTRATION_CREATED',
      actorId: attendeeId,
      actorRole: 'ATTENDEE',
      resourceId: registration._id,
      resourceType: 'Registration',
      ipAddress,
      userAgent,
      details: { eventId, eventTitle: updatedEvent.title }
    });
  } catch (error) {
    if (useReplicaSet && session) {
      try {
        await session.abortTransaction();
      } catch (_) {}
    } else if (seatAllocated && !registration) {
      // Roll back seat allocation on standalone or non-transactional instance
      try {
        await Event.findByIdAndUpdate(eventId, { $inc: { seatsBooked: -1 } });
      } catch (_) {}
    }

    if (error.code === 11000) {
      throw new ConflictError('You are already registered for this event.');
    }
    throw error;
  } finally {
    if (session) {
      session.endSession();
    }
  }

  // 6. Post-persistence notification & Resend email confirmation
  // Executed strictly after successful registration persistence and outside of transaction
  try {
    const attendeeUser = await User.findById(attendeeId).select('name email');

    // Trigger transactional confirmation email via Resend
    if (attendeeUser && attendeeUser.email) {
      sendRegistrationConfirmationEmail({
        registrationId: registration._id.toString(),
        attendee: {
          name: attendeeUser.name,
          email: attendeeUser.email
        },
        event: updatedEvent
      }).catch((emailErr) => {
        logger.error(
          { err: emailErr?.message, registrationId: registration._id },
          'Non-blocking confirmation email delivery failed'
        );
      });
    }

    // In-app alert for attendee
    dispatchNotification({
      userId: attendeeId,
      type: NOTIFICATION_TYPE.BOOKING_CONFIRMED,
      title: 'Booking Confirmed!',
      message: `Your seat for "${updatedEvent.title}" has been confirmed. A confirmation email has been scheduled.`,
      eventId: updatedEvent._id,
      registrationId: registration._id
    });
  } catch (notificationErr) {
    // Non-blocking: registration is already safely committed
    logger.warn({ err: notificationErr?.message }, 'Post-registration notification dispatch failed safely');
  }

  return {
    registration,
    event: updatedEvent
  };
}

export async function getAttendeeRegistrations(attendeeId) {
  return Registration.find({ attendeeId: new mongoose.Types.ObjectId(attendeeId) })
    .populate({
      path: 'eventId',
      populate: { path: 'organizerId', select: 'name email' }
    })
    .sort({ createdAt: -1 })
    .lean();
}

export async function getEventAttendees(eventId, organizerId) {
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    throw new BadRequestError('Invalid event ID format.');
  }

  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  // Strict ownership check: organizer can only view attendees of their own events
  if (event.organizerId.toString() !== organizerId.toString()) {
    throw new ForbiddenError('You are not authorized to view attendees for this event.');
  }

  const registrations = await Registration.find({
    eventId: new mongoose.Types.ObjectId(eventId)
  })
    .populate('attendeeId', 'name email createdAt')
    .sort({ createdAt: -1 })
    .lean();

  return {
    event: {
      id: event._id,
      title: event.title,
      eventDate: event.eventDate,
      seatLimit: event.seatLimit,
      seatsBooked: event.seatsBooked,
      remainingSeats: Math.max(0, event.seatLimit - event.seatsBooked)
    },
    attendees: registrations.map((r) => ({
      registrationId: r._id,
      status: r.status,
      registeredAt: r.createdAt,
      attendee: r.attendeeId
        ? {
            id: r.attendeeId._id,
            name: r.attendeeId.name,
            email: r.attendeeId.email
          }
        : null,
      cancellationReason: r.cancellationReason
    }))
  };
}

export async function requestCancellation({
  registrationId,
  attendeeId,
  reason,
  ipAddress,
  userAgent
}) {
  if (!mongoose.Types.ObjectId.isValid(registrationId)) {
    throw new BadRequestError('Invalid registration ID format.');
  }

  const registration = await Registration.findById(registrationId);
  if (!registration) {
    throw new NotFoundError('Registration not found.');
  }

  // Strict ownership check: attendee can only cancel their own registration
  if (registration.attendeeId.toString() !== attendeeId.toString()) {
    throw new ForbiddenError('You are not authorized to cancel this registration.');
  }

  if (registration.status === REGISTRATION_STATUS.CANCELLED) {
    throw new BadRequestError('Registration is already cancelled.');
  }

  if (registration.status === REGISTRATION_STATUS.CANCELLATION_REQUESTED) {
    throw new ConflictError('A cancellation request is already pending approval.');
  }

  registration.status = REGISTRATION_STATUS.CANCELLATION_REQUESTED;
  registration.cancellationReason = reason || 'Attendee requested cancellation';
  await registration.save();

  const event = await Event.findById(registration.eventId);
  if (event && event.organizerId) {
    dispatchNotification({
      userId: event.organizerId,
      type: NOTIFICATION_TYPE.CANCELLATION_REQUESTED,
      title: 'Cancellation Request Received',
      message: `An attendee has requested cancellation for "${event.title}".`,
      eventId: event._id,
      registrationId: registration._id
    });
  }

  await logAuditEvent({
    action: 'CANCELLATION_REQUESTED',
    actorId: attendeeId,
    actorRole: 'ATTENDEE',
    resourceId: registration._id,
    resourceType: 'Registration',
    ipAddress,
    userAgent,
    details: { reason }
  });

  return registration;
}

export async function processCancellationDecision({
  registrationId,
  organizerId,
  decision, // 'APPROVE' or 'REJECT'
  note,
  ipAddress,
  userAgent
}) {
  if (!mongoose.Types.ObjectId.isValid(registrationId)) {
    throw new BadRequestError('Invalid registration ID format.');
  }

  const registration = await Registration.findById(registrationId).populate('eventId');
  if (!registration) {
    throw new NotFoundError('Registration not found.');
  }

  if (!registration.eventId) {
    throw new NotFoundError('Associated event not found.');
  }

  // Strict ownership check: only the event's organizer can approve/reject
  if (registration.eventId.organizerId.toString() !== organizerId.toString()) {
    throw new ForbiddenError('You are not authorized to manage cancellation requests for this event.');
  }

  if (registration.status !== REGISTRATION_STATUS.CANCELLATION_REQUESTED) {
    throw new BadRequestError(`Cannot decide on registration with status ${registration.status}.`);
  }

  if (decision === 'APPROVE') {
    registration.status = REGISTRATION_STATUS.CANCELLED;
    registration.decisionNote = note || 'Cancellation approved by organizer';
    registration.decidedBy = new mongoose.Types.ObjectId(organizerId);
    registration.decidedAt = new Date();

    // 1. Atomic seat release guarantee: exactly once across cancellation & webhooks
    const seatClaimed = await Registration.findOneAndUpdate(
      {
        _id: registration._id,
        seatReleased: { $ne: true }
      },
      {
        $set: {
          seatReleased: true,
          seatReleasedAt: new Date()
        }
      },
      { new: true }
    );

    if (seatClaimed) {
      await Event.findOneAndUpdate(
        { _id: registration.eventId._id, seatsBooked: { $gt: 0 } },
        { $inc: { seatsBooked: -1 } }
      );
    }

    // 2. If paid registration, create durable refund operation and initiate Razorpay refund
    if (registration.isPaid && registration.paymentId) {
      const payment = await Payment.findById(registration.paymentId);
      if (payment && payment.status === PAYMENT_STATUS.CAPTURED && payment.refundStatus !== REFUND_STATUS.PROCESSED) {
        const idempotencyKey = `refund_reg_${registration._id}`;
        let refundOp = await RefundOperation.findOne({ idempotencyKey });

        if (!refundOp) {
          try {
            refundOp = await RefundOperation.create({
              refundOpId: `rfop_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
              paymentId: payment._id,
              registrationId: registration._id,
              eventId: registration.eventId._id,
              attendeeId: registration.attendeeId,
              organizerId: new mongoose.Types.ObjectId(organizerId),
              orderId: payment.orderId,
              gatewayPaymentId: payment.paymentId,
              amount: payment.amount,
              currency: payment.currency || 'INR',
              reason: note || 'Organizer approved cancellation',
              status: 'INITIATED',
              idempotencyKey,
              lastAttemptAt: new Date()
            });
          } catch (dupErr) {
            if (dupErr.code === 11000) {
              refundOp = await RefundOperation.findOne({ idempotencyKey });
            } else {
              throw dupErr;
            }
          }
        }

        // Transition to REFUND_PENDING and PENDING before provider dispatch
        payment.status = PAYMENT_STATUS.REFUND_PENDING;
        payment.refundStatus = REFUND_STATUS.PENDING;
        payment.refundAmount = payment.amount;
        payment.refundReason = note || 'Organizer approved cancellation';
        await payment.save();

        registration.refundStatus = REFUND_STATUS.PENDING;

        // If not already processed, dispatch refund request to Razorpay API
        if (refundOp && refundOp.status !== 'PROCESSED') {
          try {
            const refundResult = await initiateRazorpayRefund({
              paymentId: payment.paymentId,
              amountInPaise: payment.amount,
              notes: {
                refundOpId: refundOp.refundOpId,
                registrationId: registration._id.toString(),
                reason: note || 'Organizer approved cancellation'
              }
            });

            refundOp.status = 'PENDING';
            refundOp.gatewayRefundId = refundResult?.id || null;
            refundOp.lastAttemptAt = new Date();
            await refundOp.save();

            if (refundResult?.id) {
              payment.refundId = refundResult.id;
              await payment.save();
            }
          } catch (refundErr) {
            logger.error(
              { err: refundErr?.message, registrationId: registration._id, refundOpId: refundOp?.refundOpId },
              'Razorpay refund API call failed on cancellation approval'
            );
            refundOp.status = 'FAILED';
            refundOp.retryCount += 1;
            refundOp.lastError = refundErr?.message || 'Gateway error';
            refundOp.nextRetryAt = new Date(Date.now() + 60000);
            refundOp.failureDetails = {
              code: 'GATEWAY_ERROR',
              description: refundErr?.message
            };
            await refundOp.save();

            payment.failureDetails = {
              code: 'REFUND_DISPATCH_FAILED',
              description: refundErr?.message
            };
            await payment.save();
          }
        }
      }
    }

    await registration.save();

    dispatchNotification({
      userId: registration.attendeeId,
      type: NOTIFICATION_TYPE.CANCELLATION_APPROVED,
      title: 'Cancellation Approved',
      message: `Your cancellation request for "${registration.eventId.title || 'Event'}" has been approved.`,
      eventId: registration.eventId._id,
      registrationId: registration._id
    });

    await logAuditEvent({
      action: 'CANCELLATION_APPROVED',
      actorId: organizerId,
      actorRole: 'ORGANIZER',
      resourceId: registration._id,
      resourceType: 'Registration',
      ipAddress,
      userAgent,
      details: { decision: 'APPROVE', note }
    });
  } else {
    registration.status = REGISTRATION_STATUS.CONFIRMED;
    registration.decisionNote = note || 'Cancellation rejected by organizer';
    registration.decidedBy = new mongoose.Types.ObjectId(organizerId);
    registration.decidedAt = new Date();
    await registration.save();

    dispatchNotification({
      userId: registration.attendeeId,
      type: NOTIFICATION_TYPE.CANCELLATION_REJECTED,
      title: 'Cancellation Declined',
      message: `Your cancellation request for "${registration.eventId.title || 'Event'}" was not approved. Note: ${note || 'No reason specified.'}`,
      eventId: registration.eventId._id,
      registrationId: registration._id
    });

    await logAuditEvent({
      action: 'CANCELLATION_REJECTED',
      actorId: organizerId,
      actorRole: 'ORGANIZER',
      resourceId: registration._id,
      resourceType: 'Registration',
      ipAddress,
      userAgent,
      details: { decision: 'REJECT', note }
    });
  }

  return registration;
}

export async function getPendingCancellationRequestsForOrganizer(organizerId) {
  const events = await Event.find({ organizerId: new mongoose.Types.ObjectId(organizerId) }).select('_id');
  const eventIds = events.map((e) => e._id);

  return Registration.find({
    eventId: { $in: eventIds },
    status: REGISTRATION_STATUS.CANCELLATION_REQUESTED
  })
    .populate('eventId', 'title eventDate venue')
    .populate('attendeeId', 'name email')
    .sort({ updatedAt: -1 })
    .lean();
}
