import { Inbox } from 'lucide-react';

export function EmptyState({ icon: Icon = Inbox, title = 'No records found', description = '', action = null }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 py-12 px-4 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 mb-3">
        <Icon className="h-5 w-5" />
      </div>
      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h4>
      {description && <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
