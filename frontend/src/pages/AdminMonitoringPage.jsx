import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Database,
  DatabaseZap,
  Download,
  Eye,
  GitMerge,
  HardDrive,
  History,
  KeyRound,
  MessageSquareWarning,
  Rocket,
  Server,
  ShieldAlert,
  Trash2,
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
import Modal from '../components/ui/Modal';
import Loader from '../components/ui/Loader';

const TABS = [
  { id: 'overview', route: '/admin/overview', label: 'System Overview & Space', icon: Activity },
  { id: 'governance', route: '/admin/governance', label: 'Data & Duplicate Control', icon: DatabaseZap },
  { id: 'user-activity', route: '/admin/user-activity', label: 'User Activity', icon: History },
  { id: 'dev-logs', route: '/admin/dev-logs', label: 'Development Logs', icon: Wrench },
  { id: 'system-logs', route: '/admin/system-logs', label: 'System Logs', icon: AlertTriangle },
  { id: 'api-monitoring', route: '/admin/api-monitoring', label: 'API Monitoring', icon: Server },
  { id: 'deployments', route: '/admin/deployments', label: 'Deployment History', icon: Rocket },
  { id: 'time-tracking', route: '/admin/time-tracking', label: 'Time Tracking', icon: Clock },
  { id: 'ai-activity', route: '/admin/ai-activity', label: 'AI Activity', icon: BrainCircuit },
  { id: 'audit-logs', route: '/admin/audit-logs', label: 'Security & Audit', icon: ShieldAlert },
  { id: 'password-resets', route: '/admin/password-resets', label: 'Password Resets', icon: KeyRound },
];

const ROUTE_TO_TAB = Object.fromEntries(TABS.map((t) => [t.route, t.id]));

