import ScreenRegistry from '../../db/models/ScreenRegistry.js';
import PermissionGroup from '../../db/models/PermissionGroup.js';
import UserPermissions from '../../db/models/UserPermissions.js';
import { ROLES } from '../config/constants.js';
import { isMongoConnected } from '../../db/connection.js';

export const DEFAULT_SCREENS = [
  // WORKSPACE
  {
    screenKey: 'dashboard',
    label: 'Overview',
    route: '/',
    navigationGroup: 'WORKSPACE',
    description: 'Role-adapted operational overview and KPIs',
    sortOrder: 10,
    defaultRoleAccess: { admin: true, team_lead: true, developer: true },
    availableActions: ['view'],
  },
  {
    screenKey: 'my_tasks',
    label: 'My Work',
    route: '/my-tasks',
    navigationGroup: 'WORKSPACE',
    description: 'Personal assigned tasks and time tracking',
    sortOrder: 20,
    defaultRoleAccess: { admin: true, team_lead: true, developer: true },
    availableActions: ['view', 'create', 'edit', 'change_status', 'track_time', 'add_dev_note'],
  },
  {
    screenKey: 'timesheet',
    label: 'Timesheet',
    route: '/timesheet',
    navigationGroup: 'WORKSPACE',
    description: 'Individual daily/monthly timesheet entry across clients and projects',
    sortOrder: 25,
    defaultRoleAccess: { admin: true, team_lead: true, developer: true },
    availableActions: ['view', 'create', 'edit', 'delete', 'export'],
  },
  {
    screenKey: 'help_center',
    label: 'Help Center',
    route: '/help-center',
    navigationGroup: 'SYSTEM',
    description: 'Report software bugs, UI issues, and support tickets directly to Administrators',
    sortOrder: 185,
    defaultRoleAccess: { admin: true, team_lead: true, developer: true },
    availableActions: ['view', 'create', 'edit'],
  },
  {
    screenKey: 'inbox',
    label: 'Inbox',
    route: '/notifications',
    navigationGroup: 'WORKSPACE',
    description: 'Real-time notifications and mentions',
    sortOrder: 30,
    defaultRoleAccess: { admin: true, team_lead: true, developer: true },
    availableActions: ['view'],
  },
  {
    screenKey: 'smart_intake',
    label: 'Smart Intake (AI)',
    route: '/smart-intake',
    navigationGroup: 'WORKSPACE',
    description: 'OCR screenshot & email ticket intake',
    sortOrder: 40,
    defaultRoleAccess: { admin: true, team_lead: true, developer: true },
    availableActions: ['view', 'create'],
  },
  {
    screenKey: 'calendar',
    label: 'Calendar',
    route: '/calendar',
    navigationGroup: 'WORKSPACE',
    description: 'Due dates, deadlines, and sprint schedule',
    sortOrder: 50,
    defaultRoleAccess: { admin: true, team_lead: true, developer: true },
    availableActions: ['view'],
  },

  // TICKET MANAGEMENT
  {
    screenKey: 'tickets',
    label: 'All Tickets',
    route: '/tickets',
    navigationGroup: 'TICKET MANAGEMENT',
    description: 'Approved operational ticket queue & Kanban',
    sortOrder: 60,
    defaultRoleAccess: { admin: true, team_lead: true, developer: true },
    availableActions: [
      'view',
      'create',
      'edit',
      'delete',
      'assign',
      'reassign',
      'change_status',
      'approve',
      'reject',
      'request_changes',
      'export',
      'view_history',
    ],
  },
  {
    screenKey: 'approval_inbox',
    label: 'TL Approvals',
    route: '/approvals',
    navigationGroup: 'TICKET MANAGEMENT',
    description: 'Team Lead approval queue for pending tickets and AI actions',
    sortOrder: 70,
    defaultRoleAccess: { admin: true, team_lead: true, developer: false },
    availableActions: ['view', 'approve', 'reject', 'request_changes', 'edit'],
  },
  {
    screenKey: 'task_board',
    label: 'Task Board',
    route: '/task-board',
    navigationGroup: 'TICKET MANAGEMENT',
    description: 'Execution tasks & workflow board',
    sortOrder: 80,
    defaultRoleAccess: { admin: true, team_lead: true, developer: true },
    availableActions: ['view', 'create', 'edit', 'delete', 'assign', 'reassign', 'change_status', 'track_time', 'add_dev_note'],
  },

  // MANAGEMENT
  {
    screenKey: 'clients',
    label: 'Clients',
    route: '/clients',
    navigationGroup: 'MANAGEMENT',
    description: 'Sage X3 client profiles, folders & documents',
    sortOrder: 90,
    defaultRoleAccess: { admin: true, team_lead: true, developer: true },
    availableActions: ['view', 'create', 'edit', 'delete', 'view_documents', 'upload_documents', 'download_documents'],
  },
  {
    screenKey: 'projects',
    label: 'Projects',
    route: '/projects',
    navigationGroup: 'MANAGEMENT',
    description: 'Sage X3 implementation & enhancement projects',
    sortOrder: 100,
    defaultRoleAccess: { admin: true, team_lead: true, developer: true },
    availableActions: ['view', 'create', 'edit', 'delete', 'assign'],
  },
  {
    screenKey: 'team',
    label: 'Team Members',
    route: '/team',
    navigationGroup: 'MANAGEMENT',
    description: 'Employee directory and roles',
    sortOrder: 110,
    defaultRoleAccess: { admin: true, team_lead: true, developer: false },
    availableActions: ['view', 'create', 'edit', 'deactivate', 'manage_permissions'],
  },
  {
    screenKey: 'workload',
    label: 'Workload',
    route: '/workload',
    navigationGroup: 'MANAGEMENT',
    description: 'Team capacity and allocation',
    sortOrder: 120,
    defaultRoleAccess: { admin: true, team_lead: true, developer: false },
    availableActions: ['view'],
  },
  {
    screenKey: 'deployments',
    label: 'Deployments',
    route: '/deployments',
    navigationGroup: 'MANAGEMENT',
    description: 'Pilot & Production release pipeline',
    sortOrder: 130,
    defaultRoleAccess: { admin: true, team_lead: true, developer: true },
    availableActions: ['view', 'create', 'edit', 'approve', 'deploy_production'],
  },

  // INSIGHTS
  {
    screenKey: 'reports',
    label: 'Reports',
    route: '/reports',
    navigationGroup: 'INSIGHTS',
    description: 'SLA, workload, and resolution analytics',
    sortOrder: 140,
    defaultRoleAccess: { admin: true, team_lead: true, developer: false },
    availableActions: ['view', 'export'],
  },
  {
    screenKey: 'activity_logs',
    label: 'Activity',
    route: '/activity-logs',
    navigationGroup: 'INSIGHTS',
    description: 'Operational activity timeline',
    sortOrder: 150,
    defaultRoleAccess: { admin: true, team_lead: true, developer: true },
    availableActions: ['view'],
  },
  {
    screenKey: 'knowledge_base',
    label: 'Knowledge Base',
    route: '/knowledge-base',
    navigationGroup: 'INSIGHTS',
    description: 'Sage X3 troubleshooting runbooks',
    sortOrder: 160,
    defaultRoleAccess: { admin: true, team_lead: true, developer: true },
    availableActions: ['view', 'create', 'edit', 'delete'],
  },

  // ADMINISTRATION
  {
    screenKey: 'admin_overview',
    label: 'System Overview',
    route: '/admin/overview',
    navigationGroup: 'ADMINISTRATION',
    description: 'Global Administrator system health & audit overview',
    sortOrder: 170,
    defaultRoleAccess: { admin: true, team_lead: false, developer: false },
    availableActions: ['view'],
  },
  {
    screenKey: 'admin_user_activity',
    label: 'User Activity',
    route: '/admin/user-activity',
    navigationGroup: 'ADMINISTRATION',
    description: 'Unified chronological employee operational timeline',
    sortOrder: 180,
    defaultRoleAccess: { admin: true, team_lead: false, developer: false },
    availableActions: ['view', 'export'],
  },
  {
    screenKey: 'admin_dev_logs',
    label: 'Development Logs',
    route: '/admin/dev-logs',
    navigationGroup: 'ADMINISTRATION',
    description: 'Chronological employee development & X3 script updates',
    sortOrder: 190,
    defaultRoleAccess: { admin: true, team_lead: false, developer: false },
    availableActions: ['view', 'create'],
  },
  {
    screenKey: 'admin_system_logs',
    label: 'System Logs',
    route: '/admin/system-logs',
    navigationGroup: 'ADMINISTRATION',
    description: 'Backend errors, AI/Ollama failures, and auth failures',
    sortOrder: 200,
    defaultRoleAccess: { admin: true, team_lead: false, developer: false },
    availableActions: ['view'],
  },
  {
    screenKey: 'admin_api_monitoring',
    label: 'API Monitoring',
    route: '/admin/api-monitoring',
    navigationGroup: 'ADMINISTRATION',
    description: 'API endpoint errors, latencies, and response metrics',
    sortOrder: 210,
    defaultRoleAccess: { admin: true, team_lead: false, developer: false },
    availableActions: ['view'],
  },
  {
    screenKey: 'admin_deployment_history',
    label: 'Deployment History',
    route: '/admin/deployments',
    navigationGroup: 'ADMINISTRATION',
    description: 'Cross-client chronological release & approval audit',
    sortOrder: 220,
    defaultRoleAccess: { admin: true, team_lead: false, developer: false },
    availableActions: ['view'],
  },
  {
    screenKey: 'admin_time_tracking',
    label: 'Time Tracking',
    route: '/admin/time-tracking',
    navigationGroup: 'ADMINISTRATION',
    description: 'Team-wide logged development hours',
    sortOrder: 230,
    defaultRoleAccess: { admin: true, team_lead: false, developer: false },
    availableActions: ['view', 'export'],
  },
  {
    screenKey: 'admin_ai_activity',
    label: 'AI Activity',
    route: '/admin/ai-activity',
    navigationGroup: 'ADMINISTRATION',
    description: 'X3 AI intents, drafts, OCR status & errors',
    sortOrder: 240,
    defaultRoleAccess: { admin: true, team_lead: false, developer: false },
    availableActions: ['view'],
  },
  {
    screenKey: 'admin_audit_logs',
    label: 'Security & Audit Logs',
    route: '/admin/audit-logs',
    navigationGroup: 'ADMINISTRATION',
    description: 'Immutable append-only security and governance audit trail',
    sortOrder: 250,
    defaultRoleAccess: { admin: true, team_lead: false, developer: false },
    availableActions: ['view'],
  },
  {
    screenKey: 'admin_governance',
    label: 'Data & Duplicate Control',
    route: '/admin/governance',
    navigationGroup: 'ADMINISTRATION',
    description: 'Manage new users, newly created tickets, duplicate tickets, and deletion audit logs',
    sortOrder: 260,
    defaultRoleAccess: { admin: true, team_lead: false, developer: false },
    availableActions: ['view', 'delete'],
  },

  // SYSTEM
  {
    screenKey: 'email_inbox',
    label: 'Email Inbox',
    route: '/email-inbox',
    navigationGroup: 'WORKSPACE',
    description: 'Incoming Outlook & Gmail email queue, manual review, and ticket linking',
    sortOrder: 45,
    defaultRoleAccess: { admin: true, team_lead: true, developer: false },
    availableActions: ['view', 'create', 'edit'],
  },
  {
    screenKey: 'settings',
    label: 'Settings & Access',
    route: '/settings',
    navigationGroup: 'SYSTEM',
    description: 'Workspace configuration, screen access & permission groups',
    sortOrder: 260,
    defaultRoleAccess: { admin: true, team_lead: false, developer: false },
    availableActions: ['view', 'edit', 'manage_permissions', 'manage_groups'],
  },
];

