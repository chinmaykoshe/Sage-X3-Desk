import { useCallback, useEffect, useMemo, useState } from 'react';
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import dayjs from 'dayjs';
import api, { getApiError } from '../services/api';
import { useWorkspace } from '../context/WorkspaceContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Loader from '../components/ui/Loader';
import Badge from '../components/ui/Badge';

function DraggableCalItem({ ev, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${ev.type}:${ev.rawId}`,
    data: { ev },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 40 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(ev);
      }}
      className={`cursor-grab active:cursor-grabbing truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium border transition-opacity ${
        isDragging ? 'opacity-60 shadow-lg' : ''
      } ${
        ev.type === 'ticket'
          ? 'bg-[#638BEF]/15 border-[#638BEF]/30 text-[#1d44a8] dark:text-[#98b4ff]'
          : ev.type === 'deployment'
          ? 'bg-[#35B8A6]/15 border-[#35B8A6]/30 text-[#1b7a6d] dark:text-[#6fe0d0]'
          : 'bg-[#A88CEB]/15 border-[#A88CEB]/30 text-[#5b38ad] dark:text-[#c7b4f5]'
      }`}
      title={`${ev.label} (${ev.priority || ''} · ${ev.status || ''})`}
    >
      {ev.label}
    </div>
  );
}

function DroppableDayCell({ dateKey, day, isToday, dayEvents, onOpenEvent, onQuickAdd, compact = false }) {
  const { setNodeRef, isOver } = useDroppable({ id: `date:${dateKey}` });

  return (
    <div
      ref={setNodeRef}
      className={`group p-2 transition-colors ${compact ? 'min-h-[110px]' : 'min-h-[260px]'} ${
        isOver ? 'bg-[#C6F36B]/25' : 'bg-white dark:bg-[#17181B]'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span
          className={`text-xs font-medium ${
            isToday
              ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#171717] text-[#C6F36B] font-bold dark:bg-[#C6F36B] dark:text-[#171717]'
              : 'text-[#777777]'
          }`}
        >
          {compact ? day.date() : day.format('ddd D MMM')}
        </span>
        <button
          onClick={() => onQuickAdd(dateKey)}
          title={`Quick create ticket on ${dateKey}`}
          className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-[#777777] hover:bg-[#F4F4F2] hover:text-[#171717] dark:hover:bg-white/10"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      <div className="space-y-1">
        {(compact ? dayEvents.slice(0, 4) : dayEvents).map((ev) => (
          <DraggableCalItem key={ev.id} ev={ev} onOpen={onOpenEvent} />
        ))}
        {compact && dayEvents.length > 4 && (
          <div className="text-[10px] text-[#777777]">+{dayEvents.length - 4} more</div>
        )}
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const { openTicketDrawer, openTaskDrawer, openQuickTicket, lastSync, notifyLocalMutation } = useWorkspace();
  const { addToast } = useToast();

  const [viewType, setViewType] = useState('month'); // month | week | day
  const [cursor, setCursor] = useState(dayjs());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const loadEvents = useCallback(async () => {
    setLoading((prev) => (events.length === 0 ? true : prev));
    try {
      const [tRes, kRes, dRes] = await Promise.all([
        api.get('/tickets?scope=all&limit=100'),
        api.get('/tasks?scope=all&limit=100'),
        api.get('/deployments?limit=100'),
      ]);

      const list = [];
      (tRes.data.data || []).forEach((t) => {
        if (t.dueDate) {
          list.push({
            id: `t-${t._id}`,
            rawId: t._id,
            date: dayjs(t.dueDate).format('YYYY-MM-DD'),
            label: `${t.ticketId}: ${t.title}`,
            type: 'ticket',
            priority: t.priority,
            status: t.status,
          });
        }
      });
      (kRes.data.data || []).forEach((t) => {
        if (t.dueDate) {
          list.push({
            id: `k-${t._id}`,
            rawId: t._id,
            date: dayjs(t.dueDate).format('YYYY-MM-DD'),
            label: `${t.taskId}: ${t.title}`,
            type: 'task',
            priority: t.priority,
            status: t.status,
          });
        }
      });
      (dRes.data.data || []).forEach((d) => {
        if (d.deploymentDate) {
          list.push({
            id: `d-${d._id}`,
            rawId: d._id,
            date: dayjs(d.deploymentDate).format('YYYY-MM-DD'),
            label: `${d.deploymentId} (${d.environment})`,
            type: 'deployment',
            status: d.workflowStage,
          });
        }
      });
      setEvents(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents, lastSync.ticket, lastSync.task, lastSync.deployment]);

  const handleDragEnd = async ({ active, over }) => {
    if (!over || !String(over.id).startsWith('date:')) return;
    const targetDate = String(over.id).replace('date:', '');
    const ev = active.data.current?.ev;
    if (!ev || ev.date === targetDate || ev.type === 'deployment') return;

    const prev = [...events];
    setEvents((list) => list.map((x) => (x.id === ev.id ? { ...x, date: targetDate } : x)));

    try {
      if (ev.type === 'ticket') {
        await api.put(`/tickets/${ev.rawId}`, { dueDate: targetDate });
        notifyLocalMutation('ticket');
      } else if (ev.type === 'task') {
        await api.put(`/tasks/${ev.rawId}`, { dueDate: targetDate });
        notifyLocalMutation('task');
      }
      addToast(`Rescheduled to ${dayjs(targetDate).format('DD MMM YYYY')}`);
    } catch (err) {
      setEvents(prev);
      addToast(getApiError(err, 'Failed to reschedule'), 'error');
    }
  };

  const openEvent = (ev) => {
    if (ev.type === 'ticket') openTicketDrawer(ev.rawId);
    else if (ev.type === 'task') openTaskDrawer(ev.rawId);
  };

  const stepNav = (dir) => {
    const unit = viewType === 'month' ? 'month' : viewType === 'week' ? 'week' : 'day';
    setCursor((c) => (dir > 0 ? c.add(1, unit) : c.subtract(1, unit)));
  };

  const monthCells = useMemo(() => {
    const m = cursor.startOf('month');
    const startDay = m.day();
    const total = m.daysInMonth();
    const arr = [];
    for (let i = 0; i < startDay; i++) arr.push(null);
    for (let d = 1; d <= total; d++) arr.push(m.date(d));
    return arr;
  }, [cursor]);

  const weekDays = useMemo(() => {
    const start = cursor.startOf('week');
    return Array.from({ length: 7 }, (_, i) => start.add(i, 'day'));
  }, [cursor]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Operations Calendar"
        subtitle="Drag tickets or tasks between dates to reschedule due dates, or click to open details"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-[#E8E8E5] bg-white p-0.5 dark:border-[#2C2E33] dark:bg-[#17181B]">
              {['month', 'week', 'day'].map((v) => (
                <button
                  key={v}
                  onClick={() => setViewType(v)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${
                    viewType === v ? 'bg-[#171717] text-[#C6F36B] dark:bg-[#C6F36B] dark:text-[#171717]' : 'text-[#555555]'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="secondary" size="sm" onClick={() => stepNav(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-semibold min-w-[130px] text-center">
                {viewType === 'month'
                  ? cursor.format('MMMM YYYY')
                  : viewType === 'week'
                  ? `Week of ${cursor.startOf('week').format('DD MMM')}`
                  : cursor.format('ddd, DD MMM YYYY')}
              </span>
              <Button variant="secondary" size="sm" onClick={() => stepNav(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        }
      />

      {loading ? (
        <Loader label="Loading schedule..." />
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          {viewType === 'month' && (
            <Card padding={false} className="overflow-hidden">
              <div className="overflow-x-auto">
                <div className="min-w-[680px]">
                  <div className="grid grid-cols-7 border-b border-[#E8E8E5] dark:border-[#26282D] bg-[#F4F4F2]/70 dark:bg-white/[0.02] text-center text-[11px] font-semibold text-[#777777] py-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                      <div key={d}>{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 divide-x divide-y divide-[#E8E8E5] dark:divide-[#26282D]">
                    {monthCells.map((day, idx) =>
                      day ? (
                        <DroppableDayCell
                          key={day.format('YYYY-MM-DD')}
                          dateKey={day.format('YYYY-MM-DD')}
                          day={day}
                          isToday={day.isSame(dayjs(), 'day')}
                          dayEvents={events.filter((e) => e.date === day.format('YYYY-MM-DD'))}
                          onOpenEvent={openEvent}
                          onQuickAdd={(date) => openQuickTicket({ dueDate: date })}
                          compact
                        />
                      ) : (
                        <div key={`empty-${idx}`} className="min-h-[110px] bg-[#F4F4F2]/40 dark:bg-[#121316]" />
                      )
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {viewType === 'week' && (
            <Card padding={false} className="overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-7 divide-x divide-[#E8E8E5] dark:divide-[#26282D]">
                {weekDays.map((day) => {
                  const dk = day.format('YYYY-MM-DD');
                  return (
                    <DroppableDayCell
                      key={dk}
                      dateKey={dk}
                      day={day}
                      isToday={day.isSame(dayjs(), 'day')}
                      dayEvents={events.filter((e) => e.date === dk)}
                      onOpenEvent={openEvent}
                      onQuickAdd={(date) => openQuickTicket({ dueDate: date })}
                    />
                  );
                })}
              </div>
            </Card>
          )}

          {viewType === 'day' && (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">{cursor.format('dddd, DD MMMM YYYY')}</h3>
                <Button size="xs" onClick={() => openQuickTicket({ dueDate: cursor.format('YYYY-MM-DD') })}>
                  <Plus className="h-3.5 w-3.5" /> Add Item for Date
                </Button>
              </div>
              <div className="space-y-2">
                {events
                  .filter((e) => e.date === cursor.format('YYYY-MM-DD'))
                  .map((ev) => (
                    <div
                      key={ev.id}
                      onClick={() => openEvent(ev)}
                      className="flex items-center justify-between rounded-xl border border-[#E8E8E5] dark:border-[#26282D] p-3 text-xs cursor-pointer hover:bg-[#F4F4F2]/60"
                    >
                      <span className="font-semibold">{ev.label}</span>
                      <div className="flex items-center gap-2">
                        {ev.priority && <Badge variant="priority" value={ev.priority}>{ev.priority}</Badge>}
                        {ev.status && <Badge value={ev.status}>{ev.status}</Badge>}
                      </div>
                    </div>
                  ))}
              </div>
            </Card>
          )}
        </DndContext>
      )}
    </div>
  );
}
