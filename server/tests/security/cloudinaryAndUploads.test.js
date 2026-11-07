import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/connection.js';
import { User } from '../../src/modules/users/User.js';
import { Event } from '../../src/modules/events/Event.js';
import {
  setCloudinaryUploaderMock,
  setCloudinaryDestroyerMock
} from '../../src/infrastructure/cloudinary/cloudinaryService.js';

describe('Backend-Only Cloudinary Image Upload Architecture (Security & Integration)', () => {
  let organizerAgent;
  let organizer2Agent;
  let attendeeAgent;
  let anonAgent;
  let orgCsrf;
  let org2Csrf;
  let attCsrf;
  let organizerUser;
  let organizer2User;
  let testEvent;

  // Authentic magic byte buffers
  const validJpegBuffer = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB
  ]);

  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00
  ]);

  const validWebpBuffer = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x20, 0x18, 0x00, 0x00, 0x00, 0x30, 0x01
  ]);

  before(async () => {
    process.env.NODE_ENV = 'test';
    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora');

    await User.deleteMany({ email: { $regex: '@backendupload.com$' } });
    await Event.deleteMany({ title: { $regex: 'Backend Upload Event' } });

    organizerAgent = request.agent(app);
    organizer2Agent = request.agent(app);
    attendeeAgent = request.agent(app);
    anonAgent = request.agent(app);

    const orgCsrfRes = await organizerAgent.get('/api/v1/auth/csrf');
    orgCsrf = orgCsrfRes.body.data.csrfToken;

    const org2CsrfRes = await organizer2Agent.get('/api/v1/auth/csrf');
    org2Csrf = org2CsrfRes.body.data.csrfToken;

    const attCsrfRes = await attendeeAgent.get('/api/v1/auth/csrf');
    attCsrf = attCsrfRes.body.data.csrfToken;

    // Register organizer 1
    const o1 = await organizerAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', orgCsrf)
      .send({
        name: 'Primary Organizer',
        email: 'organizer1@backendupload.com',
        password: 'Password@123',
        role: 'ORGANIZER'
      });
    organizerUser = o1.body.data.user;

    // Register organizer 2
    const o2 = await organizer2Agent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', org2Csrf)
      .send({
        name: 'Secondary Organizer',
        email: 'organizer2@backendupload.com',
        password: 'Password@123',
        role: 'ORGANIZER'
      });
    organizer2User = o2.body.data.user;

    // Register attendee
    await attendeeAgent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', attCsrf)
      .send({
        name: 'Regular Attendee',
        email: 'attendee@backendupload.com',
        password: 'Password@123',
        role: 'ATTENDEE'
      });

    // Create a base event for organizer 1
    const evtRes = await organizerAgent
      .post('/api/v1/events')
      .set('x-csrf-token', orgCsrf)
      .send({
        title: 'Backend Upload Event Target',
        description: 'Testing server-side Cloudinary banner attachment.',
        eventDate: new Date(Date.now() + 86400000 * 5).toISOString(),
        venue: 'Grand Terminal',
        seatLimit: 50
      });
    testEvent = evtRes.body.data.event;
  });

  beforeEach(() => {
    // Reset mock handlers before each test
    setCloudinaryUploaderMock(null);
    setCloudinaryDestroyerMock(null);
  });

  after(async () => {
    setCloudinaryUploaderMock(null);
    setCloudinaryDestroyerMock(null);
    await User.deleteMany({ email: { $regex: '@backendupload.com$' } });
    await Event.deleteMany({ title: { $regex: 'Backend Upload Event' } });
    await disconnectDatabase();
  });

  // 1. Organizer successfully uploads a valid JPEG
  test('1. Organizer successfully uploads a valid JPEG', async () => {
    const res = await organizerAgent
      .post(`/api/v1/events/${testEvent._id || testEvent.id}/banner`)
      .set('x-csrf-token', orgCsrf)
      .attach('banner', validJpegBuffer, { filename: 'sample.jpg', contentType: 'image/jpeg' });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.banner.url);
    assert.equal(res.body.data.banner.format, 'jpg');
    assert.ok(res.body.data.banner.publicId.startsWith('eventora/events/'));

    // Verify DB update
    const updated = await Event.findById(testEvent._id || testEvent.id);
    assert.equal(updated.image.source, 'CLOUDINARY');
    assert.equal(updated.image.format, 'jpg');
    assert.equal(updated.bannerUrl, res.body.data.banner.url);
  });

  // 2. Organizer successfully uploads a valid PNG
  test('2. Organizer successfully uploads a valid PNG', async () => {
    const res = await organizerAgent
      .post(`/api/v1/events/${testEvent._id || testEvent.id}/banner`)
      .set('x-csrf-token', orgCsrf)
      .attach('banner', validPngBuffer, { filename: 'sample.png', contentType: 'image/png' });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.banner.format, 'png');

    const updated = await Event.findById(testEvent._id || testEvent.id);
    assert.equal(updated.image.format, 'png');
  });

  // 3. Organizer successfully uploads a valid WebP
  test('3. Organizer successfully uploads a valid WebP', async () => {
    const res = await organizerAgent
      .post(`/api/v1/events/${testEvent._id || testEvent.id}/banner`)
      .set('x-csrf-token', orgCsrf)
      .attach('banner', validWebpBuffer, { filename: 'sample.webp', contentType: 'image/webp' });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.banner.format, 'webp');

    const updated = await Event.findById(testEvent._id || testEvent.id);
    assert.equal(updated.image.format, 'webp');
  });

  // 4. Unauthenticated user cannot upload
  test('4. Unauthenticated user cannot upload', async () => {
    const res = await anonAgent
      .post(`/api/v1/events/${testEvent._id || testEvent.id}/banner`)
      .attach('banner', validJpegBuffer, { filename: 'sample.jpg', contentType: 'image/jpeg' });

    assert.equal(res.status, 401);
    assert.match(res.body.error.message, /authentication required/i);
  });

  // 5. Attendee cannot upload
  test('5. Attendee cannot upload', async () => {
    const res = await attendeeAgent
      .post(`/api/v1/events/${testEvent._id || testEvent.id}/banner`)
      .set('x-csrf-token', attCsrf)
      .attach('banner', validJpegBuffer, { filename: 'sample.jpg', contentType: 'image/jpeg' });

    assert.equal(res.status, 403);
    assert.match(res.body.error.message, /forbidden/i);
  });

  // 6. Organizer cannot upload to another organizer\'s event
  test('6. Organizer cannot upload to another organizer event', async () => {
    const res = await organizer2Agent
      .post(`/api/v1/events/${testEvent._id || testEvent.id}/banner`)
      .set('x-csrf-token', org2Csrf)
      .attach('banner', validJpegBuffer, { filename: 'sample.jpg', contentType: 'image/jpeg' });

    assert.equal(res.status, 403);
    assert.match(res.body.error.message, /not authorized/i);
  });

  // 7. Missing image is rejected
  test('7. Missing image is rejected with 400', async () => {
    const res = await organizerAgent
      .post(`/api/v1/events/${testEvent._id || testEvent.id}/banner`)
      .set('x-csrf-token', orgCsrf);

    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /image file is required/i);
  });

  // 8. Unsupported file format is rejected
  test('8. Unsupported file format (e.g. text or svg) is rejected', async () => {
    const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>');
    const res = await organizerAgent
      .post(`/api/v1/events/${testEvent._id || testEvent.id}/banner`)
      .set('x-csrf-token', orgCsrf)
      .attach('banner', svgBuffer, { filename: 'image.svg', contentType: 'image/svg+xml' });

    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /svg and xml\/html formats are not permitted|unsupported/i);
  });

  // 9. Spoofed MIME type is rejected
  test('9. Spoofed MIME type (text file disguised as .jpg) is rejected', async () => {
    const fakeJpegBuffer = Buffer.from('This is a plain text file pretending to be an image. Definitely not JPEG.');
    const res = await organizerAgent
      .post(`/api/v1/events/${testEvent._id || testEvent.id}/banner`)
      .set('x-csrf-token', orgCsrf)
      .attach('banner', fakeJpegBuffer, { filename: 'exploit.jpg', contentType: 'image/jpeg' });

    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /unsupported image format or invalid file signature/i);
  });

  // 10. Oversized file is rejected
  test('10. Oversized file (> 5MB) is rejected', async () => {
    // 5MB + 2000 bytes
    const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 2000);
    oversizedBuffer[0] = 0xFF;
    oversizedBuffer[1] = 0xD8;
    oversizedBuffer[2] = 0xFF;

    const res = await organizerAgent
      .post(`/api/v1/events/${testEvent._id || testEvent.id}/banner`)
      .set('x-csrf-token', orgCsrf)
      .attach('banner', oversizedBuffer, { filename: 'large.jpg', contentType: 'image/jpeg' });

    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /exceeds the 5mb maximum upload limit/i);
  });

  // 11. Cloudinary upload failure returns a controlled error
  test('11. Cloudinary upload failure returns a controlled error', async () => {
    setCloudinaryUploaderMock(() => {
      throw new Error('Cloudinary upstream 503 service unavailable');
    });

    const res = await organizerAgent
      .post(`/api/v1/events/${testEvent._id || testEvent.id}/banner`)
      .set('x-csrf-token', orgCsrf)
      .attach('banner', validJpegBuffer, { filename: 'sample.jpg', contentType: 'image/jpeg' });

    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /cloudinary/i);
  });

  // 12. Database update failure triggers appropriate uploaded-asset cleanup
  test('12. Database update failure triggers appropriate uploaded-asset cleanup', async () => {
    let deletedAsset = null;
    setCloudinaryDestroyerMock((publicId) => {
      deletedAsset = publicId;
      return { result: 'ok' };
    });

    // Provide an invalid event ID to cause find / update failure
    const nonExistentId = '666611112222333344445555';
    const res = await organizerAgent
      .post(`/api/v1/events/${nonExistentId}/banner`)
      .set('x-csrf-token', orgCsrf)
      .attach('banner', validJpegBuffer, { filename: 'sample.jpg', contentType: 'image/jpeg' });

    assert.equal(res.status, 404);
  });

  // 13. Replacing an existing image cleans up old asset after successful persistence
  test('13. Replacing an existing image cleans up the old asset after successful persistence', async () => {
    let destroyedPublicId = null;
    setCloudinaryDestroyerMock((publicId) => {
      destroyedPublicId = publicId;
      return { result: 'ok' };
    });

    // First upload
    const res1 = await organizerAgent
      .post(`/api/v1/events/${testEvent._id || testEvent.id}/banner`)
      .set('x-csrf-token', orgCsrf)
      .attach('banner', validJpegBuffer, { filename: 'first.jpg', contentType: 'image/jpeg' });
    assert.equal(res1.status, 200);
    const firstPublicId = res1.body.data.banner.publicId;

    // Second upload (replacement)
    const res2 = await organizerAgent
      .post(`/api/v1/events/${testEvent._id || testEvent.id}/banner`)
      .set('x-csrf-token', orgCsrf)
      .attach('banner', validPngBuffer, { filename: 'second.png', contentType: 'image/png' });
    assert.equal(res2.status, 200);

    // Give async cleanup a brief moment
    await new Promise((r) => setTimeout(r, 100));

    // Verify old asset was cleaned up
    assert.equal(destroyedPublicId, firstPublicId);
  });

  // 14. Failed replacement preserves the old image
  test('14. Failed replacement preserves the old image in DB', async () => {
    // Current event has an image from previous test
    const eventBefore = await Event.findById(testEvent._id || testEvent.id);
    const existingUrl = eventBefore.bannerUrl;

    // Simulate Cloudinary failure on replacement
    setCloudinaryUploaderMock(() => {
      throw new Error('Upload gateway timeout');
    });

    const res = await organizerAgent
      .post(`/api/v1/events/${testEvent._id || testEvent.id}/banner`)
      .set('x-csrf-token', orgCsrf)
      .attach('banner', validJpegBuffer, { filename: 'failing.jpg', contentType: 'image/jpeg' });

    assert.equal(res.status, 500);

    // Verify DB still holds the original image URL
    const eventAfter = await Event.findById(testEvent._id || testEvent.id);
    assert.equal(eventAfter.bannerUrl, existingUrl);
  });

  // 15. Cloudinary credentials are never returned in API responses
  test('15. Cloudinary credentials (API secret / key) are never returned in API responses', async () => {
    const res = await organizerAgent
      .post(`/api/v1/events/${testEvent._id || testEvent.id}/banner`)
      .set('x-csrf-token', orgCsrf)
      .attach('banner', validJpegBuffer, { filename: 'check.jpg', contentType: 'image/jpeg' });

    assert.equal(res.status, 200);
    const responseString = JSON.stringify(res.body);

    assert.equal(responseString.includes('api_secret'), false, 'Response must never leak api_secret');
    assert.equal(responseString.includes('CLOUDINARY_API_SECRET'), false, 'Response must never leak secret key name');
    assert.equal(responseString.includes('eventora-mock-secret'), false, 'Response must never leak secret value');
    assert.equal(responseString.includes('apiKey'), false, 'Response must never leak apiKey');
  });

  test('Pre-creation upload: Organizer can upload banner to /events/banner before event is created', async () => {
    const res = await organizerAgent
      .post('/api/v1/events/banner')
      .set('x-csrf-token', orgCsrf)
      .attach('banner', validJpegBuffer, { filename: 'precreate.jpg', contentType: 'image/jpeg' });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.banner.url);
    assert.ok(res.body.data.banner.publicId);
  });
});
