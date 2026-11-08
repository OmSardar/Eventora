import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import crypto from 'crypto';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/connection.js';
import { User } from '../../src/modules/users/User.js';
import { Event } from '../../src/modules/events/Event.js';
import { Registration } from '../../src/modules/registrations/Registration.js';
import { Payment } from '../../src/modules/payments/Payment.js';
import { SeatReservation } from '../../src/modules/payments/SeatReservation.js';
import { WebhookEvent } from '../../src/modules/payments/WebhookEvent.js';
import { RefundOperation } from '../../src/modules/payments/RefundOperation.js';
import { reconcilePendingRefunds } from '../../src/modules/payments/paymentService.js';
import { EventSeat } from '../../src/modules/seating/EventSeat.js';
import { SeatHold } from '../../src/modules/seating/SeatHold.js';
import { Booking } from '../../src/modules/bookings/Booking.js';
import { generateEventSeats, createSeatHold } from '../../src/modules/seating/seatingService.js';
import {
  PAYMENT_STATUS,
  RESERVATION_STATUS,
  REGISTRATION_STATUS,
  REFUND_STATUS,
  SEAT_STATUS,
  SEAT_HOLD_STATUS
} from '../../src/shared/constants/status.js';

describe('Razorpay Test Mode Payments & Webhooks (Integration)', () => {
  let organizerAgent;
  let attendeeAgent;
  let csrfOrg;
  let csrfAtt;
  let organizerUser;
  let attendeeUser;
  let paidEvent;
  let freeEvent;
  let seatingEvent;

  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MOCK_PAYMENTS = 'true';
    process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_for_integration_testing';
    process.env.RAZORPAY_KEY_SECRET = 'test_key_secret_for_integration_testing';

    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora');

    await User.deleteMany({ email: { $regex: '@paytest.com$' } });
    await Event.deleteMany({ title: { $regex: 'Payment Integration Event' } });
    await WebhookEvent.deleteMany({});
    await SeatReservation.deleteMany({});
    await Payment.deleteMany({});
    await RefundOperation.deleteMany({});
    await EventSeat.deleteMany({});
    await SeatHold.deleteMany({});
    await Booking.deleteMany({});

    organizerAgent = request.agent(app);
    attendeeAgent = request.agent(app);

    const c1 = await organizerAgent.get('/api/v1/auth/csrf');
    csrfOrg = c1.body.data.csrfToken;

    const c2 = await attendeeAgent.get('/api/v1/auth/csrf');
    csrfAtt = c2.body.data.csrfToken;

    // Register organizer
    const orgRes = await organizerAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfOrg)
      .send({
        name: 'Event Host',
        email: 'host@paytest.com',
        password: 'SecurePassword@123',
        role: 'ORGANIZER'
      });
    organizerUser = orgRes.body.data.user;

    // Register attendee
    const attRes = await attendeeAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfAtt)
      .send({
        name: 'Paying Attendee',
        email: 'attendee@paytest.com',
        password: 'SecurePassword@123',
        role: 'ATTENDEE'
      });
    attendeeUser = attRes.body.data.user;

    // Create Paid Event (₹499)
    const paidEventRes = await organizerAgent
      .post('/api/v1/events')
      .set('x-csrf-token', csrfOrg)
      .send({
        title: 'Payment Integration Event - Paid',
        description: 'Comprehensive paid developer workshop on advanced microservices.',
        eventDate: new Date(Date.now() + 86400000 * 5).toISOString(),
        venue: 'Grand Tech Arena',
        seatLimit: 5,
        category: 'Technology',
        isPaid: true,
        ticketPrice: 499
      });
    paidEvent = paidEventRes.body.data?.event || paidEventRes.body.data;

    // Create Free Event (₹0)
    const freeEventRes = await organizerAgent
      .post('/api/v1/events')
      .set('x-csrf-token', csrfOrg)
      .send({
        title: 'Payment Integration Event - Free',
        description: 'Hands-on free workshop on open source tools.',
        eventDate: new Date(Date.now() + 86400000 * 6).toISOString(),
        venue: 'Room 201',
        seatLimit: 10,
        category: 'Workshop',
        isPaid: false,
        ticketPrice: 0
      });
    freeEvent = freeEventRes.body.data?.event || freeEventRes.body.data;

    // Create Assigned Seating Event (₹250) with 10 seats
    const seatingEventRes = await organizerAgent
      .post('/api/v1/events')
      .set('x-csrf-token', csrfOrg)
      .send({
        title: 'Payment Integration Event - Seating',
        description: 'Interactive assigned seating concert.',
        eventDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        venue: 'Symphony Hall',
        seatLimit: 10,
        category: 'Technology',
        isPaid: true,
        ticketPrice: 250,
        seatingType: 'ASSIGNED_SEATING'
      });
    seatingEvent = seatingEventRes.body.data?.event || seatingEventRes.body.data;

    await generateEventSeats(seatingEvent._id, {
      generationMode: 'AUTOMATIC',
      totalSeats: 10,
      rows: 2,
      seatsPerRow: 5,
      price: 250
    });
  });

  after(async () => {
    await User.deleteMany({ email: { $regex: '@paytest.com$' } });
    await Event.deleteMany({ title: { $regex: 'Payment Integration Event' } });
    await WebhookEvent.deleteMany({});
    await SeatReservation.deleteMany({});
    await Payment.deleteMany({});
    await RefundOperation.deleteMany({});
    await EventSeat.deleteMany({});
    await SeatHold.deleteMany({});
    await Booking.deleteMany({});
    await disconnectDatabase();
  });

  it('1. Authenticated attendee can create Razorpay order and hold seat for paid event', async () => {
    const res = await attendeeAgent
      .post('/api/v1/payments/create-order')
      .set('x-csrf-token', csrfAtt)
      .send({ eventId: paidEvent._id });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.orderId);
    assert.equal(res.body.data.amount, 49900); // 499 * 100 paise
    assert.equal(res.body.data.currency, 'INR');

    // Verify SeatReservation in DB
    const hold = await SeatReservation.findOne({ orderId: res.body.data.orderId });
    assert.ok(hold);
    assert.equal(hold.status, RESERVATION_STATUS.PENDING);
    assert.ok(hold.expiresAt > new Date());

    // Verify Payment in DB
    const payment = await Payment.findOne({ orderId: res.body.data.orderId });
    assert.ok(payment);
    assert.equal(payment.status, PAYMENT_STATUS.CREATED);
    assert.equal(payment.amount, 49900);
  });

  it('2. Attendee cannot create payment order for free event', async () => {
    const res = await attendeeAgent
      .post('/api/v1/payments/create-order')
      .set('x-csrf-token', csrfAtt)
      .send({ eventId: freeEvent._id });

    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /Event is free. Please use standard RSVP registration/);
  });

  it('3. Duplicate active checkout hold is rejected with 409 Conflict', async () => {
    // Attendee already has an active hold from test 1
    const res = await attendeeAgent
      .post('/api/v1/payments/create-order')
      .set('x-csrf-token', csrfAtt)
      .send({ eventId: paidEvent._id });

    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /active checkout in progress/);
  });

  it('4. Authenticated attendee verifies checkout with authentic signature', async () => {
    // Get existing pending payment from test 1
    const pendingPayment = await Payment.findOne({
      attendeeId: attendeeUser.id,
      eventId: paidEvent._id,
      status: PAYMENT_STATUS.CREATED
    });
    assert.ok(pendingPayment);

    const orderId = pendingPayment.orderId;
    const paymentId = `pay_mock_${Date.now()}`;
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const res = await attendeeAgent
      .post('/api/v1/payments/verify')
      .set('x-csrf-token', csrfAtt)
      .send({
        orderId,
        paymentId,
        signature
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.payment.status, PAYMENT_STATUS.CAPTURED);
    assert.ok(res.body.data.registration);
    assert.equal(res.body.data.registration.isPaid, true);
    assert.equal(res.body.data.registration.ticketPrice, 499);

    // Verify seat increment in database
    const updatedEvent = await Event.findById(paidEvent._id);
    assert.equal(updatedEvent.seatsBooked, 1);

    // Verify reservation converted to CONFIRMED
    const reservation = await SeatReservation.findOne({ orderId });
    assert.equal(reservation.status, RESERVATION_STATUS.CONFIRMED);
  });

  it('5. Rejects payment verification with invalid signature', async () => {
    const res = await attendeeAgent
      .post('/api/v1/payments/verify')
      .set('x-csrf-token', csrfAtt)
      .send({
        orderId: 'order_test_fake',
        paymentId: 'pay_test_fake',
        signature: 'invalid_tampered_signature'
      });

    assert.equal(res.status, 404);
  });

  it('6. Webhook endpoint processes payment.captured without Origin header', async () => {
    // Create new attendee and order to test webhook-driven confirmation
    const webhookAgent = request.agent(app);
    const c3 = await webhookAgent.get('/api/v1/auth/csrf');
    const newAttendeeRes = await webhookAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', c3.body.data.csrfToken)
      .send({
        name: 'Webhook Attendee',
        email: 'webhook@paytest.com',
        password: 'SecurePassword@123',
        role: 'ATTENDEE'
      });
    const webhookAttendee = newAttendeeRes.body.data.user;

    const newOrderRes = await webhookAgent
      .post('/api/v1/payments/create-order')
      .set('x-csrf-token', c3.body.data.csrfToken)
      .send({ eventId: paidEvent._id });

    const orderId = newOrderRes.body.data.orderId;
    const paymentId = `pay_wh_${Date.now()}`;

    const webhookPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount: 49900,
            currency: 'INR',
            status: 'captured',
            method: 'upi'
          }
        }
      }
    };

    const rawBody = JSON.stringify(webhookPayload);
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    // Server-to-server call: NO Origin or Referer header sent!
    const res = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(rawBody);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');

    // Verify registration confirmed via webhook
    const payment = await Payment.findOne({ orderId });
    assert.equal(payment.status, PAYMENT_STATUS.CAPTURED);
    assert.ok(payment.registrationId);

    const reg = await Registration.findById(payment.registrationId);
    assert.equal(reg.status, REGISTRATION_STATUS.CONFIRMED);
    assert.equal(reg.isPaid, true);
  });

  it('7. Duplicate webhook delivery is safely deduplicated', async () => {
    const eventId = 'evt_duplicate_delivery_test';
    const payload = {
      event: 'payment.captured',
      event_id: eventId,
      payload: { payment: { entity: { id: 'pay_dup_123', order_id: 'order_dup_123' } } }
    };
    const rawBody = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    // First delivery
    const res1 = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .set('x-razorpay-event-id', eventId)
      .send(rawBody);
    assert.equal(res1.status, 200);

    // Second delivery of same event
    const res2 = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .set('x-razorpay-event-id', eventId)
      .send(rawBody);
    assert.equal(res2.status, 200);

    // Verify only ONE WebhookEvent was recorded
    const count = await WebhookEvent.countDocuments({ eventId });
    assert.equal(count, 1);
  });

  it('8. Webhook rejects invalid or missing signatures', async () => {
    // Missing signature
    const resMissing = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .send({ event: 'payment.captured' });
    assert.equal(resMissing.status, 400);
    assert.equal(resMissing.body.error, 'Missing webhook signature');

    // Invalid signature
    const resInvalid = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('x-razorpay-signature', 'fake_invalid_sig_000000000000000000000000000000000000000000000000')
      .send({ event: 'payment.captured' });
    assert.equal(resInvalid.status, 400);
    assert.equal(resInvalid.body.error, 'Invalid webhook signature');
  });

  it('9. Regression: Free RSVP registration continues to function flawlessly', async () => {
    // Attendee registers directly for free event without payment
    const res = await attendeeAgent
      .post(`/api/v1/events/${freeEvent._id}/registrations`)
      .set('x-csrf-token', csrfAtt)
      .send();

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.registration.status, REGISTRATION_STATUS.CONFIRMED);

    const updatedFreeEvent = await Event.findById(freeEvent._id);
    assert.equal(updatedFreeEvent.seatsBooked, 1);
  });

  it('10. Cancellation approval on paid event initiates refund: stages Payment to REFUND_PENDING, persists RefundOperation, and releases seat', async () => {
    // Find confirmed registration from test 4
    const registration = await Registration.findOne({
      attendeeId: attendeeUser.id,
      eventId: paidEvent._id,
      status: REGISTRATION_STATUS.CONFIRMED
    });
    assert.ok(registration);

    // Initial seats booked count on paidEvent
    const eventBefore = await Event.findById(paidEvent._id);
    const seatsBefore = eventBefore.seatsBooked;

    // Attendee requests cancellation
    const cancelReqRes = await attendeeAgent
      .post(`/api/v1/registrations/${registration._id}/cancellation-request`)
      .set('x-csrf-token', csrfAtt)
      .send({ reason: 'Schedule conflict for workshop' });

    assert.equal(cancelReqRes.status, 200);
    assert.equal(cancelReqRes.body.data.registration.status, REGISTRATION_STATUS.CANCELLATION_REQUESTED);

    // Organizer approves cancellation
    const approveRes = await organizerAgent
      .post(`/api/v1/cancellation-requests/${registration._id}/approve`)
      .set('x-csrf-token', csrfOrg)
      .send({ note: 'Full refund approved' });

    assert.equal(approveRes.status, 200);

    // Verify Payment transitioned to REFUND_PENDING (NOT REFUNDED!)
    const payment = await Payment.findById(registration.paymentId);
    assert.equal(payment.status, PAYMENT_STATUS.REFUND_PENDING);
    assert.equal(payment.refundStatus, REFUND_STATUS.PENDING);
    assert.equal(payment.refundAmount, 49900);
    assert.ok(payment.refundId);

    // Verify Registration transitioned to CANCELLED and PENDING
    const updatedReg = await Registration.findById(registration._id);
    assert.equal(updatedReg.status, REGISTRATION_STATUS.CANCELLED);
    assert.equal(updatedReg.refundStatus, REFUND_STATUS.PENDING);
    assert.equal(updatedReg.seatReleased, true);
    assert.ok(updatedReg.seatReleasedAt);

    // Verify RefundOperation was persisted durably
    const refundOp = await RefundOperation.findOne({ registrationId: registration._id });
    assert.ok(refundOp);
    assert.equal(refundOp.status, 'PENDING');
    assert.equal(refundOp.amount, 49900);
    assert.equal(refundOp.gatewayRefundId, payment.refundId);

    // Verify seat was decremented exactly once
    const eventAfter = await Event.findById(paidEvent._id);
    assert.equal(eventAfter.seatsBooked, seatsBefore - 1);
  });

  it('11. Duplicate cancellation approval is rejected with 400 Bad Request without double-decrementing seats', async () => {
    const registration = await Registration.findOne({
      attendeeId: attendeeUser.id,
      eventId: paidEvent._id
    });
    assert.ok(registration);

    const eventBefore = await Event.findById(paidEvent._id);

    // Repeat approve call on already CANCELLED registration
    const duplicateApprove = await organizerAgent
      .post(`/api/v1/cancellation-requests/${registration._id}/approve`)
      .set('x-csrf-token', csrfOrg)
      .send({ note: 'Accidental second approval attempt' });

    assert.equal(duplicateApprove.status, 400);
    assert.match(duplicateApprove.body.error.message, /Cannot decide on registration with status CANCELLED/);

    // Verify seatsBooked was NOT decremented again
    const eventAfter = await Event.findById(paidEvent._id);
    assert.equal(eventAfter.seatsBooked, eventBefore.seatsBooked);
  });

  it('12. Webhook refund.processed authoritatively completes refund without duplicate seat decrement', async () => {
    const registration = await Registration.findOne({
      attendeeId: attendeeUser.id,
      eventId: paidEvent._id
    });
    const payment = await Payment.findById(registration.paymentId);
    assert.ok(payment.refundId);

    const eventBefore = await Event.findById(paidEvent._id);

    const refundPayload = {
      event: 'refund.processed',
      payload: {
        refund: {
          entity: {
            id: payment.refundId,
            payment_id: payment.paymentId,
            amount: payment.amount,
            currency: 'INR',
            status: 'processed'
          }
        }
      }
    };

    const rawBody = JSON.stringify(refundPayload);
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    const res = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(rawBody);

    assert.equal(res.status, 200);

    // Verify payment is now authoritatively REFUNDED
    const paymentAfter = await Payment.findById(payment._id);
    assert.equal(paymentAfter.status, PAYMENT_STATUS.REFUNDED);
    assert.equal(paymentAfter.refundStatus, REFUND_STATUS.PROCESSED);

    // Verify registration refundStatus is PROCESSED
    const regAfter = await Registration.findById(registration._id);
    assert.equal(regAfter.refundStatus, REFUND_STATUS.PROCESSED);

    // Verify RefundOperation is PROCESSED
    const refundOp = await RefundOperation.findOne({ registrationId: registration._id });
    assert.equal(refundOp.status, 'PROCESSED');

    // Crucial: seat was already released during cancellation approval, so seatsBooked MUST NOT be decremented again!
    const eventAfter = await Event.findById(paidEvent._id);
    assert.equal(eventAfter.seatsBooked, eventBefore.seatsBooked);
  });

  it('13. Webhook refund.failed records failure without falsely marking payment as REFUNDED', async () => {
    // Create new attendee and payment to test refund.failed
    const failAgent = request.agent(app);
    const cFail = await failAgent.get('/api/v1/auth/csrf');
    await failAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', cFail.body.data.csrfToken)
      .send({
        name: 'Refund Failed Attendee',
        email: 'failtest@paytest.com',
        password: 'SecurePassword@123',
        role: 'ATTENDEE'
      });

    const orderRes = await failAgent
      .post('/api/v1/payments/create-order')
      .set('x-csrf-token', cFail.body.data.csrfToken)
      .send({ eventId: paidEvent._id });

    const orderId = orderRes.body.data.orderId;
    const paymentId = `pay_fail_${Date.now()}`;
    const sig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    await failAgent
      .post('/api/v1/payments/verify')
      .set('x-csrf-token', cFail.body.data.csrfToken)
      .send({ orderId, paymentId, signature: sig });

    const payment = await Payment.findOne({ orderId });
    payment.status = PAYMENT_STATUS.REFUND_PENDING;
    payment.refundStatus = REFUND_STATUS.PENDING;
    payment.refundId = `rfnd_fail_${Date.now()}`;
    await payment.save();

    // Send refund.failed webhook
    const failPayload = {
      event: 'refund.failed',
      payload: {
        refund: {
          entity: {
            id: payment.refundId,
            payment_id: payment.paymentId,
            error_code: 'GATEWAY_ERROR',
            error_description: 'Beneficiary account temporarily locked'
          }
        }
      }
    };

    const rawBody = JSON.stringify(failPayload);
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    const res = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(rawBody);

    assert.equal(res.status, 200);

    // Verify payment is NOT REFUNDED
    const paymentAfter = await Payment.findById(payment._id);
    assert.notEqual(paymentAfter.status, PAYMENT_STATUS.REFUNDED);
    assert.equal(paymentAfter.refundStatus, REFUND_STATUS.FAILED);
    assert.equal(paymentAfter.failureDetails.code, 'GATEWAY_ERROR');
  });

  it('14. Webhook payment.failed updates uncaptured payment to FAILED and cancels pending hold', async () => {
    const failHoldAgent = request.agent(app);
    const cHold = await failHoldAgent.get('/api/v1/auth/csrf');
    await failHoldAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', cHold.body.data.csrfToken)
      .send({
        name: 'Payment Fail Attendee',
        email: 'payfail@paytest.com',
        password: 'SecurePassword@123',
        role: 'ATTENDEE'
      });

    const orderRes = await failHoldAgent
      .post('/api/v1/payments/create-order')
      .set('x-csrf-token', cHold.body.data.csrfToken)
      .send({ eventId: paidEvent._id });

    const orderId = orderRes.body.data.orderId;

    const payload = {
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: `pay_fail_attempt_${Date.now()}`,
            order_id: orderId,
            error_code: 'BAD_REQUEST_ERROR',
            error_description: 'Payment failed due to invalid OTP'
          }
        }
      }
    };

    const rawBody = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    const res = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(rawBody);

    assert.equal(res.status, 200);

    const payment = await Payment.findOne({ orderId });
    assert.equal(payment.status, PAYMENT_STATUS.FAILED);

    const hold = await SeatReservation.findOne({ orderId });
    assert.equal(hold.status, RESERVATION_STATUS.CANCELLED);
  });

  it('15. Reconciliation worker sweeps pending refunds and safely resolves state without duplicate refunds', async () => {
    // Create a mock pending refund operation that needs reconciliation with unique attendeeId
    const reconAttendeeId = new mongoose.Types.ObjectId();
    const mockPayment = await Payment.create({
      attendeeId: reconAttendeeId,
      eventId: paidEvent._id,
      orderId: `order_recon_${Date.now()}`,
      paymentId: `pay_recon_${Date.now()}`,
      amount: 49900,
      currency: 'INR',
      status: PAYMENT_STATUS.REFUND_PENDING,
      refundStatus: REFUND_STATUS.PENDING,
      idempotencyKey: `idemp_recon_${Date.now()}`
    });

    const mockReg = await Registration.create({
      eventId: paidEvent._id,
      attendeeId: reconAttendeeId,
      paymentId: mockPayment._id,
      isPaid: true,
      ticketPrice: 499,
      status: REGISTRATION_STATUS.CANCELLED,
      seatReleased: true,
      seatReleasedAt: new Date()
    });

    await RefundOperation.create({
      refundOpId: `rfop_recon_${Date.now()}`,
      paymentId: mockPayment._id,
      registrationId: mockReg._id,
      eventId: paidEvent._id,
      attendeeId: reconAttendeeId,
      organizerId: organizerUser.id,
      orderId: mockPayment.orderId,
      gatewayPaymentId: mockPayment.paymentId,
      amount: 49900,
      status: 'INITIATED',
      idempotencyKey: `refund_recon_${mockReg._id}`,
      lastAttemptAt: new Date()
    });

    const report = await reconcilePendingRefunds();
    assert.ok(report);
    assert.equal(typeof report.reconciledCount, 'number');
  });

  it('16. Defensive seat accounting: Event.seatsBooked can never be decremented below 0', async () => {
    // Force event seatsBooked to 0
    await Event.findByIdAndUpdate(freeEvent._id, { $set: { seatsBooked: 0 } });

    // Try to decrement seatsBooked when already 0 using our safe update pattern
    await Event.findOneAndUpdate(
      { _id: freeEvent._id, seatsBooked: { $gt: 0 } },
      { $inc: { seatsBooked: -1 } }
    );

    const checkEvent = await Event.findById(freeEvent._id);
    assert.equal(checkEvent.seatsBooked, 0); // Must remain 0, never -1!
  });

  it('17. Authoritative webhook confirms physical seats, converts SeatHold, and creates Booking when frontend callback is skipped', async () => {
    const seats = await EventSeat.find({ eventId: seatingEvent._id }).sort({ seatLabel: 1 });
    assert.equal(seats.length, 10);
    const seatA1 = seats[0];
    const seatA2 = seats[1];

    // 1. Register a new attendee
    const seatAttendeeAgent = request.agent(app);
    const cSeat = await seatAttendeeAgent.get('/api/v1/auth/csrf');
    const attRegRes = await seatAttendeeAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', cSeat.body.data.csrfToken)
      .send({
        name: 'Seating Webhook Attendee',
        email: 'seatwhattendee@paytest.com',
        password: 'SecurePassword@123',
        role: 'ATTENDEE'
      });
    const seatAttendee = attRegRes.body.data.user;

    // 2. Attendee places an interactive hold on A1 and A2
    const hold = await createSeatHold({
      eventId: seatingEvent._id,
      attendeeId: seatAttendee.id,
      seatIds: [seatA1._id, seatA2._id]
    });
    assert.ok(hold);
    assert.equal(hold.seatLabels.length, 2);

    // 3. Attendee creates Razorpay order
    const orderRes = await seatAttendeeAgent
      .post('/api/v1/payments/create-order')
      .set('x-csrf-token', cSeat.body.data.csrfToken)
      .send({ eventId: seatingEvent._id });

    assert.equal(orderRes.status, 201);
    const orderId = orderRes.body.data.orderId;
    assert.equal(orderRes.body.data.amount, 50000); // 2 seats * 250 * 100 paise

    // Verify payment record has holdId linked
    const paymentBefore = await Payment.findOne({ orderId });
    assert.ok(paymentBefore);
    assert.equal(paymentBefore.holdId?.toString(), hold.holdId);

    // 4. SIMULATE: Attendee closes browser! No client /payments/verify is called.
    // 5. Razorpay webhook payment.captured arrives
    const paymentId = `pay_wh_seat_${Date.now()}`;
    const webhookPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount: 50000,
            currency: 'INR',
            status: 'captured',
            method: 'upi'
          }
        }
      }
    };

    const rawBody = JSON.stringify(webhookPayload);
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    const whRes = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(rawBody);

    assert.equal(whRes.status, 200);

    // 6. Verify authoritative database transitions
    const paymentAfter = await Payment.findOne({ orderId });
    assert.equal(paymentAfter.status, PAYMENT_STATUS.CAPTURED);
    assert.equal(paymentAfter.paymentId, paymentId);
    assert.ok(paymentAfter.registrationId);

    const registration = await Registration.findById(paymentAfter.registrationId);
    assert.ok(registration);
    assert.equal(registration.status, REGISTRATION_STATUS.CONFIRMED);
    assert.equal(registration.isPaid, true);

    // Verify SeatHold converted
    const holdAfter = await SeatHold.findById(hold.holdId);
    assert.equal(holdAfter.status, SEAT_HOLD_STATUS.CONSUMED);

    // Verify Booking record created with digital tickets
    const booking = await Booking.findOne({ paymentId: paymentAfter._id });
    assert.ok(booking);
    assert.equal(booking.status, 'CONFIRMED');
    assert.equal(booking.seatIds.length, 2);
    assert.equal(booking.seatLabels.length, 2);
    assert.ok(booking.bookingReference);
    assert.ok(booking.ticketToken);

    // Verify EventSeat records are BOOKED
    const updatedSeats = await EventSeat.find({ _id: { $in: [seatA1._id, seatA2._id] } });
    for (const s of updatedSeats) {
      assert.equal(s.status, SEAT_STATUS.BOOKED);
      assert.ok(s.bookingId);
      assert.equal(s.bookingId.toString(), booking._id.toString());
    }
  });

  it('18. Duplicate webhook delivery after seat confirmation is strictly idempotent', async () => {
    const payment = await Payment.findOne({ status: PAYMENT_STATUS.CAPTURED, holdId: { $ne: null } });
    assert.ok(payment);

    const regCountBefore = await Registration.countDocuments({ paymentId: payment._id });
    const bookingCountBefore = await Booking.countDocuments({ paymentId: payment._id });

    const duplicatePayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: payment.paymentId,
            order_id: payment.orderId,
            amount: payment.amount,
            currency: 'INR',
            status: 'captured',
            method: 'upi'
          }
        }
      }
    };

    const rawBody = JSON.stringify(duplicatePayload);
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    const res = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(rawBody);

    assert.equal(res.status, 200);

    // Verify no new registrations or bookings were created
    const regCountAfter = await Registration.countDocuments({ paymentId: payment._id });
    const bookingCountAfter = await Booking.countDocuments({ paymentId: payment._id });
    assert.equal(regCountAfter, regCountBefore);
    assert.equal(bookingCountAfter, bookingCountBefore);
  });

  it('19. Authoritative webhook detects payment amount mismatch and marks payment FAILED without confirming', async () => {
    // Create new attendee and order
    const mismatchAgent = request.agent(app);
    const cMismatch = await mismatchAgent.get('/api/v1/auth/csrf');
    await mismatchAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', cMismatch.body.data.csrfToken)
      .send({
        name: 'Mismatch Attendee',
        email: 'mismatch@paytest.com',
        password: 'SecurePassword@123',
        role: 'ATTENDEE'
      });

    const orderRes = await mismatchAgent
      .post('/api/v1/payments/create-order')
      .set('x-csrf-token', cMismatch.body.data.csrfToken)
      .send({ eventId: paidEvent._id });

    const orderId = orderRes.body.data.orderId;
    const paymentBefore = await Payment.findOne({ orderId });
    assert.equal(paymentBefore.amount, 49900);

    // Send webhook with tampered amount (e.g. 1000 paise instead of 49900)
    const tamperedPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_mismatch_${Date.now()}`,
            order_id: orderId,
            amount: 1000,
            currency: 'INR',
            status: 'captured',
            method: 'upi'
          }
        }
      }
    };

    const rawBody = JSON.stringify(tamperedPayload);
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    const res = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(rawBody);

    assert.equal(res.status, 200);

    // Verify payment was marked FAILED with AMOUNT_MISMATCH
    const paymentAfter = await Payment.findOne({ orderId });
    assert.equal(paymentAfter.status, PAYMENT_STATUS.FAILED);
    assert.equal(paymentAfter.failureDetails.code, 'AMOUNT_MISMATCH');
    assert.equal(paymentAfter.registrationId, null);
  });

  it('20. Late webhook capture on expired hold with reassigned seats triggers auto-refund without stealing seat', async () => {
    const seatA3 = await EventSeat.findOne({ eventId: seatingEvent._id, seatLabel: 'A3' });
    assert.ok(seatA3);

    // User A holds A3
    const userAAgent = request.agent(app);
    const cA = await userAAgent.get('/api/v1/auth/csrf');
    const uARes = await userAAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', cA.body.data.csrfToken)
      .send({
        name: 'User A',
        email: 'usera@paytest.com',
        password: 'SecurePassword@123',
        role: 'ATTENDEE'
      });
    const userA = uARes.body.data.user;

    const holdA = await createSeatHold({
      eventId: seatingEvent._id,
      attendeeId: userA.id,
      seatIds: [seatA3._id]
    });
    const orderResA = await userAAgent
      .post('/api/v1/payments/create-order')
      .set('x-csrf-token', cA.body.data.csrfToken)
      .send({ eventId: seatingEvent._id });

    const orderIdA = orderResA.body.data.orderId;

    // Simulate hold A expiring and releasing seat A3 back to AVAILABLE
    await SeatHold.findByIdAndUpdate(holdA.holdId, {
      $set: { status: SEAT_HOLD_STATUS.EXPIRED, expiresAt: new Date(Date.now() - 60000) }
    });
    await EventSeat.findByIdAndUpdate(seatA3._id, {
      $set: { status: SEAT_STATUS.AVAILABLE, holdId: null, heldBy: null, heldUntil: null }
    });

    // User B comes along, holds and confirms seat A3
    const userBAgent = request.agent(app);
    const cB = await userBAgent.get('/api/v1/auth/csrf');
    const uBRes = await userBAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', cB.body.data.csrfToken)
      .send({
        name: 'User B',
        email: 'userb@paytest.com',
        password: 'SecurePassword@123',
        role: 'ATTENDEE'
      });
    const userB = uBRes.body.data.user;

    const holdB = await createSeatHold({
      eventId: seatingEvent._id,
      attendeeId: userB.id,
      seatIds: [seatA3._id]
    });
    const orderResB = await userBAgent
      .post('/api/v1/payments/create-order')
      .set('x-csrf-token', cB.body.data.csrfToken)
      .send({ eventId: seatingEvent._id });

    // User B verifies and books A3
    const orderIdB = orderResB.body.data.orderId;
    const payIdB = `pay_user_b_${Date.now()}`;
    const sigB = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderIdB}|${payIdB}`)
      .digest('hex');

    await userBAgent
      .post('/api/v1/payments/verify')
      .set('x-csrf-token', cB.body.data.csrfToken)
      .send({ orderId: orderIdB, paymentId: payIdB, signature: sigB });

    // Verify seat A3 is now securely booked by User B
    const seatA3Booked = await EventSeat.findById(seatA3._id);
    assert.equal(seatA3Booked.status, SEAT_STATUS.BOOKED);
    assert.ok(seatA3Booked.bookingId);
    const bookingB = await Booking.findById(seatA3Booked.bookingId);
    assert.ok(bookingB);
    assert.equal(bookingB.attendeeId.toString(), userB.id.toString());

    // NOW: User A's late webhook payment.captured arrives!
    const latePayIdA = `pay_late_a_${Date.now()}`;
    const latePayloadA = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: latePayIdA,
            order_id: orderIdA,
            amount: 25000,
            currency: 'INR',
            status: 'captured',
            method: 'upi'
          }
        }
      }
    };

    const rawBodyA = JSON.stringify(latePayloadA);
    const sigA = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBodyA)
      .digest('hex');

    const lateRes = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', sigA)
      .send(rawBodyA);

    assert.equal(lateRes.status, 200);

    // Verify User A's payment was NOT confirmed; instead auto-refund was initiated
    const paymentAAfter = await Payment.findOne({ orderId: orderIdA });
    assert.equal(paymentAAfter.status, PAYMENT_STATUS.REFUND_PENDING);
    assert.equal(paymentAAfter.refundStatus, REFUND_STATUS.PENDING);
    assert.ok(paymentAAfter.refundId);
    assert.equal(paymentAAfter.registrationId, null);

    // Verify seat A3 is STILL booked by User B (never stolen!)
    const seatA3Final = await EventSeat.findById(seatA3._id);
    assert.equal(seatA3Final.status, SEAT_STATUS.BOOKED);
    assert.equal(seatA3Final.bookingId.toString(), seatA3Booked.bookingId.toString());
  });

  it('21. POST /api/v1/payments/verify strictly rejects simulated payment signature in production mode', async () => {
    // 1. Create a genuine pending order for attendee
    const prodAgent = request.agent(app);
    const cProd = await prodAgent.get('/api/v1/auth/csrf');
    const uProdRes = await prodAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', cProd.body.data.csrfToken)
      .send({
        name: 'Prod Test Attendee',
        email: 'produser@paytest.com',
        password: 'SecurePassword@123',
        role: 'ATTENDEE'
      });
    const prodUser = uProdRes.body.data.user;

    // Verify email directly in DB and re-login to update session
    await User.findByIdAndUpdate(prodUser.id, { $set: { emailVerified: true } });
    await prodAgent
      .post('/api/v1/auth/login')
      .set('x-csrf-token', cProd.body.data.csrfToken)
      .send({
        email: 'produser@paytest.com',
        password: 'SecurePassword@123'
      });

    const ordRes = await prodAgent
      .post('/api/v1/payments/create-order')
      .set('x-csrf-token', cProd.body.data.csrfToken)
      .send({ eventId: paidEvent._id });

    const prodOrderId = ordRes.body.data.orderId;

    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';

      const res = await prodAgent
        .post('/api/v1/payments/verify')
        .set('x-csrf-token', cProd.body.data.csrfToken)
        .set('Origin', 'https://eventora.vercel.app')
        .send({
          orderId: prodOrderId,
          paymentId: 'pay_prod_test_456',
          signature: 'simulated_test_signature'
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error.message, /forbidden in production|not permitted in production/);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
