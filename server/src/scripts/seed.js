import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { User } from '../modules/users/User.js';
import { Event } from '../modules/events/Event.js';
import { Registration } from '../modules/registrations/Registration.js';
import { Payment } from '../modules/payments/Payment.js';
import { Notification } from '../modules/notifications/Notification.js';
import { hashPassword } from '../infrastructure/security/password.js';
import { ROLES } from '../shared/constants/roles.js';
import {
  EVENT_STATUS,
  REGISTRATION_STATUS,
  PAYMENT_STATUS,
  NOTIFICATION_TYPE,
  NOTIFICATION_CHANNEL
} from '../shared/constants/status.js';
import { connectDatabase, disconnectDatabase } from '../infrastructure/database/connection.js';

export async function seedDatabase() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora';
  console.log(`Connecting to MongoDB at: ${mongoUri}...`);
  await connectDatabase(mongoUri);

  console.log('Clearing existing collections (users, events, registrations, payments, notifications)...');
  await User.deleteMany({});
  await Event.deleteMany({});
  await Registration.deleteMany({});
  await Payment.deleteMany({});
  await Notification.deleteMany({});

  console.log('Creating demo users...');
  const organizerPasswordHash = await hashPassword('Organizer@123');
  const attendeePasswordHash = await hashPassword('Attendee@123');

  const demoOrganizer = await User.create({
    name: 'Sarah Chen (Demo Organizer)',
    email: 'organizer@eventora.demo',
    normalizedEmail: 'organizer@eventora.demo',
    passwordHash: organizerPasswordHash,
    role: ROLES.ORGANIZER,
    phone: '919876543210',
    smsConsent: true
  });

  const demoAttendee = await User.create({
    name: 'Alex Rivera (Demo Attendee)',
    email: 'attendee@eventora.demo',
    normalizedEmail: 'attendee@eventora.demo',
    passwordHash: attendeePasswordHash,
    role: ROLES.ATTENDEE,
    phone: '919876543211',
    smsConsent: true,
    notificationPreferences: {
      sms: true,
      inApp: true,
      email: false
    }
  });

  const demoAttendee2 = await User.create({
    name: 'Elena Rostova',
    email: 'elena@eventora.demo',
    normalizedEmail: 'elena@eventora.demo',
    passwordHash: attendeePasswordHash,
    role: ROLES.ATTENDEE,
    phone: '919876543212',
    smsConsent: false
  });

  console.log('Creating sample events...');
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // 1. Featured Upcoming Paid Tech Conference
  const event1 = await Event.create({
    title: 'Global Tech Summit 2026',
    description:
      'Join industry pioneers, AI researchers, and engineering leaders for 3 days of deep-dive keynotes, hands-on workshops, and collaborative panels on modern distributed systems.',
    eventDate: new Date(now + 14 * dayMs),
    venue: 'Metropolitan Convention Center, Hall A, San Francisco, CA',
    seatLimit: 150,
    seatsBooked: 2,
    isPaid: true,
    ticketPrice: 499,
    currency: 'INR',
    organizerId: demoOrganizer._id,
    status: EVENT_STATUS.PUBLISHED,
    category: 'Technology',
    bannerUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80'
  });

  // 2. Next-Gen Design & UX Symposium (Free Event)
  const event2 = await Event.create({
    title: 'Future of Product Design & Craft',
    description:
      'A curated gathering of digital product designers, design systems architects, and creative directors exploring minimalism, spatial interfaces, and user-centric aesthetics.',
    eventDate: new Date(now + 21 * dayMs),
    venue: 'Design Loft Studio, New York, NY',
    seatLimit: 50,
    seatsBooked: 0,
    isPaid: false,
    ticketPrice: 0,
    currency: 'INR',
    organizerId: demoOrganizer._id,
    status: EVENT_STATUS.PUBLISHED,
    category: 'Design',
    bannerUrl: 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1200&q=80'
  });

  // 3. Sold Out Intimate Workshop (Paid)
  const eventSoldOut = await Event.create({
    title: 'Advanced High-Throughput Node.js Masterclass',
    description:
      'Exclusive hands-on deep dive into Node.js event loop internals, V8 memory profiling, and high-concurrency architecture. Limited to 2 seats.',
    eventDate: new Date(now + 7 * dayMs),
    venue: 'TechHub Accelerator Room 402, Austin, TX',
    seatLimit: 2,
    seatsBooked: 2,
    isPaid: true,
    ticketPrice: 1499,
    currency: 'INR',
    organizerId: demoOrganizer._id,
    status: EVENT_STATUS.PUBLISHED,
    category: 'Workshop',
    bannerUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80'
  });

  // 4. Cancelled Event
  const eventCancelled = await Event.create({
    title: 'Autonomous Systems & Robotics Forum (Cancelled)',
    description: 'Notice: This session has been rescheduled. No new registrations are being accepted at this time.',
    eventDate: new Date(now + 30 * dayMs),
    venue: 'Innovation Pavillion, Seattle, WA',
    seatLimit: 100,
    seatsBooked: 0,
    isPaid: true,
    ticketPrice: 299,
    currency: 'INR',
    organizerId: demoOrganizer._id,
    status: EVENT_STATUS.CANCELLED,
    category: 'Technology',
    bannerUrl: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1200&q=80'
  });

  // 5. Sustainable Energy & Climate Tech Meetup (Free)
  const event3 = await Event.create({
    title: 'Clean Energy & Climate Innovation Roundtable',
    description:
      'Connecting founders, climate scientists, and venture partners building scalable infrastructure for renewable grids and carbon removal technology.',
    eventDate: new Date(now + 10 * dayMs),
    venue: 'Greenhouse Commons, Denver, CO',
    seatLimit: 80,
    seatsBooked: 0,
    isPaid: false,
    ticketPrice: 0,
    currency: 'INR',
    organizerId: demoOrganizer._id,
    status: EVENT_STATUS.PUBLISHED,
    category: 'Sustainability',
    bannerUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80'
  });

  console.log('Creating initial registrations and payments...');
  // 1. Paid registration for demoAttendee on event1
  const payment1 = await Payment.create({
    attendeeId: demoAttendee._id,
    eventId: event1._id,
    orderId: 'order_demo_seed_001',
    paymentId: 'pay_demo_seed_001',
    amount: 49900,
    currency: 'INR',
    status: PAYMENT_STATUS.CAPTURED,
    method: 'upi',
    idempotencyKey: 'seed_key_001'
  });

  const reg1 = await Registration.create({
    eventId: event1._id,
    attendeeId: demoAttendee._id,
    paymentId: payment1._id,
    isPaid: true,
    ticketPrice: 499,
    currency: 'INR',
    status: REGISTRATION_STATUS.CONFIRMED
  });

  payment1.registrationId = reg1._id;
  await payment1.save();

  // 2. Paid registration for demoAttendee2 on event1
  const payment2 = await Payment.create({
    attendeeId: demoAttendee2._id,
    eventId: event1._id,
    orderId: 'order_demo_seed_002',
    paymentId: 'pay_demo_seed_002',
    amount: 49900,
    currency: 'INR',
    status: PAYMENT_STATUS.CAPTURED,
    method: 'card',
    idempotencyKey: 'seed_key_002'
  });

  const reg2 = await Registration.create({
    eventId: event1._id,
    attendeeId: demoAttendee2._id,
    paymentId: payment2._id,
    isPaid: true,
    ticketPrice: 499,
    currency: 'INR',
    status: REGISTRATION_STATUS.CONFIRMED
  });

  payment2.registrationId = reg2._id;
  await payment2.save();

  // 3. Registrations for sold-out event
  await Registration.create({
    eventId: eventSoldOut._id,
    attendeeId: demoAttendee._id,
    isPaid: true,
    ticketPrice: 1499,
    currency: 'INR',
    status: REGISTRATION_STATUS.CONFIRMED
  });

  await Registration.create({
    eventId: eventSoldOut._id,
    attendeeId: demoAttendee2._id,
    isPaid: true,
    ticketPrice: 1499,
    currency: 'INR',
    status: REGISTRATION_STATUS.CONFIRMED
  });

  console.log('Creating initial notifications...');
  await Notification.create({
    userId: demoAttendee._id,
    type: NOTIFICATION_TYPE.BOOKING_CONFIRMED,
    channel: NOTIFICATION_CHANNEL.IN_APP,
    title: 'Welcome to Eventora!',
    message: 'Your ticket for "Global Tech Summit 2026" is confirmed. See you there!',
    eventId: event1._id,
    registrationId: reg1._id,
    isRead: false
  });

  await Notification.create({
    userId: demoOrganizer._id,
    type: NOTIFICATION_TYPE.PAYMENT_SUCCESS,
    channel: NOTIFICATION_CHANNEL.IN_APP,
    title: 'Ticket Purchased',
    message: 'Alex Rivera purchased a ticket for "Global Tech Summit 2026" (₹499.00).',
    eventId: event1._id,
    registrationId: reg1._id,
    isRead: false
  });

  console.log('Seeding completed successfully!');
  console.log('----------------------------------------------------');
  console.log('Demo Organizer: organizer@eventora.demo / Organizer@123');
  console.log('Demo Attendee:  attendee@eventora.demo / Attendee@123');
  console.log('----------------------------------------------------');

  await disconnectDatabase();
}

if (process.argv[1].endsWith('seed.js')) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seeding error:', err);
      process.exit(1);
    });
}
