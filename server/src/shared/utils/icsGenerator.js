/**
 * RFC 5545 Compliant iCalendar (.ics) Generator
 * Generates calendar passes for event registrations compatible with
 * Google Calendar, Apple Calendar, and Microsoft Outlook.
 */

/**
 * Formats a Date object into an RFC 5545 UTC date-time string: YYYYMMDDTHHmmssZ
 * @param {Date|string|number} date
 * @returns {string}
 */
export function formatIcsDateUtc(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error('Invalid date provided for iCalendar generation.');
  }
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hours = pad(d.getUTCHours());
  const minutes = pad(d.getUTCMinutes());
  const seconds = pad(d.getUTCSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Escapes text values according to RFC 5545 Section 3.3.11:
 * Backslash (\) -> \\
 * Semicolon (;) -> \;
 * Comma (,) -> \,
 * Newlines (\r\n, \r, \n) -> \n
 * @param {string} str
 * @returns {string}
 */
export function escapeIcsText(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Folds a single content line so no physical line exceeds 75 octets (bytes),
 * excluding the CRLF line break, using CRLF + single space per RFC 5545 Section 3.1.
 * Ensures UTF-8 multi-byte characters are never severed across fold boundaries.
 * @param {string} line
 * @param {number} [maxOctets=75]
 * @returns {string}
 */
export function foldIcsLine(line, maxOctets = 75) {
  if (!line) return '';
  const encoder = new TextEncoder();
  const encoded = encoder.encode(line);

  if (encoded.length <= maxOctets) {
    return line;
  }

  const parts = [];
  let currentBytes = [];
  let currentOctetCount = 0;
  let isFirstLine = true;

  // The first line has up to maxOctets. Subsequent continuation lines
  // begin with a single whitespace space (1 octet), so content length is maxOctets - 1.
  const getLineLimit = () => (isFirstLine ? maxOctets : maxOctets - 1);

  for (const char of line) {
    const charBytes = encoder.encode(char);
    if (currentOctetCount + charBytes.length > getLineLimit()) {
      parts.push(new TextDecoder().decode(new Uint8Array(currentBytes)));
      currentBytes = [...charBytes];
      currentOctetCount = charBytes.length;
      isFirstLine = false;
    } else {
      currentBytes.push(...charBytes);
      currentOctetCount += charBytes.length;
    }
  }

  if (currentBytes.length > 0) {
    parts.push(new TextDecoder().decode(new Uint8Array(currentBytes)));
  }

  return parts.join('\r\n ');
}

/**
 * Generates a full RFC 5545 compliant VCALENDAR payload for an event and registration.
 * @param {Object} params
 * @param {Object} params.event
 * @param {Object} params.registration
 * @param {Object} [params.booking]
 * @param {Date} [params.dtstamp]
 * @returns {string}
 */
export function generateEventIcs({ event, registration, booking, dtstamp = new Date() }) {
  if (!event || !event.eventDate) {
    throw new Error('Event with valid eventDate is required for iCalendar generation.');
  }

  const eventStart = new Date(event.eventDate);
  const eventEnd = event.endDate
    ? new Date(event.endDate)
    : new Date(eventStart.getTime() + 2 * 60 * 60 * 1000); // 2 hours default duration

  const regIdStr = registration?._id ? registration._id.toString() : 'general';
  const eventIdStr = event._id ? event._id.toString() : 'event';
  const uid = `eventora-${eventIdStr}-${regIdStr}@eventora.omslabs.tech`;

  const bookingRef = booking?.bookingReference || `EVT-${regIdStr.substring(0, 8).toUpperCase()}`;
  const seatInfo =
    booking?.seatLabels && booking.seatLabels.length > 0
      ? `Seats: ${booking.seatLabels.join(', ')}`
      : 'General Admission';

  let descriptionText = event.description || '';
  descriptionText += `\n\nBooking Reference: ${bookingRef}`;
  descriptionText += `\n${seatInfo}`;
  if (event.organizerId?.name) {
    descriptionText += `\nHost: ${event.organizerId.name}`;
  }

  const appBaseUrl = process.env.APP_BASE_URL || 'https://eventora.omslabs.tech';
  const eventUrl = `${appBaseUrl}/events/${eventIdStr}`;

  const organizerCn = event.organizerId?.name
    ? escapeIcsText(event.organizerId.name)
    : 'Eventora Organizer';
  const organizerMail = event.organizerId?.email || 'notifications@mail.omslabs.tech';

  const rawLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Eventora//Eventora Event Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDateUtc(dtstamp)}`,
    `DTSTART:${formatIcsDateUtc(eventStart)}`,
    `DTEND:${formatIcsDateUtc(eventEnd)}`,
    `SUMMARY:${escapeIcsText(event.title || 'Eventora Event')}`,
    `DESCRIPTION:${escapeIcsText(descriptionText)}`,
    `LOCATION:${escapeIcsText(event.venue || 'TBD')}`,
    'STATUS:CONFIRMED',
    `ORGANIZER;CN=${organizerCn}:mailto:${organizerMail}`,
    `URL:${eventUrl}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  const folded = rawLines.map((line) => foldIcsLine(line));
  return folded.join('\r\n') + '\r\n';
}
