import Ticket from '../models/Ticket.js';
import Task from '../models/Task.js';
import Client from '../models/Client.js';
import User from '../models/User.js';
import { getNextSequence } from '../models/Counter.js';
import { ROLES, SLA_HOURS_BY_PRIORITY } from '../config/constants.js';
import AppError from '../utils/AppError.js';
import { recordActivity } from './activityService.js';
import { notifyUsers, emitBroadcast } from './notificationService.js';

export async function createTicketService(payload, actor) {
  const client = await Client.findOne({ _id: payload.client, isDeleted: false });
  if (!client) {
    throw new AppError('Referenced client does not exist.', 404);
  }

  const ticketId = await getNextSequence('ticket', 'TKT', 1001);
  const slaHours = SLA_HOURS_BY_PRIORITY[payload.priority] || client.slaResponseHours || 24;
  const slaDueAt = new Date(Date.now() + slaHours * 3600 * 1000);

  const initialStatus =
    payload.status || (payload.assignedDevelopers?.length > 0 ? 'Assigned' : 'New');

  const ticket = await Ticket.create({
    ...payload,
    project: payload.project || null,
    assignedTeamLead: payload.assignedTeamLead || null,
    folderCode: payload.folderCode || client.clientFolderCode,
    ticketId,
    status: initialStatus,
    slaDueAt,
    createdBy: actor._id,
    statusHistory: [
      {
        fromStatus: null,
        toStatus: initialStatus,
        changedBy: actor._id,
        note: 'Ticket created',
      },
    ],
  });

  await recordActivity({
    actor: actor._id,
    action: 'TICKET_CREATED',
    entityType: 'ticket',
    entityId: ticket._id,
    entityRef: ticket.ticketId,
    client: ticket.client,
    ticket: ticket._id,
    summary: `Created ticket ${ticket.ticketId}: ${ticket.title}`,
  });

  const recipients = [
    ...(payload.assignedDevelopers || []),
    ...(payload.assignedTeamLead ? [payload.assignedTeamLead] : []),
  ];
  await notifyUsers({
    recipientIds: recipients,
    actorId: actor._id,
    type: 'ticket_assigned',
    title: `Assigned to ${ticket.ticketId}`,
    message: `${actor.fullName} assigned you to "${ticket.title}" (${ticket.priority}).`,
    link: `/tickets/${ticket._id}`,
    entityType: 'ticket',
    entityId: ticket._id,
    sendEmail: true,
  });

  emitBroadcast('ticket:changed', { action: 'created', ticketId: ticket._id });
  return ticket;
}

export async function changeTicketStatusService(ticketIdOrObjId, { status, note, waiveIncompleteTasks, waiveReason }, actor) {
  const ticket = await Ticket.findOne({ _id: ticketIdOrObjId, isDeleted: false });
  if (!ticket) throw new AppError('Ticket not found.', 404);

  const prevStatus = ticket.status;
  if (prevStatus === status) {
    return ticket;
  }

  // Rule 6: Closing a ticket requires associated tasks to be completed or explicitly waived by an authorized manager.
  if (status === 'Closed') {
    const incompleteTasks = await Task.countDocuments({
      ticket: ticket._id,
      isDeleted: false,
      status: { $ne: 'Completed' },
    });

    if (incompleteTasks > 0) {
      const canWaive =
        actor.role === ROLES.ADMIN ||
        actor.role === ROLES.TEAM_LEAD ||
        actor.permissions?.canWaiveTicketClose;

      if (!waiveIncompleteTasks || !canWaive) {
        throw new AppError(
          `Cannot close ticket: ${incompleteTasks} associated task(s) are not completed. Complete all tasks or request a manager waiver.`,
          400
        );
      }
      ticket.waivedIncompleteTasksOnClose = true;
      ticket.waivedBy = actor._id;
      ticket.waiveReason = waiveReason || note || 'Waived by manager';
    }
    ticket.closedAt = new Date();
  }

  if (status === 'Resolved') {
    ticket.resolvedAt = new Date();
    if (ticket.slaDueAt) {
      ticket.slaMet = ticket.resolvedAt <= ticket.slaDueAt;
    }
  }

  // Rule 7: Reopened tickets retain previous activity history and increment counter.
  if (status === 'Reopened' || (['Resolved', 'Closed'].includes(prevStatus) && !['Resolved', 'Closed'].includes(status))) {
    ticket.reopenedCount = (ticket.reopenedCount || 0) + 1;
    ticket.closedAt = null;
  }

  ticket.status = status;
  ticket.statusHistory.push({
    fromStatus: prevStatus,
    toStatus: status,
    changedBy: actor._id,
    changedAt: new Date(),
    note: note || (waiveIncompleteTasks ? `Waived open tasks: ${waiveReason || 'Manager override'}` : ''),
  });

  await ticket.save();

  await recordActivity({
    actor: actor._id,
    action: 'TICKET_STATUS_CHANGED',
    entityType: 'ticket',
    entityId: ticket._id,
    entityRef: ticket.ticketId,
    client: ticket.client,
    ticket: ticket._id,
    summary: `Changed ${ticket.ticketId} status from ${prevStatus} to ${status}`,
    metadata: { fromStatus: prevStatus, toStatus: status, note },
  });

  const recipients = [
    ...(ticket.assignedDevelopers || []),
    ...(ticket.assignedTeamLead ? [ticket.assignedTeamLead] : []),
    ticket.createdBy,
  ];
  await notifyUsers({
    recipientIds: recipients,
    actorId: actor._id,
    type: 'ticket_updated',
    title: `${ticket.ticketId} moved to ${status}`,
    message: `${actor.fullName} updated "${ticket.title}" from ${prevStatus} to ${status}.`,
    link: `/tickets/${ticket._id}`,
    entityType: 'ticket',
    entityId: ticket._id,
  });

  emitBroadcast('ticket:changed', { action: 'status', ticketId: ticket._id });
  return ticket;
}

