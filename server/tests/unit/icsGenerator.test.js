import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatIcsDateUtc,
  escapeIcsText,
  foldIcsLine,
  generateEventIcs
} from '../../src/shared/utils/icsGenerator.js';

describe('iCalendar (RFC 5545) Generator (Unit Tests)', () => {
  describe('formatIcsDateUtc', () => {
    test('1. Formats Date accurately into UTC format YYYYMMDDTHHmmssZ', () => {
      const date = new Date('2026-12-25T14:30:45.000Z');
      const formatted = formatIcsDateUtc(date);
      assert.equal(formatted, '20261225T143045Z');
    });

    test('2. Correctly shifts local/offset dates to UTC without skewing', () => {
      // 2026-07-10 18:30:00 UTC+05:30 -> 13:00:00 UTC
      const date = new Date('2026-07-10T18:30:00.000+05:30');
      const formatted = formatIcsDateUtc(date);
      assert.equal(formatted, '20260710T130000Z');
    });

    test('3. Throws on invalid date values', () => {
      assert.throws(() => formatIcsDateUtc('invalid-date'), /Invalid date/);
    });
  });

  describe('escapeIcsText', () => {
    test('4. Escapes backslashes, semicolons, and commas correctly', () => {
      const raw = 'Tech, Music; Art & Design \\ Workshop';
      const escaped = escapeIcsText(raw);
      assert.equal(escaped, 'Tech\\, Music\\; Art & Design \\\\ Workshop');
    });

    test('5. Converts newline characters (\\r\\n, \\r, \\n) to literal \\n', () => {
      const raw = 'Line 1\r\nLine 2\nLine 3\rLine 4';
      const escaped = escapeIcsText(raw);
      assert.equal(escaped, 'Line 1\\nLine 2\\nLine 3\\nLine 4');
    });

    test('6. Handles null and undefined cleanly', () => {
      assert.equal(escapeIcsText(null), '');
      assert.equal(escapeIcsText(undefined), '');
    });
  });

  describe('foldIcsLine', () => {
    test('7. Keeps lines at or below 75 octets untouched', () => {
      const shortLine = 'SUMMARY:Annual Developer Conference 2026';
      const folded = foldIcsLine(shortLine);
      assert.equal(folded, shortLine);
      assert.ok(Buffer.byteLength(folded, 'utf8') <= 75);
    });

    test('8. Folds lines exceeding 75 octets with CRLF followed by a space', () => {
      const longLine =
        'DESCRIPTION:Join us for the premier full-stack web and cloud conference featuring 40+ speakers, interactive workshops, architectural reviews, and live hacking sessions.';
      const folded = foldIcsLine(longLine);

      // Verify CRLF and space fold convention
      assert.ok(folded.includes('\r\n '));

      // Verify each individual folded line is <= 75 octets
      const lines = folded.split('\r\n');
      for (let i = 0; i < lines.length; i++) {
        const lineBytes = Buffer.byteLength(lines[i], 'utf8');
        assert.ok(
          lineBytes <= 75,
          `Line ${i} exceeds 75 octets: ${lineBytes} octets (content: "${lines[i]}")`
        );
        if (i > 0) {
          assert.ok(lines[i].startsWith(' '), `Continuation line ${i} must start with space`);
        }
      }
    });

    test('9. Does not split multi-byte UTF-8 characters across fold boundaries', () => {
      // 3-byte and 4-byte characters (emoji and non-Latin scripts)
      const unicodeLine =
        'LOCATION:Grand Opera House 🎭 🌟 🎵 Bengaluru, Karnataka, India — Hall 42, Floor 7';
      const folded = foldIcsLine(unicodeLine, 40); // Force smaller boundary

      const lines = folded.split('\r\n');
      for (const line of lines) {
        assert.ok(Buffer.byteLength(line, 'utf8') <= 40);
      }
      // Reconstitute by un-folding (removing \r\n and leading space)
      const unfolded = folded.replace(/\r\n /g, '');
      assert.equal(unfolded, unicodeLine);
    });
  });

  describe('generateEventIcs', () => {
    test('10. Generates complete RFC 5545 valid calendar document', () => {
      const event = {
        _id: '67a80b88939c381c19d44321',
        title: 'Global DevCon 2026',
        description: 'The flagship event for software architects, full-stack engineers, and innovators.',
        venue: 'Convention Center, 123 Tech Blvd, San Francisco, CA',
        eventDate: new Date('2026-11-20T09:00:00.000Z'),
        endDate: new Date('2026-11-20T17:00:00.000Z'),
        organizerId: {
          name: 'Tech Events Inc.',
          email: 'contact@techevents.com'
        }
      };

      const registration = {
        _id: '67a80b88939c381c19d44999'
      };

      const booking = {
        bookingReference: 'EVT-BK-2026-999',
        seatLabels: ['Row A-12', 'Row A-14']
      };

      const fixedDtstamp = new Date('2026-11-01T12:00:00.000Z');
      const ics = generateEventIcs({ event, registration, booking, dtstamp: fixedDtstamp });

      // RFC 5545 structural assertions
      assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
      assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
      assert.ok(ics.includes('VERSION:2.0\r\n'));
      assert.ok(ics.includes('PRODID:-//Eventora//Eventora Event Calendar//EN\r\n'));
      assert.ok(ics.includes('CALSCALE:GREGORIAN\r\n'));
      assert.ok(ics.includes('METHOD:PUBLISH\r\n'));
      assert.ok(ics.includes('BEGIN:VEVENT\r\n'));
      // Validate UID is present (accounting for line folding per RFC 5545)
      const unfoldedIcs = ics.replace(/\r\n /g, '');
      assert.ok(
        unfoldedIcs.includes(
          'UID:eventora-67a80b88939c381c19d44321-67a80b88939c381c19d44999@eventora.omslabs.tech\r\n'
        )
      );
      assert.ok(ics.includes('DTSTAMP:20261101T120000Z\r\n'));
      assert.ok(ics.includes('DTSTART:20261120T090000Z\r\n'));
      assert.ok(ics.includes('DTEND:20261120T170000Z\r\n'));
      assert.ok(ics.includes('SUMMARY:Global DevCon 2026\r\n'));
      assert.ok(ics.includes('STATUS:CONFIRMED\r\n'));
      assert.ok(ics.includes('ORGANIZER;CN=Tech Events Inc.:mailto:contact@techevents.com\r\n'));
      assert.ok(ics.includes('END:VEVENT\r\n'));

      // Validate CRLF line endings throughout
      const lines = ics.split('\r\n');
      assert.ok(lines.length > 10);
      for (const line of lines) {
        assert.ok(!line.includes('\n'), 'No lone LF characters allowed');
        assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `Line exceeds 75 octets: ${line}`);
      }
    });

    test('11. Defaults DTEND to 2 hours after DTSTART when endDate is absent', () => {
      const event = {
        _id: '67a80b88939c381c19d44322',
        title: 'Open Source Meetup',
        description: 'Monthly open source community meetup.',
        venue: 'Community Hall',
        eventDate: new Date('2026-11-20T18:00:00.000Z')
      };

      const ics = generateEventIcs({ event });
      assert.ok(ics.includes('DTSTART:20261120T180000Z\r\n'));
      assert.ok(ics.includes('DTEND:20261120T200000Z\r\n')); // Exactly 2 hours later
    });
  });
});
