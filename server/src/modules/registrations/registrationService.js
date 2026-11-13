import crypto from 'crypto';
import mongoose from 'mongoose';
import { Registration } from './Registration.js';
import { Event } from '../events/Event.js';
import { User } from '../users/User.js';
import { Payment } from '../payments/Payment.js';
import { RefundOperation } from '../payments/RefundOperation.js';
import { Booking } from '../bookings/Booking.js';
import { generateSignedTicketToken } from '../bookings/ticketCrypto.js';
import { EventSeat } from '../seating/EventSeat.js';
import {
  EVENT_STATUS,
  REGISTRATION_STATUS,
  NOTIFICATION_TYPE,
  PAYMENT_STATUS,
  REFUND_STATUS,
  BOOKING_STATUS,
  SEAT_STATUS
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
import {
  sendRegistrationConfirmationEmail,
  sendCancellationRefundEmail
} from '../../infrastructure/email/emailService.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { generateEventIcs } from '../../shared/utils/icsGenerator.js';

function canUseReplicaSetTransactions() {
  const topologyType = mongoose.connection?.client?.topology?.description?.type;
  return topologyType === 'ReplicaSet' || topologyType === 'Sharded';
}

/**
 * Registers an attendee for an event with atomic capacity guarantee.
 * After the registration is successfully persisted, triggers a confirmation email via Resend.
 */
// export async function registerForEvent({
//   eventId,
//   attendeeId,
//   ipAddress,
//   userAgent
// }) {
//   if (!mongoose.Types.ObjectId.isValid(eventId)) {
//     throw new BadRequestError('Invalid event ID format.');
//   }

//   // 1. Verify event exists
//   // const event = await Event.findById(eventId);
//   // if (!event) {
//   //   throw new NotFoundError('Event not found.');
//   // }

//   const event = await Event.findById(eventId);

//   if (!event) {
//     throw new NotFoundError('Event not found.');
//   }

//   // Registration deadline check
//   assertRegistrationOpen(event);

//   // 2. Business rule: Event must be published
//   if (event.status !== EVENT_STATUS.PUBLISHED) {
//     throw new BadRequestError('Cannot register for a cancelled or unpublished event.');
//   }

//   // 3. Business rule: Event must be in the future
//   if (new Date(event.eventDate).getTime() <= Date.now()) {
//     throw new BadRequestError('Cannot register for a past event.');
//   }

//   // 4. Business rule: Event must be free for direct RSVP endpoint
//   if (event.isPaid && event.ticketPrice > 0) {
//     throw new BadRequestError('This is a paid event. Please complete booking through Razorpay checkout.');
//   }

//   // 5. Check if attendee is already registered or previously cancelled
//   const existingRegistration = await Registration.findOne({
//     eventId: new mongoose.Types.ObjectId(eventId),
//     attendeeId: new mongoose.Types.ObjectId(attendeeId)
//   });

//   if (existingRegistration) {
//     if (existingRegistration.status === REGISTRATION_STATUS.CANCELLED) {
//       throw new BadRequestError('You have previously cancelled your registration for this event and cannot re-register.');
//     }
//     if (existingRegistration.status === REGISTRATION_STATUS.CANCELLATION_REQUESTED) {
//       throw new ConflictError('A cancellation request is pending for this event.');
//     }
//     throw new ConflictError('You are already registered for this event.');
//   }

//   // 5. Atomic seat reservation
//   const useReplicaSet = canUseReplicaSetTransactions();
//   let session = null;
//   let seatAllocated = false;
//   let registration = null;

//   if (useReplicaSet) {
//     session = await mongoose.startSession();
//     session.startTransaction();
//   }

//   let updatedEvent = null;

//   try {
//     // Atomically reserve seat ONLY if seatsBooked < seatLimit
//     updatedEvent = await Event.findOneAndUpdate(
//       {
//         _id: new mongoose.Types.ObjectId(eventId),
//         status: EVENT_STATUS.PUBLISHED,
//         eventDate: { $gt: new Date() },
//         $expr: { $lt: ['$seatsBooked', '$seatLimit'] }
//       },
//       { $inc: { seatsBooked: 1 } },
//       { new: true, session: session || undefined }
//     );

//     if (!updatedEvent) {
//       throw new BadRequestError('Event is sold out. No seats remaining.');
//     }
//     seatAllocated = true;

//     // Insert registration
//     if (useReplicaSet) {
//       const [newReg] = await Registration.create(
//         [
//           {
//             eventId: new mongoose.Types.ObjectId(eventId),
//             attendeeId: new mongoose.Types.ObjectId(attendeeId),
//             status: REGISTRATION_STATUS.CONFIRMED,
//             confirmationEmailSent: false
//           }
//         ],
//         { session }
//       );
//       registration = newReg;
//       await session.commitTransaction();
//     } else {
//       registration = await Registration.create({
//         eventId: new mongoose.Types.ObjectId(eventId),
//         attendeeId: new mongoose.Types.ObjectId(attendeeId),
//         status: REGISTRATION_STATUS.CONFIRMED,
//         confirmationEmailSent: false
//       });
//     }

//     await logAuditEvent({
//       action: 'EVENT_REGISTRATION_CREATED',
//       actorId: attendeeId,
//       actorRole: 'ATTENDEE',
//       resourceId: registration._id,
//       resourceType: 'Registration',
//       ipAddress,
//       userAgent,
//       details: { eventId, eventTitle: updatedEvent.title }
//     });
//   } catch (error) {
//     if (useReplicaSet && session) {
//       try {
//         await session.abortTransaction();
//       } catch (_) { }
//     } else if (seatAllocated && !registration) {
//       // Roll back seat allocation on standalone or non-transactional instance
//       try {
//         await Event.findByIdAndUpdate(eventId, { $inc: { seatsBooked: -1 } });
//       } catch (_) { }
//     }

//     if (error.code === 11000) {
//       throw new ConflictError('You are already registered for this event.');
//     }
//     throw error;
//   } finally {
//     if (session) {
//       session.endSession();
//     }
//   }

//   // 6. Post-persistence notification & Resend email confirmation
//   // Executed strictly after successful registration persistence and outside of transaction
//   try {
//     const attendeeUser = await User.findById(attendeeId).select('name email');

//     // Trigger transactional confirmation email via Resend
//     if (attendeeUser && attendeeUser.email) {
//       sendRegistrationConfirmationEmail({
//         registrationId: registration._id.toString(),
//         attendee: {
//           name: attendeeUser.name,
//           email: attendeeUser.email
//         },
//         event: updatedEvent
//       }).catch((emailErr) => {
//         logger.error(
//           { err: emailErr?.message, registrationId: registration._id },
//           'Non-blocking confirmation email delivery failed'
//         );
//       });
//     }

//     // In-app alert for attendee
//     dispatchNotification({
//       userId: attendeeId,
//       type: NOTIFICATION_TYPE.BOOKING_CONFIRMED,
//       title: 'Booking Confirmed!',
//       message: `Your seat for "${updatedEvent.title}" has been confirmed. A confirmation email has been scheduled.`,
//       eventId: updatedEvent._id,
//       registrationId: registration._id
//     });
//   } catch (notificationErr) {
//     // Non-blocking: registration is already safely committed
//     logger.warn({ err: notificationErr?.message }, 'Post-registration notification dispatch failed safely');
//   }

//   return {
//     registration,
//     event: updatedEvent
//   };
// }




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

  // Registration deadline check
  assertRegistrationOpen(event);

  // 2. Business rule: Event must be published
  if (event.status !== EVENT_STATUS.PUBLISHED) {
    throw new BadRequestError(
      'Cannot register for a cancelled or unpublished event.'
    );
  }

  // 3. Business rule: Event must be in the future
  if (new Date(event.eventDate).getTime() <= Date.now()) {
    throw new BadRequestError(
      'Cannot register for a past event.'
    );
  }

  // 4. Business rule: Event must be free for direct RSVP endpoint
  if (event.isPaid && event.ticketPrice > 0) {
    throw new BadRequestError(
      'This is a paid event. Please complete booking through Razorpay checkout.'
    );
  }

  // 5. Check if attendee is already registered or previously cancelled
  const existingRegistration = await Registration.findOne({
    eventId: new mongoose.Types.ObjectId(eventId),
    attendeeId: new mongoose.Types.ObjectId(attendeeId)
  });

  if (existingRegistration) {
    if (existingRegistration.status === REGISTRATION_STATUS.CANCELLED) {
      throw new BadRequestError(
        'You have previously cancelled your registration for this event and cannot re-register.'
      );
    }

    if (
      existingRegistration.status ===
      REGISTRATION_STATUS.CANCELLATION_REQUESTED
    ) {
      throw new ConflictError(
        'A cancellation request is pending for this event.'
      );
    }

    throw new ConflictError(
      'You are already registered for this event.'
    );
  }

  // 6. Atomic seat reservation
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
    /*
     * Use one timestamp for the atomic registration check.
     *
     * This ensures that the event must:
     * - still be published
     * - still be in the future
     * - still be before the registration deadline
     * - still have available seats
     */
    const now = new Date();

    updatedEvent = await Event.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(eventId),

        status: EVENT_STATUS.PUBLISHED,

        eventDate: {
          $gt: now
        },

        // Registration deadline:
        // - null means the organizer did not configure a deadline
        // - otherwise deadline must still be in the future
        $or: [
          {
            registrationDeadline: null
          },
          {
            registrationDeadline: {
              $gt: now
            }
          }
        ],

        // Atomically make sure seats are still available
        $expr: {
          $lt: ['$seatsBooked', '$seatLimit']
        }
      },
      {
        $inc: {
          seatsBooked: 1
        }
      },
      {
        new: true,
        session: session || undefined
      }
    );

    if (!updatedEvent) {
      throw new BadRequestError(
        'Registration is closed or the event is sold out.'
      );
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
      details: {
        eventId,
        eventTitle: updatedEvent.title
      }
    });
  } catch (error) {
    if (useReplicaSet && session) {
      try {
        await session.abortTransaction();
      } catch (_) {}
    } else if (seatAllocated && !registration) {
      // Roll back seat allocation on standalone or non-transactional instance
      try {
        await Event.findByIdAndUpdate(
          eventId,
          {
            $inc: {
              seatsBooked: -1
            }
          }
        );
      } catch (_) {}
    }

    if (error.code === 11000) {
      throw new ConflictError(
        'You are already registered for this event.'
      );
    }

    throw error;
  } finally {
    if (session) {
      session.endSession();
    }
  }

  // 7. Post-persistence notification & Resend email confirmation
  // Executed strictly after successful registration persistence
  // and outside of transaction
  try {
    const attendeeUser = await User.findById(attendeeId)
      .select('name email');

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
          {
            err: emailErr?.message,
            registrationId: registration._id
          },
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
    logger.warn(
      {
        err: notificationErr?.message
      },
      'Post-registration notification dispatch failed safely'
    );
  }

  return {
    registration,
    event: updatedEvent
  };
}

