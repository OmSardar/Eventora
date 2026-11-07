import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/connection.js';
import { User } from '../../src/modules/users/User.js';
import { Event } from '../../src/modules/events/Event.js';
import { Registration } from '../../src/modules/registrations/Registration.js';
import { EVENT_STATUS } from '../../src/shared/constants/status.js';

describe('Concurrency & Edge-Case Business Rules (Integration)', () => {
  let organizerAgent;
  let attendee1Agent;
  let attendee2Agent;
  let attendee3Agent;
  let csrfOrg;
  let csrfAtt1;
  let csrfAtt2;
  let csrfAtt3;

  before(async () => {
    process.env.NODE_ENV = 'test';
    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora');

    await User.deleteMany({ email: { $regex: '@concurrencytest.com$' } });
    await Event.deleteMany({ title: { $regex: 'Concurrency Event' } });

    organizerAgent = request.agent(app);
    attendee1Agent = request.agent(app);
    attendee2Agent = request.agent(app);
    attendee3Agent = request.agent(app);

    const c1 = await organizerAgent.get('/api/v1/auth/csrf');
    csrfOrg = c1.body.data.csrfToken;

    const c2 = await attendee1Agent.get('/api/v1/auth/csrf');
    csrfAtt1 = c2.body.data.csrfToken;

    const c3 = await attendee2Agent.get('/api/v1/auth/csrf');
    csrfAtt2 = c3.body.data.csrfToken;

    const c4 = await attendee3Agent.get('/api/v1/auth/csrf');
    csrfAtt3 = c4.body.data.csrfToken;

    // Register organizer
    await organizerAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfOrg)
      .send({
        name: 'Concurrent Organizer',
        email: 'org@concurrencytest.com',
        password: 'Password@123',
        role: 'ORGANIZER'
      });

    // Register 3 distinct attendees
    await attendee1Agent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfAtt1)
      .send({
        name: 'Attendee One',
        email: 'att1@concurrencytest.com',
        password: 'Password@123',
        role: 'ATTENDEE'
      });

    await attendee2Agent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfAtt2)
      .send({
        name: 'Attendee Two',
        email: 'att2@concurrencytest.com',
        password: 'Password@123',
        role: 'ATTENDEE'
      });

    await attendee3Agent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfAtt3)
      .send({
        name: 'Attendee Three',
        email: 'att3@concurrencytest.com',
        password: 'Password@123',
        role: 'ATTENDEE'
      });
  });

  after(async () => {
    await User.deleteMany({ email: { $regex: '@concurrencytest.com$' } });
    await Event.deleteMany({ title: { $regex: 'Concurrency Event' } });
    await disconnectDatabase();
  });

  test('Concurrent registration: multiple attendees competing for 1 seat cannot exceed capacity', async () => {
    // 1. Create event with seatLimit: 1
    const futureDate = new Date(Date.now() + 86400000 * 5).toISOString();
    const eventRes = await organizerAgent
      .post('/api/v1/events')
      .set('x-csrf-token', csrfOrg)
      .send({
        title: 'Concurrency Event 1-Seat Challenge',
        description: 'Single seat event to rigorously test race conditions under concurrency.',
        eventDate: futureDate,
        venue: 'Quantum Labs',
        seatLimit: 1
      });

    assert.equal(eventRes.status, 201);
    const eventId = eventRes.body.data.event._id || eventRes.body.data.event.id;

    // 2. Fire 3 concurrent registration requests simultaneously
    const results = await Promise.all([
      attendee1Agent
        .post(`/api/v1/events/${eventId}/registrations`)
        .set('x-csrf-token', csrfAtt1)
        .send(),
      attendee2Agent
        .post(`/api/v1/events/${eventId}/registrations`)
        .set('x-csrf-token', csrfAtt2)
        .send(),
      attendee3Agent
        .post(`/api/v1/events/${eventId}/registrations`)
        .set('x-csrf-token', csrfAtt3)
        .send()
    ]);

    // 3. Exactly ONE registration must succeed with 201
    const successes = results.filter((r) => r.status === 201);
    const rejections = results.filter((r) => r.status === 400 || r.status === 409);

    assert.equal(successes.length, 1, 'Exactly one concurrent attendee must secure the seat');
    assert.equal(rejections.length, 2, 'Remaining attendees must be rejected with sold out or conflict');

    // 4. Verify database state: seatsBooked must be EXACTLY 1 (never 2 or 3!)
    const freshEvent = await Event.findById(eventId);
    assert.equal(freshEvent.seatsBooked, 1);

    const totalRegistrations = await Registration.countDocuments({ eventId });
    assert.equal(totalRegistrations, 1);
  });

  test('Registration must be rejected when event is completely full (Sold Out)', async () => {
    // Create an event with seatLimit: 1 and pre-seed seatsBooked: 1
    const orgUser = await User.findOne({ email: 'org@concurrencytest.com' });
    const fullEvent = await Event.create({
      title: 'Concurrency Event Sold Out',
      description: 'Testing full event rejection behavior.',
      eventDate: new Date(Date.now() + 86400000 * 7),
      venue: 'Auditorium Z',
      seatLimit: 1,
      seatsBooked: 1,
      organizerId: orgUser._id,
      status: EVENT_STATUS.PUBLISHED
    });

    const res = await attendee1Agent
      .post(`/api/v1/events/${fullEvent._id}/registrations`)
      .set('x-csrf-token', csrfAtt1)
      .send();

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /sold out/i);
  });

  test('Registration must be rejected when event is cancelled', async () => {
    const orgUser = await User.findOne({ email: 'org@concurrencytest.com' });
    const cancelledEvent = await Event.create({
      title: 'Concurrency Event Cancelled',
      description: 'Testing cancelled event rejection behavior.',
      eventDate: new Date(Date.now() + 86400000 * 7),
      venue: 'Auditorium Z',
      seatLimit: 10,
      seatsBooked: 0,
      organizerId: orgUser._id,
      status: EVENT_STATUS.CANCELLED
    });

    const res = await attendee1Agent
      .post(`/api/v1/events/${cancelledEvent._id}/registrations`)
      .set('x-csrf-token', csrfAtt1)
      .send();

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /cancelled or unpublished/i);
  });

  test('Registration must be rejected when event is past-dated', async () => {
    const orgUser = await User.findOne({ email: 'org@concurrencytest.com' });
    const pastEvent = await Event.create({
      title: 'Concurrency Event Past Dated',
      description: 'Testing past event rejection behavior.',
      eventDate: new Date(Date.now() - 86400000), // yesterday
      venue: 'Auditorium Z',
      seatLimit: 10,
      seatsBooked: 0,
      organizerId: orgUser._id,
      status: EVENT_STATUS.PUBLISHED
    });

    const res = await attendee1Agent
      .post(`/api/v1/events/${pastEvent._id}/registrations`)
      .set('x-csrf-token', csrfAtt1)
      .send();

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /past event/i);
  });
});

