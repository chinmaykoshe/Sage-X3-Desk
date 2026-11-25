import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import dayjs from 'dayjs';
import api, { getApiError } from '../services/api';
import { useToast } from '../context/ToastContext';
import { ROLE_LABELS } from '../utils/constants';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Avatar from '../components/ui/Avatar';
import Loader from '../components/ui/Loader';

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const { addToast } = useToast();
  const [emp, setEmp] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/users/${id}`)
      .then((res) => setEmp(res.data.data))
      .catch((err) => addToast(getApiError(err), 'error'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Loader label="Loading employee profile..." />;
  if (!emp) return <div className="p-6 text-sm">Employee not found.</div>;

  return (
    <div className="space-y-5">
      <div>
        <Link to="/team" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 mb-2">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Team Members
        </Link>
        <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <Avatar name={emp.fullName} color={emp.avatarColor} size="lg" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-slate-500">{emp.employeeId}</span>
                <Badge value={emp.status}>{emp.status}</Badge>
              </div>
              <h1 className="text-lg font-semibold">{emp.fullName}</h1>
              <p className="text-xs text-slate-500">
                {emp.designation} · {ROLE_LABELS[emp.role]} · {emp.email}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(emp.skills || []).map((s) => (
              <span key={s} className="rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 px-2 py-0.5 text-xs">
                {s}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <h3 className="text-sm font-semibold mb-3">Assigned Tickets ({emp.tickets?.length || 0})</h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {(emp.tickets || []).map((t) => (
              <div key={t._id} className="py-2 flex items-center justify-between">
                <Link to={`/tickets/${t._id}`} className="text-blue-600 hover:underline truncate pr-2">
                  {t.ticketId} — {t.title}
                </Link>
                <Badge value={t.status}>{t.status}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold mb-3">Tasks ({emp.tasks?.length || 0})</h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {(emp.tasks || []).map((t) => (
              <div key={t._id} className="py-2 flex items-center justify-between">
                <span className="truncate pr-2">
                  <span className="font-mono text-slate-400 mr-1">{t.taskId}</span> {t.title}
                </span>
                <Badge value={t.status}>{t.status}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold mb-3">Time Logs</h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {(emp.timeLogs || []).map((l) => (
              <div key={l._id} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{l.task?.taskId} — {l.workDescription}</div>
                  <div className="text-slate-400">{dayjs(l.date).format('DD MMM YYYY')}</div>
                </div>
                <span className="font-mono font-semibold">{l.hoursSpent}h</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold mb-3">Recent Activity</h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {(emp.activityLogs || []).map((a) => (
              <div key={a._id} className="py-2 flex justify-between gap-2">
                <span>{a.summary}</span>
                <span className="text-slate-400 shrink-0">{dayjs(a.createdAt).format('DD MMM')}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
