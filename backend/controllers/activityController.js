import ActivityLog from '../../db/models/ActivityLog.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, buildPagination, buildPaginationMeta } from '../utils/response.js';

export const getActivityLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query);
  const { entityType, client, actor, search } = req.query;

  const filter = {};
  if (entityType) filter.entityType = entityType;
  if (client) filter.client = client;
  if (actor) filter.actor = actor;
  if (search) {
    filter.$or = [
      { summary: { $regex: search, $options: 'i' } },
      { entityRef: { $regex: search, $options: 'i' } },
      { action: { $regex: search, $options: 'i' } },
    ];
  }

  const [logs, total] = await Promise.all([
    ActivityLog.find(filter)
      .populate('actor', 'fullName designation avatarColor')
      .populate('client', 'companyName clientFolderCode')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ActivityLog.countDocuments(filter),
  ]);

  return sendSuccess(res, logs, 'Activity logs retrieved', 200, buildPaginationMeta(total, page, limit));
});
