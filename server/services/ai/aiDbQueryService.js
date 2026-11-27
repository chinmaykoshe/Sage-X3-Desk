import mongoose from 'mongoose';
import User from '../../models/User.js';
import Client from '../../models/Client.js';
import Ticket from '../../models/Ticket.js';
import Task from '../../models/Task.js';
import Project from '../../models/Project.js';
import Deployment from '../../models/Deployment.js';
import TicketDraft from '../../models/TicketDraft.js';
import AIActionRequest from '../../models/AIActionRequest.js';
import EmailMessage from '../../models/EmailMessage.js';
import KnowledgeBase from '../../models/KnowledgeBase.js';
import ActivityLog from '../../models/ActivityLog.js';
import AuditLog from '../../models/AuditLog.js';
import TimeLog from '../../models/TimeLog.js';
import { ROLES } from '../../config/constants.js';

export const SENSITIVE_REFUSAL_RESPONSE =
  'For security reasons, X3 AI cannot view, retrieve, guess, or disclose passwords, passcodes, tokens, API keys, hashes, or encrypted credentials.\n\nI can help you query all non-sensitive database records instead (users, clients, tickets, duplicates, tasks, projects, deployments, emails, knowledge base, and audit/activity logs).';

const SENSITIVE_TERM_RE =
  /\b(pass\s*word|passwd|pwd|passcode|passphrase|pin\s*code|secret\s*key|client\s*secret|api\s*key|auth\s*token|access\s*token|refresh\s*token|bearer\s*token|jwt(?:\s*secret)?|oauth(?:\s*token|\s*secret)?|private\s*key|encrypted\s*credentials?|clientstatetoken|connection\s*string|mongo(?:_?uri)?|smtp_pass|\.env)\b/i;

const SENSITIVE_INTENT_RE =
  /\b(password|passwd|pwd|passcode|passphrase|secret|token|credential|api\s*key|private\s*key|hash)\b/i;

const TICKET_CREATION_PREFIX_RE = /^\s*(create|log|draft|raise|submit)\s+(a\s+)?(new\s+)?ticket\b/i;

/**
 * Deterministically detects queries asking for passwords, tokens, keys, or credentials.
 */
export function isSensitiveCredentialQuery(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return false;
  // Allow explicit ticket creation descriptions like "create a ticket for password reset email failing"
  if (TICKET_CREATION_PREFIX_RE.test(raw) && !/\b(what\s+is|show|give|tell|reveal|dump|admin\s+password|user\s+password)\b/i.test(raw)) {
    return false;
  }
  if (SENSITIVE_TERM_RE.test(raw)) return true;
  if (
    SENSITIVE_INTENT_RE.test(raw) &&
    /\b(what|who|show|give|tell|get|find|list|reveal|leak|dump|share|fetch|print|admin|user|db|database)\b/i.test(raw)
  ) {
    return true;
  }
  return false;
}

/**
 * Guards against an LLM accidentally guessing a password/secret in freeform text.
 */
export function containsCredentialHallucination(text = '') {
  const raw = String(text || '');
  return /\b(the\s+password\s+(for|is)|password\s*(?:is|:)\s*['"`]?[a-z0-9!@#$%^&*_-]{3,})/i.test(raw);
}

function escapeRegex(str = '') {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSearchRegex(search) {
  const cleaned = String(search || '').trim();
  if (!cleaned) return null;
  return new RegExp(escapeRegex(cleaned), 'i');
}

const SEARCH_STOP_WORDS = new Set([
  'a', 'an', 'the', 'with', 'name', 'named', 'called', 'for', 'of', 'in', 'on', 'at', 'to', 'by', 'from',
  'find', 'search', 'show', 'get', 'list', 'give', 'fetch', 'check', 'who', 'is', 'are', 'was', 'were',
  'what', 'why', 'how', 'when', 'where', 'which', 'about', 'details', 'detail', 'info', 'information',
  'please', 'me', 'my', 'your', 'you', 'our', 'we', 'i', 'all', 'db', 'database', 'can', 'could', 'would',
  'should', 'do', 'does', 'did', 'hi', 'hii', 'hello', 'hey', 'thanks', 'thank', 'tell', 'explain', 'help',
  'user', 'users', 'employee', 'employees', 'member', 'members', 'client', 'clients', 'ticket', 'tickets',
  'task', 'tasks', 'project', 'projects', 'email', 'emails', 'recent', 'latest', 'new', 'any',
]);

function extractSearchKeywords(raw = '') {
  const tokens = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9@._-]/g, ' ')
    .split(/\s+/)
    .filter((t) => (t.length >= 2 || /^\d+$/.test(t)) && !SEARCH_STOP_WORDS.has(t));
  return tokens.join(' ').trim();
}

function getSearchTokens(raw = '') {
  const kw = extractSearchKeywords(raw);
  if (!kw) return [];
  const parts = kw.split(/\s+/).filter((t) => t.length >= 2 || /^\d+$/.test(t));
  return [...new Set(parts)].slice(0, 5);
}

function buildMultiTokenFilter(search, fields = []) {
  const tokens = getSearchTokens(search);
  if (tokens.length === 0 || fields.length === 0) return null;
  if (tokens.length === 1) {
    const rx = new RegExp(escapeRegex(tokens[0]), 'i');
    return { $or: fields.map((f) => ({ [f]: rx })) };
  }
  return {
    allFilter: {
      $and: tokens.map((tok) => {
        const rx = new RegExp(escapeRegex(tok), 'i');
        return { $or: fields.map((f) => ({ [f]: rx })) };
      }),
    },
    anyFilter: {
      $or: tokens.flatMap((tok) => {
        const rx = new RegExp(escapeRegex(tok), 'i');
        return fields.map((f) => ({ [f]: rx }));
      }),
    },
    tokens,
  };
}

function formatDateShort(dateVal) {
  if (!dateVal) return 'N/A';
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toISOString().slice(0, 10);
}

function buildTicketScope(user) {
  const filter = { isDeleted: false };
  if (user?.role === ROLES.DEVELOPER) {
    filter.$or = [{ assignedDevelopers: user._id }, { createdBy: user._id }];
  }
  return filter;
}

async function queryUsers({ search }) {
  const filter = { isDeleted: false };
  const rx = buildSearchRegex(search);
  if (rx) {
    filter.$or = [
      { fullName: rx },
      { email: rx },
      { employeeId: rx },
      { designation: rx },
      { department: rx },
      { role: rx },
    ];
  }
  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .select('employeeId fullName email role designation department status createdAt')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
  ]);

  if (users.length === 0) {
    return {
      statusType: 'search',
      response: search
        ? `No users matched "${search}" in the database.`
        : 'No users were found in the database.',
      action: { type: 'DB_QUERY_RESULT', buttons: [{ label: 'Open Team Directory', route: '/team' }] },
    };
  }

  const lines = users.map(
    (u) =>
      `• ${u.fullName} (${u.employeeId || 'NO-ID'}) — ${u.role}${u.designation ? ` · ${u.designation}` : ''} · ${u.status || 'Active'} · ${u.email} (joined ${formatDateShort(u.createdAt)})`
  );

  const buttons = [];
  if (users.length === 1) {
    buttons.push({ label: `Open ${users[0].fullName}`, route: `/team/${users[0]._id}` });
  }
  buttons.push({ label: 'Open Team Directory', route: '/team' });

  return {
    statusType: 'search',
    response: `Found ${total} user(s)${search ? ` matching "${search}"` : ''} (showing newest ${users.length}):\n${lines.join('\n')}`,
    action: {
      type: 'DB_QUERY_RESULT',
      buttons,
    },
  };
}

