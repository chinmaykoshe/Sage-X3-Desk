import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { sendEmailNotification } from '../utils/email.js';

let ioInstance = null;
const userSockets = new Map();

export function setSocketIO(io) {
  ioInstance = io;
}

export function registerUserSocket(userId, socketId) {
  const key = String(userId);
  if (!userSockets.has(key)) {
    userSockets.set(key, new Set());
  }
  userSockets.get(key).add(socketId);
}

export function unregisterUserSocket(userId, socketId) {
  const key = String(userId);
  const set = userSockets.get(key);
  if (set) {
    set.delete(socketId);
    if (set.size === 0) userSockets.delete(key);
  }
}

export function emitToUser(userId, event, payload) {
  if (!ioInstance || !userId) return;
  ioInstance.to(`user:${String(userId)}`).emit(event, payload);
}

export function emitBroadcast(event, payload) {
  if (!ioInstance) return;
  ioInstance.emit(event, payload);
}

/**
 * Creates persistent notifications for one or more recipients and emits via Socket.IO.
 */
export async function notifyUsers({
  recipientIds = [],
  actorId = null,
  type,
  title,
  message,
  link = '',
  entityType = '',
  entityId = null,
  sendEmail = false,
}) {
  const uniqueIds = [...new Set(recipientIds.filter(Boolean).map(String))].filter(
    (id) => !actorId || id !== String(actorId)
  );
  if (uniqueIds.length === 0) return [];

  const docs = await Notification.insertMany(
    uniqueIds.map((recipient) => ({
      recipient,
      actor: actorId,
      type,
      title,
      message,
      link,
      entityType,
      entityId,
    }))
  );

  for (const doc of docs) {
    emitToUser(doc.recipient, 'notification:new', doc);
  }

  if (sendEmail) {
    const users = await User.find({ _id: { $in: uniqueIds }, 'preferences.emailNotifications': true })
      .select('email fullName')
      .lean();
    for (const u of users) {
      await sendEmailNotification({
        to: u.email,
        subject: `[Sage X3 Desk] ${title}`,
        text: `${message}\n\nOpen in Sage X3 Desk.`,
      });
    }
  }

  return docs;
}
