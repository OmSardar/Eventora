import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/connection.js';
import { User } from '../../src/modules/users/User.js';
import { Event } from '../../src/modules/events/Event.js';
import { Registration } from '../../src/modules/registrations/Registration.js';

describe('Event & Registration Business Rules (Integration)', () => {
  let organizerAgent;
  let attendeeAgent;
  let organizerCsrf;
  let attendeeCsrf;
  let createdEventId;

  before(async () => {
    process.env.NODE_ENV = 'test';
    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora');

    // Clean test state
    const existingEvents = await Event.find({ title: { $regex: 'Test Suite Event' } }).select('_id');
    const existingEventIds = existingEvents.map((e) => e._id);
    await Registration.deleteMany({ eventId: { $in: existingEventIds } });
    await Event.deleteMany({ title: { $regex: 'Test Suite Event' } });
    await User.deleteMany({ email: { $regex: '@testflow.com$' } });

    organizerAgent = request.agent(app);
    attendeeAgent = request.agent(app);

    // Fetch CSRF tokens
    const orgCsrfRes = await organizerAgent.get('/api/v1/auth/csrf');
    organizerCsrf = orgCsrfRes.body.data.csrfToken;

    const attCsrfRes = await attendeeAgent.get('/api/v1/auth/csrf');
    attendeeCsrf = attCsrfRes.body.data.csrfToken;

    // Register organizer
    const orgReg = await organizerAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', organizerCsrf)
      .send({
        name: 'Organizer Tester',
        email: 'organizer@testflow.com',
        password: 'Password@123',
        role: 'ORGANIZER'
      });
    assert.equal(orgReg.status, 201);

    // Register attendee
    const attReg = await attendeeAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', attendeeCsrf)
      .send({
        name: 'Attendee Tester',
        email: 'attendee@testflow.com',
        password: 'Password@123',
        role: 'ATTENDEE'
      });
    assert.equal(attReg.status, 201);
  });

  after(async () => {
    const testEvents = await Event.find({ title: { $regex: 'Test Suite Event' } }).select('_id');
    const testEventIds = testEvents.map((e) => e._id);
    await Registration.deleteMany({ eventId: { $in: testEventIds } });
    await Event.deleteMany({ title: { $regex: 'Test Suite Event' } });
    await User.deleteMany({ email: { $regex: '@testflow.com$' } });
    await disconnectDatabase();
  });

  test('Organizer should successfully create a valid future event', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 10).toISOString();
    const res = await organizerAgent
      .post('/api/v1/events')
      .set('x-csrf-token', organizerCsrf)
      .send({
        title: 'Test Suite Event 2026',
        description: 'Detailed description for test suite event with sufficient length.',
        eventDate: futureDate,
        venue: 'Engineering Auditorium',
        seatLimit: 5,
        category: 'Technology'
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.event.title, 'Test Suite Event 2026');
    assert.equal(res.body.data.event.seatsBooked, 0);

    createdEventId = res.body.data.event._id || res.body.data.event.id;
    assert.ok(createdEventId);
  });

  test('Backend must reject creating an event with a past date', async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const res = await organizerAgent
      .post('/api/v1/events')
      .set('x-csrf-token', organizerCsrf)
      .send({
        title: 'Test Suite Event Past',
        description: 'This is an invalid past event that must be rejected.',
        eventDate: pastDate,
        venue: 'Engineering Auditorium',
        seatLimit: 50
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  test('Attendee should successfully register for the created event', async () => {
    const res = await attendeeAgent
      .post(`/api/v1/events/${createdEventId}/registrations`)
      .set('x-csrf-token', attendeeCsrf)
      .send();

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.event.seatsBooked, 1);
  });

  test('Backend must reject duplicate registration by the same attendee', async () => {
    const res = await attendeeAgent
      .post(`/api/v1/events/${createdEventId}/registrations`)
      .set('x-csrf-token', attendeeCsrf)
      .send();

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /already registered/i);
  });

  test('Organizer cannot reduce seat limit below current bookings (seatsBooked = 1)', async () => {
    const res = await organizerAgent
      .patch(`/api/v1/events/${createdEventId}`)
      .set('x-csrf-token', organizerCsrf)
      .send({
        seatLimit: 0
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /cannot be reduced below current bookings/i);
  });

  test('Organizer can view attendee list including attendee name and email', async () => {
    const res = await organizerAgent.get(`/api/v1/events/${createdEventId}/attendees`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.attendees.length, 1);
    assert.equal(res.body.data.attendees[0].attendee.email, 'attendee@testflow.com');
  });

  test('Attendee can view their registrations on /registrations/me', async () => {
    const res = await attendeeAgent.get('/api/v1/registrations/me');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.registrations.length, 1);
    assert.equal(res.body.data.registrations[0].eventId.title, 'Test Suite Event 2026');
  });

  test('Attendee cannot re-register after registration is cancelled', async () => {
    // 1. Get registration ID
    const myRegs = await attendeeAgent.get('/api/v1/registrations/me');
    const registrationId = myRegs.body.data.registrations[0]._id;

    // 2. Request cancellation
    const cancelReq = await attendeeAgent
      .post(`/api/v1/registrations/${registrationId}/cancellation-request`)
      .set('x-csrf-token', attendeeCsrf)
      .send({ reason: 'Schedule conflict' });
    assert.equal(cancelReq.status, 200);

    // 3. Organizer approves cancellation
    const approveReq = await organizerAgent
      .post(`/api/v1/cancellation-requests/${registrationId}/approve`)
      .set('x-csrf-token', organizerCsrf)
      .send({ note: 'Cancellation approved by test organizer' });
    assert.equal(approveReq.status, 200);

    // 4. Attendee attempts to re-register for the exact same event
    const reRegisterRes = await attendeeAgent
      .post(`/api/v1/events/${createdEventId}/registrations`)
      .set('x-csrf-token', attendeeCsrf)
      .send();

    assert.equal(reRegisterRes.status, 400);
    assert.equal(reRegisterRes.body.success, false);
    assert.match(reRegisterRes.body.error.message, /previously cancelled/i);
  });
});

