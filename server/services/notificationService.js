import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { ROLES } from '../config/constants.js';

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
 * Creates persistent in-app Inbox notifications for one or more recipients and emits via Socket.IO.
 * Mailer notifications are intentionally disabled; all updates flow to the in-app Inbox Updates feed.
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
  includeActor = false,
}) {
  const uniqueIds = [...new Set(recipientIds.filter(Boolean).map(String))].filter(
    (id) => includeActor || !actorId || id !== String(actorId)
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

  return docs;
}

/**
 * Notifies the ticket creator, assigned developers, assigned Team Lead, and all active TLs & Admins
 * via the in-app Inbox Updates section with a direct redirect link.
 */
export async function notifyTicketStakeholders({
  ticket,
  actorId = null,
  type = 'ticket_updated',
  title,
  message,
  link = '',
  includeActor = true,
}) {
  if (!ticket) return [];
  const managers = await User.find({
    role: { $in: [ROLES.ADMIN, ROLES.TEAM_LEAD] },
    isDeleted: false,
    status: 'Active',
  })
    .select('_id')
    .lean();

  const recipientIds = [
    ticket.createdBy,
    ...(ticket.assignedDevelopers || []),
    ticket.assignedTeamLead,
    ...managers.map((m) => m._id),
  ];

  return notifyUsers({
    recipientIds,
    actorId,
    type,
    title,
    message,
    link: link || `/tickets/${ticket._id}`,
    entityType: 'ticket',
    entityId: ticket._id,
    includeActor,
  });
}
