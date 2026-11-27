import TimeLog from '../models/TimeLog.js';
import Task from '../models/Task.js';
import Project from '../models/Project.js';
import { ROLES } from '../config/constants.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, buildPagination, buildPaginationMeta } from '../utils/response.js';
import { recordActivity } from '../services/activityService.js';

async function recalcTaskHours(taskId) {
  if (!taskId) return;
  const agg = await TimeLog.aggregate([
    { $match: { task: taskId, isDeleted: false } },
    { $group: { _id: '$task', total: { $sum: '$hoursSpent' } } },
  ]);
  await Task.findByIdAndUpdate(taskId, {
    actualHours: Number((agg[0]?.total || 0).toFixed(2)),
  });
}

const POPULATE_SPEC = [
  { path: 'employee', select: 'fullName employeeId designation avatarColor' },
  { path: 'task', select: 'taskId title' },
  { path: 'ticket', select: 'ticketId title' },
  { path: 'client', select: 'companyName clientId clientFolderCode' },
  { path: 'project', select: 'projectId name' },
];

export const getTimeLogs = asyncHandler(async (req, res) => {
  const { page } = buildPagination(req.query);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
  const skip = (page - 1) * limit;
  const { task, ticket, client, project, employee, mine, month, status, search, startDate, endDate } = req.query;

  const filter = { isDeleted: false };
  if (task) filter.task = task;
  if (ticket) filter.ticket = ticket;
  if (client) filter.client = client;
  if (project) filter.project = project;
  if (status && status !== 'All') filter.entryStatus = status;

  const isPrivileged = [ROLES.ADMIN, ROLES.TEAM_LEAD].includes(req.user.role);
  if (mine === 'true' || !isPrivileged) {
    filter.employee = req.user._id;
  } else if (employee) {
    filter.employee = employee;
  }

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [yr, mo] = month.split('-').map(Number);
    const monthStart = new Date(Date.UTC(yr, mo - 1, 1, 0, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(yr, mo, 0, 23, 59, 59, 999));
    filter.date = { $gte: monthStart, $lte: monthEnd };
  } else if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = new Date(startDate);
    if (endDate) filter.date.$lte = new Date(endDate);
  }

  if (search && search.trim()) {
    const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ projectCode: rx }, { taskTitle: rx }, { workDescription: rx }, { taskType: rx }];
  }

  const [logs, total] = await Promise.all([
    TimeLog.find(filter)
      .populate(POPULATE_SPEC)
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    TimeLog.countDocuments(filter),
  ]);

  return sendSuccess(res, logs, 'Time logs retrieved', 200, buildPaginationMeta(total, page, limit));
});

export const createTimeLog = asyncHandler(async (req, res) => {
  const payload = req.validatedBody;
  let task = null;
  if (payload.task) {
    task = await Task.findOne({ _id: payload.task, isDeleted: false });
    if (!task) throw new AppError('Task not found.', 404);
  }

  let projectDoc = null;
  if (payload.project) {
    projectDoc = await Project.findOne({ _id: payload.project, isDeleted: false }).lean();
  }

  const resolvedClient = payload.client || projectDoc?.client || task?.client || null;
  const resolvedTicket = payload.ticket || task?.ticket || null;
  const resolvedProject = payload.project || task?.project || null;
  const resolvedProjectCode =
    payload.projectCode?.trim() || (projectDoc ? `${projectDoc.projectId}${projectDoc.name ? ` · ${projectDoc.name}` : ''}` : '');
  const resolvedTaskTitle = payload.taskTitle?.trim() || task?.title || '';

  const log = await TimeLog.create({
    employee: req.user._id,
    task: task?._id || null,
    ticket: resolvedTicket,
    client: resolvedClient,
    project: resolvedProject,
    projectCode: resolvedProjectCode,
    taskTitle: resolvedTaskTitle,
    taskType: payload.taskType || '',
    entryStatus: payload.entryStatus || 'DONE',
    date: payload.date ? new Date(payload.date) : new Date(),
    hoursSpent: payload.hoursSpent,
    workDescription: payload.workDescription,
    billable: payload.billable ?? true,
  });

  if (task) {
    await recalcTaskHours(task._id);
  }

  await recordActivity({
    actor: req.user._id,
    action: 'TIME_LOGGED',
    entityType: 'timeLog',
    entityId: log._id,
    entityRef: task?.taskId || resolvedProjectCode || 'TIMESHEET',
    client: resolvedClient,
    ticket: resolvedTicket,
    summary: `Logged ${payload.hoursSpent}h (${resolvedTaskTitle || task?.taskId || 'Timesheet'}): ${payload.workDescription}`,
  });

  const populated = await TimeLog.findById(log._id).populate(POPULATE_SPEC);
  return sendSuccess(res, populated, 'Timesheet entry recorded', 201);
});

export const updateTimeLog = asyncHandler(async (req, res) => {
  const existing = await TimeLog.findOne({ _id: req.params.id, isDeleted: false });
  if (!existing) throw new AppError('Timesheet entry not found.', 404);

  const isPrivileged = [ROLES.ADMIN, ROLES.TEAM_LEAD].includes(req.user.role);
  if (!isPrivileged && String(existing.employee) !== String(req.user._id)) {
    throw new AppError('You can only edit your own timesheet entries.', 403);
  }

  const prevTaskId = existing.task;
  const updates = { ...req.validatedBody };
  if ('date' in updates && updates.date) updates.date = new Date(updates.date);
  if ('task' in updates && !updates.task) updates.task = null;
  if ('client' in updates && !updates.client) updates.client = null;
  if ('project' in updates && !updates.project) updates.project = null;
  if ('ticket' in updates && !updates.ticket) updates.ticket = null;

  Object.assign(existing, updates);
  await existing.save();

  if (prevTaskId) await recalcTaskHours(prevTaskId);
  if (existing.task && String(existing.task) !== String(prevTaskId)) {
    await recalcTaskHours(existing.task);
  }

  const populated = await TimeLog.findById(existing._id).populate(POPULATE_SPEC);
  return sendSuccess(res, populated, 'Timesheet entry updated');
});

export const deleteTimeLog = asyncHandler(async (req, res) => {
  const existing = await TimeLog.findOne({ _id: req.params.id, isDeleted: false });
  if (!existing) throw new AppError('Timesheet entry not found.', 404);

  const isPrivileged = [ROLES.ADMIN, ROLES.TEAM_LEAD].includes(req.user.role);
  if (!isPrivileged && String(existing.employee) !== String(req.user._id)) {
    throw new AppError('You can only delete your own timesheet entries.', 403);
  }

  existing.isDeleted = true;
  await existing.save();

  if (existing.task) {
    await recalcTaskHours(existing.task);
  }

  return sendSuccess(res, null, 'Timesheet entry deleted');
});
