import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConfirmationEmailHtml,
  buildConfirmationEmailText,
  sendRegistrationConfirmationEmail,
  getResendClient,
  setResendClient
} from '../../src/infrastructure/email/emailService.js';

describe('Transactional Email Service (Unit Tests)', () => {
  const mockEvent = {
    title: 'Modern Web Architecture Summit 2026',
    description: 'A deep-dive technical conference on distributed systems and event-driven architectures.',
    eventDate: new Date('2026-12-15T10:00:00.000Z'),
    venue: 'Convention Hall A, San Francisco, CA'
  };

  const mockRegistrationId = '666611112222333344445555';
  const appBaseUrl = 'https://eventora.example.com';

  test('buildConfirmationEmailHtml: generates complete, branded HTML email', () => {
    const html = buildConfirmationEmailHtml({
      attendeeName: 'Alex Mercer',
      event: mockEvent,
      registrationId: mockRegistrationId,
      appBaseUrl
    });

    assert.ok(html.includes('EVENTORA'), 'Should contain brand title');
    assert.ok(html.includes('RSVP Confirmed'), 'Should contain confirmed status badge');
    assert.ok(html.includes('Alex Mercer'), 'Should interpolate attendee name');
    assert.ok(html.includes(mockEvent.title), 'Should contain event title');
    assert.ok(html.includes(mockEvent.venue), 'Should contain event venue');
    assert.ok(html.includes(mockRegistrationId), 'Should contain booking reference');
    assert.ok(html.includes('https://eventora.example.com/attendee/registrations'), 'Should link to registrations page');
  });

  test('buildConfirmationEmailText: generates clean plain-text fallback', () => {
    const text = buildConfirmationEmailText({
      attendeeName: 'Alex Mercer',
      event: mockEvent,
      registrationId: mockRegistrationId,
      appBaseUrl
    });

    assert.ok(text.includes('EVENTORA — RSVP CONFIRMATION'));
    assert.ok(text.includes('Hi Alex Mercer,'));
    assert.ok(text.includes(mockEvent.title));
    assert.ok(text.includes(mockEvent.venue));
    assert.ok(text.includes(mockRegistrationId));
    assert.ok(text.includes('https://eventora.example.com/attendee/registrations'));
  });

  test('sendRegistrationConfirmationEmail: rejects when attendee has no email', async () => {
    const result = await sendRegistrationConfirmationEmail({
      registrationId: mockRegistrationId,
      attendee: { name: 'No Email User' },
      event: mockEvent
    });

    assert.equal(result.success, false);
    assert.equal(result.error, 'Attendee email address missing');
  });

  test('getResendClient: returns null in test environment', () => {
    const client = getResendClient();
    assert.equal(client, null);
  });
});

