import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import api, { getApiError } from '../services/api';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Loader from '../components/ui/Loader';
import AccessControlPanel from '../components/settings/AccessControlPanel';
import EmailIntegrationPanel from '../components/settings/EmailIntegrationPanel';

const SETTINGS_SECTIONS = [
  { id: 'general', to: '/settings/general', label: 'General Settings' },
  { id: 'mailer', to: '/settings/mailer', label: 'Email & SMTP' },
  { id: 'access', to: '/settings/access-control', label: 'User & Access Management — Screen Permissions' },
  { id: 'integrations', to: '/settings/email-integrations', label: 'Integrations → Email Integration' },
];

export default function SettingsPage({ section }) {
  const { addToast } = useToast();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const resolvedTab =
    section ||
    (location.pathname.includes('access-control')
      ? 'access'
      : location.pathname.includes('email-integrations')
        ? 'integrations'
        : location.pathname.includes('mailer')
          ? 'mailer'
          : searchParams.get('tab') || 'general');

  const [settings, setSettings] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Mailer config local state (password never pre-filled)
  const [mailerDraft, setMailerDraft] = useState({ enabled: false, host: '', port: 587, secure: false, user: '', from: '', password: '' });
  const [testingMailer, setTestingMailer] = useState(false);

  useEffect(() => {
    api
      .get('/settings')
      .then((res) => {
        setSettings(res.data.data.settings);
        setTeams(res.data.data.teams || []);
        const mc = res.data.data.settings?.mailerConfig || {};
        setMailerDraft({ enabled: !!mc.enabled, host: mc.host || '', port: mc.port || 587, secure: !!mc.secure, user: mc.user || '', from: mc.from || '', password: '' });
      })
      .catch((err) => addToast(getApiError(err), 'error'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/settings', settings);
      addToast('Application settings saved');
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleMailerSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { mailerConfig: { ...mailerDraft } };
      if (!mailerDraft.password) delete payload.mailerConfig.password;
      await api.put('/settings', payload);
      addToast('SMTP configuration saved');
      // Refresh settings to get updated hasPassword
      const res = await api.get('/settings');
      setSettings(res.data.data.settings);
      setMailerDraft((d) => ({ ...d, password: '' }));
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestMailer = async () => {
    setTestingMailer(true);
    try {
      // Auto-save current draft first so user doesn't have to click Save before Test
      const payload = { mailerConfig: { ...mailerDraft, enabled: true } };
      if (!mailerDraft.password) delete payload.mailerConfig.password;
      await api.put('/settings', payload);
      const settingsRes = await api.get('/settings');
      setSettings(settingsRes.data.data.settings);
      setMailerDraft((d) => ({ ...d, enabled: true, password: '' }));

      const res = await api.post('/settings/test-mailer');
      const r = res.data?.data;
      if (r?.sent) {
        addToast(`Test email sent to ${r.to || 'your email'}`, 'success');
      } else {
        addToast(`Test failed: ${r?.reason || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      addToast(getApiError(err, 'SMTP test failed'), 'error');
    } finally {
      setTestingMailer(false);
    }
  };

  if (loading || !settings) return <Loader label="Loading settings..." />;

  const activeTab = resolvedTab;

  return (
    <div className="w-full space-y-5">
      <PageHeader title="Application Settings & Access Control" subtitle="Configure SLA defaults, integrations, and dynamic user screen & action permissions" />

      <div className="flex flex-wrap items-center gap-2">
        {SETTINGS_SECTIONS.map((sec) => (
          <Link
            key={sec.id}
            to={sec.to}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === sec.id
                ? 'bg-[#171717] text-white dark:bg-[#C6F36B] dark:text-[#171717]'
                : 'bg-white border border-[#E8E8E5] text-[#555555] hover:border-[#171717]/40 dark:bg-[#17181B] dark:border-[#2C2E33] dark:text-slate-300'
            }`}
          >
            {sec.label}
          </Link>
        ))}
      </div>

      {activeTab === 'access' ? (
        <AccessControlPanel />
      ) : activeTab === 'integrations' ? (
        <EmailIntegrationPanel />
      ) : activeTab === 'mailer' ? (
        <div className="w-full space-y-5">
          <form onSubmit={handleMailerSave} className="space-y-5">
            <Card>
              <h3 className="text-sm font-semibold mb-1">Email & SMTP Configuration</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Used for password reset emails, signup verification, and admin notifications. Leave password blank to keep the existing one.
              </p>
              <div className="space-y-3 text-xs">
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input type="checkbox" checked={mailerDraft.enabled} onChange={(e) => setMailerDraft((d) => ({ ...d, enabled: e.target.checked }))} className="h-3.5 w-3.5 rounded" />
                  <span>Enable SMTP mailer</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium mb-1">SMTP Host</label>
                    <input value={mailerDraft.host} onChange={(e) => setMailerDraft((d) => ({ ...d, host: e.target.value }))} placeholder="smtp.gmail.com" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Port</label>
                    <input type="number" value={mailerDraft.port} onChange={(e) => setMailerDraft((d) => ({ ...d, port: Number(e.target.value) }))} placeholder="587" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Username / Email</label>
                    <input type="email" value={mailerDraft.user} onChange={(e) => setMailerDraft((d) => ({ ...d, user: e.target.value }))} placeholder="sender@example.com" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">
                      Password
                      {settings?.mailerConfig?.hasPassword && <span className="ml-2 text-green-600 dark:text-green-400 font-normal">✓ Set</span>}
                    </label>
                    <input type="password" value={mailerDraft.password} onChange={(e) => setMailerDraft((d) => ({ ...d, password: e.target.value }))} placeholder={settings?.mailerConfig?.hasPassword ? 'Leave blank to keep existing' : 'Enter SMTP password'} autoComplete="new-password" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">From Address</label>
                    <input value={mailerDraft.from} onChange={(e) => setMailerDraft((d) => ({ ...d, from: e.target.value }))} placeholder='Sage X3 Desk <noreply@example.com>' className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={mailerDraft.secure} onChange={(e) => setMailerDraft((d) => ({ ...d, secure: e.target.checked }))} className="h-3.5 w-3.5 rounded" />
                      <span className="font-medium">SSL/TLS (port 465)</span>
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save SMTP Config'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestMailer}
                    disabled={testingMailer || (!settings?.mailerConfig?.hasPassword && !mailerDraft.password.trim())}
                  >
                    {testingMailer ? 'Sending…' : 'Send Test Email'}
                  </Button>
                  {!settings?.mailerConfig?.hasPassword && !mailerDraft.password.trim() && (
                    <span className="text-xs text-slate-400">Enter a password to test</span>
                  )}
                </div>
              </div>
            </Card>
          </form>
        </div>
      ) : (
        <div className="w-full space-y-5">
      <form onSubmit={handleSave} className="space-y-5">
        <Card>
          <h3 className="text-sm font-semibold mb-3">Organization & Governance</h3>
          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-medium mb-1">Workspace Name</label>
              <input
                value={settings.companyName || ''}
                onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!settings.requireApprovalForProductionDeployment}
                onChange={(e) =>
                  setSettings({ ...settings, requireApprovalForProductionDeployment: e.target.checked })
                }
              />
              <span>Require Team Lead / Admin approval before Production deployment</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!settings.allowManagerCloseTicketWaiver}
                onChange={(e) => setSettings({ ...settings, allowManagerCloseTicketWaiver: e.target.checked })}
              />
              <span>Allow authorized managers to waive incomplete tasks when closing tickets</span>
            </label>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold mb-3">Default SLA Targets (Hours)</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {['Critical', 'High', 'Medium', 'Low'].map((p) => (
              <div key={p}>
                <label className="block font-medium mb-1">{p}</label>
                <input
                  type="number"
                  value={settings.defaultSlaHours?.[p] ?? 24}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultSlaHours: { ...settings.defaultSlaHours, [p]: Number(e.target.value) },
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </Card>
      </form>

      <Card>
        <h3 className="text-sm font-semibold mb-3">Practice Teams ({teams.length})</h3>
        <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {teams.map((t) => (
            <div key={t._id} className="py-2.5 flex justify-between">
              <div>
                <div className="font-semibold">{t.name}</div>
                <div className="text-slate-500">{t.description}</div>
              </div>
              <div className="text-right text-slate-500">
                <div>Lead: {t.lead?.fullName}</div>
                <div>{t.members?.length || 0} members</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
        </div>
      )}
    </div>
  );
}
