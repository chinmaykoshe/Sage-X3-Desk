import Client from '../../models/Client.js';
import Ticket from '../../models/Ticket.js';
import Task from '../../models/Task.js';
import Project from '../../models/Project.js';
import User from '../../models/User.js';
import Deployment from '../../models/Deployment.js';
import TicketDraft from '../../models/TicketDraft.js';
import { ROLES } from '../../config/constants.js';

/**
 * Deterministically matches a client from text against companyName, clientId, aliases, and folder codes.
 */
export function matchClientDeterministic(text, clients) {
  if (!text || !clients?.length) {
    return { bestMatch: null, confidence: 0, candidates: [] };
  }
  const lower = text.toLowerCase();
  const scored = [];

  for (const c of clients) {
    let score = 0;
    const nameLower = (c.companyName || '').toLowerCase();
    const shortTokens = nameLower
      .replace(/\b(pvt|ltd|limited|private|inc|corp|llp|llc|services|technologies|manufacturing)\b/g, '')
      .trim()
      .split(/\s+/)
      .filter((t) => t.length >= 3);

    const folders = [c.clientFolderCode, c.pilotFolderCode, c.productionFolderCode]
      .filter(Boolean)
      .map((f) => f.toLowerCase());

    if (nameLower && lower.includes(nameLower)) score += 100;
    if (c.clientId && lower.includes(c.clientId.toLowerCase())) score += 95;

    for (const f of folders) {
      if (f && new RegExp(`\\b${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
        score += 90;
      }
    }

    for (const alias of c.aliases || []) {
      if (alias && lower.includes(alias.toLowerCase())) {
        score += 85;
      }
    }

    if (score === 0 && shortTokens.length > 0) {
      let tokenHits = 0;
      for (const tok of shortTokens) {
        if (new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower)) {
          tokenHits += 1;
        }
      }
      if (tokenHits >= 2) score += 75;
      else if (tokenHits === 1 && shortTokens[0] && lower.includes(shortTokens[0])) score += 55;
    }

    if (score > 0) {
      scored.push({
        client: c,
        score,
        companyName: c.companyName,
        folderCode: c.clientFolderCode,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { bestMatch: null, confidence: 0, candidates: [] };
  }

  const top = scored[0];
  const second = scored[1];
  const ambiguous = Boolean(second && top.score - second.score < 15 && top.score < 90);

  return {
    bestMatch: ambiguous ? null : top.client,
    confidence: Math.min(100, top.score),
    ambiguous,
    candidates: scored.slice(0, 4).map((s) => ({
      client: s.client._id,
      companyName: s.companyName,
      folderCode: s.folderCode,
      score: s.score,
    })),
  };
}

/**
 * Deterministically matches an employee by fullName, first name, email, or employeeId.
 */
export function matchEmployeeDeterministic(text, users) {
  if (!text || !users?.length) return null;
  const lower = text.toLowerCase();

  for (const u of users) {
    if (u.fullName && lower.includes(u.fullName.toLowerCase())) return u;
    if (u.employeeId && lower.includes(u.employeeId.toLowerCase())) return u;
  }
  for (const u of users) {
    const first = (u.fullName || '').split(' ')[0]?.toLowerCase();
    if (first && first.length >= 3 && new RegExp(`\\b${first}\\b`, 'i').test(lower)) {
      return u;
    }
  }
  return null;
}

/**
 * Retrieves compact, relevant operational context from MongoDB for the user's message.
 */
export async function retrieveRelevantContext({ message, user, conversation }) {
  const [clients, users] = await Promise.all([
    Client.find({ isDeleted: false })
      .select('clientId companyName aliases clientFolderCode pilotFolderCode productionFolderCode sageX3Version')
      .lean(),
    User.find({ isDeleted: false, role: { $ne: ROLES.CLIENT } })
      .select('employeeId fullName designation role')
      .lean(),
  ]);

  const clientMatch = matchClientDeterministic(message, clients);
  const empMatch = matchEmployeeDeterministic(message, users);

  const activeClientId = clientMatch.bestMatch?._id || conversation?.contextState?.lastClientId || null;
  const ticketFilter = { isDeleted: false };
  if (user.role === ROLES.DEVELOPER) {
    ticketFilter.$or = [{ assignedDevelopers: user._id }, { createdBy: user._id }];
  }
  if (activeClientId) {
    ticketFilter.client = activeClientId;
  }

  const [tickets, tasks, projects, deployments, pendingDraftsCount] = await Promise.all([
    Ticket.find(ticketFilter)
      .populate('client', 'companyName clientFolderCode')
      .populate('assignedDevelopers', 'fullName')
      .select('ticketId title status priority category dueDate folderCode sageX3Environment assignedDevelopers client')
      .sort({ updatedAt: -1 })
      .limit(12)
      .lean(),
    Task.find({ isDeleted: false, ...(activeClientId ? { client: activeClientId } : {}) })
      .populate('assignedEmployees', 'fullName')
      .populate('ticket', 'ticketId title')
      .select('taskId title status priority dueDate assignedEmployees ticket')
      .sort({ updatedAt: -1 })
      .limit(12)
      .lean(),
    Project.find({ isDeleted: false })
      .populate('client', 'companyName')
      .select('projectId name status progressPercentage client')
      .limit(8)
      .lean(),
    Deployment.find({ isDeleted: false })
      .populate('client', 'companyName')
      .select('deploymentId environment workflowStage sageX3Folder versionReference approvalStatus deploymentDate client')
      .sort({ deploymentDate: -1 })
      .limit(6)
      .lean(),
    TicketDraft.countDocuments({ isDeleted: false, approvalStatus: 'Pending TL Approval' }),
  ]);

  return {
    currentUser: { id: String(user._id), name: user.fullName, role: user.role },
    conversationContext: conversation?.contextState || {},
    matchedClient: clientMatch.bestMatch
      ? { id: String(clientMatch.bestMatch._id), name: clientMatch.bestMatch.companyName }
      : null,
    matchedEmployee: empMatch ? { id: String(empMatch._id), name: empMatch.fullName } : null,
    clients: clients.map((c) => ({
      id: String(c._id),
      name: c.companyName,
      folders: [c.clientFolderCode, c.pilotFolderCode, c.productionFolderCode].filter(Boolean),
    })),
    employees: users.map((u) => ({ id: String(u._id), name: u.fullName, role: u.role })),
    pendingApprovalsCount: pendingDraftsCount,
    recentTickets: tickets.map((t) => ({
      id: String(t._id),
      ticketId: t.ticketId,
      title: t.title,
      client: t.client?.companyName,
      status: t.status,
      priority: t.priority,
      folder: t.folderCode,
      assignees: (t.assignedDevelopers || []).map((d) => d.fullName),
      dueDate: t.dueDate,
    })),
    recentTasks: tasks.map((t) => ({
      id: String(t._id),
      taskId: t.taskId,
      title: t.title,
      ticket: t.ticket?.ticketId,
      status: t.status,
      priority: t.priority,
      assignees: (t.assignedEmployees || []).map((e) => e.fullName),
      dueDate: t.dueDate,
    })),
    projects: projects.map((p) => ({
      id: String(p._id),
      projectId: p.projectId,
      name: p.name,
      client: p.client?.companyName,
      status: p.status,
      progress: p.progressPercentage,
    })),
    recentDeployments: deployments.map((d) => ({
      deploymentId: d.deploymentId,
      client: d.client?.companyName,
      environment: d.environment,
      folder: d.sageX3Folder,
      stage: d.workflowStage,
      approval: d.approvalStatus,
    })),
  };
}
