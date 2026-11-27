import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Send,
  ImagePlus,
  X,
  PlusCircle,
  Trash2,
  Maximize2,
  Minimize2,
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  Navigation,
  Search,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import api, { getApiError } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useToast } from '../../context/ToastContext';

export default function FloatingX3AI() {
  const { user, isManager } = useAuth();
  const { openTicketDrawer, openTaskDrawer, notifyLocalMutation } = useWorkspace();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [expandedSize, setExpandedSize] = useState(false);
  const [status, setStatus] = useState({ available: false, modelReady: false, model: 'qwen2.5-coder:1.5b', pendingApprovals: 0 });
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 640 : true));

  const chatEndRef = useRef(null);

  const checkStatus = async () => {
    try {
      const { data } = await api.get('/ai/status');
      setStatus(data.data);
    } catch {
      setStatus((s) => ({ ...s, available: false, modelReady: false }));
    }
  };

  useEffect(() => {
    if (user) checkStatus();
  }, [user]);

  useEffect(() => {
    if (open) {
      checkStatus();
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    }
  }, [open, messages.length]);

  // Centralized Frontend AI Action Executor (Part 3, Section 8)
  const executeFrontendAction = (action) => {
    if (!action) return;
    if (action.type === 'NAVIGATE' && action.route) {
      navigate(action.route);
    } else if ((action.type === 'FILTER_TICKETS' || action.type === 'FILTER_TASKS') && action.route) {
      navigate(action.route);
    } else if (action.type === 'OPEN_TICKET_DRAWER' && action.ticketId) {
      openTicketDrawer(action.ticketId);
    } else if (action.type === 'OPEN_TASK_DRAWER' && action.taskId) {
      openTaskDrawer(action.taskId);
    } else if (action.type === 'OPEN_DRAFT' && action.route) {
      notifyLocalMutation('draft');
    }
  };

  const handleSend = async (customText = null) => {
    const text = (customText ?? input).trim();
    if (!text && files.length === 0) return;

    const optimisticUserMsg = {
      _id: `tmp-${Date.now()}`,
      role: 'user',
      content: text || `Uploaded ${files.length} screenshot(s)`,
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);
    if (!customText) setInput('');
    const attached = [...files];
    setFiles([]);
    setSending(true);

    try {
      const fd = new FormData();
      fd.append('message', text);
      if (conversationId) fd.append('conversationId', conversationId);
      attached.forEach((f) => fd.append('files', f));

      const { data } = await api.post('/ai/chat', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000, // Allow up to 10 min for local OCR + Ollama inference
      });

      const payload = data.data;
      setConversationId(payload.conversationId);
      setMessages((prev) => [
        ...prev.filter((m) => m._id !== optimisticUserMsg._id),
        payload.userMessage,
        payload.assistantMessage,
      ]);

      if (payload.assistantMessage?.action) {
        executeFrontendAction(payload.assistantMessage.action);
      }
      if (payload.draft) {
        checkStatus();
      }
    } catch (err) {
      const errMsg = getApiError(err, 'Failed to process AI request');
      setMessages((prev) => [
        ...prev,
        {
          _id: `err-${Date.now()}`,
          role: 'assistant',
          content: errMsg,
          statusType: 'error',
        },
      ]);
      addToast(errMsg, 'error');
    } finally {
      setSending(false);
    }
  };

  const handleNewConversation = async () => {
    setConversationId(null);
    setMessages([]);
    setFiles([]);
    try {
      const { data } = await api.post('/ai/conversations', { title: 'X3 AI Session' });
      setConversationId(data.data._id);
    } catch {
      // ignore
    }
  };

  const handleClear = async () => {
    if (conversationId) {
      await api.delete(`/ai/conversations/${conversationId}`).catch(() => {});
    }
    setConversationId(null);
    setMessages([]);
    setFiles([]);
  };

  // Contextual suggested commands
  const suggestions = [
    'Show all open tickets',
    'Show tickets for ABC Manufacturing',
    'Find overdue tasks',
    'Show my assigned tasks',
    ...(isManager
      ? [
          'Show pending TL approvals',
          'CSV format for clients',
          'CSV format for users',
          'CSV format for projects',
        ]
      : []),
    'Show recent Production deployments',
    ...(location.pathname.includes('/clients') ? ['Summarize Hindustan Precision recent issues'] : []),
  ];

  const getMsgStyle = (msg) => {
    if (msg.role === 'user') {
      return 'ml-auto bg-[#171717] text-white dark:bg-[#C6F36B] dark:text-[#171717]';
    }
    switch (msg.statusType) {
      case 'navigation':
        return 'border border-[#638BEF]/30 bg-[#638BEF]/10 text-[#171717] dark:text-slate-100';
      case 'search':
      case 'success':
        return 'border border-[#35B8A6]/35 bg-[#35B8A6]/10 text-[#171717] dark:text-slate-100';
      case 'draft':
      case 'approval':
        return 'border border-[#C6F36B] bg-[#C6F36B]/20 text-[#171717] dark:text-slate-100';
      case 'warning':
        return 'border border-amber-500/40 bg-amber-500/10 text-[#171717] dark:text-amber-100';
      case 'error':
        return 'border border-[#F16D64]/40 bg-[#F16D64]/10 text-[#c93e35] dark:text-[#ff9c95]';
      default:
        return 'border border-[#E8E8E5] bg-[#F4F4F2]/70 text-[#171717] dark:border-[#2C2E33] dark:bg-white/5 dark:text-slate-100';
    }
  };

  const getMsgIcon = (type) => {
    if (type === 'navigation') return <Navigation className="h-3.5 w-3.5 text-[#638BEF] shrink-0 mt-0.5" />;
    if (type === 'search') return <Search className="h-3.5 w-3.5 text-[#35B8A6] shrink-0 mt-0.5" />;
    if (type === 'draft' || type === 'approval') return <FileText className="h-3.5 w-3.5 text-[#171717] dark:text-[#C6F36B] shrink-0 mt-0.5" />;
    if (type === 'warning') return <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />;
    if (type === 'error') return <AlertTriangle className="h-3.5 w-3.5 text-[#F16D64] shrink-0 mt-0.5" />;
    return <CheckCircle2 className="h-3.5 w-3.5 text-[#35B8A6] shrink-0 mt-0.5" />;
  };

  return (
    <>
      {/* Closed Floating Trigger Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Ask X3 AI"
          aria-label="Ask X3 AI"
          className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-40 group flex h-12 w-12 sm:h-13 sm:w-13 items-center justify-center rounded-full bg-[#171717] p-3 sm:p-3.5 text-[#C6F36B] shadow-[0_8px_28px_rgba(23,23,23,0.35)] ring-2 ring-[#C6F36B]/50 hover:ring-[#C6F36B] hover:scale-105 transition-all duration-200"
        >
          <Sparkles className="h-5 w-5" />
          <span
            title={status.available && status.modelReady ? 'Ollama Online' : 'Ollama Offline'}
            className={`absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-[#101113] ${
              status.available && status.modelReady ? 'bg-[#35B8A6]' : 'bg-[#F16D64]'
            }`}
          />
        </button>
      )}

      {/* Expanded Floating AI Workspace */}
      {open && (
        <div
          className={`fixed z-50 flex flex-col border border-[#E8E8E5] bg-white shadow-2xl dark:border-[#2C2E33] dark:bg-[#17181B] transition-all duration-200 inset-x-2 bottom-2 top-14 sm:inset-auto sm:bottom-5 sm:right-5 rounded-2xl overflow-hidden ${
            expandedSize ? 'sm:w-[540px] sm:h-[680px]' : 'sm:w-[410px] sm:h-[560px]'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#E8E8E5] dark:border-[#26282D] bg-[#171717] px-4 py-3 text-white">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#C6F36B] text-[#171717]">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">X3 AI Assistant</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      status.available && status.modelReady
                        ? 'bg-[#35B8A6]/20 text-[#6fe0d0]'
                        : 'bg-[#F16D64]/20 text-[#ff9c95]'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        status.available && status.modelReady ? 'bg-[#35B8A6]' : 'bg-[#F16D64]'
                      }`}
                    />
                    {status.available && status.modelReady ? 'Local Ready' : 'Offline'}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-white/60 truncate">
                  {status.model} {status.digest ? `(${status.digest})` : ''}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleNewConversation}
                title="New conversation"
                className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <PlusCircle className="h-4 w-4" />
              </button>
              <button
                onClick={handleClear}
                title="Clear conversation"
                className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setExpandedSize((s) => !s)}
                title="Resize panel"
                className="hidden sm:inline-flex rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
              >
                {expandedSize ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setOpen(false)}
                title="Close"
                className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Offline Notice */}
          {(!status.available || !status.modelReady) && (
            <div className="bg-amber-500/15 border-b border-amber-500/30 px-3.5 py-2 text-[11px] text-amber-900 dark:text-amber-200">
              X3 AI is not available for now. Please try again after a while. Direct navigation and manual ticket creation remain active.
            </div>
          )}

          {/* Chat Area */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 text-xs">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-[#E8E8E5] dark:border-[#26282D] bg-[#F4F4F2]/60 dark:bg-white/5 p-3">
                  <div className="font-semibold text-[#171717] dark:text-slate-100">
                    Local Sage X3 Operations Assistant
                  </div>
                  <p className="mt-1 text-[11px] text-[#777777]">
                    Ask me to filter tickets, locate overdue tasks, navigate to clients, summarize issues, or upload a screenshot to draft a ticket for TL approval.
                  </p>
                  <button
                    onClick={() => {
                      setOpen(false);
                      navigate('/smart-intake');
                    }}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#638BEF] hover:underline"
                  >
                    Open Full Smart Ticket Intake <ArrowUpRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={msg._id || `${msg.role}-${idx}`} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[88%] rounded-xl px-3 py-2 whitespace-pre-line leading-relaxed ${getMsgStyle(msg)}`}>
                    <div className="flex items-start gap-2">
                      {msg.role === 'assistant' && getMsgIcon(msg.statusType)}
                      <span>{msg.content}</span>
                    </div>

                    {(msg.action?.buttons?.length > 0 || (msg.action?.route && ['OPEN_DRAFT', 'OPEN_CREATED'].includes(msg.action?.type))) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(msg.action.buttons || [{ label: msg.action.label || 'Review in TL Approval Inbox', route: msg.action.route }]).map((btn, bIdx) => (
                          <button
                            key={bIdx}
                            onClick={() => {
                              navigate(btn.route);
                            }}
                            className="inline-flex items-center gap-1 rounded-md bg-[#171717] px-2.5 py-1 text-[11px] font-semibold text-[#C6F36B] hover:opacity-90"
                          >
                            {btn.label} <ArrowUpRight className="h-3 w-3" />
                          </button>
                        ))}
                      </div>
                    )}

                    {(msg.clarificationOptions || []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {msg.clarificationOptions.map((opt, i) => (
                          <button
                            key={i}
                            onClick={() => handleSend(opt.command)}
                            className="rounded-md border border-[#171717]/20 bg-white px-2 py-1 text-[11px] font-medium text-[#171717] hover:bg-[#C6F36B]"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {sending && (
              <div className="flex items-center gap-2 text-[11px] text-[#777777]">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#171717] border-t-transparent dark:border-[#C6F36B]" />
                <span>X3 AI ({status.model}) is thinking...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Bar & Always-Available Suggested Commands */}
          <div className="border-t border-[#E8E8E5] dark:border-[#26282D] bg-white dark:bg-[#17181B]">
            <div className="px-3 pt-2 pb-1 border-b border-[#E8E8E5]/70 dark:border-[#26282D]/70 bg-[#FAFAF9] dark:bg-[#141518]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#777777]">
                  Suggested Commands
                </span>
                <button
                  type="button"
                  onClick={() => setShowSuggestions((v) => !v)}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-[#777777] hover:text-[#171717] hover:bg-[#E8E8E5]/60 dark:hover:text-slate-200 dark:hover:bg-[#26282D] transition-colors"
                >
                  {showSuggestions ? (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      Hide
                    </>
                  ) : (
                    <>
                      <ChevronUp className="h-3 w-3" />
                      View
                    </>
                  )}
                </button>
              </div>
              {showSuggestions && (
                <div className="mt-1.5 pb-1 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {suggestions.map((cmd) => (
                    <button
                      key={cmd}
                      type="button"
                      onClick={() => handleSend(cmd)}
                      className="rounded-lg border border-[#E8E8E5] bg-white px-2 py-1 text-[11px] text-[#171717] hover:border-[#171717] hover:bg-[#C6F36B]/25 dark:border-[#2C2E33] dark:bg-[#1E2025] dark:text-slate-200 transition-colors text-left"
                    >
                      {cmd}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 space-y-2">
            {files.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {files.map((f, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-md bg-[#F4F4F2] dark:bg-white/10 px-2 py-0.5 text-[11px]"
                  >
                    {f.name}
                    <button onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <label
                title="Upload screenshot or CSV file"
                className="cursor-pointer rounded-lg border border-[#E8E8E5] p-2 text-[#555555] hover:bg-[#F4F4F2] dark:border-[#2C2E33] dark:text-slate-300 dark:hover:bg-white/10"
              >
                <ImagePlus className="h-4 w-4" />
                <input
                  type="file"
                  accept="image/*,.csv,.txt"
                  multiple
                  className="hidden"
                  onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files || [])])}
                />
              </label>

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask X3 AI or describe an issue..."
                className="flex-1 rounded-lg border border-[#E8E8E5] bg-[#F4F4F2]/60 px-3 py-2 text-xs text-[#171717] placeholder-[#777777] focus:border-[#171717] focus:bg-white focus:outline-none dark:border-[#2C2E33] dark:bg-[#1E2025] dark:text-slate-100"
              />

              <button
                type="submit"
                disabled={sending}
                className="rounded-lg bg-[#171717] p-2 text-[#C6F36B] hover:bg-[#2a2a2a] disabled:opacity-50 dark:bg-[#C6F36B] dark:text-[#171717]"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
          </div>
        </div>
      )}
    </>
  );
}
