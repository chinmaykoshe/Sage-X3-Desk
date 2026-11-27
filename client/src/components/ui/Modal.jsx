import { useEffect } from 'react';
import { X } from 'lucide-react';

export function Modal({ open, onClose, title, subtitle, children, maxWidth = 'max-w-2xl' }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/50 backdrop-blur-[1px]">
      <div
        className={`w-full ${maxWidth} max-h-[92dvh] sm:max-h-[90vh] flex flex-col rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xl`}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-200 dark:border-slate-800 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-3.5 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

export default Modal;
