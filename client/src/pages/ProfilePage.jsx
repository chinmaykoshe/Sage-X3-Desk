import { useState } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, Sun, Moon } from 'lucide-react';
import api, { getApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { ROLE_LABELS } from '../utils/constants';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';

export default function ProfilePage() {
  const { user, setUser, isManager, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { addToast } = useToast();

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [designation, setDesignation] = useState(user?.designation || '');
  const [contactNumber, setContactNumber] = useState(user?.contactNumber || '');
  const [skillsText, setSkillsText] = useState((user?.skills || []).join(', '));
  const [emailNotifications, setEmailNotifications] = useState(user?.preferences?.emailNotifications ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.put('/auth/profile', {
        fullName,
        designation,
        contactNumber,
        skills: skillsText.split(',').map((s) => s.trim()).filter(Boolean),
        preferences: { theme, emailNotifications },
      });
      setUser(data.data);
      addToast('Profile updated');
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const permList = [
    { label: 'Assign & Reassign Tickets', enabled: isManager || user?.permissions?.canAssignTickets },
    { label: 'Approve Production Deployments', enabled: isManager || user?.permissions?.canApproveDeployments },
    { label: 'Manage Client Profiles', enabled: isManager || user?.permissions?.canManageClients },
    { label: 'View Management Reports', enabled: isManager || user?.permissions?.canViewReports },
    { label: 'Waive Incomplete Tasks on Close', enabled: isManager || user?.permissions?.canWaiveTicketClose },
    { label: 'System & User Administration', enabled: isAdmin },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="User Profile"
        subtitle="Manage your personal details, Sage X3 skills, permissions, and interface theme"
        actions={
          <Button variant="secondary" size="sm" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            Theme: {theme === 'dark' ? 'Dark' : 'Light'}
          </Button>
        }
      />

      <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Avatar name={user?.fullName} color={user?.avatarColor} size="lg" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold">{user?.fullName}</span>
              <Badge value={user?.status || 'Active'}>{user?.status || 'Active'}</Badge>
            </div>
            <div className="text-xs text-[#777777] mt-0.5">
              {user?.employeeId} · {ROLE_LABELS[user?.role]} · {user?.email}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(user?.skills || []).map((s) => (
            <span
              key={s}
              className="rounded-md bg-[#F4F4F2] dark:bg-white/10 px-2 py-0.5 text-xs font-medium text-[#171717] dark:text-slate-200"
            >
              {s}
            </span>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <h3 className="text-sm font-semibold mb-4">Personal & Role Details</h3>
          <form onSubmit={handleSave} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium mb-1">Full Name</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Designation</label>
                <input
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Contact Number</label>
                <input
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Skills (comma-separated)</label>
                <input
                  value={skillsText}
                  onChange={(e) => setSkillsText(e.target.value)}
                  className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={emailNotifications}
                onChange={(e) => setEmailNotifications(e.target.checked)}
              />
              <span>Receive email notifications for assigned tickets and approvals</span>
            </label>

            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Profile'}
            </Button>
          </form>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-4 w-4 text-[#35B8A6]" />
            <h3 className="text-sm font-semibold">Access & Permissions</h3>
          </div>
          <div className="space-y-2.5 text-xs">
            {permList.map((p) => (
              <div key={p.label} className="flex items-center justify-between">
                <span className="text-[#555555] dark:text-slate-300">{p.label}</span>
                {p.enabled ? (
                  <CheckCircle2 className="h-4 w-4 text-[#35B8A6]" />
                ) : (
                  <XCircle className="h-4 w-4 text-[#AAAAAA]" />
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
