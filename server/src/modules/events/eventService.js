import crypto from 'crypto';
import mongoose from 'mongoose';
import { Event } from './Event.js';
import { Registration } from '../registrations/Registration.js';
import { Booking } from '../bookings/Booking.js';
import { EventSeat } from '../seating/EventSeat.js';
import { SeatHold } from '../seating/SeatHold.js';
import { Payment } from '../payments/Payment.js';
import { RefundOperation } from '../payments/RefundOperation.js';
import { User } from '../users/User.js';
import {
  EVENT_STATUS,
  REGISTRATION_STATUS,
  BOOKING_STATUS,
  SEAT_STATUS,
  SEAT_HOLD_STATUS,
  PAYMENT_STATUS,
  REFUND_STATUS,
  NOTIFICATION_TYPE
} from '../../shared/constants/status.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError
} from '../../shared/errors/AppError.js';
import { logAuditEvent } from '../audit/AuditLog.js';
import {
  uploadImageToCloudinary,
  deleteCloudinaryAsset
} from '../../infrastructure/cloudinary/cloudinaryService.js';
import { validateImageBuffer } from '../../shared/validation/fileValidation.js';
import {
  MIN_EVENT_ADVANCE_MS,
  MAX_EVENT_ADVANCE_MS
} from '../../shared/validation/eventValidation.js';
import { generateEventSeats } from '../seating/seatingService.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { dispatchNotification } from '../notifications/notificationService.js';
import { sendCancellationRefundEmail } from '../../infrastructure/email/emailService.js';
import { initiateRazorpayRefund } from '../payments/razorpayService.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';

export async function createEvent({
  title,
  description,
  eventDate,
  venue,
  seatLimit,
  category,
  bannerUrl,
  image,
  isPaid,
  ticketPrice,
  currency,
  seatingType,
  maxTicketsPerBooking,
  seatingConfig,
  registrationDeadline,
  organizerId,
  ipAddress,
  userAgent
}) {
  const parsedDate = new Date(eventDate);
  const now = Date.now();
  const minAllowed = now + MIN_EVENT_ADVANCE_MS - 60000;
  const maxAllowed = now + MAX_EVENT_ADVANCE_MS + 86400000;

  if (parsedDate.getTime() < minAllowed) {
    throw new BadRequestError('Event date must be scheduled at least 12 hours in advance.');
  }
  if (parsedDate.getTime() > maxAllowed) {
    throw new BadRequestError('Event date cannot be scheduled more than 3 months in advance.');
  }

  // Validate optional registration deadline
  let parsedDeadline = null;
  if (registrationDeadline) {
    parsedDeadline = new Date(registrationDeadline);
    if (isNaN(parsedDeadline.getTime())) {
      throw new BadRequestError('Invalid date format for registration deadline.');
    }
    if (parsedDeadline >= parsedDate) {
      throw new BadRequestError('Registration deadline must be before the event date.');
    }
  }

  const finalImage =
    image || (bannerUrl ? { source: 'URL', url: bannerUrl, publicId: null } : { source: 'URL', url: '', publicId: null });

  const event = await Event.create({
    title,
    description,
    eventDate: parsedDate,
    venue,
    seatLimit: Number(seatLimit),
    seatsBooked: 0,
    organizerId: new mongoose.Types.ObjectId(organizerId),
    status: EVENT_STATUS.PUBLISHED,
    category: category || 'General',
    seatingType: seatingType || 'GENERAL_ADMISSION',
    maxTicketsPerBooking: maxTicketsPerBooking ? Number(maxTicketsPerBooking) : 6,
    isPaid: Boolean(isPaid),
    ticketPrice: isPaid ? Number(ticketPrice) || 0 : 0,
    currency: currency || 'INR',
    image: finalImage,
    bannerUrl: bannerUrl || finalImage.url || '',
    registrationDeadline: parsedDeadline
  });

  if (seatingType === 'ASSIGNED_SEATING') {
    try {
      await generateEventSeats(event._id, seatingConfig);
    } catch (seatErr) {
      logger.error({ err: seatErr?.message, eventId: event._id }, 'Failed to generate seating layout on event create');
    }
  }

  await logAuditEvent({
    action: 'EVENT_CREATED',
    actorId: organizerId,
    actorRole: 'ORGANIZER',
    resourceId: event._id,
    resourceType: 'Event',
    ipAddress,
    userAgent,
    details: { title: event.title, seatLimit: event.seatLimit, eventDate: event.eventDate }
  });

  return event;
}

