import Notification from '../models/Notification.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import AppError from '../utils/AppError.js';

export const getNotifications = asyncHandler(async (req, res) => {
  const filter = { recipient: req.user._id };
  if (req.query.unreadOnly === 'true') {
    filter.isRead = false;
  }

  const [items, unreadCount] = await Promise.all([
    Notification.find(filter)
      .populate('actor', 'fullName avatarColor')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    Notification.countDocuments({ recipient: req.user._id, isRead: false }),
  ]);

  return sendSuccess(res, { items, unreadCount }, 'Notifications retrieved');
});

export const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user._id },
    { isRead: true, readAt: new Date() },
    { new: true }
  );
  if (!notification) throw new AppError('Notification not found.', 404);
  return sendSuccess(res, notification, 'Notification marked as read');
});

export const markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { recipient: req.user._id, isRead: false },
    { isRead: true, readAt: new Date() }
  );
  return sendSuccess(res, null, 'All notifications marked as read');
});
