import { Fragment } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

const LABELS = {
  'my-tasks': 'My Work',
  timesheet: 'Timesheet',
  tasks: 'Tasks',
  'task-board': 'Task Board',
  notifications: 'Inbox',
  'smart-intake': 'Smart Intake (AI)',
  'email-inbox': 'Email Inbox',
  approvals: 'TL Approvals',
  drafts: 'Ticket Drafts',
  tickets: 'All Tickets',
  requests: 'Users, Clients & Projects',
  calendar: 'Calendar',
  clients: 'Clients',
  projects: 'Projects',
  team: 'Team Members',
  workload: 'Workload',
  deployments: 'Deployments',
  reports: 'Reports',
  'activity-logs': 'Activity Logs',
  'knowledge-base': 'Knowledge Base',
  settings: 'Settings',
  general: 'General Settings',
  'access-control': 'Access Control',
  'email-integrations': 'Email Integrations',
  profile: 'Profile',
  admin: 'Administration',
  overview: 'System Overview',
  governance: 'Data & Duplicate Control',
  'user-activity': 'User Activity',
  'dev-logs': 'Development Logs',
  'system-logs': 'System Logs',
  'api-monitoring': 'API Monitoring',
  'time-tracking': 'Time Tracking',
  'ai-activity': 'AI Activity',
  'audit-logs': 'Security & Audit',
};

const NON_CLICKABLE_REDIRECTS = {
  admin: '/admin/overview',
  settings: '/settings/general',
};

function formatSegment(seg, prevSeg) {
  if (prevSeg === 'approvals' && seg === 'tickets') return 'Dev & Email Tickets';
  if (LABELS[seg]) return LABELS[seg];
  if (/^[a-f0-9]{24}$/i.test(seg)) {
    if (prevSeg === 'tickets') return 'Ticket Details';
    if (prevSeg === 'clients') return 'Client Details';
    if (prevSeg === 'projects') return 'Project Details';
    if (prevSeg === 'team') return 'Employee Profile';
    return 'Details';
  }
  return seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Breadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);

  const crumbs = segments.map((seg, idx) => {
    const rawPath = '/' + segments.slice(0, idx + 1).join('/');
    const to = NON_CLICKABLE_REDIRECTS[seg] || rawPath;
    const label = formatSegment(seg, segments[idx - 1]);
    return { label, to, isLast: idx === segments.length - 1 };
  });

  return (
    <nav aria-label="Breadcrumb" className="mb-2.5 sm:mb-3 flex flex-wrap items-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs text-[#777777]">
      <Link
        to="/"
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-[#555555] hover:bg-[#F4F4F2] hover:text-[#171717] dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
      >
        <Home className="h-3.5 w-3.5" />
        <span>Overview</span>
      </Link>
      {crumbs.map((c) => (
        <Fragment key={c.to + c.label}>
          <ChevronRight className="h-3.5 w-3.5 text-[#AAAAAA] shrink-0" />
          {c.isLast ? (
            <span className="rounded-md bg-[#F4F4F2] px-2 py-0.5 font-semibold text-[#171717] dark:bg-white/10 dark:text-[#C6F36B]">
              {c.label}
            </span>
          ) : (
            <Link
              to={c.to}
              className="rounded-md px-1.5 py-0.5 font-medium text-[#555555] hover:bg-[#F4F4F2] hover:text-[#171717] dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
            >
              {c.label}
            </Link>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
