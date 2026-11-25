import Client from '../../models/Client.js';
import Ticket from '../../models/Ticket.js';
import Task from '../../models/Task.js';
import Project from '../../models/Project.js';
import User from '../../models/User.js';
import TicketDraft from '../../models/TicketDraft.js';
import AIActionRequest from '../../models/AIActionRequest.js';
import { ROLES } from '../../config/constants.js';
import { matchClientDeterministic, matchEmployeeDeterministic } from './aiContextService.js';

const DEST_TO_ROUTE = {
  overview: '/',
  dashboard: '/',
  'my-tasks': '/my-tasks',
  'my-work': '/my-tasks',
  inbox: '/notifications',
  notifications: '/notifications',
  tickets: '/tickets',
  'task-board': '/task-board',
  tasks: '/task-board',
  calendar: '/calendar',
  clients: '/clients',
  projects: '/projects',
  team: '/team',
  workload: '/workload',
  deployments: '/deployments',
  reports: '/reports',
  activity: '/activity-logs',
  'knowledge-base': '/knowledge-base',
  approvals: '/approvals',
  intake: '/smart-intake',
  settings: '/settings',
  profile: '/profile',
};

/**
 * Validates permissions, executes read-only MongoDB queries, and builds a safe frontend action payload.
 */
export async function executeIntent({ parsed, message, user, conversation }) {
  const { intent, entities = {} } = parsed;

  if (intent === 'CREATE_USER_REQUEST') {
    const name = (entities.name || 'New Team Member').trim();
    const email = (entities.email || `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@sagex3desk.com`).trim();
    const role = entities.role || ROLES.DEVELOPER;
    const reqDoc = await AIActionRequest.create({
      actionType: 'CREATE_USER',
      title: `Add User: ${name}`,
      summary: `Email: ${email} · Role: ${role}`,
      payload: { name, email, role, designation: entities.designation || 'Sage X3 Consultant' },
      requestedBy: user._id,
      status: 'Pending TL Approval',
    });
    return {
      response: `Submitted new user request "${reqDoc.title}" (${email}) for Team Lead approval.`,
      action: { type: 'NAVIGATE', route: '/approvals' },
      statusType: 'success',
    };
  }

  if (intent === 'CREATE_CLIENT_REQUEST') {
    const name = (entities.name || 'New Client').trim();
    const email = (entities.email || '').trim();
    const reqDoc = await AIActionRequest.create({
      actionType: 'CREATE_CLIENT',
      title: `Add Client: ${name}`,
      summary: `${email ? `Email: ${email} · ` : ''}Industry: ${entities.industry || 'Manufacturing'}`,
      payload: {
        name,
        email,
        industry: entities.industry || 'Manufacturing',
        sageX3Version: entities.sageX3Version || 'V12',
      },
      requestedBy: user._id,
      status: 'Pending TL Approval',
    });
    return {
      response: `Submitted new client request "${reqDoc.title}" for Team Lead approval.`,
      action: { type: 'NAVIGATE', route: '/approvals' },
      statusType: 'success',
    };
  }

  const clients = await Client.find({ isDeleted: false })
    .select('clientId companyName aliases clientFolderCode pilotFolderCode productionFolderCode sageX3Version')
    .lean();
  const users = await User.find({ isDeleted: false, role: { $ne: ROLES.CLIENT } })
    .select('employeeId fullName designation role')
    .lean();

  const resolveClient = (hint) => {
    const match = matchClientDeterministic(hint || message, clients);
    return match;
  };

  const resolveEmployee = (hint) => matchEmployeeDeterministic(hint || message, users);

  const contextUpdates = { lastIntent: intent };

  if (intent === 'NAVIGATE') {
    const destKey = String(entities.destination || '').toLowerCase();
    if (destKey === 'reports' && ![ROLES.ADMIN, ROLES.TEAM_LEAD].includes(user.role)) {
      return {
        statusType: 'warning',
        response: 'Reports & Analytics are restricted to Team Leads and Administrators.',
        action: null,
        contextUpdates,
      };
    }
    if (destKey === 'settings' && user.role !== ROLES.ADMIN) {
      return {
        statusType: 'warning',
        response: 'Application Settings are restricted to Administrators.',
        action: null,
        contextUpdates,
      };
    }
    const route = DEST_TO_ROUTE[destKey] || '/';
    return {
      statusType: 'navigation',
      response: parsed.response || `Navigated to ${destKey || 'Overview'}.`,
      action: { type: 'NAVIGATE', route },
      contextUpdates,
    };
  }

  if (intent === 'SHOW_MY_WORK') {
    return {
      statusType: 'navigation',
      response: 'Opening your assigned tasks in My Work.',
      action: { type: 'NAVIGATE', route: '/my-tasks' },
      contextUpdates,
    };
  }

  if (intent === 'SHOW_APPROVAL_QUEUE') {
    const pending = await TicketDraft.countDocuments({ isDeleted: false, approvalStatus: 'Pending TL Approval' });
    return {
      statusType: 'approval',
      response: `Found ${pending} submission(s) waiting in the TL Approval Inbox.`,
      action: { type: 'NAVIGATE', route: '/approvals?status=Pending%20TL%20Approval' },
      contextUpdates,
    };
  }

  if (intent === 'OPEN_CLIENT') {
    const cMatch = resolveClient(entities.client);
    if (cMatch.ambiguous) {
      return {
        statusType: 'warning',
        response: 'Multiple clients match your query. Which client would you like to open?',
        clarificationOptions: cMatch.candidates.map((c) => ({
          label: `${c.companyName} (${c.folderCode})`,
          command: `Open client profile for ${c.companyName}`,
        })),
        action: null,
        contextUpdates,
      };
    }
    if (!cMatch.bestMatch) {
      return {
        statusType: 'warning',
        response: 'I could not match that client against our Sage X3 client directory.',
        action: { type: 'NAVIGATE', route: '/clients' },
        contextUpdates,
      };
    }
    contextUpdates.lastClientId = cMatch.bestMatch._id;
    contextUpdates.lastClientName = cMatch.bestMatch.companyName;
    return {
      statusType: 'navigation',
      response: `Opened client profile for ${cMatch.bestMatch.companyName} (${cMatch.bestMatch.clientFolderCode}).`,
      action: { type: 'NAVIGATE', route: `/clients/${cMatch.bestMatch._id}` },
      contextUpdates,
    };
  }

  if (intent === 'OPEN_TICKET') {
    const ticketRef = entities.ticketId || '';
    const t = ticketRef
      ? await Ticket.findOne({ ticketId: ticketRef.toUpperCase(), isDeleted: false }).lean()
      : await Ticket.findOne({ title: { $regex: entities.title || message, $options: 'i' }, isDeleted: false }).lean();
    if (!t) {
      return {
        statusType: 'warning',
        response: `Could not find ticket ${ticketRef || 'matching that description'}.`,
        action: null,
        contextUpdates,
      };
    }
    contextUpdates.lastTicketId = t._id;
    return {
      statusType: 'navigation',
      response: `Opening ${t.ticketId}: ${t.title}.`,
      action: { type: 'OPEN_TICKET_DRAWER', ticketId: String(t._id) },
      contextUpdates,
    };
  }

  if (intent === 'OPEN_TASK') {
    const taskRef = entities.taskId || '';
    const t = taskRef
      ? await Task.findOne({ taskId: taskRef.toUpperCase(), isDeleted: false }).lean()
      : await Task.findOne({ title: { $regex: entities.title || message, $options: 'i' }, isDeleted: false }).lean();
    if (!t) {
      return {
        statusType: 'warning',
        response: `Could not find task ${taskRef || 'matching that description'}.`,
        action: null,
        contextUpdates,
      };
    }
    return {
      statusType: 'navigation',
      response: `Opening ${t.taskId}: ${t.title}.`,
      action: { type: 'OPEN_TASK_DRAWER', taskId: String(t._id) },
      contextUpdates,
    };
  }

  if (intent === 'FILTER_TICKETS' || intent === 'SHOW_OVERDUE') {
    if (intent === 'SHOW_OVERDUE' && entities.target === 'tasks') {
      return {
        statusType: 'search',
        response: 'Filtering overdue tasks.',
        action: { type: 'NAVIGATE', route: '/my-tasks?view=overdue' },
        contextUpdates,
      };
    }

    const filter = { isDeleted: false };
    const uiFilters = {};

    if (user.role === ROLES.DEVELOPER) {
      filter.$or = [{ assignedDevelopers: user._id }, { createdBy: user._id }];
    }

    if (entities.client) {
      const cMatch = resolveClient(entities.client);
      if (cMatch.ambiguous) {
        return {
          statusType: 'warning',
          response: 'Multiple clients matched. Please choose one:',
          clarificationOptions: cMatch.candidates.map((c) => ({
            label: `${c.companyName} (${c.folderCode})`,
            command: `Show tickets for ${c.companyName}`,
          })),
          action: null,
          contextUpdates,
        };
      }
      if (cMatch.bestMatch) {
        filter.client = cMatch.bestMatch._id;
        uiFilters.client = String(cMatch.bestMatch._id);
        contextUpdates.lastClientId = cMatch.bestMatch._id;
        contextUpdates.lastClientName = cMatch.bestMatch.companyName;
      }
    }

    if (entities.developer) {
      const emp = resolveEmployee(entities.developer);
      if (emp) {
        filter.assignedDevelopers = emp._id;
        uiFilters.developer = String(emp._id);
        contextUpdates.lastEmployeeId = emp._id;
        contextUpdates.lastEmployeeName = emp.fullName;
      }
    }

    if (entities.priority) {
      filter.priority = entities.priority;
      uiFilters.priority = entities.priority;
    }

    if (entities.status) {
      const stList = Array.isArray(entities.status) ? entities.status : [entities.status];
      filter.status = { $in: stList };
      if (stList.length === 1) uiFilters.status = stList[0];
    }

    if (entities.overdueOnly) {
      filter.dueDate = { $lt: new Date() };
      filter.status = { $nin: ['Resolved', 'Closed'] };
      uiFilters.overdueOnly = 'true';
    }

    if (entities.search) {
      uiFilters.search = entities.search;
      filter.title = { $regex: entities.search, $options: 'i' };
    }

    const matches = await Ticket.find(filter)
      .populate('client', 'companyName')
      .populate('assignedDevelopers', 'fullName')
      .select('ticketId title status priority assignedDevelopers')
      .sort({ sortOrder: 1, createdAt: -1 })
      .limit(50)
      .lean();

    contextUpdates.lastFilters = uiFilters;
    contextUpdates.lastResultIds = matches.map((m) => String(m._id));

    const qs = new URLSearchParams(uiFilters).toString();
    const label = contextUpdates.lastClientName ? ` for ${contextUpdates.lastClientName}` : '';
    return {
      statusType: 'search',
      response: `Found ${matches.length} matching ticket(s)${label}. Applied filter on All Tickets.`,
      action: { type: 'FILTER_TICKETS', route: `/tickets${qs ? `?${qs}` : ''}`, filters: uiFilters },
      contextUpdates,
    };
  }

  if (intent === 'FILTER_TASKS') {
    const filter = { isDeleted: false, parentTask: null };
    const uiFilters = { scope: 'all' };

    if (entities.employee) {
      const emp = resolveEmployee(entities.employee);
      if (emp) {
        filter.assignedEmployees = emp._id;
        uiFilters.employee = String(emp._id);
        contextUpdates.lastEmployeeId = emp._id;
        contextUpdates.lastEmployeeName = emp.fullName;
      }
    }

    if (entities.overdueOnly) {
      filter.dueDate = { $lt: new Date() };
      filter.status = { $ne: 'Completed' };
      uiFilters.view = 'overdue';
    }

    if (entities.priority) {
      filter.priority = entities.priority;
      uiFilters.priority = entities.priority;
    }

    const matches = await Task.find(filter).select('taskId title status').limit(50).lean();
    const qs = new URLSearchParams(uiFilters).toString();
    return {
      statusType: 'search',
      response: `Found ${matches.length} matching task(s)${
        contextUpdates.lastEmployeeName ? ` for ${contextUpdates.lastEmployeeName}` : ''
      }.`,
      action: { type: 'FILTER_TASKS', route: `/task-board?${qs}`, filters: uiFilters },
      contextUpdates,
    };
  }

  if (intent === 'FILTER_CLIENTS') {
    const q = entities.search || '';
    const count = await Client.countDocuments({
      isDeleted: false,
      ...(q ? { companyName: { $regex: q, $options: 'i' } } : {}),
    });
    return {
      statusType: 'search',
      response: `Found ${count} client(s).`,
      action: { type: 'NAVIGATE', route: `/clients${q ? `?search=${encodeURIComponent(q)}` : ''}` },
      contextUpdates,
    };
  }

  if (intent === 'FILTER_PROJECTS') {
    const count = await Project.countDocuments({ isDeleted: false });
    return {
      statusType: 'search',
      response: `Opening Projects (${count} active/recorded).`,
      action: { type: 'NAVIGATE', route: '/projects' },
      contextUpdates,
    };
  }

  if (intent === 'SEARCH_RECORDS') {
    const q = entities.query || message;
    return {
      statusType: 'search',
      response: `Searching tickets for "${q}".`,
      action: { type: 'NAVIGATE', route: `/tickets?search=${encodeURIComponent(q)}` },
      contextUpdates,
    };
  }

  if (intent === 'SUMMARIZE_CLIENT') {
    const cMatch = resolveClient(entities.client);
    if (!cMatch.bestMatch) {
      return {
        statusType: 'warning',
        response: 'Which client would you like me to summarize?',
        clarificationOptions: clients.slice(0, 4).map((c) => ({
          label: c.companyName,
          command: `Summarize ${c.companyName}'s recent issues`,
        })),
        action: null,
        contextUpdates,
      };
    }
    const c = cMatch.bestMatch;
    const clientTickets = await Ticket.find({ client: c._id, isDeleted: false })
      .populate('assignedDevelopers', 'fullName')
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();
    const openCount = clientTickets.filter((t) => !['Resolved', 'Closed'].includes(t.status)).length;
    const criticalCount = clientTickets.filter((t) => t.priority === 'Critical').length;
    const summaryLines = clientTickets
      .slice(0, 4)
      .map((t) => `• ${t.ticketId} (${t.status}, ${t.priority}): ${t.title}`)
      .join('\n');

    contextUpdates.lastClientId = c._id;
    contextUpdates.lastClientName = c.companyName;

    return {
      statusType: 'response',
      response: `${c.companyName} (${c.clientFolderCode}, ${c.sageX3Version}) has ${openCount} open ticket(s) (${criticalCount} Critical):\n${
        summaryLines || 'No recent tickets found.'
      }`,
      action: null,
      contextUpdates,
    };
  }

  // Handle "Who is handling the first one?" from previous context
  if (entities.inspectFirstTicket && conversation?.contextState?.lastResultIds?.length > 0) {
    const firstId = conversation.contextState.lastResultIds[0];
    const t = await Ticket.findById(firstId).populate('assignedDevelopers', 'fullName').lean();
    if (t) {
      const names = (t.assignedDevelopers || []).map((d) => d.fullName).join(', ') || 'nobody yet (Unassigned)';
      return {
        statusType: 'response',
        response: `${t.ticketId} ("${t.title}") is currently assigned to ${names}.`,
        action: { type: 'OPEN_TICKET_DRAWER', ticketId: String(t._id) },
        contextUpdates,
      };
    }
  }

  return {
    statusType: parsed.needsClarification ? 'warning' : 'response',
    response: parsed.needsClarification ? parsed.clarificationQuestion || parsed.response : parsed.response,
    action: null,
    contextUpdates,
  };
}
