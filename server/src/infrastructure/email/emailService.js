import { Resend } from 'resend';
import { logger } from '../logging/logger.js';
import { Registration } from '../../modules/registrations/Registration.js';

let resendInstance = null;

/**
 * Returns the Resend API client instance or null if in mock/dev mode.
 */
export function getResendClient() {
  if (resendInstance !== null) {
    return resendInstance;
  }

  const apiKey = process.env.RESEND_API_KEY;

  if (process.env.NODE_ENV === 'test' || !apiKey || apiKey.startsWith('re_mock') || apiKey.includes('placeholder')) {
    return null;
  }

  try {
    resendInstance = new Resend(apiKey);
    return resendInstance;
  } catch (err) {
    logger.warn({ err: err?.message }, 'Failed to initialize Resend client. Falling back to mock mode.');
    return null;
  }
}

/**
 * Allows test suites to inject a mock Resend client.
 */
export function setResendClient(mock) {
  resendInstance = mock;
}

/**
 * Generates formatted date and time string for email templates.
 */
function formatEventDate(date) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    }).format(new Date(date));
  } catch {
    return new Date(date).toUTCString();
  }
}

/**
 * Builds responsive, branded HTML email content for registration confirmation.
 */
export function buildConfirmationEmailHtml({ attendeeName, event, registrationId, appBaseUrl }) {
  const formattedDate = formatEventDate(event.eventDate);
  const ticketsUrl = `${appBaseUrl.replace(/\/$/, '')}/attendee/registrations`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RSVP Confirmed - ${event.title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #09090b;
      color: #fafafa;
    }
    .wrapper {
      width: 100%;
      background-color: #09090b;
      padding: 40px 0;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #18181b;
      border: 1px solid #27272a;
      border-radius: 12px;
      overflow: hidden;
    }
    .header {
      padding: 32px 32px 24px 32px;
      border-bottom: 1px solid #27272a;
      text-align: left;
    }
    .brand-title {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #ffffff;
      margin: 0;
    }
    .brand-tagline {
      font-size: 12px;
      color: #a1a1aa;
      margin-top: 4px;
    }
    .content {
      padding: 32px;
    }
    .status-badge {
      display: inline-block;
      background-color: rgba(16, 185, 129, 0.15);
      color: #10b981;
      border: 1px solid rgba(16, 185, 129, 0.3);
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 9999px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 24px;
      font-weight: 700;
      color: #ffffff;
      margin: 0 0 16px 0;
      line-height: 1.3;
    }
    p {
      font-size: 14px;
      line-height: 1.6;
      color: #d4d4d8;
      margin: 0 0 16px 0;
    }
    .event-card {
      background-color: #27272a;
      border-radius: 8px;
      padding: 20px;
      margin: 24px 0;
      border-left: 4px solid #ffffff;
    }
    .event-title {
      font-size: 16px;
      font-weight: 700;
      color: #ffffff;
      margin: 0 0 12px 0;
    }
    .event-row {
      display: flex;
      font-size: 13px;
      margin-bottom: 8px;
      color: #a1a1aa;
    }
    .event-label {
      font-weight: 600;
      color: #ffffff;
      min-width: 80px;
    }
    .btn-container {
      text-align: center;
      margin: 32px 0 16px 0;
    }
    .btn {
      display: inline-block;
      background-color: #ffffff;
      color: #09090b !important;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      padding: 12px 28px;
      border-radius: 6px;
    }
    .ref-text {
      font-size: 11px;
      color: #71717a;
      margin-top: 24px;
      word-break: break-all;
    }
    .footer {
      padding: 24px 32px;
      border-top: 1px solid #27272a;
      background-color: #09090b;
      text-align: center;
    }
    .footer p {
      font-size: 12px;
      color: #71717a;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="brand-title">EVENTORA</div>
        <div class="brand-tagline">Event Booking & RSVP Platform</div>
      </div>
      <div class="content">
        <div class="status-badge">RSVP Confirmed</div>
        <h1>Your seat is reserved!</h1>
        <p>Hi ${attendeeName || 'there'},</p>
        <p>Great news! Your registration for <strong>${event.title}</strong> has been successfully confirmed. We have reserved your seat.</p>

        <div class="event-card">
          <div class="event-title">${event.title}</div>
          <div class="event-row"><span class="event-label">Date & Time:</span> <span>${formattedDate}</span></div>
          <div class="event-row"><span class="event-label">Venue:</span> <span>${event.venue}</span></div>
          ${event.description ? `<p style="margin-top: 12px; font-size: 12px; color: #a1a1aa; line-height: 1.5;">${event.description.length > 180 ? `${event.description.substring(0, 177)}...` : event.description}</p>` : ''}
        </div>

        <div class="btn-container">
          <a href="${ticketsUrl}" class="btn">View Digital Ticket</a>
        </div>

        <div class="ref-text">
          Booking Reference: ${registrationId}<br>
          Direct link: <a href="${ticketsUrl}" style="color: #a1a1aa;">${ticketsUrl}</a>
        </div>
      </div>
      <div class="footer">
        <p>Sent by Eventora — The Event Booking Platform.</p>
        <p style="margin-top: 4px;">You received this transactional confirmation because you RSVP'd for this event.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Builds clean plain-text fallback content for registration confirmation.
 */
export function buildConfirmationEmailText({ attendeeName, event, registrationId, appBaseUrl }) {
  const formattedDate = formatEventDate(event.eventDate);
  const ticketsUrl = `${appBaseUrl.replace(/\/$/, '')}/attendee/registrations`;

  return `EVENTORA — RSVP CONFIRMATION

Hi ${attendeeName || 'there'},

Your registration for "${event.title}" has been successfully confirmed! We have reserved your seat.

EVENT DETAILS:
- Title: ${event.title}
- Date & Time: ${formattedDate}
- Venue: ${event.venue}
${event.description ? `- Summary: ${event.description}\n` : ''}
- Booking Reference: ${registrationId}

You can view your digital ticket anytime at:
${ticketsUrl}

---
Sent by Eventora — The Event Booking Platform.
`;
}

/**
 * Schedules and dispatches a registration confirmation email using the Resend API.
 * Guarantees idempotency (avoids duplicate emails) and non-blocking failure tolerance.
 *
 * @param {Object} params
 * @param {string} params.registrationId - MongoDB ObjectId string of the confirmed registration
 * @param {Object} params.attendee - User document/object with name and email
 * @param {Object} params.event - Event document/object with title, eventDate, venue, description
 * @returns {Promise<{ success: boolean, simulated?: boolean, id?: string, error?: string }>}
 */
export async function sendRegistrationConfirmationEmail({ registrationId, attendee, event }) {
  if (!attendee?.email) {
    logger.warn({ registrationId }, 'Email skipped: Attendee has no email address');
    return { success: false, error: 'Attendee email address missing' };
  }

  // Idempotency: Atomically ensure we only dispatch once per registration
  const claimed = await Registration.findOneAndUpdate(
    { _id: registrationId, confirmationEmailSent: { $ne: true } },
    { $set: { confirmationEmailSent: true } },
    { new: true }
  );

  if (!claimed) {
    logger.info({ registrationId }, 'Email skipped: Confirmation email already sent for this registration (deduplicated)');
    return { success: false, reason: 'ALREADY_SENT', skipped: true };
  }

  const fromEmail = process.env.EMAIL_FROM || 'Eventora <onboarding@resend.dev>';
  const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

  const html = buildConfirmationEmailHtml({
    attendeeName: attendee.name,
    event,
    registrationId,
    appBaseUrl
  });

  const text = buildConfirmationEmailText({
    attendeeName: attendee.name,
    event,
    registrationId,
    appBaseUrl
  });

  const client = getResendClient();

  // If no live client (e.g. test environment or local dev without live Resend key)
  if (!client) {
    logger.info(
      {
        to: attendee.email,
        from: fromEmail,
        eventTitle: event.title,
        registrationId
      },
      'Resend [MOCK/DEV MODE]: Registration confirmation email simulated successfully'
    );
    return { success: true, simulated: true, id: `mock_email_${Date.now()}` };
  }

  try {
    const response = await client.emails.send({
      from: fromEmail,
      to: [attendee.email],
      subject: `Confirmed: Your RSVP for ${event.title}`,
      html,
      text
    });

    if (response.error) {
      logger.error(
        { err: response.error.message, to: attendee.email, registrationId },
        'Resend API rejected email delivery'
      );
      // Revert flag so that subsequent manual or queued retry may succeed
      await Registration.findByIdAndUpdate(registrationId, { $set: { confirmationEmailSent: false } });
      return { success: false, error: response.error.message };
    }

    const emailId = response.data?.id || `email_${Date.now()}`;
    logger.info(
      { emailId, to: attendee.email, registrationId },
      'Registration confirmation email successfully sent via Resend'
    );

    return { success: true, id: emailId };
  } catch (err) {
    logger.error(
      { err: err?.message, to: attendee.email, registrationId },
      'Unexpected exception when calling Resend API'
    );
    await Registration.findByIdAndUpdate(registrationId, { $set: { confirmationEmailSent: false } });
    return { success: false, error: err?.message };
  }
}