async function queryClients({ search }) {
  const filter = { isDeleted: false };
  const rx = buildSearchRegex(search);
  if (rx) {
    filter.$or = [
      { companyName: rx },
      { clientId: rx },
      { clientFolderCode: rx },
      { pilotFolderCode: rx },
      { productionFolderCode: rx },
      { primaryContactPerson: rx },
      { contactEmail: rx },
      { sageX3Version: rx },
    ];
  }
  const [totalAll, totalMatched, clients] = await Promise.all([
    Client.countDocuments({ isDeleted: false }),
    Client.countDocuments(filter),
    Client.find(filter)
      .select('clientId companyName clientFolderCode pilotFolderCode productionFolderCode sageX3Version primaryContactPerson contactEmail isActive createdAt')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
  ]);

  if (clients.length === 0) {
    return {
      statusType: 'search',
      response: search
        ? `No client matched "${search}" in the database (${totalAll} active client(s) total).`
        : 'No clients found in the database.',
      action: {
        type: 'DB_QUERY_RESULT',
        buttons: [{ label: 'View All Clients', route: '/clients' }],
      },
    };
  }

  const lines = clients.map(
    (c) =>
      `• ${c.companyName} (${c.clientId}) — ${c.sageX3Version || 'X3'} · Folders: ${[c.clientFolderCode, c.pilotFolderCode, c.productionFolderCode].filter(Boolean).join('/') || 'N/A'}`
  );

  const clientButtons = [];
  if (clients.length === 1) {
    clientButtons.push({ label: `Open ${clients[0].companyName}`, route: `/clients/${clients[0]._id}` });
  }
  clientButtons.push({ label: 'View Clients', route: `/clients${search ? `?search=${encodeURIComponent(search)}` : ''}` });

  return {
    statusType: 'search',
    response: `Found ${totalMatched} client(s)${search ? ` matching "${search}"` : ''}:\n${lines.join('\n')}`,
    action: {
      type: 'DB_QUERY_RESULT',
      buttons: clientButtons,
    },
  };
}

