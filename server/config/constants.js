export const ROLES = {
  ADMIN: 'admin',
  TEAM_LEAD: 'team_lead',
  DEVELOPER: 'developer',
  CLIENT: 'client', // Reserved for future client portal
};

export const ROLE_LABELS = {
  admin: 'Administrator',
  team_lead: 'Team Lead / Manager',
  developer: 'Developer / Employee',
  client: 'Client',
};

export const TICKET_CATEGORIES = [
  'Bug / Error',
  'Development Request',
  'Enhancement',
  'Customization',
  'Integration Issue',
  'Data Issue',
  'Configuration Issue',
  'Support Request',
  'Maintenance',
];

export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
export const SEVERITIES = ['Critical', 'Major', 'Minor', 'Trivial'];

export const TICKET_STATUSES = [
  'New',
  'Assigned',
  'In Progress',
  'On Hold',
  'Awaiting Client Response',
  'Testing',
  'Resolved',
  'Closed',
  'Reopened',
];

export const TASK_STATUSES = [
  'Todo',
  'In Progress',
  'In Review',
  'Testing',
  'Blocked',
  'Completed',
];

export const PROJECT_STATUSES = [
  'Planning',
  'Active',
  'On Hold',
  'Completed',
  'Cancelled',
];

export const DEPLOYMENT_ENVIRONMENTS = ['Development', 'Pilot', 'Production'];

export const DEPLOYMENT_STAGES = [
  'Development Completed',
  'Pilot Deployment',
  'Pilot Testing',
  'Approval',
  'Production Deployment',
  'Completed',
];

export const DEPLOYMENT_APPROVAL_STATUSES = ['Pending', 'Approved', 'Rejected'];
export const DEPLOYMENT_TESTING_STATUSES = ['Pending', 'In Progress', 'Passed', 'Failed'];

export const SLA_HOURS_BY_PRIORITY = {
  Critical: 4,
  High: 24,
  Medium: 72,
  Low: 120,
};
