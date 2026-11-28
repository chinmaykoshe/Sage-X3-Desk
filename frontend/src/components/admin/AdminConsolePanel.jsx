import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Terminal, Trash2 } from 'lucide-react';
import api, { getApiError } from '../../services/api';

const QUICK_COMMANDS = [
  { label: 'Health', cmd: 'health' },
  { label: 'Logs (40)', cmd: 'logs 40' },
  { label: 'Tailscale', cmd: 'tailscale' },
  { label: 'AI Status', cmd: 'ai' },
  { label: 'DB Counts', cmd: 'db' },
  { label: 'Env', cmd: 'env' },
  { label: 'Help', cmd: 'help' },
];

export default function AdminConsolePanel() {
  const [entries, setEntries] = useState([
    {
      type: 'system',
      text: 'Sage X3 Desk — Admin Diagnostic Console\nType "help" for available commands, or click a quick command above.',
    },
  ]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  const loadInitialLogs = async () => {
    setRunning(true);
    try {
      const { data } = await api.get('/monitoring/console/logs?lines=30');
      const lines = data?.data?.lines || [];
      setEntries((prev) => [
        ...prev,
        {
          type: 'output',
          text: lines.length
            ? `=== Recent ${data?.data?.source || 'backend.log'} ===\n${lines.join('\n')}`
            : '(No backend log lines found yet)',
        },
      ]);
    } catch (err) {
      setEntries((prev) => [...prev, { type: 'error', text: getApiError(err, 'Failed to load logs') }]);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    loadInitialLogs();
  }, []);

  const runCommand = async (rawCmd) => {
    const cmd = rawCmd.trim();
    if (!cmd) return;

    if (cmd.toLowerCase() === 'clear' || cmd.toLowerCase() === 'cls') {
      setEntries([]);
      setInput('');
      return;
    }

    setHistory((prev) => [cmd, ...prev.slice(0, 49)]);
    setHistoryIdx(-1);
    setEntries((prev) => [...prev, { type: 'cmd', text: `admin@sagex3desk:~$ ${cmd}` }]);
    setInput('');
    setRunning(true);

    try {
      const { data } = await api.post('/monitoring/console/exec', { command: cmd });
      setEntries((prev) => [
        ...prev,
        { type: 'output', text: data?.data?.output || '(ok)' },
      ]);
    } catch (err) {
      setEntries((prev) => [
        ...prev,
        { type: 'error', text: getApiError(err, 'Command execution failed') },
      ]);
    } finally {
      setRunning(false);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runCommand(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const nextIdx = Math.min(historyIdx + 1, history.length - 1);
      if (history[nextIdx] !== undefined) {
        setHistoryIdx(nextIdx);
        setInput(history[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = historyIdx - 1;
      if (nextIdx < 0) {
        setHistoryIdx(-1);
        setInput('');
      } else {
        setHistoryIdx(nextIdx);
        setInput(history[nextIdx] || '');
      }
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-[#090d16] text-slate-200 shadow-lg overflow-hidden">
      {/* Terminal Title Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-[#0f172a] px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          </div>
          <Terminal className="h-4 w-4 text-[#C6F36B] ml-1" />
          <span className="font-mono text-xs font-semibold text-slate-200">
            Sage X3 Desk — Admin CMD Console
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK_COMMANDS.map((q) => (
            <button
              key={q.cmd}
              type="button"
              disabled={running}
              onClick={() => runCommand(q.cmd)}
              className="rounded-md border border-slate-700 bg-slate-800/80 px-2.5 py-1 font-mono text-[11px] text-slate-300 hover:border-[#C6F36B]/50 hover:text-[#C6F36B] transition-colors disabled:opacity-50"
            >
              {q.label}
            </button>
          ))}
          <button
            type="button"
            disabled={running}
            onClick={loadInitialLogs}
            title="Refresh backend logs"
            className="rounded-md border border-slate-700 bg-slate-800/80 p-1.5 text-slate-300 hover:text-white transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setEntries([])}
            title="Clear console"
            className="rounded-md border border-slate-700 bg-slate-800/80 p-1.5 text-slate-300 hover:text-rose-400 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Output Area */}
      <div
        onClick={() => inputRef.current?.focus()}
        className="h-[460px] overflow-y-auto p-4 font-mono text-xs leading-relaxed space-y-2 cursor-text"
      >
        {entries.map((entry, idx) => (
          <pre
            key={idx}
            className={`whitespace-pre-wrap break-words font-mono ${
              entry.type === 'cmd'
                ? 'text-[#C6F36B] font-semibold'
                : entry.type === 'error'
                ? 'text-rose-400'
                : entry.type === 'system'
                ? 'text-slate-400'
                : 'text-slate-200'
            }`}
          >
            {entry.text}
          </pre>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Command Prompt Input */}
      <div className="flex items-center gap-2 border-t border-slate-800 bg-[#0b1120] px-4 py-2.5 font-mono text-xs">
        <span className="text-[#C6F36B] font-semibold shrink-0">admin@sagex3desk:~$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={running}
          placeholder="Type a command (help, health, logs, tailscale, ai, db, env, clear)..."
          className="w-full bg-transparent text-slate-100 placeholder-slate-500 focus:outline-none"
          autoFocus
        />
      </div>
    </div>
  );
}
