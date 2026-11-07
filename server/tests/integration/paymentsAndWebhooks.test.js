import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import crypto from 'crypto';
import app from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/connection.js';
import { User } from '../../src/modules/users/User.js';
import { Event } from '../../src/modules/events/Event.js';
import { Registration } from '../../src/modules/registrations/Registration.js';
import { Payment } from '../../src/modules/payments/Payment.js';
import { SeatReservation } from '../../src/modules/payments/SeatReservation.js';
import { WebhookEvent } from '../../src/modules/payments/WebhookEvent.js';
import {
  PAYMENT_STATUS,
  RESERVATION_STATUS,
  REGISTRATION_STATUS,
  REFUND_STATUS
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
  });

  after(async () => {
    await User.deleteMany({ email: { $regex: '@paytest.com$' } });
    await Event.deleteMany({ title: { $regex: 'Payment Integration Event' } });
    await WebhookEvent.deleteMany({});
    await SeatReservation.deleteMany({});
    await Payment.deleteMany({});
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
});
