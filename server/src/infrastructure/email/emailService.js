import dotenv from 'dotenv';
import { Resend } from 'resend';
import { logger } from '../logging/logger.js';
import { Registration } from '../../modules/registrations/Registration.js';
import { formatLocationDisplay } from '../security/deviceGeoService.js';

dotenv.config();

let resendInstance = null;

/**
 * Returns the Resend API client instance or null if in mock/dev mode.
 */
export function getResendClient() {
  if (resendInstance !== null) {
    return resendInstance;
  }

  // Only mock in isolated unit tests
  if (process.env.NODE_ENV === 'test') {
    return null;
  }

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    logger.error('RESEND_API_KEY is not defined in environment variables.');
    return null;
  }

  try {
    resendInstance = new Resend(apiKey.trim());
    return resendInstance;
  } catch (err) {
    logger.error({ err: err?.message }, 'Failed to initialize Resend client with RESEND_API_KEY from environment');
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
 * Resolves the authoritative frontend application base URL.
 */
export function getAppBaseUrl() {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/+$/, '');
  }
  if (process.env.CLIENT_URL) {
    return process.env.CLIENT_URL.replace(/\/+$/, '');
  }
  if (process.env.FRONTEND_URL) {
    return process.env.FRONTEND_URL.replace(/\/+$/, '');
  }

  // If ALLOWED_ORIGINS has a production HTTPS URL, prioritize it over localhost
  if (process.env.ALLOWED_ORIGINS) {
    const origins = process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
    const httpsOrigin = origins.find((o) => o.startsWith('https://'));
    if (httpsOrigin) {
      return httpsOrigin.replace(/\/+$/, '');
    }
    if (origins.length > 0) {
      return origins[0].replace(/\/+$/, '');
    }
  }

  return 'http://localhost:3000';
}

/**
 * Dispatches an email via Resend or logs in simulation/mock mode.
 */
