import { STATUS_BADGE, PRIORITY_BADGE } from '../../utils/constants';

export function Badge({ children, variant = 'status', value, className = '' }) {
  const key = value || (typeof children === 'string' ? children : '');
  const map = variant === 'priority' ? PRIORITY_BADGE : STATUS_BADGE;
  const colorCls =
    map[key] ||
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${colorCls} ${className}`}
    >
      {children}
    </span>
  );
}

export default Badge;
