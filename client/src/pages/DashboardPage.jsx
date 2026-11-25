import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Ticket,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ListTodo,
  FolderKanban,
  Users,
  MessageSquareWarning,
  Rocket,
  Activity,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from 'recharts';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import api, { getApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';
import Card from '../components/ui/Card';
import Loader from '../components/ui/Loader';
import PageHeader from '../components/ui/PageHeader';
import Avatar from '../components/ui/Avatar';

dayjs.extend(relativeTime);

const CHART_COLORS = ['#2563eb', '#0d9488', '#7c3aed', '#d97706', '#dc2626', '#059669', '#64748b', '#ec4899'];

export default function DashboardPage() {
  const { user, isManager } = useAuth();
  const { addToast } = useToast();
  const { openTicketDrawer, lastSync } = useWorkspace();
  const [range, setRange] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const params = { range };
      if (range === 'custom') {
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
      }
      const res = await api.get('/reports/dashboard', { params });
      setData(res.data.data);
    } catch (err) {
      addToast(getApiError(err, 'Failed to load dashboard'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (range !== 'custom' || (startDate && endDate)) {
      loadDashboard();
    }
  }, [range, startDate, endDate, lastSync.ticket, lastSync.task, lastSync.deployment]);

  if (loading && !data) return <Loader label="Loading operational metrics..." />;

  const kpis = data?.kpis || {};
  const charts = data?.charts || {};

  const kpiCards = [
    { label: 'Active Clients', value: kpis.totalClients ?? 0, icon: Building2, tone: 'text-blue-600 bg-blue-50 dark:bg-blue-950/50', to: '/clients' },
    { label: 'Open Tickets', value: kpis.totalOpenTickets ?? 0, icon: Ticket, tone: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/50', to: '/tickets' },
    { label: 'In Progress', value: kpis.ticketsInProgress ?? 0, icon: Clock, tone: 'text-sky-600 bg-sky-50 dark:bg-sky-950/50', to: '/tickets?status=In%20Progress' },
    { label: 'Awaiting Response', value: kpis.ticketsAwaitingResponse ?? 0, icon: MessageSquareWarning, tone: 'text-amber-600 bg-amber-50 dark:bg-amber-950/50', to: '/tickets' },
    { label: 'Resolved Tickets', value: kpis.resolvedTickets ?? 0, icon: CheckCircle2, tone: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50', to: '/tickets' },
    { label: 'Overdue Tickets', value: kpis.overdueTickets ?? 0, icon: AlertTriangle, tone: 'text-rose-600 bg-rose-50 dark:bg-rose-950/50', to: '/tickets' },
    { label: 'Pending Tasks', value: kpis.totalPendingTasks ?? 0, icon: ListTodo, tone: 'text-violet-600 bg-violet-50 dark:bg-violet-950/50', to: '/my-tasks' },
    { label: 'Completed Tasks', value: kpis.completedTasks ?? 0, icon: CheckCircle2, tone: 'text-teal-600 bg-teal-50 dark:bg-teal-950/50', to: '/task-board' },
    { label: 'Active Projects', value: kpis.activeProjects ?? 0, icon: FolderKanban, tone: 'text-blue-600 bg-blue-50 dark:bg-blue-950/50', to: '/projects' },
    { label: 'Team Members', value: kpis.activeTeamMembers ?? 0, icon: Users, tone: 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300', to: '/team' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations Dashboard"
        subtitle={
          isManager
            ? `Real-time Sage X3 team visibility for ${user?.fullName}`
            : `Personal workload & assigned Sage X3 operations for ${user?.fullName}`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: 'week', label: 'This Week' },
              { id: 'month', label: 'This Month' },
              { id: 'custom', label: 'Custom' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setRange(item.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                  range === item.id
                    ? 'bg-[#171717] text-[#C6F36B] border-[#171717] dark:bg-[#C6F36B] dark:text-[#171717] dark:border-[#C6F36B]'
                    : 'bg-white text-[#555555] border-[#E8E8E5] hover:bg-[#F4F4F2] dark:bg-[#17181B] dark:text-slate-300 dark:border-[#2C2E33]'
                }`}
              >
                {item.label}
              </button>
            ))}
            {range === 'custom' && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            )}
          </div>
        }
      />

      {kpis.pendingDeployments > 0 && isManager && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="flex items-center gap-2 font-medium">
            <Rocket className="h-4 w-4 text-amber-600" />
            {kpis.pendingDeployments} Sage X3 deployment(s) pending approval or promotion.
          </div>
          <Link to="/deployments" className="font-semibold underline hover:no-underline">
            Review Deployments →
          </Link>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.label} to={card.to}>
              <Card className="hover:border-blue-300 dark:hover:border-blue-700 transition-colors h-full">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{card.label}</span>
                  <div className={`rounded-lg p-1.5 ${card.tone}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {card.value}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Tickets by Status
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.ticketsByStatus || []} margin={{ top: 5, right: 10, left: -15, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" name="Tickets" fill="#638BEF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Tickets by Priority
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={charts.ticketsByPriority || []}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={85}
                  paddingAngle={3}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {(charts.ticketsByPriority || []).map((entry, idx) => (
                    <Cell
                      key={entry.name}
                      fill={
                        entry.name === 'Critical'
                          ? '#F16D64'
                          : entry.name === 'High'
                          ? '#F59E0B'
                          : entry.name === 'Medium'
                          ? '#638BEF'
                          : '#777777'
                      }
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Tickets by Client
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.ticketsByClient || []} layout="vertical" margin={{ left: 10, right: 15 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="folder" width={70} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" name="Tickets" fill="#35B8A6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Active Tasks by Employee
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.tasksByEmployee || []} margin={{ left: -15, right: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="activeTasks" name="Active Tasks" fill="#A88CEB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Monthly Creation vs Resolution
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={charts.monthlyTrend || []} margin={{ left: -15, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="created" name="Created" stroke="#638BEF" strokeWidth={2} />
                <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#35B8A6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Recent Activity Timeline */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Recent Operational Activity
            </h3>
          </div>
          <Link to="/activity-logs" className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
            View Full Audit Log
          </Link>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {(data?.recentActivity || []).length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">No recent activity recorded.</p>
          ) : (
            data.recentActivity.map((act) => (
              <div
                key={act._id}
                onClick={() => act.ticket && openTicketDrawer(act.ticket)}
                className={`flex items-start justify-between gap-3 py-2.5 text-xs ${
                  act.ticket ? 'cursor-pointer hover:bg-[#F4F4F2]/60 dark:hover:bg-white/5 px-2 -mx-2 rounded-lg' : ''
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <Avatar name={act.actor?.fullName} color={act.actor?.avatarColor} size="xs" />
                  <div>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{act.actor?.fullName}</span>{' '}
                    <span className="text-slate-600 dark:text-slate-300">{act.summary}</span>
                    {act.client && (
                      <span className="ml-2 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {act.client.clientFolderCode}
                      </span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-[11px] text-slate-400">{dayjs(act.createdAt).fromNow()}</span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
