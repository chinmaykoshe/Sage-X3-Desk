import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Clock,
  Download,
  History,
  Rocket,
  Server,
  ShieldAlert,
  Terminal,
  Wrench,
} from 'lucide-react';
import dayjs from 'dayjs';
import api, { getApiError } from '../services/api';
import { useWorkspace } from '../context/WorkspaceContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Loader from '../components/ui/Loader';

const ROUTE_TO_TAB = {
  '/admin/overview': 'overview',
  '/admin/user-activity': 'user-activity',
  '/admin/dev-logs': 'dev-logs',
  '/admin/system-logs': 'system-logs',
  '/admin/api-monitoring': 'api-monitoring',
  '/admin/deployments': 'deployments',
  '/admin/time-tracking': 'time-tracking',
  '/admin/ai-activity': 'ai-activity',
  '/admin/audit-logs': 'audit-logs',
};

const TABS = [
  { id: 'overview', label: 'System Overview', icon: Activity },
  { id: 'user-activity', label: 'User Activity', icon: History },
  { id: 'dev-logs', label: 'Development Logs', icon: Wrench },
  { id: 'system-logs', label: 'System Logs', icon: AlertTriangle },
  { id: 'api-monitoring', label: 'API Monitoring', icon: Server },
  { id: 'deployments', label: 'Deployment History', icon: Rocket },
  { id: 'time-tracking', label: 'Time Tracking', icon: Clock },
  { id: 'ai-activity', label: 'AI Activity', icon: BrainCircuit },
  { id: 'audit-logs', label: 'Security & Audit', icon: ShieldAlert },
];

