import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X, ExternalLink } from 'lucide-react';

const ToastContext = createContext();

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success', duration = 3000, action = null) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type, action }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border px-4 py-3 shadow-lg text-sm transition-all ${
              t.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950 dark:border-rose-800 dark:text-rose-100'
                : t.type === 'info'
                ? 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-100'
                : 'bg-white border-slate-200 text-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100'
            }`}
          >
            {t.type === 'error' ? (
              <AlertCircle className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />
            ) : t.type === 'info' ? (
              <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
            )}
            <div className="flex-1 space-y-1.5 leading-snug">
              <div>{t.message}</div>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action.onClick?.();
                    removeToast(t.id);
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-[#171717] px-2.5 py-1 text-xs font-semibold text-[#C6F36B] hover:opacity-90"
                >
                  {t.action.label} <ExternalLink className="h-3 w-3" />
                </button>
              )}
            </div>
            <button onClick={() => removeToast(t.id)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
