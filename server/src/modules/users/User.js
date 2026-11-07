import mongoose from 'mongoose';
import { ROLES, ALL_ROLES } from '../../shared/constants/roles.js';

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
    phone: {
      type: String,
      trim: true,
      default: ''
    },
    smsConsent: {
      type: Boolean,
      default: false
    },
    notificationPreferences: {
      sms: { type: Boolean, default: true },
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false }
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.passwordHash;
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

