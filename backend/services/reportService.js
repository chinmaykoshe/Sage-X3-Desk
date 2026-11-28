import dayjs from 'dayjs';
import Client from '../../db/models/Client.js';
import Ticket from '../../db/models/Ticket.js';
import Task from '../../db/models/Task.js';
import Project from '../../db/models/Project.js';
import User from '../../db/models/User.js';
import Deployment from '../../db/models/Deployment.js';
import TimeLog from '../../db/models/TimeLog.js';
import ActivityLog from '../../db/models/ActivityLog.js';
import { ROLES } from '../config/constants.js';

export function buildDateRangeFilter(range, startDate, endDate) {
  const now = dayjs();
  if (range === 'today') {
    return { $gte: now.startOf('day').toDate(), $lte: now.endOf('day').toDate() };
  }
  if (range === 'week') {
    return { $gte: now.startOf('week').toDate(), $lte: now.endOf('week').toDate() };
  }
  if (range === 'month') {
    return { $gte: now.startOf('month').toDate(), $lte: now.endOf('month').toDate() };
  }
  if (range === 'custom' && (startDate || endDate)) {
    const f = {};
    if (startDate) f.$gte = dayjs(startDate).startOf('day').toDate();
    if (endDate) f.$lte = dayjs(endDate).endOf('day').toDate();
    return f;
  }
  return null;
}

