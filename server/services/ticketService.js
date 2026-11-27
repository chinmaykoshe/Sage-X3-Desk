import Ticket from '../models/Ticket.js';
import Task from '../models/Task.js';
import Client from '../models/Client.js';
import User from '../models/User.js';
import ApprovalHistory from '../models/ApprovalHistory.js';
import { getNextSequence } from '../models/Counter.js';
import { ROLES, SLA_HOURS_BY_PRIORITY } from '../config/constants.js';
import AppError from '../utils/AppError.js';
import { recordActivity } from './activityService.js';
import { notifyTicketStakeholders, emitBroadcast } from './notificationService.js';
import { recordAudit } from './auditService.js';

export async function createTicketService(payload, actor) {
  const client = await Client.findOne({ _id: payload.client, isDeleted: false });
  if (!client) {
    throw new AppError('Referenced client does not exist.', 404);
  }

  // Idempotency guard against retry duplicates
  if (payload.clientRequestId) {
    const existing = await Ticket.findOne({ clientRequestId: payload.clientRequestId, isDeleted: false });
    if (existing) return existing;
  }

  // Security: determine approval & assignment strictly from authenticated backend actor.role,
  // ignoring any approvalStatus, approvedBy, createdBy, or assignees spoofed in payload.
  const isAutoApprover = actor.role === ROLES.ADMIN || actor.role === ROLES.TEAM_LEAD;
  const approvalStatus = isAutoApprover ? 'APPROVED' : 'PENDING_APPROVAL';
  const ticketId = isAutoApprover
    ? await getNextSequence('ticket', 'TKT', 1001)
    : await getNextSequence('pending_ticket', 'PND', 1001);

  const slaHours = SLA_HOURS_BY_PRIORITY[payload.priority] || client.slaResponseHours || 24;
  const slaDueAt = new Date(Date.now() + slaHours * 3600 * 1000);

  // Module 1.4: all newly created tickets start unassigned (approval and assignment are separate operations)
  const safePayload = { ...payload };
  delete safePayload.approvalStatus;
  delete safePayload.approvedBy;
  delete safePayload.approvedAt;
  delete safePayload.approvalType;
  delete safePayload.createdBy;
  delete safePayload.assignedDevelopers;
  delete safePayload.assignedTeamLead;

  const ticket = await Ticket.create({
    ...safePayload,
    project: payload.project || null,
    assignedDevelopers: [],
    assignedTeamLead: null,
    folderCode: payload.folderCode || client.clientFolderCode,
    ticketId,
    status: 'New',
    approvalStatus,
    approvalType: isAutoApprover ? 'AUTO_APPROVED' : null,
    approvedBy: isAutoApprover ? actor._id : null,
    approvedAt: isAutoApprover ? new Date() : null,
    slaDueAt,
    createdBy: actor._id,
    statusHistory: [
      {
        fromStatus: null,
        toStatus: 'New',
        changedBy: actor._id,
        note: isAutoApprover ? 'Ticket created & auto-approved' : 'Ticket submitted for TL approval',
      },
    ],
  });

  await ApprovalHistory.create({
    ticketId: ticket._id,
    ticketRef: ticket.ticketId,
    action: isAutoApprover ? 'AUTO_APPROVED' : 'SUBMITTED',
    performedBy: actor._id,
    creatorId: actor._id,
    approvalMode: isAutoApprover ? 'AUTOMATIC' : 'MANUAL',
    comments: isAutoApprover
      ? `Automatically approved upon creation by ${actor.role}`
      : 'Submitted by Developer for Team Lead approval',
    previousStatus: 'NONE',
    newStatus: approvalStatus,
  });

  await recordActivity({
    actor: actor._id,
    action: isAutoApprover ? 'TICKET_CREATED' : 'TICKET_SUBMITTED_FOR_APPROVAL',
    entityType: 'ticket',
    entityId: ticket._id,
    entityRef: ticket.ticketId,
    client: ticket.client,
    ticket: ticket._id,
    summary: isAutoApprover
      ? `Created & auto-approved ticket ${ticket.ticketId}: ${ticket.title}`
      : `Submitted ${ticket.ticketId} for TL approval: ${ticket.title}`,
  });

  await recordAudit({
    actorId: actor._id,
    action: isAutoApprover ? 'TICKET_AUTO_APPROVED' : 'TICKET_CREATED_PENDING_APPROVAL',
    recordType: 'Ticket',
    recordId: ticket._id,
    recordRef: ticket.ticketId,
    newValue: { approvalStatus, status: 'New', unassigned: true, role: actor.role },
    module: 'tickets',
  });

  if (isAutoApprover) {
    await notifyTicketStakeholders({
      ticket,
      actorId: actor._id,
      type: 'ticket_updated',
      title: `Ticket Created: ${ticket.ticketId}`,
      message: `${actor.fullName} created "${ticket.title}" (auto-approved).`,
      link: `/tickets/${ticket._id}`,
      includeActor: true,
    });
    emitBroadcast('ticket:changed', { action: 'created', ticketId: ticket._id });
  } else {
    await notifyTicketStakeholders({
      ticket,
      actorId: actor._id,
      type: 'ticket_updated',
      title: `Pending TL Approval: ${ticket.ticketId}`,
      message: `${actor.fullName} submitted "${ticket.title}" for approval.`,
      link: `/tickets/${ticket._id}`,
      includeActor: true,
    });
    emitBroadcast('ticket:changed', { action: 'pending_approval', ticketId: ticket._id });
  }

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

  const isCompleted = status === 'Resolved' || status === 'Closed';
  await notifyTicketStakeholders({
    ticket,
    actorId: actor._id,
    type: 'ticket_updated',
    title: isCompleted ? `Ticket Completed (${status}): ${ticket.ticketId}` : `Ticket Updated: ${ticket.ticketId} → ${status}`,
    message: `${actor.fullName} changed "${ticket.title}" from ${prevStatus} to ${status}.`,
    link: `/tickets/${ticket._id}`,
    includeActor: true,
  });

  emitBroadcast('ticket:changed', { action: 'status', ticketId: ticket._id });
  return ticket;
}

