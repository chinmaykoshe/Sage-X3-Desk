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
        : searchParams.get('tab') || 'general');

  const [settings, setSettings] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/settings')
      .then((res) => {
        setSettings(res.data.data.settings);
        setTeams(res.data.data.teams || []);
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

  if (loading || !settings) return <Loader label="Loading settings..." />;

  const activeTab = resolvedTab;

  return (
    <div className="space-y-5 max-w-6xl">
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
      ) : (
        <div className="space-y-5 max-w-4xl">
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