async function sendEmail({ to, subject, html, text }) {
  let fromEmail = process.env.EMAIL_FROM || (process.env.NODE_ENV === 'test' ? 'Eventora <notifications@mail.omslabs.tech>' : null);
  if (!fromEmail) {
    logger.error('EMAIL_FROM is not defined in environment variables.');
    return { success: false, error: 'EMAIL_FROM environment variable missing' };
  }
  // Strip any accidental surrounding quotes introduced during dashboard copy-paste
  fromEmail = fromEmail.trim().replace(/^["']|["']$/g, '').trim();

  const client = getResendClient();

  if (!client && process.env.NODE_ENV === 'test') {
    logger.info(
      { to, from: fromEmail, subject },
      'Resend [MOCK/DEV MODE]: Email simulated successfully'
    );
    return { success: true, simulated: true, id: `mock_email_${Date.now()}` };
  }

  if (!client) {
    logger.error({ to, subject }, 'Could not dispatch email: Resend client is not initialized (check RESEND_API_KEY in .env)');
    return { success: false, error: 'Resend client is not initialized. Please verify RESEND_API_KEY in .env' };
  }

  let replyTo = process.env.EMAIL_REPLY_TO;
  if (replyTo) {
    replyTo = replyTo.trim().replace(/^["']|["']$/g, '').trim();
  }

  try {
    const payload = {
      from: fromEmail,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {})
    };
    const response = await client.emails.send(payload);

    if (response.error) {
      logger.error({ err: response.error.message || response.error, to, subject }, 'Resend API rejected email delivery');
      return { success: false, error: response.error.message || JSON.stringify(response.error) };
    }

    const emailId = response.data?.id || `email_${Date.now()}`;
    logger.info({ emailId, to, subject }, 'Email sent successfully via Resend');
    return { success: true, id: emailId };
  } catch (err) {
    logger.error({ err: err?.message, to, subject }, 'Exception calling Resend API');
    return { success: false, error: err?.message };
  }
}

/**
 * Base email layout wrapper.
 */
function wrapEmailTemplate({ title, badge, heading, bodyHtml, actionUrl, actionLabel, footerNotes }) {
  const appBaseUrl = getAppBaseUrl();
  const logoUrl = `${appBaseUrl}/brand/eventora-avatar.png`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #fafafa; }
    .wrapper { width: 100% !important; background-color: #09090b; padding: 24px 12px; box-sizing: border-box; }
    .container { width: 100% !important; max-width: 580px; margin: 0 auto; background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; box-sizing: border-box; }
    .header { padding: 24px 28px; border-bottom: 1px solid #27272a; box-sizing: border-box; }
    .brand-title { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff; margin: 0; }
    .brand-tagline { font-size: 12px; color: #a1a1aa; margin-top: 4px; }
    .content { padding: 28px; box-sizing: border-box; }
    .status-badge { display: inline-block; background-color: rgba(255, 255, 255, 0.1); color: #ffffff; border: 1px solid #3f3f46; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 9999px; margin-bottom: 16px; }
    .status-badge.alert { background-color: rgba(239, 68, 68, 0.15); color: #ef4444; border-color: rgba(239, 68, 68, 0.3); }
    .status-badge.success { background-color: rgba(16, 185, 129, 0.15); color: #10b981; border-color: rgba(16, 185, 129, 0.3); }
    .status-badge.warning { background-color: rgba(245, 158, 11, 0.15); color: #f59e0b; border-color: rgba(245, 158, 11, 0.3); }
    h1 { font-size: 22px; font-weight: 700; color: #ffffff; margin: 0 0 16px 0; line-height: 1.3; }
    p { font-size: 14px; line-height: 1.6; color: #d4d4d8; margin: 0 0 16px 0; word-break: break-word; overflow-wrap: anywhere; }
    .info-box { background-color: #27272a; border-radius: 8px; padding: 18px 20px; margin: 20px 0; border-left: 4px solid #ffffff; box-sizing: border-box; width: 100% !important; max-width: 100% !important; overflow: hidden; }
    .info-table { width: 100% !important; border-collapse: collapse; table-layout: fixed; }
    .info-table td { vertical-align: top; padding: 6px 0; font-size: 13px; line-height: 1.45; }
    .info-label { width: 130px; font-weight: 600; color: #ffffff; padding-right: 8px; }
    .info-value { color: #d4d4d8; word-break: break-all; overflow-wrap: anywhere; word-wrap: break-word; }
    .btn-container { text-align: center; margin: 28px 0 16px 0; }
    .btn { display: inline-block; background-color: #ffffff; color: #09090b !important; text-decoration: none; font-size: 13px; font-weight: 600; padding: 12px 28px; border-radius: 6px; }
    .footer { padding: 24px; border-top: 1px solid #27272a; background-color: #09090b; text-align: center; box-sizing: border-box; }
    .footer p { font-size: 12px; color: #71717a; margin: 0; line-height: 1.5; }
    .otp-code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #ffffff; text-align: center; padding: 16px; background-color: #27272a; border-radius: 8px; margin: 24px 0; box-sizing: border-box; }
    @media only screen and (max-width: 520px) {
      .wrapper { padding: 8px 4px !important; }
      .container { border-radius: 8px !important; }
      .header { padding: 18px 14px !important; }
      .content { padding: 20px 14px !important; }
      .info-box { padding: 14px 12px !important; margin: 16px 0 !important; }
      .info-table, .info-table tbody, .info-table tr { display: block !important; width: 100% !important; }
      .info-table td.info-label { display: block !important; width: 100% !important; padding: 6px 0 2px 0 !important; color: #a1a1aa !important; font-size: 11px !important; text-transform: uppercase !important; letter-spacing: 0.5px !important; }
      .info-table td.info-value { display: block !important; width: 100% !important; padding: 0 0 8px 0 !important; color: #ffffff !important; font-size: 13px !important; }
      .btn { display: block !important; width: 100% !important; text-align: center !important; box-sizing: border-box !important; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <td style="vertical-align: middle; padding-right: 14px;">
              <img src="${logoUrl}" alt="Eventora" width="40" height="40" style="display: block; width: 40px; height: 40px; border-radius: 9px; border: 0;" />
            </td>
            <td style="vertical-align: middle;">
              <div class="brand-title">EVENTORA</div>
              <div class="brand-tagline">Event Booking & RSVP Platform</div>
            </td>
          </tr>
        </table>
      </div>
      <div class="content">
        ${badge ? `<div class="status-badge ${badge.type || ''}">${badge.text}</div>` : ''}
        <h1>${heading}</h1>
        ${bodyHtml}
        ${actionUrl && actionLabel ? `
        <div class="btn-container">
          <a href="${actionUrl}" class="btn">${actionLabel}</a>
        </div>
        ` : ''}
      </div>
      <div class="footer">
        <p>Sent by Eventora — The Event Booking Platform.</p>
        ${footerNotes ? `<p style="margin-top: 4px;">${footerNotes}</p>` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;
}

// -------------------------------------------------------------
// 1. REGISTRATION CONFIRMATION EMAIL
// -------------------------------------------------------------

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

export function buildConfirmationEmailHtml({ attendeeName, event, registrationId, appBaseUrl, seatNumbers = [] }) {
  const formattedDate = formatEventDate(event.eventDate);
  const ticketsUrl = `${appBaseUrl.replace(/\/$/, '')}/attendee/registrations`;
  const seatsDisplay = Array.isArray(seatNumbers) && seatNumbers.length > 0 ? seatNumbers.join(', ') : null;

  return wrapEmailTemplate({
    title: `RSVP Confirmed - ${event.title}`,
    badge: { text: 'RSVP Confirmed', type: 'success' },
    heading: 'Your seat is reserved!',
    bodyHtml: `
      <p>Hi ${attendeeName || 'there'},</p>
      <p>Great news! Your registration for <strong>${event.title}</strong> has been successfully confirmed. We have reserved your seat.</p>
      
      <div style="background-color: #222226; border: 1px solid #333338; border-radius: 10px; padding: 18px 16px; margin: 20px 0; box-sizing: border-box; width: 100%;">
        <div style="font-weight: 700; color: #ffffff; font-size: 16px; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid #333338; line-height: 1.35; word-break: break-word;">
          ${event.title}
        </div>

        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #a1a1aa; margin-bottom: 3px;">Date &amp; Time</div>
          <div style="font-size: 13px; font-weight: 500; color: #f4f4f5; line-height: 1.4;">${formattedDate}</div>
        </div>

        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #a1a1aa; margin-bottom: 3px;">Venue / Location</div>
          <div style="font-size: 13px; font-weight: 500; color: #f4f4f5; line-height: 1.4; word-break: break-word;">${event.venue}</div>
        </div>

        ${seatsDisplay ? `
        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #10b981; margin-bottom: 4px;">Reserved Seats</div>
          <div style="display: inline-block; background-color: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #10b981; font-weight: 700; font-size: 14px; padding: 4px 10px; border-radius: 6px;">${seatsDisplay}</div>
        </div>
        ` : ''}

        <div>
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #a1a1aa; margin-bottom: 4px;">Booking Reference</div>
          <div style="display: inline-block; background-color: #121214; border: 1px solid #3f3f46; color: #38bdf8; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px; font-weight: 700; padding: 6px 12px; border-radius: 6px; letter-spacing: 0.5px; word-break: break-all;">${registrationId}</div>
        </div>
      </div>

      <div style="margin-top: 18px; padding: 12px 14px; background-color: #18181b; border: 1px solid #27272a; border-radius: 8px; font-size: 11px; color: #71717a; line-height: 1.5; box-sizing: border-box;">
        <span style="color: #a1a1aa; font-weight: 600; display: block; margin-bottom: 4px;">Direct Link:</span>
        <a href="${ticketsUrl}" style="color: #38bdf8; text-decoration: underline; word-break: break-all; display: inline-block;">${ticketsUrl}</a>
      </div>
    `,
    actionUrl: ticketsUrl,
    actionLabel: 'View Digital Ticket',
    footerNotes: "You received this transactional confirmation because you RSVP'd for this event."
  });
}

export function buildConfirmationEmailText({ attendeeName, event, registrationId, appBaseUrl }) {
  const formattedDate = formatEventDate(event.eventDate);
  const ticketsUrl = `${appBaseUrl.replace(/\/$/, '')}/attendee/registrations`;

  return `EVENTORA — RSVP CONFIRMATION\n\nHi ${attendeeName || 'there'},\n\nYour registration for "${event.title}" has been successfully confirmed! We have reserved your seat.\n\nEVENT DETAILS:\n- Title: ${event.title}\n- Date & Time: ${formattedDate}\n- Venue: ${event.venue}\n${event.description ? `- Summary: ${event.description}\n` : ''}- Booking Reference: ${registrationId}\n\nYou can view your digital ticket anytime at:\n${ticketsUrl}\n\n---\nSent by Eventora — The Event Booking Platform.\n`;
}

export async function sendRegistrationConfirmationEmail({ registrationId, attendee, event, seatNumbers = [] }) {
  if (!attendee?.email) {
    logger.warn({ registrationId }, 'Email skipped: Attendee has no email address');
    return { success: false, error: 'Attendee email address missing' };
  }

  const claimed = await Registration.findOneAndUpdate(
    { _id: registrationId, confirmationEmailSent: { $ne: true } },
    { $set: { confirmationEmailSent: true } },
    { new: true }
  );

  if (!claimed) {
    logger.info({ registrationId }, 'Email skipped: Confirmation email already sent for this registration');
    return { success: false, reason: 'ALREADY_SENT', skipped: true };
  }

  const appBaseUrl = getAppBaseUrl();
  const html = buildConfirmationEmailHtml({
    attendeeName: attendee.name,
    event,
    registrationId,
    appBaseUrl,
    seatNumbers
  });

  const text = buildConfirmationEmailText({
    attendeeName: attendee.name,
    event,
    registrationId,
    appBaseUrl
  });

  const res = await sendEmail({
    to: attendee.email,
    subject: `Confirmed: Your RSVP for ${event.title}`,
    html,
    text
  });

  if (!res.success) {
    await Registration.findByIdAndUpdate(registrationId, { $set: { confirmationEmailSent: false } });
  }

  return res;
}

// -------------------------------------------------------------
// 2. EMAIL VERIFICATION EMAIL
// -------------------------------------------------------------

export async function sendEmailVerificationEmail({ email, name, token }) {
  const appBaseUrl = getAppBaseUrl();
  const verifyUrl = `${appBaseUrl}/verify-email?token=${token}`;

  const html = wrapEmailTemplate({
    title: 'Verify your Eventora account email',
    badge: { text: 'Email Verification', type: 'success' },
    heading: 'Confirm your email address',
    bodyHtml: `
      <p>Hi ${name || 'there'},</p>
      <p>Thank you for joining Eventora. Please click the button below to verify your email address and activate all features on your account.</p>
      <p style="font-size: 13px; color: #a1a1aa;">This verification link will expire in <strong>30 minutes</strong> and can only be used once.</p>
      <div style="margin-top: 18px; padding: 12px 14px; background-color: rgba(255, 255, 255, 0.03); border: 1px solid #27272a; border-radius: 6px; font-size: 11px; color: #71717a; line-height: 1.5; word-break: break-all; overflow-wrap: anywhere;">
        <span style="color: #a1a1aa; font-weight: 600; display: block; margin-bottom: 4px;">Direct Link:</span>
        <a href="${verifyUrl}" style="color: #38bdf8; text-decoration: none; word-break: break-all; overflow-wrap: anywhere;">${verifyUrl}</a>
      </div>
    `,
    actionUrl: verifyUrl,
    actionLabel: 'Verify Email Address',
    footerNotes: 'If you did not sign up for an Eventora account, you can safely ignore this email.'
  });

  const text = `EVENTORA — VERIFY YOUR EMAIL\n\nHi ${name || 'there'},\nPlease verify your email address by visiting the link below within 30 minutes:\n${verifyUrl}\n\nIf you did not create an account, please ignore this email.`;

  return sendEmail({
    to: email,
    subject: 'Verify your Eventora account email',
    html,
    text
  });
}

// -------------------------------------------------------------
// 3. LOGIN NOTIFICATION EMAIL
// -------------------------------------------------------------

export async function sendLoginNotificationEmail({
  email,
  name,
  loginAt,
  ipAddress,
  location,
  device,
  authFactor
}) {
  const appBaseUrl = getAppBaseUrl();
  const securityUrl = `${appBaseUrl}/settings/security`;

  const dateObj = loginAt ? new Date(loginAt) : new Date();
  const utcString = dateObj.toUTCString();
  const readableLocal = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  }).format(dateObj);

  const locationStr = formatLocationDisplay(location);
  const deviceDisplay = device?.phoneModel || device?.summary || `${device?.browser || 'Browser'} on ${device?.os || 'OS'}`;

  const html = wrapEmailTemplate({
    title: 'New sign-in to your Eventora account',
    badge: { text: 'Security Alert', type: '' },
    heading: 'New sign-in detected',
    bodyHtml: `
      <p>Hi ${name || 'there'},</p>
      <p>A new sign-in to your Eventora account was recently completed:</p>
      
      <div style="background-color: #222226; border: 1px solid #333338; border-radius: 10px; padding: 18px 16px; margin: 20px 0; box-sizing: border-box; width: 100%;">
        <div style="font-weight: 700; color: #ffffff; font-size: 15px; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid #333338; line-height: 1.35;">
          Sign-In Details
        </div>

        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #a1a1aa; margin-bottom: 3px;">Account</div>
          <div style="font-size: 13px; color: #f4f4f5; word-break: break-all;">${email}</div>
        </div>

        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #a1a1aa; margin-bottom: 3px;">Time</div>
          <div style="font-size: 13px; color: #f4f4f5; line-height: 1.4;">${readableLocal} (${utcString})</div>
        </div>

        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #a1a1aa; margin-bottom: 4px;">IP Address</div>
          <div style="display: inline-block; background-color: #121214; border: 1px solid #3f3f46; color: #38bdf8; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 6px; letter-spacing: 0.3px;">${ipAddress || 'Unknown'}</div>
        </div>

        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #a1a1aa; margin-bottom: 3px;">Location</div>
          <div style="font-size: 13px; color: #f4f4f5; line-height: 1.4;">${locationStr}</div>
        </div>

        ${device?.phoneModel ? `
        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #38bdf8; margin-bottom: 3px;">Phone / Device Model</div>
          <div style="font-size: 13px; font-weight: 700; color: #38bdf8;">${device.phoneModel}</div>
        </div>
        ` : ''}

        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #a1a1aa; margin-bottom: 3px;">Operating System</div>
          <div style="font-size: 13px; color: #f4f4f5;">${device?.os || 'Unknown OS'}</div>
        </div>

        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #a1a1aa; margin-bottom: 3px;">Browser</div>
          <div style="font-size: 13px; color: #f4f4f5;">${device?.browser || 'Browser'} ${device?.browserVersion || ''}</div>
        </div>

        <div>
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #a1a1aa; margin-bottom: 3px;">Authentication Method</div>
          <div style="font-size: 13px; color: #10b981; font-weight: 600;">${authFactor || 'Password'}</div>
        </div>
      </div>

      <p style="color: #ef4444; font-size: 13px; font-weight: 500;">
        If you did not initiate this sign-in, change your password immediately, review your sessions, and contact support.
      </p>
    `,
    actionUrl: securityUrl,
    actionLabel: 'Review Account Security',
    footerNotes: 'This is a mandatory security alert sent whenever a successful login is authenticated.'
  });

  const text = `EVENTORA — NEW SIGN-IN DETECTED\n\nHi ${name || 'there'},\nA new sign-in to your Eventora account was detected.\n\nAccount: ${email}\nTime: ${readableLocal} (${utcString})\nIP Address: ${ipAddress}\nLocation: ${locationStr}\nDevice: ${deviceDisplay}\nOperating System: ${device?.os || 'Unknown'}\nMethod: ${authFactor}\n\nIf this was not you, secure your account at:\n${securityUrl}`;

  return sendEmail({
    to: email,
    subject: 'New sign-in to your Eventora account',
    html,
    text
  });
}

// -------------------------------------------------------------
// 4. EMAIL OTP TWO-FACTOR AUTHENTICATION EMAIL
// -------------------------------------------------------------

export async function sendEmailOtpEmail({ email, name, otp }) {
  const html = wrapEmailTemplate({
    title: `Your Eventora authentication code: ${otp}`,
    badge: { text: 'Two-Factor Authentication', type: 'success' },
    heading: 'Your verification code',
    bodyHtml: `
      <p>Hi ${name || 'there'},</p>
      <p>Use the six-digit verification code below to complete your sign-in to Eventora:</p>
      <div class="otp-code">${otp}</div>
      <p style="font-size: 13px; color: #a1a1aa; text-align: center;">
        This code is valid for <strong>5 minutes</strong> and can only be used once. Never share this code with anyone.
      </p>
    `,
    footerNotes: 'If you did not request this verification code, please secure your account immediately.'
  });

  const text = `EVENTORA — YOUR VERIFICATION CODE\n\nYour 6-digit authentication code is: ${otp}\n\nThis code expires in 5 minutes. Do not share it with anyone.`;

  return sendEmail({
    to: email,
    subject: `Your Eventora authentication code: ${otp}`,
    html,
    text
  });
}

// -------------------------------------------------------------
// 5. MFA ENABLED CONFIRMATION EMAIL
// -------------------------------------------------------------

export async function sendMfaEnabledAlertEmail({ email, name, factor }) {
  const appBaseUrl = getAppBaseUrl();
  const securityUrl = `${appBaseUrl}/settings/security`;
  const factorName = factor === 'TOTP' ? 'Authenticator App (TOTP)' : 'Email OTP';

  const html = wrapEmailTemplate({
    title: 'Two-Factor Authentication Enabled',
    badge: { text: 'Security Confirmation', type: 'success' },
    heading: 'Two-Factor Authentication Enabled',
    bodyHtml: `
      <p>Hi ${name || 'there'},</p>
      <p>Two-factor authentication via <strong>${factorName}</strong> has been successfully enabled for your Eventora account.</p>
      <p>Your account now has an extra layer of protection. You will be prompted for your second factor whenever you sign in from a new session.</p>
    `,
    actionUrl: securityUrl,
    actionLabel: 'Manage Security Settings',
    footerNotes: 'You received this email because MFA settings were changed on your account.'
  });

  const text = `EVENTORA — MFA ENABLED\n\nTwo-factor authentication via ${factorName} has been enabled for your account (${email}).\nReview your security settings at: ${securityUrl}`;

  return sendEmail({
    to: email,
    subject: 'Two-factor authentication enabled on your Eventora account',
    html,
    text
  });
}

// -------------------------------------------------------------
// 6. MFA DISABLED CONFIRMATION EMAIL
// -------------------------------------------------------------

export async function sendMfaDisabledAlertEmail({ email, name, factor }) {
  const appBaseUrl = getAppBaseUrl();
  const securityUrl = `${appBaseUrl}/settings/security`;
  const factorName = factor === 'TOTP' ? 'Authenticator App (TOTP)' : 'Email OTP';

  const html = wrapEmailTemplate({
    title: 'Security Alert: Two-Factor Authentication Disabled',
    badge: { text: 'Security Alert', type: 'alert' },
    heading: 'Two-Factor Authentication Disabled',
    bodyHtml: `
      <p>Hi ${name || 'there'},</p>
      <p style="color: #ef4444; font-weight: 600;">Two-factor authentication via ${factorName} has been turned off for your Eventora account.</p>
      <p>If you did not perform this action, please re-enable two-factor authentication and change your password immediately.</p>
    `,
    actionUrl: securityUrl,
    actionLabel: 'Secure Your Account',
    footerNotes: 'Critical security notification regarding your Eventora account.'
  });

  const text = `EVENTORA — SECURITY ALERT: MFA DISABLED\n\nTwo-factor authentication via ${factorName} was disabled for your account (${email}).\nIf you did not make this change, secure your account immediately:\n${securityUrl}`;

  return sendEmail({
    to: email,
    subject: 'Security Alert: Two-factor authentication disabled on your Eventora account',
    html,
    text
  });
}

// -------------------------------------------------------------
// 7. RECOVERY CODES REGENERATED EMAIL
// -------------------------------------------------------------

export async function sendRecoveryCodesRegeneratedAlertEmail({ email, name }) {
  const appBaseUrl = getAppBaseUrl();
  const securityUrl = `${appBaseUrl}/settings/security`;

  const html = wrapEmailTemplate({
    title: 'Security Alert: MFA Recovery Codes Regenerated',
    badge: { text: 'Security Alert', type: 'alert' },
    heading: 'MFA Recovery Codes Regenerated',
    bodyHtml: `
      <p>Hi ${name || 'there'},</p>
      <p>A new set of emergency recovery codes was just generated for your Eventora account.</p>
      <p>All previously generated recovery codes have been immediately invalidated and can no longer be used.</p>
      <p>If you did not regenerate these codes, please secure your account immediately.</p>
    `,
    actionUrl: securityUrl,
    actionLabel: 'Review Account Security',
    footerNotes: 'Critical security notification regarding your MFA recovery codes.'
  });

  const text = `EVENTORA — RECOVERY CODES REGENERATED\n\nA new set of MFA recovery codes was generated for your account (${email}). Old codes have been invalidated.\nIf this was not you, secure your account at:\n${securityUrl}`;

  return sendEmail({
    to: email,
    subject: 'Security Alert: MFA recovery codes regenerated',
    html,
    text
  });
}

// -------------------------------------------------------------
// 8. CANCELLATION & REFUND CONFIRMATION EMAIL
// -------------------------------------------------------------

export async function sendCancellationRefundEmail({
  attendeeEmail,
  attendeeName,
  event,
  registrationId,
  isPaid = false,
  refundAmount = 0,
  refundId = null,
  currency = 'INR',
  reason = 'Cancellation requested and approved'
}) {
  if (!attendeeEmail) {
    logger.warn({ registrationId }, 'Cancellation email skipped: Attendee email missing');
    return { success: false, error: 'Attendee email address missing' };
  }

  const appBaseUrl = getAppBaseUrl();
  const formattedDate = formatEventDate(event.eventDate);
  const formattedRefund = refundAmount > 0 ? (refundAmount / 100).toFixed(2) : '0.00';

  const html = wrapEmailTemplate({
    title: `Booking Cancelled - ${event.title}`,
    badge: {
      text: isPaid && refundAmount > 0 ? 'Booking Cancelled & Refund Initiated' : 'Booking Cancelled',
      type: 'alert'
    },
    heading: 'Your booking has been cancelled',
    bodyHtml: `
      <p>Hi ${attendeeName || 'there'},</p>
      <p>Your booking for <strong>${event.title}</strong> has been cancelled and your seat has been released.</p>
      
      <div style="background-color: #222226; border: 1px solid #333338; border-radius: 10px; padding: 18px 16px; margin: 20px 0; box-sizing: border-box; width: 100%;">
        <div style="font-weight: 700; color: #ffffff; font-size: 16px; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid #333338; line-height: 1.35; word-break: break-word;">
          ${event.title}
        </div>

        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #a1a1aa; margin-bottom: 3px;">Date &amp; Time</div>
          <div style="font-size: 13px; font-weight: 500; color: #f4f4f5; line-height: 1.4;">${formattedDate}</div>
        </div>

        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #a1a1aa; margin-bottom: 3px;">Venue / Location</div>
          <div style="font-size: 13px; font-weight: 500; color: #f4f4f5; line-height: 1.4; word-break: break-word;">${event.venue}</div>
        </div>

        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #a1a1aa; margin-bottom: 4px;">Booking Reference</div>
          <div style="display: inline-block; background-color: #121214; border: 1px solid #3f3f46; color: #38bdf8; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px; font-weight: 700; padding: 6px 12px; border-radius: 6px; letter-spacing: 0.5px; word-break: break-all;">${registrationId}</div>
        </div>

        ${
          isPaid && refundAmount > 0
            ? `<div style="margin-bottom: 12px;">
                 <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #10b981; margin-bottom: 4px;">Refund Amount</div>
                 <div style="display: inline-block; background-color: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #10b981; font-weight: 700; font-size: 14px; padding: 4px 10px; border-radius: 6px;">₹${formattedRefund} ${currency}</div>
               </div>
               ${refundId ? `<div>
                 <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #a1a1aa; margin-bottom: 4px;">Refund ID</div>
                 <div style="display: inline-block; background-color: #121214; border: 1px solid #3f3f46; color: #a1a1aa; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; padding: 4px 10px; border-radius: 6px; word-break: break-all;">${refundId}</div>
               </div>` : ''}`
            : ''
        }
      </div>

      ${
        isPaid && refundAmount > 0
          ? `<p style="font-size: 13px; color: #a1a1aa; margin-top: 16px;">
               A full refund of <strong>₹${formattedRefund} ${currency}</strong> has been initiated back to your original payment method. Depending on your bank or payment gateway, this typically appears on your account statement within 5–7 business days.
             </p>`
          : ''
      }

      <p style="font-size: 12px; color: #ef4444; margin-top: 16px; font-weight: 500;">
        Important: Since this booking was cancelled, you cannot re-book this event with this account.
      </p>
    `,
    actionUrl: `${appBaseUrl}/events`,
    actionLabel: 'Browse Other Events',
    footerNotes: 'This transactional notice was dispatched because your Eventora event registration was cancelled.'
  });

  const text = `EVENTORA — BOOKING CANCELLED\n\nHi ${attendeeName || 'there'},\n\nYour booking for "${event.title}" has been cancelled.\n${
    isPaid && refundAmount > 0
      ? `A refund of ₹${formattedRefund} ${currency} has been initiated to your original payment method (Refund ID: ${refundId || 'Pending'}).\n`
      : ''
  }\nBooking Reference: ${registrationId}\nEvent Date: ${formattedDate}\nVenue: ${event.venue}\n\nPlease note: Re-booking this event with this account is not permitted.\n\nBrowse other events: ${appBaseUrl}/events\n`;

  return sendEmail({
    to: attendeeEmail,
    subject: isPaid && refundAmount > 0
      ? `Booking Cancelled & Refund Initiated: ${event.title}`
      : `Booking Cancelled: ${event.title}`,
    html,
    text
  });
}

// -------------------------------------------------------------
// 9. PASSWORD RESET OTP EMAIL
// -------------------------------------------------------------

export async function sendPasswordResetOtpEmail({ email, name, otp }) {
  const html = wrapEmailTemplate({
    title: `Your Eventora password reset code: ${otp}`,
    badge: { text: 'Password Reset', type: 'warning' },
    heading: 'Reset your Eventora password',
    bodyHtml: `
      <p>Hi ${name || 'there'},</p>
      <p>We received a request to reset the password for your Eventora account (<strong>${email}</strong>). Use the six-digit verification code below to proceed:</p>
      <div class="otp-code">${otp}</div>
      <p style="font-size: 13px; color: #a1a1aa; text-align: center;">
        This code is valid for <strong>10 minutes</strong>. If you did not request a password reset, you can safely ignore this email — your account remains secure.
      </p>
    `,
    footerNotes: 'Never share this verification code with anyone. Eventora support will never ask for your code.'
  });

  const text = `EVENTORA — PASSWORD RESET CODE\n\nHi ${name || 'there'},\n\nYour 6-digit password reset code is: ${otp}\n\nThis code expires in 10 minutes. If you did not request this code, your account remains secure and no action is needed.`;

  return sendEmail({
    to: email,
    subject: `Your Eventora password reset code: ${otp}`,
    html,
    text
  });
}

// -------------------------------------------------------------
// 10. PASSWORD CHANGED SECURITY ALERT EMAIL
// -------------------------------------------------------------

export async function sendPasswordChangedAlertEmail({ email, name, ipAddress, userAgent, method = 'CURRENT_PASSWORD' }) {
  const appBaseUrl = getAppBaseUrl();
  const securityUrl = `${appBaseUrl}/settings/security`;
  const methodLabel = method === 'RESET_WITH_OTP'
    ? 'Forgot Password Verification (Email OTP)'
    : 'Account Security Settings (Current Password Verified)';

  const html = wrapEmailTemplate({
    title: 'Your Eventora password has been updated',
    badge: { text: 'Security Alert', type: 'success' },
    heading: 'Your password was successfully updated',
    bodyHtml: `
      <p>Hi ${name || 'there'},</p>
      <p>This email confirms that the password for your Eventora account (<strong>${email}</strong>) has been successfully updated.</p>
      
      <div style="background-color: #222226; border: 1px solid #333338; border-radius: 10px; padding: 18px 16px; margin: 20px 0; box-sizing: border-box; width: 100%;">
        <div style="font-weight: 700; color: #ffffff; font-size: 15px; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid #333338; line-height: 1.35;">
          Security Activity Details
        </div>

        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #a1a1aa; margin-bottom: 3px;">Verification Method</div>
          <div style="font-size: 13px; color: #f4f4f5; line-height: 1.4;">${methodLabel}</div>
        </div>

        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #a1a1aa; margin-bottom: 3px;">Timestamp</div>
          <div style="font-size: 13px; color: #f4f4f5; line-height: 1.4;">${new Date().toUTCString()}</div>
        </div>

        ${ipAddress ? `
        <div>
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #a1a1aa; margin-bottom: 4px;">IP Address</div>
          <div style="display: inline-block; background-color: #121214; border: 1px solid #3f3f46; color: #38bdf8; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 6px; letter-spacing: 0.3px;">${ipAddress}</div>
        </div>` : ''}
      </div>

      <p style="color: #ef4444; font-size: 13px;">
        <strong>Didn&apos;t perform this action?</strong> If you did not change your password, someone else may have gained access to your account. Please reset your password immediately or contact Eventora support.
      </p>
    `,
    actionUrl: securityUrl,
    actionLabel: 'Review Security Settings',
    footerNotes: 'You received this notification because your account credentials were changed.'
  });

  const text = `EVENTORA — SECURITY ALERT: PASSWORD UPDATED\n\nHi ${name || 'there'},\n\nThe password for your account (${email}) was recently updated.\nMethod: ${methodLabel}\nTimestamp: ${new Date().toUTCString()}\n${ipAddress ? `IP Address: ${ipAddress}\n` : ''}\nIf you did not make this change, please secure your account immediately: ${securityUrl}`;

  return sendEmail({
    to: email,
    subject: 'Your Eventora account password has been updated',
    html,
    text
  });
}
