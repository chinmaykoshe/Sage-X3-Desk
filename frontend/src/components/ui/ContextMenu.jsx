import { useEffect, useRef } from 'react';

export function ContextMenu({ open, position, onClose, items = [] }) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    const onEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open, onClose]);

  if (!open || !position) return null;

  const left = Math.min(position.x, window.innerWidth - 210);
  const top = Math.min(position.y, window.innerHeight - 280);

  return (
    <div
      ref={menuRef}
      style={{ top, left }}
      className="fixed z-50 w-52 rounded-xl border border-[#E8E8E5] bg-white p-1.5 shadow-xl dark:border-[#2C2E33] dark:bg-[#1C1D21]"
    >
      {items
        .filter((item) => !item.hidden)
        .map((item, idx) =>
          item.divider ? (
            <div key={`div-${idx}`} className="my-1 border-t border-[#E8E8E5] dark:border-[#2C2E33]" />
          ) : (
            <button
              key={item.label}
              onClick={(e) => {
                e.stopPropagation();
                item.onClick?.();
                onClose();
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                item.danger
                  ? 'text-[#F16D64] hover:bg-[#F16D64]/10'
                  : 'text-[#171717] hover:bg-[#F4F4F2] dark:text-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {item.icon && <item.icon className="h-3.5 w-3.5 shrink-0" />}
              <span className="flex-1 truncate">{item.label}</span>
            </button>
          )
        )}
    </div>
  );
}

export default ContextMenu;
