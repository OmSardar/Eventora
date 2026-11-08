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
import { EventSeat } from '../../src/modules/seating/EventSeat.js';
import { SeatHold } from '../../src/modules/seating/SeatHold.js';
import { Payment } from '../../src/modules/payments/Payment.js';
import { RefundOperation } from '../../src/modules/payments/RefundOperation.js';
import { Notification } from '../../src/modules/notifications/Notification.js';
import {
  NOTIFICATION_TYPE,
  REGISTRATION_STATUS,
  EVENT_STATUS,
  BOOKING_STATUS,
  SEATING_TYPE,
  SEAT_STATUS,
  SEAT_HOLD_STATUS,
  PAYMENT_STATUS,
  REFUND_STATUS
} from '../../src/shared/constants/status.js';

describe('Event Cancellation Lifecycle (Integration)', () => {
  let organizer1Agent;
  let organizer2Agent;
  let attendeeAgent;
  let csrfOrg1;
  let csrfOrg2;
  let csrfAtt;
  let event1Id;
  let event2Id;
  let attendeeUser;

  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MOCK_PAYMENTS = 'true';
    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora');

    // Clean test state
    await User.deleteMany({ email: { $regex: '@cancellationtest.com$' } });
    await Event.deleteMany({ title: { $regex: 'Cancellation Test Event' } });
    await Registration.deleteMany({});
    await Booking.deleteMany({});
    await EventSeat.deleteMany({});
    await SeatHold.deleteMany({});
    await Payment.deleteMany({});
    await RefundOperation.deleteMany({});
    await Notification.deleteMany({});

    organizer1Agent = request.agent(app);
    organizer2Agent = request.agent(app);
    attendeeAgent = request.agent(app);

    const c1 = await organizer1Agent.get('/api/v1/auth/csrf');
    csrfOrg1 = c1.body.data.csrfToken;

    const c2 = await organizer2Agent.get('/api/v1/auth/csrf');
    csrfOrg2 = c2.body.data.csrfToken;

    const c3 = await attendeeAgent.get('/api/v1/auth/csrf');
    csrfAtt = c3.body.data.csrfToken;

    // Register Organizer 1
    const org1Res = await organizer1Agent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfOrg1)
      .send({
        name: 'Organizer One',
        email: 'organizer1@cancellationtest.com',
        password: 'Password@123',
        role: 'ORGANIZER'
      });
    assert.equal(org1Res.status, 201);
    await User.findByIdAndUpdate(org1Res.body.data.user.id, { emailVerified: true });

    // Register Organizer 2
    const org2Res = await organizer2Agent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfOrg2)
      .send({
        name: 'Organizer Two',
        email: 'organizer2@cancellationtest.com',
        password: 'Password@123',
        role: 'ORGANIZER'
      });
    assert.equal(org2Res.status, 201);
    await User.findByIdAndUpdate(org2Res.body.data.user.id, { emailVerified: true });

    // Register Attendee
    const attRes = await attendeeAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfAtt)
      .send({
        name: 'Attendee One',
        email: 'attendee@cancellationtest.com',
        password: 'Password@123',
        role: 'ATTENDEE'
      });
    assert.equal(attRes.status, 201);
    attendeeUser = attRes.body.data.user;
    await User.findByIdAndUpdate(attendeeUser.id, { emailVerified: true });

    // Create Free Event 1 by Organizer 1
    const futureDate = new Date(Date.now() + 86400000 * 14).toISOString();
    const ev1Res = await organizer1Agent
      .post('/api/v1/events')
      .set('x-csrf-token', csrfOrg1)
      .send({
        title: 'Cancellation Test Event - Free RSVP',
        description: 'Testing event cancellation lifecycle with active registrations.',
        eventDate: futureDate,
        venue: 'Grand Hall A',
        seatLimit: 10,
        category: 'Technology'
      });
    assert.equal(ev1Res.status, 201);
    event1Id = ev1Res.body.data.event._id || ev1Res.body.data.event.id;

    // Attendee registers for Event 1
    const regRes = await attendeeAgent
      .post(`/api/v1/events/${event1Id}/registrations`)
      .set('x-csrf-token', csrfAtt)
      .send();
    assert.equal(regRes.status, 201);
    assert.equal(regRes.body.data.registration.status, REGISTRATION_STATUS.CONFIRMED);
  });

  after(async () => {
    await User.deleteMany({ email: { $regex: '@cancellationtest.com$' } });
    await Event.deleteMany({ title: { $regex: 'Cancellation Test Event' } });
    await Registration.deleteMany({});
    await Booking.deleteMany({});
    await EventSeat.deleteMany({});
    await SeatHold.deleteMany({});
    await Payment.deleteMany({});
    await RefundOperation.deleteMany({});
    await Notification.deleteMany({});
    await disconnectDatabase();
  });

  test('1. Another organizer cannot cancel an event they do not own (returns 403)', async () => {
    const res = await organizer2Agent
      .post(`/api/v1/events/${event1Id}/cancel`)
      .set('x-csrf-token', csrfOrg2);

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /not authorized/i);

    // Verify event is still PUBLISHED
    const ev = await Event.findById(event1Id);
    assert.equal(ev.status, EVENT_STATUS.PUBLISHED);
  });

  test('2. Attendee cannot cancel an event (returns 403 Forbidden)', async () => {
    const res = await attendeeAgent
      .post(`/api/v1/events/${event1Id}/cancel`)
      .set('x-csrf-token', csrfAtt);

    assert.equal(res.status, 403);
  });

  test('3. Organizer successfully cancels their own event (returns 200)', async () => {
    const res = await organizer1Agent
      .post(`/api/v1/events/${event1Id}/cancel`)
      .set('x-csrf-token', csrfOrg1);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.event.status, EVENT_STATUS.CANCELLED);
    assert.equal(res.body.data.event.seatsBooked, 0);

    // Verify in database
    const dbEvent = await Event.findById(event1Id);
    assert.equal(dbEvent.status, EVENT_STATUS.CANCELLED);
    assert.equal(dbEvent.seatsBooked, 0);
  });

  test('4. Repeated cancellation returns 400 BadRequest (idempotent guard)', async () => {
    const res = await organizer1Agent
      .post(`/api/v1/events/${event1Id}/cancel`)
      .set('x-csrf-token', csrfOrg1);

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /already cancelled/i);
  });

  test('5. All affected active attendee registrations are synchronized to CANCELLED', async () => {
    const registrations = await Registration.find({ eventId: event1Id });
    assert.ok(registrations.length > 0);
    for (const reg of registrations) {
      assert.equal(reg.status, REGISTRATION_STATUS.CANCELLED);
      assert.equal(reg.seatReleased, true);
      assert.ok(reg.cancellationReason);
    }
  });

  test('6. New registration attempt on cancelled event is rejected (returns 400)', async () => {
    const res = await attendeeAgent
      .post(`/api/v1/events/${event1Id}/registrations`)
      .set('x-csrf-token', csrfAtt)
      .send();

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /cancelled/i);
  });

  test('7. Attendees receive EVENT_CANCELLED in-app notification', async () => {
    const notifs = await Notification.find({
      userId: attendeeUser.id,
      type: NOTIFICATION_TYPE.EVENT_CANCELLED
    });

    assert.ok(notifs.length >= 1);
    assert.match(notifs[0].title, /cancelled/i);
    assert.equal(notifs[0].eventId.toString(), event1Id.toString());
  });

  test('8. Attendee registrations endpoint (/registrations/me) shows CANCELLED status', async () => {
    const res = await attendeeAgent.get('/api/v1/registrations/me');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const myReg = res.body.data.registrations.find(
      (r) => (r.eventId?._id || r.eventId) === event1Id.toString()
    );
    assert.ok(myReg);
    assert.equal(myReg.status, REGISTRATION_STATUS.CANCELLED);
    assert.equal(myReg.eventId.status, EVENT_STATUS.CANCELLED);
  });

  test('9. Assigned seating, holds, bookings, and payments are handled safely upon cancellation', async () => {
    // Create Event 2 with assigned seating
    const futureDate = new Date(Date.now() + 86400000 * 20).toISOString();
    const ev2 = await Event.create({
      title: 'Cancellation Test Event - Paid Seated',
      description: 'Testing event cancellation with assigned seats, holds, and paid bookings.',
      eventDate: futureDate,
      venue: 'Auditorium B',
      seatLimit: 20,
      seatsBooked: 2,
      ticketPrice: 500,
      seatingType: SEATING_TYPE.ASSIGNED_SEATING,
      status: EVENT_STATUS.PUBLISHED,
      organizerId: new mongoose.Types.ObjectId()
    });
    event2Id = ev2._id.toString();

    // Create seats with valid schema
    const seat1 = await EventSeat.create({
      eventId: event2Id,
      sectionId: 'sec-1',
      sectionName: 'Front Section',
      rowLabel: 'A',
      seatNumber: 1,
      seatLabel: 'A1',
      category: 'VIP',
      status: SEAT_STATUS.BOOKED,
      price: 500
    });
    const seat2 = await EventSeat.create({
      eventId: event2Id,
      sectionId: 'sec-1',
      sectionName: 'Front Section',
      rowLabel: 'A',
      seatNumber: 2,
      seatLabel: 'A2',
      category: 'VIP',
      status: SEAT_STATUS.HELD,
      price: 500
    });

    // Create active seat hold
    const hold = await SeatHold.create({
      eventId: event2Id,
      attendeeId: attendeeUser.id,
      seatIds: [seat2._id],
      seatLabels: ['A2'],
      totalAmount: 500,
      status: SEAT_HOLD_STATUS.ACTIVE,
      expiresAt: new Date(Date.now() + 600000)
    });

    // Create paid booking and payment
    const payment = await Payment.create({
      eventId: event2Id,
      attendeeId: attendeeUser.id,
      amount: 50000,
      currency: 'INR',
      status: PAYMENT_STATUS.CAPTURED,
      orderId: 'order_test_cancel_123',
      paymentId: 'pay_test_cancel_123',
      idempotencyKey: 'idem_test_cancel_pay_123'
    });

    const booking = await Booking.create({
      eventId: event2Id,
      attendeeId: attendeeUser.id,
      seatIds: [seat1._id],
      seatLabels: ['A1'],
      subtotal: 500,
      totalAmount: 500,
      status: BOOKING_STATUS.CONFIRMED,
      paymentId: payment._id,
      bookingReference: 'BK-TEST-CANCEL-001',
      ticketToken: 'tok_test_cancel_123'
    });

    // Create registration
    const registration = await Registration.create({
      eventId: event2Id,
      attendeeId: attendeeUser.id,
      status: REGISTRATION_STATUS.CONFIRMED,
      booking: booking._id,
      paymentId: payment._id,
      isPaid: true,
      ticketPrice: 500
    });

    // Now call cancelEvent service directly with organizer user context
    const { cancelEvent } = await import('../../src/modules/events/eventService.js');
    const cancelledEvent = await cancelEvent({
      eventId: event2Id,
      organizerId: ev2.organizerId.toString()
    });

    assert.equal(cancelledEvent.status, EVENT_STATUS.CANCELLED);
    assert.equal(cancelledEvent.seatsBooked, 0);

    // Verify seats transitioned to BLOCKED
    const updatedSeats = await EventSeat.find({ eventId: event2Id });
    for (const s of updatedSeats) {
      assert.equal(s.status, SEAT_STATUS.BLOCKED);
    }

    // Verify hold transitioned to RELEASED
    const updatedHold = await SeatHold.findById(hold._id);
    assert.equal(updatedHold.status, SEAT_HOLD_STATUS.RELEASED);

    // Verify booking transitioned to CANCELLED
    const updatedBooking = await Booking.findById(booking._id);
    assert.equal(updatedBooking.status, BOOKING_STATUS.CANCELLED);

    // Verify registration transitioned to CANCELLED
    const updatedReg = await Registration.findById(registration._id);
    assert.equal(updatedReg.status, REGISTRATION_STATUS.CANCELLED);
    assert.equal(updatedReg.seatReleased, true);

    // Verify payment transitioned to REFUND_PENDING
    const updatedPayment = await Payment.findById(payment._id);
    assert.equal(updatedPayment.status, PAYMENT_STATUS.REFUND_PENDING);
    assert.equal(updatedPayment.refundStatus, REFUND_STATUS.PENDING);

    // Verify durable RefundOperation record created
    const refundOp = await RefundOperation.findOne({ registrationId: registration._id });
    assert.ok(refundOp);
    assert.equal(refundOp.status, 'PENDING');
    assert.equal(refundOp.amount, 50000);
    assert.match(refundOp.reason, /cancelled/i);
  });
});
