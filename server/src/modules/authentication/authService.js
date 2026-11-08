import crypto from 'crypto';
import mongoose from 'mongoose';
import { User } from '../users/User.js';
import { EmailVerificationToken } from './EmailVerificationToken.js';
import { MfaChallenge } from './MfaChallenge.js';
import { LoginSecurityEvent } from './LoginSecurityEvent.js';
import { hashPassword, verifyPassword } from '../../infrastructure/security/password.js';
import {
  generateRandomToken,
  hashToken,
  generateNumericOtp,
  hashOtp,
  timingSafeStringEqual,
  generateRecoveryCodes,
  encryptSecret,
  decryptSecret
} from '../../infrastructure/security/cryptoUtils.js';
import {
  generateTotpSecret,
  generateTotpUri,
  generateTotpQrCode,
  verifyTotpCode
} from '../../infrastructure/security/totpService.js';
import {
  getApproximateLocation,
  parseUserAgent
} from '../../infrastructure/security/deviceGeoService.js';
import {
  sendEmailVerificationEmail,
  sendLoginNotificationEmail,
  sendEmailOtpEmail,
  sendMfaEnabledAlertEmail,
  sendMfaDisabledAlertEmail,
  sendRecoveryCodesRegeneratedAlertEmail,
  sendPasswordResetOtpEmail,
  sendPasswordChangedAlertEmail
} from '../../infrastructure/email/emailService.js';
import {
  ConflictError,
  UnauthorizedError,
  BadRequestError,
  NotFoundError,
  TooManyRequestsError
} from '../../shared/errors/AppError.js';
import { logAuditEvent } from '../audit/AuditLog.js';
import { logger } from '../../infrastructure/logging/logger.js';

function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

// -------------------------------------------------------------
// 1. REGISTRATION & EMAIL VERIFICATION
// -------------------------------------------------------------

export async function register({ name, email, password, role, ipAddress, userAgent }) {
  const normalizedEmail = email.toLowerCase().trim();

  // Check if user already exists
  const existingUser = await User.findOne({ normalizedEmail });
  if (existingUser) {
    throw new ConflictError('An account with this email address already exists.');
  }

  // Hash password using Argon2id
  const passwordHash = await hashPassword(password);

  // New registrations default to unverified unless explicitly auto-verified in tests
  const autoVerify = process.env.AUTO_VERIFY_TEST_ACCOUNTS === 'true';

  const user = await User.create({
    name,
    email: normalizedEmail,
    normalizedEmail,
    passwordHash,
    role,
    emailVerified: autoVerify,
    emailVerifiedAt: autoVerify ? new Date() : null
  });

  // Generate single-use email verification token
  const rawToken = generateRandomToken(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  await EmailVerificationToken.create({
    userId: user._id,
    tokenHash,
    purpose: 'EMAIL_VERIFICATION',
    expiresAt,
    ipAddress,
    userAgent
  });

  // Dispatch verification email via Resend
  try {
    const emailResult = await sendEmailVerificationEmail({
      email: user.email,
      name: user.name,
      token: rawToken
    });
    if (!emailResult?.success) {
      logger.error({ err: emailResult?.error, email: user.email }, 'Resend failed to deliver verification email');
    }
  } catch (err) {
    logger.error({ err: err?.message, userId: user._id }, 'Exception dispatching verification email');
  }

  await logAuditEvent({
    action: 'USER_REGISTERED',
    actorId: user._id,
    actorRole: user.role,
    resourceId: user._id,
    resourceType: 'User',
    ipAddress,
    userAgent,
    details: { email: user.email, role: user.role, emailVerified: user.emailVerified }
  });

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt
  };
}

export async function verifyEmail({ token, ipAddress, userAgent }) {
  if (!token || typeof token !== 'string') {
    throw new BadRequestError('Invalid verification token format.');
  }

  const tokenHash = hashToken(token.trim());
  const tokenRecord = await EmailVerificationToken.findOne({ tokenHash });

  if (!tokenRecord) {
    throw new BadRequestError('This email verification link is invalid or has already been used.');
  }

  if (tokenRecord.consumedAt) {
    throw new BadRequestError('This email verification link has already been used.');
  }

  if (new Date(tokenRecord.expiresAt).getTime() < Date.now()) {
    throw new BadRequestError('This email verification link has expired. Please request a new one.');
  }

  // Atomically mark token as consumed
  tokenRecord.consumedAt = new Date();
  await tokenRecord.save();

  // Mark user as verified
  const user = await User.findByIdAndUpdate(
    tokenRecord.userId,
    {
      $set: {
        emailVerified: true,
        emailVerifiedAt: new Date()
      }
    },
    { new: true }
  );

  if (!user) {
    throw new NotFoundError('Associated user account was not found.');
  }

  await logAuditEvent({
    action: 'EMAIL_VERIFIED',
    actorId: user._id,
    actorRole: user.role,
    resourceId: user._id,
    resourceType: 'User',
    ipAddress,
    userAgent,
    details: { email: user.email }
  });

  return {
    success: true,
    message: 'Your email address has been successfully verified.'
  };
}

