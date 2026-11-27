import Client from '../models/Client.js';
import Environment from '../models/Environment.js';
import Ticket from '../models/Ticket.js';
import Task from '../models/Task.js';
import Project from '../models/Project.js';
import Deployment from '../models/Deployment.js';
import ActivityLog from '../models/ActivityLog.js';
import Attachment from '../models/Attachment.js';
import { getNextSequence } from '../models/Counter.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, buildPagination, buildPaginationMeta } from '../utils/response.js';
import { recordActivity } from '../services/activityService.js';

export const getClients = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query);
  const { search, status } = req.query;

  const filter = { isDeleted: false };
  if (status) filter.accountStatus = status;
  if (search) {
    filter.$or = [
      { companyName: { $regex: search, $options: 'i' } },
      { clientId: { $regex: search, $options: 'i' } },
      { clientFolderCode: { $regex: search, $options: 'i' } },
      { primaryContactPerson: { $regex: search, $options: 'i' } },
    ];
  }

  const [clients, total] = await Promise.all([
    Client.find(filter)
      .populate('accountManager', 'fullName email designation')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Client.countDocuments(filter),
  ]);

  const clientIds = clients.map((c) => c._id);
  const [ticketStats, projectStats] = await Promise.all([
    Ticket.aggregate([
      { $match: { client: { $in: clientIds }, isDeleted: false } },
      {
        $group: {
          _id: '$client',
          totalTickets: { $sum: 1 },
          openTickets: {
            $sum: { $cond: [{ $not: [{ $in: ['$status', ['Resolved', 'Closed']] }] }, 1, 0] },
          },
        },
      },
    ]),
    Project.aggregate([
      { $match: { client: { $in: clientIds }, isDeleted: false } },
      { $group: { _id: '$client', totalProjects: { $sum: 1 } } },
    ]),
  ]);

  const ticketMap = new Map(ticketStats.map((s) => [String(s._id), s]));
  const projectMap = new Map(projectStats.map((s) => [String(s._id), s]));

  const enriched = clients.map((c) => ({
    ...c,
    stats: {
      totalTickets: ticketMap.get(String(c._id))?.totalTickets || 0,
      openTickets: ticketMap.get(String(c._id))?.openTickets || 0,
      totalProjects: projectMap.get(String(c._id))?.totalProjects || 0,
    },
  }));

  return sendSuccess(res, enriched, 'Clients retrieved', 200, buildPaginationMeta(total, page, limit));
});

export const createClient = asyncHandler(async (req, res) => {
  const payload = req.validatedBody;
  const clientId = await getNextSequence('client', 'CLI', 101);
  const { environments = [], ...clientData } = payload;

  const client = await Client.create({
    ...clientData,
    accountManager: clientData.accountManager || null,
    clientId,
  });

  // Create default environments if none provided
  const envsToCreate =
    environments.length > 0
      ? environments
      : [
          ...(client.pilotFolderCode
            ? [{ name: 'Pilot', environmentType: 'Pilot', folderCode: client.pilotFolderCode }]
            : []),
          ...(client.productionFolderCode
            ? [{ name: 'Production', environmentType: 'Production', folderCode: client.productionFolderCode }]
            : []),
        ];

  if (envsToCreate.length > 0) {
    await Environment.insertMany(envsToCreate.map((e) => ({ ...e, client: client._id })));
  }

  await recordActivity({
    actor: req.user._id,
    action: 'CLIENT_CREATED',
    entityType: 'client',
    entityId: client._id,
    entityRef: client.clientId,
    client: client._id,
    summary: `Created client ${client.clientId} - ${client.companyName} (${client.clientFolderCode})`,
  });

  return sendSuccess(res, client, 'Client created successfully', 201);
});

