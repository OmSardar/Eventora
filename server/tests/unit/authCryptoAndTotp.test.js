import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encryptSecret,
  decryptSecret,
  generateRandomToken,
  hashToken,
  generateNumericOtp,
  hashOtp,
  timingSafeStringEqual,
  generateRecoveryCodes
} from '../../src/infrastructure/security/cryptoUtils.js';
import {
  generateTotpSecret,
  generateTotpUri,
  generateTotpQrCode,
  verifyTotpCode,
  createTotpInstance
} from '../../src/infrastructure/security/totpService.js';
import {
  getApproximateLocation,
  parseUserAgent,
  getClientIp
} from '../../src/infrastructure/security/deviceGeoService.js';

describe('Auth Cryptography & TOTP Security (Unit Tests)', () => {
  it('1. Authenticated AES-256-GCM encrypts and decrypts secrets with unique IVs', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const cipher1 = encryptSecret(secret);
    const cipher2 = encryptSecret(secret);

    assert.ok(cipher1, 'Ciphertext should be generated');
    assert.ok(cipher2, 'Ciphertext should be generated');
    assert.notEqual(cipher1, cipher2, 'Two encryptions of the same secret must produce distinct ciphertexts due to random IVs');

    const decrypted1 = decryptSecret(cipher1);
    const decrypted2 = decryptSecret(cipher2);

    assert.equal(decrypted1, secret, 'Decrypted secret should match original');
    assert.equal(decrypted2, secret, 'Decrypted secret should match original');
  });

  it('2. Rejects tampered AES-256-GCM ciphertexts with authentication tag validation', () => {
    const secret = 'SECRET_VALUE_TO_ENCRYPT';
    const cipher = encryptSecret(secret);
    const parts = cipher.split(':');

    // Flip the last two hex characters (maintaining even hex string length)
    const lastTwo = parts[2].slice(-2);
    const replacement = lastTwo === 'aa' ? 'bb' : 'aa';
    const tamperedEncrypted = parts[2].slice(0, -2) + replacement;
    const tamperedCipher = `${parts[0]}:${parts[1]}:${tamperedEncrypted}`;

    assert.throws(
      () => decryptSecret(tamperedCipher),
      /Unsupported state or unable to authenticate data/,
      'Tampered ciphertext must fail authentication tag check'
    );
  });

  it('3. Generates cryptographically secure 6-digit numeric OTPs and token hashes', () => {
    for (let i = 0; i < 20; i++) {
      const otp = generateNumericOtp(6);
      assert.match(otp, /^\d{6}$/, 'OTP must be exactly 6 digits');
    }

    const token = generateRandomToken(32);
    assert.equal(token.length, 64, '32-byte token must be 64 hex characters');

    const hash1 = hashToken(token);
    const hash2 = hashToken(token);
    assert.equal(hash1, hash2, 'Hash must be deterministic');
    assert.equal(hash1.length, 64, 'SHA-256 hash must be 64 hex characters');
  });

  it('4. Computes HMAC-SHA256 OTP hashes bound to challenge salt', () => {
    const otp = '123456';
    const challenge1 = 'ch_1';
    const challenge2 = 'ch_2';

    const h1 = hashOtp(otp, challenge1);
    const h2 = hashOtp(otp, challenge2);

    assert.notEqual(h1, h2, 'Different challenge salts must yield different OTP hashes');
    assert.ok(timingSafeStringEqual(h1, h1), 'Identical strings must return true in constant time');
    assert.ok(!timingSafeStringEqual(h1, h2), 'Different strings must return false in constant time');
  });

  it('5. Generates 10 single-use formatted recovery codes with SHA-256 hashes', () => {
    const { codes, hashedCodes } = generateRecoveryCodes(10);

    assert.equal(codes.length, 10, 'Should generate exactly 10 recovery codes');
    assert.equal(hashedCodes.length, 10, 'Should generate exactly 10 hashed codes');

    for (let i = 0; i < 10; i++) {
      assert.match(codes[i], /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/, 'Code should follow XXXXX-XXXXX format without ambiguous characters');
      assert.equal(hashedCodes[i].codeHash, hashToken(codes[i]), 'Hashed code must match SHA-256 of plaintext code');
      assert.equal(hashedCodes[i].used, false, 'Default used state must be false');
    }
  });

  it('6. Generates valid RFC 6238 TOTP secrets, URIs, and QR code data URLs', async () => {
    const secret = generateTotpSecret();
    assert.ok(secret && secret.length >= 16, 'Base32 secret should be at least 16 chars');

    const uri = generateTotpUri({ secretBase32: secret, email: 'test@eventora.demo' });
    assert.ok(uri.startsWith('otpauth://totp/'), 'URI must follow otpauth protocol');
    assert.ok(uri.includes('issuer=Eventora'), 'URI must identify issuer');
    assert.ok(uri.includes('test%40eventora.demo') || uri.includes('test@eventora.demo'), 'URI must include user email');

    const qrDataUrl = await generateTotpQrCode(uri);
    assert.ok(qrDataUrl.startsWith('data:image/png;base64,'), 'QR code should be a base64 PNG data URL');
  });

  it('7. Validates correct TOTP code within clock window and rejects invalid codes', () => {
    const secret = generateTotpSecret();
    const totp = createTotpInstance({ secretBase32: secret, email: 'user@example.com' });
    const currentCode = totp.generate();

    assert.match(currentCode, /^\d{6}$/, 'Generated code should be 6 digits');

    const valid = verifyTotpCode({ secretBase32: secret, code: currentCode, window: 1 });
    assert.equal(valid, true, 'Valid code generated within current step must pass');

    const invalid = verifyTotpCode({ secretBase32: secret, code: '000000', window: 1 });
    assert.equal(invalid, false, 'Arbitrary invalid code must fail');

    const malformed = verifyTotpCode({ secretBase32: secret, code: 'abc' });
    assert.equal(malformed, false, 'Non-digit code must fail validation');
  });

  it('8. GeoIP and Device parser extracts metadata without external dependencies', () => {
    // Local / private IP fallback
    const localLocation = getApproximateLocation('127.0.0.1');
    assert.equal(localLocation.city, 'Local / Private Network', 'Loopback IP should identify as local');

    // User-Agent parsing
    const uaChromeWindows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const parsed = parseUserAgent(uaChromeWindows);
    assert.equal(parsed.browser, 'Chrome', 'Browser should be identified as Chrome');
    assert.ok(parsed.os.includes('Windows'), 'OS should be identified as Windows');
    assert.equal(parsed.deviceType, 'Desktop', 'Device type should be Desktop');
  });

  it('9. Exact smartphone model and operating system extraction', () => {
    // Samsung Galaxy S23 Ultra
    const uaSamsung = 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36';
    const parsedSamsung = parseUserAgent(uaSamsung);
    assert.equal(parsedSamsung.phoneModel, 'Samsung Galaxy S23 Ultra');
    assert.equal(parsedSamsung.os, 'Android 14');
    assert.equal(parsedSamsung.deviceType, 'Mobile');

    // Google Pixel 8 Pro
    const uaPixel = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/UD1A.230803.041; wv) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36';
    const parsedPixel = parseUserAgent(uaPixel);
    assert.equal(parsedPixel.phoneModel, 'Google Pixel 8 Pro');
    assert.equal(parsedPixel.os, 'Android 14');

    // Apple iPhone
    const uaiPhone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
    const parsedIphone = parseUserAgent(uaiPhone);
    assert.equal(parsedIphone.phoneModel, 'Apple iPhone');
    assert.equal(parsedIphone.os, 'iOS 17.2');
    assert.equal(parsedIphone.deviceType, 'Mobile');
  });

  it('10. Edge reverse-proxy location and multi-hop IP extraction', () => {
    // Vercel edge headers
    const vercelLocation = getApproximateLocation('203.0.113.195', {
      'x-vercel-ip-city': 'Kolkata',
      'x-vercel-ip-country-region': 'WB',
      'x-vercel-ip-country': 'IN',
      'x-vercel-ip-timezone': 'Asia/Kolkata'
    });
    assert.equal(vercelLocation.city, 'Kolkata');
    assert.equal(vercelLocation.region, 'WB');
    assert.equal(vercelLocation.country, 'IN');
    assert.equal(vercelLocation.timezone, 'Asia/Kolkata');

    // Multi-hop client IP resolution
    const mockReq = {
      headers: {
        'x-forwarded-for': '49.37.150.22, 10.0.0.1, 127.0.0.1',
        'x-real-ip': '49.37.150.22'
      }
    };
    const extractedIp = getClientIp(mockReq);
    assert.equal(extractedIp, '49.37.150.22', 'Should resolve first public client IP');
  });
});
