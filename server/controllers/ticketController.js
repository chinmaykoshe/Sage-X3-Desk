import Ticket from '../models/Ticket.js';
import Task from '../models/Task.js';
import Comment from '../models/Comment.js';
import Attachment from '../models/Attachment.js';
import ActivityLog from '../models/ActivityLog.js';
import TimeLog from '../models/TimeLog.js';
import Deployment from '../models/Deployment.js';
import ApprovalHistory from '../models/ApprovalHistory.js';
import DevelopmentActivity from '../models/DevelopmentActivity.js';
import { ROLES } from '../config/constants.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, buildPagination, buildPaginationMeta } from '../utils/response.js';
import {
  createTicketService,
  changeTicketStatusService,
  assignTicketService,
  reorderTicketService,
  duplicateTicketService,
  bulkTicketActionService,
  approvePendingTicketService,
  rejectPendingTicketService,
  requestPendingTicketChangesService,
} from '../services/ticketService.js';
import { emitBroadcast, notifyTicketStakeholders } from '../services/notificationService.js';
import { recordActivity } from '../services/activityService.js';
import { recordAudit } from '../services/auditService.js';

export const getTickets = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query);
  const {
    search,
    client,
    developer,
    priority,
    status,
    category,
    project,
    assignment,
    highPriority,
    startDate,
    endDate,
    overdueOnly,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  // Main operational ticket queue contains ONLY approved tickets
  const filter = { isDeleted: false, approvalStatus: 'APPROVED' };

  // Developers can view their assigned/created tickets, or filter specifically when requested
  if (req.user.role === ROLES.DEVELOPER && req.query.scope !== 'all') {
    filter.$or = [{ assignedDevelopers: req.user._id }, { createdBy: req.user._id }];
  }

  if (client) filter.client = client;
  if (developer) filter.assignedDevelopers = developer;
  if (assignment === 'unassigned') filter.assignedDevelopers = { $size: 0 };
  if (assignment === 'assigned') filter['assignedDevelopers.0'] = { $exists: true };
  if (priority) filter.priority = priority;
  else if (highPriority === 'true') filter.priority = { $in: ['Critical', 'High'] };
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (project) filter.project = project;

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  if (overdueOnly === 'true') {
    filter.dueDate = { $lt: new Date() };
    filter.status = { $nin: ['Resolved', 'Closed'] };
  }

  if (search) {
    const searchFilter = [
      { ticketId: { $regex: search, $options: 'i' } },
      { title: { $regex: search, $options: 'i' } },
      { folderCode: { $regex: search, $options: 'i' } },
    ];
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: searchFilter }];
      delete filter.$or;
    } else {
      filter.$or = searchFilter;
    }
  }

  const allowedSortFields = ['createdAt', 'updatedAt', 'dueDate', 'priority', 'status', 'ticketId', 'sortOrder'];
  const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'sortOrder';
  const sortDir = sortOrder === 'asc' ? 1 : -1;

  const [tickets, total] = await Promise.all([
    Ticket.find(filter)
      .populate('client', 'clientId companyName clientFolderCode')
      .populate('project', 'projectId name')
      .populate('assignedDevelopers', 'fullName designation avatarColor')
      .populate('assignedTeamLead', 'fullName designation')
      .sort({ [sortField]: sortDir, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Ticket.countDocuments(filter),
  ]);

  const ticketIds = tickets.map((t) => t._id);
  const [taskCounts, commentCounts, attachmentCounts] = await Promise.all([
    Task.aggregate([
      { $match: { ticket: { $in: ticketIds }, isDeleted: false } },
      {
        $group: {
          _id: '$ticket',
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
        },
      },
    ]),
    Comment.aggregate([
      { $match: { entityType: 'ticket', entityId: { $in: ticketIds }, isDeleted: false } },
      { $group: { _id: '$entityId', count: { $sum: 1 } } },
    ]),
    Attachment.aggregate([
      { $match: { entityType: 'ticket', entityId: { $in: ticketIds }, isDeleted: false } },
      { $group: { _id: '$entityId', count: { $sum: 1 } } },
    ]),
  ]);
  const taskMap = new Map(taskCounts.map((t) => [String(t._id), t]));
  const commentMap = new Map(commentCounts.map((c) => [String(c._id), c.count]));
  const attachMap = new Map(attachmentCounts.map((a) => [String(a._id), a.count]));

  const now = new Date();
  const enriched = tickets.map((t) => {
    const tc = taskMap.get(String(t._id)) || { total: 0, completed: 0 };
    const isOverdue = Boolean(t.dueDate && new Date(t.dueDate) < now && !['Resolved', 'Closed'].includes(t.status));
    return {
      ...t,
      isOverdue,
      taskSummary: tc,
      commentCount: commentMap.get(String(t._id)) || 0,
      attachmentCount: attachMap.get(String(t._id)) || 0,
    };
  });

  return sendSuccess(res, enriched, 'Tickets retrieved', 200, buildPaginationMeta(total, page, limit));
});