export async function getAttendeeRegistrations(attendeeId) {
  const registrations = await Registration.find({ attendeeId: new mongoose.Types.ObjectId(attendeeId) })
    .populate({
      path: 'eventId',
      populate: { path: 'organizerId', select: 'name email' }
    })
    .populate('paymentId')
    .sort({ createdAt: -1 })
    .lean();

  if (!registrations || registrations.length === 0) {
    return [];
  }

  const regIds = registrations.map((r) => r._id);
  const bookings = await Booking.find({
    $or: [
      { registrationId: { $in: regIds } },
      { attendeeId: new mongoose.Types.ObjectId(attendeeId) }
    ]
  }).lean();

  const bookingMapByReg = new Map();
  const bookingMapByEvent = new Map();
  for (const b of bookings) {
    if (b.registrationId) {
      bookingMapByReg.set(b.registrationId.toString(), b);
    }
    if (b.eventId) {
      bookingMapByEvent.set(b.eventId.toString(), b);
    }
  }

  const allSeatIds = bookings.flatMap((b) => b.seatIds || []);
  const seats = allSeatIds.length > 0 ? await EventSeat.find({ _id: { $in: allSeatIds } }).lean() : [];
  const seatMap = new Map(seats.map((s) => [s._id.toString(), s]));

  const appBaseUrl = process.env.APP_BASE_URL || 'https://eventora-black.vercel.app';

  return registrations.map((reg) => {
    const eventIdStr = reg.eventId?._id?.toString() || reg.eventId?.toString();
    const booking = bookingMapByReg.get(reg._id.toString()) || bookingMapByEvent.get(eventIdStr);
    let populatedBooking = null;

    if (booking) {
      const bSeats = (booking.seatIds || []).map((id) => seatMap.get(id.toString())).filter(Boolean);
      populatedBooking = {
        _id: booking._id.toString(),
        bookingReference: booking.bookingReference,
        status: booking.status,
        totalAmount: booking.totalAmount,
        currency: booking.currency,
        ticketToken: booking.ticketToken,
        qrCodePayload: `${appBaseUrl}/tickets/verify?token=${encodeURIComponent(booking.ticketToken || '')}`,
        seatLabels: booking.seatLabels || [],
        seats: bSeats.map((s) => ({
          seatId: s._id.toString(),
          seatLabel: s.seatLabel,
          sectionName: s.sectionName,
          rowLabel: s.rowLabel,
          seatNumber: s.seatNumber,
          category: s.category,
          price: s.price
        }))
      };
    } else {
      const regRef = `EVT-${reg._id.toString().substring(0, 8).toUpperCase()}`;
      const token = generateSignedTicketToken({
        bookingReference: regRef,
        eventId: reg.eventId?._id || reg.eventId,
        attendeeId: reg.attendeeId
      });
      populatedBooking = {
        _id: reg._id.toString(),
        bookingReference: regRef,
        status: reg.status,
        totalAmount: reg.ticketPrice || 0,
        currency: reg.currency || 'INR',
        ticketToken: token,
        qrCodePayload: `${appBaseUrl}/tickets/verify?token=${encodeURIComponent(token)}`,
        seatLabels: ['General Admission'],
        seats: [],
        isRedeemed: Boolean(reg.isRedeemed),
        redeemedAt: reg.redeemedAt
      };
    }

    return {
      ...reg,
      booking: populatedBooking
    };
  });
}

