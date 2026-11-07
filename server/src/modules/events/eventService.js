import mongoose from 'mongoose';
import { Event } from './Event.js';
import { EVENT_STATUS } from '../../shared/constants/status.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError
} from '../../shared/errors/AppError.js';
import { logAuditEvent } from '../audit/AuditLog.js';

export async function createEvent({
  title,
  description,
  eventDate,
  venue,
  seatLimit,
  category,
  bannerUrl,
  organizerId,
  ipAddress,
  userAgent
}) {
  const parsedDate = new Date(eventDate);
  if (parsedDate.getTime() <= Date.now()) {
    throw new BadRequestError('Event date must be in the future.');
  }

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
    bannerUrl: bannerUrl || ''
  });

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

  if (updateData.title !== undefined) event.title = updateData.title;
  if (updateData.description !== undefined) event.description = updateData.description;
  if (updateData.venue !== undefined) event.venue = updateData.venue;
  if (updateData.category !== undefined) event.category = updateData.category;
  if (updateData.bannerUrl !== undefined) event.bannerUrl = updateData.bannerUrl;

  await event.save();

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
