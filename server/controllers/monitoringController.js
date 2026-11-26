import User from '../models/User.js';
import Ticket from '../models/Ticket.js';
import Task from '../models/Task.js';
import Deployment from '../models/Deployment.js';
import TimeLog from '../models/TimeLog.js';
import Comment from '../models/Comment.js';
import ActivityLog from '../models/ActivityLog.js';
import DevelopmentActivity from '../models/DevelopmentActivity.js';
import SystemLog from '../models/SystemLog.js';
import AIActivityLog from '../models/AIActivityLog.js';
import AuditLog from '../models/AuditLog.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, buildPagination, buildPaginationMeta } from '../utils/response.js';
import { recordActivity } from '../services/activityService.js';
import { recordAudit } from '../services/auditService.js';

export const getMonitoringOverview = asyncHandler(async (req, res) => {
  const since24h = new Date(Date.now() - 24 * 3600 * 1000);
  const [
    totalUsers,
    pendingApprovals,
    approvedTickets,
    devUpdatesCount,
    apiErrors24h,
    auditEventsCount,
    aiCalls24h,
    deploymentsCount,
    recentAudit,
    recentSystemErrors,
  ] = await Promise.all([
    User.countDocuments({ isDeleted: false, status: 'Active' }),
    Ticket.countDocuments({ isDeleted: false, approvalStatus: 'PENDING_APPROVAL' }),
    Ticket.countDocuments({ isDeleted: false, approvalStatus: 'APPROVED' }),
    DevelopmentActivity.countDocuments({}),
    SystemLog.countDocuments({ severity: { $in: ['error', 'critical', 'security'] }, timestamp: { $gte: since24h } }),
    AuditLog.countDocuments({}),
    AIActivityLog.countDocuments({ timestamp: { $gte: since24h } }),
    Deployment.countDocuments({ isDeleted: false }),
    AuditLog.find({}).populate('actorId', 'fullName email role').sort({ timestamp: -1 }).limit(12).lean(),
    SystemLog.find({}).populate('employeeId', 'fullName email').sort({ timestamp: -1 }).limit(12).lean(),
  ]);

  return sendSuccess(res, {
    kpis: {
      totalUsers,
      pendingApprovals,
      approvedTickets,
      devUpdatesCount,
      apiErrors24h,
      auditEventsCount,
      aiCalls24h,
      deploymentsCount,
    },
    recentAudit,
    recentSystemErrors,
  });
});

export const getDevelopmentActivities = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query);
  const { employeeId, clientId, ticketId, taskId, environment, workStatus, search } = req.query;
  const filter = {};
  if (employeeId) filter.employeeId = employeeId;
  if (clientId) filter.clientId = clientId;
  if (ticketId) filter.ticketId = ticketId;
  if (taskId) filter.taskId = taskId;
  if (environment) filter.environment = environment;
  if (workStatus) filter.workStatus = workStatus;
  if (search) {
    filter.$or = [
      { description: { $regex: search, $options: 'i' } },
      { affectedComponent: { $regex: search, $options: 'i' } },
      { investigationNotes: { $regex: search, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    DevelopmentActivity.find(filter)
      .populate('employeeId', 'employeeId fullName designation avatarColor')
      .populate('clientId', 'clientId companyName clientFolderCode')
      .populate('ticketId', 'ticketId title status')
      .populate('taskId', 'taskId title status')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DevelopmentActivity.countDocuments(filter),
  ]);

  return sendSuccess(res, items, 'Development activities retrieved', 200, buildPaginationMeta(total, page, limit));
});

