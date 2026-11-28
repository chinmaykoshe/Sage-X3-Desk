import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Paperclip,
  Plus,
  Send,
  FileText,
} from 'lucide-react';
import dayjs from 'dayjs';
import api, { getApiError } from '../../services/api';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PRIORITIES, TASK_STATUSES, formatStatusLabel } from '../../utils/constants';
import Drawer from '../ui/Drawer';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';
import Loader from '../ui/Loader';
import Badge from '../ui/Badge';

export default function TaskDrawer() {
  const { taskDrawerId, closeDrawers, openTicketDrawer, openTaskDrawer, users, lastSync, notifyLocalMutation } =
    useWorkspace();
  const { isManager } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [subtasksExpanded, setSubtasksExpanded] = useState(true);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [timeHours, setTimeHours] = useState('1');
  const [timeDesc, setTimeDesc] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  const loadTask = async (silent = false) => {
    if (!taskDrawerId) return;
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get(`/tasks/${taskDrawerId}`);
      setTask(data.data);
      setTitleDraft(data.data.title);
      setDescDraft(data.data.description || '');
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (taskDrawerId) loadTask();
    else setTask(null);
  }, [taskDrawerId]);

  useEffect(() => {
    if (taskDrawerId && lastSync.lastEvent?.type === 'task') {
      loadTask(true);
    }
  }, [lastSync.task]);

  const inlinePatch = async (patch) => {
    setSaveState('saving');
    try {
      await api.put(`/tasks/${task._id}`, patch);
      setSaveState('saved');
      notifyLocalMutation('task');
      loadTask(true);
      setTimeout(() => setSaveState('idle'), 1500);
    } catch (err) {
      setSaveState('error');
      addToast(getApiError(err), 'error');
    }
  };

  const handleStatusChange = async (status) => {
    setSaveState('saving');
    try {
      await api.patch(`/tasks/${task._id}/status`, { status });
      setSaveState('saved');
      notifyLocalMutation('task');
      loadTask(true);
      setTimeout(() => setSaveState('idle'), 1500);
    } catch (err) {
      setSaveState('error');
      addToast(getApiError(err), 'error');
    }
  };

  const toggleAssignee = async (empId) => {
    const current = (task.assignedEmployees || []).map((e) => e._id);
    const next = current.includes(empId) ? current.filter((x) => x !== empId) : [...current, empId];
    try {
      await api.patch(`/tasks/${task._id}/assign`, { assignedEmployees: next });
      notifyLocalMutation('task');
      loadTask(true);
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handleCreateSubtask = async (e) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    try {
      await api.post('/tasks', {
        title: newSubtaskTitle.trim(),
        parentTask: task._id,
        ticket: task.ticket?._id || null,
        isIndependentInternalTask: task.isIndependentInternalTask,
        priority: task.priority,
      });
      setNewSubtaskTitle('');
      notifyLocalMutation('task');
      loadTask(true);
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handleLogTime = async (e) => {
    e.preventDefault();
    if (!timeDesc.trim()) return;
    try {
      await api.post('/time-logs', {
        task: task._id,
        ticket: task.ticket?._id,
        client: task.client?._id,
        hoursSpent: Number(timeHours),
        workDescription: timeDesc,
      });
      setTimeDesc('');
      addToast('Time logged');
      notifyLocalMutation('task');
      loadTask(true);
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    try {
      await api.post('/comments', {
        entityType: 'task',
        entityId: task._id,
        body: commentBody,
        isInternal: true,
      });
      setCommentBody('');
      loadTask(true);
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('entityType', 'task');
    fd.append('entityId', task._id);
    try {
      await api.post('/attachments', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      addToast('File uploaded');
      loadTask(true);
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <Drawer
      open={Boolean(taskDrawerId)}
      onClose={closeDrawers}
      width="max-w-2xl"
      onOpenFullPage={
        task?.ticket?._id
          ? () => { closeDrawers(); navigate(`/tickets/${task.ticket._id}`); }
          : task?.project?._id
          ? () => { closeDrawers(); navigate(`/projects/${task.project._id}`); }
          : undefined
      }
      headerLeft={
        task && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#171717] text-[#C6F36B] dark:bg-[#C6F36B] dark:text-[#171717]">
              {task.taskId}
            </span>
            {task.ticket && (
              <button
                onClick={() => openTicketDrawer(task.ticket._id)}
                className="text-xs font-medium text-[#638BEF] hover:underline"
              >
                {task.ticket.ticketId}
              </button>
            )}
            {saveState === 'saving' && <span className="text-[11px] text-[#777777]">Saving...</span>}
            {saveState === 'saved' && <span className="text-[11px] text-[#35B8A6] font-medium">Saved</span>}
          </div>
        )
      }
      headerRight={
        task && (
          task.ticket?._id ? (
            <button
              type="button"
              onClick={() => {
                const tid = task.ticket._id;
                closeDrawers();
                navigate(`/tickets/${tid}`);
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-[#171717] px-2.5 py-1 text-[11px] font-semibold text-[#C6F36B] hover:bg-[#2a2a2a] dark:bg-[#C6F36B] dark:text-[#171717]"
            >
              Go to Ticket <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          ) : task.project?._id ? (
            <button
              type="button"
              onClick={() => {
                const pid = task.project._id;
                closeDrawers();
                navigate(`/projects/${pid}`);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#171717] hover:bg-[#F4F4F2] dark:border-[#2C2E33] dark:bg-[#1E2025] dark:text-slate-100"
            >
              Go to Project <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          ) : task.client?._id ? (
            <button
              type="button"
              onClick={() => {
                const cid = task.client._id;
                closeDrawers();
                navigate(`/clients/${cid}`);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#171717] hover:bg-[#F4F4F2] dark:border-[#2C2E33] dark:bg-[#1E2025] dark:text-slate-100"
            >
              Go to Client <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          ) : null
        )
      }
    >
      {loading || !task ? (
        <Loader label="Loading task..." />
      ) : (
        <div className="p-5 space-y-5">
          {/* Inline Title */}
          <div>
            {editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => {
                  setEditingTitle(false);
                  if (titleDraft.trim() && titleDraft !== task.title) inlinePatch({ title: titleDraft.trim() });
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                className="w-full rounded-lg border border-[#638BEF] px-2.5 py-1.5 text-lg font-semibold dark:bg-[#1E2025]"
              />
            ) : (
              <h2
                onClick={() => setEditingTitle(true)}
                className="cursor-text text-lg font-semibold hover:bg-[#F4F4F2] dark:hover:bg-white/5 rounded px-1 -mx-1"
              >
                {task.title}
              </h2>
            )}
          </div>

          {/* Metadata Controls */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-xl border border-[#E8E8E5] dark:border-[#26282D] bg-[#F4F4F2]/50 dark:bg-white/[0.02] p-3.5 text-xs">
            <div>
              <div className="text-[10px] font-semibold uppercase text-[#777777] mb-1">Status</div>
              <select
                value={task.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="w-full rounded-md border border-[#E8E8E5] bg-white px-2 py-1 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {formatStatusLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase text-[#777777] mb-1">Priority</div>
              <select
                value={task.priority}
                onChange={(e) => inlinePatch({ priority: e.target.value })}
                className="w-full rounded-md border border-[#E8E8E5] bg-white px-2 py-1 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative">
              <div className="text-[10px] font-semibold uppercase text-[#777777] mb-1">Assignees</div>
              <button
                type="button"
                onClick={() => isManager && setAssigneeOpen((o) => !o)}
                className="flex items-center gap-1 rounded-md border border-[#E8E8E5] bg-white px-2 py-1 w-full dark:border-[#2C2E33] dark:bg-[#1E2025]"
              >
                <div className="flex -space-x-1">
                  {(task.assignedEmployees || []).map((e) => (
                    <Avatar key={e._id} name={e.fullName} color={e.avatarColor} size="xs" />
                  ))}
                </div>
                <span className="text-[11px] truncate">
                  {(task.assignedEmployees || []).length === 0 ? 'Unassigned' : `${task.assignedEmployees.length} dev(s)`}
                </span>
              </button>
              {assigneeOpen && isManager && (
                <div className="absolute right-0 top-12 z-30 w-52 rounded-xl border border-[#E8E8E5] bg-white p-2 shadow-xl dark:border-[#2C2E33] dark:bg-[#1C1D21] space-y-1">
                  {users.map((u) => (
                    <label key={u._id} className="flex items-center gap-2 px-2 py-1 hover:bg-[#F4F4F2] dark:hover:bg-white/10 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(task.assignedEmployees || []).some((e) => e._id === u._id)}
                        onChange={() => toggleAssignee(u._id)}
                      />
                      <span className="truncate">{u.fullName}</span>
                    </label>
                  ))}
                  <button onClick={() => setAssigneeOpen(false)} className="w-full text-center text-[11px] text-[#638BEF] pt-1">
                    Done
                  </button>
                </div>
              )}
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase text-[#777777] mb-1">Start Date</div>
              <input
                type="date"
                value={task.startDate ? dayjs(task.startDate).format('YYYY-MM-DD') : ''}
                onChange={(e) => inlinePatch({ startDate: e.target.value || null })}
                className="w-full rounded-md border border-[#E8E8E5] bg-white px-2 py-1 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
              />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase text-[#777777] mb-1">Due Date</div>
              <input
                type="date"
                value={task.dueDate ? dayjs(task.dueDate).format('YYYY-MM-DD') : ''}
                onChange={(e) => inlinePatch({ dueDate: e.target.value || null })}
                className="w-full rounded-md border border-[#E8E8E5] bg-white px-2 py-1 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
              />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase text-[#777777] mb-1">Hours (Act / Est)</div>
              <div className="font-mono font-semibold py-1">
                {task.actualHours || 0}h / {task.estimatedHours || 0}h ({task.completionPercentage || 0}%)
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#777777] mb-1">Description</div>
            {editingDesc ? (
              <div className="space-y-2">
                <textarea
                  rows={3}
                  autoFocus
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  className="w-full rounded-lg border border-[#638BEF] p-2 text-xs dark:bg-[#1E2025]"
                />
                <div className="flex gap-2">
                  <Button
                    size="xs"
                    onClick={() => {
                      setEditingDesc(false);
                      inlinePatch({ description: descDraft });
                    }}
                  >
                    Save
                  </Button>
                  <Button size="xs" variant="secondary" onClick={() => setEditingDesc(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p
                onClick={() => setEditingDesc(true)}
                className="cursor-text text-xs text-[#171717] dark:text-slate-300 hover:bg-[#F4F4F2] dark:hover:bg-white/5 rounded p-2 -mx-2"
              >
                {task.description || 'Click to add technical implementation notes...'}
              </p>
            )}
          </div>

          {/* Nested Subtasks */}
          <div className="rounded-xl border border-[#E8E8E5] dark:border-[#26282D] p-3.5">
            <button
              type="button"
              onClick={() => setSubtasksExpanded((s) => !s)}
              className="flex w-full items-center justify-between text-xs font-semibold"
            >
              <span className="flex items-center gap-1.5">
                {subtasksExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Subtasks ({task.subtasks?.length || 0})
              </span>
              <span className="text-[11px] font-normal text-[#777777]">
                {(task.subtasks || []).filter((s) => s.status === 'Completed').length}/{task.subtasks?.length || 0} done
              </span>
            </button>

            {subtasksExpanded && (
              <div className="mt-3 space-y-2">
                {(task.subtasks || []).map((sub) => (
                  <div
                    key={sub._id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-[#F4F4F2]/70 dark:bg-white/5 px-3 py-2 text-xs"
                  >
                    <button
                      onClick={() => openTaskDrawer(sub._id)}
                      className="flex items-center gap-2 text-left min-w-0 flex-1 hover:underline"
                    >
                      <span className="font-mono text-[10px] text-[#777777]">{sub.taskId}</span>
                      <span className={`truncate ${sub.status === 'Completed' ? 'line-through text-[#777777]' : 'font-medium'}`}>
                        {sub.title}
                      </span>
                    </button>
                    <select
                      value={sub.status}
                      onChange={async (e) => {
                        await api.patch(`/tasks/${sub._id}/status`, { status: e.target.value });
                        loadTask(true);
                        notifyLocalMutation('task');
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
                ))}

                <form onSubmit={handleCreateSubtask} className="flex gap-2 pt-1">
                  <input
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="Add nested subtask..."
                    className="flex-1 rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-1.5 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
                  />
                  <Button type="submit" size="xs">
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </form>
              </div>
            )}
          </div>

          {/* Quick Time Log */}
          <div className="rounded-xl border border-[#E8E8E5] dark:border-[#26282D] p-3.5">
            <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-[#35B8A6]" /> Record Time
            </div>
            <form onSubmit={handleLogTime} className="flex flex-col sm:flex-row gap-2">
              <input
                type="number"
                step="0.25"
                min="0.1"
                max="24"
                value={timeHours}
                onChange={(e) => setTimeHours(e.target.value)}
                className="w-20 rounded-lg border border-[#E8E8E5] px-2.5 py-1.5 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
              />
              <input
                value={timeDesc}
                onChange={(e) => setTimeDesc(e.target.value)}
                placeholder="What did you work on?"
                className="flex-1 rounded-lg border border-[#E8E8E5] px-2.5 py-1.5 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
              />
              <Button type="submit" size="xs">
                Log Hours
              </Button>
            </form>
            {(task.timeLogs || []).length > 0 && (
              <div className="mt-2.5 space-y-1 text-[11px] text-[#777777]">
                {task.timeLogs.slice(0, 4).map((l) => (
                  <div key={l._id} className="flex justify-between">
                    <span>
                      {l.employee?.fullName}: {l.workDescription}
                    </span>
                    <span className="font-mono font-semibold text-[#171717] dark:text-slate-200">{l.hoursSpent}h</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Attachments */}
          <div className="rounded-xl border border-[#E8E8E5] dark:border-[#26282D] p-3.5">
            <div className="flex items-center justify-between mb-2 text-xs">
              <span className="font-semibold">Attachments ({task.attachments?.length || 0})</span>
              <label className="cursor-pointer text-[#638BEF] hover:underline flex items-center gap-1">
                <Paperclip className="h-3.5 w-3.5" /> Upload
                <input type="file" className="hidden" onChange={handleUpload} />
              </label>
            </div>
            <div className="space-y-1 text-xs">
              {(task.attachments || []).map((a) => (
                <a key={a._id} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[#638BEF] hover:underline">
                  <FileText className="h-3.5 w-3.5" /> {a.originalName}
                </a>
              ))}
            </div>
          </div>

          {/* Comments */}
          <div className="space-y-2.5">
            <div className="text-xs font-semibold">Comments ({task.comments?.length || 0})</div>
            {(task.comments || []).map((c) => (
              <div key={c._id} className="rounded-lg border border-[#E8E8E5] dark:border-[#26282D] p-2.5 text-xs">
                <div className="flex justify-between mb-1">
                  <span className="font-semibold">{c.author?.fullName}</span>
                  <span className="text-[10px] text-[#777777]">{dayjs(c.createdAt).format('DD MMM, HH:mm')}</span>
                </div>
                <p>{c.body}</p>
              </div>
            ))}
            <form onSubmit={handlePostComment} className="flex gap-2">
              <input
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Comment on this task..."
                className="flex-1 rounded-lg border border-[#E8E8E5] px-3 py-1.5 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
              />
              <Button type="submit" size="xs">
                <Send className="h-3.5 w-3.5" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </Drawer>
  );
}
