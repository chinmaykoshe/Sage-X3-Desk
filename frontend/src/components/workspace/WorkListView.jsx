import { useState } from 'react';
import { ArrowUpDown, Columns3, MoreHorizontal, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import {
  PRIORITIES,
  TICKET_STATUSES,
  TASK_STATUSES,
  formatStatusLabel,
} from '../../utils/constants';
import Avatar from '../ui/Avatar';
import Button from '../ui/Button';
import Card from '../ui/Card';
import ConfirmDialog from '../ui/ConfirmDialog';

const DEFAULT_COLUMNS = [
  { key: 'id', label: 'ID', width: 100 },
  { key: 'title', label: 'Title', width: 280 },
  { key: 'client', label: 'Client', width: 170 },
  { key: 'assignee', label: 'Assignee', width: 140 },
  { key: 'priority', label: 'Priority', width: 110 },
  { key: 'status', label: 'Status', width: 145 },
  { key: 'dueDate', label: 'Due Date', width: 130 },
  { key: 'progress', label: 'Progress', width: 110 },
  { key: 'updatedAt', label: 'Updated At', width: 120 },
];

export default function WorkListView({
  items = [],
  entityType = 'ticket',
  users = [],
  projects = [],
  isManager = false,
  selectedIds = [],
  onSelectAll,
  onToggleSelect,
  onClearSelection,
  onOpenItem,
  onInlineUpdate,
  onStatusChange,
  onBulkAction,
  onContextMenu,
  sortBy,
  sortOrder,
  onSortChange,
}) {
  const [hiddenCols, setHiddenCols] = useState([]);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [colWidths, setColWidths] = useState({});
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [bulkDueDate, setBulkDueDate] = useState('');

  const statuses = entityType === 'ticket' ? TICKET_STATUSES : TASK_STATUSES;
  const allSelected = items.length > 0 && items.every((i) => selectedIds.includes(i._id));

  const startResize = (colKey, e) => {
    e.preventDefault();
    const startX = e.clientX;
    const baseW = colWidths[colKey] || DEFAULT_COLUMNS.find((c) => c.key === colKey)?.width || 140;
    const onMove = (moveEv) => {
      const nextW = Math.max(80, baseW + (moveEv.clientX - startX));
      setColWidths((prev) => ({ ...prev, [colKey]: nextW }));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const visibleCols = DEFAULT_COLUMNS.filter((c) => !hiddenCols.includes(c.key));

  return (
    <div className="space-y-3">
      {/* Column Visibility Bar */}
      <div className="flex justify-end relative">
        <Button size="xs" variant="secondary" onClick={() => setColMenuOpen((o) => !o)}>
          <Columns3 className="h-3.5 w-3.5" /> Columns
        </Button>
        {colMenuOpen && (
          <div className="absolute right-0 top-8 z-30 w-48 rounded-xl border border-[#E8E8E5] bg-white p-2 shadow-xl dark:border-[#2C2E33] dark:bg-[#1C1D21] text-xs space-y-1">
            {DEFAULT_COLUMNS.map((c) => (
              <label key={c.key} className="flex items-center gap-2 px-2 py-1 hover:bg-[#F4F4F2] dark:hover:bg-white/10 rounded cursor-pointer">
                <input
                  type="checkbox"
                  checked={!hiddenCols.includes(c.key)}
                  onChange={(e) =>
                    setHiddenCols((prev) =>
                      e.target.checked ? prev.filter((x) => x !== c.key) : [...prev, c.key]
                    )
                  }
                />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Spreadsheet Table */}
      <Card padding={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="border-b border-[#E8E8E5] bg-[#F4F4F2]/70 text-[11px] font-semibold uppercase tracking-wider text-[#777777] dark:border-[#26282D] dark:bg-white/[0.03]">
              <tr>
                <th className="w-9 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => onSelectAll?.(e.target.checked)}
                    className="h-3.5 w-3.5 rounded accent-[#171717]"
                  />
                </th>
                {visibleCols.map((col) => (
                  <th
                    key={col.key}
                    style={{ minWidth: colWidths[col.key] || col.width }}
                    className="relative px-3 py-2.5 select-none group"
                  >
                    <button
                      type="button"
                      onClick={() => onSortChange?.(col.key === 'id' ? 'ticketId' : col.key)}
                      className="inline-flex items-center gap-1 hover:text-[#171717] dark:hover:text-white"
                    >
                      {col.label}
                      {['priority', 'status', 'dueDate', 'updatedAt'].includes(col.key) && (
                        <ArrowUpDown className={`h-3 w-3 ${sortBy === col.key ? 'text-[#171717] dark:text-[#C6F36B]' : 'opacity-40'}`} />
                      )}
                    </button>
                    <span
                      onMouseDown={(e) => startResize(col.key, e)}
                      className="absolute right-0 top-1 bottom-1 w-1 cursor-col-resize hover:bg-[#638BEF]"
                    />
                  </th>
                ))}
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>

            <tbody className="divide-y divide-[#E8E8E5] dark:divide-[#26282D]">
              {items.map((item) => {
                const isSelected = selectedIds.includes(item._id);
                const refId = entityType === 'ticket' ? item.ticketId : item.taskId;
                const assignees = entityType === 'ticket' ? item.assignedDevelopers || [] : item.assignedEmployees || [];
                const progress =
                  entityType === 'task'
                    ? item.status === 'Completed'
                      ? 100
                      : item.completionPercentage || 0
                    : item.taskSummary?.total > 0
                    ? Math.round((item.taskSummary.completed / item.taskSummary.total) * 100)
                    : item.status === 'Resolved' || item.status === 'Closed'
                    ? 100
                    : 0;

                return (
                  <tr
                    key={item._id}
                    onClick={() => onOpenItem?.(item)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onContextMenu?.(e, item);
                    }}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#C6F36B]/20 dark:bg-[#C6F36B]/10'
                        : 'hover:bg-[#F4F4F2]/60 dark:hover:bg-white/[0.03]'
                    }`}
                  >
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => onToggleSelect?.(item._id, e.nativeEvent?.shiftKey)}
                        className="h-3.5 w-3.5 rounded accent-[#171717]"
                      />
                    </td>

                    {visibleCols.map((col) => {
                      if (col.key === 'id') {
                        return (
                          <td key={col.key} className="px-3 py-2.5 font-mono text-[11px] font-semibold text-[#638BEF]">
                            {refId}
                          </td>
                        );
                      }
                      if (col.key === 'title') {
                        return (
                          <td key={col.key} className="px-3 py-2.5 font-medium text-[#171717] dark:text-slate-100 max-w-xs truncate">
                            {item.title}
                          </td>
                        );
                      }
                      if (col.key === 'client') {
                        return (
                          <td key={col.key} className="px-3 py-2.5 text-[#555555] dark:text-slate-300 truncate max-w-[170px]">
                            {item.client?.companyName || 'Internal'}
                          </td>
                        );
                      }
                      if (col.key === 'assignee') {
                        return (
                          <td key={col.key} className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <div className="flex -space-x-1">
                              {assignees.length === 0 ? (
                                <span className="text-[#999999]">—</span>
                              ) : (
                                assignees.map((u) => <Avatar key={u._id} name={u.fullName} color={u.avatarColor} size="xs" />)
                              )}
                            </div>
                          </td>
                        );
                      }
                      if (col.key === 'priority') {
                        return (
                          <td key={col.key} className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={item.priority}
                              onChange={(e) => onInlineUpdate?.(item._id, { priority: e.target.value })}
                              className="rounded-md border border-[#E8E8E5] bg-white px-2 py-1 text-[11px] font-medium dark:border-[#2C2E33] dark:bg-[#1E2025]"
                            >
                              {PRIORITIES.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      }
                      if (col.key === 'status') {
                        return (
                          <td key={col.key} className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={item.status}
                              onChange={(e) => onStatusChange?.(item._id, e.target.value)}
                              className="rounded-md border border-[#E8E8E5] bg-white px-2 py-1 text-[11px] font-medium dark:border-[#2C2E33] dark:bg-[#1E2025]"
                            >
                              {statuses.map((s) => (
                                <option key={s} value={s}>
                                  {formatStatusLabel(s)}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      }
                      if (col.key === 'dueDate') {
                        return (
                          <td key={col.key} className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="date"
                              value={item.dueDate ? dayjs(item.dueDate).format('YYYY-MM-DD') : ''}
                              onChange={(e) => onInlineUpdate?.(item._id, { dueDate: e.target.value || null })}
                              className={`rounded border border-transparent hover:border-[#E8E8E5] bg-transparent px-1 py-0.5 text-[11px] dark:hover:border-[#2C2E33] ${
                                item.isOverdue ? 'font-semibold text-[#F16D64]' : ''
                              }`}
                            />
                          </td>
                        );
                      }
                      if (col.key === 'progress') {
                        return (
                          <td key={col.key} className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <div className="h-1.5 w-14 rounded-full bg-[#E8E8E5] dark:bg-white/10 overflow-hidden">
                                <div className="h-full bg-[#35B8A6]" style={{ width: `${progress}%` }} />
                              </div>
                              <span className="text-[11px] font-mono text-[#777777]">{progress}%</span>
                            </div>
                          </td>
                        );
                      }
                      if (col.key === 'updatedAt') {
                        return (
                          <td key={col.key} className="px-3 py-2.5 text-[#777777]">
                            {dayjs(item.updatedAt).format('DD MMM, HH:mm')}
                          </td>
                        );
                      }
                      return null;
                    })}

                    <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => onContextMenu?.(e, item)}
                        className="rounded p-1 text-[#777777] hover:bg-[#E8E8E5]/60 dark:hover:bg-white/10"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Floating Bulk Action Toolbar (Part 7) */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center gap-2 rounded-2xl border border-[#171717] bg-[#171717] px-4 py-2.5 text-xs text-white shadow-2xl dark:border-[#C6F36B]">
          <span className="rounded-md bg-[#C6F36B] px-2 py-0.5 font-bold text-[#171717]">
            {selectedIds.length} selected
          </span>

          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) onBulkAction?.('status', e.target.value);
              e.target.value = '';
            }}
            className="rounded-lg bg-white/10 px-2.5 py-1 text-xs text-white border border-white/15"
          >
            <option value="" className="text-black">Set Status...</option>
            {statuses.map((s) => (
              <option key={s} value={s} className="text-black">
                {formatStatusLabel(s)}
              </option>
            ))}
          </select>

          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) onBulkAction?.('priority', e.target.value);
              e.target.value = '';
            }}
            className="rounded-lg bg-white/10 px-2.5 py-1 text-xs text-white border border-white/15"
          >
            <option value="" className="text-black">Set Priority...</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p} className="text-black">
                {p}
              </option>
            ))}
          </select>

          {isManager && (
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) onBulkAction?.('assign', e.target.value);
                e.target.value = '';
              }}
              className="rounded-lg bg-white/10 px-2.5 py-1 text-xs text-white border border-white/15"
            >
              <option value="" className="text-black">Assign to...</option>
              {users.map((u) => (
                <option key={u._id} value={u._id} className="text-black">
                  {u.fullName}
                </option>
              ))}
            </select>
          )}

          <input
            type="date"
            value={bulkDueDate}
            onChange={(e) => {
              setBulkDueDate(e.target.value);
              if (e.target.value) onBulkAction?.('dueDate', e.target.value);
            }}
            title="Set bulk due date"
            className="rounded-lg bg-white/10 px-2 py-1 text-xs text-white border border-white/15"
          />

          {isManager && projects.length > 0 && (
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) onBulkAction?.('project', e.target.value);
                e.target.value = '';
              }}
              className="rounded-lg bg-white/10 px-2.5 py-1 text-xs text-white border border-white/15"
            >
              <option value="" className="text-black">Move Project...</option>
              {projects.map((p) => (
                <option key={p._id} value={p._id} className="text-black">
                  {p.projectId} — {p.name}
                </option>
              ))}
            </select>
          )}

          {isManager && (
            <button
              onClick={() => setArchiveConfirm(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-[#F16D64] px-2.5 py-1 font-medium text-white hover:bg-[#e05b52]"
            >
              <Trash2 className="h-3.5 w-3.5" /> Archive
            </button>
          )}

          <button onClick={onClearSelection} className="ml-1 text-white/70 hover:text-white underline">
            Clear
          </button>
        </div>
      )}

      <ConfirmDialog
        open={archiveConfirm}
        onClose={() => setArchiveConfirm(false)}
        onConfirm={() => {
          setArchiveConfirm(false);
          onBulkAction?.('archive', true);
        }}
        title="Archive Selected Records"
        message={`Are you sure you want to archive ${selectedIds.length} selected ${entityType}(s)?`}
        confirmText="Archive"
      />
    </div>
  );
}