export const createDevelopmentActivity = asyncHandler(async (req, res) => {
  const {
    ticketId = null,
    taskId = null,
    clientId = null,
    description,
    investigationNotes = '',
    affectedComponent = '',
    changesImplemented = '',
    testingPerformed = '',
    environment = 'Development',
    workStatus = 'In Development',
    timeSpent = 0,
  } = req.body;

  if (!description?.trim()) throw new AppError('Development description is required.', 400);

  let resolvedClient = clientId;
  if (!resolvedClient && ticketId) {
    const t = await Ticket.findById(ticketId).select('client ticketId');
    if (t) resolvedClient = t.client;
  }

  const entry = await DevelopmentActivity.create({
    employeeId: req.user._id,
    clientId: resolvedClient || null,
    ticketId: ticketId || null,
    taskId: taskId || null,
    description: description.trim(),
    investigationNotes,
    affectedComponent,
    changesImplemented,
    testingPerformed,
    environment,
    workStatus,
    timeSpent: Number(timeSpent || 0),
    timestamp: new Date(),
  });

  await recordActivity({
    actor: req.user._id,
    action: 'DEV_UPDATE_LOGGED',
    entityType: ticketId ? 'ticket' : 'task',
    entityId: ticketId || taskId || entry._id,
    client: resolvedClient,
    ticket: ticketId,
    summary: `Logged development update (${workStatus}${affectedComponent ? ` · ${affectedComponent}` : ''}): ${description.slice(0, 80)}`,
  });

  const populated = await DevelopmentActivity.findById(entry._id)
    .populate('employeeId', 'employeeId fullName designation avatarColor')
    .populate('clientId', 'companyName')
    .populate('ticketId', 'ticketId title')
    .populate('taskId', 'taskId title')
    .lean();

  return sendSuccess(res, populated, 'Development update recorded', 201);
});

export const getEmployeeUnifiedActivity = asyncHandler(async (req, res) => {
  const { employeeId } = req.params;
  const { startDate, endDate, category, search } = req.query;

  const user = await User.findOne({ _id: employeeId, isDeleted: false }).lean();
  if (!user) throw new AppError('Employee not found.', 404);

  const dateFilter = {};
  if (startDate) dateFilter.$gte = new Date(startDate);
  if (endDate) dateFilter.$lte = new Date(endDate);
  const hasDate = Object.keys(dateFilter).length > 0;

  const [
    activities,
    devUpdates,
    timeLogs,
    deployments,
    comments,
    authAudits,
    assignedTickets,
    activeTasks,
    completedTasks,
  ] = await Promise.all([
    ActivityLog.find({ actor: employeeId, ...(hasDate ? { createdAt: dateFilter } : {}) })
      .populate('client', 'companyName')
      .populate('ticket', 'ticketId title')
      .sort({ createdAt: -1 })
      .limit(80)
      .lean(),
    DevelopmentActivity.find({ employeeId, ...(hasDate ? { timestamp: dateFilter } : {}) })
      .populate('ticketId', 'ticketId title')
      .populate('taskId', 'taskId title')
      .populate('clientId', 'companyName')
      .sort({ timestamp: -1 })
      .limit(60)
      .lean(),
    TimeLog.find({ employee: employeeId, isDeleted: false, ...(hasDate ? { date: dateFilter } : {}) })
      .populate('ticket', 'ticketId title')
      .populate('task', 'taskId title')
      .sort({ date: -1 })
      .limit(60)
      .lean(),
    Deployment.find({ deployedBy: employeeId, isDeleted: false, ...(hasDate ? { createdAt: dateFilter } : {}) })
      .populate('client', 'companyName')
      .populate('ticket', 'ticketId title')
      .sort({ createdAt: -1 })
      .limit(40)
      .lean(),
    Comment.find({ author: employeeId, isDeleted: false, ...(hasDate ? { createdAt: dateFilter } : {}) })
      .sort({ createdAt: -1 })
      .limit(40)
      .lean(),
    AuditLog.find({ actorId: employeeId, action: { $in: ['USER_LOGIN', 'LOGIN_FAILED'] }, ...(hasDate ? { timestamp: dateFilter } : {}) })
      .sort({ timestamp: -1 })
      .limit(30)
      .lean(),
    Ticket.find({ assignedDevelopers: employeeId, isDeleted: false, approvalStatus: 'APPROVED' })
      .select('ticketId title status priority dueDate')
      .lean(),
    Task.find({ assignedEmployees: employeeId, isDeleted: false, status: { $ne: 'Completed' } })
      .select('taskId title status priority dueDate')
      .lean(),
    Task.find({ assignedEmployees: employeeId, isDeleted: false, status: 'Completed' })
      .select('taskId title status completedAt')
      .limit(30)
      .lean(),
  ]);

  let timeline = [
    ...activities.map((a) => ({
      id: `act-${a._id}`,
      category: 'activity',
      action: a.action,
      description: a.summary,
      relatedRef: a.ticket?.ticketId || a.entityRef || '',
      relatedTicketId: a.ticket?._id || null,
      clientName: a.client?.companyName || '',
      timestamp: a.createdAt,
    })),
    ...devUpdates.map((d) => ({
      id: `dev-${d._id}`,
      category: 'development',
      action: `DEV_${d.workStatus.toUpperCase().replace(/\s+/g, '_')}`,
      description: `${d.description}${d.affectedComponent ? ` [${d.affectedComponent}]` : ''}`,
      relatedRef: d.ticketId?.ticketId || d.taskId?.taskId || '',
      relatedTicketId: d.ticketId?._id || null,
      clientName: d.clientId?.companyName || '',
      timestamp: d.timestamp || d.createdAt,
    })),
    ...timeLogs.map((l) => ({
      id: `time-${l._id}`,
      category: 'time_log',
      action: 'TIME_LOGGED',
      description: `Logged ${l.hoursSpent}h: ${l.notes || l.workCategory}`,
      relatedRef: l.ticket?.ticketId || l.task?.taskId || '',
      relatedTicketId: l.ticket?._id || null,
      timestamp: l.date || l.createdAt,
    })),
    ...deployments.map((dp) => ({
      id: `dep-${dp._id}`,
      category: 'deployment',
      action: `DEPLOY_${dp.environment.toUpperCase()}`,
      description: `${dp.environment} deployment (${dp.stage}) — ${dp.changeSummary}`,
      relatedRef: dp.ticket?.ticketId || dp.deploymentId || '',
      relatedTicketId: dp.ticket?._id || null,
      clientName: dp.client?.companyName || '',
      timestamp: dp.createdAt,
    })),
    ...comments.map((cm) => ({
      id: `cmt-${cm._id}`,
      category: 'comment',
      action: cm.isInternal ? 'INTERNAL_COMMENT' : 'CLIENT_COMMENT',
      description: cm.body?.slice(0, 140),
      relatedRef: cm.entityType,
      relatedTicketId: cm.entityType === 'ticket' ? cm.entityId : null,
      timestamp: cm.createdAt,
    })),
    ...authAudits.map((au) => ({
      id: `auth-${au._id}`,
      category: 'security',
      action: au.action,
      description: au.action === 'USER_LOGIN' ? 'Authenticated login session' : 'Failed login attempt',
      relatedRef: au.recordRef,
      timestamp: au.timestamp,
    })),
  ];

  if (category && category !== 'all') {
    timeline = timeline.filter((t) => t.category === category);
  }
  if (search) {
    const q = search.toLowerCase();
    timeline = timeline.filter((t) => `${t.action} ${t.description} ${t.relatedRef}`.toLowerCase().includes(q));
  }
  timeline.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return sendSuccess(res, {
    employee: user,
    summary: {
      assignedTicketsCount: assignedTickets.length,
      completedTicketsCount: assignedTickets.filter((t) => ['Resolved', 'Closed'].includes(t.status)).length,
      activeTasksCount: activeTasks.length,
      completedTasksCount: completedTasks.length,
      totalHoursLogged: Number(timeLogs.reduce((acc, l) => acc + (l.hoursSpent || 0), 0).toFixed(2)),
      deploymentsCount: deployments.length,
    },
    assignedTickets,
    activeTasks,
    completedTasks,
    timeline: timeline.slice(0, 150),
  });
});

