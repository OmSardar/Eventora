import mongoose from 'mongoose';

const refundOperationSchema = new mongoose.Schema(
  {
    refundOpId: {
      type: String,
      required: [true, 'Refund operation ID is required'],
      unique: true,
      trim: true,
      index: true
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      required: [true, 'Payment ID is required'],
      index: true
    },
    registrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Registration',
      default: null,
      index: true
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: [true, 'Event ID is required'],
      index: true
    },
    attendeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Attendee ID is required'],
      index: true
    },
    organizerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Organizer ID is required'],
      index: true
    },
    orderId: {
      type: String,
      required: [true, 'Order ID is required'],
      trim: true,
      index: true
    },
    gatewayPaymentId: {
      type: String,
      required: [true, 'Gateway payment ID is required'],
      trim: true,
      index: true
    },
    gatewayRefundId: {
      type: String,
      default: null,
      trim: true,
      index: true
    },
    amount: {
      type: Number,
      required: [true, 'Refund amount in paise is required'],
      min: [100, 'Minimum refund amount is 100 paise (₹1.00)']
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
      trim: true
    },
    reason: {
      type: String,
      default: 'Organizer approved cancellation',
      trim: true,
      maxlength: [500, 'Reason cannot exceed 500 characters']
    },
    status: {
      type: String,
      enum: ['INITIATED', 'PENDING', 'PROCESSED', 'FAILED', 'MANUAL_RECONCILIATION_REQUIRED'],
      default: 'INITIATED',
      index: true
    },
    idempotencyKey: {
      type: String,
      required: [true, 'Idempotency key is required'],
      unique: true,
      trim: true,
      index: true
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0
    },
    maxRetries: {
      type: Number,
      default: 3
    },
    lastAttemptAt: {
      type: Date,
      default: null
    },
    nextRetryAt: {
      type: Date,
      default: null,
      index: true
    },
    lastError: {
      type: String,
      default: null,
      trim: true
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

// Compound indexes for query optimization
refundOperationSchema.index({ paymentId: 1, status: 1 });
refundOperationSchema.index({ status: 1, nextRetryAt: 1 });

export const RefundOperation = mongoose.model('RefundOperation', refundOperationSchema);
