import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  LayoutList,
  Kanban,
  GanttChart,
  FolderOpen,
  Trash2,
} from 'lucide-react';
import api, { getApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  PRIORITIES,
  TASK_STATUSES,
  STATUS_DOT_COLOR,
  formatStatusLabel,
} from '../utils/constants';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Loader from '../components/ui/Loader';
import EmptyState from '../components/ui/EmptyState';
import ContextMenu from '../components/ui/ContextMenu';
import KanbanBoard from '../components/workspace/KanbanBoard';
import WorkListView from '../components/workspace/WorkListView';
import TimelineView from '../components/workspace/TimelineView';
import SavedViewsBar from '../components/workspace/SavedViewsBar';

export default function TasksPage({ defaultTab = 'my' }) {
  const { isManager } = useAuth();
  const { addToast } = useToast();
  const { clients, users, projects, openQuickTask, openTaskDrawer, lastSync, notifyLocalMutation } = useWorkspace();
  const [searchParams] = useSearchParams();

  const [scopeTab, setScopeTab] = useState(defaultTab === 'board' ? 'all' : defaultTab);
  const [viewMode, setViewMode] = useState(defaultTab === 'board' ? 'board' : 'list');
  const [groupBy, setGroupBy] = useState('status');
  const [hideEmptyCols, setHideEmptyCols] = useState(false);
  const [employeeFilter, setEmployeeFilter] = useState(searchParams.get('employee') || '');

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingSync, setSavingSync] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('sortOrder');
  const [sortOrder, setSortOrder] = useState('asc');
  const [activeViewId, setActiveViewId] = useState(null);

  const [selectedIds, setSelectedIds] = useState([]);
  const [lastSelectedIdx, setLastSelectedIdx] = useState(null);
  const [contextMenu, setContextMenu] = useState({ open: false, position: null, item: null });

  useEffect(() => {
    const qView = searchParams.get('view');
    const qEmp = searchParams.get('employee') || '';
    setEmployeeFilter(qEmp);
    if (qView && ['my', 'all', 'overdue', 'completed'].includes(qView)) {
      setScopeTab(qView);
    } else if (defaultTab === 'board') {
      setScopeTab('all');
      setViewMode('board');
    } else if (defaultTab === 'my') {
      setScopeTab('my');
    }
  }, [defaultTab, searchParams]);

  // Ctrl/Cmd + B toggles Board vs List
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setViewMode((v) => (v === 'board' ? 'list' : 'board'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading((prev) => (tasks.length === 0 ? true : prev));
    try {
      const params = {
        scope: scopeTab === 'my' && !employeeFilter ? undefined : 'all',
        view: scopeTab,
        employee: employeeFilter || undefined,
        sortBy,
        sortOrder,
        limit: 100,
      };
      if (search) params.search = search;
      const { data } = await api.get('/tasks', { params });
      setTasks(data.data || []);
    } catch (err) {
      addToast(getApiError(err, 'Failed to load tasks'), 'error');
    } finally {
      setLoading(false);
    }
  }, [scopeTab, employeeFilter, search, sortBy, sortOrder]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks, lastSync.task]);

  const columns = useMemo(() => {
    if (groupBy === 'status') {
      return TASK_STATUSES.map((s) => ({
        key: s,
        label: formatStatusLabel(s),
        color: STATUS_DOT_COLOR[s],
      }));
    }
    if (groupBy === 'priority') {
      return PRIORITIES.map((p) => ({ key: p, label: p }));
    }
    if (groupBy === 'client') {
      return clients.map((c) => ({ key: c._id, label: c.companyName, color: '#35B8A6' }));
    }
    if (groupBy === 'assignee') {
      return [
        { key: 'unassigned', label: 'Unassigned', color: '#777777' },
        ...users.map((u) => ({ key: u._id, label: u.fullName, color: u.avatarColor })),
      ];
    }
    return [];
  }, [groupBy, clients, users]);

  const handleMoveTask = async ({ id, groupBy: grp, destinationValue, newSortOrder }) => {
    const prevSnapshot = [...tasks];
    setSavingSync(true);

    setTasks((prev) =>
      prev
        .map((t) => {
          if (t._id !== id) return t;
          const updated = { ...t, sortOrder: newSortOrder };
          if (grp === 'status') updated.status = destinationValue;
          if (grp === 'priority') updated.priority = destinationValue;
          if (grp === 'assignee') {
            const u = users.find((x) => x._id === destinationValue);
            updated.assignedEmployees = u ? [u] : [];
          }
          return updated;
        })
        .sort((a, b) => (a.sortOrder || 1000) - (b.sortOrder || 1000))
    );

    try {
      await api.patch('/tasks/reorder', {
        id,
        groupBy: grp,
        destinationValue,
        newSortOrder,
      });
      notifyLocalMutation('task');
    } catch (err) {
      setTasks(prevSnapshot);
      addToast(getApiError(err, 'Failed to move task'), 'error');
    } finally {
      setSavingSync(false);
    }
  };

  const handleInlineUpdate = async (id, patch) => {
    setSavingSync(true);
    const prev = [...tasks];
    setTasks((list) => list.map((t) => (t._id === id ? { ...t, ...patch } : t)));
    try {
      await api.put(`/tasks/${id}`, patch);
      notifyLocalMutation('task');
    } catch (err) {
      setTasks(prev);
      addToast(getApiError(err), 'error');
    } finally {
      setSavingSync(false);
    }
  };

  const handleStatusChange = async (id, status) => {
    setSavingSync(true);
    const prev = [...tasks];
    setTasks((list) => list.map((t) => (t._id === id ? { ...t, status } : t)));
    try {
      await api.patch(`/tasks/${id}/status`, { status });
      notifyLocalMutation('task');
    } catch (err) {
      setTasks(prev);
      addToast(getApiError(err), 'error');
    } finally {
      setSavingSync(false);
    }
  };

  const handleToggleSelect = (id, isShift) => {
    const idx = tasks.findIndex((t) => t._id === id);
    if (isShift && lastSelectedIdx !== null && idx !== -1) {
      const [start, end] = [Math.min(lastSelectedIdx, idx), Math.max(lastSelectedIdx, idx)];
      const rangeIds = tasks.slice(start, end + 1).map((t) => t._id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...rangeIds])));
    } else {
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
      setLastSelectedIdx(idx);
    }
  };

  const handleBulkAction = async (action, value) => {
    if (selectedIds.length === 0) return;
    setSavingSync(true);
    try {
      await api.post('/tasks/bulk', { ids: selectedIds, action, value });
      addToast(`Bulk ${action} applied to ${selectedIds.length} task(s)`);
      setSelectedIds([]);
      fetchTasks();
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setSavingSync(false);
    }
  };

  const contextItems = contextMenu.item
    ? [
        { label: 'Open Task Drawer', icon: FolderOpen, onClick: () => openTaskDrawer(contextMenu.item._id) },
        { divider: true },
        { label: 'Mark In Progress', onClick: () => handleStatusChange(contextMenu.item._id, 'In Progress') },
        { label: 'Mark Completed', onClick: () => handleStatusChange(contextMenu.item._id, 'Completed') },
        { label: 'Set High Priority', onClick: () => handleInlineUpdate(contextMenu.item._id, { priority: 'High' }) },
        {
          label: 'Copy Link',
          onClick: () => {
            navigator.clipboard.writeText(`${window.location.origin}/task-board`);
            addToast('Link copied');
          },
        },
        { divider: true, hidden: !isManager },
        {
          label: 'Archive Task',
          icon: Trash2,
          danger: true,
          hidden: !isManager,
          onClick: async () => {
            await api.delete(`/tasks/${contextMenu.item._id}`);
            addToast('Task archived');
            fetchTasks();
          },
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title={scopeTab === 'my' ? 'My Work' : 'Task Board & Workspace'}
        subtitle="Manage Sage X3 4GL tasks, nested subtasks, drag-and-drop statuses, and timelines"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {savingSync && (
              <span className="rounded-md bg-[#C6F36B] px-2 py-1 text-[11px] font-semibold text-[#171717]">
                Syncing...
              </span>
            )}
            <div className="inline-flex rounded-lg border border-[#E8E8E5] bg-white p-0.5 dark:border-[#2C2E33] dark:bg-[#17181B]">
              {[
                { id: 'board', label: 'Board', icon: Kanban },
                { id: 'list', label: 'List', icon: LayoutList },
                { id: 'timeline', label: 'Timeline', icon: GanttChart },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => setViewMode(m.id)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      viewMode === m.id
                        ? 'bg-[#171717] text-[#C6F36B] dark:bg-[#C6F36B] dark:text-[#171717]'
                        : 'text-[#555555] dark:text-slate-300'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" /> {m.label}
                  </button>
                );
              })}
            </div>
            <Button onClick={() => openQuickTask()}>
              <Plus className="h-4 w-4" /> New Task
            </Button>
          </div>
        }
      />

      <SavedViewsBar
        entityType="task"
        activeViewId={activeViewId}
        currentConfig={{ viewMode, groupBy, sortBy, sortOrder, filters: { scopeTab }, hideEmptyColumns: hideEmptyCols }}
        onApplyView={(v) => {
          setActiveViewId(v._id);
          if (v.viewMode && ['board', 'list', 'timeline'].includes(v.viewMode)) setViewMode(v.viewMode);
          if (v.config?.groupBy) setGroupBy(v.config.groupBy);
        }}
      />

      <Card padding={false} className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="inline-flex flex-wrap rounded-lg bg-[#F4F4F2] p-0.5 dark:bg-white/5">
            {[
              { id: 'my', label: 'My Tasks' },
              { id: 'all', label: 'All Tasks' },
              { id: 'overdue', label: 'Overdue' },
              { id: 'completed', label: 'Completed' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setScopeTab(t.id)}
                className={`rounded-md px-3 py-1 text-xs font-medium ${
                  scopeTab === t.id
                    ? 'bg-white text-[#171717] shadow-sm dark:bg-[#1E2025] dark:text-white'
                    : 'text-[#777777]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-md justify-end">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#777777]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks..."
                className="w-full rounded-lg border border-[#E8E8E5] bg-[#F4F4F2]/60 py-1.5 pl-8 pr-3 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
              />
            </div>

            {viewMode === 'board' && (
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}
                className="rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-1.5 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
              >
                <option value="status">Group: Status</option>
                <option value="priority">Group: Priority</option>
                <option value="assignee">Group: Assignee</option>
                <option value="client">Group: Client</option>
              </select>
            )}
          </div>
        </div>
      </Card>

      {loading ? (
        <Loader label="Loading tasks..." />
      ) : tasks.length === 0 ? (
        <EmptyState
          title="No tasks found"
          description="Create a task linked to a Sage X3 ticket or switch views."
          action={<Button onClick={() => openQuickTask()}>Create Task</Button>}
        />
      ) : viewMode === 'board' ? (
        <KanbanBoard
          items={tasks}
          columns={columns}
          entityType="task"
          groupBy={groupBy}
          hideEmptyColumns={hideEmptyCols}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onOpenItem={(item) => openTaskDrawer(item._id)}
          onContextMenu={(e, item) => setContextMenu({ open: true, position: { x: e.clientX, y: e.clientY }, item })}
          onQuickCreate={(colKey) => openQuickTask(groupBy === 'status' ? { status: colKey } : {})}
          onMoveItem={handleMoveTask}
        />
      ) : viewMode === 'timeline' ? (
        <TimelineView
          items={tasks}
          projects={projects}
          entityType="task"
          onOpenItem={(item) => openTaskDrawer(item._id)}
          onReschedule={(id, dates) => handleInlineUpdate(id, dates)}
        />
      ) : (
        <WorkListView
          items={tasks}
          entityType="task"
          users={users}
          projects={projects}
          isManager={isManager}
          selectedIds={selectedIds}
          onSelectAll={(checked) => setSelectedIds(checked ? tasks.map((t) => t._id) : [])}
          onToggleSelect={handleToggleSelect}
          onClearSelection={() => setSelectedIds([])}
          onOpenItem={(item) => openTaskDrawer(item._id)}
          onInlineUpdate={handleInlineUpdate}
          onStatusChange={handleStatusChange}
          onBulkAction={handleBulkAction}
          onContextMenu={(e, item) => setContextMenu({ open: true, position: { x: e.clientX, y: e.clientY }, item })}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={(col) => {
            setSortOrder((o) => (sortBy === col && o === 'asc' ? 'desc' : 'asc'));
            setSortBy(col);
          }}
        />
      )}

      <ContextMenu
        open={contextMenu.open}
        position={contextMenu.position}
        onClose={() => setContextMenu({ open: false, position: null, item: null })}
        items={contextItems}
      />
    </div>
  );
}