export async function updateEvent({
  eventId,
  updateData,
  organizerId,
  ipAddress,
  userAgent
}) {
  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  // Strict ownership check: organizer can only edit their own events
  if (event.organizerId.toString() !== organizerId.toString()) {
    throw new ForbiddenError('You are not authorized to edit this event.');
  }

  if (event.status === EVENT_STATUS.CANCELLED) {
    throw new BadRequestError('Cannot edit a cancelled event.');
  }

  // Validate date if updating
  if (updateData.eventDate) {
    const parsedDate = new Date(updateData.eventDate);
    const now = Date.now();
    const minAllowed = now + MIN_EVENT_ADVANCE_MS - 60000;
    const maxAllowed = now + MAX_EVENT_ADVANCE_MS + 86400000;

    if (parsedDate.getTime() < minAllowed) {
      throw new BadRequestError('Event date must be scheduled at least 12 hours in advance.');
    }
    if (parsedDate.getTime() > maxAllowed) {
      throw new BadRequestError('Event date cannot be scheduled more than 3 months in advance.');
    }
    event.eventDate = parsedDate;
  }

  // Validate seat limit: cannot be reduced below current seatsBooked
  if (updateData.seatLimit !== undefined) {
    const newLimit = Number(updateData.seatLimit);
    if (newLimit < event.seatsBooked) {
      throw new BadRequestError(
        `Seat limit cannot be reduced below current bookings (${event.seatsBooked} seats booked).`
      );
    }
    event.seatLimit = newLimit;
  }

  const oldPublicId = event.image?.publicId;
  let newPublicId = undefined;

  if (updateData.title !== undefined) event.title = updateData.title;
  if (updateData.description !== undefined) event.description = updateData.description;
  if (updateData.venue !== undefined) event.venue = updateData.venue;
  if (updateData.category !== undefined) event.category = updateData.category;
  if (updateData.maxTicketsPerBooking !== undefined) event.maxTicketsPerBooking = Number(updateData.maxTicketsPerBooking);

  if (updateData.seatingType !== undefined && updateData.seatingType !== event.seatingType) {
    event.seatingType = updateData.seatingType;
    if (updateData.seatingType === 'ASSIGNED_SEATING') {
      try {
        await generateEventSeats(event._id, updateData.seatingConfig);
      } catch (seatErr) {
        logger.error({ err: seatErr?.message, eventId: event._id }, 'Failed to generate seating on event update');
      }
    }
  }

  // Protect pricing changes if bookings exist
  if (updateData.isPaid !== undefined || updateData.ticketPrice !== undefined) {
    if (event.seatsBooked > 0) {
      if (updateData.ticketPrice !== undefined && updateData.ticketPrice !== event.ticketPrice) {
        throw new BadRequestError('Cannot change ticket price after tickets/reservations have been booked.');
      }
      if (updateData.isPaid !== undefined && updateData.isPaid !== event.isPaid) {
        throw new BadRequestError('Cannot switch event payment model after bookings have occurred.');
      }
    }
    if (updateData.isPaid !== undefined) event.isPaid = Boolean(updateData.isPaid);
    if (updateData.ticketPrice !== undefined) event.ticketPrice = event.isPaid ? Number(updateData.ticketPrice) : 0;
    if (updateData.currency !== undefined) event.currency = updateData.currency;
  }

  if (updateData.image !== undefined) {
    event.image = updateData.image;
    event.bannerUrl = updateData.image?.url || '';
    newPublicId = updateData.image?.publicId;
  } else if (updateData.bannerUrl !== undefined) {
    event.bannerUrl = updateData.bannerUrl;
    event.image = {
      source: 'URL',
      url: updateData.bannerUrl,
      publicId: null
    };
    newPublicId = null;
  }

  await event.save();

  // Safely delete replaced Cloudinary asset only after database update succeeds
  if (oldPublicId && newPublicId !== undefined && oldPublicId !== newPublicId) {
    deleteCloudinaryAsset(oldPublicId).catch((err) => {
      logger.error({ err: err?.message, oldPublicId }, 'Failed to delete replaced Cloudinary asset');
    });
  }

  await logAuditEvent({
    action: 'EVENT_UPDATED',
    actorId: organizerId,
    actorRole: 'ORGANIZER',
    resourceId: event._id,
    resourceType: 'Event',
    ipAddress,
    userAgent,
    details: { updatedFields: Object.keys(updateData) }
  });

  return event;
}

