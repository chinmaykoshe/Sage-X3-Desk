import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, CheckCircle2, XCircle, Sun, Moon, History, Sparkles, Trash2, MessageSquare } from 'lucide-react';
import dayjs from 'dayjs';
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
import Loader from '../components/ui/Loader';

export default function ProfilePage() {
  const { user, setUser, isManager, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'ai-history' ? 'ai-history' : 'profile';

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [designation, setDesignation] = useState(user?.designation || '');
  const [contactNumber, setContactNumber] = useState(user?.contactNumber || '');
  const [skillsText, setSkillsText] = useState((user?.skills || []).join(', '));
  const [emailNotifications, setEmailNotifications] = useState(user?.preferences?.emailNotifications ?? true);
  const [saving, setSaving] = useState(false);

  const [aiHistory, setAiHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedConvId, setExpandedConvId] = useState(null);

  const loadAiHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const { data } = await api.get('/ai/conversations');
      setAiHistory(data.data || []);
    } catch (err) {
      addToast(getApiError(err, 'Failed to load AI chat history'), 'error');
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'ai-history') {
      loadAiHistory();
    }
  }, [activeTab, loadAiHistory]);

  const handleDeleteConversation = async (id) => {
    try {
      await api.delete(`/ai/conversations/${id}`);
      addToast('AI conversation removed');
      setAiHistory((prev) => prev.filter((c) => c._id !== id));
    } catch (err) {
      addToast(getApiError(err, 'Failed to delete conversation'), 'error');
    }
  };

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

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSearchParams({})}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === 'profile'
              ? 'bg-[#171717] text-white dark:bg-[#C6F36B] dark:text-[#171717]'
              : 'bg-white border border-[#E8E8E5] text-[#555555] dark:bg-[#17181B] dark:border-[#2C2E33] dark:text-slate-300'
          }`}
        >
          Profile &amp; Permissions
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'ai-history' })}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === 'ai-history'
              ? 'bg-[#171717] text-white dark:bg-[#C6F36B] dark:text-[#171717]'
              : 'bg-white border border-[#E8E8E5] text-[#555555] dark:bg-[#17181B] dark:border-[#2C2E33] dark:text-slate-300'
          }`}
        >
          <History className="h-3.5 w-3.5" /> X3 AI Chat History
        </button>
      </div>

      {activeTab === 'ai-history' ? (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#007AFF]" /> Your Retained X3 AI Conversations
              </h3>
              <p className="text-xs text-[#777777] mt-0.5">
                Every conversation started with + in X3 AI Assistant is saved here automatically.
              </p>
            </div>
            <Button size="xs" variant="secondary" onClick={loadAiHistory}>
              Refresh
            </Button>
          </div>

          {loadingHistory ? (
            <Loader label="Loading X3 AI history..." />
          ) : aiHistory.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#777777]">No saved X3 AI conversations yet.</p>
          ) : (
            <div className="space-y-3">
              {aiHistory.map((conv) => {
                const isExpanded = expandedConvId === conv._id;
                const msgs = conv.messages || [];
                return (
                  <div
                    key={conv._id}
                    className="rounded-xl border border-[#E8E8E5] dark:border-[#26282D] p-3 text-xs space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-[#171717] dark:text-white truncate">
                          {conv.title || 'X3 AI Conversation'}
                        </div>
                        <div className="text-[11px] text-[#777777]">
                          {msgs.length} message(s) · Updated {dayjs(conv.updatedAt).format('DD MMM YYYY, HH:mm')}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => setExpandedConvId(isExpanded ? null : conv._id)}
                        >
                          <MessageSquare className="h-3 w-3 mr-1" /> {isExpanded ? 'Hide Messages' : 'View Messages'}
                        </Button>
                        <Button
                          size="xs"
                          variant="primary"
                          onClick={() => window.dispatchEvent(new CustomEvent('x3ai:open-conversation', { detail: conv }))}
                        >
                          <Sparkles className="h-3 w-3 mr-1" /> Resume in X3 AI
                        </Button>
                        <Button
                          size="xs"
                          variant="danger"
                          onClick={() => handleDeleteConversation(conv._id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-2 space-y-2 border-t border-[#E8E8E5] dark:border-[#26282D] pt-2.5 max-h-72 overflow-y-auto">
                        {msgs.length === 0 ? (
                          <div className="text-[11px] text-[#777777]">Empty conversation.</div>
                        ) : (
                          msgs.map((m, idx) => (
                            <div
                              key={m._id || idx}
                              className={`rounded-lg px-2.5 py-1.5 text-[11px] whitespace-pre-line ${
                                m.role === 'user'
                                  ? 'bg-[#007AFF]/10 text-[#171717] dark:text-white font-medium'
                                  : 'bg-[#F4F4F2]/70 dark:bg-white/5 text-[#333333] dark:text-slate-300'
                              }`}
                            >
                              <span className="font-bold uppercase text-[9px] mr-1.5 opacity-60">{m.role}:</span>
                              {m.content}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      ) : (
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
      )}
    </div>
  );
}