export async function assignTicketService(id, { assignedDevelopers, assignedTeamLead, note }, actor, effectivePermissions = null) {
  const canAssign =
    actor.role === ROLES.ADMIN ||
    actor.role === ROLES.TEAM_LEAD ||
    actor.permissions?.canAssignTickets ||
    effectivePermissions?.actions?.tickets?.includes('assign');
  if (!canAssign) {
    throw new AppError('Only authorized managers or team leads can assign or reassign tickets.', 403);
  }

  const ticket = await Ticket.findOne({ _id: id, isDeleted: false });
  if (!ticket) throw new AppError('Ticket not found.', 404);
  if (ticket.approvalStatus && ticket.approvalStatus !== 'APPROVED') {
    throw new AppError('Only approved tickets can be assigned.', 400);
  }

  const previousDevelopers = [...(ticket.assignedDevelopers || [])].map(String);
  const previousTeamLead = ticket.assignedTeamLead ? String(ticket.assignedTeamLead) : null;
  const isReassignment = previousDevelopers.length > 0 || Boolean(previousTeamLead);

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

  const newDevelopers = [...(ticket.assignedDevelopers || [])].map(String);
  await recordActivity({
    actor: actor._id,
    action: isReassignment ? 'TICKET_REASSIGNED' : 'TICKET_ASSIGNED',
    entityType: 'ticket',
    entityId: ticket._id,
    entityRef: ticket.ticketId,
    client: ticket.client,
    ticket: ticket._id,
    summary: isReassignment
      ? `Reassigned ${ticket.ticketId}`
      : `Assigned ${ticket.ticketId}`,
    metadata: {
      previousDevelopers,
      newDevelopers,
      previousTeamLead,
      newTeamLead: ticket.assignedTeamLead,
    },
  });

  await recordAudit({
    actorId: actor._id,
    action: isReassignment ? 'TICKET_REASSIGNED' : 'TICKET_ASSIGNED',
    recordType: 'Ticket',
    recordId: ticket._id,
    recordRef: ticket.ticketId,
    previousValue: { assignedDevelopers: previousDevelopers, assignedTeamLead: previousTeamLead },
    newValue: { assignedDevelopers: newDevelopers, assignedTeamLead: ticket.assignedTeamLead },
    module: 'tickets',
  });

  await notifyTicketStakeholders({
    ticket,
    actorId: actor._id,
    type: 'ticket_assigned',
    title: `Assignment Updated: ${ticket.ticketId}`,
    message: `${actor.fullName} updated assignment on "${ticket.title}".`,
    link: `/tickets/${ticket._id}`,
    includeActor: false,
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

export async function approvePendingTicketService(id, { edits = {}, comments = '' }, actor) {
  const existing = await Ticket.findOne({ _id: id, isDeleted: false });
  if (!existing) throw new AppError('Ticket not found.', 404);
  if (String(existing.createdBy) === String(actor._id) && actor.role === ROLES.DEVELOPER) {
    throw new AppError('You cannot approve your own ticket without explicit authorization.', 403);
  }

  const prevStatus = existing.approvalStatus || 'PENDING_APPROVAL';
  const permanentId = existing.ticketId?.startsWith('TKT-')
    ? existing.ticketId
    : await getNextSequence('ticket', 'TKT', 1001);

  const safeUpdate = {
    ticketId: permanentId,
    approvalStatus: 'APPROVED',
    approvalType: 'MANUAL_APPROVED',
    approvedBy: actor._id,
    approvedAt: new Date(),
    assignedDevelopers: [],
    assignedTeamLead: null,
    status: 'New',
  };
  if (edits.title) safeUpdate.title = edits.title;
  if (edits.description) safeUpdate.description = edits.description;
  if (edits.priority) safeUpdate.priority = edits.priority;
  if (edits.category) safeUpdate.category = edits.category;

  const updated = await Ticket.findOneAndUpdate(
    {
      _id: id,
      isDeleted: false,
      approvalStatus: { $in: ['PENDING_APPROVAL', 'CHANGES_REQUESTED'] },
    },
    { $set: safeUpdate },
    { new: true }
  );

  if (!updated) {
    throw new AppError('Ticket has already been processed.', 409);
  }

  await ApprovalHistory.create({
    ticketId: updated._id,
    ticketRef: updated.ticketId,
    action: Object.keys(edits).length > 0 ? 'EDITED_AND_APPROVED' : 'APPROVED',
    performedBy: actor._id,
    creatorId: updated.createdBy,
    approvalMode: 'MANUAL',
    comments: comments || `Approved and published as ${updated.ticketId}`,
    previousStatus: prevStatus,
    newStatus: 'APPROVED',
  });

  await recordAudit({
    actorId: actor._id,
    action: 'TICKET_APPROVED',
    recordType: 'Ticket',
    recordId: updated._id,
    recordRef: updated.ticketId,
    previousValue: { approvalStatus: prevStatus, tempId: existing.ticketId },
    newValue: { approvalStatus: 'APPROVED', ticketId: updated.ticketId, unassigned: true },
    module: 'tickets',
  });

  await notifyTicketStakeholders({
    ticket: updated,
    actorId: actor._id,
    type: 'ticket_updated',
    title: `Ticket Approved: ${updated.ticketId}`,
    message: `${actor.fullName} approved "${updated.title}" into the main queue.`,
    link: `/tickets/${updated._id}`,
    includeActor: false,
  });

  emitBroadcast('ticket:changed', { action: 'approved', ticketId: updated._id });
  return updated;
}

export async function rejectPendingTicketService(id, { reason = '' }, actor) {
  const updated = await Ticket.findOneAndUpdate(
    { _id: id, isDeleted: false, approvalStatus: { $in: ['PENDING_APPROVAL', 'CHANGES_REQUESTED'] } },
    { $set: { approvalStatus: 'REJECTED', rejectionReason: reason || 'Rejected by Team Lead' } },
    { new: true }
  );
  if (!updated) throw new AppError('Pending ticket not found or already processed.', 404);

  await ApprovalHistory.create({
    ticketId: updated._id,
    ticketRef: updated.ticketId,
    action: 'REJECTED',
    performedBy: actor._id,
    creatorId: updated.createdBy,
    approvalMode: 'MANUAL',
    comments: reason || 'Rejected by Team Lead',
    previousStatus: 'PENDING_APPROVAL',
    newStatus: 'REJECTED',
  });

  await recordAudit({
    actorId: actor._id,
    action: 'TICKET_REJECTED',
    recordType: 'Ticket',
    recordId: updated._id,
    recordRef: updated.ticketId,
    newValue: { approvalStatus: 'REJECTED', reason },
    module: 'tickets',
  });

  await notifyTicketStakeholders({
    ticket: updated,
    actorId: actor._id,
    type: 'ticket_updated',
    title: `Ticket Rejected: ${updated.ticketId}`,
    message: `${actor.fullName} rejected "${updated.title}"${reason ? `: ${reason}` : '.'}`,
    link: `/approvals/tickets`,
    includeActor: false,
  });

  emitBroadcast('ticket:changed', { action: 'rejected', ticketId: updated._id });
  return updated;
}

export async function requestPendingTicketChangesService(id, { comments = '' }, actor) {
  const updated = await Ticket.findOneAndUpdate(
    { _id: id, isDeleted: false, approvalStatus: 'PENDING_APPROVAL' },
    { $set: { approvalStatus: 'CHANGES_REQUESTED', changeRequestNotes: comments || 'Changes requested' } },
    { new: true }
  );
  if (!updated) throw new AppError('Pending ticket not found or already processed.', 404);

  await ApprovalHistory.create({
    ticketId: updated._id,
    ticketRef: updated.ticketId,
    action: 'CHANGES_REQUESTED',
    performedBy: actor._id,
    creatorId: updated.createdBy,
    approvalMode: 'MANUAL',
    comments: comments || 'Changes requested by Team Lead',
    previousStatus: 'PENDING_APPROVAL',
    newStatus: 'CHANGES_REQUESTED',
  });

  await recordAudit({
    actorId: actor._id,
    action: 'TICKET_CHANGES_REQUESTED',
    recordType: 'Ticket',
    recordId: updated._id,
    recordRef: updated.ticketId,
    newValue: { approvalStatus: 'CHANGES_REQUESTED', comments },
    module: 'tickets',
  });

  await notifyTicketStakeholders({
    ticket: updated,
    actorId: actor._id,
    type: 'ticket_updated',
    title: `Changes Requested: ${updated.ticketId}`,
    message: `${actor.fullName} requested changes on "${updated.title}": ${comments || 'Please review.'}`,
    link: `/approvals/tickets`,
    includeActor: false,
  });

  emitBroadcast('ticket:changed', { action: 'changes_requested', ticketId: updated._id });
  return updated;
}