export const createTicket = asyncHandler(async (req, res) => {
  const ticket = await createTicketService(req.validatedBody, req.user);
  const populated = await Ticket.findById(ticket._id)
    .populate('client', 'clientId companyName clientFolderCode')
    .populate('assignedDevelopers', 'fullName designation avatarColor')
    .populate('assignedTeamLead', 'fullName')
    .populate('approvedBy', 'fullName role');
  const msg =
    populated.approvalStatus === 'APPROVED'
      ? `Ticket ${populated.ticketId} created & auto-approved into main queue`
      : `Ticket ${populated.ticketId} submitted for Team Lead approval`;
  return sendSuccess(res, populated, msg, 201);
});

export const getPendingApprovalTickets = asyncHandler(async (req, res) => {
  const { status = 'PENDING_APPROVAL' } = req.query;
  const filter = { isDeleted: false };
  if (status !== 'All') filter.approvalStatus = status;
  else filter.approvalStatus = { $in: ['PENDING_APPROVAL', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED'] };

  if (req.user.role === ROLES.DEVELOPER) {
    filter.createdBy = req.user._id;
  }

  const tickets = await Ticket.find(filter)
    .populate('client', 'clientId companyName clientFolderCode')
    .populate('createdBy', 'fullName email role designation avatarColor')
    .populate('approvedBy', 'fullName role')
    .sort({ createdAt: -1 })
    .lean();

  return sendSuccess(res, tickets, 'Pending approval tickets retrieved');
});

export const approveTicket = asyncHandler(async (req, res) => {
  const ticket = await approvePendingTicketService(req.params.id, req.body || {}, req.user);
  return sendSuccess(res, ticket, `Approved and published as ${ticket.ticketId}`);
});

export const rejectTicket = asyncHandler(async (req, res) => {
  const ticket = await rejectPendingTicketService(req.params.id, req.body || {}, req.user);
  return sendSuccess(res, ticket, `Ticket ${ticket.ticketId} rejected`);
});

export const requestTicketChanges = asyncHandler(async (req, res) => {
  const ticket = await requestPendingTicketChangesService(req.params.id, req.body || {}, req.user);
  return sendSuccess(res, ticket, `Changes requested for ${ticket.ticketId}`);
});

export const getTicketApprovalHistory = asyncHandler(async (req, res) => {
  const history = await ApprovalHistory.find({ ticketId: req.params.id })
    .populate('performedBy', 'fullName email role')
    .populate('creatorId', 'fullName email role')
    .sort({ timestamp: -1 })
    .lean();
  return sendSuccess(res, history, 'Ticket approval history retrieved');
});

export const getTicketById = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findOne({ _id: req.params.id, isDeleted: false })
    .populate('client', 'clientId companyName clientFolderCode pilotFolderCode productionFolderCode sageX3Version')
    .populate('project', 'projectId name status')
    .populate('assignedDevelopers', 'employeeId fullName email designation avatarColor')
    .populate('assignedTeamLead', 'fullName email designation')
    .populate('createdBy', 'fullName designation')
    .populate('waivedBy', 'fullName')
    .populate('statusHistory.changedBy', 'fullName designation')
    .lean();

  if (!ticket) throw new AppError('Ticket not found.', 404);

  const [tasks, comments, attachments, activityLogs, timeLogs, deployments, devActivities, approvalHistory] = await Promise.all([
    Task.find({ ticket: ticket._id, isDeleted: false })
      .populate('assignedEmployees', 'fullName designation avatarColor')
      .sort({ createdAt: 1 })
      .lean(),
    Comment.find({ entityType: 'ticket', entityId: ticket._id, isDeleted: false })
      .populate('author', 'fullName designation role avatarColor')
      .populate('mentions', 'fullName')
      .populate('attachments')
      .sort({ createdAt: 1 })
      .lean(),
    Attachment.find({ entityType: 'ticket', entityId: ticket._id, isDeleted: false })
      .populate('uploadedBy', 'fullName')
      .sort({ createdAt: -1 })
      .lean(),
    ActivityLog.find({ ticket: ticket._id })
      .populate('actor', 'fullName designation avatarColor')
      .sort({ createdAt: -1 })
      .lean(),
    TimeLog.find({ ticket: ticket._id, isDeleted: false })
      .populate('employee', 'fullName')
      .populate('task', 'taskId title')
      .sort({ date: -1 })
      .lean(),
    Deployment.find({ ticket: ticket._id, isDeleted: false })
      .populate('deployedBy', 'fullName')
      .populate('approvedBy', 'fullName')
      .sort({ createdAt: -1 })
      .lean(),
    DevelopmentActivity.find({ ticketId: ticket._id })
      .populate('employeeId', 'fullName designation avatarColor')
      .populate('taskId', 'taskId title')
      .sort({ timestamp: -1 })
      .lean(),
    ApprovalHistory.find({ ticketId: ticket._id })
      .populate('performedBy', 'fullName role')
      .sort({ timestamp: -1 })
      .lean(),
  ]);

  const totalHoursLogged = timeLogs.reduce((acc, l) => acc + (l.hoursSpent || 0), 0);
  const isOverdue = Boolean(
    ticket.dueDate && new Date(ticket.dueDate) < new Date() && !['Resolved', 'Closed'].includes(ticket.status)
  );

  return sendSuccess(
    res,
    {
      ...ticket,
      isOverdue,
      totalHoursLogged: Number(totalHoursLogged.toFixed(2)),
      tasks,
      comments,
      attachments,
      activityLogs,
      timeLogs,
      deployments,
      devActivities,
      approvalHistory,
    },
    'Ticket details fetched'
  );
});

