import { User } from '../users/User.js';
import { hashPassword, verifyPassword } from '../../infrastructure/security/password.js';
import { ConflictError, UnauthorizedError } from '../../shared/errors/AppError.js';
import { logAuditEvent } from '../audit/AuditLog.js';

export async function register({ name, email, password, role, ipAddress, userAgent }) {
  const normalizedEmail = email.toLowerCase().trim();

  // Check if user already exists
  const existingUser = await User.findOne({ normalizedEmail });
  if (existingUser) {
    throw new ConflictError('An account with this email address already exists.');
  }

  // Hash password using Argon2id
  const passwordHash = await hashPassword(password);

  const user = await User.create({
    name,
    email: normalizedEmail,
    normalizedEmail,
    passwordHash,
    role
  });

  await logAuditEvent({
    action: 'USER_REGISTERED',
    actorId: user._id,
    actorRole: user.role,
    resourceId: user._id,
    resourceType: 'User',
    ipAddress,
    userAgent,
    details: { email: user.email, role: user.role }
  });

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt
  };
}

export async function login({ email, password, ipAddress, userAgent }) {
  const normalizedEmail = email.toLowerCase().trim();

  const user = await User.findOne({ normalizedEmail }).select('+passwordHash');
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

  await logAuditEvent({
    action: 'LOGIN_SUCCESS',
    actorId: user._id,
    actorRole: user.role,
    resourceId: user._id,
    resourceType: 'User',
    ipAddress,
    userAgent,
    details: { email: user.email }
  });

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt
  };
}
