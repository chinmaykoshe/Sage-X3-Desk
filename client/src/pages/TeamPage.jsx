import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Plus, Search } from 'lucide-react';
import api, { getApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ROLE_LABELS } from '../utils/constants';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Loader from '../components/ui/Loader';
import Avatar from '../components/ui/Avatar';

export default function TeamPage() {
  const { isAdmin } = useAuth();
  const { addToast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const { register, handleSubmit, reset } = useForm({
    defaultValues: { role: 'developer', status: 'Active', department: 'Sage X3 Practice' },
  });

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/users', { params: { search: search || undefined, limit: 100 } });
      setUsers(data.data || []);
    } catch (err) {
      addToast(getApiError(err, 'Failed to load team directory'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [search]);

  const onCreate = async (values) => {
    try {
      await api.post('/users', {
        ...values,
        skills: values.skillsText ? values.skillsText.split(',').map((s) => s.trim()).filter(Boolean) : [],
      });
      addToast('Employee account created');
      setCreateOpen(false);
      reset({ role: 'developer', status: 'Active', department: 'Sage X3 Practice' });
      loadUsers();
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Team Members & Workload"
        subtitle="Internal Sage X3 consultant directory, skills, and real-time workload distribution"
        actions={
          isAdmin && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Add Employee
            </Button>
          )
        }
      />

      <Card padding={false} className="p-3.5">
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, employee ID, or skill (e.g. 4GL, Crystal)..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
      </Card>

      {loading ? (
        <Loader label="Loading team workload..." />
      ) : (
        <Card padding={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Role / Skills</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-center">Tickets</th>
                  <th className="px-4 py-3 text-center">Active Tasks</th>
                  <th className="px-4 py-3 text-center">Pending</th>
                  <th className="px-4 py-3 text-center">Completed</th>
                  <th className="px-4 py-3 text-center">Overdue</th>
                  <th className="px-4 py-3 text-right">Logged Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.map((u) => (
                  <tr key={u._id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <Link to={`/team/${u._id}`} className="flex items-center gap-2.5 group">
                        <Avatar name={u.fullName} color={u.avatarColor} size="sm" />
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600">
                            {u.fullName}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {u.employeeId} · {u.designation}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-700 dark:text-slate-300">{ROLE_LABELS[u.role]}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(u.skills || []).slice(0, 3).map((s) => (
                          <span key={s} className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px]">
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge value={u.status}>{u.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center font-semibold">{u.workload?.assignedTickets || 0}</td>
                    <td className="px-4 py-3 text-center font-semibold text-blue-600">{u.workload?.activeTasks || 0}</td>
                    <td className="px-4 py-3 text-center">{u.workload?.pendingTasks || 0}</td>
                    <td className="px-4 py-3 text-center text-emerald-600">{u.workload?.completedTasks || 0}</td>
                    <td className="px-4 py-3 text-center font-semibold text-rose-600">{u.workload?.overdueTasks || 0}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{u.workload?.loggedHours || 0}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Team Member" maxWidth="max-w-lg">
        <form onSubmit={handleSubmit(onCreate)} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Full Name *</label>
              <input
                {...register('fullName', { required: true })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Work Email *</label>
              <input
                type="email"
                {...register('email', { required: true })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Initial Password *</label>
              <input
                type="password"
                {...register('password', { required: true, minLength: 6 })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Role *</label>
              <select
                {...register('role')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="developer">Developer / Employee</option>
                <option value="team_lead">Team Lead / Manager</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Designation</label>
              <input
                {...register('designation')}
                placeholder="4GL Developer"
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
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Skills (comma-separated)</label>
              <input
                {...register('skillsText')}
                placeholder="4GL, Crystal Reports, REST Web Services"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create Employee</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
