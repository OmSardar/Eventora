import mongoose from 'mongoose';
import { REGISTRATION_STATUS } from '../../shared/constants/status.js';

const registrationSchema = new mongoose.Schema(
  {
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
    status: {
      type: String,
      enum: Object.values(REGISTRATION_STATUS),
      default: REGISTRATION_STATUS.CONFIRMED,
      index: true
    },
    cancellationReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Cancellation reason cannot exceed 500 characters']
    },
    decisionNote: {
      type: String,
      trim: true,
      maxlength: [500, 'Decision note cannot exceed 500 characters']
    },
    decidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    decidedAt: {
      type: Date
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
      index: true
    },
    isPaid: {
      type: Boolean,
      default: false
    },
    ticketPrice: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'INR'
    },
    refundStatus: {
      type: String,
      default: 'NONE'
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

// Compound unique index ensuring an attendee can register only once per event
registrationSchema.index({ eventId: 1, attendeeId: 1 }, { unique: true });

// Query optimization indexes
registrationSchema.index({ attendeeId: 1, createdAt: -1 });
registrationSchema.index({ eventId: 1, status: 1 });

export const Registration = mongoose.model('Registration', registrationSchema);

