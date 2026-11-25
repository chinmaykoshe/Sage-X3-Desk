import Ticket from '../models/Ticket.js';
import Task from '../models/Task.js';
import Deployment from '../models/Deployment.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import {
  buildDateRangeFilter,
  getDashboardReportService,
  getWorkloadReportService,
  getTimeTrackingReportService,
} from '../services/reportService.js';

export const getDashboardReport = asyncHandler(async (req, res) => {
  const { range, startDate, endDate } = req.query;
  const data = await getDashboardReportService({ range, startDate, endDate, user: req.user });
  return sendSuccess(res, data, 'Dashboard metrics retrieved');
});

export const getTicketsReport = asyncHandler(async (req, res) => {
  const { range, startDate, endDate, client } = req.query;
  const dateFilter = buildDateRangeFilter(range, startDate, endDate);
  const match = { isDeleted: false };
  if (dateFilter) match.createdAt = dateFilter;

  const now = new Date();
  const [byClient, resolutionStats, overdueList, slaStats, categoryBreakdown] = await Promise.all([
    Ticket.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$client',
          total: { $sum: 1 },
          open: { $sum: { $cond: [{ $not: [{ $in: ['$status', ['Resolved', 'Closed']] }] }, 1, 0] } },
          resolved: { $sum: { $cond: [{ $in: ['$status', ['Resolved', 'Closed']] }, 1, 0] } },
          critical: { $sum: { $cond: [{ $eq: ['$priority', 'Critical'] }, 1, 0] } },
        },
      },
      { $lookup: { from: 'clients', localField: '_id', foreignField: '_id', as: 'c' } },
      { $unwind: '$c' },
      {
        $project: {
          clientId: '$c.clientId',
          companyName: '$c.companyName',
          folderCode: '$c.clientFolderCode',
          total: 1,
          open: 1,
          resolved: 1,
          critical: 1,
        },
      },
      { $sort: { total: -1 } },
    ]),
    Ticket.aggregate([
      { $match: { ...match, resolvedAt: { $ne: null } } },
      {
        $project: {
          resolutionHours: {
            $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 1000 * 60 * 60],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgResolutionHours: { $avg: '$resolutionHours' },
          totalResolved: { $sum: 1 },
        },
      },
    ]),
    Ticket.find({
      isDeleted: false,
      ...(client ? { client } : {}),
      dueDate: { $lt: now },
      status: { $nin: ['Resolved', 'Closed'] },
    })
      .populate('client', 'companyName clientFolderCode')
      .populate('assignedDevelopers', 'fullName')
      .sort({ dueDate: 1 })
      .lean(),
    Ticket.aggregate([
      { $match: { ...match, slaMet: { $ne: null } } },
      {
        $group: {
          _id: null,
          totalEvaluated: { $sum: 1 },
          metCount: { $sum: { $cond: ['$slaMet', 1, 0] } },
        },
      },
    ]),
    Ticket.aggregate([
      { $match: match },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $project: { name: '$_id', count: 1, _id: 0 } },
      { $sort: { count: -1 } },
    ]),
  ]);

  const taskStats = await Task.aggregate([
    { $match: { isDeleted: false } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $project: { status: '$_id', count: 1, _id: 0 } },
  ]);

  const deploymentsSummary = await Deployment.aggregate([
    { $match: { isDeleted: false } },
    { $group: { _id: '$environment', count: { $sum: 1 } } },
    { $project: { environment: '$_id', count: 1, _id: 0 } },
  ]);

  const slaData = slaStats[0] || { totalEvaluated: 0, metCount: 0 };
  const slaComplianceRate =
    slaData.totalEvaluated > 0 ? Math.round((slaData.metCount / slaData.totalEvaluated) * 100) : 100;

  return sendSuccess(
    res,
    {
      byClient,
      resolution: {
        avgResolutionHours: Number((resolutionStats[0]?.avgResolutionHours || 0).toFixed(1)),
        totalResolved: resolutionStats[0]?.totalResolved || 0,
      },
      sla: {
        ...slaData,
        complianceRate: slaComplianceRate,
      },
      overdueTickets: overdueList,
      categoryBreakdown,
      taskStats,
      deploymentsSummary,
    },
    'Ticket & operational reports retrieved'
  );
});

export const getWorkloadReport = asyncHandler(async (req, res) => {
  const data = await getWorkloadReportService(req.query);
  return sendSuccess(res, data, 'Team workload report retrieved');
});

export const getTimeTrackingReport = asyncHandler(async (req, res) => {
  const data = await getTimeTrackingReportService(req.query);
  return sendSuccess(res, data, 'Time tracking report retrieved');
});
