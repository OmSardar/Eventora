import * as registrationService from './registrationService.js';

export async function registerForEvent(req, res, next) {
  try {
    const { eventId } = req.params;
    const attendeeId = req.user.id;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const result = await registrationService.registerForEvent({
      eventId,
      attendeeId,
      ipAddress,
      userAgent
    });

    res.status(201).json({
      success: true,
      message: 'Registration confirmed successfully!',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

export async function getMyRegistrations(req, res, next) {
  try {
    const attendeeId = req.user.id;
    const registrations = await registrationService.getAttendeeRegistrations(attendeeId);

    res.status(200).json({
      success: true,
      data: { registrations }
    });
  } catch (error) {
    next(error);
  }
}

export async function requestCancellation(req, res, next) {
  try {
    const { registrationId } = req.params;
    const { reason } = req.validatedBody;
    const attendeeId = req.user.id;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const registration = await registrationService.requestCancellation({
      registrationId,
      attendeeId,
      reason,
      ipAddress,
      userAgent
    });

    res.status(200).json({
      success: true,
      message: 'Cancellation request submitted for organizer review.',
      data: { registration }
    });
  } catch (error) {
    next(error);
  }
}

export async function getPendingCancellationRequests(req, res, next) {
  try {
    const organizerId = req.user.id;
    const requests = await registrationService.getPendingCancellationRequestsForOrganizer(organizerId);

    res.status(200).json({
      success: true,
      data: { requests }
    });
  } catch (error) {
    next(error);
  }
}

export async function approveCancellation(req, res, next) {
  try {
    const { requestId } = req.params;
    const { note } = req.body || {};
    const organizerId = req.user.id;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const registration = await registrationService.processCancellationDecision({
      registrationId: requestId,
      organizerId,
      decision: 'APPROVE',
      note,
      ipAddress,
      userAgent
    });

    res.status(200).json({
      success: true,
      message: 'Cancellation approved and seat released.',
      data: { registration }
    });
  } catch (error) {
    next(error);
  }
}

export async function rejectCancellation(req, res, next) {
  try {
    const { requestId } = req.params;
    const { note } = req.body || {};
    const organizerId = req.user.id;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const registration = await registrationService.processCancellationDecision({
      registrationId: requestId,
      organizerId,
      decision: 'REJECT',
      note,
      ipAddress,
      userAgent
    });

    res.status(200).json({
      success: true,
      message: 'Cancellation request rejected.',
      data: { registration }
    });
  } catch (error) {
    next(error);
  }
}

export async function downloadCalendarIcs(req, res, next) {
  try {
    const { registrationId } = req.params;
    const attendeeId = req.user.id;

    const { icsContent, filename } = await registrationService.getRegistrationCalendarIcs({
      registrationId,
      attendeeId
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.status(200).send(icsContent);
  } catch (error) {
    next(error);
  }
}

export async function updateRegistrationDeadline(req, res, next) {
  try {
    const { eventId } = req.params;
    const organizerId = req.user.id;
    const { registrationDeadline } = req.body;

    const event = await registrationService.updateRegistrationDeadline({
      eventId,
      organizerId,
      registrationDeadline
    });

    res.status(200).json({
      success: true,
      message: registrationDeadline
        ? 'Registration deadline updated successfully.'
        : 'Registration deadline removed successfully.',
      data: { event }
    });
  } catch (error) {
    next(error);
  }
}
