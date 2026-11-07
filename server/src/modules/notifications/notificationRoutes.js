import express from 'express';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllRead
} from './notificationController.js';
import { requireAuth } from '../../shared/middleware/authMiddleware.js';
import { csrfProtection } from '../../shared/middleware/securityMiddleware.js';

const router = express.Router();

router.get('/unread-count', getUnreadCount);

router.use(requireAuth);

router.get('/', getNotifications);
router.patch('/:id/read', csrfProtection, markAsRead);
router.patch('/read-all', csrfProtection, markAllRead);
router.post('/mark-all-read', csrfProtection, markAllRead);

export default router;
