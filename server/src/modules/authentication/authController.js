import * as authService from './authService.js';
import { getOrCreateCsrfToken } from '../../shared/middleware/securityMiddleware.js';
import { logAuditEvent } from '../audit/AuditLog.js';

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
    const csrfToken = req.session ? req.session.csrfToken : null;
    req.session.regenerate((err) => {
      if (err) return next(err);

      req.session.user = user;
      req.session.createdAt = Date.now();
      req.session.lastActivityAt = Date.now();
      if (csrfToken) {
        req.session.csrfToken = csrfToken;
      } else {
        getOrCreateCsrfToken(req);
      }

      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        res.status(201).json({
          success: true,
          message: 'Registration successful',
          data: { user }
        });
      });
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

    const user = await authService.login({
      email,
      password,
      ipAddress,
      userAgent
    });

    // Session rotation upon login to prevent session fixation
    const csrfToken = req.session ? req.session.csrfToken : null;
    req.session.regenerate((err) => {
      if (err) return next(err);

      req.session.user = user;
      req.session.createdAt = Date.now();
      req.session.lastActivityAt = Date.now();
      if (csrfToken) {
        req.session.csrfToken = csrfToken;
      } else {
        getOrCreateCsrfToken(req);
      }

      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        res.status(200).json({
          success: true,
          message: 'Login successful',
          data: { user }
        });
      });
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
  res.status(200).json({
    success: true,
    data: { csrfToken: token }
  });
}
