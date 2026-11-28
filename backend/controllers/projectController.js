import Project from '../../db/models/Project.js';
import Milestone from '../../db/models/Milestone.js';
import Ticket from '../../db/models/Ticket.js';
import Task from '../../db/models/Task.js';
import { getNextSequence } from '../../db/models/Counter.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, buildPagination, buildPaginationMeta } from '../utils/response.js';
import { recordActivity } from '../services/activityService.js';

export const getProjects = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query);
  const { search, status, client } = req.query;

  const filter = { isDeleted: false };
  if (status) filter.status = status;
  if (client) filter.client = client;
  if (search) {
    filter.$or = [
      { projectId: { $regex: search, $options: 'i' } },
      { name: { $regex: search, $options: 'i' } },
    ];
  }

  const [projects, total] = await Promise.all([
    Project.find(filter)
      .populate('client', 'clientId companyName clientFolderCode')
      .populate('projectManager', 'fullName designation avatarColor')
      .populate('teamMembers', 'fullName designation avatarColor')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Project.countDocuments(filter),
  ]);

  const projectIds = projects.map((p) => p._id);
  const [ticketCounts, taskCounts, milestoneCounts] = await Promise.all([
    Ticket.aggregate([
      { $match: { project: { $in: projectIds }, isDeleted: false } },
      { $group: { _id: '$project', count: { $sum: 1 } } },
    ]),
    Task.aggregate([
      { $match: { project: { $in: projectIds }, isDeleted: false } },
      {
        $group: {
          _id: '$project',
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
        },
      },
    ]),
    Milestone.aggregate([
      { $match: { project: { $in: projectIds }, isDeleted: false } },
      {
        $group: {
          _id: '$project',
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const tMap = new Map(ticketCounts.map((x) => [String(x._id), x.count]));
  const taskMap = new Map(taskCounts.map((x) => [String(x._id), x]));
  const msMap = new Map(milestoneCounts.map((x) => [String(x._id), x]));

  const enriched = projects.map((p) => ({
    ...p,
    counts: {
      tickets: tMap.get(String(p._id)) || 0,
      tasks: taskMap.get(String(p._id))?.total || 0,
      completedTasks: taskMap.get(String(p._id))?.completed || 0,
      milestones: msMap.get(String(p._id))?.total || 0,
      completedMilestones: msMap.get(String(p._id))?.completed || 0,
    },
  }));

  return sendSuccess(res, enriched, 'Projects retrieved', 200, buildPaginationMeta(total, page, limit));
});

export const createProject = asyncHandler(async (req, res) => {
  const projectId = await getNextSequence('project', 'PRJ', 101);
  const project = await Project.create({
    ...req.validatedBody,
    projectId,
    createdBy: req.user._id,
  });

  await recordActivity({
    actor: req.user._id,
    action: 'PROJECT_CREATED',
    entityType: 'project',
    entityId: project._id,
    entityRef: project.projectId,
    client: project.client,
    summary: `Created project ${project.projectId}: ${project.name}`,
  });

  const populated = await Project.findById(project._id)
    .populate('client', 'companyName clientFolderCode')
    .populate('projectManager', 'fullName designation');
  return sendSuccess(res, populated, 'Project created successfully', 201);
});

export const getProjectById = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.id, isDeleted: false })
    .populate('client', 'clientId companyName clientFolderCode sageX3Version')
    .populate('projectManager', 'fullName email designation avatarColor')
    .populate('teamMembers', 'fullName email designation avatarColor')
    .lean();

  if (!project) throw new AppError('Project not found.', 404);

  const [milestones, tickets, tasks] = await Promise.all([
    Milestone.find({ project: project._id, isDeleted: false }).sort({ order: 1, dueDate: 1 }).lean(),
    Ticket.find({ project: project._id, isDeleted: false })
      .populate('assignedDevelopers', 'fullName avatarColor')
      .sort({ createdAt: -1 })
      .lean(),
    Task.find({ project: project._id, isDeleted: false })
      .populate('assignedEmployees', 'fullName avatarColor')
      .populate('ticket', 'ticketId title')
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  return sendSuccess(res, { ...project, milestones, tickets, tasks }, 'Project details fetched');
});

export const updateProject = asyncHandler(async (req, res) => {
  const project = await Project.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    req.validatedBody,
    { new: true, runValidators: true }
  )
    .populate('client', 'companyName clientFolderCode')
    .populate('projectManager', 'fullName designation');

  if (!project) throw new AppError('Project not found.', 404);

  await recordActivity({
    actor: req.user._id,
    action: 'PROJECT_UPDATED',
    entityType: 'project',
    entityId: project._id,
    entityRef: project.projectId,
    client: project.client?._id || project.client,
    summary: `Updated project ${project.projectId}: ${project.name}`,
  });

  return sendSuccess(res, project, 'Project updated successfully');
});

export const deleteProject = asyncHandler(async (req, res) => {
  const project = await Project.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    { isDeleted: true, deletedAt: new Date() },
    { new: true }
  );
  if (!project) throw new AppError('Project not found.', 404);
  return sendSuccess(res, null, 'Project archived successfully');
});

export const addMilestone = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.id, isDeleted: false });
  if (!project) throw new AppError('Project not found.', 404);

  const milestone = await Milestone.create({
    ...req.validatedBody,
    project: project._id,
    completedAt: req.validatedBody.status === 'Completed' ? new Date() : null,
  });

  return sendSuccess(res, milestone, 'Milestone created', 201);
});

export const updateMilestone = asyncHandler(async (req, res) => {
  const updates = { ...req.validatedBody };
  if (updates.status === 'Completed') {
    updates.completedAt = new Date();
  }
  const milestone = await Milestone.findOneAndUpdate(
    { _id: req.params.milestoneId, project: req.params.id, isDeleted: false },
    updates,
    { new: true }
  );
  if (!milestone) throw new AppError('Milestone not found.', 404);
  return sendSuccess(res, milestone, 'Milestone updated');
});
