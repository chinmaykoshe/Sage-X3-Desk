import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Flag } from 'lucide-react';
import dayjs from 'dayjs';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';

export default function TimelineView({
  items = [],
  projects = [],
  entityType = 'task',
  onOpenItem,
  onReschedule,
}) {
  const [windowStart, setWindowStart] = useState(dayjs().subtract(5, 'day').startOf('day'));
  const totalDays = 21;

  const days = useMemo(
    () => Array.from({ length: totalDays }, (_, idx) => windowStart.add(idx, 'day')),
    [windowStart]
  );

  const grouped = useMemo(() => {
    const groups = new Map();
    items.forEach((item) => {
      const pName = item.project?.name || item.client?.companyName || 'Unassigned Project';
      const pId = item.project?._id || item.client?._id || 'other';
      if (!groups.has(pId)) groups.set(pId, { id: pId, name: pName, items: [] });
      groups.get(pId).items.push(item);
    });
    return Array.from(groups.values());
  }, [items]);

  const shiftItem = (item, deltaDays, e) => {
    e.stopPropagation();
    const currentDue = item.dueDate ? dayjs(item.dueDate) : dayjs();
    const currentStart = item.startDate ? dayjs(item.startDate) : currentDue.subtract(2, 'day');
    onReschedule?.(item._id, {
      startDate: currentStart.add(deltaDays, 'day').format('YYYY-MM-DD'),
      dueDate: currentDue.add(deltaDays, 'day').format('YYYY-MM-DD'),
    });
  };

  return (
    <Card padding={false} className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#E8E8E5] dark:border-[#26282D] px-4 py-2.5 text-xs">
        <div className="font-semibold">
          Timeline ({windowStart.format('DD MMM')} – {windowStart.add(totalDays - 1, 'day').format('DD MMM YYYY')})
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="xs" variant="secondary" onClick={() => setWindowStart((w) => w.subtract(7, 'day'))}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button size="xs" variant="secondary" onClick={() => setWindowStart(dayjs().subtract(5, 'day').startOf('day'))}>
            Today
          </Button>
          <Button size="xs" variant="secondary" onClick={() => setWindowStart((w) => w.add(7, 'day'))}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[980px]">
          {/* Date Header */}
          <div className="grid border-b border-[#E8E8E5] dark:border-[#26282D] bg-[#F4F4F2]/60 dark:bg-white/[0.02]" style={{ gridTemplateColumns: `240px repeat(${totalDays}, minmax(34px, 1fr))` }}>
            <div className="px-3 py-2 text-[11px] font-semibold uppercase text-[#777777] border-r border-[#E8E8E5] dark:border-[#26282D]">
              Project / Item
            </div>
            {days.map((d) => {
              const isToday = d.isSame(dayjs(), 'day');
              return (
                <div
                  key={d.format('YYYY-MM-DD')}
                  className={`py-1.5 text-center text-[10px] border-r border-[#E8E8E5]/60 dark:border-[#26282D] ${
                    isToday ? 'bg-[#C6F36B]/30 font-bold text-[#171717] dark:text-[#C6F36B]' : 'text-[#777777]'
                  }`}
                >
                  <div>{d.format('DD')}</div>
                  <div>{d.format('dd')}</div>
                </div>
              );
            })}
          </div>

          {/* Groups */}
          {grouped.map((group) => (
            <div key={group.id}>
              <div className="bg-[#F4F4F2]/40 dark:bg-white/[0.01] px-3 py-1.5 text-[11px] font-semibold text-[#171717] dark:text-slate-200 border-b border-[#E8E8E5] dark:border-[#26282D] flex items-center gap-1.5">
                <Flag className="h-3 w-3 text-[#35B8A6]" /> {group.name}
              </div>
              {group.items.map((item) => {
                const start = item.startDate
                  ? dayjs(item.startDate).startOf('day')
                  : item.dueDate
                  ? dayjs(item.dueDate).subtract(2, 'day').startOf('day')
                  : dayjs(item.createdAt).startOf('day');
                const end = item.dueDate ? dayjs(item.dueDate).startOf('day') : start.add(2, 'day');

                const startOffset = Math.max(0, start.diff(windowStart, 'day'));
                const endOffset = Math.min(totalDays - 1, end.diff(windowStart, 'day'));
                const visible = endOffset >= 0 && startOffset < totalDays;
                const span = Math.max(1, endOffset - startOffset + 1);
                const progress =
                  entityType === 'task'
                    ? item.status === 'Completed'
                      ? 100
                      : item.completionPercentage || 25
                    : item.status === 'Closed' || item.status === 'Resolved'
                    ? 100
                    : 40;
                const assignees = entityType === 'ticket' ? item.assignedDevelopers || [] : item.assignedEmployees || [];

                return (
                  <div
                    key={item._id}
                    onClick={() => onOpenItem?.(item)}
                    className="grid items-center border-b border-[#E8E8E5]/60 dark:border-[#26282D] hover:bg-[#F4F4F2]/40 cursor-pointer text-xs"
                    style={{ gridTemplateColumns: `240px repeat(${totalDays}, minmax(34px, 1fr))` }}
                  >
                    <div className="px-3 py-2 border-r border-[#E8E8E5] dark:border-[#26282D] flex items-center justify-between gap-2 truncate">
                      <span className="truncate font-medium">
                        <span className="font-mono text-[10px] text-[#638BEF] mr-1">
                          {entityType === 'ticket' ? item.ticketId : item.taskId}
                        </span>
                        {item.title}
                      </span>
                      {assignees[0] && <Avatar name={assignees[0].fullName} color={assignees[0].avatarColor} size="xs" />}
                    </div>

                    <div className="col-span-full col-start-2 relative h-8 flex items-center px-1" style={{ gridColumn: `2 / span ${totalDays}` }}>
                      {visible && (
                        <div
                          style={{
                            marginLeft: `${(startOffset / totalDays) * 100}%`,
                            width: `${(span / totalDays) * 100}%`,
                          }}
                          className={`group relative h-5 rounded-md border px-2 flex items-center justify-between text-[10px] font-medium overflow-hidden ${
                            item.isOverdue
                              ? 'border-[#F16D64] bg-[#F16D64]/15 text-[#c93e35]'
                              : 'border-[#638BEF]/40 bg-[#638BEF]/15 text-[#171717] dark:text-slate-100'
                          }`}
                        >
                          <div
                            className="absolute left-0 top-0 bottom-0 bg-[#35B8A6]/30 pointer-events-none"
                            style={{ width: `${progress}%` }}
                          />
                          <button
                            type="button"
                            onClick={(e) => shiftItem(item, -1, e)}
                            title="Move earlier 1 day"
                            className="relative z-10 opacity-0 group-hover:opacity-100 hover:font-bold"
                          >
                            ‹
                          </button>
                          <span className="relative z-10 truncate px-1">{progress}%</span>
                          <button
                            type="button"
                            onClick={(e) => shiftItem(item, 1, e)}
                            title="Move later 1 day"
                            className="relative z-10 opacity-0 group-hover:opacity-100 hover:font-bold"
                          >
                            ›
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
