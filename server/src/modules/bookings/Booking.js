import mongoose from 'mongoose';
import { BOOKING_STATUS } from '../../shared/constants/status.js';

const bookingSchema = new mongoose.Schema(
  {
    bookingReference: {
      type: String,
      required: [true, 'Booking reference is required'],
      unique: true,
      trim: true,
      uppercase: true,
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
    seatIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'EventSeat'
      }
    ],
    seatLabels: [
      {
        type: String,
        trim: true
      }
    ],
    ticketCategory: {
      type: String,
      default: 'STANDARD',
      trim: true
    },
    subtotal: {
      type: Number,
      required: [true, 'Subtotal is required'],
      min: [0, 'Subtotal cannot be negative']
    },
    fees: {
      type: Number,
      default: 0,
      min: [0, 'Fees cannot be negative']
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: [0, 'Total amount cannot be negative']
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true,
      uppercase: true
    },
    status: {
      type: String,
      enum: Object.values(BOOKING_STATUS),
      default: BOOKING_STATUS.PENDING_PAYMENT,
      index: true
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
      index: true
    },
    holdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SeatHold',
      default: null,
      index: true
    },
    registrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Registration',
      default: null,
      index: true
    },
    confirmedAt: {
      type: Date,
      default: null
    },
    cancelledAt: {
      type: Date,
      default: null
    },
    ticketToken: {
      type: String,
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

bookingSchema.index({ eventId: 1, attendeeId: 1, status: 1 });
bookingSchema.index({ attendeeId: 1, createdAt: -1 });

export const Booking = mongoose.model('Booking', bookingSchema);