export async function assignTicketService(id, { assignedDevelopers, assignedTeamLead, note }, actor) {
  const canAssign =
    actor.role === ROLES.ADMIN ||
    actor.role === ROLES.TEAM_LEAD ||
    actor.permissions?.canAssignTickets;
  if (!canAssign) {
    throw new AppError('Only authorized managers or team leads can assign or reassign tickets.', 403);
  }

  const ticket = await Ticket.findOne({ _id: id, isDeleted: false });
  if (!ticket) throw new AppError('Ticket not found.', 404);

  if (assignedDevelopers !== undefined) {
    const devCount = await User.countDocuments({ _id: { $in: assignedDevelopers }, isDeleted: false });
    if (devCount !== assignedDevelopers.length) {
      throw new AppError('One or more assigned developers were not found.', 400);
    }
    ticket.assignedDevelopers = assignedDevelopers;
  }

  if (assignedTeamLead !== undefined) {
    ticket.assignedTeamLead = assignedTeamLead || null;
  }

  if (ticket.status === 'New' && ticket.assignedDevelopers.length > 0) {
    ticket.statusHistory.push({
      fromStatus: 'New',
      toStatus: 'Assigned',
      changedBy: actor._id,
      note: note || 'Auto-transitioned upon assignment',
    });
    ticket.status = 'Assigned';
  }

  await ticket.save();

  await recordActivity({
    actor: actor._id,
    action: 'TICKET_ASSIGNED',
    entityType: 'ticket',
    entityId: ticket._id,
    entityRef: ticket.ticketId,
    client: ticket.client,
    ticket: ticket._id,
    summary: `Updated assignment on ${ticket.ticketId}`,
    metadata: { assignedDevelopers: ticket.assignedDevelopers, assignedTeamLead: ticket.assignedTeamLead },
  });

  const recipients = [
    ...(ticket.assignedDevelopers || []),
    ...(ticket.assignedTeamLead ? [ticket.assignedTeamLead] : []),
  ];
  await notifyUsers({
    recipientIds: recipients,
    actorId: actor._id,
    type: 'ticket_assigned',
    title: `Assigned to ${ticket.ticketId}`,
    message: `${actor.fullName} assigned you to "${ticket.title}".`,
    link: `/tickets/${ticket._id}`,
    entityType: 'ticket',
    entityId: ticket._id,
    sendEmail: true,
  });

  emitBroadcast('ticket:changed', { action: 'assigned', ticketId: ticket._id });
  return ticket;
}