async function queryTickets({ search, filterMode = 'recent', user }) {
  const baseScope = buildTicketScope(user);
  if (filterMode === 'pending') {
    baseScope.status = { $in: ['New', 'Assigned', 'In Progress', 'On Hold', 'Awaiting Client Response', 'Testing', 'Reopened'] };
  } else if (filterMode === 'completed') {
    baseScope.status = { $in: ['Resolved', 'Closed'] };
  } else if (filterMode === 'unapproved') {
    baseScope.approvalStatus = 'PENDING_APPROVAL';
  }

  const cleanSearch = String(search || '').trim();
  const combineFilter = (extra) => {
    if (!extra) return { ...baseScope };
    if (baseScope.$or) {
      const f = { ...baseScope, $and: [{ $or: baseScope.$or }, extra] };
      delete f.$or;
      return f;
    }
    return { ...baseScope, ...extra };
  };

  let filter = combineFilter(null);
  let fallbackAnyFilter = null;
  let tokens = [];

  if (cleanSearch) {
    const tokenSpec = buildMultiTokenFilter(cleanSearch, ['ticketId', 'title', 'description', 'category', 'folderCode', 'priority', 'status']);
    if (tokenSpec?.allFilter) {
      filter = combineFilter(tokenSpec.allFilter);
      fallbackAnyFilter = combineFilter(tokenSpec.anyFilter);
      tokens = tokenSpec.tokens || [];
    } else if (tokenSpec) {
      filter = combineFilter(tokenSpec);
      tokens = getSearchTokens(cleanSearch);
    }
  }

  let [total, tickets] = await Promise.all([
    Ticket.countDocuments(filter),
    Ticket.find(filter)
      .populate('client', 'companyName')
      .populate('assignedDevelopers', 'fullName')
      .select('ticketId title description status approvalStatus priority category client assignedDevelopers createdAt')
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
  ]);

  let matchedMode = 'exact';
  if (tickets.length === 0 && fallbackAnyFilter) {
    const [anyTotal, anyRows] = await Promise.all([
      Ticket.countDocuments(fallbackAnyFilter),
      Ticket.find(fallbackAnyFilter)
        .populate('client', 'companyName')
        .populate('assignedDevelopers', 'fullName')
        .select('ticketId title description status approvalStatus priority category client assignedDevelopers createdAt')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
    ]);
    if (anyRows.length > 0) {
      matchedMode = 'partial';
      total = anyTotal;
      anyRows.sort((a, b) => {
        const hayA = `${a.ticketId} ${a.title} ${a.description || ''}`.toLowerCase();
        const hayB = `${b.ticketId} ${b.title} ${b.description || ''}`.toLowerCase();
        const scoreA = tokens.reduce((acc, t) => acc + (hayA.includes(t) ? 1 : 0), 0);
        const scoreB = tokens.reduce((acc, t) => acc + (hayB.includes(t) ? 1 : 0), 0);
        return scoreB - scoreA || new Date(b.createdAt) - new Date(a.createdAt);
      });
      tickets = anyRows.slice(0, 6);
    }
  } else {
    tickets = tickets.slice(0, 6);
  }

  // Also check AI TicketDrafts if searching for a topic and few/no published tickets matched
  let matchingDrafts = [];
  if (cleanSearch && tokens.length > 0 && tickets.length < 3) {
    const draftRxOr = tokens.flatMap((t) => {
      const rx = new RegExp(escapeRegex(t), 'i');
      return [{ draftId: rx }, { 'generatedFields.title': rx }, { 'generatedFields.description': rx }];
    });
    matchingDrafts = await TicketDraft.find({ isDeleted: false, $or: draftRxOr })
      .populate('clientId', 'companyName')
      .select('draftId approvalStatus generatedFields.title clientId createdAt')
      .sort({ createdAt: -1 })
      .limit(4)
      .lean();
  }

  if (tickets.length === 0 && matchingDrafts.length === 0) {
    return {
      statusType: 'search',
      response: cleanSearch
        ? `No tickets or drafts matched "${cleanSearch}".`
        : 'No matching tickets found in the database.',
      action: { type: 'DB_QUERY_RESULT', buttons: [{ label: 'Open Tickets', route: '/tickets' }] },
    };
  }

  const lines = tickets.map((t) => {
    const devNames = (t.assignedDevelopers || []).map((d) => d.fullName).join(', ') || 'Unassigned';
    return `• ${t.ticketId} [${t.status} · ${t.priority}] ${t.title} (${t.client?.companyName || 'No client'} · ${devNames})`;
  });
  if (matchingDrafts.length > 0) {
    lines.push(
      `\nMatching TL Approval Drafts (${matchingDrafts.length}):`,
      ...matchingDrafts.map(
        (d) => `• ${d.draftId} [${d.approvalStatus}] ${d.generatedFields?.title || 'Draft'} (${d.clientId?.companyName || 'Unverified'})`
      )
    );
  }

  const buttons = tickets.slice(0, 3).map((t) => ({
    label: `Open ${t.ticketId}`,
    route: `/tickets/${t._id}`,
  }));
  if (matchingDrafts.length > 0 && buttons.length < 3) {
    buttons.push({ label: `Review ${matchingDrafts[0].draftId}`, route: `/approvals/drafts?draft=${matchingDrafts[0]._id}&status=All` });
  }
  buttons.push({ label: 'All Tickets', route: `/tickets${cleanSearch ? `?search=${encodeURIComponent(tokens[0] || cleanSearch)}` : ''}` });

  const headerText =
    tickets.length > 0
      ? `Found ${total} ticket(s)${cleanSearch ? ` matching "${cleanSearch}"${matchedMode === 'partial' ? ' (best token matches)' : ''}` : ''} (showing top ${tickets.length}):`
      : `No published tickets matched "${cleanSearch}", found ${matchingDrafts.length} matching TL approval draft(s):`;

  return {
    statusType: 'search',
    response: `${headerText}\n${lines.join('\n')}`,
    action: {
      type: 'DB_QUERY_RESULT',
      buttons,
    },
    contextUpdates: {
      lastResultIds: tickets.map((t) => t._id),
    },
  };
}

