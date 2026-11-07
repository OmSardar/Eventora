import express from 'express';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllRead,
  updatePreferences
} from './notificationController.js';
import { requireAuth } from '../../shared/middleware/authMiddleware.js';
import { csrfProtection } from '../../shared/middleware/securityMiddleware.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/:id/read', csrfProtection, markAsRead);
router.post('/mark-all-read', csrfProtection, markAllRead);
router.patch('/preferences', csrfProtection, updatePreferences);

export default router;
