import * as authService from './authService.js';
import { User } from '../users/User.js';
import { getOrCreateCsrfToken } from '../../shared/middleware/securityMiddleware.js';
import { logAuditEvent } from '../audit/AuditLog.js';
import { getAppBaseUrl } from '../../infrastructure/email/emailService.js';

// Helper to safely establish authenticated session and rotate session ID
function establishUserSession(req, user, authFactor, callback) {
  const existingCsrfToken = req.session ? req.session.csrfToken : null;

  req.session.regenerate((err) => {
    if (err) return callback(err);

    req.session.user = user;
    req.session.userId = user.id;
    req.session.createdAt = Date.now();
    req.session.lastActivityAt = Date.now();

    if (existingCsrfToken) {
      req.session.csrfToken = existingCsrfToken;
    } else {
      getOrCreateCsrfToken(req);
    }

    req.session.save((saveErr) => {
      if (saveErr) return callback(saveErr);

      // Asynchronously record login security event and dispatch notification
      authService.recordLoginAndNotify({
        user,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        authFactor
      });

      callback(null);
    });
  });
}

export async function register(req, res, next) {
  try {
    const { name, email, password, role } = req.validatedBody;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const user = await authService.register({
      name,
      email,
      password,
      role,
      ipAddress,
      userAgent
    });

    // Session rotation upon registration to prevent session fixation
    establishUserSession(req, user, 'PASSWORD', (err) => {
      if (err) return next(err);
      res.status(201).json({
        success: true,
        message: 'Registration successful. A verification email has been sent to your inbox.',
        data: { user }
      });
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyEmail(req, res, next) {
  try {
    const { token } = req.validatedBody;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const result = await authService.verifyEmail({
      token,
      ipAddress,
      userAgent
    });

    // If user is currently signed in, refresh their session state
    if (req.session?.user) {
      req.session.user.emailVerified = true;
      req.session.save();
    }

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
}

export async function resendVerificationEmail(req, res, next) {
  try {
    const { email } = req.validatedBody;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const result = await authService.resendVerificationEmail({
      email,
      ipAddress,
      userAgent
    });

    const verifyUrl = result.rawToken ? `${getAppBaseUrl()}/verify-email?token=${result.rawToken}` : undefined;

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        ...(result.alreadyVerified ? { alreadyVerified: true } : {}),
        ...(verifyUrl ? { verifyUrl } : {})
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.validatedBody;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const result = await authService.login({
      email,
      password,
      ipAddress,
      userAgent
    });

    // If MFA is required, DO NOT establish authenticated session. Return pending challenge.
    if (result.mfaRequired) {
      return res.status(200).json({
        success: true,
        message: 'Multi-factor authentication required',
        data: {
          mfaRequired: true,
          challengeId: result.challengeId,
          factor: result.factor,
          availableFactors: result.availableFactors,
          maskedEmail: result.maskedEmail
        }
      });
    }

    // Single-factor authentication success
    establishUserSession(req, result.user, 'PASSWORD', (err) => {
      if (err) return next(err);
      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: { user: result.user }
      });
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyMfaOtp(req, res, next) {
  try {
    const { challengeId, otp } = req.validatedBody;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const user = await authService.verifyMfaOtp({
      challengeId,
      otp,
      ipAddress,
      userAgent
    });

    establishUserSession(req, user, 'EMAIL_OTP', (err) => {
      if (err) return next(err);
      res.status(200).json({
        success: true,
        message: 'Two-factor authentication successful',
        data: { user }
      });
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyMfaTotp(req, res, next) {
  try {
    const { challengeId, code } = req.validatedBody;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const user = await authService.verifyMfaTotp({
      challengeId,
      code,
      ipAddress,
      userAgent
    });

    establishUserSession(req, user, 'TOTP', (err) => {
      if (err) return next(err);
      res.status(200).json({
        success: true,
        message: 'Two-factor authentication successful',
        data: { user }
      });
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyMfaRecovery(req, res, next) {
  try {
    const { challengeId, recoveryCode } = req.validatedBody;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const user = await authService.verifyMfaRecovery({
      challengeId,
      recoveryCode,
      ipAddress,
      userAgent
    });

    establishUserSession(req, user, 'RECOVERY_CODE', (err) => {
      if (err) return next(err);
      res.status(200).json({
        success: true,
        message: 'Recovery authentication successful',
        data: { user }
      });
    });
  } catch (error) {
    next(error);
  }
}

export async function resendMfaOtp(req, res, next) {
  try {
    const { challengeId } = req.validatedBody;
    const result = await authService.resendMfaOtp({ challengeId });
    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
}

export async function switchMfaFactor(req, res, next) {
  try {
    const { challengeId, factor } = req.validatedBody;
    const result = await authService.switchMfaFactor({ challengeId, factor });
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    const user = req.session ? req.session.user : null;
    if (user) {
      await logAuditEvent({
        action: 'LOGOUT',
        actorId: user.id,
        actorRole: user.role,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
    }

    if (req.session) {
      req.session.destroy((err) => {
        if (err) return next(err);
        res.clearCookie('eventora.sid', { path: '/' });
        res.status(200).json({
          success: true,
          message: 'Logged out successfully'
        });
      });
    } else {
      res.clearCookie('eventora.sid', { path: '/' });
      res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });
    }
  } catch (error) {
    next(error);
  }
}

export async function getMe(req, res) {
  if (req.session && req.session.user) {
    try {
      const freshUser = await User.findById(req.session.user.id).select('emailVerified role name email');
      if (freshUser) {
        req.session.user.emailVerified = freshUser.emailVerified;
        req.session.user.role = freshUser.role;
        req.session.user.name = freshUser.name;
      }
    } catch {
      // Fallback to session cache on transient DB read error
    }

    return res.status(200).json({
      success: true,
      data: { user: req.session.user }
    });
  }
  return res.status(200).json({
    success: true,
    data: { user: null }
  });
}

export async function getCsrfToken(req, res) {
  const token = getOrCreateCsrfToken(req);
  if (req.session && typeof req.session.save === 'function') {
    req.session.save(() => {
      res.status(200).json({
        success: true,
        data: { csrfToken: token }
      });
    });
    return;
  }
  res.status(200).json({
    success: true,
    data: { csrfToken: token }
  });
}

// -------------------------------------------------------------
// SECURITY SETTINGS & ENROLLMENT CONTROLLERS
// -------------------------------------------------------------

export async function getSecurityStatus(req, res, next) {
  try {
    const status = await authService.getSecurityStatus(req.user.id);
    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    next(error);
  }
}

export async function getLoginHistory(req, res, next) {
  try {
    const history = await authService.getLoginHistory(req.user.id);
    res.status(200).json({
      success: true,
      data: { history }
    });
  } catch (error) {
    next(error);
  }
}

export async function initiateEmailOtp(req, res, next) {
  try {
    const { password } = req.validatedBody;
    const result = await authService.initiateEmailOtpEnrollment({
      userId: req.user.id,
      password,
      req
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function confirmEmailOtp(req, res, next) {
  try {
    const { otp } = req.validatedBody;
    const result = await authService.confirmEmailOtpEnrollment({
      userId: req.user.id,
      otp,
      req
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function setupTotp(req, res, next) {
  try {
    const { password } = req.validatedBody;
    const result = await authService.setupTotpEnrollment({
      userId: req.user.id,
      password,
      req
    });
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
}

export async function confirmTotp(req, res, next) {
  try {
    const { code } = req.validatedBody;
    const result = await authService.confirmTotpEnrollment({
      userId: req.user.id,
      code,
      req
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function disableMfa(req, res, next) {
  try {
    const { password, factor } = req.validatedBody;
    const result = await authService.disableMfaFactor({
      userId: req.user.id,
      password,
      factor,
      req
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function regenerateRecoveryCodes(req, res, next) {
  try {
    const { password } = req.validatedBody;
    const result = await authService.regenerateRecoveryCodes({
      userId: req.user.id,
      password,
      req
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.validatedBody;
    const result = await authService.requestPasswordResetOtp({
      email,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const { email, otp, newPassword } = req.validatedBody;
    const result = await authService.resetPasswordWithOtp({
      email,
      otp,
      newPassword,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.validatedBody;
    const result = await authService.changePassword({
      userId: req.user.id,
      currentPassword,
      newPassword,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
