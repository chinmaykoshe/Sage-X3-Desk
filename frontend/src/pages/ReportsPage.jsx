import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import dayjs from 'dayjs';
import api, { getApiError } from '../services/api';
import { useToast } from '../context/ToastContext';
import { exportToCsv } from '../utils/constants';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Loader from '../components/ui/Loader';

export default function ReportsPage() {
  const { addToast } = useToast();
  const [tab, setTab] = useState('tickets');
  const [range, setRange] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [ticketReport, setTicketReport] = useState(null);
  const [workloadReport, setWorkloadReport] = useState([]);
  const [timeReport, setTimeReport] = useState(null);

  const loadReports = async () => {
    setLoading(true);
    try {
      const params = { range };
      if (range === 'custom') {
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
      }
      const [tRes, wRes, tmRes] = await Promise.all([
        api.get('/reports/tickets', { params }),
        api.get('/reports/workload', { params }),
        api.get('/reports/time-tracking', { params }),
      ]);
      setTicketReport(tRes.data.data);
      setWorkloadReport(wRes.data.data || []);
      setTimeReport(tmRes.data.data);
    } catch (err) {
      addToast(getApiError(err, 'Failed to load reports'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [range, startDate, endDate]);

  const exportClientsCsv = () => {
    const rows = (ticketReport?.byClient || []).map((r) => ({
      ClientID: r.clientId,
      Company: r.companyName,
      Folder: r.folderCode,
      TotalTickets: r.total,
      OpenTickets: r.open,
      ResolvedTickets: r.resolved,
      CriticalTickets: r.critical,
    }));
    exportToCsv(`sagex3-client-tickets-${dayjs().format('YYYY-MM-DD')}.csv`, rows);
    addToast('Client ticket report exported');
  };

  const exportWorkloadCsv = () => {
    const rows = workloadReport.map((u) => ({
      EmployeeID: u.employeeId,
      Name: u.fullName,
      Designation: u.designation,
      AssignedTickets: u.workload.assignedTickets,
      ActiveTasks: u.workload.activeTasks,
      PendingTasks: u.workload.pendingTasks,
      CompletedTasks: u.workload.completedTasks,
      OverdueTasks: u.workload.overdueTasks,
      LoggedHours: u.workload.loggedHours,
    }));
    exportToCsv(`sagex3-team-workload-${dayjs().format('YYYY-MM-DD')}.csv`, rows);
    addToast('Workload report exported');
  };

  const exportTimeCsv = () => {
    const rows = (timeReport?.estVsActual || []).map((t) => ({
      TaskID: t.taskId,
      Title: t.title,
      Ticket: t.ticket?.ticketId || '',
      Client: t.client?.companyName || '',
      Status: t.status,
      EstimatedHours: t.estimatedHours,
      ActualHours: t.actualHours,
    }));
    exportToCsv(`sagex3-time-tracking-${dayjs().format('YYYY-MM-DD')}.csv`, rows);
    addToast('Time tracking report exported');
  };

  if (loading && !ticketReport) return <Loader label="Generating management reports..." />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports & Analytics"
        subtitle="SLA performance, client ticket distribution, team workload, and time tracking exports"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {['all', 'today', 'week', 'month', 'custom'].map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium capitalize ${
                  range === r
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700'
                }`}
              >
                {r === 'all' ? 'All Time' : r}
              </button>
            ))}
            {range === 'custom' && (
              <>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded border px-2 py-1 text-xs dark:bg-slate-900 dark:border-slate-700"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded border px-2 py-1 text-xs dark:bg-slate-900 dark:border-slate-700"
                />
              </>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {[
          { id: 'tickets', label: 'Client & SLA Reports' },
          { id: 'workload', label: 'Developer Workload' },
          { id: 'time', label: 'Time Tracking & Variance' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              tab === t.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'tickets' && ticketReport && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <Card>
              <div className="text-xs text-slate-500">Avg Resolution Time</div>
              <div className="mt-1 text-2xl font-bold">{ticketReport.resolution?.avgResolutionHours || 0} hrs</div>
            </Card>
            <Card>
              <div className="text-xs text-slate-500">SLA Compliance</div>
              <div className="mt-1 text-2xl font-bold text-emerald-600">{ticketReport.sla?.complianceRate ?? 100}%</div>
            </Card>
            <Card>
              <div className="text-xs text-slate-500">Overdue Open Tickets</div>
              <div className="mt-1 text-2xl font-bold text-rose-600">{ticketReport.overdueTickets?.length || 0}</div>
            </Card>
            <Card>
              <div className="text-xs text-slate-500">Resolved Tickets</div>
              <div className="mt-1 text-2xl font-bold">{ticketReport.resolution?.totalResolved || 0}</div>
            </Card>
          </div>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Client-wise Ticket Breakdown</h3>
              <Button size="xs" variant="secondary" onClick={exportClientsCsv}>
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Client</th>
                    <th className="py-2 pr-4">Folder</th>
                    <th className="py-2 pr-4 text-right">Total</th>
                    <th className="py-2 pr-4 text-right">Open</th>
                    <th className="py-2 pr-4 text-right">Resolved</th>
                    <th className="py-2 text-right">Critical</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(ticketReport.byClient || []).map((row) => (
                    <tr key={row.clientId}>
                      <td className="py-2.5 pr-4 font-medium">{row.companyName}</td>
                      <td className="py-2.5 pr-4 font-mono">{row.folderCode}</td>
                      <td className="py-2.5 pr-4 text-right font-semibold">{row.total}</td>
                      <td className="py-2.5 pr-4 text-right text-blue-600">{row.open}</td>
                      <td className="py-2.5 pr-4 text-right text-emerald-600">{row.resolved}</td>
                      <td className="py-2.5 text-right text-rose-600">{row.critical}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold mb-3">Tickets by Category</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ticketReport.categoryBreakdown || []} margin={{ left: -15, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Tickets" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {tab === 'workload' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Developer-wise Workload Distribution</h3>
            <Button size="xs" variant="secondary" onClick={exportWorkloadCsv}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
          <div className="h-72 mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={workloadReport.map((u) => ({
                  name: u.fullName,
                  Active: u.workload.activeTasks,
                  Pending: u.workload.pendingTasks,
                  Completed: u.workload.completedTasks,
                  Hours: u.workload.loggedHours,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Active" fill="#2563eb" />
                <Bar dataKey="Pending" fill="#d97706" />
                <Bar dataKey="Completed" fill="#059669" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {tab === 'time' && timeReport && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card>
              <h3 className="text-sm font-semibold mb-3">Hours by Client</h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {(timeReport.byClient || []).map((c) => (
                  <div key={c.clientId} className="py-2 flex justify-between">
                    <span>
                      {c.companyName} <span className="font-mono text-slate-400">({c.folderCode})</span>
                    </span>
                    <span className="font-mono font-semibold">{c.totalHours}h</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <h3 className="text-sm font-semibold mb-3">Hours by Employee</h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {(timeReport.byEmployee || []).map((e) => (
                  <div key={e.employeeId} className="py-2 flex justify-between">
                    <span>{e.fullName}</span>
                    <span className="font-mono font-semibold">{e.totalHours}h</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Estimated vs Actual Hours (Tasks)</h3>
              <Button size="xs" variant="secondary" onClick={exportTimeCsv}>
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Task</th>
                    <th className="py-2 pr-4">Ticket</th>
                    <th className="py-2 pr-4">Client</th>
                    <th className="py-2 pr-4 text-right">Estimated</th>
                    <th className="py-2 text-right">Actual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(timeReport.estVsActual || []).map((t) => (
                    <tr key={t._id}>
                      <td className="py-2 pr-4 font-medium">
                        <span className="font-mono text-slate-400 mr-1.5">{t.taskId}</span>
                        {t.title}
                      </td>
                      <td className="py-2 pr-4 font-mono">{t.ticket?.ticketId || '—'}</td>
                      <td className="py-2 pr-4">{t.client?.companyName || '—'}</td>
                      <td className="py-2 pr-4 text-right font-mono">{t.estimatedHours}h</td>
                      <td className="py-2 text-right font-mono font-semibold">{t.actualHours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
