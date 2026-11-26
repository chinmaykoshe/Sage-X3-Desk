import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CheckSquare,
  Ticket,
  Kanban,
  CalendarDays,
  Building2,
  FolderKanban,
  Users,
  Rocket,
  BarChart3,
  History,
  BookOpen,
  Inbox,
  Settings,
  UserCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  LogOut,
  Search,
  Menu,
  X,
  Plus,
  Command,
  Gauge,
  Sparkles,
  Mail,
  ShieldCheck,
  Activity,
  Wrench,
  AlertTriangle,
  ShieldAlert,
  Clock,
  BrainCircuit,
} from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { ROLE_LABELS } from '../../utils/constants';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import CommandPalette from '../workspace/CommandPalette';
import QuickCreateModals from '../workspace/QuickCreateModals';
import TaskDrawer from '../workspace/TaskDrawer';
import FloatingX3AI from '../ai/FloatingX3AI';

dayjs.extend(relativeTime);

const SIDEBAR_GROUPS = [
  {
    label: 'WORKSPACE',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, end: true, screenKey: 'dashboard' },
      { to: '/my-tasks', label: 'My Work', icon: CheckSquare, screenKey: 'my_tasks' },
      { to: '/notifications', label: 'Inbox', icon: Inbox, badge: true, screenKey: 'inbox' },
      { to: '/smart-intake', label: 'Smart Intake (AI)', icon: Sparkles, screenKey: 'smart_intake' },
      { to: '/email-inbox', label: 'Email Inbox', icon: Mail, screenKey: 'email_inbox', roles: ['admin', 'team_lead'] },
      { to: '/approvals', label: 'TL Approvals', icon: ShieldCheck, screenKey: 'approval_inbox' },
      { to: '/tickets', label: 'All Tickets', icon: Ticket, screenKey: 'tickets' },
      { to: '/task-board', label: 'Task Board', icon: Kanban, screenKey: 'task_board' },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays, screenKey: 'calendar' },
    ],
  },
  {
    label: 'MANAGEMENT',
    items: [
      { to: '/clients', label: 'Clients', icon: Building2, screenKey: 'clients' },
      { to: '/projects', label: 'Projects', icon: FolderKanban, screenKey: 'projects' },
      { to: '/team', label: 'Team Members', icon: Users, screenKey: 'team' },
      { to: '/workload', label: 'Workload', icon: Gauge, screenKey: 'workload' },
      { to: '/deployments', label: 'Deployments', icon: Rocket, screenKey: 'deployments' },
    ],
  },
  {
    label: 'INSIGHTS',
    items: [
      { to: '/reports', label: 'Reports', icon: BarChart3, screenKey: 'reports' },
      { to: '/activity-logs', label: 'Activity', icon: History, screenKey: 'activity_logs' },
      { to: '/knowledge-base', label: 'Knowledge Base', icon: BookOpen, screenKey: 'knowledge_base' },
    ],
  },
  {
    label: 'ADMINISTRATION',
    items: [
      { to: '/admin/overview', label: 'System Overview', icon: Activity, screenKey: 'admin_overview' },
      { to: '/admin/user-activity', label: 'User Activity', icon: Users, screenKey: 'admin_user_activity' },
      { to: '/admin/dev-logs', label: 'Development Logs', icon: Wrench, screenKey: 'admin_dev_logs' },
      { to: '/admin/system-logs', label: 'System Logs', icon: AlertTriangle, screenKey: 'admin_system_logs' },
      { to: '/admin/api-monitoring', label: 'API Monitoring', icon: Gauge, screenKey: 'admin_api_monitoring' },
      { to: '/admin/deployments', label: 'Deployment History', icon: Rocket, screenKey: 'admin_deployment_history' },
      { to: '/admin/time-tracking', label: 'Time Tracking', icon: Clock, screenKey: 'admin_time_tracking' },
      { to: '/admin/ai-activity', label: 'AI Activity', icon: BrainCircuit, screenKey: 'admin_ai_activity' },
      { to: '/admin/audit-logs', label: 'Security & Audit', icon: ShieldAlert, screenKey: 'admin_audit_logs' },
    ],
  },
  {
    label: 'SYSTEM',
    items: [{ to: '/settings', label: 'Settings & Access', icon: Settings, screenKey: 'settings' }],
  },
];

