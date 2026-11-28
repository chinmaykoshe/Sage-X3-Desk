import Task from '../../db/models/Task.js';
import Ticket from '../../db/models/Ticket.js';
import Project from '../../db/models/Project.js';
import User from '../../db/models/User.js';
import { getNextSequence } from '../../db/models/Counter.js';
import { ROLES } from '../config/constants.js';
import AppError from '../utils/AppError.js';
import { recordActivity } from './activityService.js';
import { notifyUsers, emitBroadcast } from './notificationService.js';

export async function createTaskService(payload, actor) {
  let ticketDoc = null;
  let parentTaskDoc = null;
  let clientId = payload.client || null;
  let projectId = payload.project || null;

  if (payload.parentTask) {
    parentTaskDoc = await Task.findOne({ _id: payload.parentTask, isDeleted: false });
    if (!parentTaskDoc) throw new AppError('Parent task not found.', 404);
    if (!payload.ticket && parentTaskDoc.ticket) payload.ticket = parentTaskDoc.ticket;
    if (!clientId && parentTaskDoc.client) clientId = parentTaskDoc.client;
    if (!projectId && parentTaskDoc.project) projectId = parentTaskDoc.project;
    if (parentTaskDoc.isIndependentInternalTask) payload.isIndependentInternalTask = true;
  }

  if (!payload.isIndependentInternalTask && !payload.ticket) {
    throw new AppError('Tasks must be linked to a parent ticket unless marked as an independent internal task.', 400);
  }

  if (payload.ticket) {
    ticketDoc = await Ticket.findOne({ _id: payload.ticket, isDeleted: false });
    if (!ticketDoc) throw new AppError('Parent ticket not found.', 404);
    if (!clientId) clientId = ticketDoc.client;
    if (!projectId && ticketDoc.project) projectId = ticketDoc.project;
  }

  const taskId = await getNextSequence('task', 'TSK', 1001);
  const task = await Task.create({
    ...payload,
    ticket: payload.ticket || null,
    parentTask: payload.parentTask || null,
    client: clientId || null,
    project: projectId || null,
    taskId,
    createdBy: actor._id,
    completedAt: payload.status === 'Completed' ? new Date() : null,
    completionPercentage: payload.status === 'Completed' ? 100 : (payload.completionPercentage || 0),
    statusHistory: [
      {
        fromStatus: null,
        toStatus: payload.status || 'Todo',
        changedBy: actor._id,
        note: 'Task created',
      },
    ],
  });

  await recordActivity({
    actor: actor._id,
    action: 'TASK_CREATED',
    entityType: 'task',
    entityId: task._id,
    entityRef: task.taskId,
    client: task.client,
    ticket: task.ticket,
    summary: `Created ${parentTaskDoc ? 'subtask' : 'task'} ${task.taskId}: ${task.title}${
      ticketDoc ? ` under ${ticketDoc.ticketId}` : ''
    }`,
  });

  await notifyUsers({
    recipientIds: payload.assignedEmployees || [],
    actorId: actor._id,
    type: 'task_assigned',
    title: `New task ${task.taskId}`,
    message: `${actor.fullName} assigned you task "${task.title}".`,
    link: ticketDoc ? `/tickets/${ticketDoc._id}` : '/my-tasks',
    entityType: 'task',
    entityId: task._id,
  });

  if (task.parentTask) await recalculateParentTaskProgress(task.parentTask);
  await recalculateProjectProgress(projectId);
  emitBroadcast('task:changed', { action: 'created', taskId: task._id, actorId: actor._id });
  return task;
}

