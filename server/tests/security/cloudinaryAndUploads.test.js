import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/connection.js';
import { User } from '../../src/modules/users/User.js';
import { Event } from '../../src/modules/events/Event.js';

describe('Cloudinary Image Upload & Security (Integration)', () => {
  let organizerAgent;
  let attendeeAgent;
  let anonAgent;
  let orgCsrf;
  let attCsrf;

  before(async () => {
    process.env.NODE_ENV = 'test';
    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora');

    await User.deleteMany({ email: { $regex: '@uploadtest.com$' } });
    await Event.deleteMany({ title: { $regex: 'Upload Test Event' } });

    organizerAgent = request.agent(app);
    attendeeAgent = request.agent(app);
    anonAgent = request.agent(app);

    // Get CSRF tokens
    const orgCsrfRes = await organizerAgent.get('/api/v1/auth/csrf');
    orgCsrf = orgCsrfRes.body.data.csrfToken;

    const attCsrfRes = await attendeeAgent.get('/api/v1/auth/csrf');
    attCsrf = attCsrfRes.body.data.csrfToken;

    // Register organizer
    await organizerAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', orgCsrf)
      .send({
        name: 'Upload Organizer',
        email: 'organizer@uploadtest.com',
        password: 'Password@123',
        role: 'ORGANIZER'
      });

    // Register attendee
    await attendeeAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', attCsrf)
      .send({
        name: 'Upload Attendee',
        email: 'attendee@uploadtest.com',
        password: 'Password@123',
        role: 'ATTENDEE'
      });
  });

  after(async () => {
    await User.deleteMany({ email: { $regex: '@uploadtest.com$' } });
    await Event.deleteMany({ title: { $regex: 'Upload Test Event' } });
    await disconnectDatabase();
  });

  test('Unauthenticated user cannot generate Cloudinary upload signature', async () => {
    const res = await anonAgent
      .post('/api/v1/events/image-signature')
      .send();

    assert.equal(res.status, 401, 'Must reject unauthenticated signature request with 401');
  });

  test('Attendee is forbidden from generating Cloudinary upload signature', async () => {
    const res = await attendeeAgent
      .post('/api/v1/events/image-signature')
      .set('x-csrf-token', attCsrf)
      .send();

    assert.equal(res.status, 403, 'Must reject attendee with 403 Forbidden');
    assert.match(res.body.error.message, /Forbidden/);
  });

  test('Authenticated organizer receives signed upload parameters and secret is never leaked', async () => {
    const res = await organizerAgent
      .post('/api/v1/events/image-signature')
      .set('x-csrf-token', orgCsrf)
      .send();

    assert.equal(res.status, 200);
    const data = res.body.data;

    assert.ok(data.signature, 'Must return a cryptographic signature string');
    assert.ok(data.timestamp, 'Must return timestamp');
    assert.ok(data.apiKey, 'Must return API key');
    assert.ok(data.cloudName, 'Must return cloud name');
    assert.equal(data.folder, 'eventora/events', 'Must enforce eventora/events destination folder');

    // CRITICAL: Ensure api_secret is NEVER present anywhere in response body
    const responseString = JSON.stringify(res.body);
    assert.equal(responseString.includes('api_secret'), false, 'Response must never leak api_secret');
    assert.equal(responseString.includes('eventora-mock-secret'), false, 'Response must never leak secret string');
  });

  test('Event created with Cloudinary image metadata persists both image and legacy bannerUrl', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 7).toISOString();
    const res = await organizerAgent
      .post('/api/v1/events')
      .set('x-csrf-token', orgCsrf)
      .send({
        title: 'Upload Test Event with Cloudinary',
        description: 'Testing event persistence with verified Cloudinary asset metadata.',
        eventDate: futureDate,
        venue: 'Skyline Pavilion',
        seatLimit: 50,
        image: {
          source: 'CLOUDINARY',
          url: 'https://res.cloudinary.com/eventora/image/upload/v12345/eventora/events/sample.jpg',
          publicId: 'eventora/events/sample'
        }
      });

    assert.equal(res.status, 201);
    const event = res.body.data.event;

    assert.equal(event.image.source, 'CLOUDINARY');
    assert.equal(event.image.url, 'https://res.cloudinary.com/eventora/image/upload/v12345/eventora/events/sample.jpg');
    assert.equal(event.image.publicId, 'eventora/events/sample');
    assert.equal(event.bannerUrl, 'https://res.cloudinary.com/eventora/image/upload/v12345/eventora/events/sample.jpg');
  });

  test('Event created with legacy bannerUrl automatically normalizes image object', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 8).toISOString();
    const res = await organizerAgent
      .post('/api/v1/events')
      .set('x-csrf-token', orgCsrf)
      .send({
        title: 'Upload Test Event Legacy URL',
        description: 'Testing backward compatibility with string bannerUrl.',
        eventDate: futureDate,
        venue: 'Grand Hall',
        seatLimit: 40,
        bannerUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87'
      });

    assert.equal(res.status, 201);
    const event = res.body.data.event;

    assert.equal(event.bannerUrl, 'https://images.unsplash.com/photo-1540575467063-178a50c2df87');
    assert.equal(event.image.source, 'URL');
    assert.equal(event.image.url, 'https://images.unsplash.com/photo-1540575467063-178a50c2df87');
    assert.equal(event.image.publicId, null);
  });

  test('Malicious image URL schemes (e.g. javascript:) are rejected', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 9).toISOString();
    const res = await organizerAgent
      .post('/api/v1/events')
      .set('x-csrf-token', orgCsrf)
      .send({
        title: 'Upload Test Malicious Event',
        description: 'Testing prevention of XSS payload in image URL.',
        eventDate: futureDate,
        venue: 'Test Venue',
        seatLimit: 20,
        bannerUrl: 'javascript:alert(1)'
      });

    assert.equal(res.status, 400, 'Must reject malicious URL scheme with 400');
  });
});

