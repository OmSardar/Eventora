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
  markAllNotificationsAsRead
} from '../../src/modules/notifications/notificationService.js';
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_CHANNEL
} from '../../src/shared/constants/status.js';
import { ROLES } from '../../src/shared/constants/roles.js';
import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/connection.js';

describe('In-App Notifications (Integration)', () => {
  let attendeeUser;

  before(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora';
    await connectDatabase(mongoUri);

    attendeeUser = await User.create({
      name: 'Notification Attendee',
      email: `notif_${Date.now()}@example.com`,
      normalizedEmail: `notif_${Date.now()}@example.com`,
      passwordHash: 'dummy_hash',
      role: ROLES.ATTENDEE
    });
  });

  after(async () => {
    if (attendeeUser) {
      await Notification.deleteMany({ userId: attendeeUser._id });
      await User.deleteOne({ _id: attendeeUser._id });
    }
    await disconnectDatabase();
  });

  test('dispatchNotification: creates in-app notification', async () => {
    const notif = await dispatchNotification({
      userId: attendeeUser._id.toString(),
      type: NOTIFICATION_TYPE.BOOKING_CONFIRMED,
      title: 'RSVP Confirmed!',
      message: 'Your seat has been reserved successfully.'
    });

    assert.ok(notif);
    assert.equal(notif.channel, NOTIFICATION_CHANNEL.IN_APP);
    assert.equal(notif.isRead, false);
    assert.equal(notif.status, 'DELIVERED');
  });

  test('getUserNotifications & getUnreadCount: retrieves notifications and unread count', async () => {
    const count = await getUnreadNotificationCount(attendeeUser._id.toString());
    assert.ok(count >= 1);

    const list = await getUserNotifications(attendeeUser._id.toString());
    assert.ok(list.length >= 1);
    assert.equal(list[0].channel, NOTIFICATION_CHANNEL.IN_APP);
  });

  test('markNotificationAsRead: marks single notification as read', async () => {
    const list = await getUserNotifications(attendeeUser._id.toString(), { unreadOnly: true });
    assert.ok(list.length > 0);

    const targetId = list[0]._id;
    const updated = await markNotificationAsRead(targetId, attendeeUser._id.toString());
    assert.equal(updated.isRead, true);
  });

  test('markAllNotificationsAsRead: marks all unread notifications as read', async () => {
    // Dispatch a new unread notification
    await dispatchNotification({
      userId: attendeeUser._id.toString(),
      type: NOTIFICATION_TYPE.SYSTEM_ALERT,
      title: 'Alert',
      message: 'System alert message'
    });

    await markAllNotificationsAsRead(attendeeUser._id.toString());
    const unreadCount = await getUnreadNotificationCount(attendeeUser._id.toString());
    assert.equal(unreadCount, 0);
  });
});
