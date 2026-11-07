import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';

/**
 * Generates a new cryptographically secure base32 secret for TOTP.
 */
export function generateTotpSecret() {
  const secret = new OTPAuth.Secret({ size: 20 });
  return secret.base32;
}

/**
 * Creates an RFC 6238 compliant TOTP instance.
 */
export function createTotpInstance({ secretBase32, email }) {
  return new OTPAuth.TOTP({
    issuer: 'Eventora',
    label: email || 'User',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32)
  });
}

/**
 * Generates an otpauth:// provisioning URI for authenticator applications.
 */
export function generateTotpUri({ secretBase32, email }) {
  const totp = createTotpInstance({ secretBase32, email });
  return totp.toString();
}

/**
 * Generates a QR code data URL (PNG) from an otpauth URI.
 */
export async function generateTotpQrCode(otpauthUri) {
  return QRCode.toDataURL(otpauthUri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });
}

/**
 * Validates a submitted 6-digit TOTP code against a secret with clock-skew tolerance (window = 1).
 *
 * @param {Object} params
 * @param {string} params.secretBase32 - The user's base32 TOTP secret
 * @param {string} params.code - The 6-digit code submitted by the user
 * @param {number} [params.window=1] - Number of 30-second steps tolerance (+/- 1 step)
 * @returns {boolean} True if the code is valid within the time window
 */
export function verifyTotpCode({ secretBase32, code, window = 1 }) {
  if (!secretBase32 || !code) return false;
  const cleanCode = String(code).trim();
  if (!/^\d{6}$/.test(cleanCode)) return false;

  try {
    const totp = new OTPAuth.TOTP({
      issuer: 'Eventora',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secretBase32)
    });

    const delta = totp.validate({
      token: cleanCode,
      window
    });

    return delta !== null;
  } catch {
    return false;
  }
}

