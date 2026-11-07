import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import crypto from 'crypto';
import app from '../../src/app.js';
import { User } from '../../src/modules/users/User.js';
import { Event } from '../../src/modules/events/Event.js';
import { Registration } from '../../src/modules/registrations/Registration.js';
import { Payment } from '../../src/modules/payments/Payment.js';
import { SeatReservation } from '../../src/modules/payments/SeatReservation.js';
import { WebhookEvent } from '../../src/modules/payments/webhook/WebhookEvent.js';
import {
  createCheckoutOrder,
  verifyPaymentAndConfirmBooking,
  processRefundForCancellation,
  reconcileExpiredReservations
} from '../../src/modules/payments/paymentService.js';
import {
  EVENT_STATUS,
  PAYMENT_STATUS,
  REFUND_STATUS,
  RESERVATION_STATUS,
  REGISTRATION_STATUS
} from '../../src/shared/constants/status.js';
import { ROLES } from '../../src/shared/constants/roles.js';
import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/connection.js';

describe('Payments, Seat Holds & Webhooks (Integration)', () => {
  let organizer;
  let attendee1;
  let attendee2;
  let paidEvent;
  let singleSeatPaidEvent;
  let freeEvent;

  before(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora';
    await connectDatabase(mongoUri);

    organizer = await User.create({
      name: 'Organizer PayTest',
      email: `org_pay_${Date.now()}@example.com`,
      normalizedEmail: `org_pay_${Date.now()}@example.com`,
      passwordHash: 'dummy_hash',
      role: ROLES.ORGANIZER
    });

    attendee1 = await User.create({
      name: 'Attendee PayTest 1',
      email: `att1_pay_${Date.now()}@example.com`,
      normalizedEmail: `att1_pay_${Date.now()}@example.com`,
      passwordHash: 'dummy_hash',
      role: ROLES.ATTENDEE,
      phone: '919876543201',
      smsConsent: true
    });

    attendee2 = await User.create({
      name: 'Attendee PayTest 2',
      email: `att2_pay_${Date.now()}@example.com`,
      normalizedEmail: `att2_pay_${Date.now()}@example.com`,
      passwordHash: 'dummy_hash',
      role: ROLES.ATTENDEE,
      phone: '919876543202',
      smsConsent: true
    });

    paidEvent = await Event.create({
      title: 'Full-Stack Summit (Paid)',
      description: 'Comprehensive paid workshop on enterprise systems.',
      eventDate: new Date(Date.now() + 86400000 * 5),
      venue: 'Metropolis Hall',
      seatLimit: 10,
      seatsBooked: 0,
      isPaid: true,
      ticketPrice: 500,
      currency: 'INR',
      organizerId: organizer._id,
      status: EVENT_STATUS.PUBLISHED
    });

    singleSeatPaidEvent = await Event.create({
      title: 'Exclusive Mentorship (1 Seat)',
      description: 'Intimate single-seat coaching masterclass.',
      eventDate: new Date(Date.now() + 86400000 * 3),
      venue: 'Executive Suite',
      seatLimit: 1,
      seatsBooked: 0,
      isPaid: true,
      ticketPrice: 1500,
      currency: 'INR',
      organizerId: organizer._id,
      status: EVENT_STATUS.PUBLISHED
    });

    freeEvent = await Event.create({
      title: 'Free Community Gathering',
      description: 'Casual open meetup with zero ticket price.',
      eventDate: new Date(Date.now() + 86400000 * 2),
      venue: 'City Park',
      seatLimit: 20,
      seatsBooked: 0,
      isPaid: false,
      ticketPrice: 0,
      currency: 'INR',
      organizerId: organizer._id,
      status: EVENT_STATUS.PUBLISHED
    });
  });

  after(async () => {
    const testEventIds = [paidEvent._id, singleSeatPaidEvent._id, freeEvent._id];
    await SeatReservation.deleteMany({ eventId: { $in: testEventIds } });
    await Payment.deleteMany({ eventId: { $in: testEventIds } });
    await Registration.deleteMany({ eventId: { $in: testEventIds } });
    await Event.deleteMany({ _id: { $in: testEventIds } });
    await User.deleteMany({ _id: { $in: [organizer._id, attendee1._id, attendee2._id] } });
    await disconnectDatabase();
  });

  test('createCheckoutOrder: successfully reserves seat hold and creates Razorpay order', async () => {
    const orderData = await createCheckoutOrder({
      eventId: paidEvent._id.toString(),
      attendeeId: attendee1._id.toString(),
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent'
    });

    assert.ok(orderData.orderId);
    assert.equal(orderData.amount, 50000); // ₹500 in paise
    assert.equal(orderData.currency, 'INR');

    // Verify event seat hold was incremented
    const updatedEvt = await Event.findById(paidEvent._id);
    assert.equal(updatedEvt.seatsBooked, 1);

    // Verify SeatReservation hold was persisted
    const reservation = await SeatReservation.findOne({ orderId: orderData.orderId });
    assert.ok(reservation);
    assert.equal(reservation.status, RESERVATION_STATUS.PENDING);
    assert.ok(reservation.expiresAt > new Date());

    // Verify Payment record created
    const payment = await Payment.findOne({ orderId: orderData.orderId });
    assert.ok(payment);
    assert.equal(payment.status, PAYMENT_STATUS.ORDER_CREATED);
    assert.equal(payment.amount, 50000);
  });

  test('createCheckoutOrder: rejects free event with informative error message', async () => {
    await assert.rejects(
      async () => {
        await createCheckoutOrder({
          eventId: freeEvent._id.toString(),
          attendeeId: attendee1._id.toString(),
          ipAddress: '127.0.0.1',
          userAgent: 'TestAgent'
        });
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.ok(err.message.includes('This is a free event'));
        return true;
      }
    );
  });

  test('Concurrency: multiple attendees competing for 1 seat: only one order succeeds', async () => {
    const attempts = await Promise.allSettled([
      createCheckoutOrder({
        eventId: singleSeatPaidEvent._id.toString(),
        attendeeId: attendee1._id.toString(),
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent'
      }),
      createCheckoutOrder({
        eventId: singleSeatPaidEvent._id.toString(),
        attendeeId: attendee2._id.toString(),
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent'
      })
    ]);

    const fulfilled = attempts.filter((r) => r.status === 'fulfilled');
    const rejected = attempts.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one attendee should secure the seat hold');
    assert.equal(rejected.length, 1, 'The competing attendee must be rejected with sold out');

    // Capacity must not be breached
    const evt = await Event.findById(singleSeatPaidEvent._id);
    assert.equal(evt.seatsBooked, 1);
  });

  test('verifyPaymentAndConfirmBooking: confirms booking with valid signature', async () => {
    // Create new order for attendee2 on paidEvent
    const orderData = await createCheckoutOrder({
      eventId: paidEvent._id.toString(),
      attendeeId: attendee2._id.toString(),
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent'
    });

    const paymentId = 'pay_test_capture_001';
    const secret = process.env.RAZORPAY_KEY_SECRET || 'mock_secret_key_for_testing_purposes_only';
    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(`${orderData.orderId}|${paymentId}`)
      .digest('hex');

    const result = await verifyPaymentAndConfirmBooking({
      orderId: orderData.orderId,
      paymentId,
      signature: validSignature,
      attendeeId: attendee2._id.toString(),
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent'
    });

    assert.ok(result.registration);
    assert.equal(result.registration.status, REGISTRATION_STATUS.CONFIRMED);
    assert.equal(result.registration.isPaid, true);
    assert.equal(result.payment.status, PAYMENT_STATUS.CAPTURED);

    // Verify seat reservation is CONFIRMED
    const hold = await SeatReservation.findOne({ orderId: orderData.orderId });
    assert.equal(hold.status, RESERVATION_STATUS.CONFIRMED);

    // Duplicate call is idempotent and safe
    const repeatResult = await verifyPaymentAndConfirmBooking({
      orderId: orderData.orderId,
      paymentId,
      signature: validSignature,
      attendeeId: attendee2._id.toString(),
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent'
    });
    assert.equal(repeatResult.alreadyConfirmed, true);
  });

  test('verifyPaymentAndConfirmBooking: rejects invalid signature and marks payment FAILED', async () => {
    const orderData = await createCheckoutOrder({
      eventId: paidEvent._id.toString(),
      attendeeId: attendee1._id.toString(),
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent'
    });

    await assert.rejects(
      async () => {
        await verifyPaymentAndConfirmBooking({
          orderId: orderData.orderId,
          paymentId: 'pay_tampered_001',
          signature: 'invalid_tampered_signature_00000000000000000000000000000000000000',
          attendeeId: attendee1._id.toString(),
          ipAddress: '127.0.0.1',
          userAgent: 'TestAgent'
        });
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        return true;
      }
    );

    const payment = await Payment.findOne({ orderId: orderData.orderId });
    assert.equal(payment.status, PAYMENT_STATUS.FAILED);
  });

  test('Webhook: rejects missing or invalid signature with HTTP 400', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .send({ event: 'payment.captured' });

    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test('Webhook: processes payment.captured and deduplicates repeated delivery', async () => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'mock_webhook_secret_for_testing';
    const uniqueEventId = `evt_test_${Date.now()}_999`;
    const payload = {
      event: 'payment.captured',
      event_id: uniqueEventId,
      payload: {
        payment: {
          entity: {
            id: 'pay_webhook_test_001',
            order_id: 'order_webhook_mock_001',
            amount: 50000,
            status: 'captured',
            method: 'upi'
          }
        }
      }
    };

    const rawBody = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    // First delivery
    const res1 = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('x-razorpay-signature', signature)
      .set('Content-Type', 'application/json')
      .send(rawBody);

    assert.equal(res1.status, 200);
    assert.equal(res1.body.status, 'ok');

    // Verify WebhookEvent stored
    const stored = await WebhookEvent.findOne({ eventId: uniqueEventId });
    assert.ok(stored);
    assert.equal(stored.status, 'PROCESSED');

    // Duplicate delivery
    const res2 = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('x-razorpay-signature', signature)
      .set('Content-Type', 'application/json')
      .send(rawBody);

    assert.equal(res2.status, 200);
    assert.equal(res2.body.status, 'ok');
  });

  test('Refund Workflow: organizer approves cancellation -> initiates refund and decrements seat', async () => {
    const refundAttendee = await User.create({
      name: 'Refund Attendee',
      email: `refund_att_${Date.now()}@example.com`,
      normalizedEmail: `refund_att_${Date.now()}@example.com`,
      passwordHash: 'dummy_hash',
      role: ROLES.ATTENDEE
    });

    // 1. Setup a confirmed paid registration
    const payment = await Payment.create({
      attendeeId: refundAttendee._id,
      eventId: paidEvent._id,
      orderId: `order_refund_${Date.now()}`,
      paymentId: `pay_refund_${Date.now()}`,
      amount: 50000,
      currency: 'INR',
      status: PAYMENT_STATUS.CAPTURED,
      idempotencyKey: `idemp_ref_${Date.now()}`
    });

    const reg = await Registration.create({
      eventId: paidEvent._id,
      attendeeId: refundAttendee._id,
      paymentId: payment._id,
      isPaid: true,
      ticketPrice: 500,
      currency: 'INR',
      status: REGISTRATION_STATUS.CANCELLATION_REQUESTED,
      cancellationReason: 'Scheduling clash'
    });

    payment.registrationId = reg._id;
    await payment.save();

    const initialSeatsBooked = (await Event.findById(paidEvent._id)).seatsBooked;

    // 2. Process refund on cancellation
    const refundOutcome = await processRefundForCancellation({
      registrationId: reg._id.toString(),
      organizerId: organizer._id.toString(),
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent'
    });

    assert.ok(refundOutcome.refund);
    assert.equal(refundOutcome.payment.refundStatus, REFUND_STATUS.PROCESSED);
    assert.equal(refundOutcome.registration.status, REGISTRATION_STATUS.CANCELLED);

    // Verify seat capacity was released
    const updatedEvent = await Event.findById(paidEvent._id);
    assert.equal(updatedEvent.seatsBooked, initialSeatsBooked - 1);

    // Attempting duplicate refund throws ConflictError
    await assert.rejects(
      async () => {
        await processRefundForCancellation({
          registrationId: reg._id.toString(),
          organizerId: organizer._id.toString(),
          ipAddress: '127.0.0.1',
          userAgent: 'TestAgent'
        });
      },
      (err) => {
        assert.equal(err.statusCode, 409);
        return true;
      }
    );
  });

  test('Hold Reconciliation: cleans up expired pending seat holds and releases capacity', async () => {
    // Create an expired hold
    const expiredOrderId = `order_expired_${Date.now()}`;
    await Event.findByIdAndUpdate(paidEvent._id, { $inc: { seatsBooked: 1 } });
    const initialSeats = (await Event.findById(paidEvent._id)).seatsBooked;

    await SeatReservation.create({
      eventId: paidEvent._id,
      attendeeId: attendee1._id,
      orderId: expiredOrderId,
      status: RESERVATION_STATUS.PENDING,
      expiresAt: new Date(Date.now() - 60000) // 1 minute in the past
    });

    await Payment.create({
      attendeeId: attendee1._id,
      eventId: paidEvent._id,
      orderId: expiredOrderId,
      amount: 50000,
      currency: 'INR',
      status: PAYMENT_STATUS.ORDER_CREATED,
      idempotencyKey: `idemp_exp_${Date.now()}`
    });

    // Run reconciliation
    const reconResult = await reconcileExpiredReservations();
    assert.ok(reconResult.expiredFound >= 1);
    assert.ok(reconResult.seatsReleased >= 1);

    // Verify hold marked EXPIRED
    const hold = await SeatReservation.findOne({ orderId: expiredOrderId });
    assert.equal(hold.status, RESERVATION_STATUS.EXPIRED);

    // Verify seat decremented back
    const afterSeats = (await Event.findById(paidEvent._id)).seatsBooked;
    assert.equal(afterSeats, initialSeats - 1);
  });
});
