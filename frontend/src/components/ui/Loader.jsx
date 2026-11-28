export function Loader({ label = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center py-12 gap-2.5 text-sm text-slate-500 dark:text-slate-400">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      <span>{label}</span>
    </div>
  );
}

export default Loader;
