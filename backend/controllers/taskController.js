import Task from '../../db/models/Task.js';
import Comment from '../../db/models/Comment.js';
import Attachment from '../../db/models/Attachment.js';
import TimeLog from '../../db/models/TimeLog.js';
import { ROLES } from '../config/constants.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, buildPagination, buildPaginationMeta } from '../utils/response.js';
import ActivityLog from '../../db/models/ActivityLog.js';
import {
  createTaskService,
  changeTaskStatusService,
  assignTaskService,
  reorderTaskService,
  bulkTaskActionService,
  recalculateParentTaskProgress,
  recalculateProjectProgress,
} from '../services/taskService.js';
import { emitBroadcast } from '../services/notificationService.js';
import { recordActivity } from '../services/activityService.js';

export const getTasks = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query);
  const {
    search,
    view,
    status,
    priority,
    client,
    ticket,
    project,
    employee,
    includeSubtasks,
    sortBy = 'sortOrder',
    sortOrder = 'asc',
  } = req.query;

  const filter = { isDeleted: false };
  if (includeSubtasks !== 'true' && !ticket) {
    filter.parentTask = null;
  }

  if (view === 'my' || (req.user.role === ROLES.DEVELOPER && !req.query.scope)) {
    filter.assignedEmployees = req.user._id;
  } else if (employee) {
    filter.assignedEmployees = employee;
  }

  if (view === 'overdue') {
    filter.dueDate = { $lt: new Date() };
    filter.status = { $ne: 'Completed' };
  } else if (view === 'completed') {
    filter.status = 'Completed';
  }

  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (client) filter.client = client;
  if (ticket) filter.ticket = ticket;
  if (project) filter.project = project;

  if (search) {
    filter.$or = [
      { taskId: { $regex: search, $options: 'i' } },
      { title: { $regex: search, $options: 'i' } },
    ];
  }

  const allowedSort = ['sortOrder', 'dueDate', 'createdAt', 'updatedAt', 'priority', 'status'];
  const sField = allowedSort.includes(sortBy) ? sortBy : 'sortOrder';
  const sDir = sortOrder === 'desc' ? -1 : 1;

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate('ticket', 'ticketId title priority status')
      .populate('client', 'clientId companyName clientFolderCode')
      .populate('project', 'projectId name')
      .populate('assignedEmployees', 'fullName designation avatarColor')
      .sort({ [sField]: sDir, dueDate: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Task.countDocuments(filter),
  ]);

  const taskIds = tasks.map((t) => t._id);
  const [subCounts, commentCounts, attachCounts] = await Promise.all([
    Task.aggregate([
      { $match: { parentTask: { $in: taskIds }, isDeleted: false } },
      {
        $group: {
          _id: '$parentTask',
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
        },
      },
    ]),
    Comment.aggregate([
      { $match: { entityType: 'task', entityId: { $in: taskIds }, isDeleted: false } },
      { $group: { _id: '$entityId', count: { $sum: 1 } } },
    ]),
    Attachment.aggregate([
      { $match: { entityType: 'task', entityId: { $in: taskIds }, isDeleted: false } },
      { $group: { _id: '$entityId', count: { $sum: 1 } } },
    ]),
  ]);

  const subMap = new Map(subCounts.map((s) => [String(s._id), s]));
  const cMap = new Map(commentCounts.map((c) => [String(c._id), c.count]));
  const aMap = new Map(attachCounts.map((a) => [String(a._id), a.count]));

  const now = new Date();
  const enriched = tasks.map((t) => ({
    ...t,
    isOverdue: Boolean(t.dueDate && new Date(t.dueDate) < now && t.status !== 'Completed'),
    subtaskSummary: subMap.get(String(t._id)) || { total: 0, completed: 0 },
    commentCount: cMap.get(String(t._id)) || 0,
    attachmentCount: aMap.get(String(t._id)) || 0,
  }));

  return sendSuccess(res, enriched, 'Tasks retrieved', 200, buildPaginationMeta(total, page, limit));
});

export const createTask = asyncHandler(async (req, res) => {
  const task = await createTaskService(req.validatedBody, req.user);
  const populated = await Task.findById(task._id)
    .populate('ticket', 'ticketId title')
    .populate('client', 'companyName clientFolderCode')
    .populate('assignedEmployees', 'fullName designation avatarColor');
  return sendSuccess(res, populated, 'Task created successfully', 201);
});

