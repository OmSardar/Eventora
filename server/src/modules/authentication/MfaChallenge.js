import mongoose from 'mongoose';

const mfaChallengeSchema = new mongoose.Schema(
  {
    challengeId: {
      type: String,
      required: [true, 'Challenge ID is required'],
      unique: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
    },
    availableFactors: {
      type: [String],
      enum: ['EMAIL_OTP', 'TOTP', 'RECOVERY_CODE'],
      required: true
    },
    activeFactor: {
      type: String,
      enum: ['EMAIL_OTP', 'TOTP', 'RECOVERY_CODE'],
      required: true
    },
    otpHash: {
      type: String,
      default: null
    },
    otpExpiresAt: {
      type: Date,
      default: null
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0
    },
    maxAttempts: {
      type: Number,
      default: 5
    },
    lastResendAt: {
      type: Date,
      default: null
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration timestamp is required'],
      index: { expires: '10m' }
    },
    consumedAt: {
      type: Date,
      default: null
    },
    ipAddress: {
      type: String,
      default: null
    },
    userAgent: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

mfaChallengeSchema.index({ userId: 1, consumedAt: 1, expiresAt: 1 });

export const MfaChallenge = mongoose.model('MfaChallenge', mfaChallengeSchema);

