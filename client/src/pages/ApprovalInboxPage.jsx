import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  XCircle,
  MessageSquareWarning,
  FileText,
  Sparkles,
  ExternalLink,
  Search,
} from 'lucide-react';
import dayjs from 'dayjs';
import api, { getApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { useToast } from '../context/ToastContext';
import { TICKET_CATEGORIES, PRIORITIES, DEPLOYMENT_ENVIRONMENTS } from '../utils/constants';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Avatar from '../components/ui/Avatar';
import Loader from '../components/ui/Loader';
import Modal from '../components/ui/Modal';

const FOLDERS = [
  { id: 'Pending TL Approval', label: 'Pending TL Approval' },
  { id: 'Incoming', label: 'Incoming Submissions' },
  { id: 'AI Processing', label: 'AI Processing' },
  { id: 'Changes Requested', label: 'Changes Requested' },
  { id: 'Approved', label: 'Approved Tickets' },
  { id: 'Rejected', label: 'Rejected Submissions' },
  { id: 'All', label: 'All Submissions' },
];

export default function ApprovalInboxPage() {
  const { user, isManager } = useAuth();
  const { clients, users, openTicketDrawer, lastSync, notifyLocalMutation } = useWorkspace();
  const { addToast } = useToast();
  const [searchParams] = useSearchParams();

  const [folder, setFolder] = useState(searchParams.get('status') || 'Pending TL Approval');
  const [activeTab, setActiveTab] = useState('drafts');
  const [clientFilter, setClientFilter] = useState('');
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState([]);
  const [counts, setCounts] = useState({}); // Always reflects ALL-status aggregate
  const [pendingTickets, setPendingTickets] = useState([]);
  const [actionRequests, setActionRequests] = useState([]);
  const [actionCounts, setActionCounts] = useState({});
  const [ticketHistoryModal, setTicketHistoryModal] = useState({ open: false, title: '', rows: [] });
  const [loading, setLoading] = useState(true);

  const [selectedDraft, setSelectedDraft] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editClientId, setEditClientId] = useState('');
  const [editFields, setEditFields] = useState({});
  const [editTasks, setEditTasks] = useState([]);
  const [assignDevs, setAssignDevs] = useState([]);
  const [rejectModal, setRejectModal] = useState({ open: false, reason: '' });
  const [changesModal, setChangesModal] = useState({ open: false, comments: '' });
  const [acting, setActing] = useState(false);

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch filtered drafts (what appears in the grid) AND global counts in parallel
      const [filteredRes, allCountsRes] = await Promise.all([
        api.get('/ai/drafts', {
          params: {
            status: folder,
            client: clientFilter || undefined,
            search: search || undefined,
          },
        }),
        // Always fetch global counts (not filtered by folder) for accurate KPI cards & folder pills
        api.get('/ai/drafts', { params: { status: 'All' } }),
      ]);
      setDrafts(filteredRes.data.data.drafts || []);
      // Use counts from the unfiltered (All) request so KPI/pills always show real totals
      setCounts(allCountsRes.data.data.counts || {});
    } catch (err) {
      addToast(getApiError(err, 'Failed to load approval queue'), 'error');
    } finally {
      setLoading(false);
    }
  }, [folder, clientFilter, search]);

  const loadActionRequests = useCallback(async () => {
    try {
      const { data } = await api.get('/ai/action-requests', {
        params: { status: folder === 'All' ? 'All' : folder },
      });
      setActionRequests(data.data.requests || []);
      setActionCounts(data.data.counts || {});
    } catch {
      // ignore if endpoint not ready
    }
  }, [folder]);

  const loadPendingTickets = useCallback(async () => {
    try {
      const { data } = await api.get('/tickets/pending-approval', { params: { status: 'PENDING_APPROVAL' } });
      setPendingTickets(data.data || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadDrafts();
    loadActionRequests();
    loadPendingTickets();
  }, [loadDrafts, loadActionRequests, loadPendingTickets, lastSync.ticket]);

  const handleApprovePendingTicket = async (id) => {
    setActing(true);
    try {
      const { data } = await api.post(`/tickets/${id}/approve`, {});
      addToast(data.message || 'Ticket approved into main queue', 'success');
      notifyLocalMutation?.('ticket');
      loadPendingTickets();
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setActing(false);
    }
  };

  const handleRejectPendingTicket = async (id) => {
    setActing(true);
    try {
      await api.post(`/tickets/${id}/reject`, { reason: 'Rejected by Team Lead' });
      addToast('Pending ticket rejected', 'info');
      loadPendingTickets();
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setActing(false);
    }
  };

  const handleRequestTicketChanges = async (id) => {
    setActing(true);
    try {
      await api.post(`/tickets/${id}/request-changes`, { comments: 'Changes requested by Team Lead' });
      addToast('Requested changes from submitter', 'info');
      loadPendingTickets();
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setActing(false);
    }
  };

  const openTicketHistory = async (ticket) => {
    try {
      const { data } = await api.get(`/tickets/${ticket._id}/approval-history`);
      setTicketHistoryModal({ open: true, title: `${ticket.ticketId} Approval History`, rows: data.data || [] });
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handleApproveAction = async (id) => {
    setActing(true);
    try {
      const { data } = await api.post(`/ai/action-requests/${id}/approve`);
      addToast(data.message || 'Action approved and executed', 'success');
      notifyLocalMutation?.('client');
      loadActionRequests();
    } catch (err) {
      addToast(getApiError(err, 'Failed to approve action'), 'error');
    } finally {
      setActing(false);
    }
  };

  const handleRejectAction = async (id) => {
    setActing(true);
    try {
      await api.post(`/ai/action-requests/${id}/reject`, { reason: 'Rejected by Team Lead' });
      addToast('Action request rejected', 'info');
      loadActionRequests();
    } catch (err) {
      addToast(getApiError(err, 'Failed to reject action'), 'error');
    } finally {
      setActing(false);
    }
  };

  const handleDirectApproveDraft = async (draft, e) => {
    e?.stopPropagation();
    const cId = draft.clientId?._id || draft.clientId;
    if (!cId) {
      addToast('Client needs verification — opening draft review so you can select a client.', 'info');
      openDraft(draft._id);
      return;
    }
    setActing(true);
    try {
      const { data } = await api.post(`/ai/drafts/${draft._id}/approve`, {
        edits: { clientId: cId },
      });
      addToast(`Approved & published ${data.data.ticket.ticketId}`, 'success');
      notifyLocalMutation('ticket');
      loadDrafts();
    } catch (err) {
      addToast(getApiError(err, 'Failed to approve draft'), 'error');
    } finally {
      setActing(false);
    }
  };

  const openDraft = async (id) => {
    try {
      const { data } = await api.get(`/ai/drafts/${id}`);
      const d = data.data;
      setSelectedDraft(d);
      setEditClientId(d.clientId?._id || '');
      setEditFields(d.generatedFields || {});
      setEditTasks(d.suggestedTasks || []);
      setAssignDevs([]);
      setEditMode(false);
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  useEffect(() => {
    const qDraft = searchParams.get('draft');
    if (qDraft) openDraft(qDraft);
  }, [searchParams]);

  const handleApprove = async () => {
    if (!selectedDraft) return;
    if (!editClientId) {
      addToast('Select a verified client before approving.', 'error');
      return;
    }
    setActing(true);
    try {
      const selectedTaskIds = editTasks.filter((t) => t.accepted !== false && t._id).map((t) => t._id);
      const { data } = await api.post(`/ai/drafts/${selectedDraft._id}/approve`, {
        edits: {
          clientId: editClientId,
          generatedFields: editFields,
          suggestedTasks: editTasks,
          assignedDevelopers: assignDevs,
        },
        selectedTaskIds: selectedTaskIds.length > 0 ? selectedTaskIds : undefined,
      });
      addToast(`Approved! Published ${data.data.ticket.ticketId}`);
      notifyLocalMutation('ticket');
      setSelectedDraft(null);
      loadDrafts();
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectModal.reason.trim()) {
      addToast('Please provide a rejection reason.', 'error');
      return;
    }
    setActing(true);
    try {
      await api.post(`/ai/drafts/${selectedDraft._id}/reject`, { reason: rejectModal.reason });
      addToast('Draft rejected');
      setRejectModal({ open: false, reason: '' });
      setSelectedDraft(null);
      loadDrafts();
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setActing(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!changesModal.comments.trim()) {
      addToast('Enter change instructions.', 'error');
      return;
    }
    setActing(true);
    try {
      await api.post(`/ai/drafts/${selectedDraft._id}/request-changes`, { comments: changesModal.comments });
      addToast('Returned draft for changes');
      setChangesModal({ open: false, comments: '' });
      setSelectedDraft(null);
      loadDrafts();
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setActing(false);
    }
  };

  const handleResubmit = async () => {
    setActing(true);
    try {
      await api.put(`/ai/drafts/${selectedDraft._id}`, {
        clientId: editClientId || null,
        generatedFields: editFields,
        suggestedTasks: editTasks,
        resubmit: true,
      });
      addToast('Resubmitted for TL approval');
      setSelectedDraft(null);
      loadDrafts();
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ticket Intake & TL Approval Inbox"
        subtitle="Review AI-generated ticket drafts, OCR screenshots, and suggested tasks before publishing to the Active Tickets board"
        actions={
          <div className="flex items-center gap-2">
            <Link to="/tickets">
              <Button variant="secondary" size="sm">
                Active Tickets Board <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </Link>
            <Link to="/smart-intake">
              <Button size="sm">
                <Sparkles className="h-3.5 w-3.5" /> Smart Intake
              </Button>
            </Link>
          </div>
        }
      />

      {/* Real MongoDB-Backed Folders */}
      {/* TL Approvals Dashboard KPIs (clickable quick filters) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <button
          type="button"
          onClick={() => {
            setActiveTab(pendingTickets.length > 0 && (counts['Pending TL Approval'] || 0) === 0 ? 'manual' : 'drafts');
            setFolder('Pending TL Approval');
          }}
          className="text-left"
        >
          <Card className="p-3 hover:border-[#171717]/40 transition-colors">
            <div className="text-[11px] font-medium text-[#777777]">Pending Ticket Approvals</div>
            <div className="mt-1 text-2xl font-bold text-[#171717] dark:text-white">
              {(counts['Pending TL Approval'] || 0) + pendingTickets.length}
            </div>
            <div className="text-[10px] text-[#777777]">
              {counts['Pending TL Approval'] || 0} AI Drafts · {pendingTickets.length} Dev/Email Tickets
            </div>
          </Card>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('actions');
            setFolder('Pending TL Approval');
          }}
          className="text-left"
        >
          <Card className="p-3 hover:border-[#638BEF]/50 transition-colors">
            <div className="text-[11px] font-medium text-[#777777]">Pending Users / Clients / Projects</div>
            <div className="mt-1 text-2xl font-bold text-[#638BEF]">
              {actionCounts['Pending TL Approval'] || 0}
            </div>
            <div className="text-[10px] text-[#777777]">Click to review &amp; approve</div>
          </Card>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('drafts');
            setFolder('Approved');
          }}
          className="text-left"
        >
          <Card className="p-3 hover:border-[#35B8A6]/50 transition-colors">
            <div className="text-[11px] font-medium text-[#777777]">Approved Total</div>
            <div className="mt-1 text-2xl font-bold text-[#35B8A6]">
              {(counts['Approved'] || 0) + (actionCounts['Approved'] || 0)}
            </div>
            <div className="text-[10px] text-[#777777]">
              {counts['Approved'] || 0} Tickets · {actionCounts['Approved'] || 0} Records
            </div>
          </Card>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('drafts');
            setFolder('Rejected');
          }}
          className="text-left"
        >
          <Card className="p-3 hover:border-[#F16D64]/50 transition-colors">
            <div className="text-[11px] font-medium text-[#777777]">Rejected Total</div>
            <div className="mt-1 text-2xl font-bold text-[#F16D64]">
              {(counts['Rejected'] || 0) + (actionCounts['Rejected'] || 0)}
            </div>
            <div className="text-[10px] text-[#777777]">
              {counts['Rejected'] || 0} Drafts · {actionCounts['Rejected'] || 0} Requests
            </div>
          </Card>
        </button>
      </div>

      {/* Queue Type Switcher */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => setActiveTab('drafts')}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === 'drafts'
              ? 'bg-[#171717] text-white dark:bg-[#C6F36B] dark:text-[#171717]'
              : 'bg-white border border-[#E8E8E5] text-[#555555] dark:bg-[#17181B] dark:border-[#2C2E33] dark:text-slate-300'
          }`}
        >
          Ticket Drafts ({counts['Pending TL Approval'] || 0} pending)
        </button>
        <button
          onClick={() => setActiveTab('manual')}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === 'manual'
              ? 'bg-[#171717] text-white dark:bg-[#C6F36B] dark:text-[#171717]'
              : 'bg-white border border-[#E8E8E5] text-[#555555] dark:bg-[#17181B] dark:border-[#2C2E33] dark:text-slate-300'
          }`}
        >
          Dev &amp; Email Tickets ({pendingTickets.length} pending)
        </button>
        <button
          onClick={() => setActiveTab('actions')}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === 'actions'
              ? 'bg-[#171717] text-white dark:bg-[#C6F36B] dark:text-[#171717]'
              : 'bg-white border border-[#E8E8E5] text-[#555555] dark:bg-[#17181B] dark:border-[#2C2E33] dark:text-slate-300'
          }`}
        >
          Users, Clients &amp; Projects ({actionCounts['Pending TL Approval'] || 0} pending)
        </button>
      </div>

      {activeTab === 'manual' ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-[#E8E8E5] bg-[#F4F4F2]/60 px-3 py-2 text-[11px] text-[#555555] dark:border-[#2C2E33] dark:bg-white/5 dark:text-slate-300">
            Developer-submitted &amp; Email-converted tickets awaiting Admin or Team Lead approval before publishing to <strong>All Tickets</strong>.
          </div>
          {pendingTickets.length === 0 ? (
            <Card className="py-12 text-center text-xs text-[#777777]">
              No pending developer or email tickets awaiting Admin / TL approval.
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {pendingTickets.map((t) => (
                <Card key={t._id} className="hover:border-[#171717]/40 transition-colors">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-[#638BEF]">{t.ticketId}</span>
                        <Badge variant="warning">{t.approvalStatus}</Badge>
                        <span className="rounded bg-[#F4F4F2] dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-[#555555] dark:text-slate-300">
                          {t.category || 'Support Request'}
                        </span>
                      </div>
                      <Badge variant="priority" value={t.priority}>
                        {t.priority}
                      </Badge>
                    </div>

                    <h3 className="text-sm font-semibold text-[#171717] dark:text-slate-100">{t.title}</h3>
                    <p className="text-xs text-[#555555] dark:text-slate-400 line-clamp-2">
                      {t.description || 'No description provided.'}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E8E8E5] dark:border-[#26282D] text-[11px] text-[#777777]">
                      <div className="flex items-center gap-2">
                        <Avatar name={t.createdBy?.fullName} color={t.createdBy?.avatarColor} size="xs" />
                        <span>{t.createdBy?.fullName || 'System'}</span>
                        <span>· {t.client?.companyName || 'Unassigned Client'}</span>
                      </div>
                      <span>{dayjs(t.createdAt).format('DD MMM, HH:mm')}</span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                      <div className="flex items-center gap-1.5">
                        <Link
                          to={`/tickets/${t._id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-1 text-[11px] font-medium text-[#171717] hover:bg-[#F4F4F2] dark:border-[#2C2E33] dark:bg-[#1E2025] dark:text-white"
                        >
                          <ExternalLink className="h-3 w-3" /> View Full Ticket
                        </Link>
                        <Button size="xs" variant="secondary" onClick={() => openTicketHistory(t)}>
                          History
                        </Button>
                      </div>
                      {isManager && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button size="xs" variant="primary" disabled={acting} onClick={() => handleApprovePendingTicket(t._id)}>
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Direct Approve
                          </Button>
                          <Button size="xs" variant="secondary" disabled={acting} onClick={() => handleRequestTicketChanges(t._id)}>
                            Changes
                          </Button>
                          <Button size="xs" variant="danger" disabled={acting} onClick={() => handleRejectPendingTicket(t._id)}>
                            <XCircle className="h-3 w-3 mr-1" /> Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
          <Modal
            open={ticketHistoryModal.open}
            onClose={() => setTicketHistoryModal({ open: false, title: '', rows: [] })}
            title={ticketHistoryModal.title}
          >
            <div className="space-y-2 text-xs">
              {ticketHistoryModal.rows.map((h) => (
                <div key={h._id} className="border-b border-[#E8E8E5] dark:border-[#26282D] pb-1.5">
                  <div className="font-semibold">{h.action} ({h.approvalMode}) — {h.previousStatus} → {h.newStatus}</div>
                  <div className="text-[#777777]">{h.performedBy?.fullName} · {dayjs(h.timestamp).format('DD MMM YYYY HH:mm')}</div>
                  {h.comments && <p className="mt-0.5">{h.comments}</p>}
                </div>
              ))}
            </div>
          </Modal>
        </div>
      ) : activeTab === 'actions' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {['Pending TL Approval', 'Approved', 'Rejected', 'All'].map((st) => {
              const cnt =
                st === 'All'
                  ? (actionCounts['Pending TL Approval'] || 0) + (actionCounts['Approved'] || 0) + (actionCounts['Rejected'] || 0)
                  : actionCounts[st] || 0;
              return (
                <button
                  key={st}
                  onClick={() => setFolder(st)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    folder === st
                      ? 'border-[#171717] bg-[#C6F36B] text-[#171717] font-semibold'
                      : 'border-[#E8E8E5] bg-white text-[#555555] dark:border-[#2C2E33] dark:bg-[#17181B] dark:text-slate-300'
                  }`}
                >
                  <span>{st}</span>
                  <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-bold">{cnt}</span>
                </button>
              );
            })}
          </div>
          {actionRequests.length === 0 ? (
            <Card className="py-12 text-center text-xs text-[#777777]">
              No User, Client, or Project approval requests in &quot;{folder}&quot;.
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {actionRequests.map((req) => {
                const typeLabel =
                  req.actionType === 'CREATE_USER'
                    ? 'New User'
                    : req.actionType === 'CREATE_CLIENT'
                      ? 'New Client'
                      : 'New Project';
                const createdRoute =
                  req.createdRecordId &&
                  (req.actionType === 'CREATE_USER'
                    ? `/team/${req.createdRecordId}`
                    : req.actionType === 'CREATE_CLIENT'
                      ? `/clients/${req.createdRecordId}`
                      : `/projects/${req.createdRecordId}`);
                return (
                  <Card key={req._id} className="hover:border-[#171717]/40 transition-colors">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={req.status === 'Approved' ? 'success' : req.status === 'Rejected' ? 'danger' : 'warning'}>
                            {req.status}
                          </Badge>
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#638BEF]">
                            {typeLabel}
                          </span>
                        </div>
                        <span className="text-[11px] text-[#777777]">
                          {dayjs(req.createdAt).format('DD MMM, HH:mm')}
                        </span>
                      </div>

                      <h3 className="text-sm font-semibold text-[#171717] dark:text-white">{req.title}</h3>
                      <p className="text-xs text-[#555555] dark:text-slate-400 line-clamp-2">{req.summary}</p>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E8E8E5] dark:border-[#26282D] text-[11px] text-[#777777]">
                        <span>Requested by {req.requestedBy?.fullName || req.requestedBy?.name || 'User'}</span>
                        <div className="flex items-center gap-1.5">
                          {isManager && req.status === 'Pending TL Approval' && (
                            <>
                              <Button size="xs" variant="primary" disabled={acting} onClick={() => handleApproveAction(req._id)}>
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Approve &amp; Create
                              </Button>
                              <Button size="xs" variant="danger" disabled={acting} onClick={() => handleRejectAction(req._id)}>
                                <XCircle className="h-3 w-3 mr-1" /> Reject
                              </Button>
                            </>
                          )}
                          {createdRoute && (
                            <Link
                              to={createdRoute}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#C6F36B] px-2.5 py-1 text-[11px] font-semibold text-[#171717] hover:opacity-90"
                            >
                              <ExternalLink className="h-3 w-3" /> Open {typeLabel.replace('New ', '')}
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
      <>
      <div className="flex flex-wrap gap-1.5">
        {FOLDERS.map((f) => {
          const count = f.id === 'All' ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[f.id] || 0;
          return (
            <button
              key={f.id}
              onClick={() => setFolder(f.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                folder === f.id
                  ? 'border-[#171717] bg-[#C6F36B] text-[#171717] font-semibold'
                  : 'border-[#E8E8E5] bg-white text-[#555555] dark:border-[#2C2E33] dark:bg-[#17181B] dark:text-slate-300'
              }`}
            >
              <span>{f.label}</span>
              <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-bold">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card padding={false} className="p-3">
        <div className="flex flex-wrap gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#777777]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search draft ID, title, or OCR text..."
              className="w-full rounded-lg border border-[#E8E8E5] bg-[#F4F4F2]/60 py-1.5 pl-8 pr-3 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
            />
          </div>
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="rounded-lg border border-[#E8E8E5] bg-white px-3 py-1.5 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
          >
            <option value="">All Clients</option>
            {clients.map((c) => (
              <option key={c._id} value={c._id}>
                {c.companyName}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {loading ? (
        <Loader label="Loading approval queue..." />
      ) : drafts.filter((d) => folder === 'All' || d.approvalStatus === folder).length === 0 ? (
        <Card className="py-12 text-center text-xs text-[#777777]">
          No submissions in "{folder}".
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Client-side safety filter: only show drafts that match the active folder (guards against stale data) */}
          {drafts
            .filter((d) => folder === 'All' || d.approvalStatus === folder)
            .map((d) => (
            <Card
              key={d._id}
              className="cursor-pointer hover:border-[#171717]/40 transition-colors"
            >
              <div onClick={() => openDraft(d._id)} className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#638BEF]">{d.draftId}</span>
                    <Badge value={d.approvalStatus === 'Approved' ? 'Completed' : d.approvalStatus === 'Rejected' ? 'Blocked' : 'Pending'}>
                      {d.approvalStatus}
                    </Badge>
                    {d.approvedTicketRef && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openTicketDrawer(d.approvedTicketId?._id || d.approvedTicketId);
                        }}
                        className="font-mono text-[11px] font-semibold text-[#35B8A6] hover:underline"
                      >
                        → {d.approvedTicketRef}
                      </button>
                    )}
                  </div>
                  <Badge variant="priority" value={d.generatedFields?.priority}>
                    {d.generatedFields?.priority}
                  </Badge>
                </div>

                <h3 className="text-sm font-semibold text-[#171717] dark:text-slate-100">
                  {d.generatedFields?.title}
                </h3>
                <p className="text-xs text-[#555555] dark:text-slate-400 line-clamp-2">
                  {d.generatedFields?.description}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E8E8E5] dark:border-[#26282D] text-[11px] text-[#777777]">
                  <div className="flex items-center gap-2">
                    <Avatar name={d.submittedBy?.fullName} color={d.submittedBy?.avatarColor} size="xs" />
                    <span>{d.submittedBy?.fullName}</span>
                    <span>· {d.clientId?.companyName || 'Unverified Client'}</span>
                  </div>
                  <span>{dayjs(d.createdAt).format('DD MMM, HH:mm')}</span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                  <Button size="xs" variant="secondary" onClick={() => openDraft(d._id)}>
                    <ExternalLink className="h-3 w-3 mr-1" /> View Full Draft
                  </Button>
                  <div className="flex items-center gap-1.5">
                    {isManager && d.approvalStatus !== 'Approved' && d.approvalStatus !== 'Rejected' && (
                      <>
                        <Button size="xs" variant="primary" disabled={acting} onClick={(e) => handleDirectApproveDraft(d, e)}>
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Direct Approve
                        </Button>
                        <Button
                          size="xs"
                          variant="danger"
                          disabled={acting}
                          onClick={(e) => {
                            e.stopPropagation();
                            openDraft(d._id);
                            setRejectModal({ open: true, reason: '' });
                          }}
                        >
                          <XCircle className="h-3 w-3 mr-1" /> Reject
                        </Button>
                      </>
                    )}
                    {d.approvedTicketId && (
                      <Link
                        to={`/tickets/${d.approvedTicketId?._id || d.approvedTicketId}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#C6F36B] px-2.5 py-1 text-[11px] font-semibold text-[#171717] hover:opacity-90"
                      >
                        <ExternalLink className="h-3 w-3" /> Open Full Ticket
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Full Draft Review Modal */}
      <Modal
        open={Boolean(selectedDraft)}
        onClose={() => setSelectedDraft(null)}
        title={selectedDraft ? `Review ${selectedDraft.draftId}` : ''}
        subtitle={selectedDraft?.approvalStatus}
        maxWidth="max-w-4xl"
      >
        {selectedDraft && (
          <div className="space-y-4 text-xs">
            {selectedDraft.rejectionReason && (
              <div className="rounded-lg border border-[#F16D64]/40 bg-[#F16D64]/10 p-3 text-[#c93e35]">
                <strong>Rejection Reason:</strong> {selectedDraft.rejectionReason}
              </div>
            )}
            {selectedDraft.changeRequestNotes && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-200">
                <strong>Requested Changes:</strong> {selectedDraft.changeRequestNotes}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Source & OCR */}
              <div className="space-y-3">
                <div className="rounded-xl border border-[#E8E8E5] dark:border-[#26282D] p-3">
                  <div className="font-semibold mb-1.5">Original Source ({selectedDraft.sourceType})</div>
                  <p className="text-[#555555] dark:text-slate-300 whitespace-pre-line">
                    {selectedDraft.sourceText || 'No raw text input'}
                  </p>
                </div>

                {selectedDraft.extractedText && (
                  <div className="rounded-xl border border-[#E8E8E5] dark:border-[#26282D] p-3">
                    <div className="font-semibold mb-1.5 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-[#35B8A6]" /> OCR Extracted Text
                    </div>
                    <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] bg-[#F4F4F2] dark:bg-black/30 p-2 rounded">
                      {selectedDraft.extractedText}
                    </pre>
                  </div>
                )}

                {(selectedDraft.attachments || []).length > 0 && (
                  <div className="rounded-xl border border-[#E8E8E5] dark:border-[#26282D] p-3 space-y-2">
                    <div className="font-semibold">Attachments</div>
                    {selectedDraft.attachments.map((att) => (
                      <div key={att._id} className="space-y-1">
                        {att.mimeType?.startsWith('image/') && (
                          <img src={att.url} alt={att.originalName} className="max-h-40 rounded border" />
                        )}
                        <a href={att.url} target="_blank" rel="noreferrer" className="text-[#638BEF] hover:underline block">
                          {att.originalName}
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Generated Fields & Suggested Tasks */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">Generated Ticket Details</span>
                  {selectedDraft.approvalStatus !== 'Approved' && (
                    <Button size="xs" variant="secondary" onClick={() => setEditMode((m) => !m)}>
                      {editMode ? 'Preview Mode' : 'Edit Fields'}
                    </Button>
                  )}
                </div>

                <div className="space-y-2.5 rounded-xl border border-[#E8E8E5] dark:border-[#26282D] p-3">
                  <div>
                    <label className="font-medium text-[#777777]">Client</label>
                    {editMode ? (
                      <select
                        value={editClientId}
                        onChange={(e) => setEditClientId(e.target.value)}
                        className="mt-1 w-full rounded border px-2 py-1.5 dark:bg-[#1E2025]"
                      >
                        <option value="">Select client...</option>
                        {clients.map((c) => (
                          <option key={c._id} value={c._id}>{c.companyName}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="font-semibold">{selectedDraft.clientId?.companyName || 'Needs Selection'}</div>
                    )}
                  </div>

                  <div>
                    <label className="font-medium text-[#777777]">Title</label>
                    {editMode ? (
                      <input
                        value={editFields.title || ''}
                        onChange={(e) => setEditFields({ ...editFields, title: e.target.value })}
                        className="mt-1 w-full rounded border px-2 py-1.5 dark:bg-[#1E2025]"
                      />
                    ) : (
                      <div className="font-semibold">{editFields.title}</div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="font-medium text-[#777777]">Priority</label>
                      {editMode ? (
                        <select
                          value={editFields.priority}
                          onChange={(e) => setEditFields({ ...editFields, priority: e.target.value })}
                          className="mt-1 w-full rounded border px-2 py-1 dark:bg-[#1E2025]"
                        >
                          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      ) : (
                        <div>{editFields.priority}</div>
                      )}
                    </div>
                    <div>
                      <label className="font-medium text-[#777777]">Category</label>
                      {editMode ? (
                        <select
                          value={editFields.category}
                          onChange={(e) => setEditFields({ ...editFields, category: e.target.value })}
                          className="mt-1 w-full rounded border px-2 py-1 dark:bg-[#1E2025]"
                        >
                          {TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <div>{editFields.category}</div>
                      )}
                    </div>
                    <div>
                      <label className="font-medium text-[#777777]">Env / Folder</label>
                      {editMode ? (
                        <select
                          value={editFields.environment}
                          onChange={(e) => setEditFields({ ...editFields, environment: e.target.value })}
                          className="mt-1 w-full rounded border px-2 py-1 dark:bg-[#1E2025]"
                        >
                          {DEPLOYMENT_ENVIRONMENTS.map((env) => <option key={env} value={env}>{env}</option>)}
                        </select>
                      ) : (
                        <div className="font-mono">{editFields.environment} · {editFields.folderCode}</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <label className="font-medium text-[#777777]">Description</label>
                      {(editFields.shortDescription || editFields.mediumDescription || editFields.longDescription) && (
                        <div className="inline-flex rounded-lg border border-[#E8E8E5] dark:border-[#2C2E33] p-0.5 bg-[#F4F4F2]/70 dark:bg-[#141518]">
                          {[
                            { id: 'short', label: 'Short', key: 'shortDescription' },
                            { id: 'medium', label: 'Medium', key: 'mediumDescription' },
                            { id: 'long', label: 'Long', key: 'longDescription' },
                          ].map((opt) => {
                            const variantText = editFields[opt.key];
                            const isActive = variantText && editFields.description === variantText;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                disabled={!variantText}
                                onClick={() => setEditFields({ ...editFields, description: variantText })}
                                className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                                  isActive
                                    ? 'bg-[#171717] text-[#C6F36B] dark:bg-[#C6F36B] dark:text-[#171717]'
                                    : 'text-[#555555] hover:text-[#171717] dark:text-slate-300 disabled:opacity-40'
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {editMode ? (
                      <textarea
                        rows={4}
                        value={editFields.description || ''}
                        onChange={(e) => setEditFields({ ...editFields, description: e.target.value })}
                        className="mt-1 w-full rounded border px-2 py-1.5 dark:bg-[#1E2025]"
                      />
                    ) : (
                      <p className="whitespace-pre-line">{editFields.description}</p>
                    )}
                  </div>
                </div>

                {/* Suggested Tasks */}
                <div className="rounded-xl border border-[#E8E8E5] dark:border-[#26282D] p-3">
                  <div className="font-semibold mb-2">Suggested Tasks ({editTasks.length})</div>
                  <div className="space-y-1.5">
                    {editTasks.map((t, idx) => (
                      <label key={idx} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={t.accepted !== false}
                          disabled={selectedDraft.approvalStatus === 'Approved'}
                          onChange={(e) =>
                            setEditTasks((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, accepted: e.target.checked } : x))
                            )
                          }
                        />
                        <span className="flex-1">{t.title}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Optional Assignee Selection on Approval */}
                {isManager && selectedDraft.approvalStatus !== 'Approved' && (
                  <div>
                    <label className="font-medium text-[#777777]">Assign Developers Upon Approval (Optional)</label>
                    <select
                      multiple
                      value={assignDevs}
                      onChange={(e) => setAssignDevs(Array.from(e.target.selectedOptions, (o) => o.value))}
                      className="mt-1 w-full rounded-lg border px-2 py-1 h-16 dark:bg-[#1E2025]"
                    >
                      {users.map((u) => (
                        <option key={u._id} value={u._id}>{u.fullName}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Audit Trail */}
            {(selectedDraft.approvalHistory || []).length > 0 && (
              <div className="border-t border-[#E8E8E5] dark:border-[#26282D] pt-3">
                <div className="font-semibold mb-2">Approval History</div>
                <div className="space-y-1.5 text-[11px] text-[#777777]">
                  {selectedDraft.approvalHistory.map((h) => (
                    <div key={h._id} className="flex justify-between">
                      <span>
                        <strong>{h.performedBy?.fullName}</strong> — {h.action} ({h.comments})
                      </span>
                      <span>{dayjs(h.timestamp).format('DD MMM YYYY, HH:mm')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Approval Actions */}
            <div className="flex flex-wrap justify-end gap-2 border-t border-[#E8E8E5] dark:border-[#26282D] pt-3">
              {isManager && ['Pending TL Approval', 'Changes Requested', 'Incoming'].includes(selectedDraft.approvalStatus) && (
                <>
                  <Button variant="danger" onClick={() => setRejectModal({ open: true, reason: '' })} disabled={acting}>
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                  <Button variant="secondary" onClick={() => setChangesModal({ open: true, comments: '' })} disabled={acting}>
                    <MessageSquareWarning className="h-4 w-4" /> Request Changes
                  </Button>
                  <Button variant="accent" onClick={handleApprove} disabled={acting}>
                    <CheckCircle2 className="h-4 w-4" /> {editMode ? 'Edit & Approve' : 'Approve & Publish Ticket'}
                  </Button>
                </>
              )}

              {!isManager &&
                selectedDraft.approvalStatus === 'Changes Requested' &&
                String(selectedDraft.submittedBy?._id) === String(user?._id) && (
                  <Button variant="accent" onClick={handleResubmit} disabled={acting}>
                    Resubmit for TL Approval
                  </Button>
                )}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={rejectModal.open} onClose={() => setRejectModal({ open: false, reason: '' })} title="Reject Draft" maxWidth="max-w-md">
        <textarea
          rows={3}
          value={rejectModal.reason}
          onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
          placeholder="Rejection reason (required)..."
          className="w-full rounded-lg border p-2 text-xs dark:bg-[#1E2025]"
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRejectModal({ open: false, reason: '' })}>Cancel</Button>
          <Button variant="danger" onClick={handleReject} disabled={acting}>Confirm Reject</Button>
        </div>
      </Modal>

      <Modal open={changesModal.open} onClose={() => setChangesModal({ open: false, comments: '' })} title="Request Changes" maxWidth="max-w-md">
        <textarea
          rows={3}
          value={changesModal.comments}
          onChange={(e) => setChangesModal({ ...changesModal, comments: e.target.value })}
          placeholder="Describe what needs correction..."
          className="w-full rounded-lg border p-2 text-xs dark:bg-[#1E2025]"
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setChangesModal({ open: false, comments: '' })}>Cancel</Button>
          <Button onClick={handleRequestChanges} disabled={acting}>Send Back for Changes</Button>
        </div>
      </Modal>
      </>
      )}
    </div>
  );
}
