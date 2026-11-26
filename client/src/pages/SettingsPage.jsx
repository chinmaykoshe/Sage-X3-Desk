import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { getApiError } from '../services/api';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Loader from '../components/ui/Loader';
import AccessControlPanel from '../components/settings/AccessControlPanel';
import EmailIntegrationPanel from '../components/settings/EmailIntegrationPanel';

export default function SettingsPage() {
  const { addToast } = useToast();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'general');
  const [settings, setSettings] = useState(null);
  const [teams, setTeams] = useState([]);
  const [backupStatus, setBackupStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/settings')
      .then((res) => {
        setSettings(res.data.data.settings);
        setTeams(res.data.data.teams || []);
        setBackupStatus(res.data.data.backupStatus || null);
      })
      .catch((err) => addToast(getApiError(err), 'error'))
      .finally(() => setLoading(false));
  }, []);

  const handleSyncBackup = async () => {
    try {
      const { data } = await api.post('/settings/backup-sync');
      addToast(data.message);
    } catch (err) {
      addToast(getApiError(err, 'Backup sync is not available for now. Please try again after a while.'), 'error');
    }
  };

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

  return (
    <div className="space-y-5 max-w-6xl">
      <PageHeader title="Application Settings & Access Control" subtitle="Configure SLA defaults, Supabase sync, and dynamic user screen & action permissions" />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('general')}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === 'general'
              ? 'bg-[#171717] text-white dark:bg-[#C6F36B] dark:text-[#171717]'
              : 'bg-white border border-[#E8E8E5] text-[#555555] dark:bg-[#17181B] dark:border-[#2C2E33] dark:text-slate-300'
          }`}
        >
          General &amp; Supabase Sync
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('access')}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === 'access'
              ? 'bg-[#171717] text-white dark:bg-[#C6F36B] dark:text-[#171717]'
              : 'bg-white border border-[#E8E8E5] text-[#555555] dark:bg-[#17181B] dark:border-[#2C2E33] dark:text-slate-300'
          }`}
        >
          User &amp; Access Management — Screen Permissions
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('integrations')}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === 'integrations'
              ? 'bg-[#171717] text-white dark:bg-[#C6F36B] dark:text-[#171717]'
              : 'bg-white border border-[#E8E8E5] text-[#555555] dark:bg-[#17181B] dark:border-[#2C2E33] dark:text-slate-300'
          }`}
        >
          Integrations → Email Integration
        </button>
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold">Database & Dual-Backup Sync (MongoDB ↔ Supabase)</h3>
            <p className="text-xs text-[#777777]">
              Primary: {backupStatus?.primaryDatabase || 'MongoDB (Connected)'}
            </p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={handleSyncBackup}>
            Sync Dual-Backup
          </Button>
        </div>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
          {backupStatus?.message || 'Supabase dual-backup sync is not available for now. Please try again after a while.'}
        </div>
      </Card>

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