export async function reorderTicketService(
  { id, groupBy = 'status', destinationValue, newSortOrder, waiveIncompleteTasks, waiveReason },
  actor
) {
  let ticket = await Ticket.findOne({ _id: id, isDeleted: false });
  if (!ticket) throw new AppError('Ticket not found.', 404);

  if (groupBy === 'status' && destinationValue && destinationValue !== ticket.status) {
    ticket = await changeTicketStatusService(
      id,
      { status: destinationValue, waiveIncompleteTasks, waiveReason, note: 'Updated via board drag-and-drop' },
      actor
    );
  } else if (groupBy === 'priority' && destinationValue && destinationValue !== ticket.priority) {
    const prevPriority = ticket.priority;
    ticket.priority = destinationValue;
    await recordActivity({
      actor: actor._id,
      action: 'TICKET_UPDATED',
      entityType: 'ticket',
      entityId: ticket._id,
      entityRef: ticket.ticketId,
      client: ticket.client,
      ticket: ticket._id,
      summary: `Changed ${ticket.ticketId} priority from ${prevPriority} to ${destinationValue}`,
    });
  } else if (groupBy === 'assignee' && destinationValue !== undefined) {
    const canAssign =
      actor.role === ROLES.ADMIN || actor.role === ROLES.TEAM_LEAD || actor.permissions?.canAssignTickets;
    if (!canAssign) {
      throw new AppError('Only authorized managers or team leads can reassign tickets.', 403);
    }
    ticket.assignedDevelopers = destinationValue && destinationValue !== 'unassigned' ? [destinationValue] : [];
  } else if (groupBy === 'client' && destinationValue) {
    ticket.client = destinationValue;
  }

  ticket.sortOrder = newSortOrder;
  await ticket.save();

  emitBroadcast('ticket:changed', { action: 'reordered', ticketId: ticket._id, actorId: actor._id });
  return ticket;
}

export async function duplicateTicketService(id, actor) {
  const src = await Ticket.findOne({ _id: id, isDeleted: false }).lean();
  if (!src) throw new AppError('Ticket not found.', 404);

  return createTicketService(
    {
      title: `${src.title} (Copy)`,
      description: src.description,
      client: src.client,
      project: src.project,
      category: src.category,
      priority: src.priority,
      severity: src.severity,
      reportedBy: src.reportedBy,
      assignedDevelopers: src.assignedDevelopers || [],
      assignedTeamLead: src.assignedTeamLead,
      dueDate: src.dueDate,
      sageX3Environment: src.sageX3Environment,
      folderCode: src.folderCode,
      internalNotes: src.internalNotes,
    },
    actor
  );
}

export async function bulkTicketActionService({ ids, action, value }, actor) {
  const isManager = actor.role === ROLES.ADMIN || actor.role === ROLES.TEAM_LEAD;
  if (['assign', 'archive', 'project'].includes(action) && !isManager && !actor.permissions?.canAssignTickets) {
    throw new AppError('Insufficient permissions for this bulk action.', 403);
  }

  const results = [];
  for (const id of ids) {
    if (action === 'status') {
      results.push(await changeTicketStatusService(id, { status: value, note: 'Bulk status update' }, actor));
    } else if (action === 'priority') {
      const t = await Ticket.findOneAndUpdate(
        { _id: id, isDeleted: false },
        { priority: value },
        { new: true }
      );
      if (t) results.push(t);
    } else if (action === 'assign') {
      results.push(
        await assignTicketService(
          id,
          { assignedDevelopers: Array.isArray(value) ? value : value ? [value] : [] },
          actor
        )
      );
    } else if (action === 'dueDate') {
      const t = await Ticket.findOneAndUpdate(
        { _id: id, isDeleted: false },
        { dueDate: value ? new Date(value) : null },
        { new: true }
      );
      if (t) results.push(t);
    } else if (action === 'project') {
      const t = await Ticket.findOneAndUpdate(
        { _id: id, isDeleted: false },
        { project: value || null },
        { new: true }
      );
      if (t) results.push(t);
    } else if (action === 'archive') {
      const t = await Ticket.findOneAndUpdate(
        { _id: id, isDeleted: false },
        { isDeleted: true, deletedAt: new Date() },
        { new: true }
      );
      if (t) results.push(t);
    }
  }

  emitBroadcast('ticket:changed', { action: 'bulk', count: results.length, actorId: actor._id });
  return results;
}
