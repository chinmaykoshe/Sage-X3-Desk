import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  Sparkles,
  Plus,
  ArrowUpRight,
  TrendingUp,
  ShieldCheck,
  Server,
  Calendar,
  Layers,
  ChevronRight,
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
  AreaChart,
  Area,
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
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';

dayjs.extend(relativeTime);

const PRIORITY_COLORS = {
  Critical: '#F16D64',
  High: '#F59E0B',
  Medium: '#638BEF',
  Low: '#35B8A6',
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-xl border border-[#E8E8E5] bg-white/95 p-3 shadow-xl backdrop-blur-md dark:border-[#2C2E33] dark:bg-[#1C1D21]/95 text-xs">
      <div className="font-semibold text-[#171717] dark:text-white mb-1.5">{label}</div>
      {payload.map((item, idx) => (
        <div key={idx} className="flex items-center justify-between gap-3 text-[11px]">
          <span className="flex items-center gap-1.5 text-[#777777] dark:text-slate-400">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color || item.fill }} />
            {item.name}:
          </span>
          <span className="font-bold text-[#171717] dark:text-white">{item.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const { user, isManager } = useAuth();
  const { addToast } = useToast();
  const { openTicketDrawer, openQuickTicket, lastSync } = useWorkspace();
  const navigate = useNavigate();

  const [range, setRange] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trendView, setTrendView] = useState('area'); // 'area' | 'bar'

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

  const kpis = data?.kpis || {};
  const charts = data?.charts || {};

  const priorityData = useMemo(() => {
    return (charts.ticketsByPriority || []).map((p) => ({
      ...p,
      fill: PRIORITY_COLORS[p.name] || '#638BEF',
    }));
  }, [charts.ticketsByPriority]);

  const totalPriorityTickets = useMemo(() => {
    return priorityData.reduce((acc, curr) => acc + (curr.value || 0), 0);
  }, [priorityData]);

  // Derived operational health score
  const operationalHealthPct = useMemo(() => {
    const total = (kpis.totalOpenTickets || 0) + (kpis.resolvedTickets || 0);
    if (!total) return 100;
    const overdue = kpis.overdueTickets || 0;
    const score = Math.max(10, Math.min(100, Math.round(((total - overdue) / total) * 100)));
    return score;
  }, [kpis]);

  if (loading && !data) return <Loader label="Loading operational metrics..." />;

  const firstName = user?.fullName ? user.fullName.split(' ')[0] : 'Team Member';

  return (
    <div className="space-y-6">
      {/* ── 1. Modern Welcome & Operations Header ───────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-[#E8E8E5] dark:border-[#26282D] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[#171717] dark:text-white">
              Welcome back, {firstName}! 👋
            </h1>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Workspace
            </span>
          </div>
          <p className="mt-1 text-xs text-[#777777] dark:text-slate-400">
            {isManager
              ? `Real-time Sage X3 team operations, sprint progress & client workload overview.`
              : `Your assigned Sage X3 operations, tasks, timesheet & active sprint status.`}
          </p>
        </div>

        {/* Header Quick Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Time Filter Pills */}
          <div className="inline-flex rounded-xl border border-[#E8E8E5] bg-white p-1 dark:border-[#2C2E33] dark:bg-[#17181B] shadow-sm">
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
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                  range === item.id
                    ? 'bg-[#171717] text-[#C6F36B] shadow-sm dark:bg-[#C6F36B] dark:text-[#171717]'
                    : 'text-[#777777] hover:text-[#171717] dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {range === 'custom' && (
            <div className="flex items-center gap-1.5 rounded-xl border border-[#E8E8E5] bg-white px-2.5 py-1 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]">
              <Calendar className="h-3.5 w-3.5 text-[#777777]" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-xs outline-none"
              />
              <span className="text-[#777777]">→</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-xs outline-none"
              />
            </div>
          )}

          {/* Quick Action Buttons */}
          <Link to="/smart-intake">
            <Button size="sm" variant="secondary">
              <Sparkles className="h-3.5 w-3.5 text-[#35B8A6]" />
              Smart Intake
            </Button>
          </Link>
          <Button size="sm" onClick={() => openQuickTicket()}>
            <Plus className="h-4 w-4" />
            Create Ticket
          </Button>
        </div>
      </div>

      {/* Deployment Alert (if pending) */}
      {kpis.pendingDeployments > 0 && isManager && (
        <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-950 dark:text-amber-200 shadow-sm">
          <div className="flex items-center gap-2.5 font-medium">
            <Rocket className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span>
              <strong>Action Needed:</strong> {kpis.pendingDeployments} Sage X3 deployment(s) pending approval or promotion.
            </span>
          </div>
          <Link to="/deployments" className="font-semibold underline hover:no-underline flex items-center gap-1">
            Review Deployments <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* ── 2. Fresh Hero Operations Cards Row (Quantro & Eduplex Style) ─────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Dark Hero Health & Throughput Card (Quantro Style) */}
        <div className="xl:col-span-4 rounded-2xl bg-[#171717] dark:bg-[#141518] text-white p-5 border border-black/10 dark:border-white/10 shadow-lg relative overflow-hidden flex flex-col justify-between min-h-[170px]">
          {/* Subtle Ambient Background Gradient */}
          <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-[#C6F36B]/15 blur-2xl pointer-events-none" />
          <div className="absolute -left-8 -bottom-8 h-40 w-40 rounded-full bg-[#638BEF]/15 blur-2xl pointer-events-none" />

          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#C6F36B] flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> System Health &amp; SLA
              </span>
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-white/90">
                Sage X3 Operations
              </span>
            </div>

            <div className="mt-3 flex items-baseline gap-3">
              <div className="text-3xl font-extrabold tracking-tight text-white">
                {operationalHealthPct}%
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#C6F36B]">
                <TrendingUp className="h-3.5 w-3.5" /> Optimal
              </span>
            </div>

            <p className="mt-1 text-xs text-white/70">
              {kpis.totalOpenTickets ?? 0} active tickets · {kpis.resolvedTickets ?? 0} resolved · {kpis.overdueTickets ?? 0} overdue
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-white/80">
            <span className="flex items-center gap-1.5">
              <Server className="h-3 w-3 text-[#35B8A6]" /> Folders: Pilot &amp; Prod
            </span>
            <Link to="/tickets" className="text-[#C6F36B] hover:underline font-semibold flex items-center gap-1">
              Active Queue <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* 4 Sleek Metric Stat Cards (Modern Light Cards with Soft Color Accents) */}
        <div className="xl:col-span-8 grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: Open Tickets */}
          <Link to="/tickets" className="group">
            <Card className="p-4 h-full flex flex-col justify-between hover:border-[#638BEF]/60 hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#777777] dark:text-slate-400">Open Tickets</span>
                <div className="rounded-xl p-2 bg-[#638BEF]/10 text-[#638BEF] group-hover:scale-110 transition-transform">
                  <Ticket className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-2xl font-bold tracking-tight text-[#171717] dark:text-white">
                  {kpis.totalOpenTickets ?? 0}
                </div>
                <div className="mt-1 text-[11px] text-[#777777] flex items-center gap-1.5 truncate">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#638BEF]" />
                  <span>{kpis.ticketsInProgress ?? 0} In Progress · {kpis.ticketsAwaitingResponse ?? 0} Awaiting</span>
                </div>
              </div>
            </Card>
          </Link>

          {/* Card 2: Task Execution */}
          <Link to="/my-tasks" className="group">
            <Card className="p-4 h-full flex flex-col justify-between hover:border-[#35B8A6]/60 hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#777777] dark:text-slate-400">Task Velocity</span>
                <div className="rounded-xl p-2 bg-[#35B8A6]/10 text-[#35B8A6] group-hover:scale-110 transition-transform">
                  <ListTodo className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-2xl font-bold tracking-tight text-[#171717] dark:text-white">
                  {kpis.totalPendingTasks ?? 0}
                </div>
                <div className="mt-1 text-[11px] text-[#777777] flex items-center gap-1.5 truncate">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#35B8A6]" />
                  <span>{kpis.completedTasks ?? 0} Completed Tasks</span>
                </div>
              </div>
            </Card>
          </Link>

          {/* Card 3: Active Clients & Projects */}
          <Link to="/clients" className="group">
            <Card className="p-4 h-full flex flex-col justify-between hover:border-[#A88CEB]/60 hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#777777] dark:text-slate-400">Clients &amp; Projects</span>
                <div className="rounded-xl p-2 bg-[#A88CEB]/10 text-[#A88CEB] group-hover:scale-110 transition-transform">
                  <Building2 className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-2xl font-bold tracking-tight text-[#171717] dark:text-white">
                  {kpis.totalClients ?? 0}
                </div>
                <div className="mt-1 text-[11px] text-[#777777] flex items-center gap-1.5 truncate">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#A88CEB]" />
                  <span>{kpis.activeProjects ?? 0} Active Sage X3 Projects</span>
                </div>
              </div>
            </Card>
          </Link>

          {/* Card 4: Team Workload */}
          <Link to="/workload" className="group">
            <Card className="p-4 h-full flex flex-col justify-between hover:border-[#171717]/40 hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#777777] dark:text-slate-400">Team Workload</span>
                <div className="rounded-xl p-2 bg-slate-100 text-slate-800 dark:bg-white/10 dark:text-white group-hover:scale-110 transition-transform">
                  <Users className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-2xl font-bold tracking-tight text-[#171717] dark:text-white">
                  {kpis.activeTeamMembers ?? 0}
                </div>
                <div className="mt-1 text-[11px] text-[#777777] flex items-center gap-1.5 truncate">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  <span>Consultants &amp; 4GL Devs</span>
                </div>
              </div>
            </Card>
          </Link>
        </div>
      </div>

      {/* ── 3. High-End Charts Section (Inspired by Quantro & Finexy) ──────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Ticket Velocity & Throughput Wave Area Chart (8 of 12 cols) */}
        <Card className="lg:col-span-8 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[#171717] dark:text-white">
                  Ticket Creation &amp; Resolution Velocity
                </h3>
                <span className="rounded-full bg-slate-100 dark:bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-[#777777] dark:text-slate-300">
                  Monthly Trend
                </span>
              </div>
              <p className="text-xs text-[#777777] dark:text-slate-400 mt-0.5">
                Volume of incoming support requests compared with resolved operational issues
              </p>
            </div>

            {/* View Switcher */}
            <div className="inline-flex rounded-lg border border-[#E8E8E5] bg-[#F4F4F2] p-0.5 dark:border-[#2C2E33] dark:bg-[#1E2025]">
              <button
                onClick={() => setTrendView('area')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                  trendView === 'area'
                    ? 'bg-white text-[#171717] shadow-sm dark:bg-[#17181B] dark:text-white'
                    : 'text-[#777777] hover:text-[#171717] dark:hover:text-white'
                }`}
              >
                Wave
              </button>
              <button
                onClick={() => setTrendView('bar')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                  trendView === 'bar'
                    ? 'bg-white text-[#171717] shadow-sm dark:bg-[#17181B] dark:text-white'
                    : 'text-[#777777] hover:text-[#171717] dark:hover:text-white'
                }`}
              >
                Bars
              </button>
            </div>
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              {trendView === 'area' ? (
                <AreaChart data={charts.monthlyTrend || []} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="createdGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#638BEF" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#638BEF" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="resolvedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#35B8A6" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#35B8A6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Area
                    type="monotone"
                    dataKey="created"
                    name="Created Tickets"
                    stroke="#638BEF"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#createdGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="resolved"
                    name="Resolved Tickets"
                    stroke="#35B8A6"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#resolvedGrad)"
                  />
                </AreaChart>
              ) : (
                <BarChart data={charts.ticketsByStatus || []} margin={{ top: 10, right: 15, left: -15, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Tickets" fill="#638BEF" radius={[6, 6, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Priority & Severity Donut with Center Metric (4 of 12 cols, Quantro Image 2 Style) */}
        <Card className="lg:col-span-4 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold text-[#171717] dark:text-white">
                Tickets by Priority
              </h3>
              <span className="text-[11px] font-semibold text-[#777777]">SLA Triage</span>
            </div>
            <p className="text-xs text-[#777777] dark:text-slate-400">
              Severity distribution of current operations backlog
            </p>
          </div>

          {/* Donut Chart with Total In Hole */}
          <div className="h-52 relative my-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={priorityData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={82}
                  paddingAngle={4}
                  strokeWidth={0}
                >
                  {priorityData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            {/* Centered Total Metric Label in Donut Hole */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-2xl font-extrabold tracking-tight text-[#171717] dark:text-white">
                {totalPriorityTickets}
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#777777]">
                Total
              </div>
            </div>
          </div>

          {/* Clean Percentage Breakdown Pills (Quantro Style) */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E8E8E5] dark:border-[#26282D]">
            {priorityData.map((p) => {
              const pct = totalPriorityTickets > 0 ? Math.round((p.value / totalPriorityTickets) * 100) : 0;
              return (
                <div key={p.name} className="flex items-center justify-between rounded-lg bg-[#F4F4F2]/70 dark:bg-white/[0.03] p-2 text-xs">
                  <span className="flex items-center gap-1.5 truncate">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: p.fill }} />
                    <span className="font-medium truncate">{p.name}</span>
                  </span>
                  <span className="font-bold text-[#171717] dark:text-white shrink-0 ml-1">
                    {p.value} <span className="text-[10px] text-[#777777]">({pct}%)</span>
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ── 4. Bottom Operational Feeds (Top Clients & Live Activity Stream) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Top Clients by Active Tickets (5 of 12 cols) */}
        <Card className="lg:col-span-5 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-[#171717] dark:text-white">
                Top Clients &amp; Workload
              </h3>
              <p className="text-xs text-[#777777] dark:text-slate-400 mt-0.5">
                Sage X3 support volume distribution across client accounts
              </p>
            </div>
            <Link to="/clients" className="text-xs font-semibold text-[#638BEF] hover:underline flex items-center gap-0.5">
              View All <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="space-y-3">
            {(charts.ticketsByClient || []).length === 0 ? (
              <p className="py-8 text-center text-xs text-[#777777]">No client ticket activity recorded.</p>
            ) : (
              (charts.ticketsByClient || []).map((c, idx) => {
                const maxCount = Math.max(...(charts.ticketsByClient || []).map((x) => x.count), 1);
                const pct = Math.round((c.count / maxCount) * 100);
                return (
                  <div
                    key={idx}
                    onClick={() => navigate('/tickets')}
                    className="group rounded-xl border border-[#E8E8E5] dark:border-[#26282D] p-3 hover:border-[#171717]/40 dark:hover:border-white/20 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 font-bold text-[11px]">
                          {c.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="truncate">
                          <span className="font-semibold text-[#171717] dark:text-white group-hover:text-[#638BEF] transition-colors truncate block">
                            {c.name}
                          </span>
                          {c.folder && (
                            <span className="font-mono text-[10px] text-[#777777] block">
                              Folder: {c.folder}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="rounded-full bg-slate-100 dark:bg-white/10 px-2 py-0.5 font-bold text-xs text-[#171717] dark:text-white">
                          {c.count} {c.count === 1 ? 'ticket' : 'tickets'}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar Visual */}
                    <div className="h-1.5 w-full rounded-full bg-[#E8E8E5] dark:bg-[#26282D] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#638BEF] transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* Live Operational Activity Stream (7 of 12 cols) */}
        <Card className="lg:col-span-7 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="rounded-lg p-1.5 bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                <Activity className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#171717] dark:text-white">
                  Live Operations Stream
                </h3>
                <p className="text-xs text-[#777777] dark:text-slate-400">
                  Real-time ticket updates, task transitions &amp; team interactions
                </p>
              </div>
            </div>
            <Link to="/activity-logs" className="text-xs font-semibold text-[#638BEF] hover:underline flex items-center gap-0.5">
              Audit Logs <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-[#E8E8E5] dark:divide-[#26282D]">
            {(data?.recentActivity || []).length === 0 ? (
              <p className="py-8 text-center text-xs text-[#777777]">No recent activity recorded.</p>
            ) : (
              data.recentActivity.slice(0, 7).map((act) => (
                <div
                  key={act._id}
                  onClick={() => act.ticket && openTicketDrawer(act.ticket)}
                  className={`flex items-start justify-between gap-3 py-3 text-xs transition-colors ${
                    act.ticket ? 'cursor-pointer hover:bg-[#F4F4F2]/70 dark:hover:bg-white/[0.03] px-2 -mx-2 rounded-lg' : ''
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <Avatar name={act.actor?.fullName} color={act.actor?.avatarColor} size="sm" />
                    <div className="min-w-0">
                      <div className="font-semibold text-[#171717] dark:text-white truncate">
                        {act.actor?.fullName || 'System User'}
                      </div>
                      <p className="text-[#555555] dark:text-slate-300 mt-0.5 break-words line-clamp-2">
                        {act.summary}
                      </p>
                      {act.client && (
                        <span className="mt-1 inline-block rounded bg-slate-100 dark:bg-white/10 px-1.5 py-0.2 text-[10px] font-mono text-[#777777] dark:text-slate-300">
                          {act.client.clientFolderCode}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] font-medium text-[#777777]">
                    {dayjs(act.createdAt).fromNow()}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
