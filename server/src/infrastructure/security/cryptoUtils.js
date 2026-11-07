import crypto from 'crypto';

/**
 * Derives a 32-byte key for AES-256-GCM encryption.
 */
function getEncryptionKey() {
  const secret = process.env.MFA_ENCRYPTION_KEY || process.env.SESSION_SECRET || 'eventora-mfa-default-key-change-in-production-min-32-chars!';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts sensitive secrets at rest using authenticated AES-256-GCM encryption.
 * Format: ivHex:authTagHex:encryptedHex
 *
 * @param {string} plaintext
 * @returns {string}
 */
export function encryptSecret(plaintext) {
  if (!plaintext) return null;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an authenticated AES-256-GCM encrypted secret.
 *
 * @param {string} cipherString - Formatted as ivHex:authTagHex:encryptedHex
 * @returns {string|null}
 */
export function decryptSecret(cipherString) {
  if (!cipherString) return null;
  const parts = cipherString.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted secret format');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generates a cryptographically secure random hex token (default 32 bytes = 64 hex chars).
 */
export function generateRandomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Computes SHA-256 hex digest of a token or code for safe database storage.
 */
export function hashToken(token) {
  if (!token) return '';
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Generates a cryptographically secure 6-digit numeric OTP.
 */
export function generateNumericOtp(digits = 6) {
  const max = Math.pow(10, digits);
  const num = crypto.randomInt(0, max);
  return num.toString().padStart(digits, '0');
}

/**
 * Computes an HMAC-SHA256 hash of an OTP using a salt or challenge key.
 */
export function hashOtp(otp, salt = '') {
  const secret = process.env.OTP_SECRET || process.env.SESSION_SECRET || 'eventora-otp-secret-salt';
  return crypto.createHmac('sha256', secret).update(`${otp}:${salt}`).digest('hex');
}

/**
 * Timing-safe string comparison.
 */
export function timingSafeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const RECOVERY_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excludes ambiguous 0, O, 1, I

/**
 * Generates formatted, secure recovery codes (e.g. 5C9X2-8M7KP).
 * Returns array of plaintext codes and their SHA-256 hashes for storage.
 */
export function generateRecoveryCodes(count = 10) {
  const codes = [];
  const hashedCodes = [];

  for (let i = 0; i < count; i++) {
    let part1 = '';
    let part2 = '';
    const bytes1 = crypto.randomBytes(5);
    const bytes2 = crypto.randomBytes(5);

    for (let j = 0; j < 5; j++) {
      part1 += RECOVERY_CHARS[bytes1[j] % RECOVERY_CHARS.length];
      part2 += RECOVERY_CHARS[bytes2[j] % RECOVERY_CHARS.length];
    }

    const code = `${part1}-${part2}`;
    codes.push(code);
    hashedCodes.push({
      codeHash: hashToken(code),
      used: false,
      usedAt: null
    });
  }

  return { codes, hashedCodes };
}

