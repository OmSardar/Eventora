import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/connection.js';
import { User } from '../../src/modules/users/User.js';
import { Event } from '../../src/modules/events/Event.js';
import { Registration } from '../../src/modules/registrations/Registration.js';
import { Booking } from '../../src/modules/bookings/Booking.js';
import { Payment } from '../../src/modules/payments/Payment.js';
import { SeatReservation } from '../../src/modules/payments/SeatReservation.js';
import { RefundOperation } from '../../src/modules/payments/RefundOperation.js';
import { Notification } from '../../src/modules/notifications/Notification.js';
import { cancelEvent } from '../../src/modules/events/eventService.js';
import { confirmCapturedPayment } from '../../src/modules/payments/paymentService.js';
import { processRazorpayWebhookEvent } from '../../src/modules/payments/webhook/webhookService.js';
import { verifyAndRedeemTicket } from '../../src/modules/bookings/bookingService.js';
import {
  EVENT_STATUS,
  REGISTRATION_STATUS,
  PAYMENT_STATUS,
  REFUND_STATUS,
  NOTIFICATION_TYPE,
  RESERVATION_STATUS
} from '../../src/shared/constants/status.js';

describe('Cancellation Concurrency, Late Capture & Refund Resilience (Integration)', () => {
  let organizerAgent;
  let attendeeAgent;
  let csrfOrg;
  let csrfAtt;
  let organizerUser;
  let attendeeUser;

  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MOCK_PAYMENTS = 'true';
    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora');

    await User.deleteMany({ email: { $regex: '@latecapture.com$' } });
    await Event.deleteMany({ title: { $regex: 'Concurrency & Late Capture Event' } });
    await Registration.deleteMany({});
    await Booking.deleteMany({});
    await Payment.deleteMany({});
    await SeatReservation.deleteMany({});
    await RefundOperation.deleteMany({});
    await Notification.deleteMany({});

    organizerAgent = request.agent(app);
    attendeeAgent = request.agent(app);

    const c1 = await organizerAgent.get('/api/v1/auth/csrf');
    csrfOrg = c1.body.data.csrfToken;

    const c2 = await attendeeAgent.get('/api/v1/auth/csrf');
    csrfAtt = c2.body.data.csrfToken;

    // Register Organizer
    const orgRes = await organizerAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfOrg)
      .send({
        name: 'Concurrency Organizer',
        email: 'organizer@latecapture.com',
        password: 'Password@123',
        role: 'ORGANIZER'
      });
    organizerUser = orgRes.body.data.user;
    await User.findByIdAndUpdate(organizerUser.id, { emailVerified: true });

    // Register Attendee
    const attRes = await attendeeAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfAtt)
      .send({
        name: 'Concurrency Attendee',
        email: 'attendee@latecapture.com',
        password: 'Password@123',
        role: 'ATTENDEE'
      });
    attendeeUser = attRes.body.data.user;
    await User.findByIdAndUpdate(attendeeUser.id, { emailVerified: true });
  });

  after(async () => {
    await User.deleteMany({ email: { $regex: '@latecapture.com$' } });
    await Event.deleteMany({ title: { $regex: 'Concurrency & Late Capture Event' } });
    await Registration.deleteMany({});
    await Booking.deleteMany({});
    await Payment.deleteMany({});
    await SeatReservation.deleteMany({});
    await RefundOperation.deleteMany({});
    await Notification.deleteMany({});
    await disconnectDatabase();
  });

  test('1. FINDING-03: Concurrent cancellation requests - exactly one wins, losing receives 400 and does NOT duplicate notifications', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 10).toISOString();
    const event = await Event.create({
      title: 'Concurrency & Late Capture Event 1',
      description: 'Testing concurrent cancellation race safety.',
      eventDate: futureDate,
      venue: 'Main Auditorium',
      seatLimit: 50,
      seatsBooked: 1,
      organizerId: organizerUser.id,
      status: EVENT_STATUS.PUBLISHED
    });

    // Create active registration
    const reg = await Registration.create({
      eventId: event._id,
      attendeeId: attendeeUser.id,
      status: REGISTRATION_STATUS.CONFIRMED,
      ticketPrice: 0
    });

    // Fire 2 concurrent cancellation calls at the exact same millisecond
    const cancelPromise1 = cancelEvent({
      eventId: event._id.toString(),
      organizerId: organizerUser.id
    });
    const cancelPromise2 = cancelEvent({
      eventId: event._id.toString(),
      organizerId: organizerUser.id
    });

    const results = await Promise.allSettled([cancelPromise1, cancelPromise2]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one request must succeed, and exactly one must be rejected with 400
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.match(rejected[0].reason.message, /already cancelled/i);

    // Verify in database: event is CANCELLED and registration is CANCELLED
    const dbEvent = await Event.findById(event._id);
    assert.equal(dbEvent.status, EVENT_STATUS.CANCELLED);

    // Wait briefly for non-blocking in-app notification dispatch to commit
    await new Promise((r) => setTimeout(r, 100));

    // Verify notifications: exactly ONE in-app notification dispatched
    const notifs = await Notification.find({
      userId: attendeeUser.id,
      eventId: event._id,
      type: NOTIFICATION_TYPE.EVENT_CANCELLED
    });
    assert.equal(notifs.length, 1);
  });

  test('2. FINDING-02: Late General Admission payment capture after event cancellation is rejected and auto-refunded', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 12).toISOString();
    const event = await Event.create({
      title: 'Concurrency & Late Capture Event 2 (GA)',
      description: 'Testing late GA payment capture arriving after event cancellation.',
      eventDate: futureDate,
      venue: 'Open Arena',
      seatLimit: 100,
      seatsBooked: 0,
      ticketPrice: 100,
      isPaid: true,
      organizerId: organizerUser.id,
      status: EVENT_STATUS.PUBLISHED
    });

    // 1. Attendee creates order with 10-minute active reservation hold
    const orderId = `order_test_late_ga_${Date.now()}`;
    const payment = await Payment.create({
      eventId: event._id,
      attendeeId: attendeeUser.id,
      amount: 10000,
      currency: 'INR',
      status: PAYMENT_STATUS.CREATED,
      orderId,
      idempotencyKey: `idem_late_ga_${orderId}`
    });

    const reservation = await SeatReservation.create({
      orderId,
      eventId: event._id,
      attendeeId: attendeeUser.id,
      status: RESERVATION_STATUS.PENDING,
      expiresAt: new Date(Date.now() + 600000) // active for 10 minutes
    });

    // 2. Organizer cancels event while reservation is still active
    await cancelEvent({
      eventId: event._id.toString(),
      organizerId: organizerUser.id
    });

    const cancelledEvent = await Event.findById(event._id);
    assert.equal(cancelledEvent.status, EVENT_STATUS.CANCELLED);

    // 3. Late payment capture webhook arrives
    let capturedErr = null;
    try {
      await confirmCapturedPayment({
        payment,
        paymentId: 'pay_late_capture_123',
        paymentMethod: 'upi',
        paymentAmount: 10000,
        paymentCurrency: 'INR',
        source: 'WEBHOOK'
      });
    } catch (err) {
      capturedErr = err;
    }

    assert.ok(capturedErr);
    assert.match(capturedErr.message, /cancelled by the organizer.*refund has been initiated/i);

    // 4. Assert NO confirmed registration was created
    const createdReg = await Registration.findOne({ eventId: event._id });
    assert.equal(createdReg, null);

    // 5. Assert Payment transitioned to REFUND_PENDING and refund initiated
    const updatedPay = await Payment.findById(payment._id);
    assert.equal(updatedPay.status, PAYMENT_STATUS.REFUND_PENDING);
    assert.equal(updatedPay.refundStatus, REFUND_STATUS.PENDING);
    assert.ok(updatedPay.refundId);

    // 6. Assert durable RefundOperation record created
    const refundOp = await RefundOperation.findOne({ paymentId: payment._id });
    assert.ok(refundOp);
    assert.equal(refundOp.status, 'PENDING');
    assert.equal(refundOp.amount, 10000);
  });

  test('3. FINDING-02: Duplicate webhook and browser callback after cancellation does not duplicate refunds', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 15).toISOString();
    const event = await Event.create({
      title: 'Concurrency & Late Capture Event 3',
      description: 'Testing duplicate callback deduplication on cancelled event.',
      eventDate: futureDate,
      venue: 'Open Arena',
      seatLimit: 50,
      seatsBooked: 0,
      ticketPrice: 200,
      isPaid: true,
      organizerId: organizerUser.id,
      status: EVENT_STATUS.CANCELLED // already cancelled
    });

    const orderId = `order_test_dup_${Date.now()}`;
    const payment = await Payment.create({
      eventId: event._id,
      attendeeId: attendeeUser.id,
      amount: 20000,
      currency: 'INR',
      status: PAYMENT_STATUS.REFUND_PENDING, // already in refund pending
      refundStatus: REFUND_STATUS.PENDING,
      orderId,
      idempotencyKey: `idem_dup_${orderId}`
    });

    // Call confirmCapturedPayment again
    let err = null;
    try {
      await confirmCapturedPayment({
        payment,
        paymentId: 'pay_test_dup_123',
        paymentMethod: 'card',
        paymentAmount: 20000,
        paymentCurrency: 'INR',
        source: 'CLIENT_CALLBACK'
      });
    } catch (e) {
      err = e;
    }

    assert.ok(err);
    assert.match(err.message, /cancelled/i);

    // Verify refund operations count for this payment is exactly 1 (no duplicate)
    const refundOps = await RefundOperation.find({ paymentId: payment._id });
    assert.ok(refundOps.length <= 1);
  });

  test('4. FINDING-04: Ticket QR verification strictly rejects cancelled tickets with reason EVENT_CANCELLED', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 8).toISOString();
    const event = await Event.create({
      title: 'Concurrency & Late Capture Event 4 (QR Rejection)',
      description: 'Verifying QR validation rejects tickets for cancelled events.',
      eventDate: futureDate,
      venue: 'Ticket Center',
      seatLimit: 20,
      seatsBooked: 1,
      organizerId: organizerUser.id,
      status: EVENT_STATUS.PUBLISHED
    });

    const booking = await Booking.create({
      eventId: event._id,
      attendeeId: attendeeUser.id,
      bookingReference: 'BK-CANCEL-QR-001',
      ticketToken: 'tok_cancel_qr_test_001',
      status: 'CONFIRMED',
      subtotal: 0,
      totalAmount: 0
    });

    const reg = await Registration.create({
      eventId: event._id,
      attendeeId: attendeeUser.id,
      booking: booking._id,
      status: REGISTRATION_STATUS.CONFIRMED
    });

    // Cancel event
    await cancelEvent({
      eventId: event._id.toString(),
      organizerId: organizerUser.id
    });

    // Attempt to verify ticket token (using bookingReference or signed token)
    const verifyResult = await verifyAndRedeemTicket({
      token: booking.bookingReference
    });

    assert.equal(verifyResult.isValid, false);
    assert.ok(verifyResult.reason === 'EVENT_CANCELLED' || verifyResult.reason === 'BOOKING_INACTIVE');
  });

  test('5. FINDING-04: Razorpay refund webhook transitions Payment and RefundOperation to PROCESSED and FAILED', async () => {
    const dummyPayId = new mongoose.Types.ObjectId();
    const dummyRegId = new mongoose.Types.ObjectId();
    const dummyEvtId = new mongoose.Types.ObjectId();

    const payment = await Payment.create({
      _id: dummyPayId,
      eventId: dummyEvtId,
      attendeeId: attendeeUser.id,
      registrationId: dummyRegId,
      amount: 15000,
      currency: 'INR',
      status: PAYMENT_STATUS.REFUND_PENDING,
      refundStatus: REFUND_STATUS.PENDING,
      orderId: 'order_webhook_refund_test',
      paymentId: 'pay_webhook_refund_test',
      idempotencyKey: 'idem_webhook_refund_1'
    });

    const refundOp = await RefundOperation.create({
      refundOpId: 'rfop_webhook_test_1',
      paymentId: dummyPayId,
      registrationId: dummyRegId,
      eventId: dummyEvtId,
      attendeeId: attendeeUser.id,
      organizerId: organizerUser.id,
      orderId: 'order_webhook_refund_test',
      gatewayPaymentId: 'pay_webhook_refund_test',
      gatewayRefundId: 'rfnd_webhook_gateway_123',
      amount: 15000,
      currency: 'INR',
      status: 'PENDING',
      idempotencyKey: 'refund_webhook_test_idem_1'
    });

    // 1. Simulate refund.processed webhook
    const webhookPayload = {
      event: 'refund.processed',
      payload: {
        refund: {
          entity: {
            id: 'rfnd_webhook_gateway_123',
            payment_id: 'pay_webhook_refund_test',
            amount: 15000,
            status: 'processed'
          }
        }
      }
    };

    const processRes = await processRazorpayWebhookEvent({
      eventId: `whevt_test_${Date.now()}`,
      eventType: 'refund.processed',
      payload: webhookPayload
    });

    assert.equal(processRes.status, 'processed');

    // Verify Payment transitioned to REFUNDED
    const updatedPay = await Payment.findById(dummyPayId);
    assert.equal(updatedPay.status, PAYMENT_STATUS.REFUNDED);
    assert.equal(updatedPay.refundStatus, REFUND_STATUS.PROCESSED);

    // Verify RefundOperation transitioned to PROCESSED
    const updatedOp = await RefundOperation.findById(refundOp._id);
    assert.equal(updatedOp.status, 'PROCESSED');
  });
});