export async function changeTaskStatusService(id, { status, completionPercentage, submittedForReview, note }, actor) {
  const task = await Task.findOne({ _id: id, isDeleted: false });
  if (!task) throw new AppError('Task not found.', 404);

  const prevStatus = task.status;
  task.status = status;

  if (status === 'Completed') {
    task.completedAt = new Date();
    task.completionPercentage = 100;
  } else {
    task.completedAt = null;
    if (completionPercentage !== undefined) {
      task.completionPercentage = completionPercentage;
    } else if (status === 'In Progress' && task.completionPercentage === 0) {
      task.completionPercentage = 25;
    } else if (status === 'In Review' || status === 'Testing') {
      task.completionPercentage = Math.max(task.completionPercentage || 0, 80);
    }
  }

  if (submittedForReview !== undefined) {
    task.submittedForReview = submittedForReview;
  } else if (status === 'In Review') {
    task.submittedForReview = true;
  }

  if (prevStatus !== status) {
    task.statusHistory.push({
      fromStatus: prevStatus,
      toStatus: status,
      changedBy: actor._id,
      changedAt: new Date(),
      note: note || '',
    });
  }

  await task.save();

  await recordActivity({
    actor: actor._id,
    action: 'TASK_STATUS_CHANGED',
    entityType: 'task',
    entityId: task._id,
    entityRef: task.taskId,
    client: task.client,
    ticket: task.ticket,
    summary: `Updated task ${task.taskId} from ${prevStatus} to ${status} (${task.completionPercentage}%)`,
    metadata: { fromStatus: prevStatus, toStatus: status, completionPercentage: task.completionPercentage },
  });

  await notifyUsers({
    recipientIds: [...(task.assignedEmployees || []), task.createdBy],
    actorId: actor._id,
    type: 'task_updated',
    title: `${task.taskId} marked ${status}`,
    message: `${actor.fullName} updated "${task.title}" to ${status}.`,
    link: task.ticket ? `/tickets/${task.ticket}` : '/my-tasks',
    entityType: 'task',
    entityId: task._id,
  });

  if (task.parentTask) await recalculateParentTaskProgress(task.parentTask);
  await recalculateProjectProgress(task.project);
  emitBroadcast('task:changed', { action: 'status', taskId: task._id, actorId: actor._id });
  return task;
}

export async function assignTaskService(id, { assignedEmployees, note }, actor) {
  const canAssign =
    actor.role === ROLES.ADMIN || actor.role === ROLES.TEAM_LEAD || actor.permissions?.canAssignTickets;
  if (!canAssign) {
    throw new AppError('Only authorized managers or team leads can reassign tasks.', 403);
  }

  const task = await Task.findOne({ _id: id, isDeleted: false });
  if (!task) throw new AppError('Task not found.', 404);

  if (assignedEmployees.length > 0) {
    const count = await User.countDocuments({ _id: { $in: assignedEmployees }, isDeleted: false });
    if (count !== assignedEmployees.length) {
      throw new AppError('One or more assigned employees were not found.', 400);
    }
  }

  task.assignedEmployees = assignedEmployees;
  await task.save();

  await recordActivity({
    actor: actor._id,
    action: 'TASK_ASSIGNED',
    entityType: 'task',
    entityId: task._id,
    entityRef: task.taskId,
    client: task.client,
    ticket: task.ticket,
    summary: `Reassigned task ${task.taskId}${note ? ` (${note})` : ''}`,
    metadata: { assignedEmployees },
  });

  await notifyUsers({
    recipientIds: assignedEmployees,
    actorId: actor._id,
    type: 'task_assigned',
    title: `Assigned to ${task.taskId}`,
    message: `${actor.fullName} assigned task "${task.title}" to you.`,
    link: task.ticket ? `/tickets/${task.ticket}` : '/my-tasks',
    entityType: 'task',
    entityId: task._id,
  });

  emitBroadcast('task:changed', { action: 'assigned', taskId: task._id, actorId: actor._id });
  return task;
}