export const updateTicket = asyncHandler(async (req, res) => {
  const updates = { ...req.validatedBody };
  if (updates.project === '') updates.project = null;
  if (updates.assignedTeamLead === '') updates.assignedTeamLead = null;

  const ticket = await Ticket.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    updates,
    { new: true, runValidators: true }
  )
    .populate('client', 'clientId companyName clientFolderCode')
    .populate('assignedDevelopers', 'fullName designation avatarColor');

  if (!ticket) throw new AppError('Ticket not found.', 404);

  await recordActivity({
    actor: req.user._id,
    action: 'TICKET_UPDATED',
    entityType: 'ticket',
    entityId: ticket._id,
    entityRef: ticket.ticketId,
    client: ticket.client?._id || ticket.client,
    ticket: ticket._id,
    summary: `Updated ticket ${ticket.ticketId} details`,
  });

  await notifyTicketStakeholders({
    ticket,
    actorId: req.user._id,
    type: 'ticket_updated',
    title: `Ticket Updated: ${ticket.ticketId}`,
    message: `${req.user.fullName} updated details for "${ticket.title}".`,
    link: `/tickets/${ticket._id}`,
    includeActor: true,
  });

  emitBroadcast('ticket:changed', { action: 'updated', ticketId: ticket._id, actorId: req.user._id });
  return sendSuccess(res, ticket, 'Ticket updated successfully');
});

export const reorderTicket = asyncHandler(async (req, res) => {
  const ticket = await reorderTicketService(req.validatedBody, req.user);
  const populated = await Ticket.findById(ticket._id)
    .populate('client', 'clientId companyName clientFolderCode')
    .populate('project', 'projectId name')
    .populate('assignedDevelopers', 'fullName designation avatarColor')
    .populate('assignedTeamLead', 'fullName designation');
  return sendSuccess(res, populated, 'Ticket order updated');
});

export const duplicateTicket = asyncHandler(async (req, res) => {
  const ticket = await duplicateTicketService(req.params.id, req.user);
  const populated = await Ticket.findById(ticket._id)
    .populate('client', 'clientId companyName clientFolderCode')
    .populate('assignedDevelopers', 'fullName designation avatarColor');
  return sendSuccess(res, populated, 'Ticket duplicated', 201);
});

export const bulkTicketAction = asyncHandler(async (req, res) => {
  const updated = await bulkTicketActionService(req.validatedBody, req.user);
  return sendSuccess(res, { count: updated.length }, `Bulk action applied to ${updated.length} ticket(s)`);
});

export const updateTicketStatus = asyncHandler(async (req, res) => {
  const ticket = await changeTicketStatusService(req.params.id, req.validatedBody, req.user);
  return sendSuccess(res, ticket, `Ticket status updated to ${ticket.status}`);
});

