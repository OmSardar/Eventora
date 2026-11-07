import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/connection.js';
import { User } from '../../src/modules/users/User.js';
import { Event } from '../../src/modules/events/Event.js';
import { Registration } from '../../src/modules/registrations/Registration.js';
import { IDLE_TIMEOUT_MS, ABSOLUTE_TIMEOUT_MS } from '../../src/infrastructure/session/sessionConfig.js';

describe('Session Expiry & Privacy Isolation (Security)', () => {
  let attendeeAgentA;
  let attendeeAgentB;
  let organizerAgent;
  let csrfA;
  let csrfB;
  let csrfOrg;
  let testEventId;
  let regAId;

  before(async () => {
    process.env.NODE_ENV = 'test';
    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora');

    await User.deleteMany({ email: { $regex: '@privacytest.com$' } });
    await Event.deleteMany({ title: { $regex: 'Privacy Test Event' } });

    attendeeAgentA = request.agent(app);
    attendeeAgentB = request.agent(app);
    organizerAgent = request.agent(app);

    const c1 = await attendeeAgentA.get('/api/v1/auth/csrf');
    csrfA = c1.body.data.csrfToken;

    const c2 = await attendeeAgentB.get('/api/v1/auth/csrf');
    csrfB = c2.body.data.csrfToken;

    const c3 = await organizerAgent.get('/api/v1/auth/csrf');
    csrfOrg = c3.body.data.csrfToken;

    // Register Organizer
    await organizerAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfOrg)
      .send({
        name: 'Privacy Organizer',
        email: 'org@privacytest.com',
        password: 'Password@123',
        role: 'ORGANIZER'
      });

    // Register Attendee A
    await attendeeAgentA
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfA)
      .send({
        name: 'Attendee Alice',
        email: 'alice@privacytest.com',
        password: 'Password@123',
        role: 'ATTENDEE'
      });

    // Register Attendee B
    await attendeeAgentB
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfB)
      .send({
        name: 'Attendee Bob',
        email: 'bob@privacytest.com',
        password: 'Password@123',
        role: 'ATTENDEE'
      });

    // Create an event
    const evtRes = await organizerAgent
      .post('/api/v1/events')
      .set('x-csrf-token', csrfOrg)
      .send({
        title: 'Privacy Test Event 2026',
        description: 'Testing attendee privacy and resource isolation.',
        eventDate: new Date(Date.now() + 86400000 * 5).toISOString(),
        venue: 'Privacy Chamber',
        seatLimit: 20
      });

    testEventId = evtRes.body.data.event._id || evtRes.body.data.event.id;

    // Attendee Alice registers
    const regRes = await attendeeAgentA
      .post(`/api/v1/events/${testEventId}/registrations`)
      .set('x-csrf-token', csrfA)
      .send();

    regAId = regRes.body.data.registration._id || regRes.body.data.registration.id;
  });

  after(async () => {
    await User.deleteMany({ email: { $regex: '@privacytest.com$' } });
    await Event.deleteMany({ title: { $regex: 'Privacy Test Event' } });
    await disconnectDatabase();
  });

  test('Attendee Privacy: Attendee cannot view attendee roster of an event', async () => {
    // Attendee Alice attempts to access /api/v1/events/:eventId/attendees
    const res = await attendeeAgentA.get(`/api/v1/events/${testEventId}/attendees`);

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /Forbidden.*ORGANIZER/i);
  });

  test('Attendee Isolation: Attendee Bob cannot view Attendee Alice registrations', async () => {
    const res = await attendeeAgentB.get('/api/v1/registrations/me');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    // Bob should have 0 registrations, Alice has 1
    assert.equal(res.body.data.registrations.length, 0);
  });

  test('Resource Protection: Attendee Bob cannot request cancellation of Alice registration', async () => {
    const res = await attendeeAgentB
      .post(`/api/v1/registrations/${regAId}/cancellation-request`)
      .set('x-csrf-token', csrfB)
      .send({
        reason: 'Malicious attempt by Bob to cancel Alice ticket'
      });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /not authorized to cancel this registration/i);
  });

  test('Session Expiry: Request is rejected when session has exceeded idle timeout', async () => {
    // Create an agent with expired session in MongoDB sessions collection
    const expiredAgent = request.agent(app);
    const csrfRes = await expiredAgent.get('/api/v1/auth/csrf');
    const csrf = csrfRes.body.data.csrfToken;

    const reg = await expiredAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrf)
      .send({
        name: 'Idle User',
        email: 'idle@privacytest.com',
        password: 'Password@123',
        role: 'ATTENDEE'
      });

    assert.equal(reg.status, 201);

    // Manually manipulate session in MongoDB to simulate 35 minutes of inactivity
    const sessionCollection = mongoose.connection.collection('sessions');
    const sessions = await sessionCollection.find({}).toArray();
    
    // Find the session belonging to idle user
    for (const s of sessions) {
      const parsed = typeof s.session === 'string' ? JSON.parse(s.session) : s.session;
      if (parsed.user && parsed.user.email === 'idle@privacytest.com') {
        parsed.lastActivityAt = Date.now() - (IDLE_TIMEOUT_MS + 60000); // 31 mins ago
        await sessionCollection.updateOne(
          { _id: s._id },
          { $set: { session: typeof s.session === 'string' ? JSON.stringify(parsed) : parsed } }
        );
      }
    }

    // Now make an authenticated request -> should trigger idle expiry (401)
    const testReq = await expiredAgent.get('/api/v1/registrations/me');
    assert.equal(testReq.status, 401);
    assert.equal(testReq.body.success, false);
    assert.match(testReq.body.error.message, /inactivity/i);
  });

  test('Session Expiry: Request is rejected when session exceeds absolute timeout', async () => {
    const absoluteAgent = request.agent(app);
    const csrfRes = await absoluteAgent.get('/api/v1/auth/csrf');
    const csrf = csrfRes.body.data.csrfToken;

    const reg = await absoluteAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrf)
      .send({
        name: 'Absolute Timeout User',
        email: 'absolute@privacytest.com',
        password: 'Password@123',
        role: 'ATTENDEE'
      });

    assert.equal(reg.status, 201);

    // Manually manipulate session in MongoDB to simulate 25 hours since session creation
    const sessionCollection = mongoose.connection.collection('sessions');
    const sessions = await sessionCollection.find({}).toArray();
    
    for (const s of sessions) {
      const parsed = typeof s.session === 'string' ? JSON.parse(s.session) : s.session;
      if (parsed.user && parsed.user.email === 'absolute@privacytest.com') {
        parsed.createdAt = Date.now() - (ABSOLUTE_TIMEOUT_MS + 60000); // 24h + 1m ago
        parsed.lastActivityAt = Date.now(); // active recently, but creation was 24h ago
        await sessionCollection.updateOne(
          { _id: s._id },
          { $set: { session: typeof s.session === 'string' ? JSON.stringify(parsed) : parsed } }
        );
      }
    }

    // Authenticated request -> should trigger absolute timeout expiry (401)
    const testReq = await absoluteAgent.get('/api/v1/registrations/me');
    assert.equal(testReq.status, 401);
    assert.equal(testReq.body.success, false);
    assert.match(testReq.body.error.message, /maximum session duration exceeded/i);
  });
});

