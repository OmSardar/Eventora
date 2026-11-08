import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConfirmationEmailHtml,
  buildConfirmationEmailText,
  sendRegistrationConfirmationEmail,
  sendCancellationRefundEmail,
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

  test('buildConfirmationEmailHtml: generates complete, branded HTML email with responsive overflow protection', () => {
    const html = buildConfirmationEmailHtml({
      attendeeName: 'Alex Mercer',
      event: mockEvent,
      registrationId: mockRegistrationId,
      appBaseUrl,
      seatNumbers: ['Seat A1', 'Seat A2']
    });

    assert.ok(html.includes('EVENTORA'), 'Should contain brand title');
    assert.ok(html.includes('RSVP Confirmed'), 'Should contain confirmed status badge');
    assert.ok(html.includes('Alex Mercer'), 'Should interpolate attendee name');
    assert.ok(html.includes(mockEvent.title), 'Should contain event title');
    assert.ok(html.includes(mockEvent.venue), 'Should contain event venue');
    assert.ok(html.includes(mockRegistrationId), 'Should contain booking reference');
    assert.ok(html.includes('Seat A1, Seat A2'), 'Should contain assigned seats');
    assert.ok(html.includes('table-layout: fixed'), 'Should enforce fixed table layout to prevent horizontal overflow');
    assert.ok(html.includes('overflow-wrap: anywhere'), 'Should enforce word-break overflow protection');
    assert.ok(html.includes('Direct Link:'), 'Should contain styled direct link header');
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

  test('sendCancellationRefundEmail: rejects when attendee has no email', async () => {
    const result = await sendCancellationRefundEmail({
      attendeeEmail: null,
      attendeeName: 'No Email User',
      event: mockEvent,
      registrationId: mockRegistrationId
    });

    assert.equal(result.success, false);
    assert.equal(result.error, 'Attendee email address missing');
  });

  test('sendCancellationRefundEmail: dispatches simulation cleanly in non-production', async () => {
    const result = await sendCancellationRefundEmail({
      attendeeEmail: 'attendee@example.com',
      attendeeName: 'Alex Mercer',
      event: mockEvent,
      registrationId: mockRegistrationId,
      isPaid: true,
      refundAmount: 50000,
      refundId: 'rfnd_test123',
      currency: 'INR'
    });

    assert.equal(result.success, true);
    assert.equal(result.simulated, true);
  });

  test('getResendClient: returns null in test environment', () => {
    const client = getResendClient();
    assert.equal(client, null);
  });
});

