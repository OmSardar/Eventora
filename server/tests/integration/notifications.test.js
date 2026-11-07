import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { User } from '../../src/modules/users/User.js';
import { Notification } from '../../src/modules/notifications/Notification.js';
import {
  dispatchNotification,
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  updateUserNotificationPreferences
} from '../../src/modules/notifications/notificationService.js';
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_CHANNEL
} from '../../src/shared/constants/status.js';
import { ROLES } from '../../src/shared/constants/roles.js';
import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/connection.js';

describe('Transactional Notifications (Integration)', () => {
  let attendeeWithConsent;
  let attendeeWithoutConsent;

  before(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora';
    await connectDatabase(mongoUri);

    attendeeWithConsent = await User.create({
      name: 'Consent Attendee',
      email: `consent_${Date.now()}@example.com`,
      normalizedEmail: `consent_${Date.now()}@example.com`,
      passwordHash: 'dummy_hash',
      role: ROLES.ATTENDEE,
      phone: '919876543299',
      smsConsent: true
    });

    attendeeWithoutConsent = await User.create({
      name: 'No Consent Attendee',
      email: `noconsent_${Date.now()}@example.com`,
      normalizedEmail: `noconsent_${Date.now()}@example.com`,
      passwordHash: 'dummy_hash',
      role: ROLES.ATTENDEE,
      phone: '',
      smsConsent: false
    });
  });

  after(async () => {
    await Notification.deleteMany({
      userId: { $in: [attendeeWithConsent._id, attendeeWithoutConsent._id] }
    });
    await User.deleteMany({
      _id: { $in: [attendeeWithConsent._id, attendeeWithoutConsent._id] }
    });
    await disconnectDatabase();
  });

  test('dispatchNotification: creates in-app notification and dispatches SMS when consent is granted', async () => {
    const notif = await dispatchNotification({
      userId: attendeeWithConsent._id.toString(),
      type: NOTIFICATION_TYPE.BOOKING_CONFIRMED,
      title: 'Booking Confirmed!',
      message: 'Your seat has been reserved successfully.'
    });

    assert.ok(notif);
    assert.equal(notif.channel, NOTIFICATION_CHANNEL.IN_APP);
    assert.equal(notif.isRead, false);

    // Wait a brief moment for async SMS dispatch promise to settle
    await new Promise((r) => setTimeout(r, 100));

    // Verify SMS notification record exists
    const smsNotif = await Notification.findOne({
      userId: attendeeWithConsent._id,
      channel: NOTIFICATION_CHANNEL.SMS
    });
    assert.ok(smsNotif);
    assert.equal(smsNotif.status, 'DELIVERED');
  });

  test('dispatchNotification: skips SMS channel when phone or consent is missing', async () => {
    const notif = await dispatchNotification({
      userId: attendeeWithoutConsent._id.toString(),
      type: NOTIFICATION_TYPE.BOOKING_CONFIRMED,
      title: 'Booking Confirmed!',
      message: 'Your seat has been reserved.'
    });

    assert.ok(notif);
    assert.equal(notif.channel, NOTIFICATION_CHANNEL.IN_APP);

    await new Promise((r) => setTimeout(r, 100));

    const smsNotif = await Notification.findOne({
      userId: attendeeWithoutConsent._id,
      channel: NOTIFICATION_CHANNEL.SMS
    });
    assert.equal(smsNotif, null, 'No SMS should be sent to user without consent');
  });

  test('getUserNotifications & getUnreadCount: retrieves user notifications and unread count', async () => {
    const count = await getUnreadNotificationCount(attendeeWithConsent._id.toString());
    assert.ok(count >= 1);

    const list = await getUserNotifications(attendeeWithConsent._id.toString());
    assert.ok(list.length >= 1);
    assert.equal(list[0].channel, NOTIFICATION_CHANNEL.IN_APP);
  });

  test('markNotificationAsRead: marks single notification as read', async () => {
    const list = await getUserNotifications(attendeeWithConsent._id.toString(), { unreadOnly: true });
    assert.ok(list.length > 0);

    const targetId = list[0]._id;
    const updated = await markNotificationAsRead(targetId, attendeeWithConsent._id.toString());
    assert.equal(updated.isRead, true);
  });

  test('markAllNotificationsAsRead: marks all unread notifications as read', async () => {
    await markAllNotificationsAsRead(attendeeWithConsent._id.toString());
    const unreadCount = await getUnreadNotificationCount(attendeeWithConsent._id.toString());
    assert.equal(unreadCount, 0);
  });

  test('updateUserNotificationPreferences: updates mobile number and notification preferences', async () => {
    const updatedUser = await updateUserNotificationPreferences(attendeeWithoutConsent._id.toString(), {
      phone: '9876543290',
      smsConsent: true,
      preferences: {
        sms: true,
        inApp: true
      }
    });

    assert.equal(updatedUser.phone, '9876543290');
    assert.equal(updatedUser.smsConsent, true);
    assert.equal(updatedUser.notificationPreferences.sms, true);
  });
});

