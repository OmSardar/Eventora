import mongoose from 'mongoose';

const loginSecurityEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      index: true
    },
    loginAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    ipAddress: {
      type: String,
      required: [true, 'IP address is required']
    },
    location: {
      city: { type: String, default: 'Unknown' },
      region: { type: String, default: 'Unknown' },
      country: { type: String, default: 'Unknown' }
    },
    device: {
      browser: { type: String, default: 'Unknown' },
      browserVersion: { type: String, default: 'Unknown' },
      os: { type: String, default: 'Unknown' },
      deviceType: { type: String, default: 'Desktop' }
    },
    authFactor: {
      type: String,
      enum: ['PASSWORD', 'EMAIL_OTP', 'TOTP', 'RECOVERY_CODE'],
      default: 'PASSWORD'
    },
    notificationStatus: {
      type: String,
      enum: ['QUEUED', 'SENT', 'FAILED', 'SIMULATED'],
      default: 'QUEUED'
    },
    notificationError: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

loginSecurityEventSchema.index({ userId: 1, loginAt: -1 });

export const LoginSecurityEvent = mongoose.model('LoginSecurityEvent', loginSecurityEventSchema);

