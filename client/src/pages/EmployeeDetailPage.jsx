import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import dayjs from 'dayjs';
import api, { getApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ROLE_LABELS } from '../utils/constants';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Avatar from '../components/ui/Avatar';
import Loader from '../components/ui/Loader';

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const { isManager } = useAuth();
  const { addToast } = useToast();
  const [emp, setEmp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    designation: '',
    department: '',
    role: 'developer',
    status: 'Active',
    contactNumber: '',
    skillsText: '',
  });

  const loadEmployee = () => {
    api
      .get(`/users/${id}`)
      .then((res) => setEmp(res.data.data))
      .catch((err) => addToast(getApiError(err), 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadEmployee();
  }, [id]);

  const openEdit = () => {
    if (!emp) return;
    setForm({
      fullName: emp.fullName || '',
      email: emp.email || '',
      designation: emp.designation || '',
      department: emp.department || 'Sage X3 Practice',
      role: emp.role || 'developer',
      status: emp.status || 'Active',
      contactNumber: emp.contactNumber || '',
      skillsText: (emp.skills || []).join(', '),
    });
    setEditOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/users/${id}`, {
        fullName: form.fullName,
        email: form.email,
        designation: form.designation,
        department: form.department,
        role: form.role,
        status: form.status,
        contactNumber: form.contactNumber,
        skills: form.skillsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      addToast('Team member updated');
      setEditOpen(false);
      loadEmployee();
    } catch (err) {
      addToast(getApiError(err, 'Failed to update team member'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader label="Loading employee profile..." />;
  if (!emp) return <div className="p-6 text-sm">Employee not found.</div>;

  return (
    <div className="space-y-5">
      <div>
        <Link to="/team" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 mb-2">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Team Members
        </Link>
        <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <Avatar name={emp.fullName} color={emp.avatarColor} size="lg" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-slate-500">{emp.employeeId}</span>
                <Badge value={emp.status}>{emp.status}</Badge>
              </div>
              <h1 className="text-lg font-semibold">{emp.fullName}</h1>
              <p className="text-xs text-slate-500">
                {emp.designation} · {ROLE_LABELS[emp.role]} · {emp.email}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(emp.skills || []).map((s) => (
              <span key={s} className="rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 px-2 py-0.5 text-xs">
                {s}
              </span>
            ))}
            {isManager && (
              <Button size="xs" variant="secondary" onClick={openEdit}>
                <Pencil className="h-3 w-3 mr-1" /> Edit Member
              </Button>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <h3 className="text-sm font-semibold mb-3">Assigned Tickets ({emp.tickets?.length || 0})</h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {(emp.tickets || []).map((t) => (
              <div key={t._id} className="py-2 flex items-center justify-between">
                <Link to={`/tickets/${t._id}`} className="text-blue-600 hover:underline truncate pr-2">
                  {t.ticketId} — {t.title}
                </Link>
                <Badge value={t.status}>{t.status}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold mb-3">Tasks ({emp.tasks?.length || 0})</h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {(emp.tasks || []).map((t) => (
              <div key={t._id} className="py-2 flex items-center justify-between">
                <span className="truncate pr-2">
                  <span className="font-mono text-slate-400 mr-1">{t.taskId}</span> {t.title}
                </span>
                <Badge value={t.status}>{t.status}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold mb-3">Time Logs</h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {(emp.timeLogs || []).map((l) => (
              <div key={l._id} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{l.task?.taskId} — {l.workDescription}</div>
                  <div className="text-slate-400">{dayjs(l.date).format('DD MMM YYYY')}</div>
                </div>
                <span className="font-mono font-semibold">{l.hoursSpent}h</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold mb-3">Recent Activity</h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {(emp.activityLogs || []).map((a) => (
              <div key={a._id} className="py-2 flex justify-between gap-2">
                <span>{a.summary}</span>
                <span className="text-slate-400 shrink-0">{dayjs(a.createdAt).format('DD MMM')}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Team Member" maxWidth="max-w-lg">
        <form onSubmit={handleSave} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Full Name *</label>
              <input
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Email *</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Designation</label>
              <input
                value={form.designation}
                onChange={(e) => setForm({ ...form, designation: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Department</label>
              <input
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]"
              >
                {Object.entries(ROLE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]"
              >
                <option value="Active">Active</option>
                <option value="On Leave">On Leave</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Contact Number</label>
              <input
                value={form.contactNumber}
                onChange={(e) => setForm({ ...form, contactNumber: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Skills (comma-separated)</label>
              <input
                value={form.skillsText}
                onChange={(e) => setForm({ ...form, skillsText: e.target.value })}
                placeholder="4GL Scripting, Finance, EDI"
                className="w-full rounded-lg border px-3 py-2 dark:bg-[#1E2025] dark:border-[#2C2E33]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
