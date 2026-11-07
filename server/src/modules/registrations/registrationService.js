import mongoose from 'mongoose';
import { Registration } from './Registration.js';
import { Event } from '../events/Event.js';
import { EVENT_STATUS, REGISTRATION_STATUS } from '../../shared/constants/status.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError
} from '../../shared/errors/AppError.js';
import { logAuditEvent } from '../audit/AuditLog.js';

function canUseReplicaSetTransactions() {
  const topologyType = mongoose.connection?.client?.topology?.description?.type;
  return topologyType === 'ReplicaSet' || topologyType === 'Sharded';
}

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

  // 4. Check if attendee is already registered
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

  if (useReplicaSet) {
    session = await mongoose.startSession();
    session.startTransaction();
  }

  try {
    // Atomically reserve seat ONLY if seatsBooked < seatLimit
    const updatedEvent = await Event.findOneAndUpdate(
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

    // Insert registration
    let registration;
    if (useReplicaSet) {
      const [newReg] = await Registration.create(
        [
          {
            eventId: new mongoose.Types.ObjectId(eventId),
            attendeeId: new mongoose.Types.ObjectId(attendeeId),
            status: REGISTRATION_STATUS.CONFIRMED
          }
        ],
        { session }
      );
      registration = newReg;
      await session.commitTransaction();
    } else {
      try {
        registration = await Registration.create({
          eventId: new mongoose.Types.ObjectId(eventId),
          attendeeId: new mongoose.Types.ObjectId(attendeeId),
          status: REGISTRATION_STATUS.CONFIRMED
        });
      } catch (insertErr) {
        // Roll back the atomic seat increment on standalone instance
        await Event.findByIdAndUpdate(eventId, { $inc: { seatsBooked: -1 } });
        if (insertErr.code === 11000) {
          throw new ConflictError('You are already registered for this event.');
        }
        throw insertErr;
      }
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

    return {
      registration,
      event: updatedEvent
    };
  } catch (error) {
    if (useReplicaSet && session) {
      await session.abortTransaction();
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
    await registration.save();

    // Release seat atomically
    await Event.findByIdAndUpdate(registration.eventId._id, {
      $inc: { seatsBooked: -1 }
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
