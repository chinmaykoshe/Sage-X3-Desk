import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LifeBuoy,
  Plus,
  Search,
  Paperclip,
  Send,
  X,
  CheckCircle2,
  Trash2,
  ExternalLink,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import dayjs from 'dayjs';
import api, { getApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Loader from '../components/ui/Loader';
import Avatar from '../components/ui/Avatar';
import EmptyState from '../components/ui/EmptyState';

const HELP_CATEGORIES = [
  'UI / Layout Bug',
  'Login & Access Issue',
  'Performance / Slow',
  'AI Assistant Issue',
  'Timesheet / Calendar',
  'Email Integration',
  'Data / Sync Error',
  'Feature Request',
  'Other',
];

const HELP_SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
const HELP_STATUSES = ['Open', 'Under Review', 'In Progress', 'Resolved', 'Closed'];

const STATUS_BADGE = {
  Open: 'warning',
  'Under Review': 'info',
  'In Progress': 'info',
  Resolved: 'success',
  Closed: 'default',
};

function resolveUploadUrl(url = '') {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const apiBase = import.meta.env.VITE_API_URL || '';
  const origin = apiBase.replace(/\/api\/?$/, '');
  return `${origin}${url}`;
}

export default function HelpCenterPage() {
  const { user, isAdmin, socket } = useAuth();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tickets, setTickets] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: '',
    category: 'UI / Layout Bug',
    severity: 'Medium',
    pageUrl: '',
    description: '',
  });
  const [files, setFiles] = useState([]);

  const [selected, setSelected] = useState(null);
  const [adminStatus, setAdminStatus] = useState('Open');
  const [adminNotes, setAdminNotes] = useState('');
  const [savingAdmin, setSavingAdmin] = useState(false);

  const [replyText, setReplyText] = useState('');
  const [replyFiles, setReplyFiles] = useState([]);
  const [sendingReply, setSendingReply] = useState(false);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/help-tickets', {
        params: {
          status: statusFilter !== 'All' ? statusFilter : undefined,
          severity: severityFilter !== 'All' ? severityFilter : undefined,
          search: search.trim() || undefined,
        },
      });
      setTickets(data.data.tickets || []);
      setCounts(data.data.counts || {});
    } catch (err) {
      addToast(getApiError(err, 'Failed to load Help Center tickets'), 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter, search]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (!socket) return undefined;
    const onChanged = () => loadTickets();
    socket.on('help-ticket:changed', onChanged);
    return () => socket.off('help-ticket:changed', onChanged);
  }, [socket, loadTickets]);

  const openTicketDetail = useCallback(
    async (id) => {
      try {
        const { data } = await api.get(`/help-tickets/${id}`);
        const d = data.data;
        setSelected(d);
        setAdminStatus(d.status || 'Open');
        setAdminNotes(d.adminNotes || '');
        setReplyText('');
        setReplyFiles([]);
      } catch (err) {
        addToast(getApiError(err, 'Failed to load help ticket'), 'error');
      }
    },
    []
  );

  useEffect(() => {
    const qId = searchParams.get('ticket');
    if (qId) {
      openTicketDetail(qId);
    }
  }, [searchParams, openTicketDetail]);

  const handleOpenCreate = () => {
    setForm({
      title: '',
      category: 'UI / Layout Bug',
      severity: 'Medium',
      pageUrl: document.referrer || window.location.pathname || '',
      description: '',
    });
    setFiles([]);
    setCreateOpen(true);
  };

  const handleSubmitCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('category', form.category);
      fd.append('severity', form.severity);
      fd.append('pageUrl', form.pageUrl);
      fd.append('browserInfo', `${window.innerWidth}x${window.innerHeight} · ${navigator.userAgent.slice(0, 120)}`);
      fd.append('description', form.description);
      files.forEach((f) => fd.append('files', f));

      const { data } = await api.post('/help-tickets', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      addToast(data.message || 'Help ticket submitted to Admin', 'success');
      setCreateOpen(false);
      loadTickets();
    } catch (err) {
      addToast(getApiError(err, 'Failed to submit help ticket'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveAdminUpdate = async () => {
    if (!selected) return;
    setSavingAdmin(true);
    try {
      const { data } = await api.patch(`/help-tickets/${selected._id}`, {
        status: adminStatus,
        adminNotes,
      });
      setSelected(data.data);
      addToast(data.message || 'Help ticket updated', 'success');
      loadTickets();
    } catch (err) {
      addToast(getApiError(err, 'Failed to update help ticket'), 'error');
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!selected || (!replyText.trim() && replyFiles.length === 0)) return;
    setSendingReply(true);
    try {
      const fd = new FormData();
      fd.append('body', replyText.trim());
      replyFiles.forEach((f) => fd.append('files', f));
      const { data } = await api.post(`/help-tickets/${selected._id}/comments`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSelected(data.data);
      setReplyText('');
      setReplyFiles([]);
      addToast('Reply posted');
      loadTickets();
    } catch (err) {
      addToast(getApiError(err, 'Failed to send reply'), 'error');
    } finally {
      setSendingReply(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this software help ticket?')) return;
    try {
      await api.delete(`/help-tickets/${id}`);
      addToast('Help ticket removed');
      if (selected?._id === id) setSelected(null);
      loadTickets();
    } catch (err) {
      addToast(getApiError(err, 'Failed to delete help ticket'), 'error');
    }
  };

  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="Software Help Center"
        subtitle={
          isAdmin
            ? 'Review internal software bugs, UI glitches, and error uploads submitted directly by team members (separate from client tickets)'
            : 'Report software bugs, upload screenshots or error logs directly to Administrators (separate from client tickets)'
        }
        actions={
          <Button size="sm" onClick={handleOpenCreate}>
            <Plus className="h-3.5 w-3.5" /> Report Software Issue
          </Button>
        }
      />

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-950 dark:text-amber-200 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
        <span>
          <strong>Dedicated Internal Help Queue:</strong> Tickets logged here stay strictly inside the Software Help Center for Administrators and never appear in All Client Tickets, TL Approvals, Workload, or Client Reports.
        </span>
      </div>

      {/* Status Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {[
          ['All', totalCount, 'text-[#171717] dark:text-white'],
          ['Open', counts.Open || 0, 'text-amber-600'],
          ['Under Review', counts['Under Review'] || 0, 'text-[#638BEF]'],
          ['In Progress', counts['In Progress'] || 0, 'text-[#638BEF]'],
          ['Resolved', counts.Resolved || 0, 'text-[#35B8A6]'],
          ['Closed', counts.Closed || 0, 'text-[#777777]'],
        ].map(([st, cnt, cls]) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`text-left rounded-xl border p-3 transition-colors ${
              statusFilter === st
                ? 'border-[#171717] bg-[#C6F36B]/25 dark:border-[#C6F36B]'
                : 'border-[#E8E8E5] bg-white hover:border-[#171717]/40 dark:border-[#26282D] dark:bg-[#17181B]'
            }`}
          >
            <div className="text-[11px] font-medium text-[#777777]">{st}</div>
            <div className={`mt-0.5 text-xl font-bold ${cls}`}>{cnt}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="relative flex-1 min-w-full sm:min-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#777777]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search HLP ID, issue title, page URL, or description..."
              className="w-full rounded-lg border border-[#E8E8E5] bg-[#F4F4F2]/60 py-1.5 pl-8 pr-3 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
            />
          </div>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-1.5 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
          >
            <option value="All">All Severities</option>
            {HELP_SEVERITIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </Card>

      {/* Help Ticket List */}
      {loading ? (
        <Loader label="Loading Help Center tickets..." />
      ) : tickets.length === 0 ? (
        <Card>
          <EmptyState
            icon={LifeBuoy}
            title="No software issues reported yet"
            description="Encountered a UI bug, sync issue, or access glitch? Submit a help ticket with screenshots for Administrators."
            action={
              <Button size="sm" onClick={handleOpenCreate}>
                <Plus className="h-3.5 w-3.5" /> Report Software Issue
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {tickets.map((t) => (
            <Card
              key={t._id}
              onClick={() => openTicketDetail(t._id)}
              className="p-4 cursor-pointer hover:border-[#171717]/40 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#638BEF]">{t.helpTicketId}</span>
                    <Badge variant={STATUS_BADGE[t.status] || 'default'}>{t.status}</Badge>
                    <Badge variant="priority" value={t.severity}>{t.severity}</Badge>
                    <Badge>{t.category}</Badge>
                    {(t.attachments || []).length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded bg-[#F4F4F2] dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-medium">
                        <Paperclip className="h-3 w-3" /> {t.attachments.length} file(s)
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-[#171717] dark:text-white">{t.title}</h3>
                  <p className="text-xs text-[#555555] dark:text-slate-300 line-clamp-2">{t.description}</p>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 text-[11px] text-[#777777]">
                  <div className="flex items-center gap-1.5">
                    <Avatar name={t.submittedBy?.fullName} color={t.submittedBy?.avatarColor} size="xs" />
                    <span className="font-medium text-[#171717] dark:text-slate-200">{t.submittedBy?.fullName}</span>
                  </div>
                  <span>{dayjs(t.createdAt).format('DD MMM YYYY, HH:mm')}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Submit New Software Issue Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Report Software Issue to Admin"
        subtitle="Attach screenshots, error logs, or files — handled privately in the Help Center"
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSubmitCreate} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium mb-1">Issue Summary / Title *</label>
            <input
              required
              minLength={3}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Sidebar overlaps modal on mobile / Error 500 saving settings"
              className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block font-medium mb-1">Software Area / Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-lg border border-[#E8E8E5] px-2.5 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
              >
                {HELP_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Severity</label>
              <select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
                className="w-full rounded-lg border border-[#E8E8E5] px-2.5 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
              >
                {HELP_SEVERITIES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium mb-1">Affected Screen / URL (Optional)</label>
            <input
              value={form.pageUrl}
              onChange={(e) => setForm({ ...form, pageUrl: e.target.value })}
              placeholder="/tickets or /settings/email-integrations"
              className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-xs font-mono dark:border-[#2C2E33] dark:bg-[#1E2025]"
            />
          </div>

          <div>
            <label className="block font-medium mb-1">Detailed Description &amp; Steps to Reproduce *</label>
            <textarea
              required
              minLength={5}
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              onPaste={(e) => {
                const items = Array.from(e.clipboardData?.items || []);
                const pasted = items.filter((it) => it.type.startsWith('image/')).map((it) => it.getAsFile()).filter(Boolean);
                if (pasted.length > 0) setFiles((prev) => [...prev, ...pasted].slice(0, 5));
              }}
              placeholder="Explain what happened vs what you expected (you can paste screenshots directly here too)..."
              className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
            />
          </div>

          <div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[#CBD5E1] px-3 py-2 text-xs text-[#555555] hover:bg-[#F4F4F2] dark:border-[#2C2E33] dark:text-slate-300">
              <Paperclip className="h-3.5 w-3.5" /> Attach Screenshots, Logs, or Files (up to 5)
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files || [])].slice(0, 5))}
              />
            </label>
            {files.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded bg-[#F4F4F2] dark:bg-white/10 px-2 py-0.5 text-[11px]">
                    {f.name}
                    <button type="button" onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit to Admin'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Help Ticket Detail & Admin Resolution Modal */}
      <Modal
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          if (searchParams.get('ticket')) {
            const next = new URLSearchParams(searchParams);
            next.delete('ticket');
            setSearchParams(next, { replace: true });
          }
        }}
        title={selected ? `${selected.helpTicketId}: ${selected.title}` : ''}
        subtitle={selected ? `Reported by ${selected.submittedBy?.fullName} · ${dayjs(selected.createdAt).format('DD MMM YYYY, HH:mm')}` : ''}
        maxWidth="max-w-3xl"
      >
        {selected && (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_BADGE[selected.status] || 'default'}>{selected.status}</Badge>
              <Badge variant="priority" value={selected.severity}>{selected.severity}</Badge>
              <Badge>{selected.category}</Badge>
              {selected.pageUrl && (
                <span className="font-mono text-[11px] rounded bg-[#F4F4F2] dark:bg-white/10 px-2 py-0.5">
                  Screen: {selected.pageUrl}
                </span>
              )}
            </div>

            <div className="rounded-xl border border-[#E8E8E5] dark:border-[#26282D] p-3 whitespace-pre-line leading-relaxed text-[#333333] dark:text-slate-200">
              {selected.description}
            </div>

            {selected.browserInfo && (
              <div className="text-[11px] font-mono text-[#777777]">Environment: {selected.browserInfo}</div>
            )}

            {/* Uploaded Files & Screenshots */}
            {(selected.attachments || []).length > 0 && (
              <div className="space-y-2">
                <div className="font-semibold text-[#777777] uppercase text-[10px] tracking-wider">
                  Uploaded Attachments ({selected.attachments.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {selected.attachments.map((att) => {
                    const url = resolveUploadUrl(att.url);
                    const isImg = (att.mimeType || '').startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(att.originalName || '');
                    return (
                      <a
                        key={att._id || att.filename}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="group rounded-xl border border-[#E8E8E5] dark:border-[#26282D] overflow-hidden hover:border-[#638BEF]"
                      >
                        {isImg ? (
                          <img src={url} alt={att.originalName} className="h-36 w-full object-cover bg-[#F4F4F2]" />
                        ) : (
                          <div className="h-20 flex items-center justify-center bg-[#F4F4F2] dark:bg-white/5">
                            <FileText className="h-6 w-6 text-[#638BEF]" />
                          </div>
                        )}
                        <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px]">
                          <span className="truncate font-medium">{att.originalName}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 text-[#638BEF]" />
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Admin Status & Resolution Controls */}
            {isAdmin ? (
              <div className="rounded-xl border border-[#638BEF]/30 bg-[#638BEF]/5 p-3 space-y-2.5">
                <div className="font-semibold text-[#638BEF]">Administrator Review &amp; Resolution</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block font-medium mb-1">Status</label>
                    <select
                      value={adminStatus}
                      onChange={(e) => setAdminStatus(e.target.value)}
                      className="w-full rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-1.5 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
                    >
                      {HELP_STATUSES.map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-medium mb-1">Admin Response / Fix Notes</label>
                    <input
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Explain resolution or workaround for the reporter..."
                      className="w-full rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-1.5 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button size="xs" disabled={savingAdmin} onClick={handleSaveAdminUpdate}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> {savingAdmin ? 'Saving...' : 'Save Admin Update'}
                  </Button>
                </div>
              </div>
            ) : (
              selected.adminNotes && (
                <div className="rounded-xl border border-[#35B8A6]/30 bg-[#35B8A6]/10 p-3">
                  <div className="font-semibold text-[#1b7a6d] dark:text-[#6fe0d0] mb-0.5">Admin Response</div>
                  <p>{selected.adminNotes}</p>
                </div>
              )
            )}

            {/* Discussion & Follow-up Uploads */}
            <div className="border-t border-[#E8E8E5] dark:border-[#26282D] pt-3 space-y-2.5">
              <div className="font-semibold">Discussion ({(selected.comments || []).length})</div>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {(selected.comments || []).length === 0 ? (
                  <p className="text-[#777777]">No replies yet.</p>
                ) : (
                  selected.comments.map((c) => (
                    <div key={c._id} className="rounded-lg border border-[#E8E8E5] dark:border-[#26282D] p-2.5 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold">
                          {c.author?.fullName} {c.author?.role === 'admin' ? '(Admin)' : ''}
                        </span>
                        <span className="text-[#777777]">{dayjs(c.createdAt).format('DD MMM, HH:mm')}</span>
                      </div>
                      <p className="whitespace-pre-line">{c.body}</p>
                      {(c.attachments || []).length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {c.attachments.map((att) => (
                            <a
                              key={att._id || att.filename}
                              href={resolveUploadUrl(att.url)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded bg-[#F4F4F2] dark:bg-white/10 px-2 py-0.5 text-[11px] text-[#638BEF] hover:underline"
                            >
                              <Paperclip className="h-3 w-3" /> {att.originalName}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleSendReply} className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer rounded-lg border border-[#E8E8E5] p-2 hover:bg-[#F4F4F2] dark:border-[#2C2E33] dark:hover:bg-white/10">
                    <Paperclip className="h-3.5 w-3.5" />
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => setReplyFiles((p) => [...p, ...Array.from(e.target.files || [])].slice(0, 5))}
                    />
                  </label>
                  <input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Add a reply or paste screenshot info..."
                    className="flex-1 rounded-lg border border-[#E8E8E5] px-3 py-1.5 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
                  />
                  <Button type="submit" size="xs" disabled={sendingReply}>
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {replyFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {replyFiles.map((f, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 rounded bg-[#F4F4F2] dark:bg-white/10 px-2 py-0.5 text-[11px]">
                        {f.name}
                        <button type="button" onClick={() => setReplyFiles((p) => p.filter((_, i) => i !== idx))}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </form>
            </div>

            <div className="flex justify-between pt-2 border-t border-[#E8E8E5] dark:border-[#26282D]">
              {(isAdmin || String(selected.submittedBy?._id) === String(user?._id)) ? (
                <Button size="xs" variant="danger" onClick={() => handleDelete(selected._id)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Ticket
                </Button>
              ) : (
                <div />
              )}
              <Button size="sm" variant="secondary" onClick={() => setSelected(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
