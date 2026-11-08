import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

import { User } from '../modules/users/User.js';
import { Event } from '../modules/events/Event.js';
import { EventSeat } from '../modules/seating/EventSeat.js';
import { SeatHold } from '../modules/seating/SeatHold.js';
import { Booking } from '../modules/bookings/Booking.js';
import { Registration } from '../modules/registrations/Registration.js';
import { Payment } from '../modules/payments/Payment.js';
import { SeatReservation } from '../modules/payments/SeatReservation.js';
import { RefundOperation } from '../modules/payments/RefundOperation.js';
import { Notification } from '../modules/notifications/Notification.js';
import { WebhookEvent } from '../modules/payments/WebhookEvent.js';

import { hashPassword } from '../infrastructure/security/password.js';
import { ROLES } from '../shared/constants/roles.js';
import {
  EVENT_STATUS,
  REGISTRATION_STATUS,
  BOOKING_STATUS,
  SEAT_STATUS,
  NOTIFICATION_TYPE,
  NOTIFICATION_CHANNEL,
  PAYMENT_STATUS
} from '../shared/constants/status.js';
import { generateEventSeats } from '../modules/seating/seatingService.js';
import { generateSignedTicketToken } from '../modules/bookings/ticketCrypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getMongoUris() {
  const envPath = path.resolve(__dirname, '../../.env');
  let remoteUri = null;
  let localUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora';

  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/mongodb\+srv:\/\/[^\s]+/);
    if (match) {
      remoteUri = match[0].trim();
    }
  }

  // If local URI points to remote, adjust fallback
  if (localUri.startsWith('mongodb+srv://')) {
    remoteUri = localUri;
    localUri = 'mongodb://127.0.0.1:27017/eventora';
  }

  return { localUri, remoteUri };
}

function sanitizeUri(uri) {
  if (!uri) return 'undefined';
  return uri.replace(/:\/\/.*@/, '://***@');
}

