import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Plus, Search, Building2, Server, Ticket, FolderKanban } from 'lucide-react';
import api, { getApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Loader from '../components/ui/Loader';
import EmptyState from '../components/ui/EmptyState';

export default function ClientsPage() {
  const { isManager } = useAuth();
  const { addToast } = useToast();
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { accountStatus: 'Active', sageX3Version: 'V12 P33', slaResponseHours: 24 },
  });

  const loadClients = async () => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const [cRes, uRes] = await Promise.all([api.get('/clients', { params }), api.get('/users?limit=100')]);
      setClients(cRes.data.data || []);
      setUsers(uRes.data.data || []);
    } catch (err) {
      addToast(getApiError(err, 'Failed to load clients'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, [search, statusFilter]);

  const onCreate = async (values) => {
    try {
      await api.post('/clients', values);
      addToast('Client profile created');
      setCreateOpen(false);
      reset({ accountStatus: 'Active', sageX3Version: 'V12 P33', slaResponseHours: 24 });
      loadClients();
    } catch (err) {
      addToast(getApiError(err, 'Failed to create client'), 'error');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Client Management"
        subtitle="Sage X3 customer profiles, folder codes, environments, and support agreements"
        actions={
          isManager && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Add Client
            </Button>
          )
        }
      />

      <Card padding={false} className="p-3.5">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company name, client ID, folder code (e.g. HTPROD)..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Onboarding">Onboarding</option>
            <option value="On Hold">On Hold</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </Card>

      {loading ? (
        <Loader label="Loading clients..." />
      ) : clients.length === 0 ? (
        <EmptyState icon={Building2} title="No clients found" description="Add a Sage X3 client profile to begin tracking issues." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {clients.map((c) => (
            <Link key={c._id} to={`/clients/${c._id}`}>
              <Card className="h-full hover:border-blue-400 dark:hover:border-blue-600 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                      {c.clientId}
                    </span>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{c.companyName}</h3>
                  </div>
                  <Badge value={c.accountStatus}>{c.accountStatus}</Badge>
                </div>

                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{c.companyDescription}</p>

                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="inline-flex items-center gap-1 rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono">
                    <Server className="h-3 w-3 text-slate-400" /> {c.sageX3Version}
                  </span>
                  <span className="rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 font-mono">
                    PROD: {c.productionFolderCode || c.clientFolderCode}
                  </span>
                  {c.pilotFolderCode && (
                    <span className="rounded bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 font-mono">
                      PILOT: {c.pilotFolderCode}
                    </span>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                  <span>{c.primaryContactPerson}</span>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <Ticket className="h-3.5 w-3.5" /> {c.stats?.openTickets || 0} open
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <FolderKanban className="h-3.5 w-3.5" /> {c.stats?.totalProjects || 0}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Sage X3 Client" maxWidth="max-w-3xl">
        <form onSubmit={handleSubmit(onCreate)} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Company Name *</label>
              <input
                {...register('companyName', { required: 'Company name is required' })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
              {errors.companyName && <p className="text-rose-500 mt-1">{errors.companyName.message}</p>}
            </div>
            <div>
              <label className="block font-medium mb-1">Primary Contact Person *</label>
              <input
                {...register('primaryContactPerson', { required: true })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Contact Email *</label>
              <input
                type="email"
                {...register('contactEmail', { required: true })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Contact Number</label>
              <input
                {...register('contactNumber')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Sage X3 Version</label>
              <input
                {...register('sageX3Version')}
                placeholder="V12 P33"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Primary Client Folder Code *</label>
              <input
                {...register('clientFolderCode', { required: true })}
                placeholder="HTPROD"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase font-mono dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-medium mb-1">Pilot Folder</label>
                <input
                  {...register('pilotFolderCode')}
                  placeholder="HTPILOT"
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm uppercase font-mono dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Prod Folder</label>
                <input
                  {...register('productionFolderCode')}
                  placeholder="HTPROD"
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm uppercase font-mono dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            </div>
            <div>
              <label className="block font-medium mb-1">Account Manager</label>
              <select
                {...register('accountManager')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="">Select manager...</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">SLA Response (Hours)</label>
              <input
                type="number"
                {...register('slaResponseHours')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Hosting Information</label>
              <input
                {...register('hostingInformation')}
                placeholder="AWS EC2 / On-premise SQL Server..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Integration Details</label>
              <input
                {...register('integrationDetails')}
                placeholder="SFTP MT940, REST Web Services, EDI..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Support Agreement & Notes</label>
              <textarea
                rows={2}
                {...register('supportAgreementInfo')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Client</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
