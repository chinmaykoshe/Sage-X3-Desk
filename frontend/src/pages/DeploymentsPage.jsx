import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Plus, Rocket, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import dayjs from 'dayjs';
import api, { getApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { DEPLOYMENT_ENVIRONMENTS, DEPLOYMENT_STAGES } from '../utils/constants';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Loader from '../components/ui/Loader';

export default function DeploymentsPage() {
  const { isManager } = useAuth();
  const { addToast } = useToast();
  const [deployments, setDeployments] = useState([]);
  const [clients, setClients] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [envFilter, setEnvFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [promoteModal, setPromoteModal] = useState({ open: false, dep: null });

  const createForm = useForm({
    defaultValues: { environment: 'Development', workflowStage: 'Development Completed', testingStatus: 'Pending' },
  });
  const promoteForm = useForm();

  const loadAll = async () => {
    setLoading(true);
    try {
      const [dRes, cRes, tRes] = await Promise.all([
        api.get('/deployments', { params: { environment: envFilter || undefined, limit: 100 } }),
        api.get('/clients?limit=100'),
        api.get('/tickets?scope=all&limit=100'),
      ]);
      setDeployments(dRes.data.data || []);
      setClients(cRes.data.data || []);
      setTickets(tRes.data.data || []);
    } catch (err) {
      addToast(getApiError(err, 'Failed to load deployments'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [envFilter]);

  const onCreate = async (values) => {
    try {
      await api.post('/deployments', values);
      addToast('Deployment record created');
      setCreateOpen(false);
      createForm.reset({ environment: 'Development', workflowStage: 'Development Completed', testingStatus: 'Pending' });
      loadAll();
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handleApproval = async (depId, approvalStatus) => {
    try {
      await api.patch(`/deployments/${depId}/status`, {
        approvalStatus,
        approvalNotes: approvalStatus === 'Approved' ? 'Approved for Production rollout' : 'Changes requested',
      });
      addToast(`Deployment ${approvalStatus}`);
      loadAll();
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const openPromote = (dep) => {
    promoteForm.reset({
      environment: dep.environment,
      workflowStage: dep.workflowStage,
      testingStatus: dep.testingStatus,
      sageX3Folder: dep.sageX3Folder,
      deploymentNotes: dep.deploymentNotes || '',
    });
    setPromoteModal({ open: true, dep });
  };

  const onPromote = async (values) => {
    try {
      await api.patch(`/deployments/${promoteModal.dep._id}/status`, values);
      addToast('Deployment stage updated');
      setPromoteModal({ open: false, dep: null });
      loadAll();
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sage X3 Deployment Pipeline"
        subtitle="Development Completed → Pilot Deployment → Pilot Testing → Approval → Production Deployment → Completed"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Log Deployment
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {['', ...DEPLOYMENT_ENVIRONMENTS].map((env) => (
          <button
            key={env || 'all'}
            onClick={() => setEnvFilter(env)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              envFilter === env
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700'
            }`}
          >
            {env || 'All Environments'}
          </button>
        ))}
      </div>

      {loading ? (
        <Loader label="Loading deployments..." />
      ) : (
        <div className="space-y-3.5">
          {deployments.map((d) => (
            <Card key={d._id}>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-blue-600 flex items-center gap-1">
                      <Rocket className="h-3.5 w-3.5" /> {d.deploymentId}
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {d.versionReference}
                    </span>
                    <Badge value={d.environment}>{d.environment}</Badge>
                    <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-xs">
                      Folder: {d.sageX3Folder}
                    </span>
                    <Badge value={d.approvalStatus}>Approval: {d.approvalStatus}</Badge>
                    <Badge value={d.testingStatus}>Test: {d.testingStatus}</Badge>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300">{d.description}</p>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                    <span>Client: {d.client?.companyName}</span>
                    {d.ticket && (
                      <Link to={`/tickets/${d.ticket._id}`} className="text-blue-600 hover:underline">
                        Ticket: {d.ticket.ticketId}
                      </Link>
                    )}
                    {d.patchObjects && <span className="font-mono">Objects: {d.patchObjects}</span>}
                    <span>By {d.deployedBy?.fullName} on {dayjs(d.deploymentDate).format('DD MMM YYYY')}</span>
                    {d.approvedBy && <span className="text-emerald-600">Approved by {d.approvedBy.fullName}</span>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {isManager && d.approvalStatus === 'Pending' && (
                    <>
                      <Button size="xs" variant="success" onClick={() => handleApproval(d._id, 'Approved')}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                      </Button>
                      <Button size="xs" variant="danger" onClick={() => handleApproval(d._id, 'Rejected')}>
                        <XCircle className="h-3.5 w-3.5" /> Reject
                      </Button>
                    </>
                  )}
                  <Button size="xs" variant="secondary" onClick={() => openPromote(d)}>
                    Advance Stage <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Stage Stepper */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-1.5">
                {DEPLOYMENT_STAGES.map((stage, idx) => {
                  const currentIdx = DEPLOYMENT_STAGES.indexOf(d.workflowStage);
                  const done = idx <= currentIdx;
                  return (
                    <span
                      key={stage}
                      className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                        stage === d.workflowStage
                          ? 'bg-blue-600 text-white'
                          : done
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                      }`}
                    >
                      {idx + 1}. {stage}
                    </span>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Deployment Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Log Sage X3 Deployment">
        <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Client *</label>
              <select
                {...createForm.register('client', { required: true })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="">Select client...</option>
                {clients.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.companyName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Related Ticket</label>
              <select
                {...createForm.register('ticket')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="">Optional...</option>
                {tickets.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.ticketId} — {t.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Sage X3 Folder *</label>
              <input
                {...createForm.register('sageX3Folder', { required: true })}
                placeholder="HTPILOT"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase font-mono dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Version / Release Reference *</label>
              <input
                {...createForm.register('versionReference', { required: true })}
                placeholder="REL-2026.11.25-01"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Environment</label>
              <select
                {...createForm.register('environment')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="Development">Development</option>
                <option value="Pilot">Pilot</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Stage</label>
              <select
                {...createForm.register('workflowStage')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="Development Completed">Development Completed</option>
                <option value="Pilot Deployment">Pilot Deployment</option>
                <option value="Pilot Testing">Pilot Testing</option>
                <option value="Approval">Approval</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Patch Objects (4GL, Screens, Reports)</label>
              <input
                {...createForm.register('patchObjects')}
                placeholder="ZMT940IMP.src, ZCRMEMO.rpt"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Description *</label>
              <textarea
                rows={2}
                {...createForm.register('description', { required: true })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Log Deployment</Button>
          </div>
        </form>
      </Modal>

      {/* Advance Stage Modal */}
      <Modal
        open={promoteModal.open}
        onClose={() => setPromoteModal({ open: false, dep: null })}
        title={`Update ${promoteModal.dep?.deploymentId || ''}`}
        subtitle="Production deployment requires Manager Approval and deployment notes"
        maxWidth="max-w-md"
      >
        <form onSubmit={promoteForm.handleSubmit(onPromote)} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium mb-1">Environment</label>
            <select
              {...promoteForm.register('environment')}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              {DEPLOYMENT_ENVIRONMENTS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-medium mb-1">Workflow Stage</label>
            <select
              {...promoteForm.register('workflowStage')}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              {DEPLOYMENT_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-medium mb-1">Testing Status</label>
            <select
              {...promoteForm.register('testingStatus')}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              {['Pending', 'In Progress', 'Passed', 'Failed'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-medium mb-1">Sage X3 Folder</label>
            <input
              {...promoteForm.register('sageX3Folder')}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase font-mono dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Deployment Notes</label>
            <textarea
              rows={2}
              {...promoteForm.register('deploymentNotes')}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPromoteModal({ open: false, dep: null })}>
              Cancel
            </Button>
            <Button type="submit">Update Deployment</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
