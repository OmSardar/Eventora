import mongoose from 'mongoose';
import { ROLES, ALL_ROLES } from '../../shared/constants/roles.js';

const recoveryCodeSchema = new mongoose.Schema(
  {
    codeHash: {
      type: String,
      required: true
    },
    used: {
      type: Boolean,
      default: false
    },
    usedAt: {
      type: Date,
      default: null
    }
  },
  { _id: false }
);

const userMfaSchema = new mongoose.Schema(
  {
    emailOtpEnabled: {
      type: Boolean,
      default: false
    },
    totpEnabled: {
      type: Boolean,
      default: false
    },
    totpSecretEncrypted: {
      type: String,
      default: null,
      select: false
    },
    totpConfirmedAt: {
      type: Date,
      default: null
    },
    recoveryCodes: {
      type: [recoveryCodeSchema],
      default: [],
      select: false
    },
    lastUsedFactor: {
      type: String,
      enum: ['PASSWORD', 'EMAIL_OTP', 'TOTP', 'RECOVERY_CODE', null],
      default: null
    }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters long'],
      maxlength: [100, 'Name cannot exceed 100 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      maxlength: [255, 'Email cannot exceed 255 characters']
    },
    normalizedEmail: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false // Never return password hash by default
    },
    role: {
      type: String,
      enum: {
        values: ALL_ROLES,
        message: '{VALUE} is not a valid role'
      },
      required: [true, 'Role is required'],
      immutable: true // Role cannot be modified after registration
    },
    emailVerified: {
      type: Boolean,
      default: false,
      index: true
    },
    emailVerifiedAt: {
      type: Date,
      default: null
    },
    lastLoginAt: {
      type: Date,
      default: null
    },
    mfa: {
      type: userMfaSchema,
      default: () => ({})
    },
    passwordReset: {
      otpHash: {
        type: String,
        default: null,
        select: false
      },
      expiresAt: {
        type: Date,
        default: null,
        select: false
      },
      attempts: {
        type: Number,
        default: 0,
        select: false
      }
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.passwordHash;
        delete ret.passwordReset;
        if (ret.mfa) {
          delete ret.mfa.totpSecretEncrypted;
          delete ret.mfa.recoveryCodes;
        }
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Pre-validate hook to always keep normalizedEmail synchronized with email
userSchema.pre('validate', function (next) {
  if (this.email) {
    this.normalizedEmail = this.email.toLowerCase().trim();
  }
  next();
});

export const User = mongoose.model('User', userSchema);
