import * as seatingService from './seatingService.js';
import * as bookingService from '../bookings/bookingService.js';

export async function getSeats(req, res, next) {
  try {
    const { eventId } = req.params;
    const seats = await seatingService.getEventSeats(eventId);
    res.status(200).json({
      success: true,
      data: { seats }
    });
  } catch (err) {
    next(err);
  }
}

export async function createHold(req, res, next) {
  try {
    const { eventId } = req.params;
    const { seatIds } = req.validatedBody;
    const attendeeId = req.session.user.id;

    const hold = await seatingService.createSeatHold({
      eventId,
      attendeeId,
      seatIds,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({
      success: true,
      message: 'Seats held successfully for 10 minutes.',
      data: hold
    });
  } catch (err) {
    next(err);
  }
}

export async function releaseHold(req, res, next) {
  try {
    const { holdId } = req.params;
    const attendeeId = req.session.user.id;

    const result = await seatingService.releaseSeatHold({
      holdId,
      attendeeId
    });

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (err) {
    next(err);
  }
}

export async function generateSeats(req, res, next) {
  try {
    const { eventId } = req.params;
    const layoutOptions = req.validatedBody || {};

    const result = await seatingService.generateEventSeats(eventId, layoutOptions);

    res.status(200).json({
      success: true,
      message: `Generated venue layout with ${result.seatCount} seats.`,
      data: result
    });
  } catch (err) {
    next(err);
  }
}

export async function toggleBlock(req, res, next) {
  try {
    const { eventId, seatId } = req.params;
    const { block } = req.validatedBody;
    const organizerId = req.session.user.id;

    const result = await seatingService.toggleSeatBlock({
      eventId,
      seatId,
      organizerId,
      block
    });

    res.status(200).json({
      success: true,
      message: block ? 'Seat blocked successfully.' : 'Seat unblocked and now available.',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

export async function getSeatingDashboard(req, res, next) {
  try {
    const { eventId } = req.params;
    const organizerId = req.session.user.id;

    const result = await seatingService.getOrganizerSeatingDashboard({
      eventId,
      organizerId
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}

export async function confirmFreeBooking(req, res, next) {
  try {
    const { eventId } = req.params;
    const { holdId } = req.validatedBody;
    const attendeeId = req.session.user.id;

    const result = await bookingService.confirmFreeAssignedBooking({
      eventId,
      holdId,
      attendeeId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({
      success: true,
      message: 'Free seat reservation confirmed successfully.',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

export async function getDigitalTickets(req, res, next) {
  try {
    const { bookingId } = req.params;
    const userId = req.session.user.id;

    const tickets = await bookingService.getDigitalTickets(bookingId, userId);

    res.status(200).json({
      success: true,
      data: tickets
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyTicket(req, res, next) {
  try {
    const token = req.query?.token || req.body?.token;
    const markRedeemed = req.query?.markRedeemed === 'true' || req.body?.markRedeemed === true;
    const scannerUserId = req.user?.id || req.session?.user?.id || null;

    const result = await bookingService.verifyAndRedeemTicket({
      token,
      scannerUserId,
      markRedeemed
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}