export const getSystemLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query);
  const { severity, category, endpoint, employeeId, search, startDate, endDate } = req.query;
  const filter = {};
  if (severity) filter.severity = severity;
  if (category) filter.category = category;
  if (endpoint) filter.endpoint = { $regex: endpoint, $options: 'i' };
  if (employeeId) filter.employeeId = employeeId;
  if (search) filter.message = { $regex: search, $options: 'i' };
  if (startDate || endDate) {
    filter.timestamp = {};
    if (startDate) filter.timestamp.$gte = new Date(startDate);
    if (endDate) filter.timestamp.$lte = new Date(endDate);
  }

  const [items, total] = await Promise.all([
    SystemLog.find(filter)
      .populate('employeeId', 'fullName email role')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SystemLog.countDocuments(filter),
  ]);

  return sendSuccess(res, items, 'System logs retrieved', 200, buildPaginationMeta(total, page, limit));
});

export const getApiMonitoringStats = asyncHandler(async (req, res) => {
  const since24h = new Date(Date.now() - 24 * 3600 * 1000);
  const [byEndpoint, recentErrors] = await Promise.all([
    SystemLog.aggregate([
      { $match: { timestamp: { $gte: since24h } } },
      { $group: { _id: { endpoint: '$endpoint', status: '$httpStatus' }, count: { $sum: 1 }, lastSeen: { $max: '$timestamp' } } },
      { $sort: { count: -1 } },
      { $limit: 25 },
    ]),
    SystemLog.find({ category: { $in: ['api_error', 'database', 'auth_failure'] } })
      .populate('employeeId', 'fullName email')
      .sort({ timestamp: -1 })
      .limit(40)
      .lean(),
  ]);

  return sendSuccess(res, { byEndpoint, recentErrors });
});

