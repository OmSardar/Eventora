import mongoose from 'mongoose';
import { PAYMENT_STATUS, REFUND_STATUS } from '../../shared/constants/status.js';

const paymentSchema = new mongoose.Schema(
  {
    attendeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Attendee ID is required'],
      index: true
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: [true, 'Event ID is required'],
      index: true
    },
    registrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Registration',
      default: null,
      index: true
    },
    orderId: {
      type: String,
      required: [true, 'Razorpay order ID is required'],
      unique: true,
      trim: true,
      index: true
    },
    paymentId: {
      type: String,
      default: null,
      trim: true,
      index: true
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount in paise is required'],
      min: [100, 'Minimum payment amount is 100 paise (₹1.00)']
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
      trim: true
    },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.CREATED,
      index: true
    },
    refundStatus: {
      type: String,
      enum: Object.values(REFUND_STATUS),
      default: REFUND_STATUS.NONE,
      index: true
    },
    refundId: {
      type: String,
      default: null,
      trim: true
    },
    refundAmount: {
      type: Number,
      default: 0
    },
    refundReason: {
      type: String,
      default: null,
      trim: true
    },
    method: {
      type: String,
      default: null,
      trim: true
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    failureDetails: {
      code: { type: String, default: null },
      description: { type: String, default: null },
      source: { type: String, default: null },
      reason: { type: String, default: null }
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

paymentSchema.index({ eventId: 1, attendeeId: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });

export const Payment = mongoose.model('Payment', paymentSchema);
