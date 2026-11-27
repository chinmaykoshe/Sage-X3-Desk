import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
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

const dropAnimationConfig = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: '0',
      },
    },
  }),
  duration: 200,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
};

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
    transition: transition || 'transform 200ms cubic-bezier(0.2, 0, 0, 1)',
  };

  const refId = entityType === 'ticket' ? item.ticketId : item.taskId;
  const assignees = entityType === 'ticket' ? item.assignedDevelopers || [] : item.assignedEmployees || [];

  const priorityColor =
    item.priority === 'Critical'
      ? '#F16D64'
      : item.priority === 'High'
      ? '#F59E0B'
      : item.priority === 'Medium'
      ? '#638BEF'
      : '#35B8A6';

  if (isDragging && !isOverlay) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="relative rounded-xl border-2 border-dashed border-[#638BEF] bg-[#638BEF]/10 dark:bg-[#638BEF]/15 p-3.5 min-h-[88px] flex flex-col items-center justify-center text-xs font-semibold text-[#638BEF] transition-all duration-200 select-none shadow-inner"
      >
        <span className="flex items-center gap-1.5 animate-pulse">
          Drop {entityType} here
        </span>
      </div>
    );
  }

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
      className={`group relative rounded-xl border p-3 text-xs select-none cursor-pointer overflow-hidden ${
        isOverlay
          ? 'z-50 bg-white/95 dark:bg-[#1C1D21]/95 backdrop-blur-md scale-[1.03] rotate-[1.5deg] border-[#171717]/30 dark:border-[#C6F36B]/40 ring-2 ring-[#171717]/10 dark:ring-[#C6F36B]/25 shadow-[0_24px_50px_-10px_rgba(23,23,23,0.28),0_12px_24px_-6px_rgba(23,23,23,0.14)] dark:shadow-[0_24px_50px_-10px_rgba(0,0,0,0.8)] cursor-grabbing'
          : isSelected
          ? 'border-[#171717] ring-2 ring-[#C6F36B] dark:border-[#C6F36B] bg-white dark:bg-[#1C1D21] shadow-sm transition-[transform,box-shadow,border-color] duration-200'
          : 'border-[#E8E8E5] dark:border-[#2C2E33] bg-white dark:bg-[#1C1D21] shadow-[0_1px_3px_rgba(23,23,23,0.03)] hover:border-[#171717]/40 dark:hover:border-white/30 hover:-translate-y-1 hover:shadow-[0_12px_26px_-6px_rgba(23,23,23,0.09),0_4px_10px_-2px_rgba(23,23,23,0.04)] dark:hover:shadow-[0_12px_28px_-6px_rgba(0,0,0,0.55)] active:translate-y-0 active:scale-[0.99] transition-[transform,box-shadow,border-color] duration-200 ease-out'
      }`}
    >
      {/* Priority accent strip on left edge - illuminates smoothly on hover or drag */}
      <div
        className={`absolute left-0 top-2.5 bottom-2.5 w-[3.5px] rounded-r-full transition-all duration-200 ${
          isOverlay ? 'opacity-100 scale-y-100' : 'opacity-0 group-hover:opacity-100 group-hover:scale-y-100 scale-y-75'
        }`}
        style={{ backgroundColor: priorityColor }}
      />

      <div className="flex items-center justify-between gap-1.5 pl-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {!isOverlay && (
            <button
              type="button"
              {...attributes}
              {...listeners}
              onClick={(e) => e.stopPropagation()}
              title="Drag to move"
              className="cursor-grab active:cursor-grabbing text-[#B0B0AA] hover:text-[#171717] dark:hover:text-white -ml-1 p-0.5 rounded-md hover:bg-[#F4F4F2] dark:hover:bg-white/10 transition-colors"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          )}
          <input
            type="checkbox"
            checked={Boolean(isSelected)}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onToggleSelect?.(item._id, e.nativeEvent?.shiftKey)}
            className="h-3.5 w-3.5 rounded border-[#D8D8D3] accent-[#171717] transition-transform hover:scale-110"
          />
          <span className="font-mono text-[11px] font-semibold text-[#638BEF] hover:underline">{refId}</span>
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
              className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-[#777777] hover:bg-[#F4F4F2] hover:text-[#171717] dark:hover:bg-white/10 dark:hover:text-white transition-all duration-150 hover:scale-105 active:scale-95"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-1.5 font-semibold text-[#171717] dark:text-slate-100 line-clamp-2 leading-snug group-hover:text-black dark:group-hover:text-white transition-colors pl-0.5">
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
      className={`flex flex-col rounded-2xl border shrink-0 transition-all duration-200 ${
        collapsed ? 'w-12 items-center py-3' : 'w-72 sm:w-80'
      } ${
        isOver
          ? 'border-[#171717] ring-2 ring-[#C6F36B] bg-[#C6F36B]/15 dark:border-[#C6F36B] dark:bg-[#C6F36B]/10 shadow-lg scale-[1.01]'
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
  const [localItems, setLocalItems] = useState(items);
  const [activeId, setActiveId] = useState(null);
  const [collapsedCols, setCollapsedCols] = useState({});
  const originalItemsRef = useRef(items);

  // Synchronize when items prop changes outside of an active drag session
  useEffect(() => {
    if (!activeId) {
      setLocalItems(items);
      originalItemsRef.current = items;
    }
  }, [items, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const getColKey = useCallback(
    (item) => {
      if (!item) return null;
      if (groupBy === 'status') return item.status;
      if (groupBy === 'priority') return item.priority;
      if (groupBy === 'client') return item.client?._id || item.client || 'none';
      if (groupBy === 'assignee') {
        const list = entityType === 'ticket' ? item.assignedDevelopers : item.assignedEmployees;
        return list?.[0]?._id || list?.[0] || 'unassigned';
      }
      return null;
    },
    [groupBy, entityType]
  );

  const findContainer = useCallback(
    (id) => {
      if (!id) return null;
      if (String(id).startsWith('col:')) return String(id).replace('col:', '');
      if (columns.some((c) => c.key === id)) return id;
      const found = localItems.find((i) => i._id === id);
      return found ? getColKey(found) : null;
    },
    [columns, localItems, getColKey]
  );

  const grouped = useMemo(() => {
    const map = new Map(columns.map((c) => [c.key, []]));
    localItems.forEach((item) => {
      const key = getColKey(item);
      if (key && !map.has(key)) map.set(key, []);
      if (key) map.get(key).push(item);
    });
    return map;
  }, [localItems, columns, getColKey]);

  const visibleColumns = hideEmptyColumns
    ? columns.filter((c) => (grouped.get(c.key) || []).length > 0)
    : columns;

  const activeItem = activeId
    ? items.find((i) => i._id === activeId) || localItems.find((i) => i._id === activeId)
    : null;

  const handleDragStart = ({ active }) => {
    setActiveId(active.id);
    originalItemsRef.current = localItems;
  };

  const handleDragOver = ({ active, over }) => {
    if (!over) return;
    const activeContainer = findContainer(active.id);
    const overContainer = findContainer(over.id);

    if (!activeContainer || !overContainer) return;

    if (activeContainer !== overContainer) {
      setLocalItems((prev) => {
        const activeIndex = prev.findIndex((i) => i._id === active.id);
        if (activeIndex === -1) return prev;

        const activeItem = { ...prev[activeIndex] };
        if (groupBy === 'status') activeItem.status = overContainer;
        else if (groupBy === 'priority') activeItem.priority = overContainer;
        else if (groupBy === 'client') {
          activeItem.client = { ...(activeItem.client || {}), _id: overContainer };
        } else if (groupBy === 'assignee') {
          activeItem.assignedEmployees = overContainer === 'unassigned' ? [] : [{ _id: overContainer }];
          activeItem.assignedDevelopers = overContainer === 'unassigned' ? [] : [{ _id: overContainer }];
        }

        const next = [...prev];
        next.splice(activeIndex, 1);

        if (String(over.id).startsWith('col:')) {
          next.push(activeItem);
        } else {
          const overIndex = next.findIndex((i) => i._id === over.id);
          if (overIndex !== -1) {
            next.splice(overIndex, 0, activeItem);
          } else {
            next.push(activeItem);
          }
        }
        return next;
      });
    } else {
      if (active.id !== over.id && !String(over.id).startsWith('col:')) {
        setLocalItems((prev) => {
          const oldIndex = prev.findIndex((i) => i._id === active.id);
          const newIndex = prev.findIndex((i) => i._id === over.id);
          if (oldIndex !== -1 && newIndex !== -1) {
            return arrayMove(prev, oldIndex, newIndex);
          }
          return prev;
        });
      }
    }
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over) {
      setLocalItems(originalItemsRef.current);
      return;
    }

    const destCol = findContainer(over.id);
    if (!destCol) {
      setLocalItems(originalItemsRef.current);
      return;
    }

    const colItems = grouped.get(destCol) || [];
    const droppedIndex = colItems.findIndex((i) => i._id === active.id);
    const destItemsWithoutActive = colItems.filter((i) => i._id !== active.id);

    let afterId = null;
    let beforeId = null;
    let newSortOrder = 1000;
    if (destItemsWithoutActive.length === 0) {
      newSortOrder = 100;
    } else if (droppedIndex <= 0) {
      const first = destItemsWithoutActive[0];
      beforeId = first._id;
      newSortOrder = Math.max(1, (first.sortOrder || 1000) - 100);
    } else if (droppedIndex >= destItemsWithoutActive.length) {
      const last = destItemsWithoutActive[destItemsWithoutActive.length - 1];
      afterId = last._id;
      newSortOrder = (last.sortOrder || 1000) + 100;
    } else {
      const prev = destItemsWithoutActive[droppedIndex - 1];
      const next = destItemsWithoutActive[droppedIndex];
      afterId = prev?._id || null;
      beforeId = next?._id || null;
      const prevOrder = prev?.sortOrder || 1000;
      const nextOrder = next?.sortOrder || 1000;
      newSortOrder = prevOrder === nextOrder ? prevOrder : (prevOrder + nextOrder) / 2;
    }

    onMoveItem?.({
      id: active.id,
      groupBy,
      destinationValue: destCol,
      newSortOrder,
      afterId,
      beforeId,
    });
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setLocalItems(originalItemsRef.current);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
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

      <DragOverlay dropAnimation={dropAnimationConfig}>
        {activeItem ? (
          <div className="w-72 sm:w-80 pointer-events-none">
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
