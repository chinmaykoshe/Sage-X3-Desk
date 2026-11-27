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
  History,
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

  useEffect(() => {
    const onResume = (e) => {
      const conv = e.detail;
      if (!conv?._id) return;
      setConversationId(conv._id);
      setMessages(conv.messages || []);
      setOpen(true);
    };
    window.addEventListener('x3ai:open-conversation', onResume);
    return () => window.removeEventListener('x3ai:open-conversation', onResume);
  }, []);

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
      return 'ml-auto rounded-[18px] rounded-br-[6px] bg-gradient-to-b from-[#0A84FF] to-[#007AFF] text-white shadow-[0_4px_14px_rgba(0,122,255,0.28),inset_0_1px_0_rgba(255,255,255,0.3)]';
    }
    switch (msg.statusType) {
      case 'navigation':
        return 'rounded-[18px] rounded-bl-[6px] border border-[#007AFF]/20 bg-[#007AFF]/10 backdrop-blur-md text-[#1D1D1F] dark:text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]';
      case 'search':
      case 'success':
        return 'rounded-[18px] rounded-bl-[6px] border border-white/75 bg-white/65 backdrop-blur-md text-[#1D1D1F] dark:border-white/15 dark:bg-white/[0.1] dark:text-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.75)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]';
      case 'draft':
      case 'approval':
        return 'rounded-[18px] rounded-bl-[6px] border border-[#34C759]/30 bg-[#34C759]/12 backdrop-blur-md text-[#1D1D1F] dark:text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]';
      case 'warning':
        return 'rounded-[18px] rounded-bl-[6px] border border-[#FF9F0A]/35 bg-[#FF9F0A]/12 backdrop-blur-md text-[#1D1D1F] dark:text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]';
      case 'error':
        return 'rounded-[18px] rounded-bl-[6px] border border-[#FF3B30]/35 bg-[#FF3B30]/12 backdrop-blur-md text-[#c93e35] dark:text-[#ff9c95] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]';
      default:
        return 'rounded-[18px] rounded-bl-[6px] border border-white/75 bg-white/65 backdrop-blur-md text-[#1D1D1F] dark:border-white/15 dark:bg-white/[0.1] dark:text-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.75)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]';
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
      {/* Closed Floating Trigger Button (Apple Liquid Glass Orb) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Ask X3 AI"
          aria-label="Ask X3 AI"
          className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-40 group flex h-12 w-12 sm:h-13 sm:w-13 items-center justify-center rounded-full border border-white/80 bg-white/70 backdrop-blur-2xl backdrop-saturate-[1.8] p-3 sm:p-3.5 text-[#007AFF] shadow-[0_12px_32px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.9)] hover:scale-105 hover:bg-white/85 dark:border-white/20 dark:bg-[#1C1C1E]/75 dark:text-[#0A84FF] dark:shadow-[0_12px_32px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.18)] transition-all duration-200"
        >
          <Sparkles className="h-5 w-5" />
          <span
            title={status.available && status.modelReady ? 'Ollama Online' : 'Ollama Offline'}
            className={`absolute top-0 right-0 h-3 w-3 rounded-full border-2 border-white dark:border-[#1C1C1E] ${
              status.available && status.modelReady ? 'bg-[#34C759]' : 'bg-[#FF3B30]'
            }`}
          />
        </button>
      )}

      {/* Expanded Floating AI Workspace (Apple Liquid Glass Sheet) */}
      {open && (
        <div
          className={`fixed z-50 flex flex-col border border-white/75 bg-white/60 backdrop-blur-2xl backdrop-saturate-[1.8] shadow-[0_24px_64px_-12px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-black/[0.04] dark:border-white/15 dark:bg-[#1C1C1E]/65 dark:shadow-[0_24px_64px_-12px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.12)] dark:ring-white/10 transition-all duration-200 inset-x-2 bottom-2 top-14 sm:inset-auto sm:bottom-5 sm:right-5 rounded-[24px] overflow-hidden ${
            expandedSize ? 'sm:w-[540px] sm:h-[680px]' : 'sm:w-[410px] sm:h-[560px]'
          }`}
        >
          {/* Apple Frosted Header */}
          <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.1] bg-white/45 dark:bg-white/[0.05] backdrop-blur-xl px-4 py-3 text-[#1D1D1F] dark:text-white">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#0A84FF] via-[#5E5CE6] to-[#BF5AF2] text-white shadow-[0_2px_8px_rgba(10,132,255,0.35)]">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold tracking-tight">X3 AI Assistant</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm ${
                      status.available && status.modelReady
                        ? 'bg-[#34C759]/15 text-[#1f8a3d] dark:text-[#30D158]'
                        : 'bg-[#FF3B30]/15 text-[#c93e35] dark:text-[#FF453A]'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        status.available && status.modelReady ? 'bg-[#34C759]' : 'bg-[#FF3B30]'
                      }`}
                    />
                    {status.available && status.modelReady ? 'Ready' : 'Offline'}
                  </span>
                </div>
                <div className="text-[10px] font-medium text-black/45 dark:text-white/50 truncate">
                  {status.model} {status.digest ? `· ${status.digest}` : ''}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setOpen(false);
                  navigate('/profile?tab=ai-history');
                }}
                title="AI Chat History (Profile)"
                className="rounded-full p-1.5 text-black/55 hover:bg-black/[0.06] hover:text-black dark:text-white/65 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
              >
                <History className="h-4 w-4" />
              </button>
              <button
                onClick={handleNewConversation}
                title="New conversation"
                className="rounded-full p-1.5 text-black/55 hover:bg-black/[0.06] hover:text-black dark:text-white/65 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
              >
                <PlusCircle className="h-4 w-4" />
              </button>
              <button
                onClick={handleClear}
                title="Clear conversation"
                className="rounded-full p-1.5 text-black/55 hover:bg-black/[0.06] hover:text-black dark:text-white/65 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setExpandedSize((s) => !s)}
                title="Resize panel"
                className="hidden sm:inline-flex rounded-full p-1.5 text-black/55 hover:bg-black/[0.06] hover:text-black dark:text-white/65 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
              >
                {expandedSize ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setOpen(false)}
                title="Close"
                className="rounded-full p-1.5 text-black/55 hover:bg-black/[0.06] hover:text-black dark:text-white/65 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
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
                <div className="rounded-xl border border-white/50 dark:border-white/15 bg-white/55 dark:bg-white/5 backdrop-blur-md p-3 shadow-xs">
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
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {(msg.action.buttons || [{ label: msg.action.label || 'Review in TL Approval Inbox', route: msg.action.route }]).map((btn, bIdx) => (
                          <button
                            key={bIdx}
                            onClick={() => {
                              navigate(btn.route);
                            }}
                            className="inline-flex items-center gap-1 rounded-full bg-black/[0.06] hover:bg-black/[0.11] dark:bg-white/15 dark:hover:bg-white/25 backdrop-blur-sm px-3 py-1 text-[11px] font-semibold text-[#007AFF] dark:text-[#0A84FF] transition-colors"
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

          {/* Input Bar & Always-Available Suggested Commands (Apple Frosted Dock) */}
          <div className="border-t border-black/[0.06] dark:border-white/[0.1] bg-white/45 dark:bg-white/[0.04] backdrop-blur-xl">
            <div className="px-3.5 pt-2 pb-1.5 border-b border-black/[0.05] dark:border-white/[0.07]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-black/45 dark:text-white/45">
                  Suggestions
                </span>
                <button
                  type="button"
                  onClick={() => setShowSuggestions((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-black/50 hover:text-black hover:bg-black/[0.05] dark:text-white/55 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
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
                <div className="mt-1.5 pb-0.5 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {suggestions.map((cmd) => (
                    <button
                      key={cmd}
                      type="button"
                      onClick={() => handleSend(cmd)}
                      className="rounded-full border border-white/75 bg-white/60 backdrop-blur-sm px-2.5 py-1 text-[11px] font-medium text-[#1D1D1F] hover:bg-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:border-white/15 dark:bg-white/[0.08] dark:text-slate-200 dark:hover:bg-white/15 transition-all text-left"
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
                    className="inline-flex items-center gap-1 rounded-full bg-black/[0.06] dark:bg-white/15 px-2.5 py-0.5 text-[11px]"
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
                className="cursor-pointer rounded-full border border-white/75 bg-white/65 p-2 text-black/60 hover:bg-white/90 hover:text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-white/15 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/20 transition-colors"
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
                placeholder="Ask X3 AI..."
                className="flex-1 rounded-full border border-white/80 bg-white/70 backdrop-blur-md px-3.5 py-2 text-xs text-[#1D1D1F] placeholder-black/40 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] focus:border-[#007AFF]/50 focus:bg-white/90 focus:outline-none dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:placeholder-white/40"
              />

              <button
                type="submit"
                disabled={sending}
                className="rounded-full bg-gradient-to-b from-[#0A84FF] to-[#007AFF] p-2 text-white shadow-[0_3px_10px_rgba(0,122,255,0.35),inset_0_1px_0_rgba(255,255,255,0.35)] hover:opacity-95 disabled:opacity-50 transition-opacity"
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
