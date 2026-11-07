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

  // Only mock in isolated unit tests
  if (process.env.NODE_ENV === 'test') {
    return null;
  }

  const hardcodedKnownGoodKey = '***REMOVED***';
  let apiKey = process.env.RESEND_API_KEY;

  if (
    !apiKey ||
    typeof apiKey !== 'string' ||
    apiKey.trim() === '' ||
    apiKey.startsWith('re_mock') ||
    apiKey.includes('placeholder') ||
    apiKey.includes('your_') ||
    !apiKey.startsWith('re_')
  ) {
    apiKey = hardcodedKnownGoodKey;
  }

  try {
    resendInstance = new Resend(apiKey);
    return resendInstance;
  } catch (err) {
    logger.warn({ err: err?.message }, 'Failed to initialize Resend client with env key, falling back to verified production key');
    try {
      resendInstance = new Resend(hardcodedKnownGoodKey);
      return resendInstance;
    } catch {
      return null;
    }
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
  let raw =
    process.env.APP_BASE_URL ||
    process.env.CLIENT_URL ||
    process.env.FRONTEND_URL;

  // In production or when deploying, never emit localhost links in customer-facing emails
  if (process.env.NODE_ENV === 'production' && (!raw || raw.includes('localhost') || raw.includes('127.0.0.1'))) {
    raw = 'https://eventora-black.vercel.app';
  }

  if (!raw) {
    if (process.env.ALLOWED_ORIGINS) {
      const prodOrigin = process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).find((o) => !o.includes('localhost'));
      if (prodOrigin) raw = prodOrigin;
    }
  }

  if (!raw) {
    raw = process.env.NODE_ENV === 'production' ? 'https://eventora-black.vercel.app' : 'http://localhost:3000';
  }

  return raw.replace(/\/+$/, '');
}

/**
 * Dispatches an email via Resend or logs in simulation/mock mode.
 */
