import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Mail,
  Search,
  RefreshCw,
  PlusCircle,
  Link2,
  Ban,
  ExternalLink,
  Paperclip,
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

const STATUS_TABS = ['All', 'Pending Review', 'Processed', 'Unmatched', 'Failed', 'Ignored', 'Logs'];

export default function EmailInboxPage() {
  const { clients, tickets } = useWorkspace();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState('All');
  const [providerFilter, setProviderFilter] = useState('');
  const [search, setSearch] = useState('');
  const [messages, setMessages] = useState([]);
  const [counts, setCounts] = useState({});
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [linkTicketId, setLinkTicketId] = useState('');
  const [createClientId, setCreateClientId] = useState('');
  const [acting, setActing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'Logs') {
        const { data } = await api.get('/email/logs');
        setLogs(data.data || []);
      } else {
        const { data } = await api.get('/email/messages', {
          params: {
            status: tab,
            provider: providerFilter || undefined,
            search: search || undefined,
          },
        });
        setMessages(data.data.messages || []);
        setCounts(data.data.counts || {});
      }
    } catch (err) {
      addToast(getApiError(err, 'Failed to load email inbox'), 'error');
    } finally {
      setLoading(false);
    }
  }, [tab, providerFilter, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openDetail = async (id) => {
    try {
      const { data } = await api.get(`/email/messages/${id}`);
      const d = data.data;
      setSelected(d);
      setCreateClientId(d.matchedClientId?._id || '');
      setLinkTicketId('');
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post('/email/sync');
      addToast(data.message || 'Synced incoming emails and follow-ups');
      loadData();
    } catch (err) {
      addToast(getApiError(err, 'Failed to sync mailboxes'), 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleQuickConvert = async (m, e) => {
    e.stopPropagation();
    const cid = m.matchedClientId?._id || m.matchedClientId;
    if (!cid) {
      addToast('Select a client in the email drawer to convert to a ticket', 'info');
      openDetail(m._id);
      return;
    }
    setActing(true);
    try {
      const { data } = await api.post(`/email/messages/${m._id}/create-ticket`, { clientId: cid });
      const createdTicket = data.data;
      addToast(
        data.message || 'Converted email into pending ticket',
        'success',
        3000,
        createdTicket?._id
          ? {
              label: `Go to ${createdTicket.ticketId || 'Ticket'}`,
              onClick: () => navigate(`/tickets/${createdTicket._id}`),
            }
          : null
      );
      loadData();
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setActing(false);
    }
  };

  const handleCreateTicket = async () => {
    if (!selected) return;
    if (!createClientId) {
      addToast('Select a client first', 'error');
      return;
    }
    setActing(true);
    try {
      const { data } = await api.post(`/email/messages/${selected._id}/create-ticket`, { clientId: createClientId });
      const createdTicket = data.data;
      addToast(
        data.message || 'Created pending ticket for Admin/TL approval',
        'success',
        3000,
        createdTicket?._id
          ? {
              label: `Go to ${createdTicket.ticketId || 'Ticket'}`,
              onClick: () => navigate(`/tickets/${createdTicket._id}`),
            }
          : null
      );
      setSelected(null);
      loadData();
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setActing(false);
    }
  };

  const handleLinkTicket = async () => {
    if (!selected || !linkTicketId) {
      addToast('Select a target ticket first', 'error');
      return;
    }
    setActing(true);
    try {
      const { data } = await api.post(`/email/messages/${selected._id}/link-ticket`, { ticketId: linkTicketId });
      addToast(data.message || 'Linked email to ticket');
      setSelected(null);
      loadData();
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setActing(false);
    }
  };

  const handleAction = async (id, action, msg) => {
    setActing(true);
    try {
      await api.post(`/email/messages/${id}/${action}`);
      addToast(msg);
      setSelected(null);
      loadData();
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Email Intake & Review Workspace"
        subtitle="Monitor Outlook & Gmail incoming emails, resolve ambiguous matches, and route pending tickets for Admin/TL approval"
        actions={
          <div className="flex gap-2">
            <Link to="/approvals">
              <Button variant="secondary" size="sm">
                TL &amp; Admin Approvals <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </Link>
            <Button size="sm" variant="secondary" onClick={loadData}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button size="sm" disabled={syncing} onClick={handleSyncAll}>
              <Mail className="h-3.5 w-3.5" /> {syncing ? 'Syncing...' : 'Sync Mails & Follow-ups'}
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((t) => {
          const cnt =
            t === 'All'
              ? Object.values(counts).reduce((a, b) => a + b, 0)
              : t === 'Logs'
                ? null
                : counts[t] || 0;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t
                  ? 'border-[#171717] bg-[#C6F36B] text-[#171717] font-semibold'
                  : 'border-[#E8E8E5] bg-white text-[#555555] dark:border-[#2C2E33] dark:bg-[#17181B] dark:text-slate-300'
              }`}
            >
              <span>{t}</span>
              {cnt !== null && <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-bold">{cnt}</span>}
            </button>
          );
        })}
      </div>

      {tab !== 'Logs' && (
        <Card padding={false} className="p-3">
          <div className="flex flex-wrap gap-2.5">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#777777]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search subject, sender email, or body..."
                className="w-full rounded-lg border border-[#E8E8E5] bg-[#F4F4F2]/60 py-1.5 pl-8 pr-3 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
              />
            </div>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="rounded-lg border border-[#E8E8E5] bg-white px-3 py-1.5 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
            >
              <option value="">All Providers</option>
              <option value="outlook">Microsoft Outlook</option>
              <option value="gmail">Gmail</option>
            </select>
          </div>
        </Card>
      )}

      {loading ? (
        <Loader label="Loading email workspace..." />
      ) : tab === 'Logs' ? (
        <Card padding={false}>
          <div className="divide-y divide-[#E8E8E5] dark:divide-[#26282D] text-xs">
            {logs.length === 0 ? (
              <div className="py-10 text-center text-[#777777]">No email processing logs yet.</div>
            ) : (
              logs.map((l) => (
                <div key={l._id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-mono text-[11px] font-semibold uppercase text-[#638BEF] mr-2">
                      {l.processingStage}
                    </span>
                    <span className="font-medium">{l.message}</span>
                    {l.error && <div className="text-[11px] text-[#F16D64] mt-0.5">{l.error}</div>}
                  </div>
                  <div className="text-[11px] text-[#777777] shrink-0">
                    {l.mailboxId?.mailboxAddress} · {dayjs(l.timestamp).format('DD MMM HH:mm')}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      ) : messages.length === 0 ? (
        <Card className="py-12 text-center text-xs text-[#777777]">
          No emails in &quot;{tab}&quot;. Connect an Outlook or Gmail mailbox in Settings → Integrations.
        </Card>
      ) : (
        <div className="space-y-2.5">
          {messages.map((m) => (
            <Card key={m._id} className="p-4 cursor-pointer hover:border-[#171717]/40" onClick={() => openDetail(m._id)}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-[#171717] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#C6F36B]">
                      {m.provider}
                    </span>
                    <Badge value={m.processingStatus === 'Processed' ? 'Completed' : m.processingStatus === 'Failed' ? 'Blocked' : 'Pending'}>
                      {m.processingStatus}
                    </Badge>
                    {m.relatedTicketId && (
                      <span className="font-mono text-xs font-semibold text-[#35B8A6]">
                        {m.relatedTicketId.ticketId}
                      </span>
                    )}
                    <span className="text-sm font-semibold">{m.subject}</span>
                  </div>
                  <p className="text-xs text-[#777777]">
                    From: {m.sender?.name ? `${m.sender.name} <${m.sender.email}>` : m.sender?.email} · Mailbox: {m.mailboxId?.mailboxAddress} · Client: {m.matchedClientId?.companyName || 'Unmatched'}
                  </p>
                  {m.matchRationale && <p className="text-[11px] text-[#555555] dark:text-slate-400">{m.matchRationale}</p>}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <div className="text-[11px] text-[#777777]">
                    {dayjs(m.receivedAt).format('DD MMM YYYY, HH:mm')}
                  </div>
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {m.relatedTicketId ? (
                      <Link
                        to={`/tickets/${m.relatedTicketId._id || m.relatedTicketId}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#C6F36B] px-2.5 py-1 text-[11px] font-semibold text-[#171717] hover:opacity-90"
                      >
                        Open {m.relatedTicketId.ticketId} <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      m.processingStatus !== 'Ignored' && (
                        <Button size="xs" variant="primary" disabled={acting} onClick={(e) => handleQuickConvert(m, e)}>
                          <PlusCircle className="h-3 w-3 mr-1" /> Convert to Ticket
                        </Button>
                      )
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.subject || 'Email Details'}
        subtitle={selected ? `${selected.provider.toUpperCase()} · ${selected.processingStatus}` : ''}
        maxWidth="max-w-3xl"
      >
        {selected && (
          <div className="space-y-4 text-xs">
            <div className="rounded-xl border border-[#E8E8E5] dark:border-[#26282D] p-3 space-y-1">
              <div><strong>From:</strong> {selected.sender?.name} &lt;{selected.sender?.email}&gt;</div>
              <div><strong>To:</strong> {(selected.recipients || []).join(', ')}</div>
              <div><strong>Received:</strong> {dayjs(selected.receivedAt).format('DD MMM YYYY, HH:mm:ss')}</div>
              {selected.matchRationale && <div><strong>Match / AI Rationale:</strong> {selected.matchRationale}</div>}
              {selected.errorMessage && <div className="text-[#F16D64]"><strong>Error:</strong> {selected.errorMessage}</div>}
            </div>

            {selected.htmlBody ? (
              <div
                className="max-h-64 overflow-y-auto rounded-xl border border-[#E8E8E5] dark:border-[#26282D] p-3 bg-white dark:bg-[#141518]"
                dangerouslySetInnerHTML={{ __html: selected.htmlBody }}
              />
            ) : (
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-[#F4F4F2] dark:bg-black/30 p-3 font-sans">
                {selected.plainBody}
              </pre>
            )}

            {(selected.attachments || []).length > 0 && (
              <div className="space-y-1">
                <div className="font-semibold flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" /> Attachments</div>
                <div className="flex flex-wrap gap-2">
                  {selected.attachments.map((att) => (
                    <a key={att._id} href={att.url} target="_blank" rel="noreferrer" className="rounded border px-2 py-1 text-[#638BEF] hover:underline">
                      {att.originalName}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {!selected.relatedTicketId && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-[#E8E8E5] dark:border-[#26282D] pt-3">
                <div className="space-y-2">
                  <div className="font-semibold">Create Pending Approval Ticket</div>
                  <select
                    value={createClientId}
                    onChange={(e) => setCreateClientId(e.target.value)}
                    className="w-full rounded-lg border px-2 py-1.5 dark:bg-[#1E2025] dark:border-[#2C2E33]"
                  >
                    <option value="">Select Client...</option>
                    {clients.map((c) => (
                      <option key={c._id} value={c._id}>{c.companyName}</option>
                    ))}
                  </select>
                  <Button size="sm" disabled={acting} onClick={handleCreateTicket}>
                    <PlusCircle className="h-3.5 w-3.5 mr-1" /> Create Pending Ticket
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="font-semibold">Link to Existing Ticket</div>
                  <select
                    value={linkTicketId}
                    onChange={(e) => setLinkTicketId(e.target.value)}
                    className="w-full rounded-lg border px-2 py-1.5 dark:bg-[#1E2025] dark:border-[#2C2E33]"
                  >
                    <option value="">Select Ticket...</option>
                    {(tickets || []).map((t) => (
                      <option key={t._id} value={t._id}>{t.ticketId} — {t.title}</option>
                    ))}
                  </select>
                  <Button size="sm" variant="secondary" disabled={acting} onClick={handleLinkTicket}>
                    <Link2 className="h-3.5 w-3.5 mr-1" /> Link to Ticket
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-[#E8E8E5] dark:border-[#26282D] pt-3">
              {selected.relatedTicketId && (
                <Link to={`/tickets/${selected.relatedTicketId._id || selected.relatedTicketId}`}>
                  <Button type="button" size="sm" variant="primary">Open Ticket <ExternalLink className="h-3.5 w-3.5 ml-1" /></Button>
                </Link>
              )}
              <Button type="button" size="sm" variant="secondary" disabled={acting} onClick={() => handleAction(selected._id, 'retry', 'Email reprocessed')}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry
              </Button>
              <Button type="button" size="sm" variant="danger" disabled={acting} onClick={() => handleAction(selected._id, 'ignore', 'Email ignored')}>
                <Ban className="h-3.5 w-3.5 mr-1" /> Ignore
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
