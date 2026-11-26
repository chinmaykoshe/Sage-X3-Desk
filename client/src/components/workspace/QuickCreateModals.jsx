import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Paperclip, X } from 'lucide-react';
import api, { getApiError } from '../../services/api';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  TICKET_CATEGORIES,
  PRIORITIES,
  SEVERITIES,
  DEPLOYMENT_ENVIRONMENTS,
  TASK_STATUSES,
  TICKET_STATUSES,
} from '../../utils/constants';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';

export default function QuickCreateModals() {
  const {
    clients,
    users,
    projects,
    quickTicketModal,
    closeQuickTicket,
    quickTaskModal,
    closeQuickTask,
    notifyLocalMutation,
  } = useWorkspace();
  const { isManager } = useAuth();
  const { addToast } = useToast();

  const [tickets, setTickets] = useState([]);
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const ticketForm = useForm({
    defaultValues: {
      priority: 'Medium',
      severity: 'Minor',
      category: 'Bug / Error',
      sageX3Environment: 'Pilot',
      status: 'New',
    },
  });

  const taskForm = useForm({
    defaultValues: {
      priority: 'Medium',
      status: 'Todo',
      estimatedHours: 4,
      isIndependentInternalTask: false,
    },
  });

  const selectedClientId = ticketForm.watch('client');
  const isIndependent = taskForm.watch('isIndependentInternalTask');

  useEffect(() => {
    if (quickTicketModal.open) {
      setFiles([]);
      ticketForm.reset({
        priority: 'Medium',
        severity: 'Minor',
        category: 'Bug / Error',
        sageX3Environment: 'Pilot',
        status: quickTicketModal.defaults?.status || 'New',
        dueDate: quickTicketModal.defaults?.dueDate || '',
        client: quickTicketModal.defaults?.client || '',
        title: '',
        description: '',
      });
    }
  }, [quickTicketModal.open]);

  useEffect(() => {
    if (quickTaskModal.open) {
      api.get('/tickets?scope=all&limit=100').then((res) => setTickets(res.data.data || [])).catch(() => {});
      taskForm.reset({
        priority: 'Medium',
        status: quickTaskModal.defaults?.status || 'Todo',
        dueDate: quickTaskModal.defaults?.dueDate || '',
        ticket: quickTaskModal.defaults?.ticket || '',
        parentTask: quickTaskModal.defaults?.parentTask || '',
        estimatedHours: 4,
        isIndependentInternalTask: false,
        title: '',
        description: '',
      });
    }
  }, [quickTaskModal.open]);

  useEffect(() => {
    if (selectedClientId) {
      const c = clients.find((x) => x._id === selectedClientId);
      if (c) ticketForm.setValue('folderCode', c.pilotFolderCode || c.clientFolderCode);
    }
  }, [selectedClientId, clients]);

  const onCreateTicket = async (values) => {
    setSubmitting(true);
    try {
      const payload = {
        ...values,
        assignedDevelopers: Array.isArray(values.assignedDevelopers)
          ? values.assignedDevelopers
          : values.assignedDevelopers
          ? [values.assignedDevelopers]
          : [],
      };
      const { data } = await api.post('/tickets', payload);
      const created = data.data;

      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('entityType', 'ticket');
        fd.append('entityId', created._id);
        await api.post('/attachments', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }

      addToast(
        created.approvalStatus === 'APPROVED'
          ? `Created & auto-approved ${created.ticketId}`
          : `Submitted ${created.ticketId} for TL approval`
      );
      notifyLocalMutation('ticket');
      closeQuickTicket();
    } catch (err) {
      addToast(getApiError(err, 'Failed to create ticket'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const onCreateTask = async (values) => {
    setSubmitting(true);
    try {
      const { data } = await api.post('/tasks', {
        ...values,
        assignedEmployees: Array.isArray(values.assignedEmployees)
          ? values.assignedEmployees
          : values.assignedEmployees
          ? [values.assignedEmployees]
          : [],
      });
      addToast(`Created ${data.data.taskId}`);
      notifyLocalMutation('task');
      closeQuickTask();
    } catch (err) {
      addToast(getApiError(err, 'Failed to create task'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Quick Ticket Creation */}
      <Modal
        open={quickTicketModal.open}
        onClose={closeQuickTicket}
        title="Quick Create Ticket"
        subtitle="Create a Sage X3 support or development ticket without leaving your workspace"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={ticketForm.handleSubmit(onCreateTicket)} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Ticket Title *</label>
              <input
                {...ticketForm.register('title', { required: 'Title is required', minLength: 3 })}
                placeholder="e.g. Bank Statement Import Failure"
                className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
              />
            </div>

            <div>
              <label className="block font-medium mb-1">Client *</label>
              <select
                {...ticketForm.register('client', { required: true })}
                className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
              >
                <option value="">Select client...</option>
                {clients.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.companyName} ({c.clientFolderCode})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium mb-1">Category *</label>
              <select
                {...ticketForm.register('category', { required: true })}
                className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
              >
                {TICKET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium mb-1">Priority & Severity</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  {...ticketForm.register('priority')}
                  className="rounded-lg border border-[#E8E8E5] px-2.5 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <select
                  {...ticketForm.register('severity')}
                  className="rounded-lg border border-[#E8E8E5] px-2.5 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block font-medium mb-1">Sage X3 Environment & Folder</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  {...ticketForm.register('sageX3Environment')}
                  className="rounded-lg border border-[#E8E8E5] px-2.5 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
                >
                  {DEPLOYMENT_ENVIRONMENTS.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
                <input
                  {...ticketForm.register('folderCode')}
                  placeholder="HTPILOT"
                  className="rounded-lg border border-[#E8E8E5] px-2.5 py-2 text-sm uppercase font-mono dark:border-[#2C2E33] dark:bg-[#1E2025]"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium mb-1">Due Date</label>
              <input
                type="date"
                {...ticketForm.register('dueDate')}
                className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
              />
            </div>

            <div>
              <label className="block font-medium mb-1">Initial Status</label>
              <select
                {...ticketForm.register('status')}
                className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
              >
                {TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {isManager && (
              <>
                <div className="sm:col-span-2">
                  <label className="block font-medium mb-1.5">Assignees</label>
                  <div className="flex flex-wrap gap-1.5 rounded-lg border border-[#E8E8E5] bg-[#F4F4F2]/50 p-2 dark:border-[#2C2E33] dark:bg-[#1E2025]">
                    {users.map((u) => {
                      const current = ticketForm.watch('assignedDevelopers') || [];
                      const selected = Array.isArray(current) && current.includes(u._id);
                      return (
                        <button
                          key={u._id}
                          type="button"
                          onClick={() => {
                            const next = selected
                              ? current.filter((id) => id !== u._id)
                              : [...current, u._id];
                            ticketForm.setValue('assignedDevelopers', next);
                          }}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                            selected
                              ? 'border-[#171717] bg-[#C6F36B] text-[#171717]'
                              : 'border-[#E8E8E5] bg-white text-[#555555] hover:border-[#171717]/40 dark:border-[#2C2E33] dark:bg-[#17181B] dark:text-slate-300'
                          }`}
                        >
                          <Avatar name={u.fullName} color={u.avatarColor} size="xs" />
                          <span>{u.fullName}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium mb-1">Project (Optional)</label>
                  <select
                    {...ticketForm.register('project')}
                    className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
                  >
                    <option value="">None</option>
                    {projects
                      .filter((p) => !selectedClientId || p.client?._id === selectedClientId)
                      .map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.projectId} — {p.name}
                        </option>
                      ))}
                  </select>
                </div>
              </>
            )}

            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Description *</label>
              <textarea
                rows={3}
                {...ticketForm.register('description', { required: true, minLength: 5 })}
                onPaste={(e) => {
                  const items = Array.from(e.clipboardData?.items || []);
                  const pastedImages = items
                    .filter((it) => it.type.startsWith('image/'))
                    .map((it) => it.getAsFile())
                    .filter(Boolean);
                  if (pastedImages.length > 0) {
                    setFiles((prev) => [...prev, ...pastedImages]);
                  }
                }}
                placeholder="Describe the Sage X3 error, 4GL script, or enhancement request... (paste screenshots here too)"
                className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[#D8D8D3] px-3 py-2 text-xs text-[#555555] hover:bg-[#F4F4F2] dark:border-[#2C2E33] dark:text-slate-300">
                <Paperclip className="h-3.5 w-3.5" /> Attach logs, screenshots, or source files (paste supported)
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files || [])])}
                />
              </label>
              {files.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {files.map((f, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-md bg-[#F4F4F2] dark:bg-white/10 px-2 py-0.5 text-[11px]"
                    >
                      {f.name}
                      <button type="button" onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={closeQuickTicket}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Ticket'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Quick Task Creation */}
      <Modal open={quickTaskModal.open} onClose={closeQuickTask} title="Quick Create Task">
        <form onSubmit={taskForm.handleSubmit(onCreateTask)} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium mb-1">Task Title *</label>
            <input
              {...taskForm.register('title', { required: true })}
              placeholder="e.g. Modify ZMT940IMP 4GL script"
              className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
            />
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" {...taskForm.register('isIndependentInternalTask')} />
            <span>Independent internal task (no parent ticket)</span>
          </label>
          {!isIndependent && (
            <div>
              <label className="block font-medium mb-1">Parent Ticket *</label>
              <select
                {...taskForm.register('ticket', { required: !isIndependent })}
                className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
              >
                <option value="">Select parent ticket...</option>
                {tickets.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.ticketId} — {t.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block font-medium mb-1">Status</label>
              <select
                {...taskForm.register('status')}
                className="w-full rounded-lg border border-[#E8E8E5] px-2.5 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
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
              <label className="block font-medium mb-1">Due Date</label>
              <input
                type="date"
                {...taskForm.register('dueDate')}
                className="w-full rounded-lg border border-[#E8E8E5] px-2.5 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium mb-1">Assignees</label>
            <select
              multiple
              {...taskForm.register('assignedEmployees')}
              className="w-full rounded-lg border border-[#E8E8E5] px-3 py-1.5 text-xs h-20 dark:border-[#2C2E33] dark:bg-[#1E2025]"
            >
              {users.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={closeQuickTask}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Task'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
