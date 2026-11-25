import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import dayjs from 'dayjs';
import api, { getApiError } from '../services/api';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import Loader from '../components/ui/Loader';
import Pagination from '../components/ui/Pagination';

export default function ActivityLogsPage() {
  const { addToast } = useToast();
  const [logs, setLogs] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/activity-logs', {
        params: {
          page,
          limit: 25,
          search: search || undefined,
          entityType: entityType || undefined,
        },
      });
      setLogs(data.data || []);
      setMeta(data.meta || null);
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [page, search, entityType]);

  return (
    <div className="space-y-5">
      <PageHeader title="Activity & Audit Logs" subtitle="Complete immutable operational history across tickets, tasks, and deployments" />

      <Card padding={false} className="p-3.5">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search action, summary, or ID (e.g. TKT-1001)..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <select
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="">All Entities</option>
            {['ticket', 'task', 'client', 'project', 'deployment', 'timeLog', 'user', 'settings'].map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {loading ? (
        <Loader label="Loading audit trail..." />
      ) : (
        <>
          <Card padding={false}>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {logs.map((log) => (
                <div key={log._id} className="flex items-start justify-between gap-3 px-4 py-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <Avatar name={log.actor?.fullName} color={log.actor?.avatarColor} size="xs" />
                    <div>
                      <div>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{log.actor?.fullName}</span>{' '}
                        <span className="text-slate-600 dark:text-slate-300">{log.summary}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                        <span className="font-mono uppercase">{log.action}</span>
                        {log.client && <span>· {log.client.companyName}</span>}
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {dayjs(log.createdAt).format('DD MMM YYYY, HH:mm')}
                  </span>
                </div>
              ))}
            </div>
          </Card>
          <Pagination meta={meta} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
