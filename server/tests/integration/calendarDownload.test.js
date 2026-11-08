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
import { EVENT_STATUS, REGISTRATION_STATUS } from '../../src/shared/constants/status.js';

describe('Add to Calendar (.ics) Download (Integration Tests)', () => {
  let organizerAgent;
  let attendee1Agent;
  let attendee2Agent;
  let unauthAgent;

  let csrfOrg;
  let csrfAtt1;
  let csrfAtt2;

  let organizerUser;
  let attendee1User;
  let attendee2User;

  let activeEventId;
  let specialCharEventId;
  let registration1Id;
  let specialCharRegId;

  before(async () => {
    process.env.NODE_ENV = 'test';
    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora');

    await User.deleteMany({ email: { $regex: '@calendartest.com$' } });
    await Event.deleteMany({ title: { $regex: 'Calendar Test Event' } });

    organizerAgent = request.agent(app);
    attendee1Agent = request.agent(app);
    attendee2Agent = request.agent(app);
    unauthAgent = request.agent(app);

    const c1 = await organizerAgent.get('/api/v1/auth/csrf');
    csrfOrg = c1.body.data.csrfToken;

    const c2 = await attendee1Agent.get('/api/v1/auth/csrf');
    csrfAtt1 = c2.body.data.csrfToken;

    const c3 = await attendee2Agent.get('/api/v1/auth/csrf');
    csrfAtt2 = c3.body.data.csrfToken;

    // Register Organizer
    const orgRes = await organizerAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfOrg)
      .send({
        name: 'Calendar Organizer',
        email: 'organizer@calendartest.com',
        password: 'Password@123',
        role: 'ORGANIZER'
      });
    organizerUser = orgRes.body.data.user;
    await User.findByIdAndUpdate(organizerUser.id, { emailVerified: true });

    // Register Attendee 1
    const att1Res = await attendee1Agent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfAtt1)
      .send({
        name: 'Attendee One',
        email: 'attendee1@calendartest.com',
        password: 'Password@123',
        role: 'ATTENDEE'
      });
    attendee1User = att1Res.body.data.user;
    await User.findByIdAndUpdate(attendee1User.id, { emailVerified: true });

    // Register Attendee 2
    const att2Res = await attendee2Agent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfAtt2)
      .send({
        name: 'Attendee Two',
        email: 'attendee2@calendartest.com',
        password: 'Password@123',
        role: 'ATTENDEE'
      });
    attendee2User = att2Res.body.data.user;
    await User.findByIdAndUpdate(attendee2User.id, { emailVerified: true });

    // Create Active Event (in UTC: 2026-12-15 14:00:00 UTC)
    const eventDateUtc = new Date('2026-12-15T14:00:00.000Z');
    const ev1Res = await organizerAgent
      .post('/api/v1/events')
      .set('x-csrf-token', csrfOrg)
      .send({
        title: 'Calendar Test Event - Standard',
        description: 'Testing valid RFC 5545 calendar download functionality.',
        eventDate: eventDateUtc.toISOString(),
        venue: 'Main Auditorium, Cyber City',
        seatLimit: 50,
        category: 'Technology'
      });
    activeEventId = ev1Res.body.data.event._id || ev1Res.body.data.event.id;

    // Register Attendee 1 for Active Event
    const reg1Res = await attendee1Agent
      .post(`/api/v1/events/${activeEventId}/registrations`)
      .set('x-csrf-token', csrfAtt1)
      .send();
    registration1Id = reg1Res.body.data.registration._id;

    // Create Event with Special Characters & Multiline Description
    const ev2Res = await organizerAgent
      .post('/api/v1/events')
      .set('x-csrf-token', csrfOrg)
      .send({
        title: 'Calendar Test Event: Design, Code; AI \\ Special',
        description: 'Line 1: Innovation Hub\nLine 2: Design; Patterns, Architecture\nLine 3: Path C:\\Workspace\\Eventora',
        eventDate: new Date('2026-12-20T10:30:00.000Z').toISOString(),
        venue: 'Room 101, Building A; Block B, Tech Park',
        seatLimit: 25,
        category: 'Design'
      });
    specialCharEventId = ev2Res.body.data.event._id || ev2Res.body.data.event.id;

    // Register Attendee 1 for Special Char Event
    const reg2Res = await attendee1Agent
      .post(`/api/v1/events/${specialCharEventId}/registrations`)
      .set('x-csrf-token', csrfAtt1)
      .send();
    specialCharRegId = reg2Res.body.data.registration._id;
  });

  after(async () => {
    await disconnectDatabase();
  });

  test('1. Authenticated attendee can download RFC 5545 .ics file with correct headers and content', async () => {
    const res = await attendee1Agent
      .get(`/api/v1/registrations/${registration1Id}/calendar.ics`);

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/calendar/i);
    assert.match(res.headers['content-disposition'], /attachment; filename="calendar-test-event-standard\.ics"/i);

    const ics = res.text;
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
    assert.ok(ics.includes('VERSION:2.0\r\n'));
    assert.ok(ics.includes('PRODID:-//Eventora//Eventora Event Calendar//EN\r\n'));
    assert.ok(ics.includes('BEGIN:VEVENT\r\n'));
    assert.ok(ics.includes('STATUS:CONFIRMED\r\n'));
    assert.ok(ics.includes('SUMMARY:Calendar Test Event - Standard\r\n'));
    assert.ok(ics.includes('LOCATION:Main Auditorium\\, Cyber City\r\n'));
    assert.ok(ics.includes('END:VEVENT\r\n'));
  });

  test('2. Timezone conversion: DTSTART and DTEND are accurate UTC timestamps', async () => {
    const res = await attendee1Agent
      .get(`/api/v1/registrations/${registration1Id}/calendar`);

    assert.equal(res.status, 200);
    const ics = res.text;

    // 2026-12-15T14:00:00.000Z -> 20261215T140000Z
    assert.ok(ics.includes('DTSTART:20261215T140000Z\r\n'));
    // Default duration +2h -> 20261215T160000Z
    assert.ok(ics.includes('DTEND:20261215T160000Z\r\n'));
  });

  test('3. Special characters (commas, semicolons, backslashes) and multiline descriptions are escaped and folded', async () => {
    const res = await attendee1Agent
      .get(`/api/v1/registrations/${specialCharRegId}/calendar.ics`);

    assert.equal(res.status, 200);
    const ics = res.text;

    // Escaped title
    assert.ok(ics.includes('SUMMARY:Calendar Test Event: Design\\, Code\\; AI \\\\ Special\r\n'));
    // Escaped location
    assert.ok(ics.includes('LOCATION:Room 101\\, Building A\\; Block B\\, Tech Park\r\n'));
    // Escaped multiline description (with literal \n)
    const unfolded = ics.replace(/\r\n /g, '');
    assert.ok(unfolded.includes('Line 1: Innovation Hub\\nLine 2: Design\\; Patterns\\, Architecture\\nLine 3: Path C:\\\\Workspace\\\\Eventora'));
  });

  test('4. SECURITY: Unauthenticated request is rejected with 401', async () => {
    const res = await unauthAgent
      .get(`/api/v1/registrations/${registration1Id}/calendar.ics`);

    assert.equal(res.status, 401);
  });

  test('5. SECURITY: Attendee cannot download calendar pass for another attendee\'s registration (403 Forbidden)', async () => {
    const res = await attendee2Agent
      .get(`/api/v1/registrations/${registration1Id}/calendar.ics`);

    assert.equal(res.status, 403);
    assert.match(res.body.error.message, /not authorized/i);
  });

  test('6. BUSINESS RULE: Cancelled event calendar download is strictly rejected (400 Bad Request)', async () => {
    // Create and cancel an event
    const evCancelRes = await organizerAgent
      .post('/api/v1/events')
      .set('x-csrf-token', csrfOrg)
      .send({
        title: 'Calendar Test Event - Cancelled Event',
        description: 'This event will be cancelled.',
        eventDate: new Date('2026-12-28T10:00:00.000Z').toISOString(),
        venue: 'Auditorium C',
        seatLimit: 10,
        category: 'Technology'
      });
    const cancelledEvId = evCancelRes.body.data.event._id || evCancelRes.body.data.event.id;

    // Register Attendee 1
    const regRes = await attendee1Agent
      .post(`/api/v1/events/${cancelledEvId}/registrations`)
      .set('x-csrf-token', csrfAtt1)
      .send();
    const regId = regRes.body.data.registration._id;

    // Cancel the event
    const cancelRes = await organizerAgent
      .post(`/api/v1/events/${cancelledEvId}/cancel`)
      .set('x-csrf-token', csrfOrg)
      .send();
    assert.equal(cancelRes.status, 200);

    // Attempt download of calendar pass for cancelled event
    const downloadRes = await attendee1Agent
      .get(`/api/v1/registrations/${regId}/calendar.ics`);

    assert.equal(downloadRes.status, 400);
    assert.match(downloadRes.body.error.message, /Cannot download calendar pass for a cancelled event/i);
  });

  test('7. BUSINESS RULE: Cancelled registration is rejected (400 Bad Request)', async () => {
    // Create distinct event and cancelled registration
    const freshEvent = await Event.create({
      title: 'Calendar Test Event - Active Event for Cancelled Reg',
      description: 'Event is active but attendee registration is cancelled.',
      eventDate: new Date('2026-12-30T10:00:00.000Z'),
      venue: 'Auditorium D',
      seatLimit: 10,
      category: 'Technology',
      organizerId: new mongoose.Types.ObjectId(organizerUser.id),
      status: EVENT_STATUS.PUBLISHED
    });

    const dummyReg = await Registration.create({
      eventId: freshEvent._id,
      attendeeId: new mongoose.Types.ObjectId(attendee1User.id),
      status: REGISTRATION_STATUS.CANCELLED
    });

    const res = await attendee1Agent
      .get(`/api/v1/registrations/${dummyReg._id}/calendar.ics`);

    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /Cannot download calendar pass for a cancelled event or registration/i);
  });

  test('8. Edge Cases: Malformed registration ID returns 400; non-existent returns 404', async () => {
    const malformedRes = await attendee1Agent
      .get('/api/v1/registrations/not-a-valid-id/calendar.ics');
    assert.equal(malformedRes.status, 400);

    const nonExistentRes = await attendee1Agent
      .get(`/api/v1/registrations/${new mongoose.Types.ObjectId()}/calendar.ics`);
    assert.equal(nonExistentRes.status, 404);
  });
});
