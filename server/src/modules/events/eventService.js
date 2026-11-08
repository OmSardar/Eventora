import mongoose from 'mongoose';
import { Event } from './Event.js';
import { EVENT_STATUS } from '../../shared/constants/status.js';
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
import { generateEventSeats } from '../seating/seatingService.js';
import { logger } from '../../infrastructure/logging/logger.js';

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
  organizerId,
  ipAddress,
  userAgent
}) {
  const parsedDate = new Date(eventDate);
  if (parsedDate.getTime() <= Date.now()) {
    throw new BadRequestError('Event date must be in the future.');
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
    bannerUrl: bannerUrl || finalImage.url || ''
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
    if (parsedDate.getTime() <= Date.now()) {
      throw new BadRequestError('Event date must be in the future.');
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
  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  // Strict ownership check
  if (event.organizerId.toString() !== organizerId.toString()) {
    throw new ForbiddenError('You are not authorized to cancel this event.');
  }

  if (event.status === EVENT_STATUS.CANCELLED) {
    throw new BadRequestError('Event is already cancelled.');
  }

  event.status = EVENT_STATUS.CANCELLED;
  await event.save();

  await logAuditEvent({
    action: 'EVENT_CANCELLED',
    actorId: organizerId,
    actorRole: 'ORGANIZER',
    resourceId: event._id,
    resourceType: 'Event',
    ipAddress,
    userAgent,
    details: { title: event.title }
  });

  return event;
}

export async function getEvents({
  search,
  category,
  page = 1,
  limit = 12,
  includePast = false
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

  if (search && search.trim()) {
    query.$or = [
      { title: { $regex: search.trim(), $options: 'i' } },
      { description: { $regex: search.trim(), $options: 'i' } },
      { venue: { $regex: search.trim(), $options: 'i' } }
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
  const skip = (pageNum - 1) * limitNum;

  const [events, total] = await Promise.all([
    Event.find(query)
      .populate('organizerId', 'name email')
      .sort({ eventDate: 1 })
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
    }
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