export const assignTicket = asyncHandler(async (req, res) => {
  const ticket = await assignTicketService(req.params.id, req.validatedBody, req.user, req.effectivePermissions);
  const populated = await Ticket.findById(ticket._id)
    .populate('assignedDevelopers', 'fullName designation avatarColor')
    .populate('assignedTeamLead', 'fullName');
  return sendSuccess(res, populated, 'Ticket assignment updated');
});

export const deleteTicket = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    { isDeleted: true, deletedAt: new Date() },
    { new: true }
  );
  if (!ticket) throw new AppError('Ticket not found.', 404);

  const actorLabel = req.user.role === ROLES.ADMIN ? `Admin ${req.user.fullName}` : req.user.fullName;
  const deletionSummary = `${actorLabel} deleted ticket ${ticket.ticketId} (${ticket.title})`;

  await Promise.all([
    recordActivity({
      actor: req.user._id,
      action: req.user.role === ROLES.ADMIN ? 'TICKET_DELETED_BY_ADMIN' : 'TICKET_ARCHIVED',
      entityType: 'ticket',
      entityId: ticket._id,
      entityRef: ticket.ticketId,
      client: ticket.client,
      ticket: ticket._id,
      summary: deletionSummary,
    }),
    recordAudit({
      actorId: req.user._id,
      action: req.user.role === ROLES.ADMIN ? 'TICKET_DELETED_BY_ADMIN' : 'TICKET_ARCHIVED',
      recordType: 'Ticket',
      recordId: ticket._id,
      recordRef: ticket.ticketId,
      previousValue: { title: ticket.title, status: ticket.status, approvalStatus: ticket.approvalStatus },
      newValue: { isDeleted: true, summary: deletionSummary },
      module: 'tickets',
    }),
  ]);

  emitBroadcast('ticket:changed', { action: 'deleted', ticketId: ticket._id, actorId: req.user._id });
  return sendSuccess(res, null, 'Ticket archived successfully');
});

export const mergeTickets = asyncHandler(async (req, res) => {
  const { sourceTicketId, mergedTitle, mergedDescription } = req.body || {};
  if (!sourceTicketId) {
    throw new AppError('Select a ticket to merge into this ticket.', 400);
  }
  if (String(req.params.id) === String(sourceTicketId)) {
    throw new AppError('Cannot merge a ticket into itself.', 400);
  }

  const [primary, source] = await Promise.all([
    Ticket.findOne({ _id: req.params.id, isDeleted: false }),
    Ticket.findOne({ _id: sourceTicketId, isDeleted: false }),
  ]);

  if (!primary || !source) {
    throw new AppError('One or both tickets were not found.', 404);
  }

  const appendedSection = `\n\n--- Merged from ${source.ticketId}: ${source.title} ---\n${source.description || ''}`;
  primary.description =
    typeof mergedDescription === 'string' && mergedDescription.trim()
      ? mergedDescription.trim()
      : `${primary.description || ''}${appendedSection}`.trim();

  if (typeof mergedTitle === 'string' && mergedTitle.trim()) {
    primary.title = mergedTitle.trim();
  }

  // Merge assignees and attachments cleanly
  const devSet = new Set([
    ...(primary.assignedDevelopers || []).map(String),
    ...(source.assignedDevelopers || []).map(String),
  ]);
  primary.assignedDevelopers = Array.from(devSet);

  const attSet = new Set([
    ...(primary.attachments || []).map(String),
    ...(source.attachments || []).map(String),
  ]);
  primary.attachments = Array.from(attSet);

  primary.mergedFromRefs = Array.from(new Set([...(primary.mergedFromRefs || []), source.ticketId]));
  primary.statusHistory.push({
    fromStatus: primary.status,
    toStatus: primary.status,
    changedBy: req.user._id,
    note: `Merged ${source.ticketId} (${source.title}) into ${primary.ticketId}`,
  });

  await primary.save();

  // Re-parent tasks, comments, attachments, deployments, and time logs from source -> primary
  await Promise.all([
    Task.updateMany({ ticket: source._id, isDeleted: false }, { ticket: primary._id }),
    Comment.updateMany({ entityType: 'ticket', entityId: source._id }, { entityId: primary._id }),
    Attachment.updateMany({ entityType: 'ticket', entityId: source._id }, { entityId: primary._id }),
    Deployment.updateMany({ ticket: source._id, isDeleted: false }, { ticket: primary._id }),
    TimeLog.updateMany({ ticket: source._id, isDeleted: false }, { ticket: primary._id }),
  ]);

  source.mergedInto = primary._id;
  source.status = 'Closed';
  source.isDeleted = true;
  source.deletedAt = new Date();
  source.statusHistory.push({
    fromStatus: source.status,
    toStatus: 'Closed',
    changedBy: req.user._id,
    note: `Merged into ${primary.ticketId}`,
  });
  await source.save();

  const summary = `${req.user.fullName} merged ${source.ticketId} into ${primary.ticketId}`;
  await Promise.all([
    recordActivity({
      actor: req.user._id,
      action: 'TICKET_MERGED',
      entityType: 'ticket',
      entityId: primary._id,
      entityRef: primary.ticketId,
      client: primary.client,
      ticket: primary._id,
      summary,
      metadata: { sourceTicketId: source._id, sourceTicketRef: source.ticketId },
    }),
    recordAudit({
      actorId: req.user._id,
      action: 'TICKET_MERGED',
      recordType: 'Ticket',
      recordId: primary._id,
      recordRef: primary.ticketId,
      newValue: { mergedFrom: source.ticketId, summary },
      module: 'tickets',
    }),
  ]);

  emitBroadcast('ticket:changed', { action: 'merged', ticketId: primary._id, removedTicketId: source._id });
  const populated = await Ticket.findById(primary._id)
    .populate('client', 'companyName clientFolderCode')
    .populate('assignedDevelopers', 'fullName designation avatarColor');

  return sendSuccess(res, populated, `Merged ${source.ticketId} into ${primary.ticketId}`);
});

