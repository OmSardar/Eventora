import mongoose from 'mongoose';

const emailVerificationTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
    },
    tokenHash: {
      type: String,
      required: [true, 'Token hash is required'],
      unique: true,
      index: true
    },
    purpose: {
      type: String,
      enum: ['EMAIL_VERIFICATION'],
      default: 'EMAIL_VERIFICATION'
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration timestamp is required'],
      index: { expires: '1h' }
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

emailVerificationTokenSchema.index({ userId: 1, consumedAt: 1 });

export const EmailVerificationToken = mongoose.model('EmailVerificationToken', emailVerificationTokenSchema);

