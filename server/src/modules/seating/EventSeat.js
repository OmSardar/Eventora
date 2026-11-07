import mongoose from 'mongoose';
import { SEAT_STATUS, SEAT_CATEGORY } from '../../shared/constants/status.js';

const eventSeatSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: [true, 'Event ID is required'],
      index: true
    },
    sectionId: {
      type: String,
      required: [true, 'Section ID is required'],
      trim: true
    },
    sectionName: {
      type: String,
      required: [true, 'Section Name is required'],
      trim: true
    },
    rowLabel: {
      type: String,
      required: [true, 'Row label is required'],
      trim: true,
      uppercase: true
    },
    seatNumber: {
      type: Number,
      required: [true, 'Seat number is required'],
      min: [1, 'Seat number must be at least 1']
    },
    seatLabel: {
      type: String,
      required: [true, 'Seat label is required'],
      trim: true
    },
    category: {
      type: String,
      enum: Object.values(SEAT_CATEGORY),
      default: SEAT_CATEGORY.STANDARD
    },
    price: {
      type: Number,
      required: [true, 'Seat price is required'],
      min: [0, 'Seat price cannot be negative']
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true,
      uppercase: true
    },
    status: {
      type: String,
      enum: Object.values(SEAT_STATUS),
      default: SEAT_STATUS.AVAILABLE,
      index: true
    },
    holdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SeatHold',
      default: null,
      index: true
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
      index: true
    },
    heldBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    heldUntil: {
      type: Date,
      default: null
    },
    version: {
      type: Number,
      default: 0
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

// Compound unique index guaranteeing no duplicate seat labels per event
eventSeatSchema.index({ eventId: 1, seatLabel: 1 }, { unique: true });

// Compound query indexes for high-throughput availability and hold lookups
eventSeatSchema.index({ eventId: 1, status: 1 });
eventSeatSchema.index({ eventId: 1, sectionId: 1, rowLabel: 1 });
eventSeatSchema.index({ holdId: 1, status: 1 });

export const EventSeat = mongoose.model('EventSeat', eventSeatSchema);