export default function AdminMonitoringPage() {
  const { users, clients } = useWorkspace();
  const { addToast } = useToast();
  const location = useLocation();

  const [tab, setTab] = useState(ROUTE_TO_TAB[location.pathname] || 'overview');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [empTimelineCategory, setEmpTimelineCategory] = useState('all');

  const [overview, setOverview] = useState(null);
  const [employeeReport, setEmployeeReport] = useState(null);
  const [devLogs, setDevLogs] = useState([]);
  const [systemLogs, setSystemLogs] = useState([]);
  const [apiStats, setApiStats] = useState({ byEndpoint: [], recentErrors: [] });
  const [deployments, setDeployments] = useState([]);
  const [timeLogs, setTimeLogs] = useState([]);
  const [aiLogs, setAiLogs] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  useEffect(() => {
    const mapped = ROUTE_TO_TAB[location.pathname];
    if (mapped) setTab(mapped);
  }, [location.pathname]);

  useEffect(() => {
    if (!selectedEmployeeId && users.length > 0) {
      setSelectedEmployeeId(users[0]._id);
    }
  }, [users, selectedEmployeeId]);

  const loadTabData = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'overview') {
        const { data } = await api.get('/monitoring/overview');
        setOverview(data.data);
      } else if (tab === 'user-activity' && selectedEmployeeId) {
        const { data } = await api.get(`/monitoring/employee-activity/${selectedEmployeeId}`, {
          params: { category: empTimelineCategory, search: search || undefined },
        });
        setEmployeeReport(data.data);
      } else if (tab === 'dev-logs') {
        const { data } = await api.get('/monitoring/dev-activities', {
          params: { search: search || undefined, employeeId: selectedEmployeeId || undefined },
        });
        setDevLogs(data.data || []);
      } else if (tab === 'system-logs') {
        const { data } = await api.get('/monitoring/system-logs', {
          params: { severity: severityFilter || undefined, search: search || undefined },
        });
        setSystemLogs(data.data || []);
      } else if (tab === 'api-monitoring') {
        const { data } = await api.get('/monitoring/api-stats');
        setApiStats(data.data || { byEndpoint: [], recentErrors: [] });
      } else if (tab === 'deployments') {
        const { data } = await api.get('/monitoring/deployments');
        setDeployments(data.data || []);
      } else if (tab === 'time-tracking') {
        const { data } = await api.get('/monitoring/time-logs', {
          params: { employee: selectedEmployeeId || undefined },
        });
        setTimeLogs(data.data || []);
      } else if (tab === 'ai-activity') {
        const { data } = await api.get('/monitoring/ai-logs');
        setAiLogs(data.data || []);
      } else if (tab === 'audit-logs') {
        const { data } = await api.get('/monitoring/audit-logs', {
          params: { search: search || undefined },
        });
        setAuditLogs(data.data || []);
      }
    } catch (err) {
      addToast(getApiError(err, 'Failed to load monitoring data'), 'error');
    } finally {
      setLoading(false);
    }
  }, [tab, selectedEmployeeId, empTimelineCategory, severityFilter, search]);

  useEffect(() => {
    loadTabData();
  }, [loadTabData]);

  const exportTimelineCsv = () => {
    if (!employeeReport?.timeline?.length) return;
    const rows = [
      ['Timestamp', 'Category', 'Action', 'Reference', 'Description'],
      ...employeeReport.timeline.map((t) => [
        dayjs(t.timestamp).format('YYYY-MM-DD HH:mm:ss'),
        t.category,
        t.action,
        t.relatedRef || '',
        `"${String(t.description || '').replace(/"/g, '""')}"`,
      ]),
    ];
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `employee-activity-${employeeReport.employee?.employeeId || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Administration Monitoring & Audit"
        subtitle="Centralized operational visibility, development history, AI execution logs, and immutable security audit trail"
      />

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t.id
                  ? 'border-[#171717] bg-[#C6F36B] text-[#171717] font-semibold'
                  : 'border-[#E8E8E5] bg-white text-[#555555] dark:border-[#2C2E33] dark:bg-[#17181B] dark:text-slate-300'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <Loader label="Loading monitoring view..." />
      ) : tab === 'overview' && overview ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Active Users', overview.kpis.totalUsers, 'text-[#171717] dark:text-white'],
              ['Pending Approvals', overview.kpis.pendingApprovals, 'text-[#638BEF]'],
              ['Approved Tickets', overview.kpis.approvedTickets, 'text-[#35B8A6]'],
              ['Dev Updates', overview.kpis.devUpdatesCount, 'text-[#A88CEB]'],
              ['API / Auth Errors (24h)', overview.kpis.apiErrors24h, 'text-[#F16D64]'],
              ['AI Requests (24h)', overview.kpis.aiCalls24h, 'text-[#638BEF]'],
              ['Deployments Recorded', overview.kpis.deploymentsCount, 'text-[#35B8A6]'],
              ['Audit Events', overview.kpis.auditEventsCount, 'text-[#171717] dark:text-white'],
            ].map(([lbl, val, cls]) => (
              <Card key={lbl} className="p-3.5">
                <div className="text-[11px] text-[#777777]">{lbl}</div>
                <div className={`mt-1 text-2xl font-bold ${cls}`}>{val}</div>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777777] mb-3">Latest Security & Audit Events</h3>
              <div className="space-y-2 text-xs">
                {(overview.recentAudit || []).map((a) => (
                  <div key={a._id} className="flex items-center justify-between border-b border-[#E8E8E5] dark:border-[#26282D] pb-1.5">
                    <div>
                      <span className="font-semibold">{a.action}</span> · <span className="text-[#777777]">{a.recordRef || a.recordType}</span>
                      <div className="text-[10px] text-[#777777]">{a.actorId?.fullName || 'System'} · {a.module}</div>
                    </div>
                    <Badge variant={a.result === 'DENIED' ? 'danger' : 'success'}>{a.result}</Badge>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777777] mb-3">Recent System & API Logs</h3>
              <div className="space-y-2 text-xs">
                {(overview.recentSystemErrors || []).length === 0 ? (
                  <p className="text-[#777777]">No recent errors recorded.</p>
                ) : (
                  overview.recentSystemErrors.map((s) => (
                    <div key={s._id} className="border-b border-[#E8E8E5] dark:border-[#26282D] pb-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] font-semibold">{s.method} {s.endpoint}</span>
                        <Badge variant="danger">{s.httpStatus}</Badge>
                      </div>
                      <p className="text-[11px] text-[#777777] truncate">{s.message}</p>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      ) : tab === 'user-activity' ? (
        <div className="space-y-4">
          <Card className="p-3">
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="rounded-lg border border-[#E8E8E5] bg-white px-3 py-1.5 dark:border-[#2C2E33] dark:bg-[#1E2025]"
              >
                {users.map((u) => (
                  <option key={u._id} value={u._id}>{u.fullName} ({u.role})</option>
                ))}
              </select>
              <select
                value={empTimelineCategory}
                onChange={(e) => setEmpTimelineCategory(e.target.value)}
                className="rounded-lg border border-[#E8E8E5] bg-white px-3 py-1.5 dark:border-[#2C2E33] dark:bg-[#1E2025]"
              >
                <option value="all">All Categories</option>
                <option value="activity">Operational Activity</option>
                <option value="development">Development Updates</option>
                <option value="time_log">Time Logs</option>
                <option value="deployment">Deployments</option>
                <option value="comment">Comments</option>
                <option value="security">Login / Security</option>
              </select>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search timeline..."
                className="flex-1 min-w-[180px] rounded-lg border border-[#E8E8E5] px-3 py-1.5 dark:border-[#2C2E33] dark:bg-[#1E2025]"
              />
              <Button size="sm" variant="secondary" onClick={exportTimelineCsv}>
                <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
              </Button>
            </div>
          </Card>

          {employeeReport && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Card className="p-3"><div className="text-[11px] text-[#777777]">Assigned Tickets</div><div className="text-lg font-bold">{employeeReport.summary.assignedTicketsCount}</div></Card>
                <Card className="p-3"><div className="text-[11px] text-[#777777]">Active Tasks</div><div className="text-lg font-bold">{employeeReport.summary.activeTasksCount}</div></Card>
                <Card className="p-3"><div className="text-[11px] text-[#777777]">Completed Tasks</div><div className="text-lg font-bold">{employeeReport.summary.completedTasksCount}</div></Card>
                <Card className="p-3"><div className="text-[11px] text-[#777777]">Hours Logged</div><div className="text-lg font-bold">{employeeReport.summary.totalHoursLogged}h</div></Card>
                <Card className="p-3"><div className="text-[11px] text-[#777777]">Deployments</div><div className="text-lg font-bold">{employeeReport.summary.deploymentsCount}</div></Card>
              </div>
              <Card>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777777] mb-3">Unified Chronological Timeline</h3>
                <div className="space-y-2 text-xs">
                  {(employeeReport.timeline || []).length === 0 ? (
                    <p className="text-[#777777]">No timeline entries match the filter.</p>
                  ) : (
                    employeeReport.timeline.map((item) => (
                      <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E8E8E5] dark:border-[#26282D] pb-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <Badge variant="info">{item.category}</Badge>
                            <span className="font-semibold">{item.action}</span>
                            {item.relatedTicketId ? (
                              <Link to={`/tickets/${item.relatedTicketId}`} className="text-[#638BEF] hover:underline font-medium">
                                {item.relatedRef}
                              </Link>
                            ) : item.relatedRef ? (
                              <span className="text-[#777777]">{item.relatedRef}</span>
                            ) : null}
                          </div>
                          <p className="text-[#555555] dark:text-slate-300">{item.description}</p>
                        </div>
                        <span className="text-[11px] text-[#777777]">{dayjs(item.timestamp).format('DD MMM YYYY HH:mm')}</span>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </>
          )}
        </div>
      ) : tab === 'dev-logs' ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777777]">Chronological Development Logs ({devLogs.length})</h3>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter scripts, notes..." className="rounded-lg border border-[#E8E8E5] px-3 py-1 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]" />
          </div>
          <div className="space-y-2.5 text-xs">
            {devLogs.length === 0 ? <p className="text-[#777777]">No development updates recorded yet.</p> : devLogs.map((d) => (
              <div key={d._id} className="rounded-lg border border-[#E8E8E5] dark:border-[#26282D] p-3 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{d.employeeId?.fullName}</span>
                    <Badge variant="info">{d.workStatus}</Badge>
                    <Badge>{d.environment}</Badge>
                    {d.affectedComponent && <code className="rounded bg-[#F4F4F2] dark:bg-white/10 px-1.5 py-0.5 text-[11px]">{d.affectedComponent}</code>}
                  </div>
                  <span className="text-[11px] text-[#777777]">{dayjs(d.timestamp).format('DD MMM YYYY HH:mm')} · {d.timeSpent || 0}h</span>
                </div>
                <p>{d.description}</p>
                {d.ticketId && <Link to={`/tickets/${d.ticketId._id}`} className="text-[#638BEF] hover:underline">{d.ticketId.ticketId}: {d.ticketId.title}</Link>}
              </div>
            ))}
          </div>
        </Card>
      ) : tab === 'system-logs' ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
            <h3 className="font-semibold uppercase tracking-wider text-[#777777]">System & Application Logs</h3>
            <div className="flex gap-2">
              <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="rounded-lg border border-[#E8E8E5] px-2.5 py-1 dark:border-[#2C2E33] dark:bg-[#1E2025]">
                <option value="">All Severities</option>
                <option value="error">Error</option>
                <option value="security">Security</option>
                <option value="warn">Warning</option>
              </select>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search message..." className="rounded-lg border border-[#E8E8E5] px-2.5 py-1 dark:border-[#2C2E33] dark:bg-[#1E2025]" />
            </div>
          </div>
          <div className="space-y-2 text-xs">
            {systemLogs.length === 0 ? <p className="text-[#777777]">No matching system logs.</p> : systemLogs.map((l) => (
              <div key={l._id} className="rounded-lg border border-[#E8E8E5] dark:border-[#26282D] p-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={l.severity === 'error' || l.severity === 'security' ? 'danger' : 'warning'}>{l.severity}</Badge>
                    <span className="font-mono font-semibold">{l.method} {l.endpoint} ({l.httpStatus})</span>
                  </div>
                  <span className="text-[11px] text-[#777777]">{dayjs(l.timestamp).format('DD MMM HH:mm:ss')}</span>
                </div>
                <p className="mt-1 text-[#555555] dark:text-slate-300">{l.message}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : tab === 'api-monitoring' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <Card>
            <h3 className="font-semibold uppercase tracking-wider text-[#777777] mb-3">Endpoint Error Breakdown (24h)</h3>
            {(apiStats.byEndpoint || []).map((row, idx) => (
              <div key={idx} className="flex items-center justify-between border-b border-[#E8E8E5] dark:border-[#26282D] py-1.5">
                <span className="font-mono">{row._id.endpoint} · HTTP {row._id.status}</span>
                <span className="font-bold">{row.count}</span>
              </div>
            ))}
          </Card>
          <Card>
            <h3 className="font-semibold uppercase tracking-wider text-[#777777] mb-3">Recent API / Database Failures</h3>
            {(apiStats.recentErrors || []).map((e) => (
              <div key={e._id} className="border-b border-[#E8E8E5] dark:border-[#26282D] py-1.5">
                <div className="flex justify-between font-mono font-semibold"><span>{e.endpoint}</span><span>{e.httpStatus}</span></div>
                <p className="text-[#777777]">{e.message}</p>
              </div>
            ))}
          </Card>
        </div>
      ) : tab === 'deployments' ? (
        <Card>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777777] mb-3">Chronological Deployment History</h3>
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#E8E8E5] dark:border-[#26282D] text-[#777777]">
                  <th className="py-2 pr-3">ID</th><th className="py-2 pr-3">Client</th><th className="py-2 pr-3">Ticket</th>
                  <th className="py-2 pr-3">Env</th><th className="py-2 pr-3">Developer</th><th className="py-2 pr-3">Approval</th><th className="py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {deployments.map((d) => (
                  <tr key={d._id} className="border-b border-[#E8E8E5]/60 dark:border-[#26282D]/60">
                    <td className="py-2 pr-3 font-mono font-semibold">{d.deploymentId}</td>
                    <td className="py-2 pr-3">{d.client?.companyName}</td>
                    <td className="py-2 pr-3">{d.ticket ? <Link className="text-[#638BEF] hover:underline" to={`/tickets/${d.ticket._id}`}>{d.ticket.ticketId}</Link> : '-'}</td>
                    <td className="py-2 pr-3"><Badge>{d.environment}</Badge></td>
                    <td className="py-2 pr-3">{d.deployedBy?.fullName}</td>
                    <td className="py-2 pr-3"><Badge variant={d.approvalStatus === 'Approved' ? 'success' : 'warning'}>{d.approvalStatus}</Badge></td>
                    <td className="py-2">{dayjs(d.deploymentDate || d.createdAt).format('DD MMM YYYY')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : tab === 'time-tracking' ? (
        <Card>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777777] mb-3">Team Time Tracking ({timeLogs.length} entries)</h3>
          <div className="space-y-2 text-xs">
            {timeLogs.map((l) => (
              <div key={l._id} className="flex items-center justify-between border-b border-[#E8E8E5] dark:border-[#26282D] pb-1.5">
                <div>
                  <span className="font-semibold">{l.employee?.fullName}</span> logged <strong>{l.hoursSpent}h</strong> ({l.workCategory})
                  {l.ticket && <Link className="ml-2 text-[#638BEF] hover:underline" to={`/tickets/${l.ticket._id}`}>{l.ticket.ticketId}</Link>}
                </div>
                <span className="text-[#777777]">{dayjs(l.date).format('DD MMM YYYY')}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : tab === 'ai-activity' ? (
        <Card>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777777] mb-3">AI Execution & OCR Logs</h3>
          <div className="space-y-2 text-xs">
            {aiLogs.length === 0 ? <p className="text-[#777777]">No AI execution logs yet.</p> : aiLogs.map((a) => (
              <div key={a._id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E8E8E5] dark:border-[#26282D] pb-1.5">
                <div>
                  <span className="font-semibold">{a.userId?.fullName}</span> · <Badge variant="info">{a.detectedIntent}</Badge> → {a.executedAction}
                  <div className="text-[11px] text-[#777777]">Model: {a.modelName} ({a.ollamaStatus}) · {a.processingDurationMs}ms</div>
                </div>
                <Badge variant={a.executionResult === 'denied' || a.executionResult === 'failed' ? 'danger' : 'success'}>{a.executionResult}</Badge>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777777]">Immutable Security & Audit Logs (Append-Only)</h3>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search action or ref..." className="rounded-lg border border-[#E8E8E5] px-2.5 py-1 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]" />
          </div>
          <div className="space-y-2 text-xs">
            {auditLogs.map((a) => (
              <div key={a._id} className="rounded-lg border border-[#E8E8E5] dark:border-[#26282D] p-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={a.result === 'DENIED' || a.result === 'FAILED' ? 'danger' : 'success'}>{a.result}</Badge>
                    <span className="font-semibold">{a.action}</span>
                    <span className="text-[#777777]">({a.recordType} {a.recordRef})</span>
                  </div>
                  <span className="text-[11px] text-[#777777]">{dayjs(a.timestamp).format('DD MMM YYYY HH:mm:ss')}</span>
                </div>
                <div className="mt-1 text-[11px] text-[#777777]">
                  Actor: {a.actorId?.fullName || 'Anonymous'} ({a.actorId?.role || 'N/A'}) · Module: {a.module}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
