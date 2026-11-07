import mongoose from 'mongoose';
import { NOTIFICATION_TYPE, NOTIFICATION_CHANNEL } from '../../shared/constants/status.js';

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
    },
    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPE),
      required: [true, 'Notification type is required'],
      index: true
    },
    channel: {
      type: String,
      enum: Object.values(NOTIFICATION_CHANNEL),
      default: NOTIFICATION_CHANNEL.IN_APP,
      index: true
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      default: null
    },
    registrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Registration',
      default: null
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null
    },
    status: {
      type: String,
      enum: ['SENT', 'DELIVERED', 'FAILED', 'SKIPPED'],
      default: 'DELIVERED',
      index: true
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    providerRef: {
      type: String,
      default: null
    },
    failureReason: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      }
    }
  }
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
