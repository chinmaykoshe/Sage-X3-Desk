import TimeLog from '../models/TimeLog.js';
import Task from '../models/Task.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, buildPagination, buildPaginationMeta } from '../utils/response.js';
import { recordActivity } from '../services/activityService.js';

export const getTimeLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query);
  const { task, ticket, client, employee, startDate, endDate } = req.query;

  const filter = { isDeleted: false };
  if (task) filter.task = task;
  if (ticket) filter.ticket = ticket;
  if (client) filter.client = client;
  if (employee) filter.employee = employee;
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = new Date(startDate);
    if (endDate) filter.date.$lte = new Date(endDate);
  }

  const [logs, total] = await Promise.all([
    TimeLog.find(filter)
      .populate('employee', 'fullName designation avatarColor')
      .populate('task', 'taskId title')
      .populate('ticket', 'ticketId title')
      .populate('client', 'companyName clientFolderCode')
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
  const task = await Task.findOne({ _id: payload.task, isDeleted: false });
  if (!task) throw new AppError('Task not found.', 404);

  const log = await TimeLog.create({
    employee: req.user._id,
    task: task._id,
    ticket: payload.ticket || task.ticket || null,
    client: payload.client || task.client || null,
    date: payload.date ? new Date(payload.date) : new Date(),
    hoursSpent: payload.hoursSpent,
    workDescription: payload.workDescription,
    billable: payload.billable ?? true,
  });

  // Update task actualHours atomically
  const agg = await TimeLog.aggregate([
    { $match: { task: task._id, isDeleted: false } },
    { $group: { _id: '$task', total: { $sum: '$hoursSpent' } } },
  ]);
  task.actualHours = Number((agg[0]?.total || 0).toFixed(2));
  await task.save();

  await recordActivity({
    actor: req.user._id,
    action: 'TIME_LOGGED',
    entityType: 'timeLog',
    entityId: log._id,
    entityRef: task.taskId,
    client: task.client,
    ticket: task.ticket,
    summary: `Logged ${payload.hoursSpent}h on ${task.taskId}: ${payload.workDescription}`,
  });

  const populated = await TimeLog.findById(log._id)
    .populate('employee', 'fullName designation')
    .populate('task', 'taskId title')
    .populate('ticket', 'ticketId title');

  return sendSuccess(res, populated, 'Time logged successfully', 201);
});

export const deleteTimeLog = asyncHandler(async (req, res) => {
  const log = await TimeLog.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    { isDeleted: true },
    { new: true }
  );
  if (!log) throw new AppError('Time log not found.', 404);

  const agg = await TimeLog.aggregate([
    { $match: { task: log.task, isDeleted: false } },
    { $group: { _id: '$task', total: { $sum: '$hoursSpent' } } },
  ]);
  await Task.findByIdAndUpdate(log.task, {
    actualHours: Number((agg[0]?.total || 0).toFixed(2)),
  });

  return sendSuccess(res, null, 'Time log deleted');
});
