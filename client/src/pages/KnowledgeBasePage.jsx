import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Search, BookOpen } from 'lucide-react';
import dayjs from 'dayjs';
import api, { getApiError } from '../services/api';
import { useToast } from '../context/ToastContext';
import { KB_CATEGORIES } from '../utils/constants';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Loader from '../components/ui/Loader';

export default function KnowledgeBasePage() {
  const { addToast } = useToast();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const { register, handleSubmit, reset } = useForm({
    defaultValues: { category: '4GL Scripting', sageX3Version: 'V12' },
  });

  const loadArticles = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/knowledge-base', {
        params: { search: search || undefined, category: category || undefined },
      });
      setArticles(data.data || []);
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadArticles();
  }, [search, category]);

  const onCreate = async (values) => {
    try {
      await api.post('/knowledge-base', {
        ...values,
        tags: values.tagsText ? values.tagsText.split(',').map((t) => t.trim()).filter(Boolean) : [],
      });
      addToast('Knowledge Base article published');
      setCreateOpen(false);
      reset({ category: '4GL Scripting', sageX3Version: 'V12' });
      loadArticles();
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sage X3 Knowledge Base"
        subtitle="Internal 4GL technical runbooks, integration recipes, and patch checklists"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New Article
          </Button>
        }
      />

      <Card padding={false} className="p-3.5">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search 4GL tips, MT940, REST API, Crystal Reports..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="">All Categories</option>
            {KB_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {loading ? (
        <Loader label="Loading knowledge base..." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {articles.map((a) => (
            <Card key={a._id}>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-blue-600">
                  <BookOpen className="h-3.5 w-3.5" /> {a.articleId}
                </span>
                <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium">
                  {a.category} · {a.sageX3Version}
                </span>
              </div>
              <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{a.title}</h3>
              {a.summary && <p className="mt-1 text-xs text-slate-500">{a.summary}</p>}
              <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line">
                {a.content}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                <div className="flex flex-wrap gap-1">
                  {(a.tags || []).map((t) => (
                    <span key={t} className="rounded bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 px-1.5 py-0.5">
                      #{t}
                    </span>
                  ))}
                </div>
                <span>
                  {a.author?.fullName} · {dayjs(a.updatedAt).format('DD MMM YYYY')}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Publish Knowledge Base Article">
        <form onSubmit={handleSubmit(onCreate)} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium mb-1">Title *</label>
            <input
              {...register('title', { required: true })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Category *</label>
              <select
                {...register('category')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                {KB_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Sage X3 Version</label>
              <input
                {...register('sageX3Version')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium mb-1">Summary</label>
            <input
              {...register('summary')}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Tags (comma-separated)</label>
            <input
              {...register('tagsText')}
              placeholder="4GL, MT940, Patching"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Technical Guide Content *</label>
            <textarea
              rows={5}
              {...register('content', { required: true, minLength: 10 })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Publish Article</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
