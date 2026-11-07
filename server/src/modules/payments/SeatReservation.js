import mongoose from 'mongoose';
import { RESERVATION_STATUS } from '../../shared/constants/status.js';

const seatReservationSchema = new mongoose.Schema(
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
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null
    },
    orderId: {
      type: String,
      required: [true, 'Order ID is required'],
      unique: true,
      trim: true,
      index: true
    },
    reservedSeats: {
      type: Number,
      default: 1,
      min: [1, 'Reserved seats must be at least 1']
    },
    status: {
      type: String,
      enum: Object.values(RESERVATION_STATUS),
      default: RESERVATION_STATUS.PENDING,
      index: true
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration timestamp is required'],
      index: true
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

seatReservationSchema.index({ eventId: 1, attendeeId: 1, status: 1 });
seatReservationSchema.index({ status: 1, expiresAt: 1 });

export const SeatReservation = mongoose.model('SeatReservation', seatReservationSchema);