export async function seedTargetDatabase(mongoUri, label = 'Target') {
  console.log(`\n====================================================`);
  console.log(`[${label}] Connecting to MongoDB at: ${sanitizeUri(mongoUri)}...`);
  console.log(`====================================================`);

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
  console.log(`[${label}] Connected successfully!`);

  // 1. Purge all existing events and cascading collections
  console.log(`[${label}] Purging existing events and event-related records...`);
  const delEvents = await Event.deleteMany({});
  const delSeats = await EventSeat.deleteMany({});
  const delHolds = await SeatHold.deleteMany({});
  const delBookings = await Booking.deleteMany({});
  const delRegs = await Registration.deleteMany({});
  const delPayments = await Payment.deleteMany({});
  const delReservations = await SeatReservation.deleteMany({});
  const delRefunds = await RefundOperation.deleteMany({});
  const delNotifications = await Notification.deleteMany({});
  const delWebhooks = await WebhookEvent.deleteMany({});

  console.log(
    `[${label}] Cleared: ${delEvents.deletedCount} events, ${delSeats.deletedCount} seats, ${delBookings.deletedCount} bookings, ${delRegs.deletedCount} registrations, ${delPayments.deletedCount} payments, ${delNotifications.deletedCount} notifications.`
  );

  // 2. Upsert demo accounts while preserving any existing real user accounts
  console.log(`[${label}] Ensuring demo users exist with standard credentials...`);
  const organizerPasswordHash = await hashPassword('Organizer@123');
  const attendeePasswordHash = await hashPassword('Attendee@123');

  async function upsertDemoUser({ name, email, passwordHash, role }) {
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name,
        email,
        normalizedEmail: email.toLowerCase(),
        passwordHash,
        role,
        emailVerified: true,
        emailVerifiedAt: new Date()
      });
      console.log(`[${label}] Created user: ${email} (${role})`);
    } else {
      user.name = name;
      user.passwordHash = passwordHash;
      user.role = role;
      user.emailVerified = true;
      user.emailVerifiedAt = user.emailVerifiedAt || new Date();
      await user.save();
      console.log(`[${label}] Updated existing user: ${email} (${role})`);
    }
    return user;
  }

  const demoOrganizer = await upsertDemoUser({
    name: 'Sarah Chen (Demo Organizer)',
    email: 'organizer@eventora.demo',
    passwordHash: organizerPasswordHash,
    role: ROLES.ORGANIZER
  });

  const demoAttendee = await upsertDemoUser({
    name: 'Alex Rivera (Demo Attendee)',
    email: 'attendee@eventora.demo',
    passwordHash: attendeePasswordHash,
    role: ROLES.ATTENDEE
  });

  const demoAttendee2 = await upsertDemoUser({
    name: 'Elena Rostova',
    email: 'elena@eventora.demo',
    passwordHash: attendeePasswordHash,
    role: ROLES.ATTENDEE
  });


  // 3. Create fresh, realistic seed events (scheduled 7 to 60 days ahead)
  console.log(`[${label}] Seeding 11 fresh, production-ready events across top hubs...`);
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Event 1: Kolkata — Cloud Native & AI Developer Summit (Assigned Seating, ₹799)
  const event1 = await Event.create({
    title: 'Kolkata Cloud Native & AI Developer Summit 2026',
    description:
      'Eastern India\'s premier engineering conference bringing together principal architects, Kubernetes operators, and AI systems researchers for deep-dives into microservices resilience, eBPF telemetry, and sovereign cloud infrastructure.',
    eventDate: new Date(now + 14 * dayMs),
    venue: 'Biswa Bangla Convention Centre, New Town, Kolkata',
    seatLimit: 50,
    seatsBooked: 3,
    organizerId: demoOrganizer._id,
    status: EVENT_STATUS.PUBLISHED,
    category: 'Technology',
    seatingType: 'ASSIGNED_SEATING',
    isPaid: true,
    ticketPrice: 799,
    currency: 'INR',
    maxTicketsPerBooking: 6,
    bannerUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1400&q=85',
    image: {
      source: 'URL',
      url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1400&q=85',
      publicId: null
    }
  });

  // Generate 50 physical seats (5 rows x 10 seats: A1 to E10)
  await generateEventSeats(event1._id, {
    generationMode: 'AUTOMATIC',
    totalSeats: 50,
    rows: 5,
    seatsPerRow: 10,
    startingRowLabel: 'A',
    category: 'STANDARD',
    price: 799
  });

  // Reserve seats A1, A2 for demoAttendee
  const seatsA1A2 = await EventSeat.find({ eventId: event1._id, seatLabel: { $in: ['A1', 'A2'] } });
  const bookingRef1 = `EVT-BK-CCU26-01`;
  const ticketToken1 = generateSignedTicketToken({
    bookingReference: bookingRef1,
    eventId: event1._id,
    attendeeId: demoAttendee._id
  });

  const booking1 = await Booking.create({
    bookingReference: bookingRef1,
    eventId: event1._id,
    attendeeId: demoAttendee._id,
    seatIds: seatsA1A2.map((s) => s._id),
    seatLabels: ['A1', 'A2'],
    ticketCategory: 'STANDARD',
    subtotal: 1598,
    fees: 0,
    totalAmount: 1598,
    currency: 'INR',
    status: BOOKING_STATUS.CONFIRMED,
    ticketToken: ticketToken1,
    paymentMethod: 'RAZORPAY',
    confirmedAt: new Date()
  });

  await EventSeat.updateMany(
    { _id: { $in: seatsA1A2.map((s) => s._id) } },
    { $set: { status: SEAT_STATUS.BOOKED, bookingId: booking1._id } }
  );

  const reg1 = await Registration.create({
    eventId: event1._id,
    attendeeId: demoAttendee._id,
    status: REGISTRATION_STATUS.CONFIRMED,
    isPaid: true,
    ticketPrice: 799,
    currency: 'INR',
    confirmationEmailSent: true,
    isRedeemed: false
  });
  booking1.registrationId = reg1._id;
  await booking1.save();

  // Reserve seat B5 for demoAttendee2
  const seatB5 = await EventSeat.findOne({ eventId: event1._id, seatLabel: 'B5' });
  if (seatB5) {
    const bookingRef2 = `EVT-BK-CCU26-02`;
    const ticketToken2 = generateSignedTicketToken({
      bookingReference: bookingRef2,
      eventId: event1._id,
      attendeeId: demoAttendee2._id
    });

    const booking2 = await Booking.create({
      bookingReference: bookingRef2,
      eventId: event1._id,
      attendeeId: demoAttendee2._id,
      seatIds: [seatB5._id],
      seatLabels: ['B5'],
      ticketCategory: 'STANDARD',
      subtotal: 799,
      fees: 0,
      totalAmount: 799,
      currency: 'INR',
      status: BOOKING_STATUS.CONFIRMED,
      ticketToken: ticketToken2,
      paymentMethod: 'RAZORPAY',
      confirmedAt: new Date()
    });

    seatB5.status = SEAT_STATUS.BOOKED;
    seatB5.bookingId = booking2._id;
    await seatB5.save();

    const reg2 = await Registration.create({
      eventId: event1._id,
      attendeeId: demoAttendee2._id,
      status: REGISTRATION_STATUS.CONFIRMED,
      isPaid: true,
      ticketPrice: 799,
      currency: 'INR',
      confirmationEmailSent: true,
      isRedeemed: false
    });
    booking2.registrationId = reg2._id;
    await booking2.save();
  }

  // Event 2: Bengaluru — Distributed Systems & Microservices Conclave (Assigned Seating, ₹1299)
  const event2 = await Event.create({
    title: 'Bengaluru Distributed Systems & Microservices Conclave',
    description:
      'India\'s tech capital convenes top distributed systems engineers to discuss Raft consensus, transactional outbox patterns, zero-downtime MongoDB sharding, and high-throughput event sourcing.',
    eventDate: new Date(now + 18 * dayMs),
    venue: 'Sheraton Grand Convention Centre, Whitefield, Bengaluru',
    seatLimit: 60,
    seatsBooked: 0,
    organizerId: demoOrganizer._id,
    status: EVENT_STATUS.PUBLISHED,
    category: 'Technology',
    seatingType: 'ASSIGNED_SEATING',
    isPaid: true,
    ticketPrice: 1299,
    currency: 'INR',
    maxTicketsPerBooking: 6,
    bannerUrl: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=1400&q=85',
    image: {
      source: 'URL',
      url: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=1400&q=85',
      publicId: null
    }
  });

  await generateEventSeats(event2._id, {
    generationMode: 'AUTOMATIC',
    totalSeats: 60,
    rows: 6,
    seatsPerRow: 10,
    startingRowLabel: 'A',
    category: 'STANDARD',
    price: 1299
  });

  // Event 3: Mumbai — Fintech Infrastructure & Payment Systems Summit (Assigned Seating, ₹1499)
  const event3 = await Event.create({
    title: 'Fintech Infrastructure & Payment Systems Summit',
    description:
      'Examining idempotent payment ledgers, ISO 20022 messaging, zero-loss double-entry transaction journals, reconciliation automata, and PCI-DSS compliance across distributed banking infrastructure.',
    eventDate: new Date(now + 25 * dayMs),
    venue: 'Jio World Convention Centre, Bandra Kurla Complex (BKC), Mumbai',
    seatLimit: 75,
    seatsBooked: 0,
    organizerId: demoOrganizer._id,
    status: EVENT_STATUS.PUBLISHED,
    category: 'Business',
    seatingType: 'ASSIGNED_SEATING',
    isPaid: true,
    ticketPrice: 1499,
    currency: 'INR',
    maxTicketsPerBooking: 6,
    bannerUrl: 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1400&q=85',
    image: {
      source: 'URL',
      url: 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1400&q=85',
      publicId: null
    }
  });

  await generateEventSeats(event3._id, {
    generationMode: 'AUTOMATIC',
    totalSeats: 75,
    rows: 5,
    seatsPerRow: 15,
    startingRowLabel: 'A',
    category: 'STANDARD',
    price: 1499
  });

  // Event 4: Delhi NCR — Future of Product Design & Spatial Interfaces (Assigned Seating, ₹599)
  const event4 = await Event.create({
    title: 'Future of Product Design & Spatial Interfaces',
    description:
      'A curated symposium of digital product designers, design systems architects, and creative directors exploring minimalism, spatial computing paradigms, tactile micro-interactions, and design craft in an algorithmic era.',
    eventDate: new Date(now + 21 * dayMs),
    venue: 'Cyber Hub Auditorium, DLF Phase 2, Gurugram, Delhi NCR',
    seatLimit: 50,
    seatsBooked: 0,
    organizerId: demoOrganizer._id,
    status: EVENT_STATUS.PUBLISHED,
    category: 'Design',
    seatingType: 'ASSIGNED_SEATING',
    isPaid: true,
    ticketPrice: 599,
    currency: 'INR',
    maxTicketsPerBooking: 6,
    bannerUrl: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=1400&q=85',
    image: {
      source: 'URL',
      url: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=1400&q=85',
      publicId: null
    }
  });

  await generateEventSeats(event4._id, {
    generationMode: 'AUTOMATIC',
    totalSeats: 50,
    rows: 5,
    seatsPerRow: 10,
    startingRowLabel: 'A',
    category: 'STANDARD',
    price: 599
  });

  // Event 5: Hyderabad — Next-Gen Generative AI & Autonomous Agents (Assigned Seating, ₹999)
  const event5 = await Event.create({
    title: 'Generative AI & Autonomous Agents Conclave 2026',
    description:
      'Comprehensive master summit exploring multi-agent orchestrations, MCP server integrations, deterministic validation loops, context compaction strategies, and production-grade self-healing autonomous workflows.',
    eventDate: new Date(now + 28 * dayMs),
    venue: 'Hyderabad International Convention Centre (HICC), HITEC City, Hyderabad',
    seatLimit: 60,
    seatsBooked: 0,
    organizerId: demoOrganizer._id,
    status: EVENT_STATUS.PUBLISHED,
    category: 'Technology',
    seatingType: 'ASSIGNED_SEATING',
    isPaid: true,
    ticketPrice: 999,
    currency: 'INR',
    maxTicketsPerBooking: 6,
    bannerUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1400&q=85',
    image: {
      source: 'URL',
      url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1400&q=85',
      publicId: null
    }
  });

  await generateEventSeats(event5._id, {
    generationMode: 'AUTOMATIC',
    totalSeats: 60,
    rows: 6,
    seatsPerRow: 10,
    startingRowLabel: 'A',
    category: 'STANDARD',
    price: 999
  });

  // Event 6: Pune — High-Throughput Node.js & Go Workshop (General Admission, Free RSVP)
  const event6 = await Event.create({
    title: 'High-Throughput Node.js & Go Backend Workshop',
    description:
      'Practical hands-on workshop focusing on streaming Server Components, non-blocking I/O profiling, memory leak detection, zero-copy socket processing, and sub-10ms response times.',
    eventDate: new Date(now + 35 * dayMs),
    venue: 'Kalyani Nagar Tech Commons, Pune',
    seatLimit: 80,
    seatsBooked: 1,
    organizerId: demoOrganizer._id,
    status: EVENT_STATUS.PUBLISHED,
    category: 'Workshop',
    seatingType: 'GENERAL_ADMISSION',
    isPaid: false,
    ticketPrice: 0,
    currency: 'INR',
    bannerUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1400&q=85',
    image: {
      source: 'URL',
      url: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1400&q=85',
      publicId: null
    }
  });

  // Free RSVP for demoAttendee
  const regFree = await Registration.create({
    eventId: event6._id,
    attendeeId: demoAttendee._id,
    status: REGISTRATION_STATUS.CONFIRMED,
    isPaid: false,
    ticketPrice: 0,
    currency: 'INR',
    confirmationEmailSent: true,
    isRedeemed: false
  });

  const bookingRefFree = `EVT-BK-PUN26-01`;
  await Booking.create({
    bookingReference: bookingRefFree,
    eventId: event6._id,
    attendeeId: demoAttendee._id,
    registrationId: regFree._id,
    ticketCategory: 'FREE RSVP',
    subtotal: 0,
    fees: 0,
    totalAmount: 0,
    currency: 'INR',
    status: BOOKING_STATUS.CONFIRMED,
    ticketToken: generateSignedTicketToken({
      bookingReference: bookingRefFree,
      eventId: event6._id,
      attendeeId: demoAttendee._id
    }),
    paymentMethod: 'FREE',
    confirmedAt: new Date()
  });

  // Event 7: San Francisco — Global Architecture & Consensus Summit (Assigned Seating, ₹1899)
  const event7 = await Event.create({
    title: 'Global Tech Summit 2026: Distributed Systems & AI Architecture',
    description:
      'Join industry pioneers, principal architects, and system engineers for 3 days of deep-dive keynotes, live architectural breakdowns, and collaborative workshops on zero-trust microservices, consensus protocols, and real-time streaming architectures.',
    eventDate: new Date(now + 42 * dayMs),
    venue: 'Metropolitan Convention Center, Hall A, San Francisco, CA',
    seatLimit: 50,
    seatsBooked: 0,
    organizerId: demoOrganizer._id,
    status: EVENT_STATUS.PUBLISHED,
    category: 'Technology',
    seatingType: 'ASSIGNED_SEATING',
    isPaid: true,
    ticketPrice: 1899,
    currency: 'INR',
    maxTicketsPerBooking: 6,
    bannerUrl: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1400&q=85',
    image: {
      source: 'URL',
      url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1400&q=85',
      publicId: null
    }
  });

  await generateEventSeats(event7._id, {
    generationMode: 'AUTOMATIC',
    totalSeats: 50,
    rows: 5,
    seatsPerRow: 10,
    startingRowLabel: 'A',
    category: 'STANDARD',
    price: 1899
  });

  // Event 8: New York — Clean Energy & Climate Innovation Roundtable (General Admission, Free RSVP)
  await Event.create({
    title: 'Clean Energy & Climate Innovation Roundtable',
    description:
      'Connecting venture founders, climate scientists, and infrastructure engineers building scalable decarbonization technologies, decentralized renewable microgrids, and transparent carbon accounting ledgers.',
    eventDate: new Date(now + 10 * dayMs),
    venue: 'Greenhouse Commons Pavilion, Soho, New York, NY',
    seatLimit: 120,
    seatsBooked: 0,
    organizerId: demoOrganizer._id,
    status: EVENT_STATUS.PUBLISHED,
    category: 'Sustainability',
    seatingType: 'GENERAL_ADMISSION',
    isPaid: false,
    ticketPrice: 0,
    currency: 'INR',
    bannerUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1400&q=85',
    image: {
      source: 'URL',
      url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1400&q=85',
      publicId: null
    }
  });

  // Event 9: Others (Goa) — Founders & Creators Beachside Tech Retreat (General Admission, ₹2499)
  await Event.create({
    title: 'Founders & Creators Beachside Tech Retreat',
    description:
      'Three days of unconference-style workshops, fireside chats, pitch reviews, and wellness sessions with venture founders, indie hackers, and product engineers along the Arabian Sea.',
    eventDate: new Date(now + 48 * dayMs),
    venue: 'Grand Hyatt Goa Resort, Bambolim, Goa',
    seatLimit: 90,
    seatsBooked: 0,
    organizerId: demoOrganizer._id,
    status: EVENT_STATUS.PUBLISHED,
    category: 'General',
    seatingType: 'GENERAL_ADMISSION',
    isPaid: true,
    ticketPrice: 2499,
    currency: 'INR',
    bannerUrl: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1400&q=85',
    image: {
      source: 'URL',
      url: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1400&q=85',
      publicId: null
    }
  });

  // Event 10: Cancelled Event — Autonomous Systems & Robotics Forum (Others - Austin)
  await Event.create({
    title: 'Autonomous Systems & Robotics Forum (Cancelled)',
    description:
      'Notice: This symposium has been rescheduled to accommodate global keynote speakers. No new registrations or seat reservations are being accepted at this time.',
    eventDate: new Date(now + 50 * dayMs),
    venue: 'Innovation Pavilion, Hall B, Austin, TX',
    seatLimit: 50,
    seatsBooked: 0,
    organizerId: demoOrganizer._id,
    status: EVENT_STATUS.CANCELLED,
    category: 'Technology',
    seatingType: 'GENERAL_ADMISSION',
    isPaid: false,
    ticketPrice: 0,
    currency: 'INR',
    bannerUrl: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1400&q=85',
    image: {
      source: 'URL',
      url: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1400&q=85',
      publicId: null
    }
  });

  // Event 11: Sold Out Workshop — Advanced High-Throughput Node.js Internals (Bengaluru)
  const eventSoldOut = await Event.create({
    title: 'Advanced High-Throughput Node.js Internals (Sold Out)',
    description:
      'Exclusive intimate laboratory covering libuv thread pool tuning, V8 heap snapshot analysis, zero-copy buffer operations, and garbage collection profiling under sustained 50k req/s load.',
    eventDate: new Date(now + 7 * dayMs),
    venue: 'Indiranagar DevLab, 100 Feet Road, Bengaluru',
    seatLimit: 2,
    seatsBooked: 2,
    organizerId: demoOrganizer._id,
    status: EVENT_STATUS.PUBLISHED,
    category: 'Workshop',
    seatingType: 'GENERAL_ADMISSION',
    isPaid: true,
    ticketPrice: 499,
    currency: 'INR',
    bannerUrl: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1400&q=85',
    image: {
      source: 'URL',
      url: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1400&q=85',
      publicId: null
    }
  });

  // Registrations filling eventSoldOut to capacity
  const regSo1 = await Registration.create({
    eventId: eventSoldOut._id,
    attendeeId: demoAttendee._id,
    status: REGISTRATION_STATUS.CONFIRMED,
    isPaid: true,
    ticketPrice: 499,
    currency: 'INR',
    confirmationEmailSent: true,
    isRedeemed: false
  });
  const bkRefSo1 = `EVT-BK-NDJS-01`;
  await Booking.create({
    bookingReference: bkRefSo1,
    eventId: eventSoldOut._id,
    attendeeId: demoAttendee._id,
    registrationId: regSo1._id,
    ticketCategory: 'WORKSHOP PASS',
    subtotal: 499,
    fees: 0,
    totalAmount: 499,
    currency: 'INR',
    status: BOOKING_STATUS.CONFIRMED,
    ticketToken: generateSignedTicketToken({
      bookingReference: bkRefSo1,
      eventId: eventSoldOut._id,
      attendeeId: demoAttendee._id
    }),
    paymentMethod: 'RAZORPAY',
    confirmedAt: new Date()
  });

  const regSo2 = await Registration.create({
    eventId: eventSoldOut._id,
    attendeeId: demoAttendee2._id,
    status: REGISTRATION_STATUS.CONFIRMED,
    isPaid: true,
    ticketPrice: 499,
    currency: 'INR',
    confirmationEmailSent: true,
    isRedeemed: false
  });
  const bkRefSo2 = `EVT-BK-NDJS-02`;
  await Booking.create({
    bookingReference: bkRefSo2,
    eventId: eventSoldOut._id,
    attendeeId: demoAttendee2._id,
    registrationId: regSo2._id,
    ticketCategory: 'WORKSHOP PASS',
    subtotal: 499,
    fees: 0,
    totalAmount: 499,
    currency: 'INR',
    status: BOOKING_STATUS.CONFIRMED,
    ticketToken: generateSignedTicketToken({
      bookingReference: bkRefSo2,
      eventId: eventSoldOut._id,
      attendeeId: demoAttendee2._id
    }),
    paymentMethod: 'RAZORPAY',
    confirmedAt: new Date()
  });

  // 4. Create in-app notifications
  console.log(`[${label}] Creating initial notification feed...`);
  await Notification.create({
    userId: demoAttendee._id,
    type: NOTIFICATION_TYPE.BOOKING_CONFIRMED,
    channel: NOTIFICATION_CHANNEL.IN_APP,
    title: 'Tickets Confirmed!',
    message: 'Your seats [A1, A2] for "Kolkata Cloud Native & AI Developer Summit 2026" are confirmed. Check your My Tickets tab for your digital pass & QR code.',
    eventId: event1._id,
    registrationId: reg1._id,
    isRead: false
  });

  await Notification.create({
    userId: demoOrganizer._id,
    type: NOTIFICATION_TYPE.BOOKING_CONFIRMED,
    channel: NOTIFICATION_CHANNEL.IN_APP,
    title: 'New Booking Received',
    message: 'Alex Rivera reserved seats [A1, A2] for "Kolkata Cloud Native & AI Developer Summit 2026".',
    eventId: event1._id,
    registrationId: reg1._id,
    isRead: false
  });

  console.log(`[${label}] Seeding complete! Total events created: 11.`);
  await mongoose.disconnect();
  console.log(`[${label}] Disconnected cleanly from MongoDB.\n`);
}

