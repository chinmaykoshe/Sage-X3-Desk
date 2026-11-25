import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { isMongoConnected } from '../config/db.js';
import {
  getSupabaseBackupStatus,
  loadSupabaseSnapshot,
  saveSupabaseSnapshot,
  triggerDualBackupSync,
  uploadFileToSupabase,
} from '../services/backupSyncService.js';
import { ROLES } from '../config/constants.js';
import { checkOllamaStatus } from '../services/ai/ollamaService.js';

const fallbackRouter = express.Router();
const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const jwtSecret = () => process.env.JWT_SECRET || 'sage_x3_desk_dev_secret_change_in_production_2026';
const genId = () => crypto.randomBytes(12).toString('hex');
const sanitizeUser = (u) => {
  if (!u) return null;
  const { password, ...rest } = u;
  return rest;
};

async function getCtx() {
  const snap = await loadSupabaseSnapshot();
  const c = snap?.collections || {};
  return {
    snap,
    users: c.users || [],
    clients: (c.clients || []).filter((x) => !x.isDeleted),
    tickets: (c.tickets || []).filter((x) => !x.isDeleted),
    tasks: (c.tasks || []).filter((x) => !x.isDeleted),
    projects: (c.projects || []).filter((x) => !x.isDeleted),
    deployments: (c.deployments || []).filter((x) => !x.isDeleted),
    comments: (c.comments || []).filter((x) => !x.isDeleted),
    attachments: (c.attachments || []).filter((x) => !x.isDeleted),
    timeLogs: (c.timeLogs || []).filter((x) => !x.isDeleted),
    notifications: c.notifications || [],
    activityLogs: c.activityLogs || [],
    knowledgeBase: (c.knowledgeBase || []).filter((x) => !x.isDeleted),
    settings: c.settings?.[0] || { organizationName: 'Sage X3 Desk' },
    ticketDrafts: (c.ticketDrafts || []).filter((x) => !x.isDeleted),
    aiActionRequests: c.aiActionRequests || [],
    savedViews: c.savedViews || [],
  };
}

async function persistCollections(snap, updates) {
  const nextSnap = {
    syncedAt: new Date().toISOString(),
    source: 'supabase-fallback',
    collections: {
      ...(snap?.collections || {}),
      ...updates,
    },
  };
  await saveSupabaseSnapshot(nextSnap);
  return nextSnap;
}

const byIdMap = (arr) => new Map(arr.map((x) => [String(x._id), x]));

function populateTicket(t, ctx) {
  const clientMap = byIdMap(ctx.clients);
  const projectMap = byIdMap(ctx.projects);
  const userMap = byIdMap(ctx.users.map(sanitizeUser));
  const now = new Date();
  const ticketTasks = ctx.tasks.filter((tk) => String(tk.ticket) === String(t._id));
  const isOverdue = Boolean(t.dueDate && new Date(t.dueDate) < now && !['Resolved', 'Closed'].includes(t.status));
  return {
    ...t,
    isOverdue,
    client: clientMap.get(String(t.client)) || t.client,
    project: projectMap.get(String(t.project)) || t.project,
    assignedDevelopers: (t.assignedDevelopers || []).map((id) => userMap.get(String(id)) || id).filter(Boolean),
    assignedTeamLead: userMap.get(String(t.assignedTeamLead)) || t.assignedTeamLead,
    createdBy: userMap.get(String(t.createdBy)) || t.createdBy,
    taskSummary: {
      total: ticketTasks.length,
      completed: ticketTasks.filter((tk) => tk.status === 'Completed').length,
    },
    commentCount: ctx.comments.filter((cm) => cm.entityType === 'ticket' && String(cm.entityId) === String(t._id)).length,
    attachmentCount: ctx.attachments.filter((at) => at.entityType === 'ticket' && String(at.entityId) === String(t._id)).length,
  };
}

function populateTask(tk, ctx) {
  const clientMap = byIdMap(ctx.clients);
  const ticketMap = byIdMap(ctx.tickets);
  const userMap = byIdMap(ctx.users.map(sanitizeUser));
  return {
    ...tk,
    client: clientMap.get(String(tk.client)) || tk.client,
    ticket: ticketMap.get(String(tk.ticket)) || tk.ticket,
    assignedEmployees: (tk.assignedEmployees || []).map((id) => userMap.get(String(id)) || id).filter(Boolean),
  };
}

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.query.token;
    if (!token) return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
    const decoded = jwt.verify(token, jwtSecret());
    const ctx = await getCtx();
    const user = ctx.users.find((u) => String(u._id) === String(decoded.id) && !u.isDeleted);
    if (!user) return res.status(401).json({ success: false, message: 'User account not found in cloud sync.' });
    req.user = sanitizeUser(user);
    req.ctx = ctx;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired session token.' });
  }
}

