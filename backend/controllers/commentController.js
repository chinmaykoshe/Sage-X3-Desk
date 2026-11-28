import Comment from '../../db/models/Comment.js';
import Ticket from '../../db/models/Ticket.js';
import Task from '../../db/models/Task.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { recordActivity } from '../services/activityService.js';
import { notifyTicketStakeholders, notifyUsers, emitBroadcast } from '../services/notificationService.js';
import { ROLES } from '../config/constants.js';

export const getComments = asyncHandler(async (req, res) => {
  const { entityType, entityId } = req.query;
  const filter = { isDeleted: false };
  if (entityType) filter.entityType = entityType;
  if (entityId) filter.entityId = entityId;

  const comments = await Comment.find(filter)
    .populate('author', 'fullName designation role avatarColor')
    .populate('mentions', 'fullName')
    .populate('attachments')
    .sort({ createdAt: 1 })
    .lean();

  return sendSuccess(res, comments, 'Comments retrieved');
});

export const createComment = asyncHandler(async (req, res) => {
  const { entityType, entityId, parentComment, body, isInternal, mentions } = req.validatedBody;
  const comment = await Comment.create({
    entityType,
    entityId,
    parentComment: parentComment || null,
    author: req.user._id,
    body,
    isInternal,
    mentions,
  });

  let client = null;
  let ticket = null;
  let ticketObj = null;
  let entityRef = '';
  let notifyIds = [...mentions];

  if (entityType === 'ticket') {
    const t = await Ticket.findById(entityId).select('ticketId title client assignedDevelopers assignedTeamLead createdBy');
    if (t) {
      ticketObj = t;
      client = t.client;
      ticket = t._id;
      entityRef = t.ticketId;
      notifyIds.push(...(t.assignedDevelopers || []), t.assignedTeamLead, t.createdBy);
    }
  } else if (entityType === 'task') {
    const t = await Task.findById(entityId).select('taskId client ticket assignedEmployees createdBy');
    if (t) {
      client = t.client;
      ticket = t.ticket;
      entityRef = t.taskId;
      notifyIds.push(...(t.assignedEmployees || []), t.createdBy);
    }
  }

  await recordActivity({
    actor: req.user._id,
    action: 'COMMENT_ADDED',
    entityType,
    entityId,
    entityRef,
    client,
    ticket,
    summary: `Added ${isInternal ? 'internal note' : 'client-visible comment'} on ${entityRef || entityType}`,
  });

  if (ticketObj) {
    await notifyTicketStakeholders({
      ticket: ticketObj,
      actorId: req.user._id,
      type: mentions.length > 0 ? 'mention' : 'comment_added',
      title: `Comment on ${ticketObj.ticketId}`,
      message: `${req.user.fullName} commented on "${ticketObj.title}": "${body.slice(0, 100)}${body.length > 100 ? '...' : ''}"`,
      link: `/tickets/${ticketObj._id}`,
      includeActor: false,
    });
  } else {
    await notifyUsers({
      recipientIds: notifyIds,
      actorId: req.user._id,
      type: mentions.length > 0 ? 'mention' : 'comment_added',
      title: `New comment on ${entityRef || entityType}`,
      message: `${req.user.fullName}: "${body.slice(0, 100)}${body.length > 100 ? '...' : ''}"`,
      link: entityType === 'task' ? '/my-tasks' : '/',
      entityType,
      entityId,
    });
  }

  const populated = await Comment.findById(comment._id)
    .populate('author', 'fullName designation role avatarColor')
    .populate('mentions', 'fullName');

  emitBroadcast('comment:added', { entityType, entityId, comment: populated });
  return sendSuccess(res, populated, 'Comment added', 201);
});

export const updateComment = asyncHandler(async (req, res) => {
  const comment = await Comment.findOne({ _id: req.params.id, isDeleted: false });
  if (!comment) throw new AppError('Comment not found.', 404);
  if (String(comment.author) !== String(req.user._id) && req.user.role !== ROLES.ADMIN) {
    throw new AppError('You can only edit your own comments.', 403);
  }
  comment.body = req.validatedBody.body;
  if (req.validatedBody.isInternal !== undefined) {
    comment.isInternal = req.validatedBody.isInternal;
  }
  comment.editedAt = new Date();
  await comment.save();

  const populated = await Comment.findById(comment._id)
    .populate('author', 'fullName designation role avatarColor')
    .populate('mentions', 'fullName');
  return sendSuccess(res, populated, 'Comment updated');
});

export const deleteComment = asyncHandler(async (req, res) => {
  const comment = await Comment.findOne({ _id: req.params.id, isDeleted: false });
  if (!comment) throw new AppError('Comment not found.', 404);
  if (String(comment.author) !== String(req.user._id) && ![ROLES.ADMIN, ROLES.TEAM_LEAD].includes(req.user.role)) {
    throw new AppError('You do not have permission to delete this comment.', 403);
  }
  comment.isDeleted = true;
  await comment.save();
  return sendSuccess(res, null, 'Comment deleted');
});
