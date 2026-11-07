import * as paymentService from './paymentService.js';

export async function createOrder(req, res, next) {
  try {
    const { eventId } = req.validatedBody;
    const attendeeId = req.user.id;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const result = await paymentService.createOrderWithSeatHold({
      eventId,
      attendeeId,
      ipAddress,
      userAgent
    });

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyPayment(req, res, next) {
  try {
    const { orderId, paymentId, signature } = req.validatedBody;
    const attendeeId = req.user.id;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const result = await paymentService.verifyAndConfirmPayment({
      orderId,
      paymentId,
      signature,
      attendeeId,
      ipAddress,
      userAgent
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
}

export async function getMyPayments(req, res, next) {
  try {
    const attendeeId = req.user.id;
    const payments = await paymentService.getAttendeePayments(attendeeId);

    res.status(200).json({
      success: true,
      data: { payments }
    });
  } catch (error) {
    next(error);
  }
}
