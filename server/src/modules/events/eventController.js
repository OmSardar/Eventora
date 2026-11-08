import * as eventService from './eventService.js';
import * as registrationService from '../registrations/registrationService.js';

export async function getEvents(req, res, next) {
  try {
    const { search, category, page, limit } = req.query;
    const result = await eventService.getEvents({ search, category, page, limit });
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
}

export async function getEventById(req, res, next) {
  try {
    const { eventId } = req.params;
    const event = await eventService.getEventById(eventId);
    res.status(200).json({
      success: true,
      data: { event }
    });
  } catch (error) {
    next(error);
  }
}

export async function createEvent(req, res, next) {
  try {
    const {
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
      seatingConfig
    } = req.validatedBody;
    const organizerId = req.user.id;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const event = await eventService.createEvent({
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
    });

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      data: { event }
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadEventBanner(req, res, next) {
  try {
    const { eventId } = req.params;
    const organizerId = req.user.id;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    const file = req.file;

    const result = await eventService.uploadEventBanner({
      eventId: eventId || null,
      file,
      organizerId,
      ipAddress,
      userAgent
    });

    res.status(200).json({
      success: true,
      message: 'Banner image uploaded successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

export async function updateEvent(req, res, next) {
  try {
    const { eventId } = req.params;
    const updateData = req.validatedBody;
    const organizerId = req.user.id;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const updatedEvent = await eventService.updateEvent({
      eventId,
      updateData,
      organizerId,
      ipAddress,
      userAgent
    });

    res.status(200).json({
      success: true,
      message: 'Event updated successfully',
      data: { event: updatedEvent }
    });
  } catch (error) {
    next(error);
  }
}

export async function cancelEvent(req, res, next) {
  try {
    const { eventId } = req.params;
    const organizerId = req.user.id;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const cancelledEvent = await eventService.cancelEvent({
      eventId,
      organizerId,
      ipAddress,
      userAgent
    });

    res.status(200).json({
      success: true,
      message: 'Event cancelled successfully',
      data: { event: cancelledEvent }
    });
  } catch (error) {
    next(error);
  }
}

export async function getMyEvents(req, res, next) {
  try {
    const organizerId = req.user.id;
    const events = await eventService.getOrganizerEvents(organizerId);
    res.status(200).json({
      success: true,
      data: { events }
    });
  } catch (error) {
    next(error);
  }
}

export async function getEventAttendees(req, res, next) {
  try {
    const { eventId } = req.params;
    const organizerId = req.user.id;
    const result = await registrationService.getEventAttendees(eventId, organizerId);
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
}

