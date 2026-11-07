import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/connection.js';
import { User } from '../../src/modules/users/User.js';
import { Event } from '../../src/modules/events/Event.js';
import { Registration } from '../../src/modules/registrations/Registration.js';
import {
  sendRegistrationConfirmationEmail,
  setResendClient
} from '../../src/infrastructure/email/emailService.js';
import { REGISTRATION_STATUS, EVENT_STATUS } from '../../src/shared/constants/status.js';

describe('Transactional Registration Email & Resilience (Integration)', () => {
  let organizerAgent;
  let attendeeAgent;
  let csrfOrg;
  let csrfAtt;
  let organizerUser;
  let attendeeUser;
  let testEvent;

  before(async () => {
    process.env.NODE_ENV = 'test';
    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora');

    await User.deleteMany({ email: { $regex: '@emailtest.com$' } });
    await Event.deleteMany({ title: { $regex: 'Email Flow Summit' } });

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
        name: 'Conference Organizer',
        email: 'organizer@emailtest.com',
        password: 'SecurePassword@123',
        role: 'ORGANIZER'
      });
    organizerUser = orgRes.body.data.user;

    // Register attendee
    const attRes = await attendeeAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfAtt)
      .send({
        name: 'Taylor Swift',
        email: 'taylor@emailtest.com',
        password: 'SecurePassword@123',
        role: 'ATTENDEE'
      });
    attendeeUser = attRes.body.data.user;

    // Create an event
    const eventRes = await organizerAgent
      .post('/api/v1/events')
      .set('x-csrf-token', csrfOrg)
      .send({
        title: 'Email Flow Summit 2026',
        description: 'Testing end-to-end transactional email dispatch and error isolation.',
        eventDate: new Date(Date.now() + 86400000 * 10).toISOString(),
        venue: 'Grand Metropole Center',
        seatLimit: 50
      });
    testEvent = eventRes.body.data.event;
  });

  after(async () => {
    // Reset any mock
    setResendClient(null);
    await User.deleteMany({ email: { $regex: '@emailtest.com$' } });
    await Event.deleteMany({ title: { $regex: 'Email Flow Summit' } });
    await Registration.deleteMany({ eventId: testEvent?._id });
    await disconnectDatabase();
  });

  test('Successful event registration dispatches confirmation email non-blockingly', async () => {
    const res = await attendeeAgent
      .post(`/api/v1/events/${testEvent._id || testEvent.id}/registrations`)
      .set('x-csrf-token', csrfAtt)
      .send();

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.registration.status, REGISTRATION_STATUS.CONFIRMED);

    // Give the non-blocking background email dispatch 150ms to settle
    await new Promise((r) => setTimeout(r, 150));

    // Verify registration record in DB has confirmationEmailSent = true
    const regDoc = await Registration.findById(res.body.data.registration._id || res.body.data.registration.id);
    assert.ok(regDoc);
    assert.equal(regDoc.confirmationEmailSent, true);
    assert.equal(regDoc.status, REGISTRATION_STATUS.CONFIRMED);
  });

  test('Duplicate registration attempt returns 409 Conflict and triggers no duplicate email', async () => {
    const res = await attendeeAgent
      .post(`/api/v1/events/${testEvent._id || testEvent.id}/registrations`)
      .set('x-csrf-token', csrfAtt)
      .send();

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /already registered/i);

    // Verify only ONE registration document exists
    const count = await Registration.countDocuments({
      eventId: testEvent._id || testEvent.id,
      attendeeId: attendeeUser.id || attendeeUser._id
    });
    assert.equal(count, 1);
  });

  test('Direct email dispatch idempotency: deduplicates second call for same registration', async () => {
    const existingReg = await Registration.findOne({
      eventId: testEvent._id || testEvent.id,
      attendeeId: attendeeUser.id || attendeeUser._id
    });
    assert.ok(existingReg);
    assert.equal(existingReg.confirmationEmailSent, true);

    // Call sendRegistrationConfirmationEmail directly again
    const secondCall = await sendRegistrationConfirmationEmail({
      registrationId: existingReg._id.toString(),
      attendee: { name: attendeeUser.name, email: attendeeUser.email },
      event: testEvent
    });

    assert.equal(secondCall.success, false);
    assert.equal(secondCall.skipped, true);
    assert.equal(secondCall.reason, 'ALREADY_SENT');
  });

  test('Email carrier failure does NOT roll back or cancel successful registration', async () => {
    // Inject mock Resend client that throws an error
    setResendClient({
      emails: {
        send: async () => {
          throw new Error('Resend upstream 503 Service Unavailable');
        }
      }
    });

    // Create a second attendee
    const att2Agent = request.agent(app);
    const c3 = await att2Agent.get('/api/v1/auth/csrf');
    const att2Res = await att2Agent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', c3.body.data.csrfToken)
      .send({
        name: 'Jordan Belfort',
        email: 'jordan@emailtest.com',
        password: 'SecurePassword@123',
        role: 'ATTENDEE'
      });

    // Register second attendee
    const regRes = await att2Agent
      .post(`/api/v1/events/${testEvent._id || testEvent.id}/registrations`)
      .set('x-csrf-token', c3.body.data.csrfToken)
      .send();

    // The HTTP response MUST still be 201 Created! The user must NOT see a failure.
    assert.equal(regRes.status, 201);
    assert.equal(regRes.body.success, true);
    assert.equal(regRes.body.data.registration.status, REGISTRATION_STATUS.CONFIRMED);

    await new Promise((r) => setTimeout(r, 150));

    // Registration must exist in DB with CONFIRMED status
    const regInDb = await Registration.findById(regRes.body.data.registration._id || regRes.body.data.registration.id);
    assert.ok(regInDb);
    assert.equal(regInDb.status, REGISTRATION_STATUS.CONFIRMED);
    // Because mock failed, confirmationEmailSent should be false (ready for retry)
    assert.equal(regInDb.confirmationEmailSent, false);

    // Reset mock client
    setResendClient(null);
  });
});

