import { useEffect, useState } from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';

export function Drawer({
  open,
  onClose,
  title,
  headerLeft,
  headerRight,
  children,
  width = 'max-w-3xl',
  expandable = true,
  onOpenFullPage,
}) {
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    if (!open) setFullScreen(false);
  }, [open]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[#171717]/35 backdrop-blur-[1px]">
      <div className="fixed inset-0" onClick={onClose} />
      <aside
        className={`relative z-10 flex h-full w-full flex-col bg-white shadow-2xl dark:bg-[#17181B] transition-all duration-300 ease-out ${
          fullScreen
            ? 'max-w-none border-l-0'
            : `${width} border-l border-[#E8E8E5] dark:border-[#26282D] animate-in slide-in-from-right`
        }`}
      >
        <div className="flex items-center justify-between gap-2 sm:gap-3 border-b border-[#E8E8E5] dark:border-[#26282D] px-3.5 py-3 sm:px-5 sm:py-3.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">{headerLeft || <span className="font-semibold text-sm">{title}</span>}</div>
          <div className="flex items-center gap-1.5 shrink-0">
            {headerRight}
            {expandable && (
              onOpenFullPage ? (
                <button
                  type="button"
                  onClick={onOpenFullPage}
                  title="Open full page"
                  className="rounded-lg p-1.5 text-[#777777] hover:bg-[#F4F4F2] hover:text-[#171717] dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setFullScreen((f) => !f)}
                  title={fullScreen ? 'Exit full screen' : 'Expand to full screen'}
                  className="rounded-lg p-1.5 text-[#777777] hover:bg-[#F4F4F2] hover:text-[#171717] dark:hover:bg-white/10 dark:hover:text-white"
                >
                  {fullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
              )
            )}
            <button
              onClick={onClose}
              title="Close (Esc)"
              className="rounded-lg p-1.5 text-[#777777] hover:bg-[#F4F4F2] hover:text-[#171717] dark:hover:bg-white/10 dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}

export default Drawer;
