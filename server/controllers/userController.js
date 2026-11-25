import User from '../models/User.js';
import Ticket from '../models/Ticket.js';
import Task from '../models/Task.js';
import TimeLog from '../models/TimeLog.js';
import ActivityLog from '../models/ActivityLog.js';
import { getNextSequence } from '../models/Counter.js';
import { ROLES } from '../config/constants.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, buildPagination, buildPaginationMeta } from '../utils/response.js';
import { recordActivity } from '../services/activityService.js';

const AVATAR_COLORS = ['#2563eb', '#0d9488', '#7c3aed', '#d97706', '#dc2626', '#059669', '#4f46e5'];

export const getUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination({ ...req.query, limit: req.query.limit || 50 });
  const { search, role, status, department } = req.query;

  const filter = { isDeleted: false, role: { $ne: ROLES.CLIENT } };
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (department) filter.department = department;
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { employeeId: { $regex: search, $options: 'i' } },
      { designation: { $regex: search, $options: 'i' } },
      { skills: { $regex: search, $options: 'i' } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter).populate('team', 'name').sort({ fullName: 1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  const userIds = users.map((u) => u._id);
  const now = new Date();

  const [tickets, tasks, timeLogs] = await Promise.all([
    Ticket.find({ assignedDevelopers: { $in: userIds }, isDeleted: false })
      .select('assignedDevelopers status')
      .lean(),
    Task.find({ assignedEmployees: { $in: userIds }, isDeleted: false })
      .select('assignedEmployees status dueDate')
      .lean(),
    TimeLog.aggregate([
      { $match: { employee: { $in: userIds }, isDeleted: false } },
      { $group: { _id: '$employee', totalHours: { $sum: '$hoursSpent' } } },
    ]),
  ]);

  const hoursMap = new Map(timeLogs.map((t) => [String(t._id), Number(t.totalHours.toFixed(2))]));

  const enriched = users.map((u) => {
    const uid = String(u._id);
    const uTickets = tickets.filter((t) => t.assignedDevelopers.some((d) => String(d) === uid));
    const uTasks = tasks.filter((t) => t.assignedEmployees.some((e) => String(e) === uid));
    return {
      ...u,
      workload: {
        assignedTickets: uTickets.length,
        openTickets: uTickets.filter((t) => !['Resolved', 'Closed'].includes(t.status)).length,
        activeTasks: uTasks.filter((t) => t.status === 'In Progress').length,
        pendingTasks: uTasks.filter((t) => !['Completed', 'In Progress'].includes(t.status)).length,
        completedTasks: uTasks.filter((t) => t.status === 'Completed').length,
        overdueTasks: uTasks.filter((t) => t.status !== 'Completed' && t.dueDate && new Date(t.dueDate) < now).length,
        loggedHours: hoursMap.get(uid) || 0,
      },
    };
  });

  return sendSuccess(res, enriched, 'Employees retrieved', 200, buildPaginationMeta(total, page, limit));
});

export const createUser = asyncHandler(async (req, res) => {
  const payload = req.validatedBody;
  const existing = await User.findOne({ email: payload.email.toLowerCase() });
  if (existing) throw new AppError('Email already in use.', 409);

  const employeeId = await getNextSequence('employee', 'EMP', 101);
  const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

  const user = await User.create({
    ...payload,
    team: payload.team || null,
    email: payload.email.toLowerCase(),
    employeeId,
    avatarColor,
  });

  await recordActivity({
    actor: req.user._id,
    action: 'USER_CREATED',
    entityType: 'user',
    entityId: user._id,
    entityRef: user.employeeId,
    summary: `Added team member ${user.fullName} (${user.role})`,
  });

  return sendSuccess(res, user, 'Employee created successfully', 201);
});

export const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, isDeleted: false })
    .populate('team', 'name')
    .lean();
  if (!user) throw new AppError('Employee not found.', 404);

  const [tickets, tasks, timeLogs, activityLogs] = await Promise.all([
    Ticket.find({ assignedDevelopers: user._id, isDeleted: false })
      .populate('client', 'companyName clientFolderCode')
      .sort({ createdAt: -1 })
      .lean(),
    Task.find({ assignedEmployees: user._id, isDeleted: false })
      .populate('ticket', 'ticketId title')
      .populate('client', 'companyName')
      .sort({ createdAt: -1 })
      .lean(),
    TimeLog.find({ employee: user._id, isDeleted: false })
      .populate('ticket', 'ticketId title')
      .populate('task', 'taskId title')
      .sort({ date: -1 })
      .limit(30)
      .lean(),
    ActivityLog.find({ actor: user._id }).sort({ createdAt: -1 }).limit(30).lean(),
  ]);

  return sendSuccess(
    res,
    {
      ...user,
      tickets,
      tasks,
      timeLogs,
      activityLogs,
    },
    'Employee profile fetched'
  );
});

export const updateUser = asyncHandler(async (req, res) => {
  const payload = { ...req.validatedBody };
  if (payload.team === '') payload.team = null;

  const user = await User.findOne({ _id: req.params.id, isDeleted: false }).select('+password');
  if (!user) throw new AppError('Employee not found.', 404);

  Object.entries(payload).forEach(([key, val]) => {
    if (key === 'password' && !val) return;
    if (val !== undefined) {
      user[key] = val;
    }
  });

  await user.save();

  await recordActivity({
    actor: req.user._id,
    action: 'USER_UPDATED',
    entityType: 'user',
    entityId: user._id,
    entityRef: user.employeeId,
    summary: `Updated employee ${user.fullName} (${user.employeeId})`,
  });

  return sendSuccess(res, user.toJSON(), 'Employee updated successfully');
});

export const deleteUser = asyncHandler(async (req, res) => {
  if (String(req.user._id) === String(req.params.id)) {
    throw new AppError('You cannot archive your own active account.', 400);
  }
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    { isDeleted: true, deletedAt: new Date(), status: 'Inactive' },
    { new: true }
  );
  if (!user) throw new AppError('Employee not found.', 404);
  return sendSuccess(res, null, 'Employee archived successfully');
});
