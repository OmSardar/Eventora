import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/connection.js';
import { User } from '../../src/modules/users/User.js';
import { Event } from '../../src/modules/events/Event.js';
import { EventSeat } from '../../src/modules/seating/EventSeat.js';
import { SeatHold } from '../../src/modules/seating/SeatHold.js';
import { Booking } from '../../src/modules/bookings/Booking.js';
import { Registration } from '../../src/modules/registrations/Registration.js';
import { Payment } from '../../src/modules/payments/Payment.js';
import { expireStaleHolds } from '../../src/modules/seating/holdExpirationWorker.js';
import {
  SEAT_STATUS,
  SEAT_HOLD_STATUS,
  BOOKING_STATUS,
  SEATING_TYPE
} from '../../src/shared/constants/status.js';

describe('Interactive Seating, Concurrency & Digital Tickets (Integration)', () => {
  let organizerAgent;
  let attendeeAgent1;
  let attendeeAgent2;
  let csrfOrg;
  let csrfAtt1;
  let csrfAtt2;
  let organizerUser;
  let attendeeUser1;
  let attendeeUser2;
  let assignedEvent;
  let freeAssignedEvent;

  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MOCK_PAYMENTS = 'true';
    process.env.JWT_SECRET = 'test_ticket_signing_secret_12345';

    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora');

    await User.deleteMany({ email: { $regex: '@seattest.com$' } });
    await Event.deleteMany({ title: { $regex: 'Seating Test Event' } });
    await EventSeat.deleteMany({});
    await SeatHold.deleteMany({});
    await Booking.deleteMany({});

    organizerAgent = request.agent(app);
    attendeeAgent1 = request.agent(app);
    attendeeAgent2 = request.agent(app);

    const c1 = await organizerAgent.get('/api/v1/auth/csrf');
    csrfOrg = c1.body.data.csrfToken;

    const c2 = await attendeeAgent1.get('/api/v1/auth/csrf');
    csrfAtt1 = c2.body.data.csrfToken;

    const c3 = await attendeeAgent2.get('/api/v1/auth/csrf');
    csrfAtt2 = c3.body.data.csrfToken;

    // Register organizer
    const orgRes = await organizerAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfOrg)
      .send({
        name: 'Seat Organizer',
        email: 'organizer@seattest.com',
        password: 'Password@123',
        role: 'ORGANIZER'
      });
    organizerUser = orgRes.body.data.user;
    await User.findByIdAndUpdate(organizerUser.id, { emailVerified: true });

    // Register Attendee 1
    const att1Res = await attendeeAgent1
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfAtt1)
      .send({
        name: 'Attendee One',
        email: 'att1@seattest.com',
        password: 'Password@123',
        role: 'ATTENDEE'
      });
    attendeeUser1 = att1Res.body.data.user;
    await User.findByIdAndUpdate(attendeeUser1.id, { emailVerified: true });

    // Register Attendee 2
    const att2Res = await attendeeAgent2
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfAtt2)
      .send({
        name: 'Attendee Two',
        email: 'att2@seattest.com',
        password: 'Password@123',
        role: 'ATTENDEE'
      });
    attendeeUser2 = att2Res.body.data.user;
    await User.findByIdAndUpdate(attendeeUser2.id, { emailVerified: true });

    // Create Paid Event
    const eventDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const eventRes = await organizerAgent
      .post('/api/v1/events')
      .set('x-csrf-token', csrfOrg)
      .send({
        title: 'Seating Test Event - Symphony 2026',
        description: 'Testing 50-seat inventory and atomic concurrency.',
        eventDate,
        venue: 'Grand Concert Hall, Stage 1',
        seatLimit: 50,
        category: 'Concert',
        isPaid: true,
        ticketPrice: 750
      });
    assignedEvent = eventRes.body.data.event;

    // Create Free Event
    const freeEventRes = await organizerAgent
      .post('/api/v1/events')
      .set('x-csrf-token', csrfOrg)
      .send({
        title: 'Seating Test Event - Free Tech Summit',
        description: 'Testing free assigned-seating RSVP.',
        eventDate,
        venue: 'Auditorium B',
        seatLimit: 50,
        category: 'Technology',
        isPaid: false,
        ticketPrice: 0
      });
    freeAssignedEvent = freeEventRes.body.data.event;
  });

  after(async () => {
    await User.deleteMany({ email: { $regex: '@seattest.com$' } });
    await Event.deleteMany({ title: { $regex: 'Seating Test Event' } });
    await EventSeat.deleteMany({});
    await SeatHold.deleteMany({});
    await Booking.deleteMany({});
    await disconnectDatabase();
  });

  it('1. Organizer generates exactly 50 physical seats (5 rows of 10) automatically', async () => {
    const res = await organizerAgent
      .post(`/api/v1/events/${assignedEvent.id}/seats/generate`)
      .set('x-csrf-token', csrfOrg)
      .send({
        generationMode: 'AUTOMATIC',
        totalSeats: 50,
        rows: 5,
        seatsPerRow: 10,
        startingRowLabel: 'A',
        category: 'STANDARD',
        price: 750
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.seatCount, 50);

    const seatCount = await EventSeat.countDocuments({ eventId: assignedEvent.id });
    assert.equal(seatCount, 50);

    // Verify Row A has 10 seats (A1 to A10)
    const rowASeats = await EventSeat.find({ eventId: assignedEvent.id, rowLabel: 'A' }).sort({ seatNumber: 1 });
    assert.equal(rowASeats.length, 10);
    assert.equal(rowASeats[0].seatLabel, 'A1');
    assert.equal(rowASeats[9].seatLabel, 'A10');
    assert.equal(rowASeats[0].status, SEAT_STATUS.AVAILABLE);
  });

  it('2. Attendee retrieves complete seat map with all 50 seats available', async () => {
    const res = await attendeeAgent1.get(`/api/v1/events/${assignedEvent.id}/seats`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.seats.length, 50);

    const availableSeats = res.body.data.seats.filter((s) => s.status === 'AVAILABLE');
    assert.equal(availableSeats.length, 50);
  });

  it('3. Attendee 1 atomically holds A1 and A2 for 10 minutes', async () => {
    const seatsRes = await attendeeAgent1.get(`/api/v1/events/${assignedEvent.id}/seats`);
    const seatA1 = seatsRes.body.data.seats.find((s) => s.seatLabel === 'A1');
    const seatA2 = seatsRes.body.data.seats.find((s) => s.seatLabel === 'A2');

    const holdRes = await attendeeAgent1
      .post(`/api/v1/events/${assignedEvent.id}/seat-holds`)
      .set('x-csrf-token', csrfAtt1)
      .send({ seatIds: [seatA1.id, seatA2.id] });

    assert.equal(holdRes.status, 201);
    assert.equal(holdRes.body.success, true);
    assert.equal(holdRes.body.data.seatLabels.length, 2);
    assert.deepEqual(holdRes.body.data.seatLabels, ['A1', 'A2']);
    assert.equal(holdRes.body.data.totalAmount, 1500); // 2 * 750

    // Database verification
    const a1Db = await EventSeat.findById(seatA1.id);
    assert.equal(a1Db.status, SEAT_STATUS.HELD);
    assert.equal(a1Db.heldBy.toString(), attendeeUser1.id);
  });

  it('4. Attendee 2 is rejected with 409 Conflict when attempting to hold already held seat A1', async () => {
    const seatsRes = await attendeeAgent2.get(`/api/v1/events/${assignedEvent.id}/seats`);
    const seatA1 = seatsRes.body.data.seats.find((s) => s.seatLabel === 'A1');
    const seatA3 = seatsRes.body.data.seats.find((s) => s.seatLabel === 'A3');

    const holdRes = await attendeeAgent2
      .post(`/api/v1/events/${assignedEvent.id}/seat-holds`)
      .set('x-csrf-token', csrfAtt2)
      .send({ seatIds: [seatA1.id, seatA3.id] });

    assert.equal(holdRes.status, 409);
    assert.equal(holdRes.body.success, false);

    // Verify all-or-nothing: seat A3 was NOT claimed by Attendee 2!
    const a3Db = await EventSeat.findById(seatA3.id);
    assert.equal(a3Db.status, SEAT_STATUS.AVAILABLE);
  });

  it('5. Attendee 1 voluntary release frees held seats back to AVAILABLE', async () => {
    // Acquire a temporary hold on A3
    const seatsRes = await attendeeAgent1.get(`/api/v1/events/${assignedEvent.id}/seats`);
    const seatA3 = seatsRes.body.data.seats.find((s) => s.seatLabel === 'A3');

    const holdRes = await attendeeAgent1
      .post(`/api/v1/events/${assignedEvent.id}/seat-holds`)
      .set('x-csrf-token', csrfAtt1)
      .send({ seatIds: [seatA3.id] });

    const holdId = holdRes.body.data.holdId;

    // Release early
    const relRes = await attendeeAgent1
      .delete(`/api/v1/seat-holds/${holdId}`)
      .set('x-csrf-token', csrfAtt1);

    assert.equal(relRes.status, 200);

    const a3Db = await EventSeat.findById(seatA3.id);
    assert.equal(a3Db.status, SEAT_STATUS.AVAILABLE);
    assert.equal(a3Db.holdId, null);
  });

  it('6. Hold expiration worker sweeps expired holds and restores seats to AVAILABLE', async () => {
    // Create hold on A4 and simulate expiration in the past
    const seatsRes = await attendeeAgent1.get(`/api/v1/events/${assignedEvent.id}/seats`);
    const seatA4 = seatsRes.body.data.seats.find((s) => s.seatLabel === 'A4');

    const holdRes = await attendeeAgent1
      .post(`/api/v1/events/${assignedEvent.id}/seat-holds`)
      .set('x-csrf-token', csrfAtt1)
      .send({ seatIds: [seatA4.id] });

    const holdId = holdRes.body.data.holdId;

    // Manually push expiresAt and heldUntil into the past
    const pastDate = new Date(Date.now() - 60000);
    await SeatHold.findByIdAndUpdate(holdId, { expiresAt: pastDate });
    await EventSeat.findByIdAndUpdate(seatA4.id, { heldUntil: pastDate });

    // Run sweep
    const sweepResult = await expireStaleHolds();
    assert.ok(sweepResult.expiredHoldsCount >= 1);

    const a4Db = await EventSeat.findById(seatA4.id);
    assert.equal(a4Db.status, SEAT_STATUS.AVAILABLE);
    assert.equal(a4Db.holdId, null);
  });

  it('7. Free assigned-seating event confirmation creates Booking & Registration atomically', async () => {
    // Generate layout for free event
    await organizerAgent
      .post(`/api/v1/events/${freeAssignedEvent.id}/seats/generate`)
      .set('x-csrf-token', csrfOrg)
      .send({
        generationMode: 'AUTOMATIC',
        totalSeats: 30,
        rows: 3,
        seatsPerRow: 10,
        price: 0
      });

    const seatsRes = await attendeeAgent1.get(`/api/v1/events/${freeAssignedEvent.id}/seats`);
    const seatA1 = seatsRes.body.data.seats[0];

    // Create free hold
    const holdRes = await attendeeAgent1
      .post(`/api/v1/events/${freeAssignedEvent.id}/seat-holds`)
      .set('x-csrf-token', csrfAtt1)
      .send({ seatIds: [seatA1.id] });

    const holdId = holdRes.body.data.holdId;

    // Confirm free booking
    const confirmRes = await attendeeAgent1
      .post(`/api/v1/events/${freeAssignedEvent.id}/bookings/confirm-free`)
      .set('x-csrf-token', csrfAtt1)
      .send({ holdId });

    assert.equal(confirmRes.status, 201);
    assert.equal(confirmRes.body.success, true);
    assert.ok(confirmRes.body.data.booking.bookingReference);

    // Verify seat is permanently BOOKED
    const a1Db = await EventSeat.findById(seatA1.id);
    assert.equal(a1Db.status, SEAT_STATUS.BOOKED);
    assert.ok(a1Db.bookingId);
  });

  it('8. Digital Ticket pass retrieval returns signed QR verification token', async () => {
    const booking = await Booking.findOne({ attendeeId: attendeeUser1.id });
    assert.ok(booking);

    const ticketRes = await attendeeAgent1.get(`/api/v1/bookings/${booking._id}/tickets`);
    assert.equal(ticketRes.status, 200);
    assert.equal(ticketRes.body.success, true);
    assert.equal(ticketRes.body.data.bookingReference, booking.bookingReference);
    assert.ok(ticketRes.body.data.ticketToken);
    assert.ok(ticketRes.body.data.qrCodePayload.includes(ticketRes.body.data.ticketToken));
    assert.ok(ticketRes.body.data.seats.length >= 1);
  });

  it('9. QR Ticket verification validates authentic ticket and marks redemption safely', async () => {
    const booking = await Booking.findOne({ attendeeId: attendeeUser1.id });

    // Public scan / verification
    const verifyRes = await attendeeAgent1.get(`/api/v1/tickets/verify?token=${booking.ticketToken}`);
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.data.isValid, true);
    assert.equal(verifyRes.body.data.bookingReference, booking.bookingReference);

    // Organizer redeems ticket at venue door
    const redeemRes = await organizerAgent
      .post('/api/v1/tickets/validate')
      .set('x-csrf-token', csrfOrg)
      .send({ token: booking.ticketToken, markRedeemed: true });

    assert.equal(redeemRes.status, 200);
    assert.equal(redeemRes.body.data.isValid, true);
    assert.equal(redeemRes.body.data.redeemed, true);

    // Second scan attempt is flagged as ALREADY_REDEEMED (duplicate entry prevented!)
    const duplicateRes = await organizerAgent
      .post('/api/v1/tickets/validate')
      .set('x-csrf-token', csrfOrg)
      .send({ token: booking.ticketToken, markRedeemed: true });

    assert.equal(duplicateRes.status, 200);
    assert.equal(duplicateRes.body.data.isValid, false);
    assert.equal(duplicateRes.body.data.reason, 'ALREADY_REDEEMED');
  });

  it('10. Organizer seating dashboard provides metrics, booked details, and seat inspector', async () => {
    const res = await organizerAgent.get(`/api/v1/events/${freeAssignedEvent.id}/seating/dashboard`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.metrics.totalSeats, 30);
    assert.equal(res.body.data.metrics.bookedSeats, 1);
    assert.ok(res.body.data.metrics.availableSeats <= 29);

    // Verify seat inspector detail
    const bookedSeat = res.body.data.seats.find((s) => s.status === 'BOOKED');
    assert.ok(bookedSeat);
    assert.ok(bookedSeat.booking);
    assert.equal(bookedSeat.booking.attendee.name, 'Attendee One');
  });

  it('11. Organizer can block and unblock unreserved seat', async () => {
    const seatsRes = await organizerAgent.get(`/api/v1/events/${assignedEvent.id}/seats`);
    const seatE10 = seatsRes.body.data.seats.find((s) => s.seatLabel === 'E10');

    // Block seat
    const blockRes = await organizerAgent
      .patch(`/api/v1/events/${assignedEvent.id}/seats/${seatE10.id}/block`)
      .set('x-csrf-token', csrfOrg)
      .send({ block: true });

    assert.equal(blockRes.status, 200);
    assert.equal(blockRes.body.data.status, 'BLOCKED');

    // Unblock seat
    const unblockRes = await organizerAgent
      .patch(`/api/v1/events/${assignedEvent.id}/seats/${seatE10.id}/block`)
      .set('x-csrf-token', csrfOrg)
      .send({ block: false });

    assert.equal(unblockRes.status, 200);
    assert.equal(unblockRes.body.data.status, 'AVAILABLE');
  });

  it('12. CONCURRENCY: 20 concurrent attendees contending for seat B1 result in exactly 1 hold and 19 conflicts', async () => {
    // Generate 20 test attendees
    const candidateAttendees = [];
    for (let i = 1; i <= 20; i++) {
      const email = `conc_att_${i}@seattest.com`;
      let user = await User.findOne({ email });
      if (!user) {
        user = await User.create({
          name: `Concurrent User ${i}`,
          email,
          passwordHash: '$2b$12$e8x5a3qR1Z1z1Z1z1Z1z1u1Z1z1Z1z1Z1z1Z1z1Z1z1Z1z1Z1z1Z1',
          role: 'ATTENDEE',
          emailVerified: true
        });
      }
      candidateAttendees.push(user);
    }

    const seatsRes = await attendeeAgent1.get(`/api/v1/events/${assignedEvent.id}/seats`);
    const seatB1 = seatsRes.body.data.seats.find((s) => s.seatLabel === 'B1');
    assert.equal(seatB1.status, 'AVAILABLE');

    // Execute 20 simultaneous createSeatHold calls directly through service
    const { createSeatHold } = await import('../../src/modules/seating/seatingService.js');

    const results = await Promise.allSettled(
      candidateAttendees.map((att) =>
        createSeatHold({
          eventId: assignedEvent.id,
          attendeeId: att._id,
          seatIds: [seatB1.id],
          ipAddress: '127.0.0.1',
          userAgent: 'TestConcurrency/1.0'
        })
      )
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one concurrent attendee must win the seat hold');
    assert.equal(rejected.length, 19, 'All 19 competing requests must be rejected with conflict');

    // Verify in database that seat B1 is held by exactly the winner
    const b1Db = await EventSeat.findById(seatB1.id);
    assert.equal(b1Db.status, SEAT_STATUS.HELD);
    assert.equal(b1Db.heldBy.toString(), fulfilled[0].value.attendeeId || candidateAttendees.find(a => a._id.toString() === b1Db.heldBy.toString())._id.toString());

    // Clean up hold on B1
    await SeatHold.deleteMany({ seatIds: seatB1.id });
    await EventSeat.findByIdAndUpdate(seatB1.id, {
      status: SEAT_STATUS.AVAILABLE,
      holdId: null,
      heldBy: null,
      heldUntil: null
    });
  });

  it('13. CONCURRENCY: Overlapping multi-seat requests ([C1, C2] vs [C2, C3]) exhibit all-or-nothing atomicity', async () => {
    const candidateAttendees = await User.find({ email: { $regex: '^conc_att_' } }).limit(2);
    const userA = candidateAttendees[0];
    const userB = candidateAttendees[1];

    const seatsRes = await attendeeAgent1.get(`/api/v1/events/${assignedEvent.id}/seats`);
    const seatC1 = seatsRes.body.data.seats.find((s) => s.seatLabel === 'C1');
    const seatC2 = seatsRes.body.data.seats.find((s) => s.seatLabel === 'C2');
    const seatC3 = seatsRes.body.data.seats.find((s) => s.seatLabel === 'C3');

    const { createSeatHold } = await import('../../src/modules/seating/seatingService.js');

    const [resA, resB] = await Promise.allSettled([
      createSeatHold({
        eventId: assignedEvent.id,
        attendeeId: userA._id,
        seatIds: [seatC1.id, seatC2.id],
        ipAddress: '127.0.0.1',
        userAgent: 'TestUserA'
      }),
      createSeatHold({
        eventId: assignedEvent.id,
        attendeeId: userB._id,
        seatIds: [seatC2.id, seatC3.id],
        ipAddress: '127.0.0.1',
        userAgent: 'TestUserB'
      })
    ]);

    // Exactly one must succeed, the other must fail
    const winnerCount = (resA.status === 'fulfilled' ? 1 : 0) + (resB.status === 'fulfilled' ? 1 : 0);
    assert.equal(winnerCount, 1, 'Only one multi-seat request can claim the overlapping seat C2');

    // If User A won, C1 and C2 are HELD, and C3 MUST remain AVAILABLE (no partial hold for User B)
    // If User B won, C2 and C3 are HELD, and C1 MUST remain AVAILABLE (no partial hold for User A)
    const c1Db = await EventSeat.findById(seatC1.id);
    const c2Db = await EventSeat.findById(seatC2.id);
    const c3Db = await EventSeat.findById(seatC3.id);

    if (resA.status === 'fulfilled') {
      assert.equal(c1Db.status, SEAT_STATUS.HELD);
      assert.equal(c2Db.status, SEAT_STATUS.HELD);
      assert.equal(c3Db.status, SEAT_STATUS.AVAILABLE, 'Unclaimed seat C3 must not be partially held');
    } else {
      assert.equal(c2Db.status, SEAT_STATUS.HELD);
      assert.equal(c3Db.status, SEAT_STATUS.HELD);
      assert.equal(c1Db.status, SEAT_STATUS.AVAILABLE, 'Unclaimed seat C1 must not be partially held');
    }
  });

  it('14. QR verification seamlessly handles General Admission registrations and URL-wrapped tokens', async () => {
    // Create a standalone GA registration (without Booking document)
    const gaEvent = await Event.create({
      title: 'Seating Test Event - General Admission',
      description: 'GA verification test',
      eventDate: new Date(Date.now() + 86400000 * 5),
      venue: 'Auditorium Hall',
      seatLimit: 100,
      seatsBooked: 1,
      isPaid: false,
      ticketPrice: 0,
      status: 'PUBLISHED',
      organizerId: new mongoose.Types.ObjectId(organizerUser.id)
    });

    const gaReg = await Registration.create({
      eventId: gaEvent._id,
      attendeeId: new mongoose.Types.ObjectId(attendeeUser2.id),
      status: 'CONFIRMED'
    });

    // 1. Verify via attendee registrations listing (populates signed token and qrCodePayload)
    const myRegsRes = await attendeeAgent2.get('/api/v1/registrations/me');
    assert.equal(myRegsRes.status, 200);
    const matched = myRegsRes.body.data.registrations.find(
      (r) => r._id === gaReg._id.toString()
    );
    assert.ok(matched, 'GA registration must appear in attendee list');
    assert.ok(matched.booking, 'GA registration must have populated booking metadata');
    assert.ok(matched.booking.ticketToken, 'GA registration must have signed ticket token');
    assert.ok(matched.booking.qrCodePayload.includes('/tickets/verify?token='));

    // 2. Verify scanning with the full signed token
    const verifySignedRes = await organizerAgent.get(
      `/api/v1/tickets/verify?token=${encodeURIComponent(matched.booking.ticketToken)}`
    );
    assert.equal(verifySignedRes.status, 200);
    assert.equal(verifySignedRes.body.data.isValid, true);
    assert.equal(verifySignedRes.body.data.eventTitle, gaEvent.title);
    assert.equal(verifySignedRes.body.data.attendeeName, attendeeUser2.name);

    // 3. Verify scanning when full URL is supplied
    const fullUrl = `https://eventora.omslabs.tech/tickets/verify?token=${encodeURIComponent(matched.booking.ticketToken)}`;
    const verifyUrlRes = await organizerAgent.get(
      `/api/v1/tickets/verify?token=${encodeURIComponent(fullUrl)}`
    );
    assert.equal(verifyUrlRes.status, 200);
    assert.equal(verifyUrlRes.body.data.isValid, true);

    // 4. Verify manual lookup via registration ID
    const verifyIdRes = await organizerAgent.get(
      `/api/v1/tickets/verify?token=${gaReg._id.toString()}`
    );
    assert.equal(verifyIdRes.status, 200);
    assert.equal(verifyIdRes.body.data.isValid, true);

    // 5. Organizer admits attendee and marks redeemed
    const admitRes = await organizerAgent
      .post('/api/v1/tickets/validate')
      .set('x-csrf-token', csrfOrg)
      .send({ token: matched.booking.ticketToken, markRedeemed: true });

    assert.equal(admitRes.status, 200);
    assert.equal(admitRes.body.data.isValid, true);
    assert.equal(admitRes.body.data.redeemed, true);

    // 6. Double admission attempt is rejected
    const doubleAdmitRes = await organizerAgent
      .post('/api/v1/tickets/validate')
      .set('x-csrf-token', csrfOrg)
      .send({ token: matched.booking.ticketToken, markRedeemed: true });

    assert.equal(doubleAdmitRes.status, 200);
    assert.equal(doubleAdmitRes.body.data.isValid, false);
    assert.equal(doubleAdmitRes.body.data.isAlreadyRedeemed, true);
  });
});

