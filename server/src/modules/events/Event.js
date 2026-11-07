import mongoose from 'mongoose';
import { EVENT_STATUS } from '../../shared/constants/status.js';

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Event title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters long'],
      maxlength: [200, 'Title cannot exceed 200 characters']
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      minlength: [10, 'Description must be at least 10 characters long'],
      maxlength: [5000, 'Description cannot exceed 5000 characters']
    },
    eventDate: {
      type: Date,
      required: [true, 'Event date and time is required']
    },
    venue: {
      type: String,
      required: [true, 'Venue location is required'],
      trim: true,
      minlength: [3, 'Venue must be at least 3 characters long'],
      maxlength: [300, 'Venue cannot exceed 300 characters']
    },
    seatLimit: {
      type: Number,
      required: [true, 'Seat limit is required'],
      min: [1, 'Seat limit must be at least 1']
    },
    seatsBooked: {
      type: Number,
      default: 0,
      min: [0, 'Seats booked cannot be negative']
    },
    organizerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Organizer is required'],
      index: true
    },
    status: {
      type: String,
      enum: Object.values(EVENT_STATUS),
      default: EVENT_STATUS.PUBLISHED,
      index: true
    },
    isPaid: {
      type: Boolean,
      default: false,
      index: true
    },
    ticketPrice: {
      type: Number,
      default: 0,
      min: [0, 'Ticket price cannot be negative']
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
      trim: true,
      enum: ['INR']
    },
    category: {
      type: String,
      trim: true,
      default: 'General'
    },
    image: {
      source: {
        type: String,
        enum: ['URL', 'CLOUDINARY'],
        default: 'URL'
      },
      url: {
        type: String,
        trim: true,
        default: ''
      },
      publicId: {
        type: String,
        trim: true,
        default: null
      }
    },
    bannerUrl: {
      type: String,
      trim: true,
      default: ''
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.__v;
        if (!ret.image || !ret.image.url) {
          ret.image = {
            source: 'URL',
            url: ret.bannerUrl || '',
            publicId: null
          };
        }
        if (!ret.bannerUrl && ret.image?.url) {
          ret.bannerUrl = ret.image.url;
        }
        return ret;
      }
    }
  }
);

// Pre-save synchronization hook between image object and legacy bannerUrl
eventSchema.pre('save', function (next) {
  if (this.image && this.image.url) {
    this.bannerUrl = this.image.url;
  } else if (this.bannerUrl && (!this.image || !this.image.url)) {
    this.image = {
      source: 'URL',
      url: this.bannerUrl,
      publicId: null
    };
  }
  next();
});

// Virtual for remaining seats
eventSchema.virtual('remainingSeats').get(function () {
  return Math.max(0, this.seatLimit - (this.seatsBooked || 0));
});

// Virtual for isPast
eventSchema.virtual('isPast').get(function () {
  return new Date(this.eventDate).getTime() < Date.now();
});

// Indexes for high performance querying
eventSchema.index({ organizerId: 1, createdAt: -1 });
eventSchema.index({ status: 1, eventDate: 1 });
eventSchema.index({ title: 'text', description: 'text', venue: 'text' });

export const Event = mongoose.model('Event', eventSchema);
