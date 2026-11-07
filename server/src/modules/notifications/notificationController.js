import {
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead
} from './notificationService.js';
import { NotFoundError } from '../../shared/errors/AppError.js';

export async function getNotifications(req, res, next) {
  try {
    const notifications = await getUserNotifications(req.session.userId, {
      limit: req.query.limit,
      unreadOnly: req.query.unread === 'true'
    });
    const unreadCount = await getUnreadNotificationCount(req.session.userId);

    res.status(200).json({
      success: true,
      data: {
        notifications,
        unreadCount
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function getUnreadCount(req, res, next) {
  try {
    if (!req.session?.userId) {
      return res.status(200).json({
        success: true,
        data: { unreadCount: 0 }
      });
    }
    const unreadCount = await getUnreadNotificationCount(req.session.userId);
    res.status(200).json({
      success: true,
      data: { unreadCount }
    });
  } catch (error) {
    next(error);
  }
}

export async function markAsRead(req, res, next) {
  try {
    const notification = await markNotificationAsRead(req.params.id, req.session.userId);
    if (!notification) {
      throw new NotFoundError('Notification not found.');
    }
    res.status(200).json({
      success: true,
      data: { notification }
    });
  } catch (error) {
    next(error);
  }
}

export async function markAllRead(req, res, next) {
  try {
    await markAllNotificationsAsRead(req.session.userId);
    res.status(200).json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    next(error);
  }
}