export const getDeploymentHistory = asyncHandler(async (req, res) => {
  const { client, developer, environment, approvalStatus, ticket, startDate, endDate } = req.query;
  const filter = { isDeleted: false };
  if (client) filter.client = client;
  if (developer) filter.deployedBy = developer;
  if (environment) filter.environment = environment;
  if (approvalStatus) filter.approvalStatus = approvalStatus;
  if (ticket) filter.ticket = ticket;
  if (startDate || endDate) {
    filter.deploymentDate = {};
    if (startDate) filter.deploymentDate.$gte = new Date(startDate);
    if (endDate) filter.deploymentDate.$lte = new Date(endDate);
  }

  const items = await Deployment.find(filter)
    .populate('client', 'clientId companyName clientFolderCode')
    .populate('ticket', 'ticketId title status')
    .populate('task', 'taskId title')
    .populate('deployedBy', 'fullName email designation')
    .populate('approvedBy', 'fullName email')
    .populate('testedBy', 'fullName email')
    .sort({ deploymentDate: -1, createdAt: -1 })
    .limit(150)
    .lean();

  return sendSuccess(res, items, 'Deployment history retrieved');
});

export const getMonitoringTimeLogs = asyncHandler(async (req, res) => {
  const { employee, ticket, startDate, endDate } = req.query;
  const filter = { isDeleted: false };
  if (employee) filter.employee = employee;
  if (ticket) filter.ticket = ticket;
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = new Date(startDate);
    if (endDate) filter.date.$lte = new Date(endDate);
  }

  const items = await TimeLog.find(filter)
    .populate('employee', 'employeeId fullName designation')
    .populate('ticket', 'ticketId title')
    .populate('task', 'taskId title')
    .sort({ date: -1 })
    .limit(150)
    .lean();

  return sendSuccess(res, items, 'Time logs retrieved');
});

export const getAIActivityLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query);
  const { userId, intent, executionResult } = req.query;
  const filter = {};
  if (userId) filter.userId = userId;
  if (intent) filter.detectedIntent = intent;
  if (executionResult) filter.executionResult = executionResult;

  const [items, total] = await Promise.all([
    AIActivityLog.find(filter)
      .populate('userId', 'fullName email role')
      .populate('ticketDraftId', 'draftId approvalStatus')
      .populate('ticketId', 'ticketId title status')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AIActivityLog.countDocuments(filter),
  ]);

  return sendSuccess(res, items, 'AI activity logs retrieved', 200, buildPaginationMeta(total, page, limit));
});

export const getAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query);
  const { actorId, action, module: mod, result, search, startDate, endDate } = req.query;
  const filter = {};
  if (actorId) filter.actorId = actorId;
  if (action) filter.action = { $regex: action, $options: 'i' };
  if (mod) filter.module = mod;
  if (result) filter.result = result;
  if (search) {
    filter.$or = [
      { action: { $regex: search, $options: 'i' } },
      { recordRef: { $regex: search, $options: 'i' } },
      { recordType: { $regex: search, $options: 'i' } },
    ];
  }
  if (startDate || endDate) {
    filter.timestamp = {};
    if (startDate) filter.timestamp.$gte = new Date(startDate);
    if (endDate) filter.timestamp.$lte = new Date(endDate);
  }

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .populate('actorId', 'fullName email role')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  return sendSuccess(res, items, 'Audit logs retrieved', 200, buildPaginationMeta(total, page, limit));
});

export const blockAuditMutation = asyncHandler(async (req, res) => {
  await recordAudit({
    actorId: req.user._id,
    action: 'AUDIT_TAMPER_ATTEMPT',
    recordType: 'AuditLog',
    recordId: req.params.id || '',
    module: 'security',
    result: 'DENIED',
  });
  throw new AppError('Audit log records are immutable and cannot be modified or deleted.', 403);
});
