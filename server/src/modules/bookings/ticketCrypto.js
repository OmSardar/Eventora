import crypto from 'crypto';

function getTicketSigningSecret() {
  return process.env.JWT_SECRET || process.env.SESSION_SECRET || 'eventora_ticket_hmac_signing_secret_prod_grade';
}

/**
 * Generates an opaque, unguessable, cryptographically signed ticket token.
 * Contains no confidential attendee PII.
 */
export function generateSignedTicketToken({ bookingReference, eventId, attendeeId }) {
  const secret = getTicketSigningSecret();
  const payload = {
    ref: bookingReference,
    evt: eventId.toString(),
    att: attendeeId.toString(),
    iat: Math.floor(Date.now() / 1000),
    nonce: crypto.randomBytes(8).toString('hex')
  };

  const payloadString = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('base64url');

  return `${payloadString}.${signature}`;
}

/**
 * Verifies the cryptographic HMAC signature of a ticket token.
 * Returns parsed payload if authentic, null if invalid or tampered.
 */
export function verifySignedTicketToken(token) {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadString, signature] = parts;
  const secret = getTicketSigningSecret();

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('base64url');

  // Constant-time comparison to prevent timing attacks
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadString, 'base64url').toString('utf8'));
    return payload;
  } catch (_err) {
    return null;
  }
}

