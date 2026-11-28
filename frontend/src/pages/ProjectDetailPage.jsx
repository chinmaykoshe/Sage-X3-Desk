import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Plus, CheckCircle2 } from 'lucide-react';
import dayjs from 'dayjs';
import api, { getApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Loader from '../components/ui/Loader';
import Avatar from '../components/ui/Avatar';

export default function ProjectDetailPage() {
  const { id } = useParams();
  const { isManager } = useAuth();
  const { addToast } = useToast();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msOpen, setMsOpen] = useState(false);

  const msForm = useForm({ defaultValues: { status: 'Pending' } });

  const loadProject = async () => {
    try {
      const { data } = await api.get(`/projects/${id}`);
      setProject(data.data);
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProject();
  }, [id]);

  const handleAddMilestone = async (values) => {
    try {
      await api.post(`/projects/${id}/milestones`, values);
      addToast('Milestone added');
      setMsOpen(false);
      msForm.reset({ status: 'Pending' });
      loadProject();
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handleMilestoneStatus = async (msId, status) => {
    try {
      await api.put(`/projects/${id}/milestones/${msId}`, { status });
      addToast('Milestone updated');
      loadProject();
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  if (loading) return <Loader label="Loading project..." />;
  if (!project) return <div className="p-6 text-sm">Project not found.</div>;

  return (
    <div className="space-y-5">
      <div>
        <Link to="/projects" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 mb-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Projects
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-blue-600">{project.projectId}</span>
              <Badge value={project.status}>{project.status}</Badge>
            </div>
            <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{project.name}</h1>
            <p className="text-xs text-slate-500">
              {project.client?.companyName} ({project.client?.clientFolderCode}) · PM: {project.projectManager?.fullName}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">{project.progressPercentage || 0}%</div>
            <div className="text-xs text-slate-500">Completion</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Milestones */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Project Milestones</h3>
              {isManager && (
                <Button size="xs" variant="secondary" onClick={() => setMsOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add Milestone
                </Button>
              )}
            </div>
            {(project.milestones || []).length === 0 ? (
              <p className="text-xs text-slate-500">No milestones defined yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {project.milestones.map((m) => (
                  <div key={m._id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        className={`h-4 w-4 ${m.status === 'Completed' ? 'text-emerald-600' : 'text-slate-300'}`}
                      />
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">{m.title}</div>
                        {m.dueDate && (
                          <div className="text-[11px] text-slate-500">Due {dayjs(m.dueDate).format('DD MMM YYYY')}</div>
                        )}
                      </div>
                    </div>
                    {isManager ? (
                      <select
                        value={m.status}
                        onChange={(e) => handleMilestoneStatus(m._id, e.target.value)}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-800"
                      >
                        {['Pending', 'In Progress', 'Completed', 'Delayed'].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Badge value={m.status}>{m.status}</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Associated Tickets */}
          <Card>
            <h3 className="text-sm font-semibold mb-3">Associated Tickets ({project.tickets?.length || 0})</h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {(project.tickets || []).map((t) => (
                <div key={t._id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <Link to={`/tickets/${t._id}`} className="font-mono text-blue-600 hover:underline mr-2">
                      {t.ticketId}
                    </Link>
                    <Link to={`/tickets/${t._id}`} className="font-medium hover:underline">
                      {t.title}
                    </Link>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="priority" value={t.priority}>
                      {t.priority}
                    </Badge>
                    <Badge value={t.status}>{t.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Team & Modules</h3>
            <div className="space-y-2 mb-4">
              {(project.teamMembers || []).map((m) => (
                <div key={m._id} className="flex items-center gap-2 text-xs">
                  <Avatar name={m.fullName} color={m.avatarColor} size="xs" />
                  <div>
                    <div className="font-medium">{m.fullName}</div>
                    <div className="text-[11px] text-slate-400">{m.designation}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              {(project.sageX3Modules || []).map((mod) => (
                <span key={mod} className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px]">
                  {mod}
                </span>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Project Tasks ({project.tasks?.length || 0})
            </h3>
            <div className="space-y-2 text-xs">
              {(project.tasks || []).map((t) => (
                <div key={t._id} className="flex items-center justify-between">
                  <span className="truncate pr-2">
                    <span className="font-mono text-slate-400 mr-1">{t.taskId}</span>
                    {t.title}
                  </span>
                  <Badge value={t.status}>{t.status}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Modal open={msOpen} onClose={() => setMsOpen(false)} title="Add Project Milestone" maxWidth="max-w-md">
        <form onSubmit={msForm.handleSubmit(handleAddMilestone)} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium mb-1">Milestone Title *</label>
            <input
              {...msForm.register('title', { required: true })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Due Date</label>
            <input
              type="date"
              {...msForm.register('dueDate')}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMsOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Add Milestone</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