export default function AppLayout() {
  const { user, logout, unreadCount, hasScreen } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const {
    openQuickTicket,
    ticketDrawerId,
    openTicketDrawer,
    openTaskDrawer,
    setCommandPaletteOpen,
    closeDrawers,
  } = useWorkspace();

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sagex3_sidebar_collapsed') === 'true');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const searchInputRef = useRef(null);
  const gPressedRef = useRef(false);
  const navigate = useNavigate();

  // Open tickets in full-workspace view inside AppLayout (keeping sidebar & top header visible!)
  useEffect(() => {
    if (ticketDrawerId) {
      navigate(`/tickets/${ticketDrawerId}`);
      closeDrawers();
    }
  }, [ticketDrawerId, navigate, closeDrawers]);

  useEffect(() => {
    localStorage.setItem('sagex3_sidebar_collapsed', String(collapsed));
  }, [collapsed]);

  // Global debounced search across tickets, clients, projects, tasks & employees
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/search', { params: { q } });
        setSearchResults(data.data);
        setSearchOpen(true);
      } catch {
        // ignore
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Global Keyboard Shortcuts (Part 8)
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || document.activeElement?.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((o) => !o);
        return;
      }

      if (e.key === 'Escape') {
        setSearchOpen(false);
        setCommandPaletteOpen(false);
        closeDrawers();
        return;
      }

      if (isTyping || e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        openQuickTicket();
        return;
      }

      if (e.key.toLowerCase() === 't') {
        e.preventDefault();
        navigate('/my-tasks');
        return;
      }

      if (e.key.toLowerCase() === 'g') {
        gPressedRef.current = true;
        setTimeout(() => {
          gPressedRef.current = false;
        }, 900);
        return;
      }

      if (gPressedRef.current && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        gPressedRef.current = false;
        navigate('/');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, openQuickTicket, setCommandPaletteOpen, closeDrawers]);

  const renderSidebar = (isMobile = false) => (
    <aside
      className={`flex h-full flex-col border-r border-[#E8E8E5] bg-white dark:border-[#26282D] dark:bg-[#141518] transition-all duration-200 ${
        isMobile ? 'w-64' : collapsed ? 'w-[76px]' : 'w-60'
      }`}
    >
      {/* Brand */}
      <div
        className={`flex h-14 items-center border-b border-[#E8E8E5] dark:border-[#26282D] ${
          collapsed && !isMobile ? 'justify-center gap-1 px-2' : 'justify-between px-3.5'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`flex shrink-0 items-center justify-center rounded-lg bg-[#171717] text-[#C6F36B] dark:bg-[#C6F36B] dark:text-[#171717] font-bold tracking-tight shadow-sm ${
              collapsed && !isMobile ? 'h-7 w-7 text-[11px]' : 'h-8 w-8 text-xs'
            }`}
          >
            X3
          </div>
          {(!collapsed || isMobile) && (
            <div className="truncate">
              <div className="text-sm font-semibold tracking-tight text-[#171717] dark:text-slate-100">
                Sage X3 Desk
              </div>
              <div className="text-[10px] font-medium text-[#777777]">Operations Workspace</div>
            </div>
          )}
        </div>
        {isMobile ? (
          <button onClick={() => setMobileOpen(false)} className="p-1 text-[#777777]">
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden lg:inline-flex rounded-md p-1 text-[#777777] hover:bg-[#F4F4F2] hover:text-[#171717] dark:hover:bg-white/10 dark:hover:text-white"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Nav Groups */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-5">
        {SIDEBAR_GROUPS.map((group) => {
          const visibleItems = group.items.filter(
            (item) => (!item.screenKey || hasScreen(item.screenKey)) && (!item.roles || (user && item.roles.includes(user.role)))
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.label}>
              {(!collapsed || isMobile) && (
                <div className="px-2.5 mb-1.5 text-[10px] font-semibold tracking-wider text-[#777777]">
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => isMobile && setMobileOpen(false)}
                      title={collapsed && !isMobile ? item.label : undefined}
                      className={({ isActive }) =>
                        `group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-150 ${
                          isActive
                            ? 'bg-[#C6F36B] text-[#171717] font-semibold shadow-sm'
                            : 'text-[#555555] hover:bg-[#F4F4F2] hover:text-[#171717] hover:translate-x-0.5 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100'
                        } ${collapsed && !isMobile ? 'justify-center' : ''}`
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {(!collapsed || isMobile) && <span className="flex-1 truncate">{item.label}</span>}
                      {item.badge && unreadCount > 0 && (!collapsed || isMobile) && (
                        <span className="rounded-full bg-[#171717] text-[#C6F36B] px-1.5 py-0.5 text-[10px] font-bold">
                          {unreadCount}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Bottom User Strip (clickable to /profile) */}
      {user && (
        <div className="border-t border-[#E8E8E5] dark:border-[#26282D] p-2.5">
          <div className={`flex items-center gap-2 ${collapsed && !isMobile ? 'justify-center' : ''}`}>
            <NavLink
              to="/profile"
              onClick={() => isMobile && setMobileOpen(false)}
              title="Open User Profile"
              className={({ isActive }) =>
                `flex items-center gap-2.5 min-w-0 flex-1 rounded-lg p-1.5 transition-colors ${
                  isActive
                    ? 'bg-[#C6F36B] text-[#171717]'
                    : 'hover:bg-[#F4F4F2] dark:hover:bg-white/5'
                }`
              }
            >
              <Avatar name={user.fullName} color={user.avatarColor} size="sm" />
              {(!collapsed || isMobile) && (
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{user.fullName}</div>
                  <div className="truncate text-[11px] opacity-70">{ROLE_LABELS[user.role] || user.role}</div>
                </div>
              )}
            </NavLink>
            {(!collapsed || isMobile) && (
              <button
                onClick={logout}
                title="Sign out"
                className="rounded-md p-1.5 text-[#777777] hover:bg-[#F16D64]/15 hover:text-[#F16D64]"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  );

  const hasSearchItems =
    searchResults &&
    (searchResults.tickets?.length ||
      searchResults.tasks?.length ||
      searchResults.clients?.length ||
      searchResults.projects?.length ||
      searchResults.employees?.length);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F4F4F2] dark:bg-[#101113]">
      <div className="hidden lg:block h-full">{renderSidebar(false)}</div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-[#171717]/50" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 h-full">{renderSidebar(true)}</div>
        </div>
      )}

      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[#E8E8E5] bg-white dark:border-[#26282D] dark:bg-[#141518] px-4 sm:px-6">
          <div className="flex items-center gap-3 flex-1 max-w-xl relative">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden rounded-lg p-1.5 text-[#555555] hover:bg-[#F4F4F2] dark:hover:bg-white/10"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#777777]" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onFocus={() => searchResults && setSearchOpen(true)}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tickets, tasks, clients, projects, employees... (press /)"
                className="w-full rounded-lg border border-[#E8E8E5] bg-[#F4F4F2]/70 py-1.5 pl-8 pr-16 text-xs text-[#171717] placeholder-[#777777] focus:border-[#171717] focus:bg-white focus:outline-none dark:border-[#2C2E33] dark:bg-[#1C1D21] dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                title="Command Palette (Ctrl/Cmd + K)"
                className="hidden sm:inline-flex items-center gap-1 absolute right-1.5 top-1/2 -translate-y-1/2 rounded border border-[#E8E8E5] bg-white px-1.5 py-0.5 text-[10px] font-mono text-[#777777] hover:text-[#171717] dark:border-[#2C2E33] dark:bg-[#25262B]"
              >
                <Command className="h-2.5 w-2.5" />K
              </button>

              {searchOpen && searchQuery.trim() && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setSearchOpen(false)} />
                  <div className="absolute left-0 right-0 top-10 z-40 rounded-xl border border-[#E8E8E5] bg-white p-2 shadow-2xl dark:border-[#2C2E33] dark:bg-[#1C1D21] max-h-96 overflow-y-auto text-xs space-y-2.5">
                    {!hasSearchItems ? (
                      <div className="py-6 text-center text-[#777777]">No matches for "{searchQuery}"</div>
                    ) : (
                      <>
                        {searchResults.tickets?.length > 0 && (
                          <div>
                            <div className="px-2 py-1 text-[10px] font-semibold uppercase text-[#777777]">Tickets</div>
                            {searchResults.tickets.map((t) => (
                              <button
                                key={t._id}
                                onClick={() => {
                                  setSearchOpen(false);
                                  openTicketDrawer(t._id);
                                }}
                                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 hover:bg-[#F4F4F2] dark:hover:bg-white/5 text-left"
                              >
                                <span className="truncate">
                                  <span className="font-mono font-semibold text-[#638BEF] mr-1.5">{t.ticketId}</span>
                                  {t.title}
                                </span>
                                <Badge value={t.status}>{t.status}</Badge>
                              </button>
                            ))}
                          </div>
                        )}
                        {searchResults.tasks?.length > 0 && (
                          <div>
                            <div className="px-2 py-1 text-[10px] font-semibold uppercase text-[#777777]">Tasks</div>
                            {searchResults.tasks.map((t) => (
                              <button
                                key={t._id}
                                onClick={() => {
                                  setSearchOpen(false);
                                  openTaskDrawer(t._id);
                                }}
                                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 hover:bg-[#F4F4F2] dark:hover:bg-white/5 text-left"
                              >
                                <span className="truncate">
                                  <span className="font-mono font-semibold text-[#A88CEB] mr-1.5">{t.taskId}</span>
                                  {t.title}
                                </span>
                                <Badge value={t.status}>{t.status}</Badge>
                              </button>
                            ))}
                          </div>
                        )}
                        {searchResults.clients?.length > 0 && (
                          <div>
                            <div className="px-2 py-1 text-[10px] font-semibold uppercase text-[#777777]">Clients</div>
                            {searchResults.clients.map((c) => (
                              <button
                                key={c._id}
                                onClick={() => {
                                  setSearchOpen(false);
                                  navigate(`/clients/${c._id}`);
                                }}
                                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 hover:bg-[#F4F4F2] dark:hover:bg-white/5 text-left"
                              >
                                <span>{c.companyName}</span>
                                <span className="font-mono text-[#777777]">{c.clientFolderCode}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {searchResults.projects?.length > 0 && (
                          <div>
                            <div className="px-2 py-1 text-[10px] font-semibold uppercase text-[#777777]">Projects</div>
                            {searchResults.projects.map((p) => (
                              <button
                                key={p._id}
                                onClick={() => {
                                  setSearchOpen(false);
                                  navigate(`/projects/${p._id}`);
                                }}
                                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 hover:bg-[#F4F4F2] dark:hover:bg-white/5 text-left"
                              >
                                <span>{p.name}</span>
                                <Badge value={p.status}>{p.status}</Badge>
                              </button>
                            ))}
                          </div>
                        )}
                        {searchResults.employees?.length > 0 && (
                          <div>
                            <div className="px-2 py-1 text-[10px] font-semibold uppercase text-[#777777]">Employees</div>
                            {searchResults.employees.map((e) => (
                              <button
                                key={e._id}
                                onClick={() => {
                                  setSearchOpen(false);
                                  navigate(`/team/${e._id}`);
                                }}
                                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 hover:bg-[#F4F4F2] dark:hover:bg-white/5 text-left"
                              >
                                <span>{e.fullName}</span>
                                <span className="text-[#777777]">{e.designation}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/smart-intake')}
              title="Smart Add Ticket with X3 AI & OCR"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-1.5 text-xs font-medium text-[#171717] hover:border-[#171717] dark:border-[#2C2E33] dark:bg-[#1E2025] dark:text-slate-100"
            >
              <Sparkles className="h-3.5 w-3.5 text-[#35B8A6]" /> Smart Add
            </button>
            <button
              onClick={() => openQuickTicket()}
              title="Quick Create Ticket (Shortcut: C)"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#171717] px-3 py-1.5 text-xs font-semibold text-[#C6F36B] hover:bg-[#2a2a2a] dark:bg-[#C6F36B] dark:text-[#171717] shadow-sm transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Create
            </button>

            <button
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              className="rounded-lg p-2 text-[#555555] hover:bg-[#F4F4F2] dark:text-slate-400 dark:hover:bg-white/10"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <NavLink
              to="/notifications"
              title="Inbox & Notifications"
              className="relative rounded-lg p-2 text-[#555555] hover:bg-[#F4F4F2] dark:text-slate-400 dark:hover:bg-white/10"
            >
              <Inbox className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#F16D64] px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </NavLink>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>

      {/* Global Interactive Overlays */}
      <CommandPalette />
      <QuickCreateModals />
      <TaskDrawer />
      <FloatingX3AI />
    </div>
  );
}
