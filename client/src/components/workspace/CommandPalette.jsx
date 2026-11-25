import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  LayoutDashboard,
  Ticket,
  CheckSquare,
  Kanban,
  CalendarDays,
  Building2,
  FolderKanban,
  Users,
  BarChart3,
  Rocket,
  Settings,
  Plus,
  Activity,
} from 'lucide-react';
import api from '../../services/api';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import Badge from '../ui/Badge';

const NAV_COMMANDS = [
  { label: 'Go to Overview', to: '/', icon: LayoutDashboard, keywords: 'dashboard home overview' },
  { label: 'Go to My Work', to: '/my-tasks', icon: CheckSquare, keywords: 'my tasks work' },
  { label: 'Go to All Tickets', to: '/tickets', icon: Ticket, keywords: 'tickets board list' },
  { label: 'Go to Task Board', to: '/task-board', icon: Kanban, keywords: 'task board kanban' },
  { label: 'Go to Calendar', to: '/calendar', icon: CalendarDays, keywords: 'calendar schedule' },
  { label: 'Go to Clients', to: '/clients', icon: Building2, keywords: 'clients accounts sage' },
  { label: 'Go to Projects', to: '/projects', icon: FolderKanban, keywords: 'projects milestones timeline' },
  { label: 'Go to Team Members', to: '/team', icon: Users, keywords: 'team employees' },
  { label: 'Go to Workload', to: '/workload', icon: Activity, keywords: 'workload capacity' },
  { label: 'Go to Deployments', to: '/deployments', icon: Rocket, keywords: 'deployments pilot production' },
  { label: 'Go to Reports', to: '/reports', icon: BarChart3, keywords: 'reports analytics', roles: ['admin', 'team_lead'] },
  { label: 'Go to Settings', to: '/settings', icon: Settings, keywords: 'settings sla', roles: ['admin'] },
];

export default function CommandPalette() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    openQuickTicket,
    openQuickTask,
    openTicketDrawer,
    openTaskDrawer,
  } = useWorkspace();
  const { user } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ tickets: [], tasks: [], clients: [], projects: [], employees: [] });
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [commandPaletteOpen]);

  useEffect(() => {
    if (!commandPaletteOpen) return;
    const q = query.trim();
    if (!q) {
      setResults({ tickets: [], tasks: [], clients: [], projects: [], employees: [] });
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get('/search', { params: { q } });
        setResults(data.data || {});
      } catch {
        // ignore
      } finally {
        setSearching(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query, commandPaletteOpen]);

  if (!commandPaletteOpen) return null;

  const qLower = query.toLowerCase();
  const filteredNav = NAV_COMMANDS.filter(
    (c) =>
      (!c.roles || (user && c.roles.includes(user.role))) &&
      (!qLower || c.label.toLowerCase().includes(qLower) || c.keywords.includes(qLower))
  );

  const close = () => setCommandPaletteOpen(false);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-[#171717]/40 backdrop-blur-[1px]">
      <div className="fixed inset-0" onClick={close} />
      <div className="relative z-10 w-full max-w-xl rounded-2xl border border-[#E8E8E5] bg-white shadow-2xl dark:border-[#2C2E33] dark:bg-[#17181B] overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-[#E8E8E5] dark:border-[#26282D] px-4 py-3">
          <Search className="h-4 w-4 text-[#777777]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, ticket ID, client, task, or page..."
            className="flex-1 bg-transparent text-sm text-[#171717] dark:text-slate-100 placeholder-[#777777] focus:outline-none"
          />
          <kbd className="rounded border border-[#E8E8E5] dark:border-[#2C2E33] px-1.5 py-0.5 text-[10px] font-mono text-[#777777]">
            ESC
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2 space-y-3 text-xs">
          {/* Quick Actions */}
          <div>
            <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#777777]">
              Actions
            </div>
            <button
              onClick={() => {
                close();
                openQuickTicket();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-[#C6F36B]/25 text-left"
            >
              <Plus className="h-4 w-4 text-[#171717] dark:text-[#C6F36B]" />
              <span className="font-medium">Create New Ticket</span>
              <kbd className="ml-auto rounded bg-[#F4F4F2] dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-mono">C</kbd>
            </button>
            <button
              onClick={() => {
                close();
                openQuickTask();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-[#C6F36B]/25 text-left"
            >
              <Plus className="h-4 w-4 text-[#35B8A6]" />
              <span className="font-medium">Create New Task</span>
            </button>
          </div>

          {/* Search Matches */}
          {searching && <div className="px-3 py-2 text-[#777777]">Searching workspace...</div>}

          {(results.tickets || []).length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#777777]">
                Tickets
              </div>
              {results.tickets.map((t) => (
                <button
                  key={t._id}
                  onClick={() => {
                    close();
                    openTicketDrawer(t._id);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 hover:bg-[#F4F4F2] dark:hover:bg-white/5 text-left"
                >
                  <div className="truncate">
                    <span className="font-mono font-semibold text-[#638BEF] mr-2">{t.ticketId}</span>
                    <span className="font-medium">{t.title}</span>
                  </div>
                  <Badge value={t.status}>{t.status}</Badge>
                </button>
              ))}
            </div>
          )}

          {(results.tasks || []).length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#777777]">
                Tasks
              </div>
              {results.tasks.map((t) => (
                <button
                  key={t._id}
                  onClick={() => {
                    close();
                    openTaskDrawer(t._id);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 hover:bg-[#F4F4F2] dark:hover:bg-white/5 text-left"
                >
                  <div className="truncate">
                    <span className="font-mono font-semibold text-[#A88CEB] mr-2">{t.taskId}</span>
                    <span className="font-medium">{t.title}</span>
                  </div>
                  <Badge value={t.status}>{t.status}</Badge>
                </button>
              ))}
            </div>
          )}

          {(results.clients || []).length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#777777]">
                Clients
              </div>
              {results.clients.map((c) => (
                <button
                  key={c._id}
                  onClick={() => {
                    close();
                    navigate(`/clients/${c._id}`);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 hover:bg-[#F4F4F2] dark:hover:bg-white/5 text-left"
                >
                  <span className="font-medium">{c.companyName}</span>
                  <span className="font-mono text-[11px] text-[#777777]">{c.clientFolderCode}</span>
                </button>
              ))}
            </div>
          )}

          {/* Navigation */}
          {filteredNav.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#777777]">
                Navigate
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {filteredNav.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.to}
                      onClick={() => {
                        close();
                        navigate(item.to);
                      }}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-[#F4F4F2] dark:hover:bg-white/5 text-left"
                    >
                      <Icon className="h-3.5 w-3.5 text-[#777777]" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
