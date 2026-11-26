import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  ArrowLeft,
  Plus,
  Send,
  Paperclip,
  Clock,
  CheckCircle2,
  Rocket,
  Lock,
  Globe,
  FileText,
  Trash2,
  Copy,
  Edit3,
  Reply,
  Server,
  ImagePlus,
  X,
} from 'lucide-react';
import dayjs from 'dayjs';
import api, { getApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  PRIORITIES,
  TASK_STATUSES,
  TICKET_STATUSES,
  DEPLOYMENT_ENVIRONMENTS,
  formatStatusLabel,
} from '../utils/constants';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Loader from '../components/ui/Loader';
import Avatar from '../components/ui/Avatar';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';

export default function TicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isManager, hasAction } = useAuth();
  const canApproveTickets = isManager || hasAction('tickets', 'approve');
  const { addToast } = useToast();
  const { openTaskDrawer, lastSync, notifyLocalMutation } = useWorkspace();

  const [ticket, setTicket] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState('idle');

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  const [sideTab, setSideTab] = useState('comments'); // comments | events
  const [commentBody, setCommentBody] = useState('');
  const [isInternalComment, setIsInternalComment] = useState(true);
  const [replyTo, setReplyTo] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentBody, setEditingCommentBody] = useState('');

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [waiveModal, setWaiveModal] = useState({ open: false, reason: '' });
  const [timeLogModal, setTimeLogModal] = useState({ open: false, task: null });
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [devModalOpen, setDevModalOpen] = useState(false);
  const [devForm, setDevForm] = useState({
    description: '',
    affectedComponent: '',
    investigationNotes: '',
    testingPerformed: '',
    environment: 'Development',
    workStatus: 'In Development',
    timeSpent: 0,
  });

  const handleLogDevUpdate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/monitoring/dev-activities', {
        ...devForm,
        ticketId: ticket._id,
        clientId: ticket.client?._id,
      });
      addToast('Development update recorded');
      setDevModalOpen(false);
      setDevForm({
        description: '',
        affectedComponent: '',
        investigationNotes: '',
        testingPerformed: '',
        environment: 'Development',
        workStatus: 'In Development',
        timeSpent: 0,
      });
      loadTicket(true);
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const taskForm = useForm({ defaultValues: { priority: 'Medium', estimatedHours: 4 } });
  const timeForm = useForm({ defaultValues: { hoursSpent: 1, date: dayjs().format('YYYY-MM-DD') } });

  const loadTicket = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [tRes, uRes] = await Promise.all([api.get(`/tickets/${id}`), api.get('/users?limit=100')]);
      const t = tRes.data.data;
      setTicket(t);
      setTitleDraft(t.title);
      setDescDraft(t.description || '');
      setUsers(uRes.data.data || []);
    } catch (err) {
      addToast(getApiError(err, 'Failed to load ticket'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTicket();
  }, [id]);

  useEffect(() => {
    if (lastSync.lastEvent?.type === 'ticket' && String(lastSync.lastEvent.ticketId) === String(id)) {
      loadTicket(true);
    } else if (lastSync.lastEvent?.type === 'task') {
      loadTicket(true);
    }
  }, [lastSync.ticket, lastSync.task]);

  const inlinePatch = async (patch) => {
    setSaveState('saving');
    try {
      await api.put(`/tickets/${id}`, patch);
      setSaveState('saved');
      notifyLocalMutation('ticket');
      loadTicket(true);
      setTimeout(() => setSaveState('idle'), 1500);
    } catch (err) {
      setSaveState('error');
      addToast(getApiError(err), 'error');
    }
  };

  const handleStatusChange = async (newStatus, waive = false, waiveReason = '') => {
    setSaveState('saving');
    try {
      await api.patch(`/tickets/${id}/status`, {
        status: newStatus,
        waiveIncompleteTasks: waive,
        waiveReason,
      });
      setSaveState('saved');
      setWaiveModal({ open: false, reason: '' });
      notifyLocalMutation('ticket');
      loadTicket(true);
      setTimeout(() => setSaveState('idle'), 1500);
    } catch (err) {
      setSaveState('error');
      const msg = getApiError(err, 'Failed to update status');
      if (newStatus === 'Closed' && msg.includes('associated task') && isManager) {
        setWaiveModal({ open: true, reason: '' });
      } else {
        addToast(msg, 'error');
      }
    }
  };

  const toggleDeveloper = async (devId) => {
    const current = (ticket.assignedDevelopers || []).map((d) => d._id);
    const next = current.includes(devId) ? current.filter((x) => x !== devId) : [...current, devId];
    setSaveState('saving');
    try {
      await api.patch(`/tickets/${id}/assign`, { assignedDevelopers: next });
      setSaveState('saved');
      notifyLocalMutation('ticket');
      loadTicket(true);
      setTimeout(() => setSaveState('idle'), 1500);
    } catch (err) {
      setSaveState('error');
      addToast(getApiError(err), 'error');
    }
  };

  const handleAddTask = async (values) => {
    try {
      await api.post('/tasks', {
        ...values,
        ticket: ticket._id,
        client: ticket.client?._id,
        project: ticket.project?._id || undefined,
        assignedEmployees: Array.isArray(values.assignedEmployees)
          ? values.assignedEmployees
          : values.assignedEmployees
          ? [values.assignedEmployees]
          : [],
      });
      addToast('Task added to ticket');
      setTaskModalOpen(false);
      taskForm.reset({ priority: 'Medium', estimatedHours: 4 });
      loadTicket(true);
    } catch (err) {
      addToast(getApiError(err, 'Failed to create task'), 'error');
    }
  };

  const handleTaskStatus = async (taskId, status) => {
    try {
      await api.patch(`/tasks/${taskId}/status`, { status });
      addToast(`Task updated to ${formatStatusLabel(status)}`);
      loadTicket(true);
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const [commentImages, setCommentImages] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null);

  const renderCommentBody = (text = '') => {
    const parts = String(text).split(/(!\[[^\]]*\]\([^)]+\)|@[a-zA-Z0-9._-]+)/g);
    return parts.map((part, idx) => {
      const imgMatch = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imgMatch) {
        return (
          <a key={idx} href={imgMatch[2]} target="_blank" rel="noreferrer" className="block mt-1.5">
            <img
              src={imgMatch[2]}
              alt={imgMatch[1] || 'Comment attachment'}
              className="max-h-48 rounded-lg border border-[#E8E8E5] dark:border-[#2C2E33] object-contain bg-white"
            />
          </a>
        );
      }
      if (part.startsWith('@') && part.length > 1) {
        return (
          <span key={idx} className="inline-block rounded bg-[#638BEF]/15 px-1 py-0.2 font-semibold text-[#638BEF]">
            {part}
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentBody.trim() && commentImages.length === 0) return;
    try {
      let finalBody = commentBody.trim();
      if (commentImages.length > 0) {
        const uploadedUrls = [];
        for (const item of commentImages) {
          const fd = new FormData();
          fd.append('file', item.file);
          fd.append('entityType', 'ticket');
          fd.append('entityId', ticket._id);
          const { data } = await api.post('/attachments', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          const fileUrl = data.data?.url || data.data?.path;
          if (fileUrl) uploadedUrls.push(`![image](${fileUrl})`);
        }
        if (uploadedUrls.length > 0) {
          finalBody = [finalBody, ...uploadedUrls].filter(Boolean).join('\n');
        }
      }

      const mentionedIds = users
        .filter((u) => finalBody.toLowerCase().includes(`@${u.fullName.split(' ')[0].toLowerCase()}`))
        .map((u) => u._id);

      await api.post('/comments', {
        entityType: 'ticket',
        entityId: ticket._id,
        parentComment: replyTo?._id || null,
        body: finalBody,
        isInternal: isInternalComment,
        mentions: mentionedIds,
      });
      setCommentBody('');
      setCommentImages([]);
      setMentionQuery(null);
      setReplyTo(null);
      loadTicket(true);
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handleSaveCommentEdit = async (commentId) => {
    try {
      await api.put(`/comments/${commentId}`, { body: editingCommentBody });
      setEditingCommentId(null);
      loadTicket(true);
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handleDeleteComment = async (commentId) => {
    try {
      await api.delete(`/comments/${commentId}`);
      loadTicket(true);
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('entityType', 'ticket');
    fd.append('entityId', ticket._id);
    try {
      await api.post('/attachments', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      addToast('File attached');
      loadTicket(true);
    } catch (err) {
      addToast(getApiError(err, 'File upload failed'), 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleDeleteAttachment = async (attId) => {
    try {
      await api.delete(`/attachments/${attId}`);
      addToast('Attachment removed');
      loadTicket(true);
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handleLogTime = async (values) => {
    try {
      await api.post('/time-logs', {
        ...values,
        task: timeLogModal.task._id,
        ticket: ticket._id,
        client: ticket.client?._id,
      });
      addToast('Working hours recorded');
      setTimeLogModal({ open: false, task: null });
      timeForm.reset({ hoursSpent: 1, date: dayjs().format('YYYY-MM-DD') });
      loadTicket(true);
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handleDuplicate = async () => {
    try {
      const { data } = await api.post(`/tickets/${ticket._id}/duplicate`);
      addToast(`Duplicated as ${data.data.ticketId}`);
      navigate(`/tickets/${data.data._id}`);
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handleArchive = async () => {
    try {
      await api.delete(`/tickets/${ticket._id}`);
      addToast(`Archived ${ticket.ticketId}`);
      navigate('/tickets');
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  if (loading) return <Loader label="Loading ticket workspace..." />;
  if (!ticket) return <div className="p-6 text-sm">Ticket not found.</div>;

  const rootComments = (ticket.comments || []).filter((c) => !c.parentComment);
  const repliesMap = (ticket.comments || []).reduce((acc, c) => {
    if (c.parentComment) {
      const key = String(c.parentComment);
      acc[key] = acc[key] || [];
      acc[key].push(c);
    }
    return acc;
  }, {});

  return (
    <div className="-m-4 sm:-m-6 flex flex-col min-h-[calc(100vh-3.5rem)] bg-[#F4F4F2] dark:bg-[#101113]">
      {/* Top Workspace Sub-header Bar (Keeps AppLayout Sidebar & Top Header intact!) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E8E8E5] bg-white dark:border-[#26282D] dark:bg-[#17181B] px-4 sm:px-6 py-2.5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            to="/tickets"
            className="inline-flex items-center gap-1 rounded-lg border border-[#E8E8E5] bg-[#F4F4F2]/70 px-2.5 py-1 font-medium text-[#171717] hover:bg-[#E8E8E5] dark:border-[#2C2E33] dark:bg-white/5 dark:text-slate-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
          <span className="text-[#777777]">/</span>
          <Link to={`/clients/${ticket.client?._id}`} className="font-medium text-[#555555] hover:underline dark:text-slate-300">
            {ticket.client?.companyName}
          </Link>
          {ticket.project && (
            <>
              <span className="text-[#777777]">/</span>
              <Link to={`/projects/${ticket.project._id}`} className="text-[#555555] hover:underline dark:text-slate-300">
                {ticket.project.name}
              </Link>
            </>
          )}
          <span className="text-[#777777]">/</span>
          <span className="font-mono font-bold rounded bg-[#171717] px-2 py-0.5 text-[#C6F36B] dark:bg-[#C6F36B] dark:text-[#171717]">
            {ticket.ticketId}
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-[#35B8A6]/15 px-2 py-0.5 font-mono text-[11px] font-medium text-[#1b7a6d] dark:text-[#6fe0d0]">
            <Server className="h-3 w-3" /> {ticket.sageX3Environment} · {ticket.folderCode}
          </span>
          {ticket.isOverdue && <Badge value="Critical">OVERDUE</Badge>}
          {saveState === 'saving' && <span className="text-[11px] text-[#777777]">Saving...</span>}
          {saveState === 'saved' && <span className="text-[11px] font-medium text-[#35B8A6]">Saved</span>}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="xs"
            variant="secondary"
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              addToast('Ticket URL copied');
            }}
          >
            <Copy className="h-3.5 w-3.5" /> Copy URL
          </Button>
          <Button size="xs" variant="secondary" onClick={handleDuplicate}>
            <Plus className="h-3.5 w-3.5" /> Duplicate
          </Button>
          <Button size="xs" onClick={() => setTaskModalOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Task
          </Button>
          {isManager && (
            <Button size="xs" variant="danger" onClick={() => setArchiveConfirm(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Archive
            </Button>
          )}
        </div>
      </div>

      {/* Full-Workspace 2-Column Split */}
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 min-h-0">
        {/* LEFT MAIN DETAIL AREA */}
        <div className="xl:col-span-8 p-5 sm:p-6 space-y-5 overflow-y-auto">
          {/* TL Approval Review Banner (shown when viewing full pending ticket before publishing) */}
          {['PENDING_APPROVAL', 'CHANGES_REQUESTED'].includes(ticket.approvalStatus) && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
                  <Badge variant="warning">{ticket.approvalStatus}</Badge>
                  <span>Awaiting Team Lead Approval before entering Main Ticket Queue</span>
                </div>
                <p className="text-[11px] text-[#555555] dark:text-slate-300">
                  Submitted by {ticket.createdBy?.fullName || 'Developer'} · Ticket remains unassigned upon approval.
                </p>
              </div>
              {canApproveTickets && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={async () => {
                      try {
                        const { data } = await api.post(`/tickets/${ticket._id}/approve`, { comments: 'Approved from full ticket view' });
                        addToast(data.message || 'Ticket approved into main queue');
                        notifyLocalMutation('ticket');
                        loadTicket(true);
                      } catch (err) {
                        addToast(getApiError(err), 'error');
                      }
                    }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve &amp; Publish
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await api.post(`/tickets/${ticket._id}/request-changes`, { comments: 'Changes requested from full ticket view' });
                        addToast('Changes requested from submitter', 'info');
                        loadTicket(true);
                      } catch (err) {
                        addToast(getApiError(err), 'error');
                      }
                    }}
                  >
                    Request Changes
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      try {
                        await api.post(`/tickets/${ticket._id}/reject`, { reason: 'Rejected from full ticket view' });
                        addToast('Ticket rejected', 'info');
                        navigate('/approvals');
                      } catch (err) {
                        addToast(getApiError(err), 'error');
                      }
                    }}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Inline Editable Title */}
          <div>
            {editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => {
                  setEditingTitle(false);
                  if (titleDraft.trim() && titleDraft !== ticket.title) inlinePatch({ title: titleDraft.trim() });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.target.blur();
                  if (e.key === 'Escape') {
                    setTitleDraft(ticket.title);
                    setEditingTitle(false);
                  }
                }}
                className="w-full rounded-xl border border-[#638BEF] bg-white px-3 py-2 text-xl font-semibold dark:bg-[#1E2025]"
              />
            ) : (
              <h1
                onClick={() => setEditingTitle(true)}
                title="Click to edit title"
                className="cursor-text rounded-lg px-2 -mx-2 py-1 text-xl font-semibold tracking-tight text-[#171717] dark:text-slate-100 hover:bg-white dark:hover:bg-white/5"
              >
                {ticket.title}
              </h1>
            )}
          </div>

          {/* Clean Two-Column Property Grid */}
          <Card className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#777777] mb-1">Status</div>
              <select
                value={ticket.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="w-full rounded-lg border border-[#E8E8E5] bg-[#F4F4F2]/50 px-2.5 py-1.5 text-xs font-semibold dark:border-[#2C2E33] dark:bg-[#1E2025]"
              >
                {TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {formatStatusLabel(s)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#777777] mb-1">Priority</div>
              <select
                value={ticket.priority}
                onChange={(e) => inlinePatch({ priority: e.target.value })}
                className="w-full rounded-lg border border-[#E8E8E5] bg-[#F4F4F2]/50 px-2.5 py-1.5 text-xs font-semibold dark:border-[#2C2E33] dark:bg-[#1E2025]"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#777777] mb-1">Assignees</div>
              <button
                type="button"
                onClick={() => isManager && setAssigneeOpen((o) => !o)}
                className="flex items-center justify-between gap-2 w-full rounded-lg border border-[#E8E8E5] bg-[#F4F4F2]/50 px-2.5 py-1.5 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="flex -space-x-1">
                    {(ticket.assignedDevelopers || []).map((d) => (
                      <Avatar key={d._id} name={d.fullName} color={d.avatarColor} size="xs" />
                    ))}
                  </div>
                  <span className="truncate font-medium">
                    {(ticket.assignedDevelopers || []).length === 0
                      ? 'Unassigned'
                      : ticket.assignedDevelopers.map((d) => d.fullName.split(' ')[0]).join(', ')}
                  </span>
                </div>
              </button>
              {assigneeOpen && isManager && (
                <div className="absolute left-0 top-14 z-30 w-60 rounded-xl border border-[#E8E8E5] bg-white p-2 shadow-xl dark:border-[#2C2E33] dark:bg-[#1C1D21] space-y-1">
                  {users.map((u) => (
                    <label
                      key={u._id}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[#F4F4F2] dark:hover:bg-white/10 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={(ticket.assignedDevelopers || []).some((d) => d._id === u._id)}
                        onChange={() => toggleDeveloper(u._id)}
                      />
                      <Avatar name={u.fullName} color={u.avatarColor} size="xs" />
                      <span className="truncate">{u.fullName}</span>
                    </label>
                  ))}
                  <button
                    onClick={() => setAssigneeOpen(false)}
                    className="w-full text-center text-[11px] font-semibold text-[#638BEF] pt-1"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>

            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#777777] mb-1">Due Date</div>
              <input
                type="date"
                value={ticket.dueDate ? dayjs(ticket.dueDate).format('YYYY-MM-DD') : ''}
                onChange={(e) => inlinePatch({ dueDate: e.target.value || null })}
                className="w-full rounded-lg border border-[#E8E8E5] bg-[#F4F4F2]/50 px-2.5 py-1.5 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
              />
            </div>

            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#777777] mb-1">
                Sage X3 Environment
              </div>
              <select
                value={ticket.sageX3Environment}
                onChange={(e) => inlinePatch({ sageX3Environment: e.target.value })}
                className="w-full rounded-lg border border-[#E8E8E5] bg-[#F4F4F2]/50 px-2.5 py-1.5 text-xs font-medium dark:border-[#2C2E33] dark:bg-[#1E2025]"
              >
                {DEPLOYMENT_ENVIRONMENTS.map((env) => (
                  <option key={env} value={env}>
                    {env}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#777777] mb-1">
                Category, Approval &amp; Time
              </div>
              <div className="py-1 font-medium text-[#171717] dark:text-slate-200 flex flex-wrap items-center justify-between gap-1">
                <span>{ticket.category}</span>
                <span className="font-mono text-[#35B8A6]">{ticket.totalHoursLogged || 0}h logged</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] mt-0.5">
                <Badge variant={ticket.approvalStatus === 'APPROVED' ? 'success' : ticket.approvalStatus === 'REJECTED' ? 'danger' : 'warning'}>
                  {ticket.approvalStatus || 'APPROVED'}
                </Badge>
                {ticket.approvalType && (
                  <span className="text-[10px] text-[#777777]">{ticket.approvalType.replace(/_/g, ' ')}</span>
                )}
              </div>
            </div>
          </Card>

          {/* Description */}
          <Card>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777777]">Description</h3>
              {!editingDesc && (
                <button onClick={() => setEditingDesc(true)} className="text-xs text-[#638BEF] hover:underline">
                  Edit
                </button>
              )}
            </div>
            {editingDesc ? (
              <div className="space-y-2">
                <textarea
                  rows={4}
                  autoFocus
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  className="w-full rounded-lg border border-[#638BEF] p-2.5 text-xs dark:bg-[#1E2025]"
                />
                <div className="flex gap-2">
                  <Button
                    size="xs"
                    onClick={() => {
                      setEditingDesc(false);
                      inlinePatch({ description: descDraft });
                    }}
                  >
                    Save Description
                  </Button>
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => {
                      setDescDraft(ticket.description);
                      setEditingDesc(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p
                onClick={() => setEditingDesc(true)}
                className="cursor-text text-sm text-[#171717] dark:text-slate-200 whitespace-pre-line leading-relaxed"
              >
                {ticket.description}
              </p>
            )}

            {ticket.internalNotes && (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                <span className="font-semibold">Internal Note: </span>
                {ticket.internalNotes}
              </div>
            )}
          </Card>

          {/* Execution Tasks */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Execution Tasks ({ticket.tasks?.length || 0})</h3>
              <Button size="xs" variant="secondary" onClick={() => setTaskModalOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> New Task
              </Button>
            </div>
            {(ticket.tasks || []).length === 0 ? (
              <p className="text-xs text-[#777777] py-4 text-center">No tasks broken down for this ticket yet.</p>
            ) : (
              <div className="divide-y divide-[#E8E8E5] dark:divide-[#26282D]">
                {ticket.tasks.map((task) => (
                  <div
                    key={task._id}
                    onClick={() => openTaskDrawer(task._id)}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer hover:bg-[#F4F4F2]/50 dark:hover:bg-white/[0.02] px-2 -mx-2 rounded-lg"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-semibold text-[#638BEF]">{task.taskId}</span>
                        <span className="text-xs font-semibold text-[#171717] dark:text-slate-100">{task.title}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-[#777777]">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {task.actualHours || 0}h / {task.estimatedHours || 0}h
                        </span>
                        <span>{task.completionPercentage || 0}% complete</span>
                        {task.dueDate && <span>Due {dayjs(task.dueDate).format('DD MMM')}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <div className="flex -space-x-1">
                        {(task.assignedEmployees || []).map((e) => (
                          <Avatar key={e._id} name={e.fullName} color={e.avatarColor} size="xs" />
                        ))}
                      </div>
                      <Button variant="ghost" size="xs" onClick={() => setTimeLogModal({ open: true, task })}>
                        + Time
                      </Button>
                      <select
                        value={task.status}
                        onChange={(e) => handleTaskStatus(task._id, e.target.value)}
                        className="rounded border border-[#E8E8E5] bg-white px-2 py-1 text-[11px] dark:border-[#2C2E33] dark:bg-[#1E2025]"
                      >
                        {TASK_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {formatStatusLabel(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Attachments & Linked Deployments */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777777]">
                  Attachments ({ticket.attachments?.length || 0})
                </h3>
                <label className="cursor-pointer inline-flex items-center gap-1 text-xs font-medium text-[#638BEF] hover:underline">
                  <Paperclip className="h-3.5 w-3.5" /> Upload
                  <input type="file" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
              {(ticket.attachments || []).length === 0 ? (
                <p className="text-xs text-[#777777]">No logs or screenshots attached.</p>
              ) : (
                <div className="space-y-2">
                  {ticket.attachments.map((att) => {
                    const isImage =
                      att.mimeType?.startsWith('image/') ||
                      /\.(png|jpe?g|gif|webp)$/i.test(att.originalName || att.url || '');
                    return (
                      <div
                        key={att._id}
                        className="rounded-lg border border-[#E8E8E5] dark:border-[#26282D] px-2.5 py-1.5 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 truncate text-[#638BEF] hover:underline"
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{att.originalName}</span>
                          </a>
                          <button
                            onClick={() => handleDeleteAttachment(att._id)}
                            className="text-[#777777] hover:text-[#F16D64] ml-2"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {isImage && (
                          <a href={att.url} target="_blank" rel="noreferrer" className="block">
                            <img
                              src={att.url}
                              alt={att.originalName}
                              className="max-h-32 w-full rounded object-cover border border-[#E8E8E5] dark:border-[#2C2E33] bg-white"
                            />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777777]">
                  Deployments ({ticket.deployments?.length || 0})
                </h3>
                <Link to="/deployments" className="text-xs text-[#638BEF] hover:underline">
                  Pipeline →
                </Link>
              </div>
              {(ticket.deployments || []).length === 0 ? (
                <p className="text-xs text-[#777777]">No deployments linked yet.</p>
              ) : (
                <div className="space-y-2 text-xs">
                  {ticket.deployments.map((d) => (
                    <div key={d._id} className="rounded-lg border border-[#E8E8E5] dark:border-[#26282D] p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold flex items-center gap-1">
                          <Rocket className="h-3.5 w-3.5 text-[#35B8A6]" /> {d.deploymentId}
                        </span>
                        <Badge value={d.environment}>{d.environment}</Badge>
                      </div>
                      <div className="mt-1 text-[#555555] dark:text-slate-300">
                        {d.versionReference} · {d.sageX3Folder}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Chronological Development Activity Updates */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777777]">
                Development Activity Log ({ticket.devActivities?.length || 0})
              </h3>
              <Button size="xs" variant="secondary" onClick={() => setDevModalOpen((v) => !v)}>
                <Plus className="h-3.5 w-3.5" /> Add Dev Update
              </Button>
            </div>

            {devModalOpen && (
              <form onSubmit={handleLogDevUpdate} className="mb-4 rounded-xl border border-[#E8E8E5] dark:border-[#2C2E33] p-3 space-y-2 text-xs bg-[#F4F4F2]/50 dark:bg-white/[0.02]">
                <input
                  required
                  placeholder="Development summary (e.g. Patched ZMT940IMP validation)..."
                  value={devForm.description}
                  onChange={(e) => setDevForm({ ...devForm, description: e.target.value })}
                  className="w-full rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-1.5 dark:border-[#2C2E33] dark:bg-[#1E2025]"
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    placeholder="Affected Sage X3 script/object"
                    value={devForm.affectedComponent}
                    onChange={(e) => setDevForm({ ...devForm, affectedComponent: e.target.value })}
                    className="rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-1.5 dark:border-[#2C2E33] dark:bg-[#1E2025]"
                  />
                  <select
                    value={devForm.environment}
                    onChange={(e) => setDevForm({ ...devForm, environment: e.target.value })}
                    className="rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-1.5 dark:border-[#2C2E33] dark:bg-[#1E2025]"
                  >
                    {DEPLOYMENT_ENVIRONMENTS.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    placeholder="Hours spent"
                    value={devForm.timeSpent}
                    onChange={(e) => setDevForm({ ...devForm, timeSpent: Number(e.target.value) })}
                    className="rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-1.5 dark:border-[#2C2E33] dark:bg-[#1E2025]"
                  />
                </div>
                <textarea
                  rows={2}
                  placeholder="Technical investigation notes & testing performed..."
                  value={devForm.investigationNotes}
                  onChange={(e) => setDevForm({ ...devForm, investigationNotes: e.target.value })}
                  className="w-full rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-1.5 dark:border-[#2C2E33] dark:bg-[#1E2025]"
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" size="xs" variant="secondary" onClick={() => setDevModalOpen(false)}>Cancel</Button>
                  <Button type="submit" size="xs">Save Dev Update</Button>
                </div>
              </form>
            )}

            {(ticket.devActivities || []).length === 0 ? (
              <p className="text-xs text-[#777777]">No development updates logged on this ticket yet.</p>
            ) : (
              <div className="space-y-2 text-xs">
                {ticket.devActivities.map((d) => (
                  <div key={d._id} className="rounded-lg border border-[#E8E8E5] dark:border-[#26282D] p-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{d.employeeId?.fullName}</span>
                        <Badge variant="info">{d.workStatus}</Badge>
                        <Badge>{d.environment}</Badge>
                        {d.affectedComponent && <code className="rounded bg-[#F4F4F2] dark:bg-white/10 px-1.5 py-0.5 text-[10px]">{d.affectedComponent}</code>}
                      </div>
                      <span className="text-[11px] text-[#777777]">{dayjs(d.timestamp).format('DD MMM HH:mm')} · {d.timeSpent || 0}h</span>
                    </div>
                    <p>{d.description}</p>
                    {d.investigationNotes && <p className="text-[11px] text-[#777777]">{d.investigationNotes}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT SIDE COMMENTS & ACTIVITY SIDEBAR */}
        <aside className="xl:col-span-4 border-t xl:border-t-0 xl:border-l border-[#E8E8E5] dark:border-[#26282D] bg-white dark:bg-[#17181B] flex flex-col xl:h-[calc(100vh-6.8rem)] xl:sticky xl:top-0">
          <div className="flex items-center justify-between border-b border-[#E8E8E5] dark:border-[#26282D] px-4 py-3">
            <span className="text-sm font-semibold">Activity</span>
            <div className="inline-flex rounded-lg bg-[#F4F4F2] dark:bg-white/5 p-0.5 text-xs">
              <button
                onClick={() => setSideTab('comments')}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  sideTab === 'comments' ? 'bg-white text-[#171717] shadow-sm dark:bg-[#1E2025] dark:text-white' : 'text-[#777777]'
                }`}
              >
                Comments ({ticket.comments?.length || 0})
              </button>
              <button
                onClick={() => setSideTab('events')}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  sideTab === 'events' ? 'bg-white text-[#171717] shadow-sm dark:bg-[#1E2025] dark:text-white' : 'text-[#777777]'
                }`}
              >
                Events ({ticket.activityLogs?.length || 0})
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
            {sideTab === 'comments' ? (
              rootComments.length === 0 ? (
                <p className="text-center text-[#777777] py-8">No comments yet. Start the discussion below.</p>
              ) : (
                rootComments.map((c) => {
                  const replies = repliesMap[String(c._id)] || [];
                  const canEdit = String(c.author?._id) === String(user?._id) || user?.role === 'admin';
                  return (
                    <div key={c._id} className="space-y-2">
                      <div
                        className={`rounded-xl border p-3 ${
                          c.isInternal
                            ? 'border-amber-500/30 bg-amber-500/5'
                            : 'border-[#E8E8E5] bg-[#F4F4F2]/50 dark:border-[#26282D] dark:bg-white/[0.02]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Avatar name={c.author?.fullName} color={c.author?.avatarColor} size="xs" />
                            <span className="font-semibold truncate">{c.author?.fullName}</span>
                            <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] bg-white/80 dark:bg-white/10">
                              {c.isInternal ? <Lock className="h-2.5 w-2.5" /> : <Globe className="h-2.5 w-2.5" />}
                              {c.isInternal ? 'Internal' : 'Client'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-[#777777] shrink-0">
                            <span>{dayjs(c.createdAt).format('DD MMM, HH:mm')}</span>
                            <button onClick={() => setReplyTo(c)} title="Reply">
                              <Reply className="h-3 w-3" />
                            </button>
                            {canEdit && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingCommentId(c._id);
                                    setEditingCommentBody(c.body);
                                  }}
                                >
                                  <Edit3 className="h-3 w-3" />
                                </button>
                                <button onClick={() => handleDeleteComment(c._id)} className="hover:text-[#F16D64]">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {editingCommentId === c._id ? (
                          <div className="mt-2 space-y-2">
                            <textarea
                              rows={2}
                              value={editingCommentBody}
                              onChange={(e) => setEditingCommentBody(e.target.value)}
                              className="w-full rounded border p-2 text-xs dark:bg-[#1E2025]"
                            />
                            <div className="flex gap-2">
                              <Button size="xs" onClick={() => handleSaveCommentEdit(c._id)}>
                                Save
                              </Button>
                              <Button size="xs" variant="secondary" onClick={() => setEditingCommentId(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="whitespace-pre-line leading-relaxed">{renderCommentBody(c.body)}</p>
                        )}
                      </div>

                      {replies.map((r) => (
                        <div
                          key={r._id}
                          className="ml-5 rounded-xl border border-[#E8E8E5] dark:border-[#26282D] bg-[#F4F4F2]/40 dark:bg-white/[0.02] p-2.5"
                        >
                          <div className="flex justify-between mb-1">
                            <span className="font-semibold">{r.author?.fullName}</span>
                            <span className="text-[10px] text-[#777777]">{dayjs(r.createdAt).format('DD MMM, HH:mm')}</span>
                          </div>
                          <p>{renderCommentBody(r.body)}</p>
                        </div>
                      ))}
                    </div>
                  );
                })
              )
            ) : (
              (ticket.activityLogs || []).map((log) => (
                <div key={log._id} className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#35B8A6] mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold">{log.actor?.fullName}</span> {log.summary}
                    <div className="text-[10px] text-[#777777]">{dayjs(log.createdAt).format('DD MMM YYYY, HH:mm')}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Sticky Bottom Comment Composer */}
          <form onSubmit={handleAddComment} className="relative border-t border-[#E8E8E5] dark:border-[#26282D] p-3 space-y-2">
            {mentionQuery !== null && (
              <div className="absolute bottom-full left-3 right-3 mb-1 max-h-40 overflow-y-auto rounded-lg border border-[#E8E8E5] bg-white shadow-lg dark:border-[#2C2E33] dark:bg-[#1E2025] z-20">
                {users
                  .filter((u) => u.fullName?.toLowerCase().includes(mentionQuery.toLowerCase()))
                  .slice(0, 6)
                  .map((u) => (
                    <button
                      key={u._id}
                      type="button"
                      onClick={() => {
                        const firstName = u.fullName.split(' ')[0];
                        setCommentBody((prev) => prev.replace(/@([a-zA-Z0-9_]*)$/, `@${firstName} `));
                        setMentionQuery(null);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[#F4F4F2] dark:hover:bg-white/10"
                    >
                      <Avatar name={u.fullName} color={u.avatarColor} size="xs" />
                      <span className="font-medium text-[#171717] dark:text-white">{u.fullName}</span>
                      <span className="text-[10px] text-[#777777] ml-auto">{u.role}</span>
                    </button>
                  ))}
              </div>
            )}
            {replyTo && (
              <div className="flex items-center justify-between rounded bg-[#F4F4F2] dark:bg-white/10 px-2 py-1 text-[11px]">
                <span>Replying to {replyTo.author?.fullName}</span>
                <button type="button" onClick={() => setReplyTo(null)} className="text-[#F16D64]">
                  Cancel
                </button>
              </div>
            )}
            {commentImages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {commentImages.map((img, idx) => (
                  <div key={idx} className="relative group">
                    <img src={img.previewUrl} alt="preview" className="h-12 w-12 rounded-lg object-cover border border-[#E8E8E5]" />
                    <button
                      type="button"
                      onClick={() => setCommentImages((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute -top-1.5 -right-1.5 rounded-full bg-[#171717] text-white p-0.5"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              rows={2}
              value={commentBody}
              onChange={(e) => {
                const val = e.target.value;
                setCommentBody(val);
                const match = val.match(/@([a-zA-Z0-9_]*)$/);
                setMentionQuery(match ? match[1] : null);
              }}
              onPaste={(e) => {
                const items = Array.from(e.clipboardData?.items || []);
                const imageFiles = items
                  .filter((it) => it.type.startsWith('image/'))
                  .map((it) => it.getAsFile())
                  .filter(Boolean);
                if (imageFiles.length > 0) {
                  setCommentImages((prev) => [
                    ...prev,
                    ...imageFiles.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
                  ]);
                }
              }}
              placeholder="Add a comment... (@FirstName to mention, paste or attach images)"
              className="w-full rounded-lg border border-[#E8E8E5] bg-[#F4F4F2]/40 px-3 py-2 text-xs focus:border-[#171717] focus:bg-white focus:outline-none dark:border-[#2C2E33] dark:bg-[#1E2025]"
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 text-[11px] text-[#777777] cursor-pointer">
                  <input type="checkbox" checked={isInternalComment} onChange={(e) => setIsInternalComment(e.target.checked)} />
                  Internal only
                </label>
                <label className="inline-flex items-center gap-1 text-[11px] text-[#638BEF] hover:underline cursor-pointer">
                  <ImagePlus className="h-3.5 w-3.5" />
                  <span>Add Image</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const selected = Array.from(e.target.files || []);
                      if (selected.length > 0) {
                        setCommentImages((prev) => [
                          ...prev,
                          ...selected.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
                        ]);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              <Button type="submit" size="xs">
                <Send className="h-3 w-3" /> Comment
              </Button>
            </div>
          </form>
        </aside>
      </div>

      {/* Add Task Modal */}
      <Modal open={taskModalOpen} onClose={() => setTaskModalOpen(false)} title="Create Execution Task">
        <form onSubmit={taskForm.handleSubmit(handleAddTask)} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-medium mb-1">Task Title *</label>
            <input
              {...taskForm.register('title', { required: true })}
              placeholder="e.g. Modify ZMT940IMP 4GL script"
              className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Description</label>
            <textarea
              rows={2}
              {...taskForm.register('description')}
              className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
            />
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block font-medium mb-1">Priority</label>
              <select
                {...taskForm.register('priority')}
                className="w-full rounded-lg border border-[#E8E8E5] px-2.5 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Estimated Hours</label>
              <input
                type="number"
                step="0.5"
                {...taskForm.register('estimatedHours')}
                className="w-full rounded-lg border border-[#E8E8E5] px-2.5 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Due Date</label>
              <input
                type="date"
                {...taskForm.register('dueDate')}
                className="w-full rounded-lg border border-[#E8E8E5] px-2.5 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium mb-1">Assign Employees</label>
            <select
              multiple
              {...taskForm.register('assignedEmployees')}
              className="w-full rounded-lg border border-[#E8E8E5] px-3 py-1.5 text-xs h-24 dark:border-[#2C2E33] dark:bg-[#1E2025]"
            >
              {users.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.fullName} ({u.designation})
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setTaskModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create Task</Button>
          </div>
        </form>
      </Modal>

      {/* Manager Close Waiver Modal */}
      <Modal
        open={waiveModal.open}
        onClose={() => setWaiveModal({ open: false, reason: '' })}
        title="Incomplete Tasks Waiver Required"
        maxWidth="max-w-md"
      >
        <p className="text-xs text-[#777777] mb-3">
          This ticket still has incomplete tasks. Enter a manager waiver reason to close it anyway.
        </p>
        <textarea
          rows={3}
          value={waiveModal.reason}
          onChange={(e) => setWaiveModal((w) => ({ ...w, reason: e.target.value }))}
          placeholder="Reason for waiving incomplete tasks..."
          className="w-full rounded-lg border px-3 py-2 text-xs dark:bg-[#1E2025]"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setWaiveModal({ open: false, reason: '' })}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => handleStatusChange('Closed', true, waiveModal.reason)}>
            Waive & Close Ticket
          </Button>
        </div>
      </Modal>

      {/* Time Log Modal */}
      <Modal
        open={timeLogModal.open}
        onClose={() => setTimeLogModal({ open: false, task: null })}
        title={`Log Time · ${timeLogModal.task?.taskId || ''}`}
        subtitle={timeLogModal.task?.title}
        maxWidth="max-w-md"
      >
        <form onSubmit={timeForm.handleSubmit(handleLogTime)} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block font-medium mb-1">Hours Spent *</label>
              <input
                type="number"
                step="0.25"
                min="0.1"
                max="24"
                {...timeForm.register('hoursSpent', { required: true })}
                className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-[#1E2025]"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Date *</label>
              <input
                type="date"
                {...timeForm.register('date', { required: true })}
                className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-[#1E2025]"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium mb-1">Work Description *</label>
            <textarea
              rows={3}
              {...timeForm.register('workDescription', { required: true })}
              className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-[#1E2025]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTimeLogModal({ open: false, task: null })}>
              Cancel
            </Button>
            <Button type="submit">Save Time Log</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={archiveConfirm}
        onClose={() => setArchiveConfirm(false)}
        onConfirm={handleArchive}
        title="Archive Ticket"
        message={`Archive ${ticket.ticketId}? It will be hidden from active boards.`}
        confirmText="Archive"
      />
    </div>
  );
}
