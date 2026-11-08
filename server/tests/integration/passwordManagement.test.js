import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import app from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/connection.js';
import { User } from '../../src/modules/users/User.js';
import { hashPassword } from '../../src/infrastructure/security/password.js';
import { hashOtp } from '../../src/infrastructure/security/cryptoUtils.js';

const request = supertest(app);

describe('Password Management — Forgot Password & Authenticated Change (Integration)', () => {
  let csrfToken;
  let testUserEmail = 'pwdtest_user@example.com';
  let initialPassword = 'Password123!';
  let newPassword = 'NewSecurePassword456@';
  let secondNewPassword = 'SuperStrongPassword789#';
  let userId;
  let sessionCookie;

  before(async () => {
    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora_test');

    // Get CSRF Token
    const csrfRes = await request.get('/api/v1/auth/csrf');
    assert.equal(csrfRes.status, 200);
    csrfToken = csrfRes.body.data.csrfToken;
    const cookies = csrfRes.headers['set-cookie'];
    sessionCookie = cookies;

    // Clean up test user
    await User.deleteMany({ normalizedEmail: testUserEmail.toLowerCase() });

    // Seed test user with initial password
    const passwordHash = await hashPassword(initialPassword);
    const user = await User.create({
      name: 'Password Test Attendee',
      email: testUserEmail,
      normalizedEmail: testUserEmail.toLowerCase(),
      passwordHash,
      role: 'ATTENDEE',
      emailVerified: true,
      emailVerifiedAt: new Date()
    });
    userId = user._id.toString();
  });

  after(async () => {
    await User.deleteMany({ normalizedEmail: testUserEmail.toLowerCase() });
    await new Promise((r) => setTimeout(r, 150));
    await disconnectDatabase();
  });

  describe('POST /api/v1/auth/forgot-password', () => {
    it('1. Rejects invalid email format', async () => {
      const res = await request
        .post('/api/v1/auth/forgot-password')
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'not-an-email' });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
    });

    it('2. Returns generic success for non-existent email (anti-enumeration)', async () => {
      const res = await request
        .post('/api/v1/auth/forgot-password')
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'nonexistent_account_404@example.com' });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.match(res.body.message, /password reset code has been sent/i);
    });

    it('3. Generates 6-digit OTP and persists hash for valid registered user', async () => {
      const res = await request
        .post('/api/v1/auth/forgot-password')
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: testUserEmail });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      // Verify DB state
      const user = await User.findById(userId).select('+passwordReset.otpHash +passwordReset.expiresAt');
      assert.ok(user.passwordReset);
      assert.ok(user.passwordReset.otpHash);
      assert.ok(new Date(user.passwordReset.expiresAt) > new Date());
    });
  });

  describe('POST /api/v1/auth/reset-password', () => {
    it('4. Rejects invalid OTP format or weak new password', async () => {
      const res = await request
        .post('/api/v1/auth/reset-password')
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          email: testUserEmail,
          otp: '12',
          newPassword: 'weak'
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
    });

    it('5. Rejects incorrect OTP code', async () => {
      const res = await request
        .post('/api/v1/auth/reset-password')
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          email: testUserEmail,
          otp: '999999',
          newPassword
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.error.message, /invalid verification code/i);
    });

    it('6. Successfully resets password with valid OTP and permits login with new password', async () => {
      // Seed a known OTP directly into user's record
      const testOtp = '123456';
      const otpHash = hashOtp(testOtp, testUserEmail.toLowerCase());
      await User.findByIdAndUpdate(userId, {
        passwordReset: {
          otpHash,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          attempts: 0
        }
      });

      const res = await request
        .post('/api/v1/auth/reset-password')
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          email: testUserEmail,
          otp: testOtp,
          newPassword
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.match(res.body.message, /password has been reset successfully/i);

      // Verify OTP is cleared (single use)
      const user = await User.findById(userId).select('+passwordReset.otpHash');
      assert.ok(!user.passwordReset?.otpHash);

      // Verify old password no longer works for login
      const oldLoginRes = await request
        .post('/api/v1/auth/login')
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: testUserEmail, password: initialPassword });

      assert.equal(oldLoginRes.status, 401);

      // Verify new password successfully logs in
      const newLoginRes = await request
        .post('/api/v1/auth/login')
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: testUserEmail, password: newPassword });

      assert.equal(newLoginRes.status, 200);
      assert.equal(newLoginRes.body.success, true);
    });
  });

  describe('POST /api/v1/auth/change-password', () => {
    let authCookie;

    before(async () => {
      // Sign in with the updated password
      const loginRes = await request
        .post('/api/v1/auth/login')
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: testUserEmail, password: newPassword });

      assert.equal(loginRes.status, 200);
      authCookie = loginRes.headers['set-cookie'];
    });

    it('7. Rejects unauthenticated password change attempts', async () => {
      const res = await request
        .post('/api/v1/auth/change-password')
        .set('X-CSRF-Token', csrfToken)
        .send({
          currentPassword: newPassword,
          newPassword: secondNewPassword
        });

      assert.equal(res.status, 401);
    });

    it('8. Rejects incorrect current password', async () => {
      const res = await request
        .post('/api/v1/auth/change-password')
        .set('Cookie', authCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          currentPassword: 'WrongCurrentPassword999!',
          newPassword: secondNewPassword
        });

      assert.equal(res.status, 401);
      assert.match(res.body.error.message, /current password is incorrect/i);
    });

    it('9. Rejects new password identical to current password', async () => {
      const res = await request
        .post('/api/v1/auth/change-password')
        .set('Cookie', authCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          currentPassword: newPassword,
          newPassword
        });

      assert.equal(res.status, 400);
      const isMatched = /cannot be the same/i.test(res.body.error?.message || '') || res.body.error?.details?.some(d => /cannot be the same/i.test(d.message));
      assert.ok(isMatched);
    });

    it('10. Successfully updates password when authenticated and current password is valid', async () => {
      const res = await request
        .post('/api/v1/auth/change-password')
        .set('Cookie', authCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          currentPassword: newPassword,
          newPassword: secondNewPassword
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.match(res.body.message, /password updated successfully/i);

      // Verify second new password now authenticates
      const finalLoginRes = await request
        .post('/api/v1/auth/login')
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: testUserEmail, password: secondNewPassword });

      assert.equal(finalLoginRes.status, 200);
      assert.equal(finalLoginRes.body.success, true);
    });
  });
});