export async function resendVerificationEmail({ email, ipAddress, userAgent }) {
  const normalizedEmail = (email || '').toLowerCase().trim();
  const genericResponse = {
    success: true,
    message: 'If an unverified account exists with that email address, a new verification link has been sent.'
  };

  if (!normalizedEmail) return genericResponse;

  const user = await User.findOne({ normalizedEmail });
  if (!user) {
    return genericResponse;
  }

  if (user.emailVerified) {
    return {
      success: true,
      alreadyVerified: true,
      message: 'This email address is already verified. You can log in directly.'
    };
  }

  // Rate-limiting / cooldown check: at least 60 seconds between resends
  const recentToken = await EmailVerificationToken.findOne({
    userId: user._id,
    consumedAt: null,
    createdAt: { $gt: new Date(Date.now() - 60 * 1000) }
  });

  if (recentToken) {
    throw new TooManyRequestsError('Please wait a minute before requesting another verification email.');
  }

  // Invalidate any older unconsumed tokens for this user
  await EmailVerificationToken.updateMany(
    { userId: user._id, consumedAt: null },
    { $set: { consumedAt: new Date() } }
  );

  // Generate new token
  const rawToken = generateRandomToken(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await EmailVerificationToken.create({
    userId: user._id,
    tokenHash,
    purpose: 'EMAIL_VERIFICATION',
    expiresAt,
    ipAddress,
    userAgent
  });

  // Dispatch verification email via Resend
  try {
    const emailResult = await sendEmailVerificationEmail({
      email: user.email,
      name: user.name,
      token: rawToken
    });
    if (!emailResult?.success) {
      logger.error({ err: emailResult?.error, email: user.email }, 'Resend failed to resend verification email');
    }
  } catch (err) {
    logger.error({ err: err?.message, userId: user._id }, 'Exception resending verification email');
  }

  await logAuditEvent({
    action: 'EMAIL_VERIFICATION_RESENT',
    actorId: user._id,
    actorRole: user.role,
    resourceId: user._id,
    resourceType: 'User',
    ipAddress,
    userAgent,
    details: { email: user.email }
  });

  return {
    ...genericResponse,
    rawToken
  };
}

// -------------------------------------------------------------
// 2. LOGIN & MFA CHALLENGE INITIATION
// -------------------------------------------------------------

export async function login({ email, password, ipAddress, userAgent }) {
  const normalizedEmail = email.toLowerCase().trim();

  const user = await User.findOne({ normalizedEmail })
    .select('+passwordHash +mfa.totpSecretEncrypted +mfa.recoveryCodes');

  if (!user) {
    await logAuditEvent({
      action: 'LOGIN_FAILED',
      actorRole: 'ANONYMOUS',
      status: 'FAILURE',
      ipAddress,
      userAgent,
      details: { email: normalizedEmail, reason: 'User not found' }
    });
    throw new UnauthorizedError('Invalid email or password.');
  }

  const isPasswordValid = await verifyPassword(password, user.passwordHash);
  if (!isPasswordValid) {
    await logAuditEvent({
      action: 'LOGIN_FAILED',
      actorId: user._id,
      actorRole: user.role,
      status: 'FAILURE',
      ipAddress,
      userAgent,
      details: { email: normalizedEmail, reason: 'Invalid password' }
    });
    throw new UnauthorizedError('Invalid email or password.');
  }

  // Check if Multi-Factor Authentication is enrolled
  const emailOtpEnabled = Boolean(user.mfa?.emailOtpEnabled);
  const totpEnabled = Boolean(user.mfa?.totpEnabled);

  if (emailOtpEnabled || totpEnabled) {
    const availableFactors = [];
    if (totpEnabled) availableFactors.push('TOTP');
    if (emailOtpEnabled) availableFactors.push('EMAIL_OTP');

    const unusedRecoveryCodes = (user.mfa?.recoveryCodes || []).filter((rc) => !rc.used);
    if (unusedRecoveryCodes.length > 0) {
      availableFactors.push('RECOVERY_CODE');
    }

    const activeFactor = totpEnabled ? 'TOTP' : 'EMAIL_OTP';
    const challengeId = `mfa_ch_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

    let otpHash = null;
    let otpExpiresAt = null;

    // Invalidate existing pending challenges for this user
    await MfaChallenge.updateMany(
      { userId: user._id, consumedAt: null },
      { $set: { consumedAt: new Date() } }
    );

    if (activeFactor === 'EMAIL_OTP') {
      const otp = generateNumericOtp(6);
      otpHash = hashOtp(otp, challengeId);
      otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      await sendEmailOtpEmail({
        email: user.email,
        name: user.name,
        otp
      }).catch((err) => {
        logger.error({ err: err?.message, userId: user._id }, 'Failed to dispatch email OTP');
      });
    }

    await MfaChallenge.create({
      challengeId,
      userId: user._id,
      availableFactors,
      activeFactor,
      otpHash,
      otpExpiresAt,
      lastResendAt: activeFactor === 'EMAIL_OTP' ? new Date() : null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      ipAddress,
      userAgent
    });

    await logAuditEvent({
      action: 'MFA_CHALLENGE_CREATED',
      actorId: user._id,
      actorRole: user.role,
      resourceId: user._id,
      resourceType: 'User',
      ipAddress,
      userAgent,
      details: { factor: activeFactor, availableFactors }
    });

    return {
      mfaRequired: true,
      challengeId,
      factor: activeFactor,
      availableFactors,
      maskedEmail: maskEmail(user.email)
    };
  }

  // Standard authentication (No MFA)
  user.lastLoginAt = new Date();
  if (user.mfa) {
    user.mfa.lastUsedFactor = 'PASSWORD';
  }
  await user.save();

  await logAuditEvent({
    action: 'LOGIN_SUCCESS',
    actorId: user._id,
    actorRole: user.role,
    resourceId: user._id,
    resourceType: 'User',
    ipAddress,
    userAgent,
    details: { email: user.email, authFactor: 'PASSWORD' }
  });

  return {
    mfaRequired: false,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt
    }
  };
}

// -------------------------------------------------------------
// 3. MFA CHALLENGE VERIFICATION (LOGIN COMPLETION)
// -------------------------------------------------------------

export async function verifyMfaOtp({ challengeId, otp, ipAddress, userAgent }) {
  const challenge = await MfaChallenge.findOne({ challengeId, consumedAt: null });
  if (!challenge || new Date(challenge.expiresAt).getTime() < Date.now()) {
    throw new UnauthorizedError('Authentication challenge expired or invalid. Please sign in again.');
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    challenge.consumedAt = new Date();
    await challenge.save();
    throw new UnauthorizedError('Maximum verification attempts exceeded. Please sign in again.');
  }

  if (!challenge.otpExpiresAt || new Date(challenge.otpExpiresAt).getTime() < Date.now()) {
    throw new BadRequestError('Verification code has expired. Please request a new code.');
  }

  const expectedHash = hashOtp(otp, challenge.challengeId);
  const isValid = timingSafeStringEqual(challenge.otpHash, expectedHash);

  if (!isValid) {
    challenge.attempts += 1;
    await challenge.save();
    throw new UnauthorizedError('Invalid verification code.');
  }

  // Consume challenge atomically
  challenge.consumedAt = new Date();
  await challenge.save();

  const user = await User.findById(challenge.userId);
  if (!user) {
    throw new NotFoundError('Account not found.');
  }

  user.lastLoginAt = new Date();
  if (user.mfa) {
    user.mfa.lastUsedFactor = 'EMAIL_OTP';
  }
  await user.save();

  await logAuditEvent({
    action: 'LOGIN_SUCCESS',
    actorId: user._id,
    actorRole: user.role,
    resourceId: user._id,
    resourceType: 'User',
    ipAddress,
    userAgent,
    details: { email: user.email, authFactor: 'EMAIL_OTP' }
  });

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt
  };
}

export async function verifyMfaTotp({ challengeId, code, ipAddress, userAgent }) {
  const challenge = await MfaChallenge.findOne({ challengeId, consumedAt: null });
  if (!challenge || new Date(challenge.expiresAt).getTime() < Date.now()) {
    throw new UnauthorizedError('Authentication challenge expired or invalid. Please sign in again.');
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    challenge.consumedAt = new Date();
    await challenge.save();
    throw new UnauthorizedError('Maximum verification attempts exceeded. Please sign in again.');
  }

  const user = await User.findById(challenge.userId).select('+mfa.totpSecretEncrypted');
  if (!user || !user.mfa?.totpSecretEncrypted) {
    throw new UnauthorizedError('Authenticator 2FA is not configured for this account.');
  }

  const secretBase32 = decryptSecret(user.mfa.totpSecretEncrypted);
  const isValid = verifyTotpCode({ secretBase32, code, window: 1 });

  if (!isValid) {
    challenge.attempts += 1;
    await challenge.save();
    throw new UnauthorizedError('Invalid authenticator code.');
  }

  // Consume challenge
  challenge.consumedAt = new Date();
  await challenge.save();

  user.lastLoginAt = new Date();
  if (user.mfa) {
    user.mfa.lastUsedFactor = 'TOTP';
  }
  await user.save();

  await logAuditEvent({
    action: 'LOGIN_SUCCESS',
    actorId: user._id,
    actorRole: user.role,
    resourceId: user._id,
    resourceType: 'User',
    ipAddress,
    userAgent,
    details: { email: user.email, authFactor: 'TOTP' }
  });

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt
  };
}

export async function verifyMfaRecovery({ challengeId, recoveryCode, ipAddress, userAgent }) {
  const challenge = await MfaChallenge.findOne({ challengeId, consumedAt: null });
  if (!challenge || new Date(challenge.expiresAt).getTime() < Date.now()) {
    throw new UnauthorizedError('Authentication challenge expired or invalid. Please sign in again.');
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    challenge.consumedAt = new Date();
    await challenge.save();
    throw new UnauthorizedError('Maximum verification attempts exceeded. Please sign in again.');
  }

  const user = await User.findById(challenge.userId).select('+mfa.recoveryCodes');
  if (!user || !user.mfa?.recoveryCodes?.length) {
    throw new UnauthorizedError('No recovery codes configured for this account.');
  }

  const cleanCode = recoveryCode.trim().toUpperCase();
  const codeHash = hashToken(cleanCode);

  const matchedIndex = user.mfa.recoveryCodes.findIndex(
    (rc) => rc.codeHash === codeHash && !rc.used
  );

  if (matchedIndex === -1) {
    challenge.attempts += 1;
    await challenge.save();
    throw new UnauthorizedError('Invalid or already used recovery code.');
  }

  // Mark specific recovery code as used
  user.mfa.recoveryCodes[matchedIndex].used = true;
  user.mfa.recoveryCodes[matchedIndex].usedAt = new Date();
  user.lastLoginAt = new Date();
  if (user.mfa) {
    user.mfa.lastUsedFactor = 'RECOVERY_CODE';
  }
  await user.save();

  // Consume challenge
  challenge.consumedAt = new Date();
  await challenge.save();

  await logAuditEvent({
    action: 'RECOVERY_CODE_USED',
    actorId: user._id,
    actorRole: user.role,
    resourceId: user._id,
    resourceType: 'User',
    ipAddress,
    userAgent,
    details: { email: user.email, authFactor: 'RECOVERY_CODE' }
  });

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt
  };
}

export async function resendMfaOtp({ challengeId }) {
  const challenge = await MfaChallenge.findOne({ challengeId, consumedAt: null });
  if (!challenge || new Date(challenge.expiresAt).getTime() < Date.now()) {
    throw new UnauthorizedError('Authentication challenge expired or invalid.');
  }

  if (challenge.lastResendAt && Date.now() - new Date(challenge.lastResendAt).getTime() < 60000) {
    throw new TooManyRequestsError('Please wait at least 60 seconds before requesting another code.');
  }

  const user = await User.findById(challenge.userId);
  if (!user) throw new NotFoundError('Account not found.');

  const otp = generateNumericOtp(6);
  challenge.otpHash = hashOtp(otp, challenge.challengeId);
  challenge.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
  challenge.lastResendAt = new Date();
  await challenge.save();

  await sendEmailOtpEmail({
    email: user.email,
    name: user.name,
    otp
  }).catch((err) => {
    logger.error({ err: err?.message, userId: user._id }, 'Failed to resend email OTP');
  });

  return {
    success: true,
    message: 'A new 6-digit verification code has been dispatched to your email.'
  };
}

export async function switchMfaFactor({ challengeId, factor }) {
  const challenge = await MfaChallenge.findOne({ challengeId, consumedAt: null });
  if (!challenge || new Date(challenge.expiresAt).getTime() < Date.now()) {
    throw new UnauthorizedError('Authentication challenge expired or invalid.');
  }

  if (!challenge.availableFactors.includes(factor)) {
    throw new BadRequestError(`Factor ${factor} is not enrolled on this account.`);
  }

  challenge.activeFactor = factor;

  if (factor === 'EMAIL_OTP' && (!challenge.otpHash || new Date(challenge.otpExpiresAt).getTime() < Date.now())) {
    const user = await User.findById(challenge.userId);
    if (user) {
      const otp = generateNumericOtp(6);
      challenge.otpHash = hashOtp(otp, challenge.challengeId);
      challenge.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
      challenge.lastResendAt = new Date();

      sendEmailOtpEmail({
        email: user.email,
        name: user.name,
        otp
      }).catch((err) => {
        logger.error({ err: err?.message, userId: user._id }, 'Failed to send switched email OTP');
      });
    }
  }

  await challenge.save();
  return { success: true, factor };
}

// -------------------------------------------------------------
// 4. POST-LOGIN SECURITY AUDIT & NOTIFICATION DISPATCH
// -------------------------------------------------------------

export async function recordLoginAndNotify({ user, ipAddress, userAgent, headers = {}, authFactor }) {
  try {
    const location = getApproximateLocation(ipAddress, headers);
    const device = parseUserAgent(userAgent, headers);

    const event = await LoginSecurityEvent.create({
      userId: user.id || user._id,
      email: user.email,
      loginAt: new Date(),
      ipAddress: ipAddress || 'Unknown',
      location: {
        city: location.city,
        region: location.region,
        country: location.country,
        timezone: location.timezone
      },
      device: {
        browser: device.browser,
        browserVersion: device.browserVersion,
        os: device.os,
        deviceType: device.deviceType,
        phoneModel: device.phoneModel,
        vendor: device.vendor,
        summary: device.summary
      },
      authFactor: authFactor || 'PASSWORD',
      notificationStatus: 'QUEUED'
    });

    sendLoginNotificationEmail({
      email: user.email,
      name: user.name,
      loginAt: event.loginAt,
      ipAddress: event.ipAddress,
      location: event.location,
      device: event.device,
      authFactor
    })
      .then((res) => {
        event.notificationStatus = res.success ? (res.simulated ? 'SIMULATED' : 'SENT') : 'FAILED';
        if (res.error) event.notificationError = res.error;
        return event.save();
      })
      .catch((err) => {
        event.notificationStatus = 'FAILED';
        event.notificationError = err?.message;
        return event.save();
      });
  } catch (err) {
    logger.error({ err: err?.message, userId: user.id }, 'Non-blocking login security notification error');
  }
}

// -------------------------------------------------------------
// 5. SECURITY SETTINGS & MFA ENROLLMENT (AUTHENTICATED)
// -------------------------------------------------------------

export async function getSecurityStatus(userId) {
  const user = await User.findById(userId).select('+mfa.recoveryCodes');
  if (!user) throw new NotFoundError('User not found.');

  const recoveryCodes = user.mfa?.recoveryCodes || [];
  const remainingRecoveryCodes = recoveryCodes.filter((rc) => !rc.used).length;

  return {
    emailVerified: user.emailVerified,
    emailVerifiedAt: user.emailVerifiedAt,
    lastLoginAt: user.lastLoginAt,
    mfa: {
      emailOtpEnabled: Boolean(user.mfa?.emailOtpEnabled),
      totpEnabled: Boolean(user.mfa?.totpEnabled),
      hasRecoveryCodes: recoveryCodes.length > 0,
      recoveryCodesRemaining: remainingRecoveryCodes
    }
  };
}

export async function getLoginHistory(userId) {
  const events = await LoginSecurityEvent.find({ userId })
    .sort({ loginAt: -1 })
    .limit(10);

  return events.map((ev) => ({
    id: ev._id.toString(),
    loginAt: ev.loginAt,
    ipAddress: ev.ipAddress,
    location: ev.location,
    device: ev.device,
    authFactor: ev.authFactor,
    notificationStatus: ev.notificationStatus
  }));
}

export async function initiateEmailOtpEnrollment({ userId, password, req }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw new NotFoundError('User not found.');

  const isPasswordValid = await verifyPassword(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new UnauthorizedError('Incorrect password. Reauthentication required.');
  }

  if (!user.emailVerified) {
    throw new BadRequestError('Please verify your email address before enabling Email OTP.');
  }

  const otp = generateNumericOtp(6);
  // Store pending setup OTP in session with 5-minute expiry
  if (!req.session) {
    throw new Error('Active session required for MFA enrollment');
  }

  req.session.pendingEmailOtpSetup = {
    otpHash: hashOtp(otp, user._id.toString()),
    expiresAt: Date.now() + 5 * 60 * 1000
  };
  await new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });

  const emailResult = await sendEmailOtpEmail({
    email: user.email,
    name: user.name,
    otp
  });

  if (!emailResult?.success) {
    logger.error({ err: emailResult?.error, email: user.email }, 'Failed to deliver MFA setup OTP email');
    throw new BadRequestError(`Unable to send verification email: ${emailResult?.error || 'Email dispatch failed'}. Please verify your email settings.`);
  }

  return {
    success: true,
    message: `Verification code sent to ${maskEmail(user.email)}`
  };
}

export async function confirmEmailOtpEnrollment({ userId, otp, req }) {
  const pending = req.session?.pendingEmailOtpSetup;
  if (!pending || Date.now() > pending.expiresAt) {
    throw new BadRequestError('Verification code expired or not requested. Please initiate setup again.');
  }

  const user = await User.findById(userId).select('+mfa.recoveryCodes');
  if (!user) throw new NotFoundError('User not found.');

  if (!user.emailVerified) {
    throw new BadRequestError('Please verify your email address before enabling Email OTP two-factor authentication.');
  }

  const expectedHash = hashOtp(otp, user._id.toString());
  if (!timingSafeStringEqual(pending.otpHash, expectedHash)) {
    throw new BadRequestError('Invalid verification code.');
  }

  // Clear pending setup session state
  delete req.session.pendingEmailOtpSetup;

  user.mfa.emailOtpEnabled = true;

  // Generate recovery codes if this is the first MFA factor enabled
  let recoveryCodes = null;
  if (!user.mfa.recoveryCodes || user.mfa.recoveryCodes.length === 0) {
    const generated = generateRecoveryCodes(10);
    user.mfa.recoveryCodes = generated.hashedCodes;
    recoveryCodes = generated.codes;
  }

  await user.save();

  sendMfaEnabledAlertEmail({
    email: user.email,
    name: user.name,
    factor: 'EMAIL_OTP'
  }).catch(() => {});

  await logAuditEvent({
    action: 'MFA_ENROLLED',
    actorId: user._id,
    actorRole: user.role,
    resourceId: user._id,
    resourceType: 'User',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    details: { factor: 'EMAIL_OTP' }
  });

  return {
    success: true,
    message: 'Email OTP two-factor authentication successfully enabled.',
    recoveryCodes
  };
}

export async function setupTotpEnrollment({ userId, password, req }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw new NotFoundError('User not found.');

  const isPasswordValid = await verifyPassword(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new UnauthorizedError('Incorrect password. Reauthentication required.');
  }

  if (!user.emailVerified) {
    throw new BadRequestError('Please verify your email address before enabling Authenticator App (TOTP) two-factor authentication.');
  }

  const secretBase32 = generateTotpSecret();
  const otpauthUri = generateTotpUri({ secretBase32, email: user.email });
  const qrCodeDataUrl = await generateTotpQrCode(otpauthUri);

  // Temporarily store encrypted pending TOTP secret in session (expires in 10 minutes)
  if (!req.session) {
    throw new Error('Active session required for MFA enrollment');
  }

  req.session.pendingTotpSetup = {
    secretEncrypted: encryptSecret(secretBase32),
    expiresAt: Date.now() + 10 * 60 * 1000
  };

  await new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });

  return {
    secret: secretBase32,
    otpauthUri,
    qrCodeDataUrl
  };
}

export async function confirmTotpEnrollment({ userId, code, req }) {
  const pending = req.session?.pendingTotpSetup;
  if (!pending || Date.now() > pending.expiresAt) {
    throw new BadRequestError('TOTP setup expired or not initiated. Please start over.');
  }

  const secretBase32 = decryptSecret(pending.secretEncrypted);
  const isValid = verifyTotpCode({ secretBase32, code, window: 1 });

  if (!isValid) {
    throw new BadRequestError('Invalid authenticator code. Check your device clock and try again.');
  }

  const user = await User.findById(userId).select('+mfa.recoveryCodes +mfa.totpSecretEncrypted');
  if (!user) throw new NotFoundError('User not found.');

  if (!user.emailVerified) {
    throw new BadRequestError('Please verify your email address before enabling Authenticator App (TOTP) two-factor authentication.');
  }

  delete req.session.pendingTotpSetup;

  user.mfa.totpEnabled = true;
  user.mfa.totpSecretEncrypted = encryptSecret(secretBase32);
  user.mfa.totpConfirmedAt = new Date();

  let recoveryCodes = null;
  if (!user.mfa.recoveryCodes || user.mfa.recoveryCodes.length === 0) {
    const generated = generateRecoveryCodes(10);
    user.mfa.recoveryCodes = generated.hashedCodes;
    recoveryCodes = generated.codes;
  }

  await user.save();

  sendMfaEnabledAlertEmail({
    email: user.email,
    name: user.name,
    factor: 'TOTP'
  }).catch(() => {});

  await logAuditEvent({
    action: 'MFA_ENROLLED',
    actorId: user._id,
    actorRole: user.role,
    resourceId: user._id,
    resourceType: 'User',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    details: { factor: 'TOTP' }
  });

  return {
    success: true,
    message: 'Authenticator App (TOTP) successfully enabled.',
    recoveryCodes
  };
}

export async function disableMfaFactor({ userId, password, factor, req }) {
  const user = await User.findById(userId).select('+passwordHash +mfa.totpSecretEncrypted');
  if (!user) throw new NotFoundError('User not found.');

  const isPasswordValid = await verifyPassword(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new UnauthorizedError('Incorrect password. Reauthentication required.');
  }

  if (factor === 'EMAIL_OTP') {
    user.mfa.emailOtpEnabled = false;
  } else if (factor === 'TOTP') {
    user.mfa.totpEnabled = false;
    user.mfa.totpSecretEncrypted = null;
    user.mfa.totpConfirmedAt = null;
  }

  await user.save();

  sendMfaDisabledAlertEmail({
    email: user.email,
    name: user.name,
    factor
  }).catch(() => {});

  await logAuditEvent({
    action: 'MFA_DISABLED',
    actorId: user._id,
    actorRole: user.role,
    resourceId: user._id,
    resourceType: 'User',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    details: { factor }
  });

  return {
    success: true,
    message: `Two-factor authentication via ${factor === 'TOTP' ? 'Authenticator App' : 'Email OTP'} has been disabled.`
  };
}

export async function regenerateRecoveryCodes({ userId, password, req }) {
  const user = await User.findById(userId).select('+passwordHash +mfa.recoveryCodes');
  if (!user) throw new NotFoundError('User not found.');

  const isPasswordValid = await verifyPassword(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new UnauthorizedError('Incorrect password. Reauthentication required.');
  }

  if (!user.emailVerified) {
    throw new BadRequestError('Please verify your email address before managing MFA recovery codes.');
  }

  if (!user.mfa?.emailOtpEnabled && !user.mfa?.totpEnabled) {
    throw new BadRequestError('Cannot generate recovery codes without an active MFA factor.');
  }

  const generated = generateRecoveryCodes(10);
  user.mfa.recoveryCodes = generated.hashedCodes;
  await user.save();

  sendRecoveryCodesRegeneratedAlertEmail({
    email: user.email,
    name: user.name
  }).catch(() => {});

  await logAuditEvent({
    action: 'RECOVERY_CODES_REGENERATED',
    actorId: user._id,
    actorRole: user.role,
    resourceId: user._id,
    resourceType: 'User',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    details: { count: 10 }
  });

  return {
    success: true,
    message: 'New recovery codes generated. All previous codes have been invalidated.',
    recoveryCodes: generated.codes
  };
}

/**
 * Initiates forgot password flow by dispatching a 6-digit OTP to the registered email.
 */
export async function requestPasswordResetOtp({ email, ipAddress, userAgent }) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ normalizedEmail }).select('+passwordReset.otpHash +passwordReset.expiresAt +passwordReset.attempts');

  // Anti-enumeration: Return success message even if email doesn't exist
  if (!user) {
    logger.info({ email: normalizedEmail }, 'Password reset requested for non-existent email');
    return {
      success: true,
      message: 'If an account exists with that email, a password reset code has been sent.'
    };
  }

  // Generate 6-digit cryptographic OTP
  const otp = generateNumericOtp(6);
  const otpHash = hashOtp(otp, normalizedEmail);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  user.passwordReset = {
    otpHash,
    expiresAt,
    attempts: 0
  };

  await user.save();

  // Deliver OTP via official email template
  sendPasswordResetOtpEmail({
    email: user.email,
    name: user.name,
    otp
  }).catch((err) => {
    logger.error({ err, userId: user._id }, 'Failed to dispatch password reset OTP email');
  });

  await logAuditEvent({
    action: 'PASSWORD_RESET_REQUESTED',
    actorId: user._id,
    actorRole: user.role,
    resourceId: user._id,
    resourceType: 'User',
    ipAddress,
    userAgent,
    details: { email: normalizedEmail }
  });

  return {
    success: true,
    message: 'If an account exists with that email, a password reset code has been sent.'
  };
}

/**
 * Resets password using verified 6-digit email OTP.
 */
export async function resetPasswordWithOtp({ email, otp, newPassword, ipAddress, userAgent }) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ normalizedEmail }).select(
    '+passwordHash +passwordReset.otpHash +passwordReset.expiresAt +passwordReset.attempts'
  );

  if (!user || !user.passwordReset?.otpHash || !user.passwordReset?.expiresAt) {
    throw new BadRequestError('Invalid or expired password reset request. Please request a new code.');
  }

  if (new Date() > new Date(user.passwordReset.expiresAt)) {
    user.passwordReset = undefined;
    await user.save();
    throw new BadRequestError('Password reset code has expired. Please request a new code.');
  }

  // Rate-limiting / brute force protection: Max 5 incorrect OTP attempts
  if ((user.passwordReset.attempts || 0) >= 5) {
    user.passwordReset = undefined;
    await user.save();
    throw new BadRequestError('Too many incorrect attempts. This reset code has been invalidated. Please request a new code.');
  }

  const expectedHash = hashOtp(otp.trim(), normalizedEmail);
  const isOtpValid = timingSafeStringEqual(expectedHash, user.passwordReset.otpHash);

  if (!isOtpValid) {
    user.passwordReset.attempts = (user.passwordReset.attempts || 0) + 1;
    await user.save();
    throw new BadRequestError('Invalid verification code. Please check your email and try again.');
  }

  // Hash new password using Argon2id
  const passwordHash = await hashPassword(newPassword);
  user.passwordHash = passwordHash;
  user.passwordReset = undefined;
  await user.save();

  // Send security alert notification email
  sendPasswordChangedAlertEmail({
    email: user.email,
    name: user.name,
    ipAddress,
    userAgent,
    method: 'RESET_WITH_OTP'
  }).catch((err) => {
    logger.error({ err, userId: user._id }, 'Failed to dispatch password update alert email');
  });

  await logAuditEvent({
    action: 'PASSWORD_RESET_COMPLETED',
    actorId: user._id,
    actorRole: user.role,
    resourceId: user._id,
    resourceType: 'User',
    ipAddress,
    userAgent,
    details: { method: 'EMAIL_OTP' }
  });

  return {
    success: true,
    message: 'Your password has been reset successfully. Please sign in with your new password.'
  };
}

/**
 * Changes password for authenticated user using current password verification.
 */
export async function changePassword({ userId, currentPassword, newPassword, ipAddress, userAgent }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) {
    throw new NotFoundError('User account not found.');
  }

  const isCurrentValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!isCurrentValid) {
    await logAuditEvent({
      action: 'PASSWORD_CHANGE_FAILED',
      actorId: user._id,
      actorRole: user.role,
      resourceId: user._id,
      resourceType: 'User',
      ipAddress,
      userAgent,
      details: { reason: 'Incorrect current password' }
    });
    throw new UnauthorizedError('Current password is incorrect.');
  }

  if (currentPassword === newPassword) {
    throw new BadRequestError('New password cannot be the same as your current password.');
  }

  const newHash = await hashPassword(newPassword);
  user.passwordHash = newHash;
  await user.save();

  // Send security alert notification email
  sendPasswordChangedAlertEmail({
    email: user.email,
    name: user.name,
    ipAddress,
    userAgent,
    method: 'CURRENT_PASSWORD'
  }).catch((err) => {
    logger.error({ err, userId: user._id }, 'Failed to dispatch password update alert email');
  });

  await logAuditEvent({
    action: 'PASSWORD_CHANGE_SUCCESS',
    actorId: user._id,
    actorRole: user.role,
    resourceId: user._id,
    resourceType: 'User',
    ipAddress,
    userAgent,
    details: { method: 'CURRENT_PASSWORD' }
  });

  return {
    success: true,
    message: 'Password updated successfully. A confirmation email has been sent to your address.'
  };
}
