import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Plus,
  GripVertical,
} from 'lucide-react';
import dayjs from 'dayjs';
import Badge from '../ui/Badge';
import Avatar from '../ui/Avatar';
import { STATUS_DOT_COLOR, formatStatusLabel } from '../../utils/constants';

function DraggableCard({
  item,
  entityType,
  isSelected,
  onToggleSelect,
  onOpen,
  onContextMenu,
  visibleFields,
  isOverlay = false,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item._id,
    data: { item },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  const refId = entityType === 'ticket' ? item.ticketId : item.taskId;
  const assignees = entityType === 'ticket' ? item.assignedDevelopers || [] : item.assignedEmployees || [];

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={isOverlay ? undefined : style}
      onClick={(e) => {
        if (e.shiftKey) {
          onToggleSelect?.(item._id, true);
        } else {
          onOpen?.(item);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e, item);
      }}
      className={`group relative rounded-xl border bg-white p-3 text-xs transition-all cursor-pointer select-none dark:bg-[#1C1D21] ${
        isSelected
          ? 'border-[#171717] ring-2 ring-[#C6F36B] dark:border-[#C6F36B]'
          : 'border-[#E8E8E5] hover:border-[#171717]/30 dark:border-[#2C2E33] dark:hover:border-white/25'
      } ${isOverlay ? 'shadow-2xl rotate-[1deg] cursor-grabbing' : 'shadow-[0_1px_2px_rgba(23,23,23,0.03)]'}`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {!isOverlay && (
            <button
              type="button"
              {...attributes}
              {...listeners}
              onClick={(e) => e.stopPropagation()}
              title="Drag to move"
              className="cursor-grab active:cursor-grabbing text-[#AAAAAA] hover:text-[#171717] dark:hover:text-white -ml-1"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          )}
          <input
            type="checkbox"
            checked={Boolean(isSelected)}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onToggleSelect?.(item._id, e.nativeEvent?.shiftKey)}
            className="h-3.5 w-3.5 rounded border-[#D8D8D3] accent-[#171717]"
          />
          <span className="font-mono text-[11px] font-semibold text-[#638BEF]">{refId}</span>
        </div>

        <div className="flex items-center gap-1">
          {visibleFields.priority && (
            <Badge variant="priority" value={item.priority}>
              {item.priority}
            </Badge>
          )}
          {!isOverlay && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onContextMenu?.(e, item);
              }}
              className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-[#777777] hover:bg-[#F4F4F2] dark:hover:bg-white/10"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-1.5 font-semibold text-[#171717] dark:text-slate-100 line-clamp-2 leading-snug">
        {item.title}
      </div>

      {entityType === 'task' && item.ticket && (
        <div className="mt-1 text-[11px] text-[#638BEF] truncate">
          {item.ticket.ticketId} · {item.ticket.title}
        </div>
      )}

      {visibleFields.client && item.client && (
        <div className="mt-2 flex items-center justify-between gap-1 text-[11px] text-[#777777]">
          <span className="truncate">{item.client.companyName}</span>
          {(item.folderCode || item.client.clientFolderCode) && (
            <span className="rounded bg-[#F4F4F2] dark:bg-white/10 px-1.5 py-0.5 font-mono text-[10px] shrink-0">
              {item.folderCode || item.client.clientFolderCode}
            </span>
          )}
        </div>
      )}

      {entityType === 'task' && visibleFields.progress && (
        <div className="mt-2">
          <div className="h-1.5 w-full rounded-full bg-[#F4F4F2] dark:bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#35B8A6]"
              style={{ width: `${item.status === 'Completed' ? 100 : item.completionPercentage || 0}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between border-t border-[#E8E8E5] dark:border-[#26282D] pt-2 text-[11px] text-[#777777]">
        <div className="flex -space-x-1">
          {assignees.length === 0 ? (
            <span className="text-[10px] text-[#999999]">Unassigned</span>
          ) : (
            assignees.slice(0, 3).map((u) => <Avatar key={u._id} name={u.fullName} color={u.avatarColor} size="xs" />)
          )}
        </div>

        <div className="flex items-center gap-2">
          {visibleFields.counts && (item.attachmentCount > 0 || item.commentCount > 0) && (
            <>
              {item.attachmentCount > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <Paperclip className="h-3 w-3" /> {item.attachmentCount}
                </span>
              )}
              {item.commentCount > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <MessageSquare className="h-3 w-3" /> {item.commentCount}
                </span>
              )}
            </>
          )}
          {visibleFields.dueDate && item.dueDate && (
            <span className={`inline-flex items-center gap-0.5 ${item.isOverdue ? 'font-semibold text-[#F16D64]' : ''}`}>
              <Clock className="h-3 w-3" /> {dayjs(item.dueDate).format('DD MMM')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({
  col,
  items,
  entityType,
  collapsed,
  onToggleCollapse,
  selectedIds,
  onToggleSelect,
  onOpenItem,
  onContextMenu,
  onQuickCreate,
  visibleFields,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${col.key}` });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-2xl border transition-colors shrink-0 ${
        collapsed ? 'w-12 items-center py-3' : 'w-72 sm:w-80'
      } ${
        isOver
          ? 'border-[#171717] bg-[#C6F36B]/15 dark:border-[#C6F36B] dark:bg-[#C6F36B]/10'
          : 'border-[#E8E8E5] bg-[#EBEBE8]/60 dark:border-[#26282D] dark:bg-[#141518]'
      } max-h-[72vh]`}
    >
      {collapsed ? (
        <button
          onClick={() => onToggleCollapse(col.key)}
          className="flex flex-col items-center gap-2 text-xs font-semibold text-[#555555] dark:text-slate-300"
          title={`Expand ${col.label}`}
        >
          <ChevronRight className="h-4 w-4" />
          <span className="rounded-full bg-white dark:bg-white/10 px-1.5 py-0.5 text-[10px]">{items.length}</span>
          <span className="[writing-mode:vertical-rl] rotate-180 tracking-wide">{col.label}</span>
        </button>
      ) : (
        <>
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: col.color || STATUS_DOT_COLOR[col.key] || '#638BEF' }}
              />
              <span className="text-xs font-semibold text-[#171717] dark:text-slate-100 truncate">
                {col.label}
              </span>
              <span className="rounded-full bg-white dark:bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-[#777777]">
                {items.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {onQuickCreate && (
                <button
                  onClick={() => onQuickCreate(col.key)}
                  title={`Quick add in ${col.label}`}
                  className="rounded p-1 text-[#777777] hover:bg-white hover:text-[#171717] dark:hover:bg-white/10"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => onToggleCollapse(col.key)}
                title="Collapse column"
                className="rounded p-1 text-[#777777] hover:bg-white hover:text-[#171717] dark:hover:bg-white/10"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <SortableContext items={items.map((i) => i._id)} strategy={verticalListSortingStrategy}>
            <div className="flex-1 overflow-y-auto px-2.5 pb-2.5 space-y-2 min-h-[60px]">
              {items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#D8D8D3] dark:border-[#2C2E33] py-6 text-center text-[11px] text-[#888888]">
                  Drop {entityType} here
                </div>
              ) : (
                items.map((item) => (
                  <DraggableCard
                    key={item._id}
                    item={item}
                    entityType={entityType}
                    isSelected={selectedIds.includes(item._id)}
                    onToggleSelect={onToggleSelect}
                    onOpen={onOpenItem}
                    onContextMenu={onContextMenu}
                    visibleFields={visibleFields}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </>
      )}
    </div>
  );
}

export default function KanbanBoard({
  items = [],
  columns = [],
  entityType = 'ticket',
  groupBy = 'status',
  hideEmptyColumns = false,
  selectedIds = [],
  onToggleSelect,
  onOpenItem,
  onContextMenu,
  onQuickCreate,
  onMoveItem,
  visibleFields = { priority: true, client: true, dueDate: true, counts: true, progress: true },
}) {
  const [activeId, setActiveId] = useState(null);
  const [collapsedCols, setCollapsedCols] = useState({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const grouped = useMemo(() => {
    const map = new Map(columns.map((c) => [c.key, []]));
    items.forEach((item) => {
      let key;
      if (groupBy === 'status') key = item.status;
      else if (groupBy === 'priority') key = item.priority;
      else if (groupBy === 'client') key = item.client?._id || 'none';
      else if (groupBy === 'assignee') {
        const list = entityType === 'ticket' ? item.assignedDevelopers : item.assignedEmployees;
        key = list?.[0]?._id || 'unassigned';
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return map;
  }, [items, columns, groupBy, entityType]);

  const visibleColumns = hideEmptyColumns
    ? columns.filter((c) => (grouped.get(c.key) || []).length > 0)
    : columns;

  const activeItem = activeId ? items.find((i) => i._id === activeId) : null;

  const findColumnForId = (id) => {
    if (String(id).startsWith('col:')) return String(id).replace('col:', '');
    for (const [colKey, colItems] of grouped.entries()) {
      if (colItems.some((i) => i._id === id)) return colKey;
    }
    return null;
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over) return;

    const sourceCol = findColumnForId(active.id);
    const destCol = findColumnForId(over.id);
    if (!destCol) return;

    const destItems = (grouped.get(destCol) || []).filter((i) => i._id !== active.id);
    let newSortOrder = 1000;

    if (String(over.id).startsWith('col:')) {
      const last = destItems[destItems.length - 1];
      newSortOrder = last ? (last.sortOrder || 1000) + 100 : 100;
    } else {
      const overIdx = destItems.findIndex((i) => i._id === over.id);
      if (overIdx === -1) {
        newSortOrder = 100;
      } else {
        const prev = destItems[overIdx - 1];
        const next = destItems[overIdx];
        if (!prev) newSortOrder = (next.sortOrder || 1000) - 50;
        else newSortOrder = ((prev.sortOrder || 1000) + (next.sortOrder || 1000)) / 2;
      }
    }

    if (active.id === over.id && sourceCol === destCol) return;
    onMoveItem?.({
      id: active.id,
      groupBy,
      destinationValue: destCol,
      newSortOrder,
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active }) => setActiveId(active.id)}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3.5 overflow-x-auto pb-3 items-start">
        {visibleColumns.map((col) => (
          <KanbanColumn
            key={col.key}
            col={col}
            items={grouped.get(col.key) || []}
            entityType={entityType}
            collapsed={Boolean(collapsedCols[col.key])}
            onToggleCollapse={(k) => setCollapsedCols((prev) => ({ ...prev, [k]: !prev[k] }))}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
            onOpenItem={onOpenItem}
            onContextMenu={onContextMenu}
            onQuickCreate={onQuickCreate}
            visibleFields={visibleFields}
          />
        ))}
      </div>

      <DragOverlay>
        {activeItem ? (
          <div className="w-72 sm:w-80">
            <DraggableCard
              item={activeItem}
              entityType={entityType}
              visibleFields={visibleFields}
              isOverlay
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