const DEFAULT_ROLE_ACTIONS = {
  team_lead: {
    dashboard: ['view'],
    my_tasks: ['view', 'create', 'edit', 'change_status', 'track_time', 'add_dev_note'],
    inbox: ['view'],
    smart_intake: ['view', 'create'],
    calendar: ['view'],
    tickets: ['view', 'create', 'edit', 'assign', 'reassign', 'change_status', 'approve', 'reject', 'request_changes', 'export', 'view_history'],
    approval_inbox: ['view', 'approve', 'reject', 'request_changes', 'edit'],
    task_board: ['view', 'create', 'edit', 'assign', 'reassign', 'change_status', 'track_time', 'add_dev_note'],
    clients: ['view', 'create', 'edit', 'view_documents', 'upload_documents', 'download_documents'],
    projects: ['view', 'create', 'edit', 'assign'],
    team: ['view'],
    workload: ['view'],
    deployments: ['view', 'create', 'edit', 'approve'],
    reports: ['view', 'export'],
    activity_logs: ['view'],
    knowledge_base: ['view', 'create', 'edit'],
  },
  developer: {
    dashboard: ['view'],
    my_tasks: ['view', 'create', 'edit', 'change_status', 'track_time', 'add_dev_note'],
    inbox: ['view'],
    smart_intake: ['view', 'create'],
    calendar: ['view'],
    tickets: ['view', 'create', 'change_status', 'view_history'],
    task_board: ['view', 'create', 'edit', 'change_status', 'track_time', 'add_dev_note'],
    clients: ['view', 'view_documents', 'download_documents'],
    projects: ['view'],
    deployments: ['view', 'create'],
    activity_logs: ['view'],
    knowledge_base: ['view', 'create'],
  },
};

