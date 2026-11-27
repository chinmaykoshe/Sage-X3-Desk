import { useCallback, useEffect, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { AlertTriangle, GripVertical } from 'lucide-react';
import api, { getApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import Badge from '../components/ui/Badge';
import Loader from '../components/ui/Loader';

const MAX_ACTIVE_CAPACITY = 5;

function DraggableWorkloadTask({ task, onOpen, isManager }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task._id,
    data: { task },
    disabled: !isManager,
  });

  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onOpen(task._id)}
      className={`flex items-center justify-between gap-2 rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-2 text-xs shadow-sm cursor-pointer dark:border-[#2C2E33] dark:bg-[#1E2025] ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {isManager && (
          <button
            type="button"
            {...listeners}
            {...attributes}
            onClick={(e) => e.stopPropagation()}
            title="Drag onto an employee to assign"
            className="cursor-grab active:cursor-grabbing text-[#AAAAAA] hover:text-[#171717]"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        <span className="font-mono text-[10px] font-semibold text-[#638BEF]">{task.taskId}</span>
        <span className="truncate font-medium">{task.title}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Badge variant="priority" value={task.priority}>{task.priority}</Badge>
        <Badge value={task.status}>{task.status}</Badge>
      </div>
    </div>
  );
}

function EmployeeDropZone({ emp, tasks, onOpenTask, isManager }) {
  const { setNodeRef, isOver } = useDroppable({ id: `emp:${emp._id}` });
  const empTasks = tasks.filter((t) => (t.assignedEmployees || []).some((e) => e._id === emp._id) && t.status !== 'Completed');
  const activeCount = empTasks.length;
  const pct = Math.min(100, Math.round((activeCount / MAX_ACTIVE_CAPACITY) * 100));
  const overloaded = activeCount > MAX_ACTIVE_CAPACITY;
  const available = Math.max(0, MAX_ACTIVE_CAPACITY - activeCount);

  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border p-4 transition-colors ${
        isOver
          ? 'border-[#171717] bg-[#C6F36B]/20 dark:border-[#C6F36B]'
          : 'border-[#E8E8E5] bg-white dark:border-[#26282D] dark:bg-[#17181B]'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <Avatar name={emp.fullName} color={emp.avatarColor} size="md" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{emp.fullName}</span>
              {overloaded && (
                <span className="inline-flex items-center gap-1 rounded bg-[#F16D64]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#c93e35]">
                  <AlertTriangle className="h-3 w-3" /> Overloaded
                </span>
              )}
            </div>
            <div className="text-xs text-[#777777]">{emp.designation}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div>
            <span className="text-[#777777]">Active: </span>
            <span className="font-semibold">{emp.workload?.activeTasks ?? 0}</span>
          </div>
          <div>
            <span className="text-[#777777]">Open Tickets: </span>
            <span className="font-semibold">{emp.workload?.openTickets ?? 0}</span>
          </div>
          <div>
            <span className="text-[#777777]">Completed: </span>
            <span className="font-semibold text-[#35B8A6]">{emp.workload?.completedTasks ?? 0}</span>
          </div>
          <div>
            <span className="text-[#777777]">Overdue: </span>
            <span className="font-semibold text-[#F16D64]">{emp.workload?.overdueTasks ?? 0}</span>
          </div>
          <div className="w-36">
            <div className="flex justify-between text-[10px] text-[#777777] mb-1">
              <span>Capacity ({activeCount}/{MAX_ACTIVE_CAPACITY})</span>
              <span>{available} free</span>
            </div>
            <div className="h-2 w-full rounded-full bg-[#F4F4F2] dark:bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded-full ${overloaded ? 'bg-[#F16D64]' : 'bg-[#35B8A6]'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {empTasks.length === 0 ? (
          <div className="col-span-full rounded-lg border border-dashed border-[#E8E8E5] dark:border-[#2C2E33] py-4 text-center text-xs text-[#777777]">
            {isManager ? 'Drop a task here to assign' : 'No active tasks'}
          </div>
        ) : (
          empTasks.map((t) => <DraggableWorkloadTask key={t._id} task={t} onOpen={onOpenTask} isManager={isManager} />)
        )}
      </div>
    </div>
  );
}

export default function WorkloadPage() {
  const { isManager } = useAuth();
  const { addToast } = useToast();
  const { openTaskDrawer, lastSync, notifyLocalMutation } = useWorkspace();

  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const loadData = useCallback(async () => {
    try {
      const [uRes, tRes] = await Promise.all([api.get('/users?limit=100'), api.get('/tasks?scope=all&limit=100')]);
      setEmployees(uRes.data.data || []);
      setTasks(tRes.data.data || []);
    } catch (err) {
      addToast(getApiError(err, 'Failed to load workload'), 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, lastSync.task]);

  const handleDragEnd = async ({ active, over }) => {
    setActiveTask(null);
    if (!over || !String(over.id).startsWith('emp:')) return;
    if (!isManager) {
      addToast('Only Team Leads or Administrators can reassign tasks.', 'error');
      return;
    }

    const empId = String(over.id).replace('emp:', '');
    const task = tasks.find((t) => t._id === active.id);
    if (!task) return;

    const targetEmp = employees.find((e) => e._id === empId);
    const prevTasks = [...tasks];

    // Optimistic assign
    setTasks((list) =>
      list.map((t) => (t._id === task._id ? { ...t, assignedEmployees: targetEmp ? [targetEmp] : [] } : t))
    );

    try {
      await api.patch(`/tasks/${task._id}/assign`, {
        assignedEmployees: [empId],
        note: 'Reassigned via Team Workload view',
      });
      addToast(`Assigned ${task.taskId} to ${targetEmp?.fullName}`);
      notifyLocalMutation('task');
      loadData();
    } catch (err) {
      setTasks(prevTasks);
      addToast(getApiError(err, 'Failed to assign task'), 'error');
    }
  };

  if (loading) return <Loader label="Loading team workload..." />;

  const unassignedTasks = tasks.filter((t) => (t.assignedEmployees || []).length === 0 && t.status !== 'Completed');

  return (
    <div className="space-y-4 xl:space-y-0 xl:flex xl:flex-col xl:h-[calc(100dvh-8.2rem)] xl:gap-3 xl:overflow-hidden">
      <div className="shrink-0">
        <PageHeader
          title="Team Workload & Capacity"
          subtitle={
            isManager
              ? 'Monitor capacity and drag tasks onto any employee row to balance workload'
              : 'Live team workload and task distribution across Sage X3 consultants'
          }
        />
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => setActiveTask(tasks.find((t) => t._id === active.id) || null)}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-5 items-stretch xl:flex-1 xl:min-h-0">
          {/* Unassigned Queue — Independent Vertical Scroll */}
          <Card className="xl:col-span-1 flex flex-col xl:h-full xl:min-h-0">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#777777] mb-3 shrink-0">
              Unassigned Queue ({unassignedTasks.length})
            </h3>
            <div className="space-y-2 flex-1 overflow-y-auto pr-1">
              {unassignedTasks.length === 0 ? (
                <p className="text-xs text-[#777777] py-4 text-center">All active tasks are assigned.</p>
              ) : (
                unassignedTasks.map((t) => (
                  <DraggableWorkloadTask key={t._id} task={t} onOpen={openTaskDrawer} isManager={isManager} />
                ))
              )}
            </div>
          </Card>

          {/* Employee Capacity Rows — Independent Vertical Scroll */}
          <div className="xl:col-span-3 space-y-3.5 xl:h-full xl:min-h-0 xl:overflow-y-auto pr-1">
            {employees.map((emp) => (
              <EmployeeDropZone
                key={emp._id}
                emp={emp}
                tasks={tasks}
                onOpenTask={openTaskDrawer}
                isManager={isManager}
              />
            ))}
          </div>
        </div>

        <DragOverlay>
          {activeTask ? (
            <div className="w-72">
              <DraggableWorkloadTask task={activeTask} onOpen={() => {}} isManager={false} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
