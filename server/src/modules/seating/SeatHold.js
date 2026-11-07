import mongoose from 'mongoose';
import { SEAT_HOLD_STATUS } from '../../shared/constants/status.js';

const seatHoldSchema = new mongoose.Schema(
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
    seatIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'EventSeat',
        required: true
      }
    ],
    seatLabels: [
      {
        type: String,
        required: true
      }
    ],
    totalAmount: {
      type: Number,
      required: [true, 'Total hold amount is required'],
      min: [0, 'Total amount cannot be negative']
    },
    status: {
      type: String,
      enum: Object.values(SEAT_HOLD_STATUS),
      default: SEAT_HOLD_STATUS.ACTIVE,
      index: true
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration timestamp is required'],
      index: true
    },
    releasedAt: {
      type: Date,
      default: null
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      }
    }
  }
);

// High throughput query indexes
seatHoldSchema.index({ eventId: 1, attendeeId: 1, status: 1 });
seatHoldSchema.index({ status: 1, expiresAt: 1 });

export const SeatHold = mongoose.model('SeatHold', seatHoldSchema);