export async function run() {
  const { localUri, remoteUri } = getMongoUris();
  const args = process.argv.slice(2);

  const shouldSeedLocal = args.includes('--local') || args.includes('--both') || (!args.includes('--remote') && !args.includes('--local'));
  const shouldSeedRemote = args.includes('--remote') || args.includes('--both') || (!args.includes('--remote') && !args.includes('--local') && remoteUri);

  if (shouldSeedLocal && localUri) {
    try {
      await seedTargetDatabase(localUri, 'LOCAL MONGODB');
    } catch (err) {
      console.error('[LOCAL MONGODB] Seeding failed:', err.message);
    }
  }

  if (shouldSeedRemote && remoteUri) {
    try {
      await seedTargetDatabase(remoteUri, 'REMOTE MONGODB');
    } catch (err) {
      console.error('[REMOTE MONGODB] Seeding failed:', err.message);
    }
  }

  console.log('====================================================');
  console.log('ALL SEEDING OPERATIONS COMPLETED SUCCESSFULLY');
  console.log('Demo Organizer: organizer@eventora.demo / Organizer@123');
  console.log('Demo Attendee:  attendee@eventora.demo  / Attendee@123');
  console.log('====================================================\n');
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal seeding execution error:', err);
      process.exit(1);
    });
}