export const carryForwardTicket = asyncHandler(async (req, res) => {
  const { nextDate, hoursSpent = 0, workDescription, taskType, entryStatus, updateDueDate = true } = req.body || {};
  const ticket = await Ticket.findOne({ _id: req.params.id, isDeleted: false }).populate('project', 'projectId name');
  if (!ticket) throw new AppError('Ticket not found.', 404);

  const targetDate = nextDate ? new Date(nextDate) : new Date(Date.now() + 24 * 3600 * 1000);
  if (Number.isNaN(targetDate.getTime())) {
    throw new AppError('Invalid target carry-forward date.', 400);
  }

  const hrs = Number(hoursSpent || 0);
  const dateLabel = targetDate.toISOString().slice(0, 10);

  if (updateDueDate !== false) {
    ticket.dueDate = targetDate;
  }
  ticket.statusHistory.push({
    fromStatus: ticket.status,
    toStatus: ticket.status,
    changedBy: req.user._id,
    note: `Carried forward to ${dateLabel}${hrs > 0 ? ` (${hrs}h logged to Timesheet)` : ''}`,
  });
  await ticket.save();

  let timeLog = null;
  if (hrs > 0) {
    const resolvedStatus =
      entryStatus || (['Resolved', 'Closed'].includes(ticket.status) ? 'DONE' : 'IN PROGRESS');
    timeLog = await TimeLog.create({
      employee: req.user._id,
      client: ticket.client || null,
      project: ticket.project?._id || ticket.project || null,
      projectCode: ticket.project?.projectId || '',
      ticket: ticket._id,
      taskTitle: ticket.title,
      workDescription: String(workDescription || '').trim() || ticket.description || ticket.title,
      taskType: String(taskType || '').trim() || String(ticket.category || 'SUPPORT').toUpperCase(),
      entryStatus: ['DONE', 'IN PROGRESS', 'PENDING', 'BLOCKED'].includes(resolvedStatus) ? resolvedStatus : 'IN PROGRESS',
      date: targetDate,
      hoursSpent: Math.min(24, Math.max(0.1, hrs)),
      billable: true,
    });
  }

  await recordActivity({
    actor: req.user._id,
    action: 'TICKET_CARRIED_FORWARD',
    entityType: 'ticket',
    entityId: ticket._id,
    entityRef: ticket.ticketId,
    client: ticket.client,
    ticket: ticket._id,
    summary: `${req.user.fullName} carried ${ticket.ticketId} forward to ${dateLabel}${hrs > 0 ? ` and logged ${hrs}h to Timesheet` : ''}`,
  });

  emitBroadcast('ticket:changed', { action: 'carried_forward', ticketId: ticket._id, actorId: req.user._id });
  return sendSuccess(
    res,
    { ticket, timeLog },
    hrs > 0
      ? `Carried ${ticket.ticketId} forward to ${dateLabel} & updated Timesheet (+${hrs}h)`
      : `Carried ${ticket.ticketId} forward to ${dateLabel}`
  );
});