export async function reorderTaskService({ id, groupBy = 'status', destinationValue, newSortOrder }, actor) {
  let task = await Task.findOne({ _id: id, isDeleted: false });
  if (!task) throw new AppError('Task not found.', 404);

  if (groupBy === 'status' && destinationValue && destinationValue !== task.status) {
    task = await changeTaskStatusService(
      id,
      { status: destinationValue, note: 'Moved via task board' },
      actor
    );
  } else if (groupBy === 'priority' && destinationValue && destinationValue !== task.priority) {
    task.priority = destinationValue;
    await recordActivity({
      actor: actor._id,
      action: 'TASK_UPDATED',
      entityType: 'task',
      entityId: task._id,
      entityRef: task.taskId,
      client: task.client,
      ticket: task.ticket,
      summary: `Changed ${task.taskId} priority to ${destinationValue}`,
    });
  } else if (groupBy === 'assignee' && destinationValue !== undefined) {
    const newAssignees = destinationValue && destinationValue !== 'unassigned' ? [destinationValue] : [];
    task = await assignTaskService(id, { assignedEmployees: newAssignees, note: 'Board drag-drop' }, actor);
  } else if (groupBy === 'client' && destinationValue) {
    task.client = destinationValue;
  }

  task.sortOrder = newSortOrder;
  await task.save();

  emitBroadcast('task:changed', { action: 'reordered', taskId: task._id, actorId: actor._id });
  return task;
}

export async function bulkTaskActionService({ ids, action, value }, actor) {
  const isManager = actor.role === ROLES.ADMIN || actor.role === ROLES.TEAM_LEAD;
  if (['assign', 'archive', 'project'].includes(action) && !isManager && !actor.permissions?.canAssignTickets) {
    throw new AppError('Insufficient permissions for this bulk action.', 403);
  }

  const results = [];
  for (const id of ids) {
    if (action === 'status') {
      results.push(await changeTaskStatusService(id, { status: value, note: 'Bulk update' }, actor));
    } else if (action === 'priority') {
      const t = await Task.findOneAndUpdate({ _id: id, isDeleted: false }, { priority: value }, { new: true });
      if (t) results.push(t);
    } else if (action === 'assign') {
      results.push(
        await assignTaskService(
          id,
          { assignedEmployees: Array.isArray(value) ? value : value ? [value] : [], note: 'Bulk assign' },
          actor
        )
      );
    } else if (action === 'dueDate') {
      const t = await Task.findOneAndUpdate(
        { _id: id, isDeleted: false },
        { dueDate: value ? new Date(value) : null },
        { new: true }
      );
      if (t) results.push(t);
    } else if (action === 'project') {
      const t = await Task.findOneAndUpdate({ _id: id, isDeleted: false }, { project: value || null }, { new: true });
      if (t) results.push(t);
    } else if (action === 'archive') {
      const t = await Task.findOneAndUpdate(
        { _id: id, isDeleted: false },
        { isDeleted: true, deletedAt: new Date() },
        { new: true }
      );
      if (t) results.push(t);
    }
  }

  emitBroadcast('task:changed', { action: 'bulk', count: results.length, actorId: actor._id });
  return results;
}

export async function recalculateParentTaskProgress(parentTaskId) {
  if (!parentTaskId) return;
  const subs = await Task.find({ parentTask: parentTaskId, isDeleted: false }).select('status completionPercentage').lean();
  if (subs.length === 0) return;
  const avg = Math.round(
    subs.reduce((sum, s) => sum + (s.status === 'Completed' ? 100 : s.completionPercentage || 0), 0) / subs.length
  );
  await Task.findByIdAndUpdate(parentTaskId, { completionPercentage: avg });
}

export async function recalculateProjectProgress(projectId) {
  if (!projectId) return;
  const tasks = await Task.find({ project: projectId, isDeleted: false }).select('status completionPercentage').lean();
  if (tasks.length === 0) return;
  const avg = Math.round(
    tasks.reduce((sum, t) => sum + (t.status === 'Completed' ? 100 : t.completionPercentage || 0), 0) /
      tasks.length
  );
  await Project.findByIdAndUpdate(projectId, { progressPercentage: avg });
}
