import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Plus, Server, Trash2, Upload, FileText, Pencil } from 'lucide-react';
import dayjs from 'dayjs';
import api, { getApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Loader from '../components/ui/Loader';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'tickets', label: 'Tickets' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'projects', label: 'Projects' },
  { id: 'deployments', label: 'Deployments' },
  { id: 'activity', label: 'Activity History' },
  { id: 'documents', label: 'Documents' },
];

export default function ClientDetailPage() {
  const { id } = useParams();
  const { isManager } = useAuth();
  const { addToast } = useToast();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [envModalOpen, setEnvModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const envForm = useForm({ defaultValues: { environmentType: 'Pilot' } });
  const editForm = useForm();

  const loadClient = async () => {
    try {
      const { data } = await api.get(`/clients/${id}`);
      setClient(data.data);
    } catch (err) {
      addToast(getApiError(err, 'Failed to load client'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClient();
  }, [id]);

  const openEditClient = () => {
    if (!client) return;
    editForm.reset({
      companyName: client.companyName || '',
      primaryContactPerson: client.primaryContactPerson || '',
      contactEmail: client.contactEmail || '',
      contactNumber: client.contactNumber || '',
      address: client.address || '',
      accountStatus: client.accountStatus || 'Active',
      sageX3Version: client.sageX3Version || 'V12 P33',
      clientFolderCode: client.clientFolderCode || '',
      pilotFolderCode: client.pilotFolderCode || '',
      productionFolderCode: client.productionFolderCode || '',
      hostingInformation: client.hostingInformation || '',
      integrationDetails: client.integrationDetails || '',
      supportAgreementInfo: client.supportAgreementInfo || '',
    });
    setEditModalOpen(true);
  };

  const handleSaveClient = async (values) => {
    setSavingEdit(true);
    try {
      await api.put(`/clients/${id}`, values);
      addToast('Client updated');
      setEditModalOpen(false);
      loadClient();
    } catch (err) {
      addToast(getApiError(err, 'Failed to update client'), 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAddEnv = async (values) => {
    try {
      await api.post(`/clients/${id}/environments`, values);
      addToast('Sage X3 environment added');
      setEnvModalOpen(false);
      envForm.reset({ environmentType: 'Pilot' });
      loadClient();
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handleDeleteEnv = async (envId) => {
    try {
      await api.delete(`/clients/${id}/environments/${envId}`);
      addToast('Environment removed');
      loadClient();
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handleDocUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('entityType', 'client');
    fd.append('entityId', id);
    try {
      await api.post('/attachments', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      addToast('Client document uploaded');
      loadClient();
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      e.target.value = '';
    }
  };

  if (loading) return <Loader label="Loading client profile..." />;
  if (!client) return <div className="p-6 text-sm">Client not found.</div>;

  return (
    <div className="space-y-5">
      <div>
        <Link to="/clients" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 mb-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Clients
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-blue-600">{client.clientId}</span>
              <Badge value={client.accountStatus}>{client.accountStatus}</Badge>
              <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-xs">
                {client.sageX3Version}
              </span>
              {isManager && (
                <Button size="xs" variant="secondary" onClick={openEditClient}>
                  <Pencil className="h-3 w-3 mr-1" /> Edit Client
                </Button>
              )}
            </div>
            <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{client.companyName}</h1>
          </div>

          <div className="flex gap-3 text-xs">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-center">
              <div className="font-bold text-base">{client.stats?.openTickets ?? 0}</div>
              <div className="text-slate-500">Open Tickets</div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-center">
              <div className="font-bold text-base">{client.stats?.pendingTasks ?? 0}</div>
              <div className="text-slate-500">Pending Tasks</div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-center">
              <div className="font-bold text-base">{client.stats?.productionDeployments ?? 0}</div>
              <div className="text-slate-500">Prod Deploys</div>
            </div>
          </div>
        </div>
      </div>

      {/* 7 Required Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === t.id
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <h3 className="text-sm font-semibold mb-3">Company & Sage X3 Profile</h3>
            <dl className="space-y-2.5 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Primary Contact</dt>
                <dd className="font-medium text-right">{client.primaryContactPerson}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Email / Phone</dt>
                <dd className="text-right">
                  {client.contactEmail} {client.contactNumber ? `· ${client.contactNumber}` : ''}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Address</dt>
                <dd className="text-right">{client.address || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Hosting</dt>
                <dd className="text-right">{client.hostingInformation || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Integrations</dt>
                <dd className="text-right">{client.integrationDetails || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Support Agreement</dt>
                <dd className="text-right">{client.supportAgreementInfo || '—'}</dd>
              </div>
              {client.internalNotes && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <dt className="text-slate-500 mb-1">Internal Notes</dt>
                  <dd className="rounded bg-amber-50/70 dark:bg-amber-950/30 p-2 text-amber-900 dark:text-amber-200">
                    {client.internalNotes}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Sage X3 Environments ({client.environments?.length || 0})</h3>
              {isManager && (
                <Button size="xs" variant="secondary" onClick={() => setEnvModalOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add Environment
                </Button>
              )}
            </div>
            <div className="space-y-2.5">
              {(client.environments || []).map((env) => (
                <div
                  key={env._id}
                  className="flex items-start justify-between rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Server className="h-3.5 w-3.5 text-blue-600" />
                      <span className="font-semibold">{env.name}</span>
                      <Badge value={env.environmentType}>{env.environmentType}</Badge>
                      <span className="font-mono rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5">
                        {env.folderCode}
                      </span>
                    </div>
                    {env.serverUrl && <div className="mt-1 text-slate-500 font-mono text-[11px]">{env.serverUrl}</div>}
                    {env.databaseName && (
                      <div className="text-[11px] text-slate-400">
                        DB: {env.databaseName} {env.patchLevel ? `· ${env.patchLevel}` : ''}
                      </div>
                    )}
                  </div>
                  {isManager && (
                    <button onClick={() => handleDeleteEnv(env._id)} className="text-slate-400 hover:text-rose-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'tickets' && (
        <Card padding={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-2.5">Ticket</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">Priority</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Folder</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(client.tickets || []).map((t) => (
                  <tr key={t._id}>
                    <td className="px-4 py-2.5">
                      <Link to={`/tickets/${t._id}`} className="font-mono text-blue-600 hover:underline mr-2">
                        {t.ticketId}
                      </Link>
                      <Link to={`/tickets/${t._id}`} className="font-medium hover:underline">
                        {t.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{t.category}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant="priority" value={t.priority}>
                        {t.priority}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge value={t.status}>{t.status}</Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono">{t.folderCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'tasks' && (
        <Card padding={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-2.5">Task</th>
                  <th className="px-4 py-2.5">Parent Ticket</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(client.tasks || []).map((t) => (
                  <tr key={t._id}>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-slate-500 mr-2">{t.taskId}</span>
                      <span className="font-medium">{t.title}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {t.ticket && (
                        <Link to={`/tickets/${t.ticket._id}`} className="text-blue-600 hover:underline">
                          {t.ticket.ticketId}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge value={t.status}>{t.status}</Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono">
                      {t.actualHours || 0}h / {t.estimatedHours || 0}h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'projects' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(client.projects || []).map((p) => (
            <Link key={p._id} to={`/projects/${p._id}`}>
              <Card className="hover:border-blue-400">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-xs text-blue-600">{p.projectId}</span>
                  <Badge value={p.status}>{p.status}</Badge>
                </div>
                <h4 className="font-semibold text-sm mt-1">{p.name}</h4>
                <p className="text-xs text-slate-500 mt-1">{p.description}</p>
                <div className="mt-3 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-blue-600" style={{ width: `${p.progressPercentage || 0}%` }} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {activeTab === 'deployments' && (
        <Card padding={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-2.5">Deployment</th>
                  <th className="px-4 py-2.5">Folder / Env</th>
                  <th className="px-4 py-2.5">Stage</th>
                  <th className="px-4 py-2.5">Approval</th>
                  <th className="px-4 py-2.5">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(client.deployments || []).map((d) => (
                  <tr key={d._id}>
                    <td className="px-4 py-2.5">
                      <span className="font-mono font-semibold">{d.deploymentId}</span> · {d.versionReference}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono mr-1.5">{d.sageX3Folder}</span>
                    <Badge value={d.environment}>{d.environment}</Badge>
                  </td>
                  <td className="px-4 py-2.5">{d.workflowStage}</td>
                  <td className="px-4 py-2.5">
                    <Badge value={d.approvalStatus}>{d.approvalStatus}</Badge>
                  </td>
                  <td className="px-4 py-2.5">{dayjs(d.deploymentDate).format('DD MMM YYYY')}</td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'activity' && (
        <Card>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {(client.activityLogs || []).map((log) => (
              <div key={log._id} className="py-2.5 flex justify-between">
                <span>
                  <strong>{log.actor?.fullName}</strong> {log.summary}
                </span>
                <span className="text-slate-400">{dayjs(log.createdAt).format('DD MMM YYYY, HH:mm')}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {activeTab === 'documents' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Client Technical Documents & Specs</h3>
            <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
              <Upload className="h-3.5 w-3.5" /> Upload Document
              <input type="file" className="hidden" onChange={handleDocUpload} />
            </label>
          </div>
          {(client.documents || []).length === 0 ? (
            <p className="text-xs text-slate-500">No documents uploaded for this client yet.</p>
          ) : (
            <div className="space-y-2">
              {client.documents.map((doc) => (
                <a
                  key={doc._id}
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <span className="flex items-center gap-2 text-blue-600 font-medium">
                    <FileText className="h-4 w-4" /> {doc.originalName}
                  </span>
                  <span className="text-slate-400">
                    {doc.uploadedBy?.fullName} · {dayjs(doc.createdAt).format('DD MMM YYYY')}
                  </span>
                </a>
              ))}
            </div>
          )}
        </Card>
      )}

      <Modal open={envModalOpen} onClose={() => setEnvModalOpen(false)} title="Add Sage X3 Environment" maxWidth="max-w-md">
        <form onSubmit={envForm.handleSubmit(handleAddEnv)} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium mb-1">Environment Name *</label>
            <input
              {...envForm.register('name', { required: true })}
              placeholder="e.g. UAT Sandbox"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block font-medium mb-1">Type</label>
              <select
                {...envForm.register('environmentType')}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="Development">Development</option>
                <option value="Pilot">Pilot</option>
                <option value="UAT">UAT</option>
                <option value="Sandbox">Sandbox</option>
                <option value="Production">Production</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Folder Code *</label>
              <input
                {...envForm.register('folderCode', { required: true })}
                placeholder="HTUAT"
                className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm uppercase font-mono dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium mb-1">Syracuse URL</label>
            <input
              {...envForm.register('serverUrl')}
              placeholder="https://x3uat.client.local:8124"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block font-medium mb-1">Database Name</label>
              <input
                {...envForm.register('databaseName')}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Patch Level</label>
              <input
                {...envForm.register('patchLevel')}
                placeholder="P33"
                className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEnvModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Add Environment</Button>
          </div>
        </form>
      </Modal>

      <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Client Profile" maxWidth="max-w-2xl">
        <form onSubmit={editForm.handleSubmit(handleSaveClient)} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Company Name *</label>
              <input {...editForm.register('companyName', { required: true })} className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]" />
            </div>
            <div>
              <label className="block font-medium mb-1">Primary Contact *</label>
              <input {...editForm.register('primaryContactPerson', { required: true })} className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]" />
            </div>
            <div>
              <label className="block font-medium mb-1">Contact Email *</label>
              <input type="email" {...editForm.register('contactEmail', { required: true })} className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]" />
            </div>
            <div>
              <label className="block font-medium mb-1">Contact Number</label>
              <input {...editForm.register('contactNumber')} className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]" />
            </div>
            <div>
              <label className="block font-medium mb-1">Account Status</label>
              <select {...editForm.register('accountStatus')} className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]">
                <option value="Active">Active</option>
                <option value="Onboarding">Onboarding</option>
                <option value="On Hold">On Hold</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Sage X3 Version</label>
              <input {...editForm.register('sageX3Version')} className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]" />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Address</label>
              <input {...editForm.register('address')} className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]" />
            </div>
            <div>
              <label className="block font-medium mb-1">Hosting Information</label>
              <input {...editForm.register('hostingInformation')} className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]" />
            </div>
            <div>
              <label className="block font-medium mb-1">Integration Details</label>
              <input {...editForm.register('integrationDetails')} className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]" />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Support Agreement</label>
              <input {...editForm.register('supportAgreementInfo')} className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save Changes'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
