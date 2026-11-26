import { useEffect, useState } from 'react';
import {
  Mail,
  Plus,
  RefreshCw,
  CheckCircle2,
  PlugZap,
  Unplug,
  Trash2,
  Shield,
  ExternalLink,
} from 'lucide-react';
import dayjs from 'dayjs';
import api, { getApiError } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { PRIORITIES } from '../../utils/constants';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Modal from '../ui/Modal';

const DEFAULT_RULES = {
  autoCreateTickets: true,
  autoUpdateExistingTickets: true,
  filterSpamAndAutoReplies: true,
  defaultPriority: 'Medium',
  enableAiAnalysis: true,
  enableAttachmentProcessing: true,
  sendUncertainToReview: true,
  trustedAutoApproval: false,
  ignoreSendersText: '',
  ignoreFoldersText: '',
};

export default function EmailIntegrationPanel() {
  const { addToast } = useToast();
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState(null);

  const [form, setForm] = useState({
    id: '',
    provider: 'outlook',
    mailboxAddress: '',
    displayName: '',
    tenantId: '',
    clientId: '',
    projectId: '',
    pubsubTopic: '',
    clientSecret: '',
    refreshToken: '',
    hasClientSecret: false,
    hasOAuthTokens: false,
    rules: { ...DEFAULT_RULES },
  });

  const loadIntegrations = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/email/integrations');
      setIntegrations(data.data || []);
    } catch (err) {
      addToast(getApiError(err, 'Failed to load email integrations'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIntegrations();
  }, []);

  const openNew = (provider = 'outlook') => {
    setForm({
      id: '',
      provider,
      mailboxAddress: '',
      displayName: '',
      tenantId: '',
      clientId: '',
      projectId: '',
      pubsubTopic: '',
      clientSecret: '',
      refreshToken: '',
      hasClientSecret: false,
      hasOAuthTokens: false,
      rules: { ...DEFAULT_RULES },
    });
    setModalOpen(true);
  };

  const openEdit = (item) => {
    const r = item.automationRules || {};
    setForm({
      id: item._id,
      provider: item.provider,
      mailboxAddress: item.mailboxAddress || '',
      displayName: item.displayName || '',
      tenantId: item.publicConfig?.tenantId || '',
      clientId: item.publicConfig?.clientId || '',
      projectId: item.publicConfig?.projectId || '',
      pubsubTopic: item.publicConfig?.pubsubTopic || '',
      clientSecret: '', // Never pre-fill or display stored secret
      refreshToken: '', // Never pre-fill or display stored token
      hasClientSecret: Boolean(item.hasClientSecret),
      hasOAuthTokens: Boolean(item.hasOAuthTokens),
      rules: {
        autoCreateTickets: r.autoCreateTickets !== false,
        autoUpdateExistingTickets: r.autoUpdateExistingTickets !== false,
        filterSpamAndAutoReplies: r.filterSpamAndAutoReplies !== false,
        defaultPriority: r.defaultPriority || 'Medium',
        enableAiAnalysis: r.enableAiAnalysis !== false,
        enableAttachmentProcessing: r.enableAttachmentProcessing !== false,
        sendUncertainToReview: r.sendUncertainToReview !== false,
        trustedAutoApproval: Boolean(r.trustedAutoApproval),
        ignoreSendersText: (r.ignoreSenders || []).join(', '),
        ignoreFoldersText: (r.ignoreFoldersOrLabels || []).join(', '),
      },
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/email/integrations', {
        id: form.id || undefined,
        provider: form.provider,
        mailboxAddress: form.mailboxAddress,
        displayName: form.displayName || form.mailboxAddress,
        publicConfig: {
          tenantId: form.tenantId,
          clientId: form.clientId,
          projectId: form.projectId,
          pubsubTopic: form.pubsubTopic,
        },
        credentials: {
          ...(form.clientSecret ? { clientSecret: form.clientSecret } : {}),
          ...(form.refreshToken ? { refreshToken: form.refreshToken } : {}),
        },
        automationRules: {
          autoCreateTickets: form.rules.autoCreateTickets,
          autoUpdateExistingTickets: form.rules.autoUpdateExistingTickets,
          filterSpamAndAutoReplies: form.rules.filterSpamAndAutoReplies,
          defaultPriority: form.rules.defaultPriority,
          enableAiAnalysis: form.rules.enableAiAnalysis,
          enableAttachmentProcessing: form.rules.enableAttachmentProcessing,
          sendUncertainToReview: form.rules.sendUncertainToReview,
          trustedAutoApproval: form.rules.trustedAutoApproval,
          ignoreSenders: form.rules.ignoreSendersText
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
          ignoreFoldersOrLabels: form.rules.ignoreFoldersText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
      addToast('Mailbox configuration encrypted & saved');
      setModalOpen(false);
      loadIntegrations();
    } catch (err) {
      addToast(getApiError(err, 'Failed to save configuration'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (id, path, successMsg) => {
    setActingId(id);
    try {
      const { data } = await api.post(`/email/integrations/${id}/${path}`);
      addToast(data.message || successMsg);
      loadIntegrations();
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setActingId(null);
    }
  };

  const handleGmailOAuth = async (id) => {
    try {
      const { data } = await api.get('/email/integrations/gmail/auth-url', {
        params: { integrationId: id, redirectUri: window.location.origin },
      });
      if (data.data?.url) window.location.href = data.data.url;
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handleImportGoogleJson = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const cfg = parsed.web || parsed.installed || {};
      if (!cfg.client_id) throw new Error('Invalid Google OAuth JSON');
      setForm((prev) => ({
        ...prev,
        provider: 'gmail',
        projectId: cfg.project_id || prev.projectId,
        clientId: cfg.client_id || prev.clientId,
        clientSecret: cfg.client_secret || prev.clientSecret,
      }));
      addToast('Imported Google OAuth credentials — enter mailbox email and click Save Configuration');
    } catch (err) {
      addToast(err.message || 'Failed to parse Google JSON', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleDelete = async (id) => {
    setActingId(id);
    try {
      await api.delete(`/email/integrations/${id}`);
      addToast('Mailbox removed');
      loadIntegrations();
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Mail className="h-4 w-4 text-[#638BEF]" /> Email Integration (Outlook &amp; Gmail)
            </h3>
            <p className="text-xs text-[#777777] mt-0.5">
              Admin-only mailbox setup. Secrets are AES-256-GCM encrypted at rest and never displayed after saving. All email-created tickets require Admin or Team Lead approval.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => openNew('outlook')}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Connect Outlook
            </Button>
            <Button size="sm" variant="secondary" onClick={() => openNew('gmail')}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Connect Gmail
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="py-10 text-center text-xs text-[#777777]">Loading connected mailboxes...</Card>
      ) : integrations.length === 0 ? (
        <Card className="py-10 text-center text-xs text-[#777777]">
          No Outlook or Gmail mailboxes connected yet. Click <strong>Connect Outlook</strong> or <strong>Connect Gmail</strong> above to configure automated email intake.
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {integrations.map((item) => (
            <Card key={item._id} className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-[#171717] px-2 py-0.5 text-[10px] font-bold uppercase text-[#C6F36B]">
                      {item.provider}
                    </span>
                    <Badge value={item.connectionStatus === 'Connected' ? 'Active' : item.connectionStatus === 'Error' ? 'Blocked' : 'Pending'}>
                      {item.connectionStatus}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm font-semibold">{item.displayName || item.mailboxAddress}</div>
                  <div className="text-xs text-[#777777] font-mono">{item.mailboxAddress}</div>
                </div>
                <Button size="xs" variant="secondary" onClick={() => openEdit(item)}>
                  Edit Config &amp; Rules
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#F4F4F2]/70 dark:bg-white/5 p-2.5 text-[11px]">
                <div>
                  <span className="text-[#777777]">Secret / OAuth:</span>{' '}
                  <strong>{item.hasClientSecret ? 'Encrypted' : 'Missing'}</strong>
                  {item.hasOAuthTokens ? ' · Token Ready' : ''}
                </div>
                <div>
                  <span className="text-[#777777]">Last Sync:</span>{' '}
                  <strong>{item.lastSyncedAt ? dayjs(item.lastSyncedAt).format('DD MMM, HH:mm') : 'Never'}</strong>
                </div>
                <div>
                  <span className="text-[#777777]">Subscription:</span>{' '}
                  <strong>{item.subscriptionId ? 'Active' : 'Not registered'}</strong>
                </div>
                <div>
                  <span className="text-[#777777]">Expires:</span>{' '}
                  <strong>{item.subscriptionExpiration ? dayjs(item.subscriptionExpiration).format('DD MMM, HH:mm') : '—'}</strong>
                </div>
              </div>

              {item.lastError && (
                <div className="rounded-lg border border-[#F16D64]/40 bg-[#F16D64]/10 p-2 text-[11px] text-[#c93e35]">
                  {item.lastError}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 pt-1">
                <Button size="xs" variant="secondary" disabled={actingId === item._id} onClick={() => runAction(item._id, 'test', 'Connection verified')}>
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Test Connection
                </Button>
                <Button size="xs" variant="primary" disabled={actingId === item._id} onClick={() => runAction(item._id, 'sync', 'Synchronized')}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Sync Now
                </Button>
                <Button size="xs" variant="secondary" disabled={actingId === item._id} onClick={() => runAction(item._id, 'renew', 'Subscription renewed')}>
                  <PlugZap className="h-3 w-3 mr-1" /> Renew Watch/Sub
                </Button>
                {item.provider === 'gmail' && (
                  <Button size="xs" variant="secondary" onClick={() => handleGmailOAuth(item._id)}>
                    <ExternalLink className="h-3 w-3 mr-1" /> Authorize Google
                  </Button>
                )}
                <Button size="xs" variant="secondary" disabled={actingId === item._id} onClick={() => runAction(item._id, 'disconnect', 'Disconnected')}>
                  <Unplug className="h-3 w-3 mr-1" /> Disconnect
                </Button>
                <Button size="xs" variant="danger" disabled={actingId === item._id} onClick={() => handleDelete(item._id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`${form.id ? 'Edit' : 'Connect'} ${form.provider === 'outlook' ? 'Microsoft Outlook (Graph API)' : 'Gmail / Google Workspace'}`}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSave} className="space-y-3 text-xs">
          {form.provider === 'gmail' && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E8E8E5] dark:border-[#2C2E33] bg-[#F4F4F2]/60 dark:bg-white/5 px-3 py-2">
              <span className="text-[11px] text-[#555555] dark:text-slate-300">
                Have a Google <code className="font-mono">client_secret_*.json</code>? Import it to auto-fill Project ID, Client ID &amp; Secret.
              </span>
              <label className="cursor-pointer rounded-md bg-[#171717] px-2.5 py-1 text-[11px] font-semibold text-[#C6F36B]">
                Import Google JSON
                <input type="file" accept=".json,application/json" className="hidden" onChange={handleImportGoogleJson} />
              </label>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Provider</label>
              <select
                value={form.provider}
                disabled={Boolean(form.id)}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]"
              >
                <option value="outlook">Microsoft Outlook / M365</option>
                <option value="gmail">Gmail / Google Workspace</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Mailbox Email Address *</label>
              <input
                required
                type="email"
                value={form.mailboxAddress}
                onChange={(e) => setForm({ ...form, mailboxAddress: e.target.value })}
                placeholder="support@company.com"
                className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]"
              />
            </div>

            {form.provider === 'outlook' ? (
              <div>
                <label className="block font-medium mb-1">Microsoft Entra Tenant ID *</label>
                <input
                  required={!form.id}
                  value={form.tenantId}
                  onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 font-mono dark:bg-[#1E2025] dark:border-[#2C2E33]"
                />
              </div>
            ) : (
              <div>
                <label className="block font-medium mb-1">Google Cloud Project ID</label>
                <input
                  value={form.projectId}
                  onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 font-mono dark:bg-[#1E2025] dark:border-[#2C2E33]"
                />
              </div>
            )}

            <div>
              <label className="block font-medium mb-1">OAuth Client ID *</label>
              <input
                required={!form.id}
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 font-mono dark:bg-[#1E2025] dark:border-[#2C2E33]"
              />
            </div>

            <div>
              <label className="block font-medium mb-1">
                Client Secret{' '}
                {form.id && form.hasClientSecret && (
                  <span className="text-[#35B8A6] font-normal">(Saved &amp; Encrypted — leave blank to keep)</span>
                )}
              </label>
              <input
                type="password"
                required={!form.id}
                value={form.clientSecret}
                onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
                placeholder={form.hasClientSecret ? '•••••••••••••••• (stored encrypted)' : 'Enter client secret'}
                className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]"
              />
            </div>

            {form.provider === 'gmail' ? (
              <>
                <div>
                  <label className="block font-medium mb-1">Pub/Sub Topic (projects/.../topics/...)</label>
                  <input
                    value={form.pubsubTopic}
                    onChange={(e) => setForm({ ...form, pubsubTopic: e.target.value })}
                    placeholder="projects/my-proj/topics/gmail-x3"
                    className="w-full rounded-lg border px-3 py-2 font-mono dark:bg-[#1E2025] dark:border-[#2C2E33]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium mb-1">
                    OAuth Refresh Token{' '}
                    {form.id && form.hasOAuthTokens ? (
                      <span className="text-[#35B8A6] font-normal">(Saved &amp; Encrypted — leave blank to keep)</span>
                    ) : (
                      <span className="text-[#777777] font-normal">(optional if using Authorize Google)</span>
                    )}
                  </label>
                  <input
                    type="password"
                    value={form.refreshToken}
                    onChange={(e) => setForm({ ...form, refreshToken: e.target.value })}
                    placeholder={form.hasOAuthTokens ? '•••••••••••••••• (stored encrypted)' : 'Paste refresh token or click Authorize Google'}
                    className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block font-medium mb-1">Display Name</label>
                <input
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  placeholder="Sage X3 Support Mailbox"
                  className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]"
                />
              </div>
            )}
          </div>

          <div className="border-t border-[#E8E8E5] dark:border-[#26282D] pt-3 space-y-2">
            <div className="font-semibold flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-[#35B8A6]" /> Mailbox Automation Rules
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                ['autoCreateTickets', 'Auto-create PENDING_APPROVAL tickets for new issues'],
                ['autoUpdateExistingTickets', 'Auto-append replies to matched existing tickets'],
                ['filterSpamAndAutoReplies', 'Filter out-of-office, bounces & auto-replies'],
                ['enableAiAnalysis', 'Analyze email via local Ollama AI'],
                ['enableAttachmentProcessing', 'Download & attach email files safely'],
                ['sendUncertainToReview', 'Send ambiguous / unmatched emails to Manual Review'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(form.rules[key])}
                    onChange={(e) => setForm({ ...form, rules: { ...form.rules, [key]: e.target.checked } })}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <div>
                <label className="block font-medium mb-1">Default Priority</label>
                <select
                  value={form.rules.defaultPriority}
                  onChange={(e) => setForm({ ...form, rules: { ...form.rules, defaultPriority: e.target.value } })}
                  className="w-full rounded-lg border px-2 py-1.5 dark:bg-[#1E2025] dark:border-[#2C2E33]"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Ignore Senders (comma-separated)</label>
                <input
                  value={form.rules.ignoreSendersText}
                  onChange={(e) => setForm({ ...form, rules: { ...form.rules, ignoreSendersText: e.target.value } })}
                  placeholder="noreply@domain.com"
                  className="w-full rounded-lg border px-2 py-1.5 dark:bg-[#1E2025] dark:border-[#2C2E33]"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Ignore Labels / Folders</label>
                <input
                  value={form.rules.ignoreFoldersText}
                  onChange={(e) => setForm({ ...form, rules: { ...form.rules, ignoreFoldersText: e.target.value } })}
                  placeholder="SPAM, TRASH"
                  className="w-full rounded-lg border px-2 py-1.5 dark:bg-[#1E2025] dark:border-[#2C2E33]"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Encrypting & Saving...' : 'Save Configuration'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