fallbackRouter.get('/health', (req, res) => {
  res.json({
    success: true,
    mode: 'supabase-fallback',
    message: 'Sage X3 Desk API is operational (Supabase fallback)',
    timestamp: new Date().toISOString(),
  });
});

fallbackRouter.post('/auth/login', async (req, res, next) => {
  try {
    const { email = '', password = '' } = req.body || {};
    const ctx = await getCtx();
    const user = ctx.users.find((u) => String(u.email).toLowerCase() === String(email).toLowerCase() && !u.isDeleted);
    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    const token = jwt.sign({ id: user._id }, jwtSecret(), { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    return res.json({ success: true, message: 'Logged in via Supabase cloud sync', data: { token, user: sanitizeUser(user) } });
  } catch (err) {
    next(err);
  }
});

fallbackRouter.post('/auth/register', async (req, res, next) => {
  try {
    const { fullName, email, password, contactNumber = '', designation = 'Sage X3 Developer', department = 'Development' } = req.body || {};
    const ctx = await getCtx();
    if (ctx.users.some((u) => String(u.email).toLowerCase() === String(email).toLowerCase())) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = {
      _id: genId(),
      employeeId: `EMP-${101 + ctx.users.length}`,
      fullName,
      email: String(email).toLowerCase(),
      password: passwordHash,
      contactNumber,
      designation,
      department,
      role: ROLES.DEVELOPER,
      status: 'Active',
      isDeleted: false,
      createdAt: new Date().toISOString(),
    };
    await persistCollections(ctx.snap, { users: [...ctx.users, newUser] });
    const token = jwt.sign({ id: newUser._id }, jwtSecret(), { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    return res.status(201).json({ success: true, message: 'Registered via Supabase cloud sync', data: { token, user: sanitizeUser(newUser) } });
  } catch (err) {
    next(err);
  }
});

fallbackRouter.use(requireAuth);

fallbackRouter.get('/auth/me', (req, res) => res.json({ success: true, data: req.user }));
fallbackRouter.post('/auth/logout', (req, res) => res.json({ success: true, data: null }));
fallbackRouter.put('/auth/profile', async (req, res, next) => {
  try {
    const users = req.ctx.users.map((u) =>
      String(u._id) === String(req.user._id) ? { ...u, ...req.body, _id: u._id, password: u.password } : u
    );
    await persistCollections(req.ctx.snap, { users });
    const updated = users.find((u) => String(u._id) === String(req.user._id));
    res.json({ success: true, data: sanitizeUser(updated), message: 'Profile updated' });
  } catch (err) {
    next(err);
  }
});

fallbackRouter.get('/clients', (req, res) => {
  res.json({ success: true, data: req.ctx.clients, meta: { total: req.ctx.clients.length, page: 1, limit: 100, pages: 1 } });
});
fallbackRouter.post('/clients', async (req, res, next) => {
  try {
    const doc = {
      _id: genId(),
      clientId: `CL-${101 + req.ctx.clients.length}`,
      companyName: req.body.companyName || req.body.name || 'New Client',
      accountStatus: 'Active',
      ...req.body,
      isDeleted: false,
      createdAt: new Date().toISOString(),
    };
    await persistCollections(req.ctx.snap, { clients: [...(req.ctx.snap?.collections?.clients || []), doc] });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
});
fallbackRouter.get('/clients/:id', (req, res) => {
  const client = req.ctx.clients.find((c) => String(c._id) === req.params.id);
  if (!client) return res.status(404).json({ success: false, message: 'Client not found' });
  res.json({ success: true, data: client });
});

fallbackRouter.get('/users', (req, res) => {
  const data = req.ctx.users.filter((u) => !u.isDeleted).map(sanitizeUser);
  res.json({ success: true, data, meta: { total: data.length, page: 1, limit: 100, pages: 1 } });
});
fallbackRouter.get('/users/:id', (req, res) => {
  const u = req.ctx.users.find((x) => String(x._id) === req.params.id);
  if (!u) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, data: sanitizeUser(u) });
});

fallbackRouter.get('/projects', (req, res) => {
  const clientMap = byIdMap(req.ctx.clients);
  const data = req.ctx.projects.map((p) => ({ ...p, client: clientMap.get(String(p.client)) || p.client }));
  res.json({ success: true, data, meta: { total: data.length, page: 1, limit: 100, pages: 1 } });
});

fallbackRouter.get('/tickets', (req, res) => {
  let list = req.ctx.tickets;
  if (req.query.status) list = list.filter((t) => t.status === req.query.status);
  if (req.query.client) list = list.filter((t) => String(t.client) === String(req.query.client));
  if (req.query.priority) list = list.filter((t) => t.priority === req.query.priority);
  if (req.query.search) {
    const q = req.query.search.toLowerCase();
    list = list.filter((t) => `${t.ticketId} ${t.title} ${t.description}`.toLowerCase().includes(q));
  }
  const data = list.map((t) => populateTicket(t, req.ctx));
  res.json({ success: true, data, meta: { total: data.length, page: 1, limit: 100, pages: 1 } });
});

fallbackRouter.post('/tickets', async (req, res, next) => {
  try {
    const doc = {
      _id: genId(),
      ticketId: `TKT-${1001 + req.ctx.tickets.length}`,
      status: 'New',
      priority: 'Medium',
      severity: 'Minor',
      ...req.body,
      createdBy: req.user._id,
      isDeleted: false,
      createdAt: new Date().toISOString(),
    };
    await persistCollections(req.ctx.snap, { tickets: [doc, ...(req.ctx.snap?.collections?.tickets || [])] });
    res.status(201).json({ success: true, data: populateTicket(doc, req.ctx) });
  } catch (err) {
    next(err);
  }
});

fallbackRouter.get('/tickets/:id', (req, res) => {
  const t = req.ctx.tickets.find((x) => String(x._id) === req.params.id);
  if (!t) return res.status(404).json({ success: false, message: 'Ticket not found' });
  const userMap = byIdMap(req.ctx.users.map(sanitizeUser));
  const populated = populateTicket(t, req.ctx);
  const tasks = req.ctx.tasks.filter((tk) => String(tk.ticket) === String(t._id)).map((tk) => populateTask(tk, req.ctx));
  const comments = req.ctx.comments
    .filter((c) => c.entityType === 'ticket' && String(c.entityId) === String(t._id))
    .map((c) => ({ ...c, author: userMap.get(String(c.author)) || c.author }));
  const attachments = req.ctx.attachments.filter((a) => a.entityType === 'ticket' && String(a.entityId) === String(t._id));
  const activityLogs = req.ctx.activityLogs.filter((l) => String(l.ticket) === String(t._id));
  const timeLogs = req.ctx.timeLogs.filter((l) => String(l.ticket) === String(t._id));
  const deployments = req.ctx.deployments.filter((d) => String(d.ticket) === String(t._id));
  res.json({
    success: true,
    data: { ...populated, totalHoursLogged: 0, tasks, comments, attachments, activityLogs, timeLogs, deployments },
  });
});

fallbackRouter.patch('/tickets/:id/status', async (req, res, next) => {
  try {
    const tickets = (req.ctx.snap?.collections?.tickets || []).map((t) =>
      String(t._id) === req.params.id ? { ...t, status: req.body.status, updatedAt: new Date().toISOString() } : t
    );
    await persistCollections(req.ctx.snap, { tickets });
    res.json({ success: true, data: tickets.find((t) => String(t._id) === req.params.id) });
  } catch (err) {
    next(err);
  }
});

fallbackRouter.get('/tasks', (req, res) => {
  const data = req.ctx.tasks.map((tk) => populateTask(tk, req.ctx));
  res.json({ success: true, data, meta: { total: data.length, page: 1, limit: 100, pages: 1 } });
});
fallbackRouter.post('/tasks', async (req, res, next) => {
  try {
    const doc = {
      _id: genId(),
      taskId: `TSK-${1001 + req.ctx.tasks.length}`,
      status: 'To Do',
      ...req.body,
      isDeleted: false,
      createdAt: new Date().toISOString(),
    };
    await persistCollections(req.ctx.snap, { tasks: [doc, ...(req.ctx.snap?.collections?.tasks || [])] });
    res.status(201).json({ success: true, data: populateTask(doc, req.ctx) });
  } catch (err) {
    next(err);
  }
});

fallbackRouter.post('/comments', async (req, res, next) => {
  try {
    const doc = {
      _id: genId(),
      ...req.body,
      author: req.user._id,
      isDeleted: false,
      createdAt: new Date().toISOString(),
    };
    await persistCollections(req.ctx.snap, { comments: [...(req.ctx.snap?.collections?.comments || []), doc] });
    res.status(201).json({ success: true, data: { ...doc, author: req.user } });
  } catch (err) {
    next(err);
  }
});

fallbackRouter.post('/attachments', memUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file provided' });
    const uploaded = await uploadFileToSupabase(req.file.buffer, req.file.originalname, req.file.mimetype);
    const doc = {
      _id: genId(),
      filename: uploaded.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: uploaded.size,
      url: uploaded.url,
      entityType: req.body.entityType || 'ticket',
      entityId: req.body.entityId || null,
      uploadedBy: req.user._id,
      isDeleted: false,
      createdAt: new Date().toISOString(),
    };
    await persistCollections(req.ctx.snap, { attachments: [...(req.ctx.snap?.collections?.attachments || []), doc] });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
});

fallbackRouter.get('/deployments', (req, res) => res.json({ success: true, data: req.ctx.deployments }));
fallbackRouter.get('/time-logs', (req, res) => res.json({ success: true, data: req.ctx.timeLogs }));
fallbackRouter.get('/activity-logs', (req, res) => res.json({ success: true, data: req.ctx.activityLogs }));
fallbackRouter.get('/knowledge-base', (req, res) => res.json({ success: true, data: req.ctx.knowledgeBase }));
fallbackRouter.get('/saved-views', (req, res) => res.json({ success: true, data: req.ctx.savedViews }));
fallbackRouter.get('/notifications', (req, res) => {
  const mine = req.ctx.notifications.filter((n) => String(n.recipient) === String(req.user._id));
  res.json({ success: true, data: { items: mine, unreadCount: mine.filter((n) => !n.isRead).length } });
});

fallbackRouter.get('/reports/dashboard', (req, res) => {
  const now = new Date();
  const t = req.ctx.tickets;
  const tk = req.ctx.tasks;
  const statusMap = new Map();
  const priorityMap = new Map();
  for (const item of t) {
    statusMap.set(item.status, (statusMap.get(item.status) || 0) + 1);
    priorityMap.set(item.priority, (priorityMap.get(item.priority) || 0) + 1);
  }
  res.json({
    success: true,
    data: {
      roleScope: req.user.role,
      kpis: {
        totalClients: req.ctx.clients.length,
        totalOpenTickets: t.filter((x) => !['Resolved', 'Closed'].includes(x.status)).length,
        ticketsInProgress: t.filter((x) => x.status === 'In Progress').length,
        ticketsAwaitingResponse: t.filter((x) => x.status === 'Awaiting Client Response').length,
        resolvedTickets: t.filter((x) => ['Resolved', 'Closed'].includes(x.status)).length,
        overdueTickets: t.filter((x) => x.dueDate && new Date(x.dueDate) < now && !['Resolved', 'Closed'].includes(x.status)).length,
        totalPendingTasks: tk.filter((x) => x.status !== 'Completed').length,
        completedTasks: tk.filter((x) => x.status === 'Completed').length,
        activeProjects: req.ctx.projects.length,
        activeTeamMembers: req.ctx.users.filter((u) => !u.isDeleted).length,
        pendingDeployments: req.ctx.deployments.filter((d) => d.approvalStatus === 'Pending').length,
      },
      charts: {
        ticketsByStatus: Array.from(statusMap, ([name, value]) => ({ name, value })),
        ticketsByPriority: Array.from(priorityMap, ([name, value]) => ({ name, value })),
        ticketsByClient: [],
        tasksByEmployee: [],
        monthlyTrend: [],
      },
      recentActivity: req.ctx.activityLogs.slice(0, 10),
    },
  });
});

fallbackRouter.get('/settings', (req, res) => res.json({ success: true, data: req.ctx.settings }));
fallbackRouter.get('/settings/backup-status', (req, res) => res.json({ success: true, data: getSupabaseBackupStatus() }));
fallbackRouter.post('/settings/backup-sync', async (req, res, next) => {
  try {
    const result = await triggerDualBackupSync();
    res.json({ success: true, data: result, message: result.message });
  } catch (err) {
    next(err);
  }
});

fallbackRouter.get('/ai/status', async (req, res) => {
  const ollama = await checkOllamaStatus();
  const pendingApprovals = req.ctx.ticketDrafts.filter((d) => d.approvalStatus === 'Pending TL Approval').length;
  res.json({ success: true, data: { ...ollama, pendingApprovals } });
});
fallbackRouter.get('/ai/drafts', (req, res) => {
  res.json({ success: true, data: { drafts: req.ctx.ticketDrafts, counts: {} } });
});
fallbackRouter.get('/ai/action-requests', (req, res) => {
  const list = req.ctx.aiActionRequests;
  res.json({
    success: true,
    data: {
      requests: list,
      counts: {
        'Pending TL Approval': list.filter((r) => r.status === 'Pending TL Approval').length,
        Approved: list.filter((r) => r.status === 'Approved').length,
        Rejected: list.filter((r) => r.status === 'Rejected').length,
      },
    },
  });
});

export default function supabaseFallbackMiddleware(req, res, next) {
  if (isMongoConnected()) return next();
  const supa = getSupabaseBackupStatus();
  if (!supa.supabaseConfigured) return next();
  return fallbackRouter(req, res, next);
}