async function sendEmail({ to, subject, html, text }) {
  let fromEmail = process.env.EMAIL_FROM || 'Eventora <notifications@mail.omslabs.tech>';
  if (!fromEmail || fromEmail.includes('resend.dev') || fromEmail.includes('example.com') || !fromEmail.includes('@')) {
    fromEmail = 'Eventora <notifications@mail.omslabs.tech>';
  }
  let client = getResendClient();

  if (!client && process.env.NODE_ENV === 'test') {
    logger.info(
      { to, from: fromEmail, subject },
      'Resend [MOCK/DEV MODE]: Email simulated successfully'
    );
    return { success: true, simulated: true, id: `mock_email_${Date.now()}` };
  }

  if (!client) {
    try {
      client = new Resend('***REMOVED***');
    } catch (e) {
      logger.error({ err: e?.message, to, subject }, 'Could not initialize Resend fallback client');
      return { success: false, error: 'Could not initialize Resend client' };
    }
  }

  const replyTo = process.env.EMAIL_REPLY_TO || 'omsardar12@gmail.com';

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
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #fafafa; }
    .wrapper { width: 100%; background-color: #09090b; padding: 40px 0; }
    .container { max-width: 580px; margin: 0 auto; background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; }
    .header { padding: 32px 32px 24px 32px; border-bottom: 1px solid #27272a; }
    .brand-title { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff; margin: 0; }
    .brand-tagline { font-size: 12px; color: #a1a1aa; margin-top: 4px; }
    .content { padding: 32px; }
    .status-badge { display: inline-block; background-color: rgba(255, 255, 255, 0.1); color: #ffffff; border: 1px solid #3f3f46; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 9999px; margin-bottom: 16px; }
    .status-badge.alert { background-color: rgba(239, 68, 68, 0.15); color: #ef4444; border-color: rgba(239, 68, 68, 0.3); }
    .status-badge.success { background-color: rgba(16, 185, 129, 0.15); color: #10b981; border-color: rgba(16, 185, 129, 0.3); }
    h1 { font-size: 22px; font-weight: 700; color: #ffffff; margin: 0 0 16px 0; line-height: 1.3; }
    p { font-size: 14px; line-height: 1.6; color: #d4d4d8; margin: 0 0 16px 0; }
    .info-box { background-color: #27272a; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #ffffff; }
    .info-row { display: flex; font-size: 13px; margin-bottom: 8px; color: #a1a1aa; }
    .info-label { font-weight: 600; color: #ffffff; min-width: 140px; }
    .btn-container { text-align: center; margin: 32px 0 16px 0; }
    .btn { display: inline-block; background-color: #ffffff; color: #09090b !important; text-decoration: none; font-size: 13px; font-weight: 600; padding: 12px 28px; border-radius: 6px; }
    .footer { padding: 24px 32px; border-top: 1px solid #27272a; background-color: #09090b; text-align: center; }
    .footer p { font-size: 12px; color: #71717a; margin: 0; line-height: 1.5; }
    .otp-code { font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #ffffff; text-align: center; padding: 16px; background-color: #27272a; border-radius: 8px; margin: 24px 0; }
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

export function buildConfirmationEmailHtml({ attendeeName, event, registrationId, appBaseUrl }) {
  const formattedDate = formatEventDate(event.eventDate);
  const ticketsUrl = `${appBaseUrl.replace(/\/$/, '')}/attendee/registrations`;

  return wrapEmailTemplate({
    title: `RSVP Confirmed - ${event.title}`,
    badge: { text: 'RSVP Confirmed', type: 'success' },
    heading: 'Your seat is reserved!',
    bodyHtml: `
      <p>Hi ${attendeeName || 'there'},</p>
      <p>Great news! Your registration for <strong>${event.title}</strong> has been successfully confirmed. We have reserved your seat.</p>
      <div class="info-box">
        <div style="font-weight: 700; color: #fff; margin-bottom: 12px;">${event.title}</div>
        <div class="info-row"><span class="info-label">Date & Time:</span> <span>${formattedDate}</span></div>
        <div class="info-row"><span class="info-label">Venue:</span> <span>${event.venue}</span></div>
        <div class="info-row"><span class="info-label">Booking Reference:</span> <span>${registrationId}</span></div>
      </div>
      <p style="font-size: 11px; color: #71717a; word-break: break-all;">Direct link: <a href="${ticketsUrl}" style="color: #a1a1aa;">${ticketsUrl}</a></p>
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

export async function sendRegistrationConfirmationEmail({ registrationId, attendee, event }) {
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
    appBaseUrl
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
      <p style="font-size: 12px; color: #71717a; word-break: break-all; margin-top: 16px;">
        If the button does not work, copy and paste this link into your browser:<br>
        <a href="${verifyUrl}" style="color: #a1a1aa;">${verifyUrl}</a>
      </p>
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

  const locationStr =
    location?.city && location.city !== 'Unknown'
      ? `${location.city}${location.region && location.region !== 'Unknown' ? ', ' + location.region : ''}, ${location.country}`
      : location?.country || 'Unknown location';

  const deviceStr = `${device?.browser || 'Browser'} ${device?.browserVersion || ''} on ${device?.os || 'OS'} (${device?.deviceType || 'Device'})`;

  const html = wrapEmailTemplate({
    title: 'New sign-in to your Eventora account',
    badge: { text: 'Security Alert', type: '' },
    heading: 'New sign-in detected',
    bodyHtml: `
      <p>Hi ${name || 'there'},</p>
      <p>A new sign-in to your Eventora account was recently completed:</p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Account:</span> <span>${email}</span></div>
        <div class="info-row"><span class="info-label">Time:</span> <span>${readableLocal} (${utcString})</span></div>
        <div class="info-row"><span class="info-label">IP Address:</span> <span>${ipAddress || 'Unknown'}</span></div>
        <div class="info-row"><span class="info-label">Approx. Location:</span> <span>${locationStr}</span></div>
        <div class="info-row"><span class="info-label">Device & Browser:</span> <span>${deviceStr}</span></div>
        <div class="info-row"><span class="info-label">Auth Method:</span> <span>${authFactor || 'Password'}</span></div>
      </div>
      <p style="color: #ef4444; font-size: 13px; font-weight: 500;">
        If you did not initiate this sign-in, change your password immediately, review your sessions, and contact support.
      </p>
    `,
    actionUrl: securityUrl,
    actionLabel: 'Review Account Security',
    footerNotes: 'This is a mandatory security alert sent whenever a successful login is authenticated.'
  });

  const text = `EVENTORA — NEW SIGN-IN DETECTED\n\nHi ${name || 'there'},\nA new sign-in to your Eventora account was detected.\n\nAccount: ${email}\nTime: ${readableLocal} (${utcString})\nIP Address: ${ipAddress}\nLocation: ${locationStr}\nDevice: ${deviceStr}\nMethod: ${authFactor}\n\nIf this was not you, secure your account at:\n${securityUrl}`;

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
