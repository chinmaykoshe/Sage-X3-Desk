import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Plus, FolderKanban, Calendar } from 'lucide-react';
import dayjs from 'dayjs';
import api, { getApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PROJECT_STATUSES } from '../utils/constants';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Loader from '../components/ui/Loader';
import EmptyState from '../components/ui/EmptyState';
import Avatar from '../components/ui/Avatar';

export default function ProjectsPage() {
  const { isManager } = useAuth();
  const { addToast } = useToast();
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const { register, handleSubmit, reset } = useForm({ defaultValues: { status: 'Active', progressPercentage: 0 } });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [pRes, cRes, uRes] = await Promise.all([
        api.get('/projects?limit=100'),
        api.get('/clients?limit=100'),
        api.get('/users?limit=100'),
      ]);
      setProjects(pRes.data.data || []);
      setClients(cRes.data.data || []);
      setUsers(uRes.data.data || []);
    } catch (err) {
      addToast(getApiError(err, 'Failed to load projects'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const onCreate = async (values) => {
    try {
      await api.post('/projects', {
        ...values,
        teamMembers: Array.isArray(values.teamMembers) ? values.teamMembers : values.teamMembers ? [values.teamMembers] : [],
        sageX3Modules: values.modulesText ? values.modulesText.split(',').map((s) => s.trim()).filter(Boolean) : [],
      });
      addToast('Project created');
      setCreateOpen(false);
      reset({ status: 'Active', progressPercentage: 0 });
      loadAll();
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Project Management"
        subtitle="Track multi-ticket Sage X3 implementations, customizations, and milestones"
        actions={
          isManager && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New Project
            </Button>
          )
        }
      />

      {loading ? (
        <Loader label="Loading projects..." />
      ) : projects.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects yet" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((p) => (
            <Link key={p._id} to={`/projects/${p._id}`}>
              <Card className="h-full hover:border-blue-400 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-semibold text-blue-600">{p.projectId}</span>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{p.name}</h3>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {p.client?.companyName} ({p.client?.clientFolderCode})
                    </div>
                  </div>
                  <Badge value={p.status}>{p.status}</Badge>
                </div>

                <p className="mt-2.5 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{p.description}</p>

                <div className="mt-3">
                  <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                    <span>Overall Progress</span>
                    <span className="font-semibold">{p.progressPercentage || 0}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${p.progressPercentage || 0}%` }} />
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-1">
                      {(p.teamMembers || []).map((m) => (
                        <Avatar key={m._id} name={m.fullName} color={m.avatarColor} size="xs" />
                      ))}
                    </div>
                    <span>
                      {p.counts?.tickets || 0} tickets · {p.counts?.completedTasks || 0}/{p.counts?.tasks || 0} tasks
                    </span>
                  </div>
                  {p.targetCompletionDate && (
                    <span className="inline-flex items-center gap-1 text-[11px]">
                      <Calendar className="h-3.5 w-3.5" /> {dayjs(p.targetCompletionDate).format('DD MMM YYYY')}
                    </span>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Sage X3 Project" maxWidth="max-w-2xl">
        <form onSubmit={handleSubmit(onCreate)} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Project Name *</label>
              <input
                {...register('name', { required: true })}
                placeholder="e.g. Bank Statement Automation"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Client *</label>
              <select
                {...register('client', { required: true })}
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
              <label className="block font-medium mb-1">Project Manager *</label>
              <select
                {...register('projectManager', { required: true })}
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
              <label className="block font-medium mb-1">Start Date</label>
              <input
                type="date"
                {...register('startDate')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Target Completion Date</label>
              <input
                type="date"
                {...register('targetCompletionDate')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Status</label>
              <select
                {...register('status')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Sage X3 Modules (comma-separated)</label>
              <input
                {...register('modulesText')}
                placeholder="Finance, 4GL, Web Services"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Team Members</label>
              <select
                multiple
                {...register('teamMembers')}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs h-24 dark:border-slate-700 dark:bg-slate-800"
              >
                {users.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.fullName} ({u.designation})
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Description</label>
              <textarea
                rows={2}
                {...register('description')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create Project</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
