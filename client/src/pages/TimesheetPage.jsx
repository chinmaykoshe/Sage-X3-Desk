import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Download,
  Trash2,
  Copy,
  Check,
  X,
  Search,
  FileSpreadsheet,
  List,
  Table2,
} from 'lucide-react';
import dayjs from 'dayjs';
import api, { getApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Loader from '../components/ui/Loader';

const ENTRY_STATUSES = ['DONE', 'IN PROGRESS', 'PENDING', 'BLOCKED'];

const DEFAULT_TASK_TYPES = [
  'ISSUE ANALYSIS',
  'VALIDATION & DATA ANALYSIS',
  'DEBUGGING / INVESTIGATION',
  'ROOT CAUSE ANALYSIS',
  'VALIDATION & TESTING',
  'SCRIPT DEBUGGING / RCA',
  'LOGIC CORRECTION & TESTING',
  'QUERY CORRECTION & DEBUGGING',
  'TESTING & DEPLOYMENT',
  'ISSUE ANALYSIS & RESEARCH',
  '4GL DEVELOPMENT',
  'REPORTING / CRYSTAL',
  'CLIENT DISCUSSION',
  'OTHER',
];

const EMPTY_ROW = (defaultClient = '') => ({
  date: dayjs().format('YYYY-MM-DD'),
  client: defaultClient,
  project: '',
  projectCode: '',
  task: '',
  taskTitle: '',
  workDescription: '',
  taskType: 'ISSUE ANALYSIS',
  entryStatus: 'DONE',
  hoursSpent: '2',
  billable: true,
});

function buildMonthTabs() {
  const now = dayjs();
  const list = [];
  for (let offset = -3; offset <= 1; offset += 1) {
    const d = now.add(offset, 'month');
    list.push({
      key: d.format('YYYY-MM'),
      label: d.format("MMMM 'YY"),
    });
  }
  return list;
}

export default function TimesheetPage() {
  const { user, isManager } = useAuth();
  const { addToast } = useToast();

  const monthTabs = useMemo(() => buildMonthTabs(), []);
  const [selectedMonth, setSelectedMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [scope, setScope] = useState('mine'); // 'mine' | 'team'
  const [clientFilter, setClientFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [mobileMode, setMobileMode] = useState('sheet'); // 'sheet' | 'cards'

  const [entries, setEntries] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [teamUsers, setTeamUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Inline bottom "New Row" (Excel-style direct typing)
  const [newRow, setNewRow] = useState(() => EMPTY_ROW());
  const [savingNew, setSavingNew] = useState(false);

  // Inline existing row editor
  const [editingId, setEditingId] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const newRowTaskInputRef = useRef(null);

  const loadLookups = async () => {
    try {
      const [cRes, pRes, uRes] = await Promise.all([
        api.get('/clients', { params: { limit: 200 } }),
        api.get('/projects', { params: { limit: 200 } }),
        isManager
          ? api.get('/users', { params: { limit: 200 } }).catch(() => ({ data: { data: [] } }))
          : Promise.resolve({ data: { data: [] } }),
      ]);
      const loadedClients = cRes.data.data || [];
      setClients(loadedClients);
      setProjects(pRes.data.data || []);
      setTeamUsers(uRes.data.data || []);
      if (loadedClients.length > 0) {
        setNewRow((prev) => (prev.client ? prev : { ...prev, client: loadedClients[0]._id }));
      }
    } catch {
      // ignore lookup errors
    }
  };

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const params = { limit: 400 };
      if (scope === 'mine' || !isManager) {
        params.mine = 'true';
      } else if (employeeFilter) {
        params.employee = employeeFilter;
      }
      if (selectedMonth && selectedMonth !== 'all') {
        params.month = selectedMonth;
      }
      if (clientFilter) params.client = clientFilter;
      if (statusFilter && statusFilter !== 'All') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();

      const { data } = await api.get('/time-logs', { params });
      // Chronological sheet feel (oldest -> newest like Excel rows top-to-bottom)
      const list = [...(data.data || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
      setEntries(list);
    } catch (err) {
      addToast(getApiError(err, 'Failed to load timesheet'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLookups();
  }, [isManager]);

  useEffect(() => {
    fetchEntries();
  }, [selectedMonth, scope, clientFilter, employeeFilter, statusFilter, search]);

  const totalHours = useMemo(
    () => Number(entries.reduce((sum, e) => sum + Number(e.hoursSpent || 0), 0).toFixed(2)),
    [entries]
  );

  const canModifyEntry = (entry) => isManager || String(entry.employee?._id || entry.employee) === String(user?._id);

  const projectSuggestionsForClient = (cId) =>
    cId ? projects.filter((p) => String(p.client?._id || p.client) === String(cId)) : projects;

  const saveNewRow = async (e) => {
    if (e) e.preventDefault();
    if (!newRow.client) {
      addToast('Select a Client in Column B before saving the row.', 'error');
      return;
    }
    if (!newRow.taskTitle.trim()) {
      addToast('Enter a Task title in Column D.', 'error');
      return;
    }
    if (!newRow.workDescription.trim() || newRow.workDescription.trim().length < 2) {
      addToast('Enter Task description in Column E.', 'error');
      return;
    }

    setSavingNew(true);
    try {
      const matchedProject = projects.find(
        (p) =>
          p.projectId?.toUpperCase() === newRow.projectCode.trim().toUpperCase() &&
          (!newRow.client || String(p.client?._id || p.client) === String(newRow.client))
      );

      await api.post('/time-logs', {
        date: newRow.date,
        client: newRow.client || null,
        project: matchedProject?._id || null,
        projectCode: newRow.projectCode.trim().toUpperCase(),
        taskTitle: newRow.taskTitle.trim().toUpperCase(),
        workDescription: newRow.workDescription.trim(),
        taskType: newRow.taskType.trim().toUpperCase(),
        entryStatus: newRow.entryStatus || 'DONE',
        hoursSpent: Number(newRow.hoursSpent) || 1,
        billable: true,
      });
      addToast('Row added to timesheet');
      setNewRow((prev) => ({
        ...EMPTY_ROW(prev.client),
        date: prev.date,
        projectCode: prev.projectCode,
      }));
      fetchEntries();
    } catch (err) {
      addToast(getApiError(err, 'Failed to add row'), 'error');
    } finally {
      setSavingNew(false);
    }
  };

  const startEdit = (entry) => {
    if (!canModifyEntry(entry)) return;
    setEditingId(entry._id);
    setEditRow({
      date: dayjs(entry.date).format('YYYY-MM-DD'),
      client: entry.client?._id || '',
      projectCode: entry.projectCode || entry.project?.projectId || '',
      taskTitle: entry.taskTitle || entry.task?.title || '',
      workDescription: entry.workDescription || '',
      taskType: entry.taskType || '',
      entryStatus: entry.entryStatus || 'DONE',
      hoursSpent: String(entry.hoursSpent ?? ''),
    });
  };

  const saveEdit = async (id) => {
    if (!editRow) return;
    setSavingEdit(true);
    try {
      await api.patch(`/time-logs/${id}`, {
        date: editRow.date,
        client: editRow.client || null,
        projectCode: editRow.projectCode.trim().toUpperCase(),
        taskTitle: editRow.taskTitle.trim().toUpperCase(),
        workDescription: editRow.workDescription.trim(),
        taskType: editRow.taskType.trim().toUpperCase(),
        entryStatus: editRow.entryStatus,
        hoursSpent: Number(editRow.hoursSpent) || 1,
      });
      setEditingId(null);
      setEditRow(null);
      addToast('Row updated');
      fetchEntries();
    } catch (err) {
      addToast(getApiError(err, 'Failed to update row'), 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this row from the timesheet?')) return;
    try {
      await api.delete(`/time-logs/${id}`);
      if (editingId === id) {
        setEditingId(null);
        setEditRow(null);
      }
      addToast('Row deleted');
      fetchEntries();
    } catch (err) {
      addToast(getApiError(err, 'Failed to delete row'), 'error');
    }
  };

  const duplicateToNewRow = (entry) => {
    setNewRow({
      date: dayjs().format('YYYY-MM-DD'),
      client: entry.client?._id || '',
      project: entry.project?._id || '',
      projectCode: entry.projectCode || entry.project?.projectId || '',
      task: entry.task?._id || '',
      taskTitle: entry.taskTitle || entry.task?.title || '',
      workDescription: entry.workDescription || '',
      taskType: entry.taskType || 'ISSUE ANALYSIS',
      entryStatus: entry.entryStatus || 'DONE',
      hoursSpent: String(entry.hoursSpent ?? '2'),
      billable: entry.billable ?? true,
    });
    setTimeout(() => newRowTaskInputRef.current?.focus(), 50);
  };

  const exportCsv = () => {
    const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = ['Date', 'Client', 'Project', 'Task', 'Task description', 'Task Type', 'Status', 'Hours', 'Resource'];
    const rows = entries.map((e) => [
      dayjs(e.date).format('M/D/YYYY'),
      e.client?.companyName || '',
      e.projectCode || e.project?.projectId || '',
      e.taskTitle || e.task?.title || e.task?.taskId || '',
      e.workDescription || '',
      e.taskType || '',
      e.entryStatus || 'DONE',
      e.hoursSpent ?? 0,
      e.employee?.fullName || user?.fullName || '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FTE_TS_${scope === 'mine' ? (user?.fullName || 'Resource').replace(/\s+/g, '_') : 'Team'}_${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const colHeaders = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

  return (
    <div className="space-y-3">
      {/* Spreadsheet Toolbar (Google Sheets / Excel Style Header) */}
      <div className="rounded-t-xl border border-[#CBD5E1] bg-white px-3 py-2.5 shadow-sm dark:border-[#2C2E33] dark:bg-[#17181B]">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0F9D58] text-white shadow-xs">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-[#171717] dark:text-white truncate">
                  {scope === 'mine'
                    ? `${(user?.fullName || 'Individual').split(' ')[0]}_FTE_TS`
                    : 'Team_FTE_Timesheet'}
                </h1>
                <span className="rounded border border-[#CBD5E1] bg-[#F8FAFC] px-2 py-0.5 font-mono text-[11px] font-bold text-[#0B2B4C] dark:border-[#2C2E33] dark:bg-[#1E2025] dark:text-[#C6F36B]">
                  Σ {totalHours} hrs ({entries.length} rows)
                </span>
              </div>
              <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                Click any row to edit inline, or type directly in the bottom entry row and press Enter.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {isManager && (
              <div className="inline-flex rounded-md border border-[#CBD5E1] bg-[#F8FAFC] p-0.5 dark:border-[#2C2E33] dark:bg-[#1E2025]">
                <button
                  type="button"
                  onClick={() => setScope('mine')}
                  className={`rounded px-2 py-1 text-[11px] font-semibold ${
                    scope === 'mine' ? 'bg-[#0B2B4C] text-white' : 'text-[#555555] dark:text-slate-300'
                  }`}
                >
                  My Sheet
                </button>
                <button
                  type="button"
                  onClick={() => setScope('team')}
                  className={`rounded px-2 py-1 text-[11px] font-semibold ${
                    scope === 'team' ? 'bg-[#0B2B4C] text-white' : 'text-[#555555] dark:text-slate-300'
                  }`}
                >
                  All Resources
                </button>
              </div>
            )}

            <div className="relative flex-1 sm:flex-none min-w-[160px]">
              <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#64748B]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find in sheet..."
                className="w-full rounded-md border border-[#CBD5E1] bg-white py-1 pl-7 pr-2 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
              />
            </div>

            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="rounded-md border border-[#CBD5E1] bg-white px-2 py-1 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
            >
              <option value="">All Clients</option>
              {clients.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.companyName}
                </option>
              ))}
            </select>

            {isManager && scope === 'team' && (
              <select
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
                className="rounded-md border border-[#CBD5E1] bg-white px-2 py-1 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
              >
                <option value="">All Resources</option>
                {teamUsers.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            )}

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-[#CBD5E1] bg-white px-2 py-1 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
            >
              <option value="All">All Status</option>
              {ENTRY_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>

            <div className="inline-flex sm:hidden rounded-md border border-[#CBD5E1] bg-[#F8FAFC] p-0.5 dark:border-[#2C2E33] dark:bg-[#1E2025]">
              <button
                type="button"
                onClick={() => setMobileMode('sheet')}
                className={`rounded px-2 py-1 text-[11px] font-medium flex items-center gap-1 ${
                  mobileMode === 'sheet' ? 'bg-[#0B2B4C] text-white' : 'text-[#555555]'
                }`}
              >
                <Table2 className="h-3 w-3" /> Grid
              </button>
              <button
                type="button"
                onClick={() => setMobileMode('cards')}
                className={`rounded px-2 py-1 text-[11px] font-medium flex items-center gap-1 ${
                  mobileMode === 'cards' ? 'bg-[#0B2B4C] text-white' : 'text-[#555555]'
                }`}
              >
                <List className="h-3 w-3" /> Cards
              </button>
            </div>

            <button
              type="button"
              onClick={exportCsv}
              disabled={entries.length === 0}
              className="inline-flex items-center gap-1 rounded-md border border-[#CBD5E1] bg-white px-2.5 py-1 text-xs font-medium text-[#171717] hover:bg-[#F8FAFC] disabled:opacity-40 dark:border-[#2C2E33] dark:bg-[#1E2025] dark:text-slate-100"
            >
              <Download className="h-3.5 w-3.5 text-[#0F9D58]" /> Export CSV
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileMode('sheet');
                newRowTaskInputRef.current?.focus();
              }}
              className="inline-flex items-center gap-1 rounded-md bg-[#0B2B4C] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#0e3966]"
            >
              <Plus className="h-3.5 w-3.5" /> Add Row
            </button>
          </div>
        </div>
      </div>

      {/* Main Excel Sheet Container */}
      <div className="-mt-3 border-x border-b border-[#CBD5E1] bg-white shadow-sm dark:border-[#2C2E33] dark:bg-[#141518] rounded-b-xl overflow-hidden">
        {loading ? (
          <div className="p-8">
            <Loader label="Loading timesheet..." />
          </div>
        ) : (
          <>
            {/* Mobile Compact Card Mode (when toggled on < sm) */}
            {mobileMode === 'cards' && (
              <div className="sm:hidden p-3 space-y-2.5">
                {entries.map((entry, idx) => (
                  <div
                    key={entry._id}
                    className="rounded-lg border border-[#CBD5E1] bg-white p-3 text-xs dark:border-[#2C2E33] dark:bg-[#17181B]"
                  >
                    <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-1.5 mb-1.5">
                      <span className="font-mono font-semibold text-[#0B2B4C] dark:text-[#C6F36B]">
                        #{idx + 2} · {dayjs(entry.date).format('M/D/YYYY')} · {entry.projectCode || '—'}
                      </span>
                      <span className="font-mono font-bold text-[#171717] dark:text-white">{entry.hoursSpent} hrs</span>
                    </div>
                    <div className="text-[11px] font-semibold text-[#475569] dark:text-slate-300">
                      Client: {entry.client?.companyName || '—'}
                    </div>
                    <div className="mt-1 font-bold uppercase text-[#171717] dark:text-white">
                      {entry.taskTitle || entry.task?.title}
                    </div>
                    <p className="mt-1 text-[#334155] dark:text-slate-300">{entry.workDescription}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-[#475569] dark:text-slate-400">
                      <span>{entry.taskType || 'GENERAL'} · {entry.entryStatus || 'DONE'}</span>
                      <span>{entry.employee?.fullName || user?.fullName}</span>
                    </div>
                  </div>
                ))}
                <form onSubmit={saveNewRow} className="rounded-lg border border-dashed border-[#0B2B4C] p-3 space-y-2 text-xs">
                  <div className="font-bold text-[#0B2B4C] dark:text-[#C6F36B]">+ Add New Row</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={newRow.date}
                      onChange={(e) => setNewRow({ ...newRow, date: e.target.value })}
                      className="rounded border border-[#CBD5E1] px-2 py-1.5 dark:border-[#2C2E33] dark:bg-[#1E2025]"
                    />
                    <input
                      type="number"
                      step="0.25"
                      min="0.1"
                      max="24"
                      placeholder="Hours"
                      value={newRow.hoursSpent}
                      onChange={(e) => setNewRow({ ...newRow, hoursSpent: e.target.value })}
                      className="rounded border border-[#CBD5E1] px-2 py-1.5 dark:border-[#2C2E33] dark:bg-[#1E2025]"
                    />
                  </div>
                  <select
                    value={newRow.client}
                    onChange={(e) => setNewRow({ ...newRow, client: e.target.value })}
                    className="w-full rounded border border-[#CBD5E1] px-2 py-1.5 dark:border-[#2C2E33] dark:bg-[#1E2025]"
                  >
                    <option value="">Select Client...</option>
                    {clients.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.companyName}
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      placeholder="Project (e.g. HT501-A)"
                      value={newRow.projectCode}
                      onChange={(e) => setNewRow({ ...newRow, projectCode: e.target.value })}
                      className="rounded border border-[#CBD5E1] px-2 py-1.5 uppercase font-mono dark:border-[#2C2E33] dark:bg-[#1E2025]"
                    />
                    <select
                      value={newRow.entryStatus}
                      onChange={(e) => setNewRow({ ...newRow, entryStatus: e.target.value })}
                      className="rounded border border-[#CBD5E1] px-2 py-1.5 dark:border-[#2C2E33] dark:bg-[#1E2025]"
                    >
                      {ENTRY_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <input
                    placeholder="Task (e.g. REVIEWING ACTUAL DISCUSSION)"
                    value={newRow.taskTitle}
                    onChange={(e) => setNewRow({ ...newRow, taskTitle: e.target.value })}
                    className="w-full rounded border border-[#CBD5E1] px-2 py-1.5 uppercase dark:border-[#2C2E33] dark:bg-[#1E2025]"
                  />
                  <textarea
                    rows={2}
                    placeholder="Task description..."
                    value={newRow.workDescription}
                    onChange={(e) => setNewRow({ ...newRow, workDescription: e.target.value })}
                    className="w-full rounded border border-[#CBD5E1] px-2 py-1.5 dark:border-[#2C2E33] dark:bg-[#1E2025]"
                  />
                  <input
                    list="ts-task-types"
                    placeholder="Task Type (e.g. ISSUE ANALYSIS)"
                    value={newRow.taskType}
                    onChange={(e) => setNewRow({ ...newRow, taskType: e.target.value })}
                    className="w-full rounded border border-[#CBD5E1] px-2 py-1.5 uppercase dark:border-[#2C2E33] dark:bg-[#1E2025]"
                  />
                  <button
                    type="submit"
                    disabled={savingNew}
                    className="w-full rounded bg-[#0B2B4C] py-2 font-semibold text-white"
                  >
                    {savingNew ? 'Saving...' : 'Save Row'}
                  </button>
                </form>
              </div>
            )}

            {/* Authentic Excel / Google Sheets Grid (always visible on sm+, or when 'sheet' selected on mobile) */}
            <div className={`${mobileMode === 'cards' ? 'hidden sm:block' : 'block'} overflow-x-auto`}>
              <table className="w-full min-w-[1120px] border-collapse text-left text-[12px] leading-snug text-[#171717] dark:text-slate-100">
                <thead>
                  {/* Excel Column Letter Strip (A, B, C...) */}
                  <tr className="bg-[#F1F5F9] text-center text-[11px] font-medium text-[#475569] dark:bg-[#1E2025] dark:text-slate-400">
                    <th className="w-10 border border-[#CBD5E1] dark:border-[#2C2E33] py-1 font-normal" />
                    {colHeaders.map((letter) => (
                      <th key={letter} className="border border-[#CBD5E1] dark:border-[#2C2E33] py-1 font-semibold">
                        {letter}
                      </th>
                    ))}
                  </tr>

                  {/* Row 1: Deep Navy Header matching HighTide_FTE_TS */}
                  <tr className="bg-[#0B2B4C] text-white text-[12px] font-semibold">
                    <td className="border border-[#CBD5E1] dark:border-[#2C2E33] bg-[#F1F5F9] dark:bg-[#1E2025] text-center text-[11px] font-medium text-[#475569] dark:text-slate-400">
                      1
                    </td>
                    <th className="w-[104px] border border-[#335170] px-2 py-1.5 whitespace-nowrap">Date</th>
                    <th className="w-[165px] border border-[#335170] px-2 py-1.5 whitespace-nowrap">Client</th>
                    <th className="w-[115px] border border-[#335170] px-2 py-1.5 whitespace-nowrap">Project</th>
                    <th className="w-[210px] border border-[#335170] px-2 py-1.5">Task</th>
                    <th className="min-w-[300px] border border-[#335170] px-2 py-1.5">Task description</th>
                    <th className="w-[170px] border border-[#335170] px-2 py-1.5">Task Type</th>
                    <th className="w-[105px] border border-[#335170] px-2 py-1.5 whitespace-nowrap">Status</th>
                    <th className="w-[74px] border border-[#335170] px-2 py-1.5 text-right whitespace-nowrap">Hours</th>
                    <th className="w-[130px] border border-[#335170] px-2 py-1.5 whitespace-nowrap">Resource</th>
                    <th className="w-[76px] border border-[#335170] px-2 py-1.5 text-center whitespace-nowrap" title="Row actions">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {entries.map((entry, idx) => {
                    const rowNumber = idx + 2;
                    const isEditing = editingId === entry._id && editRow;
                    const editable = canModifyEntry(entry);

                    if (isEditing) {
                      const projList = projectSuggestionsForClient(editRow.client);
                      return (
                        <tr key={entry._id} className="bg-[#EFF6FF] dark:bg-[#1E293B]/40 align-top">
                          <td className="border border-[#CBD5E1] dark:border-[#2C2E33] bg-[#F1F5F9] dark:bg-[#1E2025] text-center text-[11px] text-[#475569] py-1.5">
                            {rowNumber}
                          </td>
                          <td className="border border-[#638BEF] p-1">
                            <input
                              type="date"
                              value={editRow.date}
                              onChange={(e) => setEditRow({ ...editRow, date: e.target.value })}
                              className="w-full bg-white dark:bg-[#17181B] px-1 py-0.5 text-[11px] focus:outline-none"
                            />
                          </td>
                          <td className="border border-[#638BEF] p-1">
                            <select
                              value={editRow.client}
                              onChange={(e) => setEditRow({ ...editRow, client: e.target.value })}
                              className="w-full bg-white dark:bg-[#17181B] px-1 py-0.5 text-[11px] focus:outline-none"
                            >
                              <option value="">Select Client</option>
                              {clients.map((c) => (
                                <option key={c._id} value={c._id}>
                                  {c.companyName}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="border border-[#638BEF] p-1">
                            <input
                              list={`edit-proj-${entry._id}`}
                              value={editRow.projectCode}
                              onChange={(e) => setEditRow({ ...editRow, projectCode: e.target.value })}
                              className="w-full bg-white dark:bg-[#17181B] px-1 py-0.5 text-[11px] uppercase font-mono focus:outline-none"
                            />
                            <datalist id={`edit-proj-${entry._id}`}>
                              {projList.map((p) => (
                                <option key={p._id} value={p.projectId}>
                                  {p.name}
                                </option>
                              ))}
                            </datalist>
                          </td>
                          <td className="border border-[#638BEF] p-1">
                            <input
                              value={editRow.taskTitle}
                              onChange={(e) => setEditRow({ ...editRow, taskTitle: e.target.value })}
                              className="w-full bg-white dark:bg-[#17181B] px-1 py-0.5 text-[11px] uppercase focus:outline-none"
                            />
                          </td>
                          <td className="border border-[#638BEF] p-1">
                            <textarea
                              rows={2}
                              value={editRow.workDescription}
                              onChange={(e) => setEditRow({ ...editRow, workDescription: e.target.value })}
                              className="w-full bg-white dark:bg-[#17181B] px-1 py-0.5 text-[11px] focus:outline-none resize-y"
                            />
                          </td>
                          <td className="border border-[#638BEF] p-1">
                            <input
                              list="ts-task-types"
                              value={editRow.taskType}
                              onChange={(e) => setEditRow({ ...editRow, taskType: e.target.value })}
                              className="w-full bg-white dark:bg-[#17181B] px-1 py-0.5 text-[11px] uppercase focus:outline-none"
                            />
                          </td>
                          <td className="border border-[#638BEF] p-1">
                            <select
                              value={editRow.entryStatus}
                              onChange={(e) => setEditRow({ ...editRow, entryStatus: e.target.value })}
                              className="w-full bg-white dark:bg-[#17181B] px-1 py-0.5 text-[11px] uppercase focus:outline-none"
                            >
                              {ENTRY_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="border border-[#638BEF] p-1">
                            <input
                              type="number"
                              step="0.25"
                              min="0.1"
                              max="24"
                              value={editRow.hoursSpent}
                              onChange={(e) => setEditRow({ ...editRow, hoursSpent: e.target.value })}
                              className="w-full bg-white dark:bg-[#17181B] px-1 py-0.5 text-right text-[11px] font-mono focus:outline-none"
                            />
                          </td>
                          <td className="border border-[#CBD5E1] dark:border-[#2C2E33] px-2 py-1.5 text-[11px]">
                            {entry.employee?.fullName || user?.fullName}
                          </td>
                          <td className="border border-[#CBD5E1] dark:border-[#2C2E33] px-1.5 py-1 text-center whitespace-nowrap">
                            <button
                              type="button"
                              disabled={savingEdit}
                              onClick={() => saveEdit(entry._id)}
                              title="Save changes"
                              className="inline-flex rounded bg-emerald-600 p-1 text-white hover:bg-emerald-700 mr-1"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(null);
                                setEditRow(null);
                              }}
                              title="Cancel"
                              className="inline-flex rounded bg-slate-200 p-1 text-slate-700 hover:bg-slate-300"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr
                        key={entry._id}
                        onClick={() => editable && startEdit(entry)}
                        title={editable ? 'Click row to edit cells inline' : undefined}
                        className={`align-top ${
                          editable
                            ? 'cursor-pointer hover:bg-[#F8FAFC] dark:hover:bg-white/[0.03]'
                            : ''
                        }`}
                      >
                        <td className="border border-[#CBD5E1] dark:border-[#2C2E33] bg-[#F1F5F9] dark:bg-[#1E2025] text-center text-[11px] font-medium text-[#475569] dark:text-slate-400 py-1.5 select-none">
                          {rowNumber}
                        </td>
                        <td className="border border-[#CBD5E1] dark:border-[#2C2E33] px-2 py-1.5 whitespace-nowrap">
                          {dayjs(entry.date).format('M/D/YYYY')}
                        </td>
                        <td className="border border-[#CBD5E1] dark:border-[#2C2E33] px-2 py-1.5">
                          {entry.client?.companyName || ''}
                        </td>
                        <td className="border border-[#CBD5E1] dark:border-[#2C2E33] px-2 py-1.5 uppercase whitespace-nowrap">
                          {entry.projectCode || entry.project?.projectId || ''}
                        </td>
                        <td className="border border-[#CBD5E1] dark:border-[#2C2E33] px-2 py-1.5 uppercase">
                          {entry.taskTitle || entry.task?.title || ''}
                        </td>
                        <td className="border border-[#CBD5E1] dark:border-[#2C2E33] px-2 py-1.5">
                          {entry.workDescription}
                        </td>
                        <td className="border border-[#CBD5E1] dark:border-[#2C2E33] px-2 py-1.5 uppercase">
                          {entry.taskType || ''}
                        </td>
                        <td className="border border-[#CBD5E1] dark:border-[#2C2E33] px-2 py-1.5 uppercase whitespace-nowrap">
                          {entry.entryStatus || 'DONE'}
                        </td>
                        <td className="border border-[#CBD5E1] dark:border-[#2C2E33] px-2 py-1.5 text-right tabular-nums">
                          {entry.hoursSpent}
                        </td>
                        <td className="border border-[#CBD5E1] dark:border-[#2C2E33] px-2 py-1.5 whitespace-nowrap">
                          {entry.employee?.fullName || user?.fullName}
                        </td>
                        <td
                          className="border border-[#CBD5E1] dark:border-[#2C2E33] px-1.5 py-1 text-center whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => duplicateToNewRow(entry)}
                            title="Copy row into bottom entry"
                            className="rounded p-1 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#171717] dark:hover:bg-white/10 dark:hover:text-white"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          {editable && (
                            <button
                              type="button"
                              onClick={() => handleDelete(entry._id)}
                              title="Delete row"
                              className="rounded p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/15"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Direct Excel Entry Row (Always ready at the bottom of the sheet) */}
                  <tr className="bg-[#F8FAFC] dark:bg-[#1A1C21] align-top">
                    <td className="border border-[#CBD5E1] dark:border-[#2C2E33] bg-[#E2E8F0] dark:bg-[#25272E] text-center text-[11px] font-bold text-[#0B2B4C] dark:text-[#C6F36B] py-1.5">
                      {entries.length + 2}
                    </td>
                    <td className="border border-[#CBD5E1] dark:border-[#2C2E33] p-1">
                      <input
                        type="date"
                        value={newRow.date}
                        onChange={(e) => setNewRow({ ...newRow, date: e.target.value })}
                        className="w-full rounded border border-transparent bg-white dark:bg-[#141518] px-1 py-1 text-[11px] focus:border-[#0B2B4C] focus:outline-none"
                      />
                    </td>
                    <td className="border border-[#CBD5E1] dark:border-[#2C2E33] p-1">
                      <select
                        value={newRow.client}
                        onChange={(e) => setNewRow({ ...newRow, client: e.target.value })}
                        className="w-full rounded border border-transparent bg-white dark:bg-[#141518] px-1 py-1 text-[11px] focus:border-[#0B2B4C] focus:outline-none"
                      >
                        <option value="">Select Client *</option>
                        {clients.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.companyName}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border border-[#CBD5E1] dark:border-[#2C2E33] p-1">
                      <input
                        list="ts-new-projects"
                        placeholder="HT501-A"
                        value={newRow.projectCode}
                        onChange={(e) => setNewRow({ ...newRow, projectCode: e.target.value })}
                        className="w-full rounded border border-transparent bg-white dark:bg-[#141518] px-1.5 py-1 text-[11px] uppercase font-mono focus:border-[#0B2B4C] focus:outline-none"
                      />
                      <datalist id="ts-new-projects">
                        {projectSuggestionsForClient(newRow.client).map((p) => (
                          <option key={p._id} value={p.projectId}>
                            {p.name}
                          </option>
                        ))}
                      </datalist>
                    </td>
                    <td className="border border-[#CBD5E1] dark:border-[#2C2E33] p-1">
                      <input
                        ref={newRowTaskInputRef}
                        placeholder="Task title *"
                        value={newRow.taskTitle}
                        onChange={(e) => setNewRow({ ...newRow, taskTitle: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && saveNewRow(e)}
                        className="w-full rounded border border-transparent bg-white dark:bg-[#141518] px-1.5 py-1 text-[11px] uppercase focus:border-[#0B2B4C] focus:outline-none"
                      />
                    </td>
                    <td className="border border-[#CBD5E1] dark:border-[#2C2E33] p-1">
                      <input
                        placeholder="Describe work done * (Enter to save)"
                        value={newRow.workDescription}
                        onChange={(e) => setNewRow({ ...newRow, workDescription: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && saveNewRow(e)}
                        className="w-full rounded border border-transparent bg-white dark:bg-[#141518] px-1.5 py-1 text-[11px] focus:border-[#0B2B4C] focus:outline-none"
                      />
                    </td>
                    <td className="border border-[#CBD5E1] dark:border-[#2C2E33] p-1">
                      <input
                        list="ts-task-types"
                        placeholder="ISSUE ANALYSIS"
                        value={newRow.taskType}
                        onChange={(e) => setNewRow({ ...newRow, taskType: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && saveNewRow(e)}
                        className="w-full rounded border border-transparent bg-white dark:bg-[#141518] px-1.5 py-1 text-[11px] uppercase focus:border-[#0B2B4C] focus:outline-none"
                      />
                    </td>
                    <td className="border border-[#CBD5E1] dark:border-[#2C2E33] p-1">
                      <select
                        value={newRow.entryStatus}
                        onChange={(e) => setNewRow({ ...newRow, entryStatus: e.target.value })}
                        className="w-full rounded border border-transparent bg-white dark:bg-[#141518] px-1 py-1 text-[11px] uppercase focus:border-[#0B2B4C] focus:outline-none"
                      >
                        {ENTRY_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border border-[#CBD5E1] dark:border-[#2C2E33] p-1">
                      <input
                        type="number"
                        step="0.25"
                        min="0.1"
                        max="24"
                        value={newRow.hoursSpent}
                        onChange={(e) => setNewRow({ ...newRow, hoursSpent: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && saveNewRow(e)}
                        className="w-full rounded border border-transparent bg-white dark:bg-[#141518] px-1 py-1 text-right text-[11px] font-mono focus:border-[#0B2B4C] focus:outline-none"
                      />
                    </td>
                    <td className="border border-[#CBD5E1] dark:border-[#2C2E33] px-2 py-1.5 text-[11px] text-[#475569] dark:text-slate-300 whitespace-nowrap">
                      {user?.fullName}
                    </td>
                    <td className="border border-[#CBD5E1] dark:border-[#2C2E33] p-1 text-center">
                      <button
                        type="button"
                        disabled={savingNew}
                        onClick={saveNewRow}
                        className="w-full rounded bg-[#0B2B4C] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#0e3966] disabled:opacity-50"
                      >
                        {savingNew ? '...' : 'Save'}
                      </button>
                    </td>
                  </tr>

                  {/* Total Hours Footer Row matching Spreadsheet Column H */}
                  <tr className="bg-[#F1F5F9] dark:bg-[#1E2025] font-bold text-[12px]">
                    <td className="border border-[#CBD5E1] dark:border-[#2C2E33] py-1.5 text-center text-[11px] text-[#475569]">
                      Σ
                    </td>
                    <td colSpan={7} className="border border-[#CBD5E1] dark:border-[#2C2E33] px-2 py-1.5 text-right uppercase text-[11px] text-[#475569] dark:text-slate-300">
                      Total Hours
                    </td>
                    <td className="border border-[#CBD5E1] dark:border-[#2C2E33] px-2 py-1.5 text-right tabular-nums text-[#0B2B4C] dark:text-[#C6F36B]">
                      {totalHours}
                    </td>
                    <td colSpan={2} className="border border-[#CBD5E1] dark:border-[#2C2E33]" />
                  </tr>
                </tbody>
              </table>
            </div>

            <datalist id="ts-task-types">
              {DEFAULT_TASK_TYPES.map((tt) => (
                <option key={tt} value={tt} />
              ))}
            </datalist>
          </>
        )}

        {/* Google Sheets / Excel Bottom Tab Bar */}
        <div className="flex flex-wrap items-center gap-1 border-t border-[#CBD5E1] bg-[#F1F5F9] px-2 pt-1.5 dark:border-[#2C2E33] dark:bg-[#1A1C21]">
          <button
            type="button"
            onClick={() => newRowTaskInputRef.current?.focus()}
            title="Jump to new entry row"
            className="mb-1.5 rounded p-1 text-[#475569] hover:bg-black/5 dark:text-slate-300"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>

          <div className="flex flex-1 items-center gap-1 overflow-x-auto">
            {monthTabs.map((m) => {
              const isActive = selectedMonth === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setSelectedMonth(m.key)}
                  className={`whitespace-nowrap px-3.5 py-1.5 text-xs transition-colors border-t border-x rounded-t-md ${
                    isActive
                      ? 'bg-white border-[#CBD5E1] font-bold text-[#0B2B4C] border-b-2 border-b-[#0B2B4C] dark:bg-[#141518] dark:border-[#2C2E33] dark:text-[#C6F36B] dark:border-b-[#C6F36B]'
                      : 'bg-transparent border-transparent text-[#475569] hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/5'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setSelectedMonth('all')}
              className={`whitespace-nowrap px-3.5 py-1.5 text-xs border-t border-x rounded-t-md ${
                selectedMonth === 'all'
                  ? 'bg-white border-[#CBD5E1] font-bold text-[#0B2B4C] dark:bg-[#141518] dark:border-[#2C2E33] dark:text-[#C6F36B]'
                  : 'bg-transparent border-transparent text-[#475569] hover:bg-black/5 dark:text-slate-400'
              }`}
            >
              All Months
            </button>
          </div>

          <input
            type="month"
            value={selectedMonth === 'all' ? '' : selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value || 'all')}
            aria-label="Custom month sheet"
            className="mb-1 rounded border border-[#CBD5E1] bg-white px-2 py-0.5 text-[11px] dark:border-[#2C2E33] dark:bg-[#141518]"
          />
        </div>
      </div>
    </div>
  );
}