export async function getDashboardReportService({ range, startDate, endDate, user }) {
  const now = new Date();
  const dateFilter = buildDateRangeFilter(range, startDate, endDate);

  const ticketScope = { isDeleted: false, approvalStatus: 'APPROVED' };
  const taskScope = { isDeleted: false };

  // Role-adapted dashboard: developers see team totals or personal scope clearly highlighted
  if (user.role === ROLES.DEVELOPER) {
    ticketScope.$or = [{ assignedDevelopers: user._id }, { createdBy: user._id }];
    taskScope.assignedEmployees = user._id;
  }

  const createdScope = dateFilter ? { createdAt: dateFilter } : {};

  const [
    totalClients,
    totalOpenTickets,
    ticketsInProgress,
    ticketsAwaitingResponse,
    resolvedTickets,
    overdueTickets,
    totalPendingTasks,
    completedTasks,
    activeProjects,
    activeTeamMembers,
    ticketsByStatus,
    ticketsByPriority,
    ticketsByClient,
    tasksByEmployee,
    monthlyTrendRaw,
    recentActivity,
    pendingDeployments,
  ] = await Promise.all([
    Client.countDocuments({ isDeleted: false, accountStatus: 'Active' }),
    Ticket.countDocuments({
      ...ticketScope,
      ...createdScope,
      status: { $nin: ['Resolved', 'Closed'] },
    }),
    Ticket.countDocuments({ ...ticketScope, ...createdScope, status: 'In Progress' }),
    Ticket.countDocuments({ ...ticketScope, ...createdScope, status: 'Awaiting Client Response' }),
    Ticket.countDocuments({ ...ticketScope, ...createdScope, status: { $in: ['Resolved', 'Closed'] } }),
    Ticket.countDocuments({
      ...ticketScope,
      dueDate: { $lt: now },
      status: { $nin: ['Resolved', 'Closed'] },
    }),
    Task.countDocuments({ ...taskScope, ...createdScope, status: { $ne: 'Completed' } }),
    Task.countDocuments({ ...taskScope, ...createdScope, status: 'Completed' }),
    Project.countDocuments({ isDeleted: false, status: 'Active' }),
    User.countDocuments({ isDeleted: false, status: 'Active', role: { $ne: ROLES.CLIENT } }),
    Ticket.aggregate([
      { $match: { ...ticketScope, ...createdScope } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { name: '$_id', value: '$count', _id: 0 } },
    ]),
    Ticket.aggregate([
      { $match: { ...ticketScope, ...createdScope } },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
      { $project: { name: '$_id', value: '$count', _id: 0 } },
    ]),
    Ticket.aggregate([
      { $match: { ...ticketScope, ...createdScope } },
      { $group: { _id: '$client', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
      {
        $lookup: {
          from: 'clients',
          localField: '_id',
          foreignField: '_id',
          as: 'clientDoc',
        },
      },
      { $unwind: { path: '$clientDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: { $ifNull: ['$clientDoc.companyName', 'Unknown'] },
          folder: { $ifNull: ['$clientDoc.clientFolderCode', ''] },
          count: 1,
          _id: 0,
        },
      },
    ]),
    Task.aggregate([
      { $match: { isDeleted: false, status: { $ne: 'Completed' } } },
      { $unwind: '$assignedEmployees' },
      { $group: { _id: '$assignedEmployees', activeTasks: { $sum: 1 } } },
      { $sort: { activeTasks: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'emp',
        },
      },
      { $unwind: '$emp' },
      {
        $project: {
          name: '$emp.fullName',
          designation: '$emp.designation',
          activeTasks: 1,
          _id: 0,
        },
      },
    ]),
    Ticket.aggregate([
      {
        $match: {
          isDeleted: false,
          createdAt: { $gte: dayjs().subtract(5, 'month').startOf('month').toDate() },
        },
      },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          created: { $sum: 1 },
          resolved: {
            $sum: { $cond: [{ $in: ['$status', ['Resolved', 'Closed']] }, 1, 0] },
          },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    ActivityLog.find(user.role === ROLES.DEVELOPER ? { actor: user._id } : {})
      .sort({ createdAt: -1 })
      .limit(12)
      .populate('actor', 'fullName designation avatarColor')
      .populate('client', 'companyName clientFolderCode')
      .lean(),
    Deployment.countDocuments({ isDeleted: false, approvalStatus: 'Pending' }),
  ]);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyTrend = monthlyTrendRaw.map((m) => ({
    month: `${monthNames[m._id.month - 1]} ${String(m._id.year).slice(-2)}`,
    created: m.created,
    resolved: m.resolved,
  }));

  return {
    roleScope: user.role,
    kpis: {
      totalClients,
      totalOpenTickets,
      ticketsInProgress,
      ticketsAwaitingResponse,
      resolvedTickets,
      overdueTickets,
      totalPendingTasks,
      completedTasks,
      activeProjects,
      activeTeamMembers,
      pendingDeployments,
    },
    charts: {
      ticketsByStatus,
      ticketsByPriority,
      ticketsByClient,
      tasksByEmployee,
      monthlyTrend,
    },
    recentActivity,
  };
}

export async function getWorkloadReportService({ startDate, endDate }) {
  const now = new Date();
  const timeMatch = { isDeleted: false };
  if (startDate || endDate) {
    timeMatch.date = {};
    if (startDate) timeMatch.date.$gte = dayjs(startDate).startOf('day').toDate();
    if (endDate) timeMatch.date.$lte = dayjs(endDate).endOf('day').toDate();
  }

  const users = await User.find({ isDeleted: false, role: { $ne: ROLES.CLIENT } })
    .select('employeeId fullName email designation department role status avatarColor skills')
    .lean();

  const [tickets, tasks, timeLogs] = await Promise.all([
    Ticket.find({ isDeleted: false }).select('assignedDevelopers status dueDate').lean(),
    Task.find({ isDeleted: false }).select('assignedEmployees status dueDate estimatedHours actualHours').lean(),
    TimeLog.find(timeMatch).select('employee hoursSpent').lean(),
  ]);

  return users.map((u) => {
    const uid = String(u._id);
    const userTickets = tickets.filter((t) => (t.assignedDevelopers || []).some((d) => String(d) === uid));
    const openTickets = userTickets.filter((t) => !['Resolved', 'Closed'].includes(t.status)).length;
    const userTasks = tasks.filter((t) => (t.assignedEmployees || []).some((e) => String(e) === uid));
    const activeTasks = userTasks.filter((t) => t.status === 'In Progress').length;
    const pendingTasks = userTasks.filter((t) => !['Completed', 'In Progress'].includes(t.status)).length;
    const completedTasks = userTasks.filter((t) => t.status === 'Completed').length;
    const overdueTasks = userTasks.filter(
      (t) => t.status !== 'Completed' && t.dueDate && new Date(t.dueDate) < now
    ).length;
    const loggedHours = timeLogs
      .filter((l) => String(l.employee) === uid)
      .reduce((acc, l) => acc + (l.hoursSpent || 0), 0);

    return {
      ...u,
      workload: {
        assignedTickets: userTickets.length,
        openTickets,
        activeTasks,
        pendingTasks,
        completedTasks,
        overdueTasks,
        loggedHours: Number(loggedHours.toFixed(2)),
      },
    };
  });
}

export async function getTimeTrackingReportService({ startDate, endDate }) {
  const match = { isDeleted: false };
  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = dayjs(startDate).startOf('day').toDate();
    if (endDate) match.date.$lte = dayjs(endDate).endOf('day').toDate();
  }

  const [byTicket, byClient, byEmployee, estVsActual] = await Promise.all([
    TimeLog.aggregate([
      { $match: { ...match, ticket: { $ne: null } } },
      { $group: { _id: '$ticket', totalHours: { $sum: '$hoursSpent' }, entries: { $sum: 1 } } },
      { $sort: { totalHours: -1 } },
      { $limit: 15 },
      { $lookup: { from: 'tickets', localField: '_id', foreignField: '_id', as: 'ticketDoc' } },
      { $unwind: '$ticketDoc' },
      {
        $project: {
          ticketId: '$ticketDoc.ticketId',
          title: '$ticketDoc.title',
          totalHours: { $round: ['$totalHours', 2] },
          entries: 1,
        },
      },
    ]),
    TimeLog.aggregate([
      { $match: { ...match, client: { $ne: null } } },
      { $group: { _id: '$client', totalHours: { $sum: '$hoursSpent' }, entries: { $sum: 1 } } },
      { $sort: { totalHours: -1 } },
      { $lookup: { from: 'clients', localField: '_id', foreignField: '_id', as: 'clientDoc' } },
      { $unwind: '$clientDoc' },
      {
        $project: {
          clientId: '$clientDoc.clientId',
          companyName: '$clientDoc.companyName',
          folderCode: '$clientDoc.clientFolderCode',
          totalHours: { $round: ['$totalHours', 2] },
          entries: 1,
        },
      },
    ]),
    TimeLog.aggregate([
      { $match: match },
      { $group: { _id: '$employee', totalHours: { $sum: '$hoursSpent' }, entries: { $sum: 1 } } },
      { $sort: { totalHours: -1 } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'empDoc' } },
      { $unwind: '$empDoc' },
      {
        $project: {
          employeeId: '$empDoc.employeeId',
          fullName: '$empDoc.fullName',
          designation: '$empDoc.designation',
          totalHours: { $round: ['$totalHours', 2] },
          entries: 1,
        },
      },
    ]),
    Task.find({ isDeleted: false, $or: [{ estimatedHours: { $gt: 0 } }, { actualHours: { $gt: 0 } }] })
      .populate('ticket', 'ticketId title')
      .populate('client', 'companyName')
      .select('taskId title estimatedHours actualHours status')
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean(),
  ]);

  return { byTicket, byClient, byEmployee, estVsActual };
}