async function queryDuplicateTickets({ user }) {
  const filter = buildTicketScope(user);
  const tickets = await Ticket.find(filter)
    .populate('client', 'companyName')
    .select('ticketId title status client createdAt')
    .sort({ createdAt: -1 })
    .limit(400)
    .lean();

  const buckets = new Map();
  for (const t of tickets) {
    const normalizedTitle = String(t.title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalizedTitle) continue;
    const key = `${String(t.client?._id || 'none')}::${normalizedTitle}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t);
  }

  const dupGroups = Array.from(buckets.values()).filter((grp) => grp.length > 1);
  if (dupGroups.length === 0) {
    return {
      statusType: 'response',
      response: `Checked ${tickets.length} active ticket(s) — no exact duplicate ticket groups were found.`,
      action: {
        type: 'DB_QUERY_RESULT',
        buttons:
          user?.role === ROLES.ADMIN
            ? [{ label: 'Open Data & Duplicate Control', route: '/admin/governance' }]
            : [{ label: 'Open All Tickets', route: '/tickets' }],
      },
    };
  }

  const lines = dupGroups.slice(0, 8).map((grp) => {
    const ids = grp.map((t) => t.ticketId).join(', ');
    return `• ${grp.length}x "${grp[0].title}" (${grp[0].client?.companyName || 'No client'}) -> ${ids}`;
  });

  const buttons =
    user?.role === ROLES.ADMIN
      ? [{ label: 'Review & Clean Duplicates', route: '/admin/governance' }]
      : [{ label: 'Open All Tickets', route: '/tickets' }];

  return {
    statusType: 'warning',
    response: `Found ${dupGroups.length} duplicate ticket group(s) across ${tickets.length} ticket(s):\n${lines.join('\n')}`,
    action: { type: 'DB_QUERY_RESULT', buttons },
  };
}

async function queryTasks({ search, user }) {
  const filter = { isDeleted: false };
  if (user?.role === ROLES.DEVELOPER) {
    filter.$or = [{ assignedEmployees: user._id }, { createdBy: user._id }];
  }
  const rx = buildSearchRegex(search);
  if (rx) {
    const sOr = [{ taskId: rx }, { title: rx }, { status: rx }, { priority: rx }];
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: sOr }];
      delete filter.$or;
    } else {
      filter.$or = sOr;
    }
  }

  const [total, tasks] = await Promise.all([
    Task.countDocuments(filter),
    Task.find(filter)
      .populate('ticket', 'ticketId')
      .populate('assignedEmployees', 'fullName')
      .select('taskId title status priority dueDate ticket assignedEmployees')
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean(),
  ]);

  if (tasks.length === 0) {
    return {
      statusType: 'search',
      response: search ? `No tasks matched "${search}".` : 'No tasks found.',
      action: { type: 'DB_QUERY_RESULT', buttons: [{ label: 'Open Task Board', route: '/task-board' }] },
    };
  }

  const lines = tasks.map(
    (t) =>
      `• ${t.taskId} [${t.status} · ${t.priority}] ${t.title}${t.ticket?.ticketId ? ` (${t.ticket.ticketId})` : ''} — ${(t.assignedEmployees || []).map((e) => e.fullName).join(', ') || 'Unassigned'}`
  );

  return {
    statusType: 'search',
    response: `Found ${total} task(s)${search ? ` matching "${search}"` : ''}:\n${lines.join('\n')}`,
    action: { type: 'DB_QUERY_RESULT', buttons: [{ label: 'Open Task Board', route: '/task-board' }] },
  };
}

async function queryProjects({ search }) {
  const filter = { isDeleted: false };
  const rx = buildSearchRegex(search);
  if (rx) filter.$or = [{ projectId: rx }, { name: rx }, { status: rx }];

  const [total, projects] = await Promise.all([
    Project.countDocuments(filter),
    Project.find(filter)
      .populate('client', 'companyName')
      .select('projectId name status progressPercentage client createdAt')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
  ]);

  if (projects.length === 0) {
    return {
      statusType: 'search',
      response: search ? `No projects matched "${search}".` : 'No projects found.',
      action: { type: 'DB_QUERY_RESULT', buttons: [{ label: 'Open Projects', route: '/projects' }] },
    };
  }

  const lines = projects.map(
    (p) => `• ${p.projectId} ${p.name} — ${p.client?.companyName || 'Internal'} · ${p.status} (${p.progressPercentage ?? 0}%)`
  );

  return {
    statusType: 'search',
    response: `Found ${total} project(s):\n${lines.join('\n')}`,
    action: { type: 'DB_QUERY_RESULT', buttons: [{ label: 'Open Projects', route: '/projects' }] },
  };
}

async function queryDeployments({ search }) {
  const filter = { isDeleted: false };
  const rx = buildSearchRegex(search);
  if (rx) {
    filter.$or = [{ deploymentId: rx }, { sageX3Folder: rx }, { environment: rx }, { workflowStage: rx }, { versionReference: rx }];
  }

  const [total, deployments] = await Promise.all([
    Deployment.countDocuments(filter),
    Deployment.find(filter)
      .populate('client', 'companyName')
      .populate('deployedBy', 'fullName')
      .select('deploymentId environment workflowStage sageX3Folder versionReference approvalStatus deploymentDate client deployedBy')
      .sort({ deploymentDate: -1 })
      .limit(10)
      .lean(),
  ]);

  if (deployments.length === 0) {
    return {
      statusType: 'search',
      response: search ? `No deployments matched "${search}".` : 'No deployments recorded yet.',
      action: { type: 'DB_QUERY_RESULT', buttons: [{ label: 'Open Deployments', route: '/deployments' }] },
    };
  }

  const lines = deployments.map(
    (d) =>
      `• ${d.deploymentId} [${d.environment} · ${d.workflowStage}] ${d.client?.companyName || ''} (${d.sageX3Folder}) v${d.versionReference} · ${d.approvalStatus} on ${formatDateShort(d.deploymentDate)}`
  );

  return {
    statusType: 'search',
    response: `Found ${total} deployment(s):\n${lines.join('\n')}`,
    action: { type: 'DB_QUERY_RESULT', buttons: [{ label: 'Open Deployments', route: '/deployments' }] },
  };
}

async function queryEmails({ search, user }) {
  if (user?.role === ROLES.DEVELOPER) {
    return {
      statusType: 'warning',
      response: 'Email integration mailbox inspection is available to Team Leads and Administrators.',
      action: null,
    };
  }
  const filter = {};
  const rx = buildSearchRegex(search);
  if (rx) {
    filter.$or = [{ subject: rx }, { 'sender.email': rx }, { 'sender.name': rx }, { processingStatus: rx }];
  }

  const [total, emails] = await Promise.all([
    EmailMessage.countDocuments(filter),
    EmailMessage.find(filter)
      .populate('matchedClientId', 'companyName')
      .select('provider subject sender processingStatus matchedClientId relatedTicketId receivedAt')
      .sort({ receivedAt: -1 })
      .limit(10)
      .lean(),
  ]);

  if (emails.length === 0) {
    return {
      statusType: 'search',
      response: search ? `No synced emails matched "${search}".` : 'No synced emails found in Email Inbox.',
      action: { type: 'DB_QUERY_RESULT', buttons: [{ label: 'Open Email Inbox', route: '/email-inbox' }] },
    };
  }

  const lines = emails.map(
    (e) =>
      `• [${e.processingStatus}] "${e.subject}" from ${e.sender?.email || e.sender?.name || 'Unknown'}${e.matchedClientId?.companyName ? ` (${e.matchedClientId.companyName})` : ''} on ${formatDateShort(e.receivedAt)}`
  );

  return {
    statusType: 'search',
    response: `Found ${total} email message(s) (showing latest ${emails.length}):\n${lines.join('\n')}`,
    action: { type: 'DB_QUERY_RESULT', buttons: [{ label: 'Open Email Inbox', route: '/email-inbox' }] },
  };
}

async function queryDraftsAndRequests({ user }) {
  if (user?.role === ROLES.DEVELOPER) {
    const myDrafts = await TicketDraft.find({ isDeleted: false, submittedBy: user._id })
      .populate('clientId', 'companyName')
      .select('draftId approvalStatus generatedFields.title clientId createdAt')
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();
    if (myDrafts.length === 0) {
      return {
        statusType: 'response',
        response: 'You have not submitted any AI ticket drafts yet.',
        action: { type: 'DB_QUERY_RESULT', buttons: [{ label: 'Open Smart Intake', route: '/smart-intake' }] },
      };
    }
    return {
      statusType: 'response',
      response: `Your recent ticket drafts (${myDrafts.length}):\n${myDrafts
        .map((d) => `• ${d.draftId} [${d.approvalStatus}] ${d.generatedFields?.title || 'Draft'} (${d.clientId?.companyName || 'Unassigned'})`)
        .join('\n')}`,
      action: { type: 'DB_QUERY_RESULT', buttons: [{ label: 'Open Smart Intake', route: '/smart-intake' }] },
    };
  }

  const [pendingDrafts, pendingTickets, pendingReqs] = await Promise.all([
    TicketDraft.find({ isDeleted: false, approvalStatus: 'Pending TL Approval' })
      .populate('clientId', 'companyName')
      .select('draftId generatedFields.title clientId createdAt')
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),
    Ticket.find({ isDeleted: false, approvalStatus: 'PENDING_APPROVAL' })
      .populate('client', 'companyName')
      .select('ticketId title client createdAt')
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),
    AIActionRequest.find({ status: 'Pending TL Approval' })
      .select('actionType title summary createdAt')
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),
  ]);

  const sections = [];
  if (pendingTickets.length) {
    sections.push(`Manual Tickets (${pendingTickets.length}):\n${pendingTickets.map((t) => `• ${t.ticketId}: ${t.title} (${t.client?.companyName || 'No client'})`).join('\n')}`);
  }
  if (pendingDrafts.length) {
    sections.push(`AI Ticket Drafts (${pendingDrafts.length}):\n${pendingDrafts.map((d) => `• ${d.draftId}: ${d.generatedFields?.title || 'Draft'} (${d.clientId?.companyName || 'No client'})`).join('\n')}`);
  }
  if (pendingReqs.length) {
    sections.push(`AI User/Client/Project Requests (${pendingReqs.length}):\n${pendingReqs.map((r) => `• [${r.actionType}] ${r.title}`).join('\n')}`);
  }

  return {
    statusType: 'approval',
    response: sections.length ? sections.join('\n\n') : 'No pending TL approvals across tickets, drafts, or AI requests.',
    action: {
      type: 'DB_QUERY_RESULT',
      buttons: [
        { label: 'Ticket Approvals', route: '/approvals/tickets' },
        { label: 'AI Drafts', route: '/approvals/drafts' },
        { label: 'Entity Requests', route: '/approvals/requests' },
      ],
    },
  };
}

async function queryKnowledgeBase({ search }) {
  const filter = { isDeleted: false };
  const rx = buildSearchRegex(search);
  if (rx) filter.$or = [{ articleId: rx }, { title: rx }, { category: rx }, { summary: rx }, { tags: rx }];

  const [total, articles] = await Promise.all([
    KnowledgeBase.countDocuments(filter),
    KnowledgeBase.find(filter)
      .select('articleId title category sageX3Version tags createdAt')
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean(),
  ]);

  if (articles.length === 0) {
    return {
      statusType: 'search',
      response: search ? `No Knowledge Base articles matched "${search}".` : 'No Knowledge Base articles found.',
      action: { type: 'DB_QUERY_RESULT', buttons: [{ label: 'Open Knowledge Base', route: '/knowledge-base' }] },
    };
  }

  const lines = articles.map((a) => `• ${a.articleId} [${a.category}] ${a.title} (${a.sageX3Version})`);
  return {
    statusType: 'search',
    response: `Found ${total} Knowledge Base article(s):\n${lines.join('\n')}`,
    action: { type: 'DB_QUERY_RESULT', buttons: [{ label: 'Open Knowledge Base', route: '/knowledge-base' }] },
  };
}

async function queryLogs({ search, user }) {
  const isPrivileged = [ROLES.ADMIN, ROLES.TEAM_LEAD].includes(user?.role);
  const actFilter = isPrivileged ? {} : { actor: user._id };
  const rx = buildSearchRegex(search);
  if (rx) {
    actFilter.$or = [{ summary: rx }, { action: rx }, { entityRef: rx }, { entityType: rx }];
  }

  const [activities, audits] = await Promise.all([
    ActivityLog.find(actFilter)
      .populate('actor', 'fullName')
      .select('action entityType entityRef summary actor createdAt')
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
    isPrivileged
      ? AuditLog.find(rx ? { $or: [{ action: rx }, { recordRef: rx }, { recordType: rx }, { module: rx }] } : {})
          .populate('actorId', 'fullName')
          .select('action recordType recordRef module result actorId timestamp')
          .sort({ timestamp: -1 })
          .limit(6)
          .lean()
      : Promise.resolve([]),
  ]);

  const lines = [];
  if (activities.length) {
    lines.push('Recent Activity:');
    for (const a of activities) {
      lines.push(`• [${formatDateShort(a.createdAt)}] ${a.summary} (${a.actor?.fullName || 'System'})`);
    }
  }
  if (audits.length) {
    lines.push('\nRecent Security & Audit Events:');
    for (const au of audits) {
      lines.push(`• [${formatDateShort(au.timestamp)}] ${au.action} ${au.recordType} ${au.recordRef || ''} (${au.result})`);
    }
  }

  const buttons =
    user?.role === ROLES.ADMIN
      ? [
          { label: 'Audit Logs', route: '/admin/monitoring/audit' },
          { label: 'Data & Duplicate Control', route: '/admin/governance' },
        ]
      : [{ label: 'Activity Feed', route: '/activity' }];

  return {
    statusType: 'response',
    response: lines.length ? lines.join('\n') : 'No matching log entries found.',
    action: { type: 'DB_QUERY_RESULT', buttons },
  };
}

async function queryStats({ user }) {
  const ticketFilter = buildTicketScope(user);
  const [
    usersCount,
    clientsCount,
    ticketsCount,
    openTicketsCount,
    pendingApprovalTickets,
    pendingDrafts,
    tasksCount,
    projectsCount,
    deploymentsCount,
    emailsCount,
    kbCount,
  ] = await Promise.all([
    User.countDocuments({ isDeleted: false }),
    Client.countDocuments({ isDeleted: false }),
    Ticket.countDocuments(ticketFilter),
    Ticket.countDocuments({ ...ticketFilter, status: { $nin: ['Resolved', 'Closed'] } }),
    Ticket.countDocuments({ isDeleted: false, approvalStatus: 'PENDING_APPROVAL' }),
    TicketDraft.countDocuments({ isDeleted: false, approvalStatus: 'Pending TL Approval' }),
    Task.countDocuments({ isDeleted: false }),
    Project.countDocuments({ isDeleted: false }),
    Deployment.countDocuments({ isDeleted: false }),
    EmailMessage.countDocuments({}),
    KnowledgeBase.countDocuments({ isDeleted: false }),
  ]);

  let storageText = '';
  if ([ROLES.ADMIN, ROLES.TEAM_LEAD].includes(user?.role) && mongoose.connection?.db) {
    try {
      const dbStats = await mongoose.connection.db.stats();
      const mb = (val) => `${((val || 0) / (1024 * 1024)).toFixed(2)} MB`;
      storageText = `\n• MongoDB Storage: ${mb(dbStats.storageSize)} allocated · ${mb(dbStats.dataSize)} data · ${mb(dbStats.indexSize)} indexes`;
    } catch {
      storageText = '';
    }
  }

  return {
    statusType: 'response',
    response:
      `Live Database Snapshot:\n` +
      `• Users: ${usersCount} | Clients: ${clientsCount}\n` +
      `• Tickets: ${ticketsCount} (${openTicketsCount} open, ${pendingApprovalTickets} manual awaiting TL)\n` +
      `• AI Drafts Pending TL: ${pendingDrafts}\n` +
      `• Tasks: ${tasksCount} | Projects: ${projectsCount} | Deployments: ${deploymentsCount}\n` +
      `• Synced Emails: ${emailsCount} | Knowledge Base Articles: ${kbCount}` +
      storageText,
    action: {
      type: 'DB_QUERY_RESULT',
      buttons:
        user?.role === ROLES.ADMIN
          ? [{ label: 'Open System Overview', route: '/admin/monitoring/overview' }]
          : [{ label: 'Open Dashboard', route: '/' }],
    },
  };
}

async function queryTimesheets({ search, user }) {
  const filter = { isDeleted: false };
  if (user?.role === ROLES.DEVELOPER) {
    filter.employee = user._id;
  }
  const rx = buildSearchRegex(search);
  if (rx) {
    filter.$or = [{ projectCode: rx }, { taskTitle: rx }, { workDescription: rx }, { taskType: rx }, { entryStatus: rx }];
  }

  const rows = await TimeLog.find(filter)
    .populate('client', 'companyName')
    .populate('employee', 'fullName')
    .select('date client projectCode taskTitle taskType entryStatus hoursSpent workDescription employee')
    .sort({ date: -1 })
    .limit(8)
    .lean();

  if (rows.length === 0) {
    return {
      statusType: 'search',
      response: search ? `No timesheet entries matched "${search}".` : 'No timesheet entries logged yet.',
      action: { type: 'DB_QUERY_RESULT', buttons: [{ label: 'Open Timesheet', route: '/timesheet' }] },
    };
  }

  const totalHrs = Number(rows.reduce((s, r) => s + Number(r.hoursSpent || 0), 0).toFixed(2));
  const lines = rows.map(
    (r) =>
      `• [${formatDateShort(r.date)}] ${r.hoursSpent}h · ${r.client?.companyName || 'No Client'} · ${r.projectCode || '—'} · ${r.taskTitle || 'Work'} (${r.entryStatus || 'DONE'}) — ${r.employee?.fullName || ''}`
  );

  return {
    statusType: 'search',
    response: `Latest ${rows.length} timesheet entry/entries (${totalHrs}h shown):\n${lines.join('\n')}`,
    action: { type: 'DB_QUERY_RESULT', buttons: [{ label: 'Open Timesheet', route: '/timesheet' }] },
  };
}

async function queryGlobalSearch({ search, user }) {
  const raw = String(search || '').trim();
  const q = extractSearchKeywords(raw) || raw;
  if (!q) {
    return queryStats({ user });
  }
  const tokens = getSearchTokens(q);
  const mkOr = (fields) => ({
    $or: (tokens.length > 0 ? tokens : [q]).flatMap((tok) => {
      const rx = new RegExp(escapeRegex(tok), 'i');
      return fields.map((f) => ({ [f]: rx }));
    }),
  });
  const ticketScope = buildTicketScope(user);
  const isPrivileged = [ROLES.ADMIN, ROLES.TEAM_LEAD].includes(user?.role);

  const [users, clients, tickets, drafts, tasks, projects, kb, emails, timeLogs] = await Promise.all([
    User.find({ isDeleted: false, ...mkOr(['fullName', 'email', 'employeeId', 'designation']) })
      .select('employeeId fullName role designation')
      .limit(5)
      .lean(),
    Client.find({ isDeleted: false, ...mkOr(['companyName', 'clientId', 'clientFolderCode']) })
      .select('clientId companyName clientFolderCode')
      .limit(5)
      .lean(),
    Ticket.find({
      ...ticketScope,
      ...mkOr(['ticketId', 'title', 'description']),
    })
      .select('ticketId title status')
      .limit(5)
      .lean(),
    TicketDraft.find({ isDeleted: false, ...mkOr(['draftId', 'generatedFields.title', 'generatedFields.description']) })
      .select('draftId approvalStatus generatedFields.title')
      .limit(4)
      .lean(),
    Task.find({ isDeleted: false, ...mkOr(['taskId', 'title']) })
      .select('taskId title status')
      .limit(4)
      .lean(),
    Project.find({ isDeleted: false, ...mkOr(['projectId', 'name']) })
      .select('projectId name status')
      .limit(4)
      .lean(),
    KnowledgeBase.find({ isDeleted: false, ...mkOr(['articleId', 'title', 'tags']) })
      .select('articleId title category')
      .limit(3)
      .lean(),
    isPrivileged
      ? EmailMessage.find(mkOr(['subject', 'sender.email', 'plainBody']))
          .select('subject processingStatus sender')
          .limit(3)
          .lean()
      : Promise.resolve([]),
    TimeLog.find({ isDeleted: false, ...(user?.role === ROLES.DEVELOPER ? { employee: user._id } : {}), ...mkOr(['projectCode', 'taskTitle', 'workDescription']) })
      .select('projectCode taskTitle hoursSpent date')
      .limit(3)
      .lean(),
  ]);

  const hits = [];
  if (users.length) hits.push(`Users (${users.length}): ${users.map((u) => `${u.fullName} (${u.employeeId})`).join(', ')}`);
  if (clients.length) hits.push(`Clients (${clients.length}): ${clients.map((c) => `${c.companyName} (${c.clientId})`).join(', ')}`);
  if (tickets.length) hits.push(`Tickets (${tickets.length}): ${tickets.map((t) => `${t.ticketId}: ${t.title} [${t.status}]`).join(' | ')}`);
  if (drafts.length) hits.push(`Ticket Drafts (${drafts.length}): ${drafts.map((d) => `${d.draftId}: ${d.generatedFields?.title || 'Draft'}`).join(' | ')}`);
  if (tasks.length) hits.push(`Tasks (${tasks.length}): ${tasks.map((t) => `${t.taskId}: ${t.title}`).join(', ')}`);
  if (projects.length) hits.push(`Projects (${projects.length}): ${projects.map((p) => `${p.projectId}: ${p.name}`).join(', ')}`);
  if (kb.length) hits.push(`Knowledge Base (${kb.length}): ${kb.map((k) => `${k.articleId}: ${k.title}`).join(', ')}`);
  if (emails.length) hits.push(`Emails (${emails.length}): ${emails.map((e) => `"${e.subject}"`).join(', ')}`);
  if (timeLogs.length) hits.push(`Timesheet (${timeLogs.length}): ${timeLogs.map((l) => `${l.hoursSpent}h · ${l.taskTitle || l.projectCode}`).join(', ')}`);

  if (hits.length === 0) {
    return {
      statusType: 'search',
      response: `No database records matched "${q}". You can ask for: "new users", "list clients", "duplicate tickets", "pending approvals", "recent emails", "timesheet", "deployments", or "database stats".`,
      action: null,
    };
  }

  const buttons = [];
  if (tickets.length) buttons.push({ label: `Open ${tickets[0].ticketId}`, route: `/tickets/${tickets[0]._id}` });
  if (drafts.length) buttons.push({ label: `Review ${drafts[0].draftId}`, route: `/approvals/drafts?draft=${drafts[0]._id}&status=All` });
  if (clients.length) buttons.push({ label: `Open ${clients[0].companyName}`, route: `/clients/${clients[0]._id}` });
  if (users.length) buttons.push({ label: 'View Team', route: '/team' });
  if (timeLogs.length) buttons.push({ label: 'Open Timesheet', route: '/timesheet' });

  return {
    statusType: 'search',
    response: `Database matches for "${q}":\n${hits.map((h) => `• ${h}`).join('\n')}`,
    action: buttons.length ? { type: 'DB_QUERY_RESULT', buttons: buttons.slice(0, 4) } : null,
  };
}

/**
 * Executes safe, read-only database queries across all operational collections (excluding secrets/passwords).
 */
export async function querySafeDatabase({ queryType = 'auto', search = '', message = '', user }) {
  const type = String(queryType || 'auto').toLowerCase();
  const cleanSearch = String(search || '').trim();

  switch (type) {
    case 'users':
    case 'new_users':
      return queryUsers({ search: cleanSearch });
    case 'clients':
    case 'new_clients':
      return queryClients({ search: cleanSearch });
    case 'tickets':
    case 'new_tickets':
      return queryTickets({ search: cleanSearch, filterMode: 'recent', user });
    case 'pending_tickets':
      return queryTickets({ search: cleanSearch, filterMode: 'pending', user });
    case 'completed_tickets':
      return queryTickets({ search: cleanSearch, filterMode: 'completed', user });
    case 'duplicate_tickets':
      return queryDuplicateTickets({ user });
    case 'tasks':
      return queryTasks({ search: cleanSearch, user });
    case 'projects':
      return queryProjects({ search: cleanSearch });
    case 'deployments':
      return queryDeployments({ search: cleanSearch });
    case 'emails':
      return queryEmails({ search: cleanSearch, user });
    case 'drafts':
    case 'approvals':
    case 'action_requests':
      return queryDraftsAndRequests({ user });
    case 'knowledge_base':
      return queryKnowledgeBase({ search: cleanSearch });
    case 'logs':
    case 'deletions':
      return queryLogs({ search: cleanSearch, user });
    case 'stats':
    case 'counts':
    case 'space_consumed':
      return queryStats({ user });
    case 'timesheet':
    case 'time_logs':
      return queryTimesheets({ search: cleanSearch, user });
    case 'global_search':
    case 'auto':
    default:
      return queryGlobalSearch({ search: cleanSearch || message, user });
  }
}

/**
 * Returns compact non-sensitive DB stats & recent highlights to ground LLM context.
 */
export async function getGroundedDbSummary(user) {
  const ticketFilter = buildTicketScope(user);
  const [usersCount, clientsCount, ticketsCount, openTicketsCount, newestUsers, newestClients, emailsCount, kbCount] =
    await Promise.all([
      User.countDocuments({ isDeleted: false }),
      Client.countDocuments({ isDeleted: false }),
      Ticket.countDocuments(ticketFilter),
      Ticket.countDocuments({ ...ticketFilter, status: { $nin: ['Resolved', 'Closed'] } }),
      User.find({ isDeleted: false }).select('employeeId fullName role designation createdAt').sort({ createdAt: -1 }).limit(5).lean(),
      Client.find({ isDeleted: false }).select('clientId companyName clientFolderCode sageX3Version createdAt').sort({ createdAt: -1 }).limit(5).lean(),
      EmailMessage.countDocuments({}),
      KnowledgeBase.countDocuments({ isDeleted: false }),
    ]);

  return {
    counts: {
      users: usersCount,
      clients: clientsCount,
      tickets: ticketsCount,
      openTickets: openTicketsCount,
      emails: emailsCount,
      knowledgeBase: kbCount,
    },
    newestUsers: newestUsers.map((u) => ({
      employeeId: u.employeeId,
      fullName: u.fullName,
      role: u.role,
      designation: u.designation,
      joined: formatDateShort(u.createdAt),
    })),
    newestClients: newestClients.map((c) => ({
      clientId: c.clientId,
      companyName: c.companyName,
      folder: c.clientFolderCode,
      version: c.sageX3Version,
    })),
  };
}
