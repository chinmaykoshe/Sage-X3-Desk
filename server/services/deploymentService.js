import Deployment from '../models/Deployment.js';
import Client from '../models/Client.js';
import User from '../models/User.js';
import { getNextSequence } from '../models/Counter.js';
import { ROLES } from '../config/constants.js';
import AppError from '../utils/AppError.js';
import { recordActivity } from './activityService.js';
import { notifyUsers, emitBroadcast } from './notificationService.js';

export async function createDeploymentService(payload, actor) {
  const client = await Client.findOne({ _id: payload.client, isDeleted: false });
  if (!client) throw new AppError('Client not found.', 404);

  if (payload.environment === 'Production' || payload.workflowStage === 'Completed') {
    throw new AppError(
      'Production deployments must pass approval before being marked Production / Completed.',
      400
    );
  }

  const deploymentId = await getNextSequence('deployment', 'DEP', 101);
  const deployment = await Deployment.create({
    ...payload,
    ticket: payload.ticket || null,
    task: payload.task || null,
    deploymentId,
    deployedBy: actor._id,
    history: [
      {
        stage: payload.workflowStage || 'Development Completed',
        environment: payload.environment || 'Development',
        updatedBy: actor._id,
        note: 'Deployment record created',
      },
    ],
  });

  await recordActivity({
    actor: actor._id,
    action: 'DEPLOYMENT_CREATED',
    entityType: 'deployment',
    entityId: deployment._id,
    entityRef: deployment.deploymentId,
    client: deployment.client,
    ticket: deployment.ticket,
    summary: `Created deployment ${deployment.deploymentId} (${deployment.environment} - ${deployment.sageX3Folder})`,
  });

  // Notify managers/leads if awaiting approval
  const leads = await User.find({
    role: { $in: [ROLES.ADMIN, ROLES.TEAM_LEAD] },
    status: 'Active',
    isDeleted: false,
  })
    .select('_id')
    .lean();

  await notifyUsers({
    recipientIds: leads.map((l) => l._id),
    actorId: actor._id,
    type: 'deployment_approval',
    title: `Deployment ${deployment.deploymentId} logged`,
    message: `${actor.fullName} logged deployment ${deployment.versionReference} for folder ${deployment.sageX3Folder}.`,
    link: '/deployments',
    entityType: 'deployment',
    entityId: deployment._id,
  });

  emitBroadcast('deployment:changed', { action: 'updated', deploymentId: deployment._id, actorId: actor._id });
  return deployment;
}

export async function updateDeploymentStatusService(id, payload, actor) {
  const deployment = await Deployment.findOne({ _id: id, isDeleted: false });
  if (!deployment) throw new AppError('Deployment record not found.', 404);

  const canApprove =
    actor.role === ROLES.ADMIN ||
    actor.role === ROLES.TEAM_LEAD ||
    actor.permissions?.canApproveDeployments;

  // Handle approval changes
  if (payload.approvalStatus && payload.approvalStatus !== deployment.approvalStatus) {
    if (!canApprove) {
      throw new AppError('Only Team Leads or Administrators can approve or reject deployments.', 403);
    }
    deployment.approvalStatus = payload.approvalStatus;
    if (payload.approvalStatus === 'Approved') {
      deployment.approvedBy = actor._id;
      deployment.approvedAt = new Date();
      deployment.approvalNotes = payload.approvalNotes || payload.note || 'Approved for Production';
    } else if (payload.approvalStatus === 'Rejected') {
      deployment.approvedBy = actor._id;
      deployment.approvedAt = new Date();
      deployment.approvalNotes = payload.approvalNotes || payload.note || 'Rejected';
    }
  }

  const nextEnv = payload.environment || deployment.environment;
  const nextStage = payload.workflowStage || deployment.workflowStage;

  // Rule 8: Do not allow Production deployment to be marked complete without approval & deployment details.
  if (nextEnv === 'Production' || nextStage === 'Production Deployment' || nextStage === 'Completed') {
    if (deployment.approvalStatus !== 'Approved') {
      throw new AppError(
        'Production deployment requires manager/lead approval before proceeding or marking Completed.',
        400
      );
    }
    const finalNotes = payload.deploymentNotes ?? deployment.deploymentNotes;
    const finalFolder = payload.sageX3Folder ?? deployment.sageX3Folder;
    const finalVersion = payload.versionReference ?? deployment.versionReference;
    if (!finalFolder || !finalVersion || (!finalNotes && nextStage === 'Completed')) {
      throw new AppError(
        'Production deployment completion requires Sage X3 folder, version reference, and deployment notes.',
        400
      );
    }
  }

  if (payload.environment) deployment.environment = payload.environment;
  if (payload.workflowStage) deployment.workflowStage = payload.workflowStage;
  if (payload.testingStatus) {
    deployment.testingStatus = payload.testingStatus;
    if (['Passed', 'Failed'].includes(payload.testingStatus)) {
      deployment.testedBy = actor._id;
    }
  }
  if (payload.deploymentNotes !== undefined) deployment.deploymentNotes = payload.deploymentNotes;
  if (payload.sageX3Folder) deployment.sageX3Folder = payload.sageX3Folder;
  if (payload.versionReference) deployment.versionReference = payload.versionReference;
  if (nextStage === 'Production Deployment' || nextStage === 'Completed') {
    deployment.deploymentDate = new Date();
  }

  deployment.history.push({
    stage: deployment.workflowStage,
    environment: deployment.environment,
    updatedBy: actor._id,
    updatedAt: new Date(),
    note: payload.note || payload.approvalNotes || `Stage: ${deployment.workflowStage}, Approval: ${deployment.approvalStatus}`,
  });

  await deployment.save();

  await recordActivity({
    actor: actor._id,
    action: 'DEPLOYMENT_UPDATED',
    entityType: 'deployment',
    entityId: deployment._id,
    entityRef: deployment.deploymentId,
    client: deployment.client,
    ticket: deployment.ticket,
    summary: `Updated deployment ${deployment.deploymentId} → ${deployment.workflowStage} (${deployment.environment})`,
    metadata: {
      workflowStage: deployment.workflowStage,
      approvalStatus: deployment.approvalStatus,
      testingStatus: deployment.testingStatus,
    },
  });

  if (deployment.workflowStage === 'Approval' || (deployment.testingStatus === 'Passed' && deployment.approvalStatus === 'Pending')) {
    const leads = await User.find({
      role: { $in: [ROLES.ADMIN, ROLES.TEAM_LEAD] },
      status: 'Active',
      isDeleted: false,
    })
      .select('_id')
      .lean();
    await notifyUsers({
      recipientIds: leads.map((l) => l._id),
      actorId: actor._id,
      type: 'deployment_approval',
      title: `Approval needed: ${deployment.deploymentId}`,
      message: `Deployment ${deployment.versionReference} passed Pilot testing and awaits approval.`,
      link: '/deployments',
      entityType: 'deployment',
      entityId: deployment._id,
    });
  } else {
    await notifyUsers({
      recipientIds: [deployment.deployedBy],
      actorId: actor._id,
      type: 'deployment_updated',
      title: `Deployment ${deployment.deploymentId} updated`,
      message: `${actor.fullName} updated ${deployment.deploymentId}: ${deployment.workflowStage} (${deployment.approvalStatus}).`,
      link: '/deployments',
      entityType: 'deployment',
      entityId: deployment._id,
    });
  }

  emitBroadcast('deployment:changed', { action: 'updated', deploymentId: deployment._id, actorId: actor._id });
  return deployment;
}
