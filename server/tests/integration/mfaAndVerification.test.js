import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/connection.js';
import { User } from '../../src/modules/users/User.js';
import { Event } from '../../src/modules/events/Event.js';
import { EmailVerificationToken } from '../../src/modules/authentication/EmailVerificationToken.js';
import { MfaChallenge } from '../../src/modules/authentication/MfaChallenge.js';
import { LoginSecurityEvent } from '../../src/modules/authentication/LoginSecurityEvent.js';
import { decryptSecret } from '../../src/infrastructure/security/cryptoUtils.js';
import { createTotpInstance } from '../../src/infrastructure/security/totpService.js';
import { setResendClient } from '../../src/infrastructure/email/emailService.js';

describe('Email Verification, Login Alerts & MFA (Integration Tests)', () => {
  let organizerAgent;
  let attendeeAgent;
  let csrfOrg;
  let csrfAtt;
  let dispatchedEmails = [];

  const mockResend = {
    emails: {
      send: async (payload) => {
        dispatchedEmails.push(payload);
        return { data: { id: `email_mock_${Date.now()}` }, error: null };
      }
    }
  };

  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.AUTO_VERIFY_TEST_ACCOUNTS = 'false';
    process.env.STRICT_EMAIL_VERIFICATION = 'true';
    setResendClient(mockResend);

    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora');

    await User.deleteMany({ email: { $regex: '@mfatest.com$' } });
    await EmailVerificationToken.deleteMany({});
    await MfaChallenge.deleteMany({});
    await LoginSecurityEvent.deleteMany({});

    organizerAgent = request.agent(app);
    attendeeAgent = request.agent(app);

    const orgCsrfRes = await organizerAgent.get('/api/v1/auth/csrf');
    csrfOrg = orgCsrfRes.body.data.csrfToken;

    const attCsrfRes = await attendeeAgent.get('/api/v1/auth/csrf');
    csrfAtt = attCsrfRes.body.data.csrfToken;
  });

  after(async () => {
    delete process.env.STRICT_EMAIL_VERIFICATION;
    delete process.env.AUTO_VERIFY_TEST_ACCOUNTS;
    setResendClient(null);
    await disconnectDatabase();
  });

  const attendeeEmail = 'attendee@mfatest.com';
  const attendeePassword = 'Password@123';
  let attendeeUserId;
  let rawVerificationToken;

  it('1. Registration creates unverified user, hashes verification token, and dispatches email', async () => {
    dispatchedEmails = [];

    const res = await attendeeAgent
      .post('/api/v1/auth/register')
      .set('X-CSRF-Token', csrfAtt)
      .send({
        name: 'MFA Attendee',
        email: attendeeEmail,
        password: attendeePassword,
        role: 'ATTENDEE'
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.user.emailVerified, false, 'New registration must be unverified');
    attendeeUserId = res.body.data.user.id;

    // Check verification token in database
    const tokenRecord = await EmailVerificationToken.findOne({ userId: attendeeUserId });
    assert.ok(tokenRecord, 'EmailVerificationToken record should be created');
    assert.equal(tokenRecord.consumedAt, null, 'Token should not be consumed initially');

    // Check dispatched email
    const verificationEmail = dispatchedEmails.find((e) => e.to.includes(attendeeEmail) && e.subject.includes('Verify'));
    assert.ok(verificationEmail, 'Verification email should be dispatched via Resend');

    // Extract raw token from verification link in email HTML
    const match = verificationEmail.html.match(/token=([a-f0-9]{64})/);
    assert.ok(match, 'Verification link with 64-char token should be present in email HTML');
    rawVerificationToken = match[1];
  });

  it('2. Unverified attendee is blocked from accessing protected actions (RSVP)', async () => {
    const dummyEventId = new mongoose.Types.ObjectId();

    const res = await attendeeAgent
      .post(`/api/v1/events/${dummyEventId}/registrations`)
      .set('X-CSRF-Token', csrfAtt)
      .send({});

    assert.equal(res.status, 403, 'Should reject with 403 Forbidden');
    assert.ok(res.body.error.message.includes('Email verification required'));
  });

  it('3. Rejects invalid or expired email verification tokens', async () => {
    const resInvalid = await attendeeAgent
      .post('/api/v1/auth/verify-email')
      .set('X-CSRF-Token', csrfAtt)
      .send({ token: 'invalid_token_1234567890abcdef1234567890abcdef1234567890abcdef12345678' });

    assert.equal(resInvalid.status, 400);
    assert.ok(resInvalid.body.error.message.includes('invalid or has already been used'));

    // Test expired token
    const tokenRecord = await EmailVerificationToken.findOne({ userId: attendeeUserId });
    tokenRecord.expiresAt = new Date(Date.now() - 1000);
    await tokenRecord.save();

    const resExpired = await attendeeAgent
      .post('/api/v1/auth/verify-email')
      .set('X-CSRF-Token', csrfAtt)
      .send({ token: rawVerificationToken });

    assert.equal(resExpired.status, 400);
    assert.ok(resExpired.body.error.message.includes('expired'));
  });

  it('4. Resend verification enforces rate limits and invalidates previous token', async () => {
    // Restore token for cooldown test
    const tokenRecord = await EmailVerificationToken.findOne({ userId: attendeeUserId });
    tokenRecord.expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    tokenRecord.createdAt = new Date();
    await tokenRecord.save();

    // First resend should fail cooldown because token was just created
    const resCooldown = await attendeeAgent
      .post('/api/v1/auth/resend-verification')
      .set('X-CSRF-Token', csrfAtt)
      .send({ email: attendeeEmail });

    assert.equal(resCooldown.status, 429);
    assert.ok(resCooldown.body.error.message.includes('Please wait a minute'));

    // Directly update creation timestamp on raw collection to bypass Mongoose timestamp hook
    await EmailVerificationToken.collection.updateMany(
      { userId: new mongoose.Types.ObjectId(attendeeUserId) },
      { $set: { createdAt: new Date(Date.now() - 120000) } }
    );

    dispatchedEmails = [];
    const resResend = await attendeeAgent
      .post('/api/v1/auth/resend-verification')
      .set('X-CSRF-Token', csrfAtt)
      .send({ email: attendeeEmail });

    assert.equal(resResend.status, 200);
    assert.equal(resResend.body.success, true);

    const oldToken = await EmailVerificationToken.findById(tokenRecord._id);
    assert.ok(oldToken.consumedAt, 'Old token must be marked consumed upon resend');

    const newEmail = dispatchedEmails.find((e) => e.to.includes(attendeeEmail) && e.subject.includes('Verify'));
    const match = newEmail.html.match(/token=([a-f0-9]{64})/);
    rawVerificationToken = match[1];
  });

  it('5. Successfully verifies email, marks user verified, and prevents token reuse', async () => {
    const res = await attendeeAgent
      .post('/api/v1/auth/verify-email')
      .set('X-CSRF-Token', csrfAtt)
      .send({ token: rawVerificationToken });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const user = await User.findById(attendeeUserId);
    assert.equal(user.emailVerified, true);
    assert.ok(user.emailVerifiedAt);

    // Replay attack: try reusing the same token
    const resReuse = await attendeeAgent
      .post('/api/v1/auth/verify-email')
      .set('X-CSRF-Token', csrfAtt)
      .send({ token: rawVerificationToken });

    assert.equal(resReuse.status, 400);
    assert.ok(resReuse.body.error.message.includes('already been used'));
  });

  it('6. Successful login records LoginSecurityEvent and dispatches login alert', async () => {
    dispatchedEmails = [];

    const res = await attendeeAgent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrfAtt)
      .send({ email: attendeeEmail, password: attendeePassword });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.emailVerified, true);

    // Wait for asynchronous notification dispatch
    await new Promise((r) => setTimeout(r, 100));

    const alertEmail = dispatchedEmails.find((e) => e.to.includes(attendeeEmail) && e.subject.includes('New sign-in'));
    assert.ok(alertEmail, 'Login notification email should be sent');
    assert.ok(alertEmail.html.includes('New sign-in detected'));

    const event = await LoginSecurityEvent.findOne({ userId: attendeeUserId }).sort({ loginAt: -1 });
    assert.ok(event, 'LoginSecurityEvent should be logged');
    assert.equal(event.email, attendeeEmail);
  });

  it('7. Enrolling Email OTP requires password re-authentication and generates recovery codes', async () => {
    dispatchedEmails = [];

    // Reauth with bad password
    const resBadPass = await attendeeAgent
      .post('/api/v1/auth/security/email-otp/initiate')
      .set('X-CSRF-Token', csrfAtt)
      .send({ password: 'WrongPassword@123' });

    assert.equal(resBadPass.status, 401);

    // Reauth with good password
    const resInitiate = await attendeeAgent
      .post('/api/v1/auth/security/email-otp/initiate')
      .set('X-CSRF-Token', csrfAtt)
      .send({ password: attendeePassword });

    assert.equal(resInitiate.status, 200);

    const otpEmail = dispatchedEmails.find((e) => e.to.includes(attendeeEmail) && e.subject.includes('authentication code'));
    assert.ok(otpEmail);
    const match = otpEmail.html.match(/class="otp-code">(\d{6})</);
    assert.ok(match, 'OTP should be present in email HTML');
    const otp = match[1];

    // Confirm enrollment with OTP
    const resConfirm = await attendeeAgent
      .post('/api/v1/auth/security/email-otp/confirm')
      .set('X-CSRF-Token', csrfAtt)
      .send({ otp });

    assert.equal(resConfirm.status, 200);
    assert.equal(resConfirm.body.success, true);
    assert.ok(resConfirm.body.recoveryCodes, 'Recovery codes should be returned upon first MFA enrollment');
    assert.equal(resConfirm.body.recoveryCodes.length, 10);

    const user = await User.findById(attendeeUserId);
    assert.equal(user.mfa.emailOtpEnabled, true);
  });

  let activeChallengeId;
  let emailOtpCode;

  it('8. Login with Email OTP creates pending MFA challenge without establishing authenticated session', async () => {
    dispatchedEmails = [];
    const freshAgent = request.agent(app);
    const csrfRes = await freshAgent.get('/api/v1/auth/csrf');
    const freshCsrf = csrfRes.body.data.csrfToken;

    const res = await freshAgent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', freshCsrf)
      .send({ email: attendeeEmail, password: attendeePassword });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.mfaRequired, true);
    assert.ok(res.body.data.challengeId);
    assert.equal(res.body.data.factor, 'EMAIL_OTP');
    activeChallengeId = res.body.data.challengeId;

    // Verify freshAgent does NOT have an authenticated session
    const meRes = await freshAgent.get('/api/v1/auth/me');
    assert.equal(meRes.body.data.user, null, 'Must NOT create session before MFA completes');

    // Extract OTP sent to email
    const otpEmail = dispatchedEmails.find((e) => e.to.includes(attendeeEmail) && e.subject.includes('authentication code'));
    const match = otpEmail.html.match(/class="otp-code">(\d{6})</);
    emailOtpCode = match[1];
  });

  it('9. Rejects invalid OTP and enforces maximum attempt limits', async () => {
    const freshAgent = request.agent(app);
    const csrfRes = await freshAgent.get('/api/v1/auth/csrf');
    const csrf = csrfRes.body.data.csrfToken;

    const resBad = await freshAgent
      .post('/api/v1/auth/mfa/verify-otp')
      .set('X-CSRF-Token', csrf)
      .send({ challengeId: activeChallengeId, otp: '000000' });

    assert.equal(resBad.status, 401);
    assert.ok(resBad.body.error.message.includes('Invalid verification code'));

    const challenge = await MfaChallenge.findOne({ challengeId: activeChallengeId });
    assert.equal(challenge.attempts, 1);
  });

  it('10. Completes login upon valid Email OTP submission and establishes authenticated session', async () => {
    const freshAgent = request.agent(app);
    const csrfRes = await freshAgent.get('/api/v1/auth/csrf');
    const csrf = csrfRes.body.data.csrfToken;

    const res = await freshAgent
      .post('/api/v1/auth/mfa/verify-otp')
      .set('X-CSRF-Token', csrf)
      .send({ challengeId: activeChallengeId, otp: emailOtpCode });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.email, attendeeEmail);

    // Verify session is now authenticated
    const meRes = await freshAgent.get('/api/v1/auth/me');
    assert.equal(meRes.body.data.user.id, attendeeUserId);
  });

  it('11. Enrolling Authenticator App (TOTP) encrypts secret at rest with AES-256-GCM', async () => {
    const resSetup = await attendeeAgent
      .post('/api/v1/auth/security/totp/setup')
      .set('X-CSRF-Token', csrfAtt)
      .send({ password: attendeePassword });

    assert.equal(resSetup.status, 200);
    assert.ok(resSetup.body.data.secret);
    assert.ok(resSetup.body.data.qrCodeDataUrl);
    const totpSecret = resSetup.body.data.secret;

    // Generate valid TOTP code
    const totp = createTotpInstance({ secretBase32: totpSecret, email: attendeeEmail });
    const code = totp.generate();

    const resConfirm = await attendeeAgent
      .post('/api/v1/auth/security/totp/confirm')
      .set('X-CSRF-Token', csrfAtt)
      .send({ code });

    assert.equal(resConfirm.status, 200);
    assert.equal(resConfirm.body.success, true);

    // Verify secret is encrypted in database
    const userDoc = await User.findById(attendeeUserId).select('+mfa.totpSecretEncrypted');
    assert.ok(userDoc.mfa.totpSecretEncrypted);
    assert.notEqual(userDoc.mfa.totpSecretEncrypted, totpSecret, 'Secret must not be stored in plaintext');
    assert.equal(decryptSecret(userDoc.mfa.totpSecretEncrypted), totpSecret, 'Decrypted secret must match base32 secret');
  });

  let recoveryCodePlaintext;

  it('12. Login with TOTP as primary factor and recovery fallback', async () => {
    const freshAgent = request.agent(app);
    const csrfRes = await freshAgent.get('/api/v1/auth/csrf');
    const csrf = csrfRes.body.data.csrfToken;

    const resLogin = await freshAgent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: attendeeEmail, password: attendeePassword });

    assert.equal(resLogin.status, 200);
    assert.equal(resLogin.body.data.factor, 'TOTP');
    const challengeId = resLogin.body.data.challengeId;

    // Regenerate recovery codes to test one-time recovery code flow
    const resRegen = await attendeeAgent
      .post('/api/v1/auth/security/recovery-codes/regenerate')
      .set('X-CSRF-Token', csrfAtt)
      .send({ password: attendeePassword });

    assert.equal(resRegen.status, 200);
    assert.equal(resRegen.body.recoveryCodes.length, 10);
    recoveryCodePlaintext = resRegen.body.recoveryCodes[0];

    // Use recovery code to authenticate
    const resRecovery = await freshAgent
      .post('/api/v1/auth/mfa/verify-recovery')
      .set('X-CSRF-Token', csrf)
      .send({ challengeId, recoveryCode: recoveryCodePlaintext });

    assert.equal(resRecovery.status, 200);
    assert.equal(resRecovery.body.data.user.email, attendeeEmail);

    // Verify the used recovery code cannot be reused
    const userDoc = await User.findById(attendeeUserId).select('+mfa.recoveryCodes');
    const usedCode = userDoc.mfa.recoveryCodes.find((rc) => rc.used);
    assert.ok(usedCode, 'Recovery code must be marked as used');

    // Attempting to reuse the same recovery code on a new challenge must fail
    const resLogin2 = await freshAgent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: attendeeEmail, password: attendeePassword });

    const challengeId2 = resLogin2.body.data.challengeId;

    const resReuse = await freshAgent
      .post('/api/v1/auth/mfa/verify-recovery')
      .set('X-CSRF-Token', csrf)
      .send({ challengeId: challengeId2, recoveryCode: recoveryCodePlaintext });

    assert.equal(resReuse.status, 401);
    assert.ok(resReuse.body.error.message.includes('Invalid or already used'));
  });

  it('13. Disabling MFA requires re-authentication and updates security status', async () => {
    const resDisable = await attendeeAgent
      .post('/api/v1/auth/security/mfa/disable')
      .set('X-CSRF-Token', csrfAtt)
      .send({ password: attendeePassword, factor: 'TOTP' });

    assert.equal(resDisable.status, 200);

    const statusRes = await attendeeAgent.get('/api/v1/auth/security/status');
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.data.mfa.totpEnabled, false);
    assert.equal(statusRes.body.data.mfa.emailOtpEnabled, true);

    const historyRes = await attendeeAgent.get('/api/v1/auth/security/login-history');
    assert.equal(historyRes.status, 200);
    assert.ok(historyRes.body.data.history.length > 0);
  });
});