export async function cancelEvent({
  eventId,
  organizerId,
  ipAddress,
  userAgent
}) {
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    throw new BadRequestError('Invalid event ID format.');
  }

  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  // Strict ownership check: organizer can only cancel their own events
  if (event.organizerId.toString() !== organizerId.toString()) {
    throw new ForbiddenError('You are not authorized to cancel this event.');
  }

  if (event.status === EVENT_STATUS.CANCELLED) {
    throw new BadRequestError('Event is already cancelled.');
  }

  // 1. Fetch all affected active/pending registrations before mutating
  const affectedRegistrations = await Registration.find({
    eventId: event._id,
    status: { $in: [REGISTRATION_STATUS.CONFIRMED, REGISTRATION_STATUS.CANCELLATION_REQUESTED] }
  })
    .populate('attendeeId', 'name email')
    .lean();

  const now = new Date();

  // 2. Perform database state transitions safely within transaction (or standalone fallback)
  await withTransaction(async (session) => {
    const opts = session ? { session } : {};

    // A. Update Event status and reset active bookings count to 0 atomically
    const transitionedEvent = await Event.findOneAndUpdate(
      {
        _id: event._id,
        status: { $ne: EVENT_STATUS.CANCELLED }
      },
      {
        $set: {
          status: EVENT_STATUS.CANCELLED,
          seatsBooked: 0
        }
      },
      { new: true, ...opts }
    );

    if (!transitionedEvent) {
      throw new BadRequestError('Event is already cancelled.');
    }

    event.status = EVENT_STATUS.CANCELLED;
    event.seatsBooked = 0;

    // B. Synchronize all active/pending registrations to CANCELLED
    await Registration.updateMany(
      {
        eventId: event._id,
        status: { $in: [REGISTRATION_STATUS.CONFIRMED, REGISTRATION_STATUS.CANCELLATION_REQUESTED] }
      },
      {
        $set: {
          status: REGISTRATION_STATUS.CANCELLED,
          cancellationReason: 'Event was cancelled by the organizer',
          decisionNote: 'Event cancelled by organizer',
          decidedBy: new mongoose.Types.ObjectId(organizerId),
          decidedAt: now,
          seatReleased: true,
          seatReleasedAt: now
        }
      },
      opts
    );

    // C. Synchronize all associated Bookings to CANCELLED
    await Booking.updateMany(
      {
        eventId: event._id,
        status: { $in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.PENDING_PAYMENT] }
      },
      {
        $set: {
          status: BOOKING_STATUS.CANCELLED,
          cancelledAt: now
        }
      },
      opts
    );

    // D. Release all active seat holds
    await SeatHold.updateMany(
      {
        eventId: event._id,
        status: SEAT_HOLD_STATUS.ACTIVE
      },
      {
        $set: {
          status: SEAT_HOLD_STATUS.RELEASED,
          releasedAt: now
        }
      },
      opts
    );

    // E. Transition all assigned EventSeats to BLOCKED so they cannot be booked
    await EventSeat.updateMany(
      {
        eventId: event._id
      },
      {
        $set: {
          status: SEAT_STATUS.BLOCKED,
          holdId: null,
          heldBy: null,
          heldUntil: null,
          isBlocked: true
        }
      },
      opts
    );
  });

  // 3. Process refunds for paid registrations (preserving payment/refund records)
  for (const reg of affectedRegistrations) {
    if ((reg.isPaid || reg.paymentId) && reg.paymentId) {
      try {
        const payment = await Payment.findById(reg.paymentId);
        if (
          payment &&
          payment.status === PAYMENT_STATUS.CAPTURED &&
          payment.refundStatus !== REFUND_STATUS.PROCESSED
        ) {
          const idempotencyKey = `refund_reg_${reg._id}`;
          let refundOp = await RefundOperation.findOne({ idempotencyKey });

          if (!refundOp) {
            try {
              refundOp = await RefundOperation.create({
                refundOpId: `rfop_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
                paymentId: payment._id,
                registrationId: reg._id,
                eventId: event._id,
                attendeeId: reg.attendeeId?._id || reg.attendeeId,
                organizerId: new mongoose.Types.ObjectId(organizerId),
                orderId: payment.orderId,
                gatewayPaymentId: payment.paymentId,
                amount: payment.amount,
                currency: payment.currency || 'INR',
                reason: 'Event was cancelled by the organizer',
                status: 'INITIATED',
                idempotencyKey,
                lastAttemptAt: new Date()
              });
            } catch (dupErr) {
              if (dupErr.code === 11000) {
                refundOp = await RefundOperation.findOne({ idempotencyKey });
              } else {
                logger.error({ err: dupErr?.message, regId: reg._id }, 'Failed to create refundOp on event cancel');
              }
            }
          }

          payment.status = PAYMENT_STATUS.REFUND_PENDING;
          payment.refundStatus = REFUND_STATUS.PENDING;
          payment.refundAmount = payment.amount;
          payment.refundReason = 'Event was cancelled by the organizer';
          await payment.save();

          await Registration.findByIdAndUpdate(reg._id, {
            $set: { refundStatus: REFUND_STATUS.PENDING }
          });

          if (refundOp && refundOp.status !== 'PROCESSED') {
            try {
              const refundResult = await initiateRazorpayRefund({
                paymentId: payment.paymentId,
                amountInPaise: payment.amount,
                notes: {
                  refundOpId: refundOp.refundOpId,
                  registrationId: reg._id.toString(),
                  reason: 'Event was cancelled by the organizer'
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
                { err: refundErr?.message, registrationId: reg._id, refundOpId: refundOp?.refundOpId },
                'Razorpay refund API call failed on event cancellation'
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
      } catch (payErr) {
        logger.error({ err: payErr?.message, regId: reg._id }, 'Error processing refund on event cancellation');
      }
    }
  }

  // 4. Log Audit Event
  await logAuditEvent({
    action: 'EVENT_CANCELLED',
    actorId: organizerId,
    actorRole: 'ORGANIZER',
    resourceId: event._id,
    resourceType: 'Event',
    ipAddress,
    userAgent,
    details: {
      title: event.title,
      affectedRegistrationsCount: affectedRegistrations.length
    }
  });

  // 5. Post-persistence Notifications & Emails (non-blocking)
  for (const reg of affectedRegistrations) {
    const attendeeId = reg.attendeeId?._id || reg.attendeeId;

    // A. In-app notification
    if (attendeeId) {
      dispatchNotification({
        userId: attendeeId,
        type: NOTIFICATION_TYPE.EVENT_CANCELLED,
        title: 'Event Cancelled',
        message: `The event "${event.title}" has been cancelled by the organizer.`,
        eventId: event._id,
        registrationId: reg._id
      }).catch((notifErr) => {
        logger.error(
          { err: notifErr?.message, userId: attendeeId, eventId: event._id },
          'Failed to dispatch in-app notification for cancelled event'
        );
      });
    }

    // B. Transactional cancellation email via Resend
    const attendeeEmail = reg.attendeeId?.email;
    const attendeeName = reg.attendeeId?.name;

    if (attendeeEmail) {
      (async () => {
        try {
          const paymentDoc = reg.paymentId ? await Payment.findById(reg.paymentId) : null;
          await sendCancellationRefundEmail({
            attendeeEmail,
            attendeeName,
            event,
            registrationId: reg._id.toString(),
            isPaid: reg.isPaid,
            refundAmount: paymentDoc?.amount || (reg.ticketPrice ? Math.round(reg.ticketPrice * 100) : 0),
            refundId: paymentDoc?.refundId || null,
            currency: paymentDoc?.currency || reg.currency || 'INR',
            reason: 'Event was cancelled by the organizer'
          });
        } catch (emailErr) {
          logger.error(
            { err: emailErr?.message, registrationId: reg._id },
            'Non-blocking event cancellation email failed'
          );
        }
      })();
    }
  }

  return event;
}

export const PRIMARY_CITIES = [
  'Kolkata',
  'Bengaluru',
  'Mumbai',
  'Delhi NCR',
  'Hyderabad',
  'Pune',
  'San Francisco',
  'New York'
];

export const CITY_REGEX_MAP = {
  'Kolkata': 'Kolkata|Calcutta',
  'Bengaluru': 'Bengaluru|Bangalore',
  'Mumbai': 'Mumbai|Bombay',
  'Delhi NCR': 'Delhi|New Delhi|Gurugram|Gurgaon|Noida',
  'Hyderabad': 'Hyderabad',
  'Pune': 'Pune',
  'San Francisco': 'San Francisco|Silicon Valley',
  'New York': 'New York|NYC|Manhattan|Brooklyn'
};

const ALL_PRIMARY_CITIES_REGEX = Object.values(CITY_REGEX_MAP).join('|');

export async function getEvents({
  search,
  category,
  location,
  sort,
  page = 1,
  limit = 12,
  includePast = false,
  availability
}) {
  const query = {
    status: EVENT_STATUS.PUBLISHED
  };

  if (!includePast) {
    query.eventDate = { $gte: new Date() };
  }

  if (category && category !== 'All') {
    query.category = category;
  }

  if (availability === 'available' || availability === 'open') {
    query.$expr = { $lt: ['$seatsBooked', '$seatLimit'] };
  } else if (availability === 'sold_out') {
    query.$expr = { $gte: ['$seatsBooked', '$seatLimit'] };
  }

  // Location / City Filtering
  if (location && location !== 'All') {
    const locTrimmed = location.trim();
    if (locTrimmed.toLowerCase() === 'others') {
      query.venue = {
        $not: new RegExp(ALL_PRIMARY_CITIES_REGEX, 'i')
      };
    } else if (CITY_REGEX_MAP[locTrimmed]) {
      query.venue = {
        $regex: CITY_REGEX_MAP[locTrimmed],
        $options: 'i'
      };
    } else {
      query.venue = {
        $regex: locTrimmed,
        $options: 'i'
      };
    }
  }

  if (search && search.trim()) {
    query.$or = [
      { title: { $regex: search.trim(), $options: 'i' } },
      { description: { $regex: search.trim(), $options: 'i' } },
      { venue: { $regex: search.trim(), $options: 'i' } }
    ];
  }

  // Sort resolution
  let sortCriteria = { eventDate: 1 };
  if (sort === 'date_desc' || sort === 'latest') {
    sortCriteria = { eventDate: -1 };
  } else if (sort === 'price_asc') {
    sortCriteria = { ticketPrice: 1, eventDate: 1 };
  } else if (sort === 'price_desc') {
    sortCriteria = { ticketPrice: -1, eventDate: 1 };
  } else if (sort === 'popularity' || sort === 'seats_booked') {
    sortCriteria = { seatsBooked: -1, eventDate: 1 };
  } else if (sort === 'title_asc' || sort === 'title') {
    sortCriteria = { title: 1 };
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
  const skip = (pageNum - 1) * limitNum;

  const [events, total] = await Promise.all([
    Event.find(query)
      .populate('organizerId', 'name email')
      .sort(sortCriteria)
      .skip(skip)
      .limit(limitNum)
      .lean({ virtuals: true }),
    Event.countDocuments(query)
  ]);

  return {
    events,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    },
    primaryCities: PRIMARY_CITIES
  };
}

export async function getEventById(eventId) {
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    throw new BadRequestError('Invalid event ID format.');
  }

  const event = await Event.findById(eventId)
    .populate('organizerId', 'name email')
    .lean({ virtuals: true });

  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  return event;
}

export async function getOrganizerEvents(organizerId) {
  return Event.find({ organizerId: new mongoose.Types.ObjectId(organizerId) })
    .sort({ createdAt: -1 })
    .lean({ virtuals: true });
}

/**
 * Validates, uploads, and links an event banner image via the server-side Cloudinary SDK.
 * Strictly verifies file magic bytes, format, size limits, and organizer event ownership.
 */
export async function uploadEventBanner({
  eventId = null,
  file,
  organizerId,
  ipAddress,
  userAgent
}) {
  if (!file || !file.buffer) {
    throw new BadRequestError('Image file is required');
  }

  // Cryptographic magic bytes inspection & spoofing check
  const detected = validateImageBuffer(file.buffer, file.mimetype);

  let event = null;
  let oldPublicId = null;

  if (eventId) {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      throw new BadRequestError('Invalid event ID format');
    }

    event = await Event.findById(eventId);
    if (!event) {
      throw new NotFoundError('Event not found');
    }

    // Ownership check: only the organizer who created the event can update its banner
    if (event.organizerId.toString() !== organizerId.toString()) {
      throw new ForbiddenError('You are not authorized to update this event banner');
    }

    if (event.image?.source === 'CLOUDINARY' && event.image?.publicId) {
      oldPublicId = event.image.publicId;
    }
  }

  // Upload to Cloudinary using official server-side SDK stream
  const uploadResult = await uploadImageToCloudinary({
    buffer: file.buffer,
    folder: 'eventora/events',
    eventId: eventId || 'new',
    format: detected.format
  });

  // If eventId exists, persist to MongoDB
  if (event) {
    event.image = {
      source: 'CLOUDINARY',
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      format: uploadResult.format,
      width: uploadResult.width,
      height: uploadResult.height,
      bytes: uploadResult.bytes
    };
    event.bannerUrl = uploadResult.secure_url;

    try {
      await event.save();
    } catch (dbErr) {
      // Database update failure triggers appropriate uploaded-asset cleanup
      logger.error(
        { err: dbErr.message, publicId: uploadResult.public_id },
        'Event banner database save failed, cleaning up newly uploaded Cloudinary asset'
      );
      await deleteCloudinaryAsset(uploadResult.public_id).catch(() => {});
      throw dbErr;
    }

    // Only after database update succeeds, delete previous Cloudinary asset
    if (oldPublicId && oldPublicId !== uploadResult.public_id) {
      deleteCloudinaryAsset(oldPublicId).catch((delErr) => {
        logger.warn(
          { err: delErr?.message, oldPublicId },
          'Failed to delete previous Cloudinary asset after successful update'
        );
      });
    }
  }

  await logAuditEvent({
    action: 'BANNER_UPLOADED',
    actorId: organizerId,
    actorRole: 'ORGANIZER',
    resourceId: event ? event._id : null,
    resourceType: 'Event',
    ipAddress,
    userAgent,
    details: { publicId: uploadResult.public_id, format: uploadResult.format }
  });

  return {
    banner: {
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      format: uploadResult.format,
      width: uploadResult.width,
      height: uploadResult.height,
      bytes: uploadResult.bytes
    }
  };
}

