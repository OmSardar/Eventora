import {
  createCheckoutOrder,
  verifyPaymentAndConfirmBooking,
  getPaymentReconciliationReport,
  reconcileExpiredReservations
} from './paymentService.js';
import { Payment } from './Payment.js';
import mongoose from 'mongoose';

export async function createOrder(req, res, next) {
  try {
    const { eventId } = req.body;
    const orderData = await createCheckoutOrder({
      eventId,
      attendeeId: req.session.userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({
      status: 'success',
      data: orderData
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyPayment(req, res, next) {
  try {
    const { orderId, paymentId, signature } = req.body;
    const result = await verifyPaymentAndConfirmBooking({
      orderId,
      paymentId,
      signature,
      attendeeId: req.session.userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.status(200).json({
      status: 'success',
      message: 'Payment verified and seat booking confirmed.',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

export async function getMyPayments(req, res, next) {
  try {
    const payments = await Payment.find({
      attendeeId: new mongoose.Types.ObjectId(req.session.userId)
    })
      .populate('eventId', 'title eventDate venue ticketPrice currency')
      .populate('registrationId', 'status')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      status: 'success',
      data: { payments }
    });
  } catch (error) {
    next(error);
  }
}

export async function getReconciliation(req, res, next) {
  try {
    const report = await getPaymentReconciliationReport();
    res.status(200).json({
      status: 'success',
      data: report
    });
  } catch (error) {
    next(error);
  }
}

export async function triggerHoldReconciliation(req, res, next) {
  try {
    const result = await reconcileExpiredReservations();
    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

