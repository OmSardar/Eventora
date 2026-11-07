import mongoose from 'mongoose';

const webhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: [true, 'Webhook event ID is required'],
      unique: true,
      trim: true,
      index: true
    },
    eventType: {
      type: String,
      required: [true, 'Event type is required'],
      index: true
    },
    provider: {
      type: String,
      default: 'RAZORPAY',
      index: true
    },
    status: {
      type: String,
      enum: ['RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED'],
      default: 'RECEIVED',
      index: true
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    processingError: {
      type: String,
      default: null
    },
    processedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

export const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);