let registryEnsured = false;

export async function ensureScreenRegistrySeeded() {
  if (!isMongoConnected()) return DEFAULT_SCREENS;
  if (!registryEnsured) {
    for (const scr of DEFAULT_SCREENS) {
      await ScreenRegistry.updateOne(
        { screenKey: scr.screenKey },
        { $setOnInsert: scr },
        { upsert: true }
      );
    }
    registryEnsured = true;
  }
  return ScreenRegistry.find({}).sort({ sortOrder: 1 }).lean();
}

export async function getEffectivePermissions(user) {
  if (!user) return { isAdmin: false, screens: [], actions: {}, groups: [] };

  const screensList = await ensureScreenRegistrySeeded();
  const activeScreens = screensList.filter((s) => s.active !== false);

  // Rule 2.1: Administrator always retains complete access regardless of custom toggles
  if (user.role === ROLES.ADMIN) {
    const actions = {};
    for (const s of activeScreens) {
      actions[s.screenKey] = s.availableActions?.length ? [...s.availableActions] : ['view'];
    }
    return {
      isAdmin: true,
      screens: activeScreens.map((s) => s.screenKey),
      actions,
      groups: [],
    };
  }

  const roleKey = user.role === ROLES.TEAM_LEAD ? 'team_lead' : 'developer';
  const screenSet = new Set();
  const actionMap = new Map(); // screenKey -> Set(actions)

  const addAction = (screenKey, act) => {
    if (!actionMap.has(screenKey)) actionMap.set(screenKey, new Set());
    actionMap.get(screenKey).add(act);
  };

  // 1. Role defaults from ScreenRegistry + DEFAULT_ROLE_ACTIONS
  for (const s of activeScreens) {
    if (s.defaultRoleAccess?.[roleKey]) {
      screenSet.add(s.screenKey);
      const roleActs = DEFAULT_ROLE_ACTIONS[roleKey]?.[s.screenKey] || ['view'];
      roleActs.forEach((a) => addAction(s.screenKey, a));
    }
  }

  // Legacy User.permissions flags bridge
  if (user.permissions?.canAssignTickets) {
    addAction('tickets', 'assign');
    addAction('tickets', 'reassign');
    addAction('task_board', 'assign');
  }
  if (user.permissions?.canApproveDeployments) {
    addAction('deployments', 'approve');
  }
  if (user.permissions?.canManageClients) {
    screenSet.add('clients');
    ['view', 'create', 'edit', 'upload_documents'].forEach((a) => addAction('clients', a));
  }
  if (user.permissions?.canViewReports) {
    screenSet.add('reports');
    addAction('reports', 'view');
  }

  let groupIds = [];
  if (isMongoConnected() && user._id) {
    const up = await UserPermissions.findOne({ userId: user._id })
      .populate('permissionGroups')
      .lean();

    if (up) {
      groupIds = (up.permissionGroups || []).map((g) => ({ _id: g._id, name: g.name }));

      // 2. Permission groups
      for (const grp of up.permissionGroups || []) {
        for (const sk of grp.screenPermissions || []) {
          screenSet.add(sk);
          addAction(sk, 'view');
        }
        if (grp.actionPermissions && typeof grp.actionPermissions === 'object') {
          for (const [sk, acts] of Object.entries(grp.actionPermissions)) {
            if (Array.isArray(acts)) {
              acts.forEach((a) => addAction(sk, a));
            }
          }
        }
      }

      // 3. Explicit user screen & action grants
      for (const sk of up.screenPermissions || []) {
        screenSet.add(sk);
        addAction(sk, 'view');
      }
      if (up.actionOverrides?.grant) {
        for (const [sk, acts] of Object.entries(up.actionOverrides.grant)) {
          if (Array.isArray(acts)) acts.forEach((a) => addAction(sk, a));
        }
      }

      // 4. Explicit denials ALWAYS win (never bypassed by role or group grants)
      for (const sk of up.revokedScreens || []) {
        screenSet.delete(sk);
        actionMap.delete(sk);
      }
      if (up.actionOverrides?.deny) {
        for (const [sk, acts] of Object.entries(up.actionOverrides.deny)) {
          if (Array.isArray(acts) && actionMap.has(sk)) {
            for (const a of acts) actionMap.get(sk).delete(a);
          }
        }
      }
    }
  }

  // Keep only active registered screens
  const validScreenKeys = new Set(activeScreens.map((s) => s.screenKey));
  const finalScreens = Array.from(screenSet).filter((sk) => validScreenKeys.has(sk));
  const finalActions = {};
  for (const sk of finalScreens) {
    finalActions[sk] = Array.from(actionMap.get(sk) || ['view']);
  }

  return {
    isAdmin: false,
    screens: finalScreens,
    actions: finalActions,
    groups: groupIds,
  };
}

export function userHasScreen(effectivePermissions, screenKey) {
  if (!effectivePermissions) return false;
  if (effectivePermissions.isAdmin) return true;
  return effectivePermissions.screens?.includes(screenKey) || false;
}

export function userHasAction(effectivePermissions, screenKey, action) {
  if (!effectivePermissions) return false;
  if (effectivePermissions.isAdmin) return true;
  if (!userHasScreen(effectivePermissions, screenKey)) return false;
  return effectivePermissions.actions?.[screenKey]?.includes(action) || false;
}
