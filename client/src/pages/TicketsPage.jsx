import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  LayoutList,
  Kanban,
  GanttChart,
  SlidersHorizontal,
  Copy,
  ExternalLink,
  Trash2,
  FolderOpen,
} from 'lucide-react';
import api, { getApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  PRIORITIES,
  TICKET_STATUSES,
  formatStatusLabel,
  STATUS_DOT_COLOR,
} from '../utils/constants';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Loader from '../components/ui/Loader';
import EmptyState from '../components/ui/EmptyState';
import Pagination from '../components/ui/Pagination';
import ContextMenu from '../components/ui/ContextMenu';
import Modal from '../components/ui/Modal';
import KanbanBoard from '../components/workspace/KanbanBoard';
import WorkListView from '../components/workspace/WorkListView';
import TimelineView from '../components/workspace/TimelineView';
import SavedViewsBar from '../components/workspace/SavedViewsBar';

export default function TicketsPage() {
  const { isManager } = useAuth();
  const { addToast } = useToast();
  const {
    clients,
    users,
    projects,
    openQuickTicket,
    openTicketDrawer,
    lastSync,
    notifyLocalMutation,
  } = useWorkspace();
  const [searchParams] = useSearchParams();

  const [viewMode, setViewMode] = useState('board'); // board | list | timeline
  const [groupBy, setGroupBy] = useState('status');
  const [hideEmptyCols, setHideEmptyCols] = useState(false);
  const [visibleFields, setVisibleFields] = useState({
    priority: true,
    client: true,
    dueDate: true,
    counts: true,
    progress: false,
  });
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const [tickets, setTickets] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingSync, setSavingSync] = useState(false);
  const [activeViewId, setActiveViewId] = useState(null);

  const [selectedIds, setSelectedIds] = useState([]);
  const [lastSelectedIdx, setLastSelectedIdx] = useState(null);
  const [contextMenu, setContextMenu] = useState({ open: false, position: null, item: null });
  const [waiveDialog, setWaiveDialog] = useState({ open: false, movePayload: null, reason: '' });

  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    client: '',
    developer: '',
    priority: '',
    status: searchParams.get('status') || '',
    sortBy: 'sortOrder',
    sortOrder: 'asc',
    scope: 'all',
    page: 1,
  });

  const fetchTickets = useCallback(async () => {
    setLoading((prev) => (tickets.length === 0 ? true : prev));
    try {
      const params = {
        ...filters,
        limit: viewMode === 'list' ? 25 : 100,
      };
      Object.keys(params).forEach((k) => {
        if (params[k] === '') delete params[k];
      });
      const { data } = await api.get('/tickets', { params });
      setTickets(data.data || []);
      setMeta(data.meta || null);
    } catch (err) {
      addToast(getApiError(err, 'Failed to load tickets'), 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, viewMode]);

  useEffect(() => {
    setFilters((f) => ({
      ...f,
      search: searchParams.get('search') || '',
      client: searchParams.get('client') || '',
      developer: searchParams.get('developer') || '',
      priority: searchParams.get('priority') || '',
      status: searchParams.get('status') || '',
      overdueOnly: searchParams.get('overdueOnly') || '',
      page: 1,
    }));
  }, [searchParams]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets, lastSync.ticket]);

  // Ctrl/Cmd + B switches between Board and List view
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

  const columns = useMemo(() => {
    if (groupBy === 'status') {
      return TICKET_STATUSES.map((s) => ({
        key: s,
        label: formatStatusLabel(s),
        color: STATUS_DOT_COLOR[s],
      }));
    }
    if (groupBy === 'priority') {
      return PRIORITIES.map((p) => ({
        key: p,
        label: p,
        color: p === 'Critical' ? '#F16D64' : p === 'High' ? '#F59E0B' : p === 'Medium' ? '#638BEF' : '#777777',
      }));
    }
    if (groupBy === 'client') {
      return clients.map((c) => ({ key: c._id, label: `${c.companyName} (${c.clientFolderCode})`, color: '#35B8A6' }));
    }
    if (groupBy === 'assignee') {
      return [
        { key: 'unassigned', label: 'Unassigned', color: '#777777' },
        ...users.map((u) => ({ key: u._id, label: u.fullName, color: u.avatarColor })),
      ];
    }
    return [];
  }, [groupBy, clients, users]);

  const handleMoveTicket = async ({ id, groupBy: grp, destinationValue, newSortOrder, waive = false, waiveReason = '' }) => {
    const prevSnapshot = [...tickets];
    setSavingSync(true);

    // Optimistic UI update
    setTickets((prev) =>
      prev
        .map((t) => {
          if (t._id !== id) return t;
          const updated = { ...t, sortOrder: newSortOrder };
          if (grp === 'status') updated.status = destinationValue;
          if (grp === 'priority') updated.priority = destinationValue;
          if (grp === 'client') updated.client = clients.find((c) => c._id === destinationValue) || t.client;
          if (grp === 'assignee') {
            const u = users.find((x) => x._id === destinationValue);
            updated.assignedDevelopers = u ? [u] : [];
          }
          return updated;
        })
        .sort((a, b) => (a.sortOrder || 1000) - (b.sortOrder || 1000))
    );

    try {
      await api.patch('/tickets/reorder', {
        id,
        groupBy: grp,
        destinationValue,
        newSortOrder,
        waiveIncompleteTasks: waive,
        waiveReason,
      });
      notifyLocalMutation('ticket');
    } catch (err) {
      setTickets(prevSnapshot); // Rollback on failure
      const msg = getApiError(err, 'Could not move ticket');
      if (grp === 'status' && destinationValue === 'Closed' && msg.includes('associated task') && isManager) {
        setWaiveDialog({ open: true, movePayload: { id, groupBy: grp, destinationValue, newSortOrder }, reason: '' });
      } else {
        addToast(msg, 'error');
      }
    } finally {
      setSavingSync(false);
    }
  };

  const handleInlineUpdate = async (id, patch) => {
    setSavingSync(true);
    const prev = [...tickets];
    setTickets((list) => list.map((t) => (t._id === id ? { ...t, ...patch } : t)));
    try {
      await api.put(`/tickets/${id}`, patch);
      notifyLocalMutation('ticket');
    } catch (err) {
      setTickets(prev);
      addToast(getApiError(err), 'error');
    } finally {
      setSavingSync(false);
    }
  };

  const handleStatusChange = async (id, status) => {
    setSavingSync(true);
    const prev = [...tickets];
    setTickets((list) => list.map((t) => (t._id === id ? { ...t, status } : t)));
    try {
      await api.patch(`/tickets/${id}/status`, { status });
      notifyLocalMutation('ticket');
    } catch (err) {
      setTickets(prev);
      addToast(getApiError(err), 'error');
    } finally {
      setSavingSync(false);
    }
  };

  const handleToggleSelect = (id, isShift) => {
    const idx = tickets.findIndex((t) => t._id === id);
    if (isShift && lastSelectedIdx !== null && idx !== -1) {
      const [start, end] = [Math.min(lastSelectedIdx, idx), Math.max(lastSelectedIdx, idx)];
      const rangeIds = tickets.slice(start, end + 1).map((t) => t._id);
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
      await api.post('/tickets/bulk', { ids: selectedIds, action, value });
      addToast(`Bulk ${action} applied to ${selectedIds.length} ticket(s)`);
      setSelectedIds([]);
      fetchTickets();
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setSavingSync(false);
    }
  };

  const handleApplyView = (view) => {
    setActiveViewId(view._id);
    if (view.viewMode && ['board', 'list', 'timeline'].includes(view.viewMode)) {
      setViewMode(view.viewMode);
    }
    if (view.config?.groupBy) setGroupBy(view.config.groupBy);
    if (view.config?.hideEmptyColumns !== undefined) setHideEmptyCols(view.config.hideEmptyColumns);
    if (view.config?.filters) {
      setFilters((f) => ({ ...f, ...view.config.filters, page: 1 }));
    }
  };

  const contextItems = contextMenu.item
    ? [
        { label: 'Open Drawer', icon: FolderOpen, onClick: () => openTicketDrawer(contextMenu.item._id) },
        {
          label: 'Open Full Page',
          icon: ExternalLink,
          onClick: () => window.open(`/tickets/${contextMenu.item._id}`, '_self'),
        },
        { divider: true },
        {
          label: 'Set Critical Priority',
          onClick: () => handleInlineUpdate(contextMenu.item._id, { priority: 'Critical' }),
        },
        {
          label: 'Move to In Progress',
          onClick: () => handleStatusChange(contextMenu.item._id, 'In Progress'),
        },
        {
          label: 'Duplicate Ticket',
          icon: Copy,
          onClick: async () => {
            await api.post(`/tickets/${contextMenu.item._id}/duplicate`);
            addToast('Ticket duplicated');
            fetchTickets();
          },
        },
        {
          label: 'Copy Link',
          onClick: () => {
            navigator.clipboard.writeText(`${window.location.origin}/tickets/${contextMenu.item._id}`);
            addToast('Ticket link copied');
          },
        },
        {
          divider: true,
          hidden: !isManager,
        },
        {
          label: 'Archive Ticket',
          icon: Trash2,
          danger: true,
          hidden: !isManager,
          onClick: async () => {
            await api.delete(`/tickets/${contextMenu.item._id}`);
            addToast('Ticket archived');
            fetchTickets();
          },
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="All Tickets"
        subtitle="Drag and drop across statuses, customize views, edit inline, or open any ticket in the side drawer"
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

            <Button onClick={() => openQuickTicket()}>
              <Plus className="h-4 w-4" /> New Ticket
            </Button>
          </div>
        }
      />

      {/* Saved Views Bar */}
      <SavedViewsBar
        entityType="ticket"
        activeViewId={activeViewId}
        currentConfig={{ viewMode, groupBy, sortBy: filters.sortBy, sortOrder: filters.sortOrder, filters, hideEmptyColumns: hideEmptyCols }}
        onApplyView={handleApplyView}
      />

      {/* Filters & Board Controls */}
      <Card padding={false} className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#777777]" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
              placeholder="Search ID, title, or Sage X3 folder..."
              className="w-full rounded-lg border border-[#E8E8E5] bg-[#F4F4F2]/60 py-1.5 pl-8 pr-3 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
            />
          </div>

          <select
            value={filters.client}
            onChange={(e) => setFilters((f) => ({ ...f, client: e.target.value, page: 1 }))}
            className="rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-1.5 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
          >
            <option value="">All Clients</option>
            {clients.map((c) => (
              <option key={c._id} value={c._id}>
                {c.companyName}
              </option>
            ))}
          </select>

          <select
            value={filters.developer}
            onChange={(e) => setFilters((f) => ({ ...f, developer: e.target.value, page: 1 }))}
            className="rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-1.5 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
          >
            <option value="">All Developers</option>
            {users.map((u) => (
              <option key={u._id} value={u._id}>
                {u.fullName}
              </option>
            ))}
          </select>

          <select
            value={filters.priority}
            onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value, page: 1 }))}
            className="rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-1.5 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
          >
            <option value="">All Priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {viewMode === 'board' && (
            <div className="relative flex items-center gap-1.5">
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}
                className="rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-1.5 text-xs font-medium dark:border-[#2C2E33] dark:bg-[#1E2025]"
              >
                <option value="status">Group: Status</option>
                <option value="priority">Group: Priority</option>
                <option value="assignee">Group: Assignee</option>
                <option value="client">Group: Client</option>
              </select>

              <Button size="xs" variant="secondary" onClick={() => setCustomizeOpen((o) => !o)}>
                <SlidersHorizontal className="h-3.5 w-3.5" /> Display
              </Button>

              {customizeOpen && (
                <div className="absolute right-0 top-9 z-30 w-52 rounded-xl border border-[#E8E8E5] bg-white p-2.5 shadow-xl dark:border-[#2C2E33] dark:bg-[#1C1D21] text-xs space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={hideEmptyCols} onChange={(e) => setHideEmptyCols(e.target.checked)} />
                    <span>Hide empty columns</span>
                  </label>
                  <div className="border-t border-[#E8E8E5] dark:border-[#2C2E33] pt-1.5 font-semibold text-[10px] uppercase text-[#777777]">
                    Card Fields
                  </div>
                  {[
                    { key: 'priority', label: 'Priority Badge' },
                    { key: 'client', label: 'Client & Folder' },
                    { key: 'dueDate', label: 'Due Date' },
                    { key: 'counts', label: 'Comments & Files' },
                  ].map((f) => (
                    <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleFields[f.key]}
                        onChange={(e) => setVisibleFields((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                      />
                      <span>{f.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {loading ? (
        <Loader label="Loading tickets..." />
      ) : tickets.length === 0 ? (
        <EmptyState
          title="No tickets match"
          description="Try clearing filters or create a new Sage X3 ticket."
          action={<Button onClick={() => openQuickTicket()}>Create Ticket</Button>}
        />
      ) : viewMode === 'board' ? (
        <KanbanBoard
          items={tickets}
          columns={columns}
          entityType="ticket"
          groupBy={groupBy}
          hideEmptyColumns={hideEmptyCols}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onOpenItem={(item) => openTicketDrawer(item._id)}
          onContextMenu={(e, item) => setContextMenu({ open: true, position: { x: e.clientX, y: e.clientY }, item })}
          onQuickCreate={(colKey) => openQuickTicket(groupBy === 'status' ? { status: colKey } : {})}
          onMoveItem={handleMoveTicket}
          visibleFields={visibleFields}
        />
      ) : viewMode === 'timeline' ? (
        <TimelineView
          items={tickets}
          projects={projects}
          entityType="ticket"
          onOpenItem={(item) => openTicketDrawer(item._id)}
          onReschedule={(id, dates) => handleInlineUpdate(id, dates)}
        />
      ) : (
        <>
          <WorkListView
            items={tickets}
            entityType="ticket"
            users={users}
            projects={projects}
            isManager={isManager}
            selectedIds={selectedIds}
            onSelectAll={(checked) => setSelectedIds(checked ? tickets.map((t) => t._id) : [])}
            onToggleSelect={handleToggleSelect}
            onClearSelection={() => setSelectedIds([])}
            onOpenItem={(item) => openTicketDrawer(item._id)}
            onInlineUpdate={handleInlineUpdate}
            onStatusChange={handleStatusChange}
            onBulkAction={handleBulkAction}
            onContextMenu={(e, item) => setContextMenu({ open: true, position: { x: e.clientX, y: e.clientY }, item })}
            sortBy={filters.sortBy}
            sortOrder={filters.sortOrder}
            onSortChange={(col) =>
              setFilters((f) => ({
                ...f,
                sortBy: col,
                sortOrder: f.sortBy === col && f.sortOrder === 'asc' ? 'desc' : 'asc',
              }))
            }
          />
          <Pagination meta={meta} onPageChange={(p) => setFilters((f) => ({ ...f, page: p }))} />
        </>
      )}

      <ContextMenu
        open={contextMenu.open}
        position={contextMenu.position}
        onClose={() => setContextMenu({ open: false, position: null, item: null })}
        items={contextItems}
      />

      <Modal
        open={waiveDialog.open}
        onClose={() => setWaiveDialog({ open: false, movePayload: null, reason: '' })}
        title="Incomplete Tasks Waiver"
        maxWidth="max-w-md"
      >
        <p className="text-xs text-[#777777] mb-3">
          This ticket still has open tasks. Enter a manager waiver reason to close it via drag-and-drop.
        </p>
        <textarea
          rows={3}
          value={waiveDialog.reason}
          onChange={(e) => setWaiveDialog((w) => ({ ...w, reason: e.target.value }))}
          className="w-full rounded-lg border p-2 text-xs dark:bg-[#1E2025]"
          placeholder="Waiver reason..."
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setWaiveDialog({ open: false, movePayload: null, reason: '' })}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              const p = waiveDialog.movePayload;
              setWaiveDialog({ open: false, movePayload: null, reason: '' });
              if (p) handleMoveTicket({ ...p, waive: true, waiveReason: waiveDialog.reason });
            }}
          >
            Waive & Close
          </Button>
        </div>
      </Modal>
    </div>
  );
}
