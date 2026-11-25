import { ChevronLeft, ChevronRight } from 'lucide-react';
import Button from './Button';

export function Pagination({ meta, onPageChange }) {
  if (!meta || meta.totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
      <span>
        Page {meta.page} of {meta.totalPages} ({meta.total} total)
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          size="xs"
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </Button>
        <Button
          variant="secondary"
          size="xs"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPageChange(meta.page + 1)}
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default Pagination;
