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

export const TICKET_STATUS_LABELS = {
  'Awaiting Client Response': 'Awaiting Client',
};

export const TASK_STATUSES = [
  'Todo',
  'In Progress',
  'In Review',
  'Testing',
  'Blocked',
  'Completed',
];

export const TASK_STATUS_LABELS = {
  Todo: 'To Do',
};

export const PROJECT_STATUSES = ['Planning', 'Active', 'On Hold', 'Completed', 'Cancelled'];
export const DEPLOYMENT_ENVIRONMENTS = ['Development', 'Pilot', 'Production'];
export const DEPLOYMENT_STAGES = [
  'Development Completed',
  'Pilot Deployment',
  'Pilot Testing',
  'Approval',
  'Production Deployment',
  'Completed',
];

export const KB_CATEGORIES = [
  '4GL Scripting',
  'Import / Export',
  'Web Services & API',
  'Crystal Reports',
  'Database & Patching',
  'Finance & Banking',
  'Supply Chain & Stock',
  'Runbook',
];

export const ROLE_LABELS = {
  admin: 'Administrator',
  team_lead: 'Team Lead / Manager',
  developer: 'Developer / Employee',
  client: 'Client',
};

export const PRIORITY_BADGE = {
  Critical: 'bg-[#F16D64]/15 text-[#c93e35] border-[#F16D64]/30 dark:bg-[#F16D64]/20 dark:text-[#ff9c95] dark:border-[#F16D64]/30',
  High: 'bg-amber-500/15 text-amber-800 border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30',
  Medium: 'bg-[#638BEF]/15 text-[#2d58c4] border-[#638BEF]/30 dark:bg-[#638BEF]/20 dark:text-[#98b4ff] dark:border-[#638BEF]/30',
  Low: 'bg-[#E8E8E5]/70 text-[#555555] border-[#D8D8D3] dark:bg-white/10 dark:text-slate-300 dark:border-white/10',
};

export const STATUS_BADGE = {
  New: 'bg-[#638BEF]/15 text-[#2d58c4] border-[#638BEF]/30 dark:bg-[#638BEF]/20 dark:text-[#98b4ff]',
  Assigned: 'bg-[#A88CEB]/15 text-[#6b47c2] border-[#A88CEB]/30 dark:bg-[#A88CEB]/20 dark:text-[#c7b4f5]',
  'In Progress': 'bg-[#638BEF]/20 text-[#234cb5] border-[#638BEF]/40 dark:bg-[#638BEF]/25 dark:text-[#a8c0ff]',
  'On Hold': 'bg-[#E8E8E5] text-[#555555] border-[#D8D8D3] dark:bg-white/10 dark:text-slate-300',
  'Awaiting Client Response': 'bg-amber-500/15 text-amber-800 border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-300',
  Testing: 'bg-[#A88CEB]/20 text-[#6641bd] border-[#A88CEB]/40 dark:bg-[#A88CEB]/25 dark:text-[#d0bef8]',
  Resolved: 'bg-[#35B8A6]/15 text-[#1b7a6d] border-[#35B8A6]/35 dark:bg-[#35B8A6]/20 dark:text-[#6fe0d0]',
  Closed: 'bg-[#171717]/10 text-[#444444] border-[#171717]/15 dark:bg-white/10 dark:text-slate-400',
  Reopened: 'bg-[#F16D64]/15 text-[#c93e35] border-[#F16D64]/30 dark:bg-[#F16D64]/20 dark:text-[#ff9c95]',
  Todo: 'bg-[#E8E8E5]/70 text-[#444444] border-[#D8D8D3] dark:bg-white/10 dark:text-slate-300',
  'In Review': 'bg-[#A88CEB]/15 text-[#6b47c2] border-[#A88CEB]/30 dark:bg-[#A88CEB]/20 dark:text-[#c7b4f5]',
  Blocked: 'bg-[#F16D64]/15 text-[#c93e35] border-[#F16D64]/30 dark:bg-[#F16D64]/20 dark:text-[#ff9c95]',
  Completed: 'bg-[#35B8A6]/15 text-[#1b7a6d] border-[#35B8A6]/35 dark:bg-[#35B8A6]/20 dark:text-[#6fe0d0]',
  Active: 'bg-[#35B8A6]/15 text-[#1b7a6d] border-[#35B8A6]/35 dark:bg-[#35B8A6]/20 dark:text-[#6fe0d0]',
  Planning: 'bg-[#638BEF]/15 text-[#2d58c4] border-[#638BEF]/30 dark:bg-[#638BEF]/20 dark:text-[#98b4ff]',
  Cancelled: 'bg-[#E8E8E5] text-[#777777] border-[#D8D8D3] dark:bg-white/10 dark:text-slate-400',
  Approved: 'bg-[#35B8A6]/15 text-[#1b7a6d] border-[#35B8A6]/35 dark:bg-[#35B8A6]/20 dark:text-[#6fe0d0]',
  Pending: 'bg-amber-500/15 text-amber-800 border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-300',
  Rejected: 'bg-[#F16D64]/15 text-[#c93e35] border-[#F16D64]/30 dark:bg-[#F16D64]/20 dark:text-[#ff9c95]',
  Passed: 'bg-[#35B8A6]/15 text-[#1b7a6d] border-[#35B8A6]/35 dark:bg-[#35B8A6]/20 dark:text-[#6fe0d0]',
  Failed: 'bg-[#F16D64]/15 text-[#c93e35] border-[#F16D64]/30 dark:bg-[#F16D64]/20 dark:text-[#ff9c95]',
  Production: 'bg-[#35B8A6]/15 text-[#1b7a6d] border-[#35B8A6]/35 dark:bg-[#35B8A6]/20 dark:text-[#6fe0d0]',
  Pilot: 'bg-amber-500/15 text-amber-800 border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-300',
  Development: 'bg-[#638BEF]/15 text-[#2d58c4] border-[#638BEF]/30 dark:bg-[#638BEF]/20 dark:text-[#98b4ff]',
};

export const STATUS_DOT_COLOR = {
  New: '#638BEF',
  Assigned: '#A88CEB',
  'In Progress': '#638BEF',
  'On Hold': '#777777',
  'Awaiting Client Response': '#F59E0B',
  Testing: '#A88CEB',
  Resolved: '#35B8A6',
  Closed: '#171717',
  Reopened: '#F16D64',
  Todo: '#777777',
  'In Review': '#A88CEB',
  Blocked: '#F16D64',
  Completed: '#35B8A6',
};

export function formatStatusLabel(status) {
  return TICKET_STATUS_LABELS[status] || TASK_STATUS_LABELS[status] || status;
}

export function exportToCsv(filename, rows) {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (val) => {
    const str = val === null || val === undefined ? '' : String(val);
    return `"${str.replace(/"/g, '""')}"`;
  };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
