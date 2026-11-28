import { useEffect, useState } from 'react';
import { Bookmark, Copy, Pin, Star, Trash2 } from 'lucide-react';
import api, { getApiError } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

export default function SavedViewsBar({
  entityType = 'ticket',
  currentConfig,
  activeViewId,
  onApplyView,
}) {
  const { addToast } = useToast();
  const [views, setViews] = useState([]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const [isShared, setIsShared] = useState(false);

  const loadViews = async () => {
    try {
      const { data } = await api.get('/views', { params: { entityType } });
      setViews(data.data || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadViews();
  }, [entityType]);

  const handleSaveView = async (e) => {
    e.preventDefault();
    if (!viewName.trim()) return;
    try {
      const { data } = await api.post('/views', {
        name: viewName.trim(),
        entityType,
        viewMode: currentConfig.viewMode,
        isShared,
        isPinned: true,
        config: {
          groupBy: currentConfig.groupBy,
          sortBy: currentConfig.sortBy,
          sortOrder: currentConfig.sortOrder,
          filters: currentConfig.filters,
          hideEmptyColumns: currentConfig.hideEmptyColumns,
        },
      });
      addToast(`Saved view "${data.data.name}"`);
      setSaveModalOpen(false);
      setViewName('');
      loadViews();
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handleTogglePin = async (v, e) => {
    e.stopPropagation();
    try {
      await api.put(`/views/${v._id}`, { isPinned: !v.isPinned });
      loadViews();
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handleDuplicate = async (v, e) => {
    e.stopPropagation();
    try {
      await api.post(`/views/${v._id}/duplicate`);
      addToast('View duplicated');
      loadViews();
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handleDelete = async (v, e) => {
    e.stopPropagation();
    try {
      await api.delete(`/views/${v._id}`);
      addToast('View deleted');
      loadViews();
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {views.map((v) => {
        const active = activeViewId === v._id;
        return (
          <div
            key={v._id}
            onClick={() => onApplyView?.(v)}
            className={`group inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
              active
                ? 'border-[#171717] bg-[#C6F36B] text-[#171717] font-semibold'
                : 'border-[#E8E8E5] bg-white text-[#555555] hover:border-[#171717]/40 dark:border-[#2C2E33] dark:bg-[#17181B] dark:text-slate-300'
            }`}
          >
            {v.isPinned && <Pin className="h-3 w-3 text-[#35B8A6]" />}
            <span>{v.name}</span>
            {v.isDefault && <Star className="h-2.5 w-2.5 fill-current opacity-70" />}
            <div className="hidden group-hover:flex items-center gap-1 ml-1">
              <button onClick={(e) => handleTogglePin(v, e)} title="Pin/Unpin">
                <Pin className="h-3 w-3 opacity-70 hover:opacity-100" />
              </button>
              <button onClick={(e) => handleDuplicate(v, e)} title="Duplicate view">
                <Copy className="h-3 w-3 opacity-70 hover:opacity-100" />
              </button>
              <button onClick={(e) => handleDelete(v, e)} title="Delete view">
                <Trash2 className="h-3 w-3 text-[#F16D64]" />
              </button>
            </div>
          </div>
        );
      })}

      <button
        onClick={() => setSaveModalOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[#D8D8D3] px-2.5 py-1 text-xs text-[#777777] hover:border-[#171717] hover:text-[#171717] dark:border-[#2C2E33] dark:hover:text-white"
      >
        <Bookmark className="h-3 w-3" /> Save View
      </button>

      <Modal open={saveModalOpen} onClose={() => setSaveModalOpen(false)} title="Save Custom View" maxWidth="max-w-sm">
        <form onSubmit={handleSaveView} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium mb-1">View Name *</label>
            <input
              autoFocus
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              placeholder="e.g. Pilot Critical Triage"
              className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-sm dark:border-[#2C2E33] dark:bg-[#1E2025]"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} />
            <span>Share with team (Managers/Admins)</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setSaveModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save View</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
