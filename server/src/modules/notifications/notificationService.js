import mongoose from 'mongoose';
import { Notification } from './Notification.js';
import { User } from '../users/User.js';
import { NOTIFICATION_TYPE, NOTIFICATION_CHANNEL } from '../../shared/constants/status.js';
import { sendMsg91Sms } from './providers/msg91Provider.js';
import { logger } from '../../infrastructure/logging/logger.js';

function getTemplateIdForType(type) {
  switch (type) {
    case NOTIFICATION_TYPE.BOOKING_CONFIRMED:
      return process.env.MSG91_TEMPLATE_ID_BOOKING || 'template_booking_default';
    case NOTIFICATION_TYPE.PAYMENT_SUCCESS:
    case NOTIFICATION_TYPE.PAYMENT_FAILED:
      return process.env.MSG91_TEMPLATE_ID_PAYMENT || 'template_payment_default';
    case NOTIFICATION_TYPE.CANCELLATION_REQUESTED:
    case NOTIFICATION_TYPE.CANCELLATION_APPROVED:
    case NOTIFICATION_TYPE.CANCELLATION_REJECTED:
      return process.env.MSG91_TEMPLATE_ID_CANCELLATION || 'template_cancellation_default';
    case NOTIFICATION_TYPE.REFUND_INITIATED:
    case NOTIFICATION_TYPE.REFUND_PROCESSED:
    case NOTIFICATION_TYPE.REFUND_FAILED:
      return process.env.MSG91_TEMPLATE_ID_REFUND || 'template_refund_default';
    default:
      return null;
  }
}

/**
 * Dispatches an event-driven transactional notification.
 * Always records in-app notification; dispatches SMS if user has provided phone and consent.
 */
export async function dispatchNotification({
  userId,
  type,
  title,
  message,
  eventId = null,
  registrationId = null,
  paymentId = null,
  variables = {}
}) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      logger.warn({ userId }, 'Notification: User not found for notification dispatch');
      return null;
    }

    // 1. Create durable in-app notification
    const inAppRecord = await Notification.create({
      userId: new mongoose.Types.ObjectId(userId),
      type,
      channel: NOTIFICATION_CHANNEL.IN_APP,
      title,
      message,
      eventId: eventId ? new mongoose.Types.ObjectId(eventId) : null,
      registrationId: registrationId ? new mongoose.Types.ObjectId(registrationId) : null,
      paymentId: paymentId ? new mongoose.Types.ObjectId(paymentId) : null,
      status: 'DELIVERED',
      isRead: false
    });

    // 2. Dispatch transactional SMS if consent is granted and phone is present
    const hasSmsConsent = user.smsConsent && user.notificationPreferences?.sms !== false;
    if (user.phone && hasSmsConsent) {
      const templateId = getTemplateIdForType(type);
      if (templateId) {
        // Fire-and-forget outbox pattern: SMS dispatch does not block the caller
        sendMsg91Sms({
          mobile: user.phone,
          templateId,
          variables: {
            name: user.name,
            message,
            ...variables
          }
        })
          .then(async (smsResult) => {
            await Notification.create({
              userId: new mongoose.Types.ObjectId(userId),
              type,
              channel: NOTIFICATION_CHANNEL.SMS,
              title,
              message,
              eventId: eventId ? new mongoose.Types.ObjectId(eventId) : null,
              registrationId: registrationId ? new mongoose.Types.ObjectId(registrationId) : null,
              paymentId: paymentId ? new mongoose.Types.ObjectId(paymentId) : null,
              status: smsResult.success ? 'DELIVERED' : 'FAILED',
              providerRef: smsResult.providerRef || null,
              failureReason: smsResult.reason || null
            });
          })
          .catch((err) => {
            logger.error({ err: err?.message, userId }, 'Async SMS notification dispatch error');
          });
      }
    }

    return inAppRecord;
  } catch (err) {
    logger.error({ err: err?.message, userId, type }, 'Failed to dispatch notification');
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

export async function updateUserNotificationPreferences(userId, { phone, smsConsent, preferences }) {
  const update = {};
  if (phone !== undefined) update.phone = phone.trim();
  if (smsConsent !== undefined) update.smsConsent = Boolean(smsConsent);
  if (preferences) {
    if (preferences.sms !== undefined) update['notificationPreferences.sms'] = Boolean(preferences.sms);
    if (preferences.inApp !== undefined) update['notificationPreferences.inApp'] = Boolean(preferences.inApp);
    if (preferences.email !== undefined) update['notificationPreferences.email'] = Boolean(preferences.email);
  }

  return User.findByIdAndUpdate(userId, { $set: update }, { new: true });
}