export const getTaskById = asyncHandler(async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, isDeleted: false })
    .populate('ticket', 'ticketId title status priority')
    .populate('parentTask', 'taskId title')
    .populate('dependencies', 'taskId title status')
    .populate('client', 'clientId companyName clientFolderCode')
    .populate('project', 'projectId name')
    .populate('assignedEmployees', 'employeeId fullName email designation avatarColor')
    .populate('createdBy', 'fullName')
    .populate('statusHistory.changedBy', 'fullName')
    .lean();

  if (!task) throw new AppError('Task not found.', 404);

  const [subtasks, comments, attachments, timeLogs, activityLogs] = await Promise.all([
    Task.find({ parentTask: task._id, isDeleted: false })
      .populate('assignedEmployees', 'fullName designation avatarColor')
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean(),
    Comment.find({ entityType: 'task', entityId: task._id, isDeleted: false })
      .populate('author', 'fullName designation avatarColor')
      .populate('mentions', 'fullName')
      .sort({ createdAt: 1 })
      .lean(),
    Attachment.find({ entityType: 'task', entityId: task._id, isDeleted: false })
      .populate('uploadedBy', 'fullName')
      .sort({ createdAt: -1 })
      .lean(),
    TimeLog.find({ task: task._id, isDeleted: false })
      .populate('employee', 'fullName designation')
      .sort({ date: -1 })
      .lean(),
    ActivityLog.find({ entityType: 'task', entityId: task._id })
      .populate('actor', 'fullName designation avatarColor')
      .sort({ createdAt: -1 })
      .limit(30)
      .lean(),
  ]);

  return sendSuccess(
    res,
    {
      ...task,
      isOverdue: Boolean(task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'Completed'),
      subtasks,
      comments,
      attachments,
      timeLogs,
      activityLogs,
    },
    'Task details fetched'
  );
});

export const updateTask = asyncHandler(async (req, res) => {
  const updates = { ...req.validatedBody };
  if (updates.ticket === '') updates.ticket = null;
  if (updates.client === '') updates.client = null;
  if (updates.project === '') updates.project = null;

  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    updates,
    { new: true, runValidators: true }
  )
    .populate('ticket', 'ticketId title')
    .populate('client', 'companyName clientFolderCode')
    .populate('assignedEmployees', 'fullName designation avatarColor');

  if (!task) throw new AppError('Task not found.', 404);

  await recordActivity({
    actor: req.user._id,
    action: 'TASK_UPDATED',
    entityType: 'task',
    entityId: task._id,
    entityRef: task.taskId,
    client: task.client?._id || task.client,
    ticket: task.ticket?._id || task.ticket,
    summary: `Updated task ${task.taskId}: ${task.title}`,
  });

  await recalculateParentTaskProgress(task.parentTask);
  await recalculateProjectProgress(task.project);
  emitBroadcast('task:changed', { action: 'updated', taskId: task._id, actorId: req.user._id });
  return sendSuccess(res, task, 'Task updated successfully');
});

export const updateTaskStatus = asyncHandler(async (req, res) => {
  const task = await changeTaskStatusService(req.params.id, req.validatedBody, req.user);
  return sendSuccess(res, task, `Task status updated to ${task.status}`);
});

export const assignTask = asyncHandler(async (req, res) => {
  const task = await assignTaskService(req.params.id, req.validatedBody, req.user);
  const populated = await Task.findById(task._id)
    .populate('ticket', 'ticketId title')
    .populate('client', 'companyName clientFolderCode')
    .populate('assignedEmployees', 'fullName designation avatarColor');
  return sendSuccess(res, populated, 'Task assignment updated');
});

export const reorderTask = asyncHandler(async (req, res) => {
  const task = await reorderTaskService(req.validatedBody, req.user);
  const populated = await Task.findById(task._id)
    .populate('ticket', 'ticketId title priority status')
    .populate('client', 'clientId companyName clientFolderCode')
    .populate('project', 'projectId name')
    .populate('assignedEmployees', 'fullName designation avatarColor');
  return sendSuccess(res, populated, 'Task order updated');
});

export const bulkTaskAction = asyncHandler(async (req, res) => {
  const updated = await bulkTaskActionService(req.validatedBody, req.user);
  return sendSuccess(res, { count: updated.length }, `Bulk action applied to ${updated.length} task(s)`);
});

export const deleteTask = asyncHandler(async (req, res) => {
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    { isDeleted: true, deletedAt: new Date() },
    { new: true }
  );
  if (!task) throw new AppError('Task not found.', 404);

  await recordActivity({
    actor: req.user._id,
    action: 'TASK_ARCHIVED',
    entityType: 'task',
    entityId: task._id,
    entityRef: task.taskId,
    client: task.client,
    ticket: task.ticket,
    summary: `Soft-deleted task ${task.taskId}`,
  });

  await recalculateProjectProgress(task.project);
  return sendSuccess(res, null, 'Task archived successfully');
});
