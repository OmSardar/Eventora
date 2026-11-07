import { WebhookEvent } from '../WebhookEvent.js';
import { Payment } from '../Payment.js';
import { SeatReservation } from '../SeatReservation.js';
import { Event } from '../../events/Event.js';
import { Registration } from '../../registrations/Registration.js';
import { User } from '../../users/User.js';
import {
  PAYMENT_STATUS,
  REFUND_STATUS,
  RESERVATION_STATUS,
  REGISTRATION_STATUS,
  NOTIFICATION_TYPE
} from '../../../shared/constants/status.js';
import { dispatchNotification } from '../../notifications/notificationService.js';
import { sendRegistrationConfirmationEmail } from '../../../infrastructure/email/emailService.js';
import { logger } from '../../../infrastructure/logging/logger.js';

/**
 * Persists and idempotently processes an incoming Razorpay webhook event.
 */
export async function processRazorpayWebhookEvent({ eventId, eventType, payload }) {
  // 1. Check for duplicate webhook delivery
  const existingEvent = await WebhookEvent.findOne({ eventId });
  if (existingEvent && existingEvent.status === 'PROCESSED') {
    logger.info({ eventId, eventType }, 'Webhook already processed. Deduplicating.');
    return { status: 'already_processed' };
  }

  // 2. Persist event record durably
  const webhookRecord =
    existingEvent ||
    (await WebhookEvent.create({
      eventId,
      eventType,
      provider: 'RAZORPAY',
      status: 'RECEIVED',
      payload
    }));

  try {
    switch (eventType) {
      case 'payment.captured': {
        const paymentEntity = payload?.payload?.payment?.entity;
        if (!paymentEntity) break;

        const orderId = paymentEntity.order_id;
        const paymentId = paymentEntity.id;
        const payment = await Payment.findOne({ orderId });

        if (payment && payment.status !== PAYMENT_STATUS.CAPTURED) {
          payment.status = PAYMENT_STATUS.CAPTURED;
          payment.paymentId = paymentId;
          payment.method = paymentEntity.method || payment.method;
          await payment.save();

          const reservation = await SeatReservation.findOne({ orderId });
          if (reservation) {
            reservation.status = RESERVATION_STATUS.CONFIRMED;
            await reservation.save();
          }

          if (!payment.registrationId) {
            // Asynchronous fallback: user closed checkout window before /verify callback
            await Event.findByIdAndUpdate(payment.eventId, { $inc: { seatsBooked: 1 } });

            const registration = await Registration.create({
              eventId: payment.eventId,
              attendeeId: payment.attendeeId,
              paymentId: payment._id,
              isPaid: true,
              ticketPrice: payment.amount / 100,
              currency: payment.currency,
              status: REGISTRATION_STATUS.CONFIRMED,
              confirmationEmailSent: false
            });

            payment.registrationId = registration._id;
            await payment.save();

            const event = await Event.findById(payment.eventId);
            const attendeeUser = await User.findById(payment.attendeeId).select('name email');

            if (attendeeUser && attendeeUser.email) {
              sendRegistrationConfirmationEmail({
                registrationId: registration._id.toString(),
                attendee: { name: attendeeUser.name, email: attendeeUser.email },
                event
              }).catch(() => {});
            }

            dispatchNotification({
              userId: payment.attendeeId,
              type: NOTIFICATION_TYPE.BOOKING_CONFIRMED,
              title: 'Booking Confirmed!',
              message: `Payment confirmed for "${event?.title || 'Event'}". Your seat is reserved.`,
              eventId: payment.eventId,
              registrationId: registration._id
            });
          }
        }
        break;
      }

      case 'payment.failed': {
        const paymentEntity = payload?.payload?.payment?.entity;
        if (!paymentEntity) break;

        const orderId = paymentEntity.order_id;
        const payment = await Payment.findOne({ orderId });

        if (payment && payment.status !== PAYMENT_STATUS.CAPTURED) {
          payment.status = PAYMENT_STATUS.FAILED;
          payment.failureDetails = {
            code: paymentEntity.error_code || 'PAYMENT_FAILED',
            description: paymentEntity.error_description || 'Payment failed at gateway',
            source: paymentEntity.error_source || 'gateway',
            reason: paymentEntity.error_reason || 'unknown'
          };
          await payment.save();

          const reservation = await SeatReservation.findOne({ orderId });
          if (reservation && reservation.status === RESERVATION_STATUS.PENDING) {
            reservation.status = RESERVATION_STATUS.CANCELLED;
            await reservation.save();
          }

          dispatchNotification({
            userId: payment.attendeeId,
            type: NOTIFICATION_TYPE.PAYMENT_FAILED,
            title: 'Payment Failed',
            message: 'Your payment could not be processed. Please try again to complete your booking.',
            eventId: payment.eventId
          });
        }
        break;
      }

      case 'refund.processed': {
        const refundEntity = payload?.payload?.refund?.entity;
        if (!refundEntity) break;

        const paymentId = refundEntity.payment_id;
        const payment = await Payment.findOne({ paymentId });

        if (payment && payment.refundStatus !== REFUND_STATUS.PROCESSED) {
          payment.status = PAYMENT_STATUS.REFUNDED;
          payment.refundStatus = REFUND_STATUS.PROCESSED;
          payment.refundId = refundEntity.id;
          await payment.save();

          if (payment.registrationId) {
            const registration = await Registration.findById(payment.registrationId);
            if (registration && registration.status !== REGISTRATION_STATUS.CANCELLED) {
              registration.status = REGISTRATION_STATUS.CANCELLED;
              registration.refundStatus = REFUND_STATUS.PROCESSED;
              await registration.save();

              // Release seat
              await Event.findByIdAndUpdate(registration.eventId, { $inc: { seatsBooked: -1 } });
            }
          }

          dispatchNotification({
            userId: payment.attendeeId,
            type: NOTIFICATION_TYPE.REFUND_PROCESSED,
            title: 'Refund Processed',
            message: 'Your refund has been processed successfully.',
            eventId: payment.eventId
          });
        }
        break;
      }

      case 'refund.failed': {
        const refundEntity = payload?.payload?.refund?.entity;
        if (!refundEntity) break;

        const paymentId = refundEntity.payment_id;
        const payment = await Payment.findOne({ paymentId });

        if (payment) {
          payment.refundStatus = REFUND_STATUS.FAILED;
          payment.failureDetails = {
            code: 'REFUND_FAILED',
            description: 'Gateway reported refund failure'
          };
          await payment.save();

          dispatchNotification({
            userId: payment.attendeeId,
            type: NOTIFICATION_TYPE.REFUND_FAILED,
            title: 'Refund Issue',
            message: 'An issue occurred while processing your refund. Our team has been notified.',
            eventId: payment.eventId
          });
        }
        break;
      }

      default:
        logger.info({ eventType }, 'Unhandled Razorpay webhook event type');
    }

    webhookRecord.status = 'PROCESSED';
    webhookRecord.processedAt = new Date();
    await webhookRecord.save();

    return { status: 'processed' };
  } catch (err) {
    logger.error({ err: err?.message, eventId }, 'Error processing Razorpay webhook event');
    webhookRecord.status = 'FAILED';
    webhookRecord.processingError = err.message;
    await webhookRecord.save();
    throw err;
  }
}
