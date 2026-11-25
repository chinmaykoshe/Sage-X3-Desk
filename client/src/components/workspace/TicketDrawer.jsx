import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  Lock,
  MoreHorizontal,
  Paperclip,
  Plus,
  Reply,
  Rocket,
  Send,
  Server,
  Trash2,
  Edit3,
  Copy,
} from 'lucide-react';
import dayjs from 'dayjs';
import api, { getApiError } from '../../services/api';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  PRIORITIES,
  TICKET_STATUSES,
  TASK_STATUSES,
  DEPLOYMENT_ENVIRONMENTS,
  formatStatusLabel,
} from '../../utils/constants';
import Drawer from '../ui/Drawer';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';
import Loader from '../ui/Loader';
import Modal from '../ui/Modal';

export default function TicketDrawer() {
  const {
    ticketDrawerId,
    closeDrawers,
    openTaskDrawer,
    openQuickTask,
    users,
    lastSync,
    notifyLocalMutation,
  } = useWorkspace();
  const { user, isManager } = useAuth();
  const { addToast } = useToast();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [waiveModal, setWaiveModal] = useState({ open: false, reason: '' });

  // Comments & activity tabs
  const [commTab, setCommTab] = useState('comments'); // comments | activity
  const [commentBody, setCommentBody] = useState('');
  const [isInternal, setIsInternal] = useState(true);
  const [replyTo, setReplyTo] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentBody, setEditingCommentBody] = useState('');
  const [remoteUpdateNotice, setRemoteUpdateNotice] = useState(false);

  const loadTicket = async (silent = false) => {
    if (!ticketDrawerId) return;
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get(`/tickets/${ticketDrawerId}`);
      setTicket(data.data);
      setTitleDraft(data.data.title);
      setDescDraft(data.data.description);
      setRemoteUpdateNotice(false);
    } catch (err) {
      addToast(getApiError(err, 'Failed to load ticket'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ticketDrawerId) {
      loadTicket();
    } else {
      setTicket(null);
    }
  }, [ticketDrawerId]);

  useEffect(() => {
    if (
      ticketDrawerId &&
      lastSync.lastEvent?.type === 'ticket' &&
      String(lastSync.lastEvent.ticketId) === String(ticketDrawerId)
    ) {
      if (lastSync.lastEvent.actorId && String(lastSync.lastEvent.actorId) !== String(user?._id)) {
        setRemoteUpdateNotice(true);
      }
      loadTicket(true);
    }
  }, [lastSync.ticket]);

  const inlineUpdateField = async (patch) => {
    setSaveState('saving');
    try {
      await api.put(`/tickets/${ticket._id}`, patch);
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
      await api.patch(`/tickets/${ticket._id}/status`, {
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
      const msg = getApiError(err);
      if (newStatus === 'Closed' && msg.includes('associated task') && isManager) {
        setWaiveModal({ open: true, reason: '' });
      } else {
        addToast(msg, 'error');
      }
    }
  };

  const toggleDeveloper = async (devId) => {
    const currentIds = (ticket.assignedDevelopers || []).map((d) => d._id);
    const nextIds = currentIds.includes(devId)
      ? currentIds.filter((x) => x !== devId)
      : [...currentIds, devId];
    setSaveState('saving');
    try {
      await api.patch(`/tickets/${ticket._id}/assign`, { assignedDevelopers: nextIds });
      setSaveState('saved');
      notifyLocalMutation('ticket');
      loadTicket(true);
      setTimeout(() => setSaveState('idle'), 1500);
    } catch (err) {
      setSaveState('error');
      addToast(getApiError(err), 'error');
    }
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    try {
      // Extract @mentions by matching first name or full name
      const mentionedIds = users
        .filter((u) => commentBody.toLowerCase().includes(`@${u.fullName.split(' ')[0].toLowerCase()}`))
        .map((u) => u._id);

      await api.post('/comments', {
        entityType: 'ticket',
        entityId: ticket._id,
        parentComment: replyTo?._id || null,
        body: commentBody,
        isInternal,
        mentions: mentionedIds,
      });
      setCommentBody('');
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

  const handleUploadFile = async (e) => {
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
      addToast(getApiError(err), 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleDuplicate = async () => {
    try {
      const { data } = await api.post(`/tickets/${ticket._id}/duplicate`);
      addToast(`Duplicated as ${data.data.ticketId}`);
      notifyLocalMutation('ticket');
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handleArchive = async () => {
    try {
      await api.delete(`/tickets/${ticket._id}`);
      addToast(`Archived ${ticket.ticketId}`);
      notifyLocalMutation('ticket');
      closeDrawers();
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const rootComments = (ticket?.comments || []).filter((c) => !c.parentComment);
  const repliesMap = (ticket?.comments || []).reduce((acc, c) => {
    if (c.parentComment) {
      const key = String(c.parentComment);
      acc[key] = acc[key] || [];
      acc[key].push(c);
    }
    return acc;
  }, {});

  return (
    <>
      <Drawer
        open={Boolean(ticketDrawerId)}
        onClose={closeDrawers}
        width="max-w-3xl"
        headerLeft={
          ticket && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#171717] text-[#C6F36B] dark:bg-[#C6F36B] dark:text-[#171717]">
                {ticket.ticketId}
              </span>
              <span className="rounded bg-[#F4F4F2] dark:bg-white/10 px-2 py-0.5 font-mono text-[11px] flex items-center gap-1">
                <Server className="h-3 w-3 text-[#35B8A6]" />
                {ticket.sageX3Environment} · {ticket.folderCode}
              </span>
              {saveState === 'saving' && <span className="text-[11px] text-[#777777]">Saving...</span>}
              {saveState === 'saved' && <span className="text-[11px] text-[#35B8A6] font-medium">Saved</span>}
            </div>
          )
        }
        headerRight={
          ticket && (
            <div className="relative flex items-center gap-1">
              <Link
                to={`/tickets/${ticket._id}`}
                onClick={closeDrawers}
                title="Open full page"
                className="rounded-lg p-1.5 text-[#777777] hover:bg-[#F4F4F2] dark:hover:bg-white/10"
              >
                <ExternalLink className="h-4 w-4" />
              </Link>
              <button
                onClick={() => setMoreMenuOpen((o) => !o)}
                className="rounded-lg p-1.5 text-[#777777] hover:bg-[#F4F4F2] dark:hover:bg-white/10"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {moreMenuOpen && (
                <div className="absolute right-0 top-9 z-30 w-44 rounded-xl border border-[#E8E8E5] bg-white p-1 shadow-xl dark:border-[#2C2E33] dark:bg-[#1C1D21] text-xs">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/tickets/${ticket._id}`);
                      addToast('Link copied');
                      setMoreMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-[#F4F4F2] dark:hover:bg-white/10"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy Link
                  </button>
                  <button
                    onClick={() => {
                      setMoreMenuOpen(false);
                      handleDuplicate();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-[#F4F4F2] dark:hover:bg-white/10"
                  >
                    <Plus className="h-3.5 w-3.5" /> Duplicate Ticket
                  </button>
                  {isManager && (
                    <button
                      onClick={() => {
                        setMoreMenuOpen(false);
                        handleArchive();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[#F16D64] hover:bg-[#F16D64]/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Archive Ticket
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        }
      >
        {loading || !ticket ? (
          <Loader label="Loading ticket..." />
        ) : (
          <div className="p-5 space-y-6">
            {remoteUpdateNotice && (
              <div className="rounded-lg border border-[#638BEF]/40 bg-[#638BEF]/10 px-3 py-2 text-xs text-[#2d58c4] dark:text-[#98b4ff]">
                Updated in real time by another team member. View has been synchronized.
              </div>
            )}

            {/* Inline Title */}
            <div>
              {editingTitle ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={() => {
                    setEditingTitle(false);
                    if (titleDraft.trim() && titleDraft !== ticket.title) {
                      inlineUpdateField({ title: titleDraft.trim() });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.target.blur();
                    if (e.key === 'Escape') {
                      setTitleDraft(ticket.title);
                      setEditingTitle(false);
                    }
                  }}
                  className="w-full rounded-lg border border-[#638BEF] bg-white px-2.5 py-1.5 text-lg font-semibold dark:bg-[#1E2025]"
                />
              ) : (
                <h2
                  onClick={() => setEditingTitle(true)}
                  title="Click to edit title"
                  className="cursor-text rounded-md px-1 -mx-1 py-0.5 text-lg font-semibold text-[#171717] dark:text-slate-100 hover:bg-[#F4F4F2] dark:hover:bg-white/5"
                >
                  {ticket.title}
                </h2>
              )}
            </div>

            {/* Inline Details Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-[#E8E8E5] dark:border-[#26282D] bg-[#F4F4F2]/50 dark:bg-white/[0.02] p-3.5 text-xs">
              <div>
                <div className="text-[10px] font-semibold uppercase text-[#777777] mb-1">Status</div>
                <select
                  value={ticket.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="w-full rounded-md border border-[#E8E8E5] bg-white px-2 py-1 text-xs font-medium dark:border-[#2C2E33] dark:bg-[#1E2025]"
                >
                  {TICKET_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {formatStatusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-[10px] font-semibold uppercase text-[#777777] mb-1">Priority</div>
                <select
                  value={ticket.priority}
                  onChange={(e) => inlineUpdateField({ priority: e.target.value })}
                  className="w-full rounded-md border border-[#E8E8E5] bg-white px-2 py-1 text-xs font-medium dark:border-[#2C2E33] dark:bg-[#1E2025]"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-[10px] font-semibold uppercase text-[#777777] mb-1">Due Date</div>
                <input
                  type="date"
                  value={ticket.dueDate ? dayjs(ticket.dueDate).format('YYYY-MM-DD') : ''}
                  onChange={(e) => inlineUpdateField({ dueDate: e.target.value || null })}
                  className="w-full rounded-md border border-[#E8E8E5] bg-white px-2 py-1 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
                />
              </div>

              <div>
                <div className="text-[10px] font-semibold uppercase text-[#777777] mb-1">Environment</div>
                <select
                  value={ticket.sageX3Environment}
                  onChange={(e) => inlineUpdateField({ sageX3Environment: e.target.value })}
                  className="w-full rounded-md border border-[#E8E8E5] bg-white px-2 py-1 text-xs font-medium dark:border-[#2C2E33] dark:bg-[#1E2025]"
                >
                  {DEPLOYMENT_ENVIRONMENTS.map((env) => (
                    <option key={env} value={env}>
                      {env}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-[10px] font-semibold uppercase text-[#777777] mb-1">Client</div>
                <Link to={`/clients/${ticket.client?._id}`} onClick={closeDrawers} className="font-medium text-[#638BEF] hover:underline truncate block">
                  {ticket.client?.companyName}
                </Link>
              </div>

              <div>
                <div className="text-[10px] font-semibold uppercase text-[#777777] mb-1">Category</div>
                <div className="font-medium truncate">{ticket.category}</div>
              </div>

              <div>
                <div className="text-[10px] font-semibold uppercase text-[#777777] mb-1">Reporter</div>
                <div className="truncate">{ticket.reportedBy}</div>
              </div>

              <div className="relative">
                <div className="text-[10px] font-semibold uppercase text-[#777777] mb-1">Assignees</div>
                <button
                  type="button"
                  onClick={() => isManager && setAssigneeMenuOpen((o) => !o)}
                  className="flex items-center gap-1 rounded-md border border-[#E8E8E5] bg-white px-2 py-1 w-full dark:border-[#2C2E33] dark:bg-[#1E2025]"
                >
                  <div className="flex -space-x-1">
                    {(ticket.assignedDevelopers || []).map((d) => (
                      <Avatar key={d._id} name={d.fullName} color={d.avatarColor} size="xs" />
                    ))}
                  </div>
                  <span className="text-[11px] truncate text-[#555555] dark:text-slate-300">
                    {(ticket.assignedDevelopers || []).length === 0
                      ? 'Unassigned'
                      : `${ticket.assignedDevelopers.length} assigned`}
                  </span>
                </button>
                {assigneeMenuOpen && isManager && (
                  <div className="absolute right-0 top-12 z-30 w-56 rounded-xl border border-[#E8E8E5] bg-white p-2 shadow-xl dark:border-[#2C2E33] dark:bg-[#1C1D21] space-y-1">
                    {users.map((u) => {
                      const active = (ticket.assignedDevelopers || []).some((d) => d._id === u._id);
                      return (
                        <label key={u._id} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-[#F4F4F2] dark:hover:bg-white/10 cursor-pointer">
                          <input type="checkbox" checked={active} onChange={() => toggleDeveloper(u._id)} />
                          <Avatar name={u.fullName} color={u.avatarColor} size="xs" />
                          <span className="truncate">{u.fullName}</span>
                        </label>
                      );
                    })}
                    <button
                      onClick={() => setAssigneeMenuOpen(false)}
                      className="w-full text-center text-[11px] text-[#638BEF] pt-1 font-medium"
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Inline Description */}
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#777777] mb-1.5">
                Description
              </div>
              {editingDesc ? (
                <div className="space-y-2">
                  <textarea
                    rows={4}
                    autoFocus
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                    className="w-full rounded-lg border border-[#638BEF] bg-white p-2.5 text-xs dark:bg-[#1E2025]"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="xs"
                      onClick={() => {
                        setEditingDesc(false);
                        inlineUpdateField({ description: descDraft });
                      }}
                    >
                      Save
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
                  className="cursor-text rounded-lg border border-transparent hover:border-[#E8E8E5] dark:hover:border-[#2C2E33] p-2 -mx-2 text-xs text-[#171717] dark:text-slate-300 whitespace-pre-line leading-relaxed"
                >
                  {ticket.description}
                </p>
              )}
            </div>

            {/* Linked Tasks */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#777777]">
                  Development Tasks ({ticket.tasks?.length || 0})
                </h4>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => openQuickTask({ ticket: ticket._id })}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Task
                </Button>
              </div>
              <div className="divide-y divide-[#E8E8E5] dark:divide-[#26282D] rounded-xl border border-[#E8E8E5] dark:border-[#26282D]">
                {(ticket.tasks || []).length === 0 ? (
                  <div className="p-4 text-center text-xs text-[#777777]">No tasks broken down yet.</div>
                ) : (
                  ticket.tasks.map((t) => (
                    <div
                      key={t._id}
                      onClick={() => openTaskDrawer(t._id)}
                      className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs hover:bg-[#F4F4F2]/70 dark:hover:bg-white/5 cursor-pointer"
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <span className="font-mono text-[11px] font-semibold text-[#777777]">{t.taskId}</span>
                        <span className="font-medium truncate">{t.title}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <div className="flex -space-x-1">
                          {(t.assignedEmployees || []).map((emp) => (
                            <Avatar key={emp._id} name={emp.fullName} color={emp.avatarColor} size="xs" />
                          ))}
                        </div>
                        <select
                          value={t.status}
                          onChange={async (e) => {
                            await api.patch(`/tasks/${t._id}/status`, { status: e.target.value });
                            loadTicket(true);
                          }}
                          className="rounded border border-[#E8E8E5] bg-white px-1.5 py-0.5 text-[11px] dark:border-[#2C2E33] dark:bg-[#1E2025]"
                        >
                          {TASK_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {formatStatusLabel(s)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Attachments & Linked Deployments */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-[#E8E8E5] dark:border-[#26282D] p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold">Attachments ({ticket.attachments?.length || 0})</span>
                  <label className="cursor-pointer text-xs font-medium text-[#638BEF] hover:underline flex items-center gap-1">
                    <Paperclip className="h-3.5 w-3.5" /> Upload
                    <input type="file" className="hidden" onChange={handleUploadFile} />
                  </label>
                </div>
                <div className="space-y-1.5 text-xs">
                  {(ticket.attachments || []).map((att) => (
                    <a
                      key={att._id}
                      href={att.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 truncate text-[#638BEF] hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{att.originalName}</span>
                    </a>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-[#E8E8E5] dark:border-[#26282D] p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold">Deployments ({ticket.deployments?.length || 0})</span>
                  <Link to="/deployments" onClick={closeDrawers} className="text-xs text-[#638BEF] hover:underline">
                    Pipeline →
                  </Link>
                </div>
                <div className="space-y-1.5 text-xs">
                  {(ticket.deployments || []).map((d) => (
                    <div key={d._id} className="flex items-center justify-between">
                      <span className="font-mono flex items-center gap-1">
                        <Rocket className="h-3 w-3 text-[#35B8A6]" /> {d.deploymentId} ({d.sageX3Folder})
                      </span>
                      <Badge value={d.approvalStatus}>{d.approvalStatus}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Threaded Comments vs System Activity */}
            <div>
              <div className="flex items-center gap-4 border-b border-[#E8E8E5] dark:border-[#26282D] mb-3">
                <button
                  onClick={() => setCommTab('comments')}
                  className={`pb-2 text-xs font-semibold border-b-2 ${
                    commTab === 'comments' ? 'border-[#171717] dark:border-[#C6F36B] text-[#171717] dark:text-[#C6F36B]' : 'border-transparent text-[#777777]'
                  }`}
                >
                  Comments ({ticket.comments?.length || 0})
                </button>
                <button
                  onClick={() => setCommTab('activity')}
                  className={`pb-2 text-xs font-semibold border-b-2 ${
                    commTab === 'activity' ? 'border-[#171717] dark:border-[#C6F36B] text-[#171717] dark:text-[#C6F36B]' : 'border-transparent text-[#777777]'
                  }`}
                >
                  System Activity & History ({ticket.activityLogs?.length || 0})
                </button>
              </div>

              {commTab === 'comments' ? (
                <div className="space-y-3">
                  {rootComments.map((c) => {
                    const replies = repliesMap[String(c._id)] || [];
                    const canEdit = String(c.author?._id) === String(user?._id) || user?.role === 'admin';
                    return (
                      <div key={c._id} className="space-y-2">
                        <div
                          className={`rounded-xl border p-3 text-xs ${
                            c.isInternal
                              ? 'border-amber-500/30 bg-amber-500/5'
                              : 'border-[#E8E8E5] bg-[#F4F4F2]/50 dark:border-[#26282D] dark:bg-white/[0.02]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <Avatar name={c.author?.fullName} color={c.author?.avatarColor} size="xs" />
                              <span className="font-semibold">{c.author?.fullName}</span>
                              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-white/80 dark:bg-white/10">
                                {c.isInternal ? <Lock className="h-2.5 w-2.5" /> : <Globe className="h-2.5 w-2.5" />}
                                {c.isInternal ? 'Internal' : 'Client-Visible'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-[#777777]">
                              <span>{dayjs(c.createdAt).format('DD MMM, HH:mm')}</span>
                              <button onClick={() => setReplyTo(c)} title="Reply" className="hover:text-[#171717]">
                                <Reply className="h-3.5 w-3.5" />
                              </button>
                              {canEdit && (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingCommentId(c._id);
                                      setEditingCommentBody(c.body);
                                    }}
                                    className="hover:text-[#171717]"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </button>
                                  <button onClick={() => handleDeleteComment(c._id)} className="hover:text-[#F16D64]">
                                    <Trash2 className="h-3.5 w-3.5" />
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
                                className="w-full rounded-lg border p-2 text-xs dark:bg-[#1E2025]"
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
                            <p className="whitespace-pre-line">{c.body}</p>
                          )}
                        </div>

                        {replies.map((r) => (
                          <div
                            key={r._id}
                            className="ml-6 rounded-xl border border-[#E8E8E5] dark:border-[#26282D] bg-white dark:bg-[#1A1B1E] p-2.5 text-xs"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1.5">
                                <Avatar name={r.author?.fullName} color={r.author?.avatarColor} size="xs" />
                                <span className="font-semibold">{r.author?.fullName}</span>
                              </div>
                              <span className="text-[10px] text-[#777777]">{dayjs(r.createdAt).format('DD MMM, HH:mm')}</span>
                            </div>
                            <p>{r.body}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })}

                  <form onSubmit={handlePostComment} className="space-y-2 pt-2">
                    {replyTo && (
                      <div className="flex items-center justify-between rounded-md bg-[#F4F4F2] dark:bg-white/10 px-2.5 py-1 text-[11px]">
                        <span>Replying to {replyTo.author?.fullName}</span>
                        <button type="button" onClick={() => setReplyTo(null)} className="text-[#F16D64]">
                          Cancel
                        </button>
                      </div>
                    )}
                    <textarea
                      rows={2}
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      placeholder="Write a comment... Tip: use @FirstName to mention a teammate"
                      className="w-full rounded-lg border border-[#E8E8E5] bg-white px-3 py-2 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
                    />
                    <div className="flex items-center justify-between">
                      <label className="inline-flex items-center gap-1.5 text-xs text-[#777777] cursor-pointer">
                        <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
                        Internal team note
                      </label>
                      <Button type="submit" size="xs">
                        <Send className="h-3.5 w-3.5" /> Post
                      </Button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="space-y-2.5 text-xs">
                  {(ticket.activityLogs || []).map((log) => (
                    <div key={log._id} className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#35B8A6] mt-0.5 shrink-0" />
                      <div>
                        <span className="font-semibold">{log.actor?.fullName}</span> {log.summary}
                        <div className="text-[10px] text-[#777777]">{dayjs(log.createdAt).format('DD MMM YYYY, HH:mm')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        open={waiveModal.open}
        onClose={() => setWaiveModal({ open: false, reason: '' })}
        title="Incomplete Tasks Waiver"
        maxWidth="max-w-md"
      >
        <p className="text-xs text-[#777777] mb-3">
          This ticket has incomplete tasks. Enter a manager waiver reason to close it anyway.
        </p>
        <textarea
          rows={3}
          value={waiveModal.reason}
          onChange={(e) => setWaiveModal((w) => ({ ...w, reason: e.target.value }))}
          className="w-full rounded-lg border p-2 text-xs dark:bg-[#1E2025]"
          placeholder="Waiver reason..."
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setWaiveModal({ open: false, reason: '' })}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => handleStatusChange('Closed', true, waiveModal.reason)}>
            Waive & Close
          </Button>
        </div>
      </Modal>
    </>
  );
}