export async function getEventAttendees(eventId, organizerId, options = {}) {
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

  const regQuery = {
    eventId: new mongoose.Types.ObjectId(eventId)
  };

  const total = await Registration.countDocuments(regQuery);

  let queryBuilder = Registration.find(regQuery)
    .populate('attendeeId', 'name email createdAt')
    .sort({ createdAt: -1 });

  let pageNum = null;
  let limitNum = null;
  let totalPages = 1;

  if (options && (options.page !== undefined || options.limit !== undefined)) {
    pageNum = Math.max(1, parseInt(options.page, 10) || 1);
    limitNum = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;
    queryBuilder = queryBuilder.skip(skip).limit(limitNum);
    totalPages = Math.ceil(total / limitNum) || 1;
  }

  const registrations = await queryBuilder.lean();

  return {
    event: {
      id: event._id,
      title: event.title,
      eventDate: event.eventDate,
      seatLimit: event.seatLimit,
      seatsBooked: event.seatsBooked,
      remainingSeats: Math.max(0, event.seatLimit - event.seatsBooked)
    },
    pagination: {
      total,
      page: pageNum || 1,
      limit: limitNum || total,
      totalPages,
      hasNextPage: pageNum ? pageNum < totalPages : false,
      hasPrevPage: pageNum ? pageNum > 1 : false
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

      // Release any assigned physical seats associated with this booking
      try {
        const booking = await Booking.findOne({ registrationId: registration._id });
        if (booking) {
          booking.status = BOOKING_STATUS.CANCELLED;
          booking.cancelledAt = new Date();
          await booking.save();

          await EventSeat.updateMany(
            { bookingId: booking._id },
            {
              $set: {
                status: SEAT_STATUS.AVAILABLE,
                bookingId: null,
                holdId: null,
                heldBy: null,
                heldUntil: null,
                isBlocked: false
              },
              $inc: { version: 1 }
            }
          );
        }
      } catch (seatReleaseErr) {
        logger.error({ err: seatReleaseErr?.message, registrationId: registration._id }, 'Failed to release physical seats upon cancellation');
      }
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

    // Send transactional cancellation & refund confirmation email only on cancellation
    try {
      const attendee = await User.findById(registration.attendeeId).select('name email');
      if (attendee?.email) {
        const paymentDoc = registration.paymentId ? await Payment.findById(registration.paymentId) : null;
        sendCancellationRefundEmail({
          attendeeEmail: attendee.email,
          attendeeName: attendee.name,
          event: registration.eventId,
          registrationId: registration._id.toString(),
          isPaid: registration.isPaid,
          refundAmount: paymentDoc?.amount || (registration.ticketPrice ? Math.round(registration.ticketPrice * 100) : 0),
          refundId: paymentDoc?.refundId || null,
          currency: paymentDoc?.currency || registration.currency || 'INR',
          reason: note || registration.cancellationReason || 'Cancellation approved by organizer'
        }).catch((err) => {
          logger.error({ err: err?.message, registrationId: registration._id }, 'Failed to dispatch cancellation refund email');
        });
      }
    } catch (emailLookupErr) {
      logger.error({ err: emailLookupErr?.message, registrationId: registration._id }, 'Error looking up attendee for cancellation email');
    }

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

/**
 * Generates an RFC 5545 compliant .ics calendar file for an attendee's confirmed registration.
 * Validates ownership and strictly rejects cancelled events or registrations.
 */
export async function getRegistrationCalendarIcs({ registrationId, attendeeId }) {
  if (!mongoose.Types.ObjectId.isValid(registrationId)) {
    throw new BadRequestError('Invalid registration ID format.');
  }

  const registration = await Registration.findById(registrationId)
    .populate({
      path: 'eventId',
      populate: { path: 'organizerId', select: 'name email' }
    });

  if (!registration) {
    throw new NotFoundError('Registration not found.');
  }

  // Authorization: Only the attendee who owns this registration can download its calendar pass
  if (registration.attendeeId.toString() !== attendeeId.toString()) {
    throw new ForbiddenError('You are not authorized to download the calendar pass for this registration.');
  }

  const event = registration.eventId;
  if (!event) {
    throw new NotFoundError('Associated event not found.');
  }

  // Business Rule: Do not allow cancelled events or registrations to be downloaded as upcoming confirmed events
  if (event.status === EVENT_STATUS.CANCELLED || registration.status === REGISTRATION_STATUS.CANCELLED) {
    throw new BadRequestError('Cannot download calendar pass for a cancelled event or registration.');
  }

  // Fetch optional booking details (seats, custom reference)
  const booking = await Booking.findOne({
    $or: [
      { registrationId: registration._id },
      { attendeeId: new mongoose.Types.ObjectId(attendeeId), eventId: event._id }
    ]
  }).lean();

  const icsContent = generateEventIcs({ event, registration, booking });
  const slug = (event.title || 'event')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
  const filename = `${slug || 'event'}.ics`;

  return {
    icsContent,
    filename
  };
}


export function assertRegistrationOpen(event) {
  if (
    event.registrationDeadline &&
    new Date() >= new Date(event.registrationDeadline)
  ) {
    throw new BadRequestError(
      'Registration for this event has closed.'
    );
  }
}

export async function updateRegistrationDeadline({
  eventId,
  organizerId,
  registrationDeadline
}) {
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    throw new BadRequestError('Invalid event ID format.');
  }

  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  if (event.organizerId.toString() !== organizerId.toString()) {
    throw new ForbiddenError('You are not authorized to update this event.');
  }

  if (event.status === EVENT_STATUS.CANCELLED) {
    throw new BadRequestError('Cannot set a registration deadline on a cancelled event.');
  }

  if (registrationDeadline) {
    const deadline = new Date(registrationDeadline);
    if (isNaN(deadline.getTime())) {
      throw new BadRequestError('Invalid date format for registration deadline.');
    }
    if (deadline >= new Date(event.eventDate)) {
      throw new BadRequestError('Registration deadline must be before the event date.');
    }
    event.registrationDeadline = deadline;
  } else {
    event.registrationDeadline = null;
  }

  await event.save();
  return event;
}