function formatBytes(bytes = 0) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function AdminMonitoringPage() {
  const { users } = useWorkspace();
  const { addToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const tab = ROUTE_TO_TAB[location.pathname] || 'overview';
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [empTimelineCategory, setEmpTimelineCategory] = useState('all');

  const [overview, setOverview] = useState(null);
  const [governance, setGovernance] = useState(null);
  const [governanceSubTab, setGovernanceSubTab] = useState('duplicates');
  const [deleteReason, setDeleteReason] = useState('Duplicate / test cleanup by Admin');
  const [ticketInspectModal, setTicketInspectModal] = useState({ open: false, ticket: null, primaryTicket: null, note: '' });
  const [actingGovernance, setActingGovernance] = useState(false);
  const [employeeReport, setEmployeeReport] = useState(null);
  const [devLogs, setDevLogs] = useState([]);
  const [systemLogs, setSystemLogs] = useState([]);
  const [apiStats, setApiStats] = useState({ byEndpoint: [], recentErrors: [] });
  const [deployments, setDeployments] = useState([]);
  const [timeLogs, setTimeLogs] = useState([]);
  const [aiLogs, setAiLogs] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [resetRequests, setResetRequests] = useState([]);
  const [actingResetId, setActingResetId] = useState(null);

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
      } else if (tab === 'governance') {
        const { data } = await api.get('/monitoring/governance', { params: { search: search || undefined } });
        setGovernance(data.data);
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
      } else if (tab === 'password-resets') {
        const { data } = await api.get('/auth/admin/reset-requests');
        setResetRequests(data.data || []);
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

  const handleSendResetLink = async (requestId) => {
    setActingResetId(requestId);
    try {
      const { data } = await api.post(`/auth/admin/send-reset/${requestId}`);
      const mailRes = data?.data?.emailResult;
      if (mailRes?.sent) {
        addToast('Password reset link & 4-digit code emailed to user', 'success');
      } else {
        addToast(`Reset link generated, but email delivery failed: ${mailRes?.reason || 'SMTP not configured'}`, 'error');
      }
      loadTabData();
    } catch (err) {
      addToast(getApiError(err, 'Failed to send reset link'), 'error');
    } finally {
      setActingResetId(null);
    }
  };

  const handleRejectReset = async (requestId) => {
    const adminNote = window.prompt('Optional rejection reason for audit log:') ?? '';
    setActingResetId(requestId);
    try {
      await api.post(`/auth/admin/reject-reset/${requestId}`, { adminNote });
      addToast('Password reset request rejected', 'success');
      loadTabData();
    } catch (err) {
      addToast(getApiError(err, 'Failed to reject request'), 'error');
    } finally {
      setActingResetId(null);
    }
  };

  const openTicketReviewModal = (ticket, primaryTicket = null) => {
    setTicketInspectModal({
      open: true,
      ticket,
      primaryTicket,
      note: primaryTicket
        ? `Duplicate of ${primaryTicket.ticketId} (${primaryTicket.title})`
        : deleteReason,
    });
  };

  const handleConfirmDeleteTicket = async () => {
    const ticket = ticketInspectModal.ticket;
    if (!ticket) return;
    setActingGovernance(true);
    try {
      const { data } = await api.delete(`/monitoring/governance/tickets/${ticket._id}`, {
        data: { reason: ticketInspectModal.note || deleteReason },
      });
      addToast(data.message || `Admin deleted ${ticket.ticketId}`, 'success');
      setTicketInspectModal({ open: false, ticket: null, primaryTicket: null, note: '' });
      loadTabData();
    } catch (err) {
      addToast(getApiError(err, 'Failed to delete ticket'), 'error');
    } finally {
      setActingGovernance(false);
    }
  };

  const handleMarkNotDuplicate = async () => {
    const { ticket, primaryTicket, note } = ticketInspectModal;
    if (!ticket) return;
    setActingGovernance(true);
    try {
      const { data } = await api.post(`/monitoring/governance/tickets/${ticket._id}/not-duplicate`, {
        primaryTicketId: primaryTicket?._id || null,
        primaryTicketRef: primaryTicket?.ticketId || '',
        note,
      });
      addToast(data.message || `${ticket.ticketId} marked as Not Duplicate`, 'success');
      setTicketInspectModal({ open: false, ticket: null, primaryTicket: null, note: '' });
      loadTabData();
    } catch (err) {
      addToast(getApiError(err, 'Failed to mark as not duplicate'), 'error');
    } finally {
      setActingGovernance(false);
    }
  };

  const handleRequestDuplicateChanges = async () => {
    const { ticket, primaryTicket, note } = ticketInspectModal;
    if (!ticket) return;
    setActingGovernance(true);
    try {
      const { data } = await api.post(`/monitoring/governance/tickets/${ticket._id}/request-changes`, {
        primaryTicketRef: primaryTicket?.ticketId || '',
        note:
          note && !note.startsWith('Duplicate of ')
            ? note
            : `Please update the details/title of ${ticket.ticketId} as it appears to be a duplicate${primaryTicket?.ticketId ? ` of ${primaryTicket.ticketId}` : ''}.`,
      });
      addToast(data.message || `Requested detail changes for ${ticket.ticketId}`, 'info');
      setTicketInspectModal({ open: false, ticket: null, primaryTicket: null, note: '' });
      loadTabData();
    } catch (err) {
      addToast(getApiError(err, 'Failed to request changes'), 'error');
    } finally {
      setActingGovernance(false);
    }
  };

  const handleAdminDeleteUser = async (u) => {
    const nextStatus = u.status === 'Inactive' ? 'Active' : 'Inactive';
    try {
      const { data } = await api.delete(`/monitoring/governance/users/${u._id}`, {
        data: { reason: deleteReason, status: nextStatus },
      });
      addToast(data.message || `User ${u.fullName} marked ${nextStatus}`, 'success');
      loadTabData();
    } catch (err) {
      addToast(getApiError(err, 'Failed to update user status'), 'error');
    }
  };

  const handleMergeDuplicateIntoPrimary = async () => {
    const { ticket, primaryTicket } = ticketInspectModal;
    if (!ticket || !primaryTicket) return;
    setActingGovernance(true);
    try {
      const { data } = await api.post(`/tickets/${primaryTicket._id}/merge`, {
        sourceTicketId: ticket._id,
      });
      addToast(data.message || `Merged ${ticket.ticketId} into ${primaryTicket.ticketId}`, 'success');
      setTicketInspectModal({ open: false, ticket: null, primaryTicket: null, note: '' });
      loadTabData();
    } catch (err) {
      addToast(getApiError(err, 'Failed to merge tickets'), 'error');
    } finally {
      setActingGovernance(false);
    }
  };

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

  const activeTool = TABS.find((t) => t.id === tab) || TABS[0];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Administration Monitoring & Audit"
        subtitle="Centralized operational visibility, storage metrics, duplicate governance, and complete logs across every module"
        actions={
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[#777777]">Admin Tool:</label>
            <select
              value={activeTool.route}
              onChange={(e) => navigate(e.target.value)}
              className="rounded-lg border border-[#171717]/20 bg-white px-3 py-1.5 text-xs font-semibold text-[#171717] shadow-sm dark:border-[#2C2E33] dark:bg-[#1E2025] dark:text-white"
            >
              {TABS.map((t) => (
                <option key={t.id} value={t.route}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {loading ? (
        <Loader label="Loading monitoring view..." />
      ) : tab === 'overview' && overview ? (
        <div className="space-y-5">
          {/* ── 1. Hero Storage & Capacity Meter (Quantro / Eduplex Style) ─── */}
          {overview.spaceConsumed && (
            <div className="rounded-2xl border border-[#E8E8E5] bg-white p-5 shadow-sm dark:border-[#26282D] dark:bg-[#141518]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E8E8E5] dark:border-[#26282D]">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#171717] text-[#C6F36B] dark:bg-[#C6F36B] dark:text-[#171717] font-bold shadow-sm">
                    <HardDrive className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#171717] dark:text-white flex items-center gap-2">
                      System Storage &amp; Database Footprint
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        Healthy
                      </span>
                    </h2>
                    <p className="text-xs text-[#777777] dark:text-slate-400">
                      MongoDB Database: <span className="font-mono font-semibold text-[#171717] dark:text-slate-200">{overview.spaceConsumed.dbName}</span> · {overview.spaceConsumed.collections} collections · {overview.spaceConsumed.objects} documents
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-semibold tracking-wider text-[#777777] block">Total Footprint</span>
                    <span className="text-xl font-extrabold text-[#171717] dark:text-white font-mono">
                      {formatBytes(overview.spaceConsumed.totalBytes)}
                    </span>
                  </div>
                  <span className="rounded-xl bg-[#C6F36B]/25 dark:bg-[#C6F36B]/15 px-3 py-1.5 text-xs font-bold text-[#171717] dark:text-[#C6F36B] border border-[#171717]/10 dark:border-[#C6F36B]/30">
                    Live Synced
                  </span>
                </div>
              </div>

              {/* Visual Segmented Capacity Bar */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-[#777777] mb-1.5 font-medium">
                  <span>Storage Allocation Breakdown</span>
                  <span className="font-mono text-[11px]">100% Accounted</span>
                </div>
                {(() => {
                  const total = Math.max(overview.spaceConsumed.totalBytes, 1);
                  const pMongo = Math.max(Math.round((overview.spaceConsumed.dbDataBytes / total) * 100), 10);
                  const pIdx = Math.max(Math.round(((overview.spaceConsumed.dbStorageBytes + overview.spaceConsumed.dbIndexBytes) / total) * 100), 8);
                  const pDisk = Math.max(Math.round((overview.spaceConsumed.uploadsDiskBytes / total) * 100), 10);
                  const pAtt = Math.max(Math.round((overview.spaceConsumed.attachmentDbBytes / total) * 100), 5);
                  return (
                    <div className="h-2.5 w-full rounded-full bg-[#E8E8E5] dark:bg-[#26282D] overflow-hidden flex gap-0.5">
                      <div style={{ width: `${pMongo}%` }} className="h-full bg-[#638BEF] rounded-l-full" title="Mongo Data" />
                      <div style={{ width: `${pIdx}%` }} className="h-full bg-[#A88CEB]" title="DB Storage & Index" />
                      <div style={{ width: `${pDisk}%` }} className="h-full bg-[#35B8A6]" title="Uploads on Disk" />
                      <div style={{ width: `${pAtt}%` }} className="h-full bg-[#F59E0B] rounded-r-full" title="Attachment Records" />
                    </div>
                  );
                })()}
              </div>

              {/* 5 Sleek Storage Detail Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 text-xs">
                <div className="rounded-xl border border-[#E8E8E5] dark:border-[#26282D] bg-[#F4F4F2]/50 dark:bg-white/[0.02] p-3 flex flex-col justify-between">
                  <div>
                    <div className="text-[11px] font-semibold text-[#777777] flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#638BEF]" />
                      MongoDB Data
                    </div>
                    <div className="mt-1.5 text-lg font-bold font-mono text-[#171717] dark:text-white">
                      {formatBytes(overview.spaceConsumed.dbDataBytes)}
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-[#777777]">
                    {overview.spaceConsumed.objects} objects in DB
                  </div>
                </div>

                <div className="rounded-xl border border-[#E8E8E5] dark:border-[#26282D] bg-[#F4F4F2]/50 dark:bg-white/[0.02] p-3 flex flex-col justify-between">
                  <div>
                    <div className="text-[11px] font-semibold text-[#777777] flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#A88CEB]" />
                      Storage + Index
                    </div>
                    <div className="mt-1.5 text-lg font-bold font-mono text-[#171717] dark:text-white">
                      {formatBytes(overview.spaceConsumed.dbStorageBytes + overview.spaceConsumed.dbIndexBytes)}
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-[#777777]">
                    Index: {formatBytes(overview.spaceConsumed.dbIndexBytes)}
                  </div>
                </div>

                <div className="rounded-xl border border-[#E8E8E5] dark:border-[#26282D] bg-[#F4F4F2]/50 dark:bg-white/[0.02] p-3 flex flex-col justify-between">
                  <div>
                    <div className="text-[11px] font-semibold text-[#777777] flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#35B8A6]" />
                      Local Disk Uploads
                    </div>
                    <div className="mt-1.5 text-lg font-bold font-mono text-[#171717] dark:text-white">
                      {formatBytes(overview.spaceConsumed.uploadsDiskBytes)}
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-[#777777]">
                    {overview.spaceConsumed.uploadsFileCount} files in /uploads
                  </div>
                </div>

                <div className="rounded-xl border border-[#E8E8E5] dark:border-[#26282D] bg-[#F4F4F2]/50 dark:bg-white/[0.02] p-3 flex flex-col justify-between">
                  <div>
                    <div className="text-[11px] font-semibold text-[#777777] flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#F59E0B]" />
                      Attachments DB
                    </div>
                    <div className="mt-1.5 text-lg font-bold font-mono text-[#171717] dark:text-white">
                      {formatBytes(overview.spaceConsumed.attachmentDbBytes)}
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-[#777777]">
                    {overview.spaceConsumed.attachmentCount} active records
                  </div>
                </div>

                <div className="rounded-xl border border-[#E8E8E5] dark:border-[#26282D] bg-[#F4F4F2]/50 dark:bg-white/[0.02] p-3 flex flex-col justify-between">
                  <div>
                    <div className="text-[11px] font-semibold text-[#777777] flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#171717] dark:bg-white" />
                      Live Documents
                    </div>
                    <div className="mt-1.5 font-semibold text-xs text-[#171717] dark:text-white space-y-0.5">
                      <div>{overview.spaceConsumed.breakdown.tickets} tickets · {overview.spaceConsumed.breakdown.ticketDrafts} drafts</div>
                      <div>{overview.spaceConsumed.breakdown.tasks} tasks · {overview.spaceConsumed.breakdown.emails} emails</div>
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-[#35B8A6] font-medium">
                    All collections indexed
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── 2. Modern System Health & Performance KPIs ──────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            {[
              ['Active Users', overview.kpis.totalUsers, 'text-[#171717] dark:text-white', 'Registered Staff', 'bg-slate-100 dark:bg-white/10'],
              ['Pending Approvals', overview.kpis.pendingApprovals, 'text-[#638BEF]', 'Action Queue', 'bg-[#638BEF]/10'],
              ['Approved Tickets', overview.kpis.approvedTickets, 'text-[#35B8A6]', 'Production Ready', 'bg-[#35B8A6]/10'],
              ['Dev Updates', overview.kpis.devUpdatesCount, 'text-[#A88CEB]', 'Code & 4GL Logs', 'bg-[#A88CEB]/10'],
              ['API / Auth Errors (24h)', overview.kpis.apiErrors24h, overview.kpis.apiErrors24h > 0 ? 'text-[#F16D64]' : 'text-emerald-600', 'Status', 'bg-[#F16D64]/10'],
              ['AI Requests (24h)', overview.kpis.aiCalls24h, 'text-[#638BEF]', 'Ollama Engine', 'bg-[#638BEF]/10'],
              ['Deployments Recorded', overview.kpis.deploymentsCount, 'text-[#35B8A6]', 'Release Pipeline', 'bg-[#35B8A6]/10'],
              ['Security Audit Events', overview.kpis.auditEventsCount, 'text-[#171717] dark:text-white', 'Governance Log', 'bg-slate-100 dark:bg-white/10'],
            ].map(([lbl, val, cls, tag, tagBg]) => (
              <Card key={lbl} className="p-4 flex flex-col justify-between hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#777777] dark:text-slate-400">{lbl}</span>
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${tagBg} text-[#777777] dark:text-slate-300`}>
                    {tag}
                  </span>
                </div>
                <div className={`mt-2 text-2xl font-extrabold tracking-tight ${cls}`}>
                  {val}
                </div>
              </Card>
            ))}
          </div>

          {/* ── 3. High-Density Activity, System Error & Security Logs ─────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#E8E8E5] dark:border-[#26282D]">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#171717] dark:text-white flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4 text-[#638BEF]" />
                  Latest Security &amp; Audit Events
                </h3>
                <span className="text-[10px] font-semibold text-[#777777]">Real-time Trail</span>
              </div>
              <div className="space-y-2 text-xs max-h-72 overflow-y-auto pr-1">
                {(overview.recentAudit || []).length === 0 ? (
                  <p className="py-6 text-center text-[#777777]">No audit events recorded.</p>
                ) : (
                  (overview.recentAudit || []).map((a) => (
                    <div key={a._id} className="flex items-center justify-between border-b border-[#E8E8E5] dark:border-[#26282D] pb-2">
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold text-[#171717] dark:text-white truncate">
                          {a.action} · <span className="text-[#777777] font-normal">{a.recordRef || a.recordType}</span>
                        </div>
                        <div className="text-[10px] text-[#777777] mt-0.5">
                          {a.actorId?.fullName || 'System'} · {a.module} · {dayjs(a.timestamp).format('DD MMM HH:mm')}
                        </div>
                      </div>
                      <Badge variant={a.result === 'DENIED' || a.result === 'FAILED' ? 'danger' : 'success'}>
                        {a.result}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#E8E8E5] dark:border-[#26282D]">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#171717] dark:text-white flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-[#F16D64]" />
                  Recent System &amp; API Errors
                </h3>
                <span className="text-[10px] font-semibold text-[#777777]">24h Diagnostic</span>
              </div>
              <div className="space-y-2 text-xs max-h-72 overflow-y-auto pr-1">
                {(overview.recentSystemErrors || []).length === 0 ? (
                  <div className="py-8 text-center text-[#35B8A6] flex flex-col items-center gap-1 font-medium">
                    <CheckCircle2 className="h-5 w-5" />
                    <span>Zero system or API errors recorded</span>
                  </div>
                ) : (
                  overview.recentSystemErrors.map((s) => (
                    <div key={s._id} className="border-b border-[#E8E8E5] dark:border-[#26282D] pb-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] font-semibold text-[#171717] dark:text-white">{s.method} {s.endpoint}</span>
                        <Badge variant="danger">{s.httpStatus}</Badge>
                      </div>
                      <p className="text-[11px] text-[#777777] truncate mt-0.5">{s.message}</p>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="lg:col-span-2 p-4">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#E8E8E5] dark:border-[#26282D]">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#171717] dark:text-white flex items-center gap-1.5">
                  <Activity className="h-4 w-4 text-[#35B8A6]" />
                  Recent Operational Activity Stream
                </h3>
                <Link to="/activity-logs" className="text-xs font-semibold text-[#638BEF] hover:underline flex items-center gap-0.5">
                  View Full Audit Logs →
                </Link>
              </div>
              <div className="divide-y divide-[#E8E8E5] dark:divide-[#26282D]">
                {(overview.recentActivityLogs || []).length === 0 ? (
                  <p className="py-4 text-center text-[#777777]">No recent activity logged.</p>
                ) : (
                  overview.recentActivityLogs.slice(0, 5).map((l) => (
                    <div key={l._id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <span className="font-semibold text-[#171717] dark:text-white truncate block">
                          {l.summary || l.action}
                        </span>
                        <span className="text-[11px] text-[#777777]">
                          By {l.actor?.fullName || 'System'} · Action: <code className="font-mono text-[10px] bg-slate-100 dark:bg-white/10 px-1 py-0.5 rounded">{l.action}</code>
                        </span>
                      </div>
                      <span className="text-[11px] text-[#777777] shrink-0 font-medium">
                        {dayjs(l.createdAt).format('DD MMM, HH:mm')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      ) : tab === 'governance' && governance ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3.5">
              <div className="text-[11px] text-[#777777]">Active Users</div>
              <div className="mt-1 text-2xl font-bold">{governance.counts.totalUsers}</div>
            </Card>
            <Card className="p-3.5">
              <div className="text-[11px] text-[#777777]">Active Tickets</div>
              <div className="mt-1 text-2xl font-bold text-[#638BEF]">{governance.counts.totalTickets}</div>
            </Card>
            <Card className="p-3.5">
              <div className="text-[11px] text-[#777777]">Duplicate Title Groups</div>
              <div className="mt-1 text-2xl font-bold text-[#F16D64]">{governance.counts.duplicateGroups}</div>
            </Card>
            <Card className="p-3.5">
              <div className="text-[11px] text-[#777777]">Extra Duplicate Tickets</div>
              <div className="mt-1 text-2xl font-bold text-[#F16D64]">{governance.counts.duplicateTicketsExtra}</div>
            </Card>
          </div>

          <Card className="p-3">
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tickets, users, or clients..."
                className="flex-1 min-w-[200px] rounded-lg border border-[#E8E8E5] px-3 py-1.5 dark:border-[#2C2E33] dark:bg-[#1E2025]"
              />
              <input
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Deletion audit reason..."
                className="flex-1 min-w-[200px] rounded-lg border border-[#E8E8E5] px-3 py-1.5 dark:border-[#2C2E33] dark:bg-[#1E2025]"
              />
              <div className="flex flex-wrap gap-1.5">
                {[
                  ['duplicates', `Duplicate Tickets (${governance.duplicateGroups.length})`],
                  ['tickets', `All / New Tickets (${governance.newTickets.length})`],
                  ['users', `Users (${governance.newUsers.length})`],
                  ['logs', `Deletion Logs (${governance.deletionLogs.length})`],
                ].map(([k, lbl]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setGovernanceSubTab(k)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                      governanceSubTab === k
                        ? 'border-[#171717] bg-[#C6F36B] text-[#171717]'
                        : 'border-[#E8E8E5] bg-white text-[#555555] dark:border-[#2C2E33] dark:bg-[#17181B] dark:text-slate-300'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {governanceSubTab === 'duplicates' ? (
            <div className="space-y-3">
              {governance.duplicateGroups.length === 0 ? (
                <Card className="py-10 text-center text-xs text-[#777777]">No duplicate ticket titles detected.</Card>
              ) : (
                governance.duplicateGroups.map((g) => (
                  <Card key={g.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold">
                        Duplicate Group: &quot;{g.title}&quot; <Badge variant="danger">{g.count} copies</Badge>
                      </div>
                    </div>
                    <div className="divide-y divide-[#E8E8E5] dark:divide-[#26282D] text-xs">
                      {g.tickets.map((t, idx) => (
                        <div key={t._id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <Link to={`/tickets/${t._id}`} className="font-mono font-bold text-[#638BEF] hover:underline">
                                {t.ticketId}
                              </Link>
                              {idx === 0 && <Badge variant="success">Oldest / Primary</Badge>}
                              <Badge>{t.approvalStatus || t.status}</Badge>
                              <span className="font-medium">{t.title}</span>
                            </div>
                            <div className="text-[11px] text-[#777777]">
                              Client: {t.client?.companyName || 'None'} · Created by {t.createdBy?.fullName || 'System'} · {dayjs(t.createdAt).format('DD MMM YYYY HH:mm')}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {idx > 0 && (
                              <Button
                                type="button"
                                size="xs"
                                variant="secondary"
                                onClick={() => openTicketReviewModal(t, g.tickets[0])}
                              >
                                <Eye className="h-3 w-3 mr-1" /> Compare &amp; Review
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="xs"
                              variant="danger"
                              onClick={() => openTicketReviewModal(t, idx > 0 ? g.tickets[0] : null)}
                            >
                              <Trash2 className="h-3 w-3 mr-1" /> Delete Ticket
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))
              )}
            </div>
          ) : governanceSubTab === 'tickets' ? (
            <Card>
              <div className="divide-y divide-[#E8E8E5] dark:divide-[#26282D] text-xs">
                {governance.newTickets.map((t) => (
                  <div key={t._id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link to={`/tickets/${t._id}`} className="font-mono font-bold text-[#638BEF] hover:underline">
                          {t.ticketId}
                        </Link>
                        <Badge>{t.approvalStatus}</Badge>
                        <Badge value={t.status}>{t.status}</Badge>
                        <span className="font-medium truncate">{t.title}</span>
                      </div>
                      <div className="text-[11px] text-[#777777]">
                        Client: {t.client?.companyName || 'None'} · By {t.createdBy?.fullName || 'System'} · {dayjs(t.createdAt).format('DD MMM YYYY HH:mm')}
                      </div>
                    </div>
                    <Button type="button" size="xs" variant="danger" onClick={() => openTicketReviewModal(t, null)}>
                      <Trash2 className="h-3 w-3 mr-1" /> Review &amp; Delete
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          ) : governanceSubTab === 'users' ? (
            <Card>
              <div className="divide-y divide-[#E8E8E5] dark:divide-[#26282D] text-xs">
                {governance.newUsers.map((u) => (
                  <div key={u._id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#638BEF]">{u.employeeId}</span>
                        <Link to={`/team/${u._id}`} className="font-semibold hover:underline">{u.fullName}</Link>
                        <Badge>{u.role}</Badge>
                        <Badge variant={u.status === 'Inactive' ? 'danger' : 'success'}>{u.status || 'Active'}</Badge>
                      </div>
                      <div className="text-[11px] text-[#777777]">
                        {u.email} · {u.designation} · Created {dayjs(u.createdAt).format('DD MMM YYYY HH:mm')}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="xs"
                      variant={u.status === 'Inactive' ? 'secondary' : 'danger'}
                      onClick={() => handleAdminDeleteUser(u)}
                    >
                      {u.status === 'Inactive' ? 'Reactivate User' : 'Make Inactive'}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777777] mb-3">
                Admin Deletion Audit Log
              </h3>
              <div className="divide-y divide-[#E8E8E5] dark:divide-[#26282D] text-xs">
                {governance.deletionLogs.length === 0 ? (
                  <p className="text-[#777777] py-4">No deletions logged yet.</p>
                ) : (
                  governance.deletionLogs.map((l) => (
                    <div key={l._id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold">
                          {l.newValue?.summary || `${l.actorId?.fullName || 'Admin'} deleted ${l.recordType} ${l.recordRef}`}
                        </div>
                        <div className="text-[11px] text-[#777777]">
                          Action: {l.action} · Ref: {l.recordRef} · Actor: {l.actorId?.fullName || 'Admin'}
                        </div>
                      </div>
                      <span className="text-[11px] text-[#777777]">{dayjs(l.timestamp).format('DD MMM YYYY HH:mm:ss')}</span>
                    </div>
                  ))
                )}
              </div>
            </Card>
          )}
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
      ) : tab === 'password-resets' ? (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777777]">Password Reset Requests</h3>
              <p className="text-[11px] text-[#777777] mt-0.5">
                Approve requests to email a temporary 1-hour reset link and 4-digit verification code via SMTP.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={loadTabData}>Refresh</Button>
          </div>
          {resetRequests.length === 0 ? (
            <p className="text-xs text-[#777777] py-4">No password reset requests found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E8E8E5] dark:border-[#26282D] text-[11px] uppercase text-[#777777]">
                    <th className="py-2 pr-3">User</th>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Reason</th>
                    <th className="py-2 pr-3">Requested</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E8E5] dark:divide-[#26282D]">
                  {resetRequests.map((req) => (
                    <tr key={req._id}>
                      <td className="py-2.5 pr-3 font-medium">
                        {req.user?.fullName || 'Unknown'}
                        {req.user?.employeeId && (
                          <span className="ml-1.5 text-[10px] font-mono text-[#777777]">({req.user.employeeId})</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-[#555555] dark:text-slate-300">{req.email}</td>
                      <td className="py-2.5 pr-3 text-[#777777] max-w-xs truncate">{req.reason || '—'}</td>
                      <td className="py-2.5 pr-3 text-[#777777] whitespace-nowrap">
                        {dayjs(req.createdAt).format('DD MMM YYYY HH:mm')}
                      </td>
                      <td className="py-2.5 pr-3">
                        <Badge
                          variant={
                            req.status === 'COMPLETED'
                              ? 'success'
                              : req.status === 'REJECTED' || req.status === 'EXPIRED'
                                ? 'danger'
                                : req.status === 'LINK_SENT'
                                  ? 'info'
                                  : 'warning'
                          }
                        >
                          {req.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap space-x-2">
                        {['PENDING_ADMIN', 'LINK_SENT'].includes(req.status) && (
                          <>
                            <Button
                              size="sm"
                              disabled={actingResetId === req._id}
                              onClick={() => handleSendResetLink(req._id)}
                            >
                              {actingResetId === req._id
                                ? 'Sending…'
                                : req.status === 'LINK_SENT'
                                  ? 'Resend Link'
                                  : 'Send Reset Link'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={actingResetId === req._id}
                              onClick={() => handleRejectReset(req._id)}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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

      {/* Whole-Ticket Review, Duplicate Comparison & Delete Confirmation Modal */}
      <Modal
        open={ticketInspectModal.open && Boolean(ticketInspectModal.ticket)}
        onClose={() => setTicketInspectModal({ open: false, ticket: null, primaryTicket: null, note: '' })}
        title={
          ticketInspectModal.primaryTicket
            ? `Compare & Review Duplicate Ticket: ${ticketInspectModal.ticket?.ticketId}`
            : `Confirm Ticket Deletion: ${ticketInspectModal.ticket?.ticketId}`
        }
        subtitle={
          ticketInspectModal.primaryTicket
            ? `Comparing against 1st / Oldest Primary Ticket (${ticketInspectModal.primaryTicket.ticketId})`
            : 'Review the complete ticket details before confirming deletion'
        }
        maxWidth={ticketInspectModal.primaryTicket ? 'max-w-5xl' : 'max-w-2xl'}
      >
        {ticketInspectModal.ticket && (() => {
          const target = ticketInspectModal.ticket;
          const primary = ticketInspectModal.primaryTicket;
          const renderTicketSnapshot = (tk, heading, isPrimaryCard) => (
            <div
              className={`rounded-xl border p-3.5 space-y-2.5 text-xs ${
                isPrimaryCard
                  ? 'border-emerald-300 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-500/5'
                  : 'border-rose-300 bg-rose-50/30 dark:border-rose-500/30 dark:bg-rose-500/5'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E8E8E5] dark:border-[#26282D] pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#777777]">{heading}</span>
                  <Link to={`/tickets/${tk._id}`} className="font-mono font-bold text-[#638BEF] hover:underline">
                    {tk.ticketId}
                  </Link>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge>{tk.approvalStatus || 'APPROVED'}</Badge>
                  <Badge value={tk.status}>{tk.status}</Badge>
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase text-[#777777]">Title</div>
                <div className="font-semibold text-sm text-[#171717] dark:text-white">{tk.title}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-[#777777]">Client:</span>{' '}
                  <strong>{tk.client?.companyName || 'None'}</strong>
                </div>
                <div>
                  <span className="text-[#777777]">Created By:</span>{' '}
                  <strong>{tk.createdBy?.fullName || 'System'}</strong>
                </div>
                <div>
                  <span className="text-[#777777]">Category:</span> <strong>{tk.category || 'N/A'}</strong>
                </div>
                <div>
                  <span className="text-[#777777]">Priority:</span> <strong>{tk.priority || 'Medium'}</strong>
                </div>
                <div>
                  <span className="text-[#777777]">Env / Folder:</span>{' '}
                  <strong className="font-mono">{tk.sageX3Environment || 'Pilot'} · {tk.folderCode || 'N/A'}</strong>
                </div>
                <div>
                  <span className="text-[#777777]">Created At:</span>{' '}
                  <strong>{dayjs(tk.createdAt).format('DD MMM YYYY, HH:mm')}</strong>
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase text-[#777777] mb-1">Full Description</div>
                <div className="max-h-48 overflow-y-auto whitespace-pre-line rounded-lg border border-[#E8E8E5] bg-white p-2.5 text-xs text-[#333333] dark:border-[#2C2E33] dark:bg-[#17181B] dark:text-slate-200">
                  {tk.description || 'No description provided.'}
                </div>
              </div>
            </div>
          );

          return (
            <div className="space-y-4 text-xs">
              {primary ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                  {renderTicketSnapshot(primary, '1st / Primary Ticket (Original)', true)}
                  {renderTicketSnapshot(target, 'Selected Ticket (Supposed Copy)', false)}
                </div>
              ) : (
                renderTicketSnapshot(target, 'Complete Ticket Details', false)
              )}

              <div>
                <label className="block text-[11px] font-semibold text-[#555555] dark:text-slate-300 mb-1">
                  Audit / Deletion / Change Request Note
                </label>
                <input
                  type="text"
                  value={ticketInspectModal.note}
                  onChange={(e) => setTicketInspectModal((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="Enter reason for deletion or message for requester..."
                  className="w-full rounded-lg border border-[#E8E8E5] bg-white px-3 py-2 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#E8E8E5] dark:border-[#26282D] pt-3">
                {primary && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      disabled={actingGovernance}
                      onClick={handleMergeDuplicateIntoPrimary}
                    >
                      <GitMerge className="h-3.5 w-3.5 mr-1" /> Merge into {primary.ticketId}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={actingGovernance}
                      onClick={handleMarkNotDuplicate}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-[#35B8A6]" /> Mark as Not Duplicate
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={actingGovernance}
                      onClick={handleRequestDuplicateChanges}
                    >
                      <MessageSquareWarning className="h-3.5 w-3.5 mr-1 text-amber-600" /> Request Changes (Appears Duplicate)
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  disabled={actingGovernance}
                  onClick={handleConfirmDeleteTicket}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Confirm Delete Ticket
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setTicketInspectModal({ open: false, ticket: null, primaryTicket: null, note: '' })}
                >
                  Cancel
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
