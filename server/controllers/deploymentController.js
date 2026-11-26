import Deployment from '../models/Deployment.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, buildPagination, buildPaginationMeta } from '../utils/response.js';
import {
  createDeploymentService,
  updateDeploymentStatusService,
} from '../services/deploymentService.js';
import { recordAudit } from '../services/auditService.js';

export const getDeployments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query);
  const { search, client, environment, approvalStatus, workflowStage } = req.query;

  const filter = { isDeleted: false };
  if (client) filter.client = client;
  if (environment) filter.environment = environment;
  if (approvalStatus) filter.approvalStatus = approvalStatus;
  if (workflowStage) filter.workflowStage = workflowStage;
  if (search) {
    filter.$or = [
      { deploymentId: { $regex: search, $options: 'i' } },
      { versionReference: { $regex: search, $options: 'i' } },
      { sageX3Folder: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }

  const [deployments, total] = await Promise.all([
    Deployment.find(filter)
      .populate('client', 'clientId companyName clientFolderCode pilotFolderCode productionFolderCode')
      .populate('ticket', 'ticketId title')
      .populate('task', 'taskId title')
      .populate('deployedBy', 'fullName designation')
      .populate('approvedBy', 'fullName designation')
      .populate('testedBy', 'fullName designation')
      .sort({ deploymentDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Deployment.countDocuments(filter),
  ]);

  return sendSuccess(res, deployments, 'Deployments retrieved', 200, buildPaginationMeta(total, page, limit));
});

export const createDeployment = asyncHandler(async (req, res) => {
  const deployment = await createDeploymentService(req.validatedBody, req.user);
  await recordAudit({
    actorId: req.user._id,
    action: deployment.environment === 'Production' ? 'PRODUCTION_DEPLOYMENT_CREATED' : 'DEPLOYMENT_CREATED',
    recordType: 'Deployment',
    recordId: deployment._id,
    recordRef: deployment.deploymentId,
    newValue: { environment: deployment.environment, versionReference: deployment.versionReference },
    module: 'deployments',
  });
  const populated = await Deployment.findById(deployment._id)
    .populate('client', 'clientId companyName clientFolderCode')
    .populate('ticket', 'ticketId title')
    .populate('task', 'taskId title')
    .populate('deployedBy', 'fullName');
  return sendSuccess(res, populated, 'Deployment record created', 201);
});

export const updateDeploymentStatus = asyncHandler(async (req, res) => {
  const deployment = await updateDeploymentStatusService(req.params.id, req.validatedBody, req.user);
  await recordAudit({
    actorId: req.user._id,
    action: req.validatedBody?.approvalStatus === 'Approved' ? 'DEPLOYMENT_APPROVED' : 'DEPLOYMENT_UPDATED',
    recordType: 'Deployment',
    recordId: deployment._id,
    recordRef: deployment.deploymentId,
    newValue: { approvalStatus: deployment.approvalStatus, workflowStage: deployment.workflowStage },
    module: 'deployments',
  });
  const populated = await Deployment.findById(deployment._id)
    .populate('client', 'clientId companyName clientFolderCode')
    .populate('ticket', 'ticketId title')
    .populate('task', 'taskId title')
    .populate('deployedBy', 'fullName')
    .populate('approvedBy', 'fullName')
    .populate('testedBy', 'fullName');
  return sendSuccess(res, populated, 'Deployment updated');
});

export const deleteDeployment = asyncHandler(async (req, res) => {
  const deployment = await Deployment.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    { isDeleted: true, deletedAt: new Date() },
    { new: true }
  );
  if (!deployment) throw new AppError('Deployment not found.', 404);
  return sendSuccess(res, null, 'Deployment archived');
});
