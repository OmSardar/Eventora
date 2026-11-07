import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/connection.js';
import { User } from '../../src/modules/users/User.js';
import { Event } from '../../src/modules/events/Event.js';

describe('Security & Access Control Enforcement', () => {
  let organizerAgentA;
  let organizerAgentB;
  let attendeeAgent;
  let csrfA;
  let csrfB;
  let csrfAttendee;
  let eventAId;

  before(async () => {
    process.env.NODE_ENV = 'test';
    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora');

    await User.deleteMany({ email: { $regex: '@sectest.com$' } });
    await Event.deleteMany({ title: { $regex: 'Security Isolation Event' } });

    organizerAgentA = request.agent(app);
    organizerAgentB = request.agent(app);
    attendeeAgent = request.agent(app);

    const csrfResA = await organizerAgentA.get('/api/v1/auth/csrf');
    csrfA = csrfResA.body.data.csrfToken;

    const csrfResB = await organizerAgentB.get('/api/v1/auth/csrf');
    csrfB = csrfResB.body.data.csrfToken;

    const csrfResAtt = await attendeeAgent.get('/api/v1/auth/csrf');
    csrfAttendee = csrfResAtt.body.data.csrfToken;

    // Register Organizer A
    await organizerAgentA
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfA)
      .send({
        name: 'Organizer Alpha',
        email: 'alpha@sectest.com',
        password: 'Password@123',
        role: 'ORGANIZER'
      });

    // Register Organizer B
    await organizerAgentB
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfB)
      .send({
        name: 'Organizer Beta',
        email: 'beta@sectest.com',
        password: 'Password@123',
        role: 'ORGANIZER'
      });

    // Register Attendee
    await attendeeAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfAttendee)
      .send({
        name: 'Attendee Gamma',
        email: 'gamma@sectest.com',
        password: 'Password@123',
        role: 'ATTENDEE'
      });

    // Create Event under Organizer A
    const eventRes = await organizerAgentA
      .post('/api/v1/events')
      .set('x-csrf-token', csrfA)
      .send({
        title: 'Security Isolation Event Alpha',
        description: 'Organizer Alpha exclusive event for ownership testing.',
        eventDate: new Date(Date.now() + 86400000 * 5).toISOString(),
        venue: 'Alpha Studio',
        seatLimit: 20
      });

    eventAId = eventRes.body.data.event._id || eventRes.body.data.event.id;
  });

  after(async () => {
    await User.deleteMany({ email: { $regex: '@sectest.com$' } });
    await Event.deleteMany({ title: { $regex: 'Security Isolation Event' } });
    await disconnectDatabase();
  });

  test('Unauthenticated user cannot access protected endpoints', async () => {
    const unauthAgent = request(app);

    const res = await unauthAgent.post('/api/v1/events').send({
      title: 'Hacked Event',
      description: 'Attempting unauthenticated event creation',
      eventDate: new Date(Date.now() + 86400000).toISOString(),
      venue: 'Nowhere',
      seatLimit: 10
    });

    // Should be rejected by CSRF or Auth
    assert.ok(res.status === 401 || res.status === 403);
    assert.equal(res.body.success, false);
  });

  test('Attendee role cannot create events (Role-Based Access Control)', async () => {
    const res = await attendeeAgent
      .post('/api/v1/events')
      .set('x-csrf-token', csrfAttendee)
      .send({
        title: 'Attendee Created Event',
        description: 'Attendee attempting to illegally create event.',
        eventDate: new Date(Date.now() + 86400000).toISOString(),
        venue: 'Nowhere',
        seatLimit: 10
      });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /Forbidden.*restricted to ORGANIZER/i);
  });

  test('Organizer role cannot register for events as an attendee', async () => {
    const res = await organizerAgentA
      .post(`/api/v1/events/${eventAId}/registrations`)
      .set('x-csrf-token', csrfA)
      .send();

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /Forbidden.*restricted to ATTENDEE/i);
  });

  test('Organizer B cannot modify Organizer A\'s event (Ownership Isolation)', async () => {
    const res = await organizerAgentB
      .patch(`/api/v1/events/${eventAId}`)
      .set('x-csrf-token', csrfB)
      .send({
        title: 'Tampered by Organizer B'
      });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /not authorized to edit this event/i);
  });

  test('Organizer B cannot cancel Organizer A\'s event', async () => {
    const res = await organizerAgentB
      .post(`/api/v1/events/${eventAId}/cancel`)
      .set('x-csrf-token', csrfB)
      .send();

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /not authorized to cancel this event/i);
  });

  test('State-changing request without CSRF token is rejected with 403', async () => {
    const res = await organizerAgentA
      .post('/api/v1/events')
      // Deliberately omitted x-csrf-token
      .send({
        title: 'Missing CSRF Event',
        description: 'Attempting to bypass CSRF synchronizer token check.',
        eventDate: new Date(Date.now() + 86400000).toISOString(),
        venue: 'Test Venue',
        seatLimit: 10
      });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /Missing CSRF token/i);
  });

  test('State-changing request with invalid CSRF token is rejected with 403', async () => {
    const res = await organizerAgentA
      .post('/api/v1/events')
      .set('x-csrf-token', 'completely-invalid-bogus-token-value')
      .send({
        title: 'Invalid CSRF Event',
        description: 'Attempting to forge CSRF synchronizer token.',
        eventDate: new Date(Date.now() + 86400000).toISOString(),
        venue: 'Test Venue',
        seatLimit: 10
      });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /Invalid CSRF token/i);
  });

  test('Untrusted Origin header is rejected by Origin check middleware', async () => {
    const res = await organizerAgentA
      .post('/api/v1/events')
      .set('origin', 'http://malicious-phishing-site.com')
      .set('x-csrf-token', csrfA)
      .send({
        title: 'Phishing Event',
        description: 'Origin validation check test payload.',
        eventDate: new Date(Date.now() + 86400000).toISOString(),
        venue: 'Test Venue',
        seatLimit: 10
      });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /Invalid Origin header/i);
  });
});
