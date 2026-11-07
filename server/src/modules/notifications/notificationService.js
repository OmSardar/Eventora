import mongoose from 'mongoose';
import { Notification } from './Notification.js';
import { User } from '../users/User.js';
import { NOTIFICATION_TYPE, NOTIFICATION_CHANNEL } from '../../shared/constants/status.js';
import { logger } from '../../infrastructure/logging/logger.js';

/**
 * Dispatches an in-app notification for the user.
 */
export async function dispatchNotification({
  userId,
  type,
  title,
  message,
  eventId = null,
  registrationId = null
}) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      logger.warn({ userId }, 'Notification: User not found for notification dispatch');
      return null;
    }

    const inAppRecord = await Notification.create({
      userId: new mongoose.Types.ObjectId(userId),
      type,
      channel: NOTIFICATION_CHANNEL.IN_APP,
      title,
      message,
      eventId: eventId ? new mongoose.Types.ObjectId(eventId) : null,
      registrationId: registrationId ? new mongoose.Types.ObjectId(registrationId) : null,
      status: 'DELIVERED',
      isRead: false
    });

    return inAppRecord;
  } catch (err) {
    logger.error({ err: err?.message, userId, type }, 'Failed to dispatch in-app notification');
    return null;
  }
}

export async function getUserNotifications(userId, { limit = 20, unreadOnly = false } = {}) {
  const query = { userId: new mongoose.Types.ObjectId(userId), channel: NOTIFICATION_CHANNEL.IN_APP };
  if (unreadOnly) {
    query.isRead = false;
  }

  return Notification.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(100, Math.max(1, Number(limit))))
    .lean();
}

export async function getUnreadNotificationCount(userId) {
  return Notification.countDocuments({
    userId: new mongoose.Types.ObjectId(userId),
    channel: NOTIFICATION_CHANNEL.IN_APP,
    isRead: false
  });
}

export async function markNotificationAsRead(notificationId, userId) {
  return Notification.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(notificationId),
      userId: new mongoose.Types.ObjectId(userId)
    },
    { $set: { isRead: true } },
    { new: true }
  );
}

export async function markAllNotificationsAsRead(userId) {
  return Notification.updateMany(
    {
      userId: new mongoose.Types.ObjectId(userId),
      channel: NOTIFICATION_CHANNEL.IN_APP,
      isRead: false
    },
    { $set: { isRead: true } }
  );
}