export const getClientById = asyncHandler(async (req, res) => {
  const client = await Client.findOne({ _id: req.params.id, isDeleted: false })
    .populate('accountManager', 'fullName email designation')
    .lean();

  if (!client) throw new AppError('Client not found.', 404);

  const [environments, tickets, tasks, projects, deployments, activityLogs, documents] = await Promise.all([
    Environment.find({ client: client._id, isDeleted: false }).sort({ createdAt: 1 }).lean(),
    Ticket.find({ client: client._id, isDeleted: false })
      .populate('assignedDevelopers', 'fullName designation avatarColor')
      .sort({ createdAt: -1 })
      .lean(),
    Task.find({ client: client._id, isDeleted: false })
      .populate('assignedEmployees', 'fullName designation')
      .populate('ticket', 'ticketId title')
      .sort({ createdAt: -1 })
      .lean(),
    Project.find({ client: client._id, isDeleted: false })
      .populate('projectManager', 'fullName')
      .sort({ createdAt: -1 })
      .lean(),
    Deployment.find({ client: client._id, isDeleted: false })
      .populate('deployedBy', 'fullName')
      .populate('approvedBy', 'fullName')
      .populate('ticket', 'ticketId title')
      .sort({ deploymentDate: -1 })
      .lean(),
    ActivityLog.find({ client: client._id })
      .populate('actor', 'fullName designation avatarColor')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    Attachment.find({ entityType: 'client', entityId: client._id, isDeleted: false })
      .populate('uploadedBy', 'fullName')
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const stats = {
    totalTickets: tickets.length,
    openTickets: tickets.filter((t) => !['Resolved', 'Closed'].includes(t.status)).length,
    resolvedTickets: tickets.filter((t) => ['Resolved', 'Closed'].includes(t.status)).length,
    totalTasks: tasks.length,
    pendingTasks: tasks.filter((t) => t.status !== 'Completed').length,
    activeProjects: projects.filter((p) => p.status === 'Active').length,
    productionDeployments: deployments.filter((d) => d.environment === 'Production').length,
  };

  return sendSuccess(
    res,
    {
      ...client,
      stats,
      environments,
      tickets,
      tasks,
      projects,
      deployments,
      activityLogs,
      documents,
    },
    'Client profile fetched'
  );
});

export const updateClient = asyncHandler(async (req, res) => {
  const payload = req.validatedBody;
  const { environments, ...updates } = payload;
  if (updates.accountManager === '') updates.accountManager = null;

  const client = await Client.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    updates,
    { new: true, runValidators: true }
  );
  if (!client) throw new AppError('Client not found.', 404);

  await recordActivity({
    actor: req.user._id,
    action: 'CLIENT_UPDATED',
    entityType: 'client',
    entityId: client._id,
    entityRef: client.clientId,
    client: client._id,
    summary: `Updated client profile ${client.clientId} - ${client.companyName}`,
  });

  return sendSuccess(res, client, 'Client updated successfully');
});

export const deleteClient = asyncHandler(async (req, res) => {
  const client = await Client.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    { isActive: false, accountStatus: 'Inactive' },
    { new: true }
  );
  if (!client) throw new AppError('Client not found.', 404);

  await recordActivity({
    actor: req.user._id,
    action: 'CLIENT_DEACTIVATED',
    entityType: 'client',
    entityId: client._id,
    entityRef: client.clientId,
    client: client._id,
    summary: `Marked client ${client.clientId} - ${client.companyName} as Inactive`,
  });

  return sendSuccess(res, client, 'Client marked as Inactive');
});

export const addClientEnvironment = asyncHandler(async (req, res) => {
  const client = await Client.findOne({ _id: req.params.id, isDeleted: false });
  if (!client) throw new AppError('Client not found.', 404);

  const env = await Environment.create({
    ...req.validatedBody,
    client: client._id,
  });

  await recordActivity({
    actor: req.user._id,
    action: 'CLIENT_ENV_ADDED',
    entityType: 'client',
    entityId: client._id,
    entityRef: client.clientId,
    client: client._id,
    summary: `Added Sage X3 environment ${env.name} (${env.folderCode}) to ${client.companyName}`,
  });

  return sendSuccess(res, env, 'Environment added', 201);
});

export const deleteClientEnvironment = asyncHandler(async (req, res) => {
  const env = await Environment.findOneAndUpdate(
    { _id: req.params.envId, client: req.params.id, isDeleted: false },
    { isDeleted: true },
    { new: true }
  );
  if (!env) throw new AppError('Environment not found.', 404);
  return sendSuccess(res, null, 'Environment removed');
});
