import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';

dayjs.extend(relativeTime);

export default function NotificationsPage() {
  const { notifications, unreadCount, markNotificationRead, markAllNotificationsRead } = useAuth();
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  const list = filter === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notification Center"
        subtitle={`${unreadCount} unread real-time notifications`}
        actions={
          unreadCount > 0 && (
            <Button variant="secondary" size="sm" onClick={markAllNotificationsRead}>
              <CheckCheck className="h-4 w-4" /> Mark All Read
            </Button>
          )
        }
      />

      <div className="flex gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`rounded-lg border px-3 py-1 text-xs font-medium ${
            filter === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
          }`}
        >
          All ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`rounded-lg border px-3 py-1 text-xs font-medium ${
            filter === 'unread' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
          }`}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={Bell} title="You're all caught up" description="No notifications in this view." />
      ) : (
        <Card padding={false}>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {list.map((n) => (
              <div
                key={n._id}
                onClick={() => {
                  if (!n.isRead) markNotificationRead(n._id);
                  if (n.link) navigate(n.link);
                }}
                className={`cursor-pointer flex items-start justify-between gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                  !n.isRead ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    {!n.isRead && <span className="h-2 w-2 rounded-full bg-blue-600" />}
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{n.title}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{n.message}</p>
                </div>
                <span className="text-[11px] text-slate-400 shrink-0">{dayjs(n.createdAt).fromNow()}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
