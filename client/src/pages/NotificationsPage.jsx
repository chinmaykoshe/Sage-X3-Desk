import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, ExternalLink } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';

dayjs.extend(relativeTime);

function getCategoryMeta(n) {
  const title = (n.title || '').toLowerCase();
  if (title.includes('completed') || title.includes('resolved') || title.includes('closed')) {
    return { label: 'Completed', variant: 'success' };
  }
  if (title.includes('approval')) {
    return { label: 'Approval', variant: 'warning' };
  }
  if (title.includes('created') || title.includes('approved')) {
    return { label: 'Created', variant: 'info' };
  }
  if (n.type === 'comment_added' || n.type === 'mention') {
    return { label: 'Comment', variant: 'info' };
  }
  if (n.type === 'ticket_assigned' || n.type === 'task_assigned') {
    return { label: 'Assigned', variant: 'info' };
  }
  return { label: 'Update', variant: 'default' };
}

function resolveNotificationTarget(n) {
  const title = String(n.title || '');
  if (/\bDRF-\d+/i.test(title) && n.entityId) {
    return `/approvals/drafts?draft=${n.entityId}&status=All`;
  }
  if (n.entityType === 'ticket' && n.entityId) {
    if (!n.link || n.link === '/' || n.link === '/approvals' || n.link === '/approvals/tickets') {
      return `/tickets/${n.entityId}`;
    }
    return n.link;
  }
  if (n.link && n.link !== '/') return n.link;
  if (n.entityType === 'task') return '/my-tasks';
  return '/tickets';
}

export default function NotificationsPage() {
  const { notifications, unreadCount, markNotificationRead, markAllNotificationsRead } = useAuth();
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  const list =
    filter === 'unread'
      ? notifications.filter((n) => !n.isRead)
      : filter === 'tickets'
        ? notifications.filter((n) => n.entityType === 'ticket' || String(n.link || '').includes('/tickets') || String(n.link || '').includes('/approvals'))
        : notifications;

  const openUpdate = async (n) => {
    if (!n.isRead) {
      await markNotificationRead(n._id).catch(() => {});
    }
    navigate(resolveNotificationTarget(n));
  };

  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader
        title="Inbox Updates"
        subtitle={`${unreadCount} unread workspace & ticket updates (in-app real-time feed)`}
        actions={
          unreadCount > 0 && (
            <Button variant="secondary" size="sm" onClick={markAllNotificationsRead}>
              <CheckCheck className="h-4 w-4" /> Mark All Read
            </Button>
          )
        }
      />

      <div className="flex flex-wrap gap-2">
        {[
          ['all', `All Updates (${notifications.length})`],
          ['unread', `Unread (${unreadCount})`],
          ['tickets', 'Ticket & Approval Updates'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === key
                ? 'border-[#171717] bg-[#C6F36B] text-[#171717]'
                : 'bg-white dark:bg-[#17181B] border-[#E8E8E5] dark:border-[#2C2E33] text-[#555555] dark:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState icon={Bell} title="You're all caught up" description="No updates in this Inbox view." />
      ) : (
        <Card padding={false}>
          <div className="divide-y divide-[#E8E8E5] dark:divide-[#26282D]">
            {list.map((n) => {
              const meta = getCategoryMeta(n);
              const target = resolveNotificationTarget(n);
              return (
                <div
                  key={n._id}
                  onClick={() => openUpdate(n)}
                  className={`cursor-pointer flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-[#F4F4F2]/70 dark:hover:bg-white/5 transition-colors ${
                    !n.isRead ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {!n.isRead && <span className="h-2 w-2 rounded-full bg-blue-600 shrink-0" />}
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      <span className="text-xs font-semibold text-[#171717] dark:text-slate-100">{n.title}</span>
                      <span className="text-[11px] text-[#777777]">· {dayjs(n.createdAt).fromNow()}</span>
                    </div>
                    <p className="text-xs text-[#555555] dark:text-slate-300">{n.message}</p>
                    <div className="text-[10px] font-mono text-[#777777]">{target}</div>
                  </div>
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      openUpdate(n);
                    }}
                    className="shrink-0"
                  >
                    Open <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
