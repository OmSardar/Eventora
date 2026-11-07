import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      index: true
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    actorRole: {
      type: String
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true
    },
    resourceType: {
      type: String,
      index: true
    },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILURE'],
      default: 'SUCCESS'
    },
    ipAddress: {
      type: String
    },
    userAgent: {
      type: String
    },
    details: {
      type: mongoose.Schema.Types.Mixed
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export async function logAuditEvent({
  action,
  actorId,
  actorRole,
  resourceId,
  resourceType,
  status = 'SUCCESS',
  ipAddress,
  userAgent,
  details
}) {
  try {
    await AuditLog.create({
      action,
      actorId,
      actorRole,
      resourceId,
      resourceType,
      status,
      ipAddress,
      userAgent,
      details,
      timestamp: new Date()
    });
  } catch (err) {
    // Audit logging failure should not crash primary operation, but be recorded to structured logger
    console.error('Failed to write audit log:', err.message);
  }
}
