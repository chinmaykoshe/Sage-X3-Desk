import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Upload,
  FileText,
  Trash2,
  Plus,
  Send,
  AlertTriangle,
  CheckCircle2,
  X,
} from 'lucide-react';
import api, { getApiError } from '../services/api';
import { useWorkspace } from '../context/WorkspaceContext';
import { useToast } from '../context/ToastContext';
import { TICKET_CATEGORIES, PRIORITIES, SEVERITIES, DEPLOYMENT_ENVIRONMENTS } from '../utils/constants';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';

export default function SmartIntakePage() {
  const { clients, openQuickTicket } = useWorkspace();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [sourceType, setSourceType] = useState('screenshot');
  const [sourceText, setSourceText] = useState('');
  const [userView, setUserView] = useState('');
  const [selectedClientOverride, setSelectedClientOverride] = useState('');
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [processing, setProcessing] = useState(false);

  const [draft, setDraft] = useState(null);
  const [descriptionLength, setDescriptionLength] = useState('medium');
  const [editClientId, setEditClientId] = useState('');
  const [editFields, setEditFields] = useState(null);
  const [editTasks, setEditTasks] = useState([]);
  const [savingDraft, setSavingDraft] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(true);

  useEffect(() => {
    api
      .get('/ai/status')
      .then((res) => setAiAvailable(Boolean(res.data.data?.available && res.data.data?.modelReady)))
      .catch(() => setAiAvailable(false));
  }, []);

  useEffect(() => {
    const urls = files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) }));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u.url));
  }, [files]);

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith('image/'));
    if (dropped.length > 0) setFiles((prev) => [...prev, ...dropped]);
  };

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!sourceText.trim() && !userView.trim() && files.length === 0) {
      addToast('Upload a screenshot or enter an issue description / user view first.', 'error');
      return;
    }
    setProcessing(true);
    try {
      const fd = new FormData();
      fd.append('sourceType', files.length > 0 ? 'screenshot' : sourceType);
      fd.append('sourceText', sourceText);
      if (userView.trim()) fd.append('userView', userView.trim());
      if (selectedClientOverride) fd.append('clientId', selectedClientOverride);
      files.forEach((f) => fd.append('files', f));

      const { data } = await api.post('/ai/intake', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000, // Allow up to 10 min for local OCR + Ollama inference
      });

      const d = data.data;
      const fields = { ...(d.generatedFields || {}) };
      const lengthMap = {
        short: fields.shortDescription,
        medium: fields.mediumDescription,
        long: fields.longDescription,
      };
      if (lengthMap[descriptionLength]) {
        fields.description = lengthMap[descriptionLength];
      }
      setDraft(d);
      setEditClientId(d.clientId?._id || '');
      setEditFields(fields);
      setEditTasks(d.suggestedTasks || []);
      addToast(`Draft ${d.draftId} generated`);
    } catch (err) {
      addToast(getApiError(err, 'Failed to process intake'), 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmitForApproval = async () => {
    if (!draft) return;
    if (!editClientId) {
      addToast('Please select a verified client before submitting for TL approval.', 'error');
      return;
    }
    setSavingDraft(true);
    try {
      await api.put(`/ai/drafts/${draft._id}`, {
        clientId: editClientId,
        generatedFields: editFields,
        suggestedTasks: editTasks,
        resubmit: true,
      });
      addToast(`Draft ${draft.draftId} submitted to Pending TL Approval`);
      navigate('/approvals');
    } catch (err) {
      addToast(getApiError(err), 'error');
    } finally {
      setSavingDraft(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Smart Ticket Intake (X3 AI + Local OCR)"
        subtitle="Drop Sage X3 error screenshots or paste client emails — X3 AI extracts text locally, identifies the client, and prepares a ticket draft for TL approval"
        actions={
          <Button variant="secondary" onClick={() => openQuickTicket()}>
            Manual Ticket Fallback
          </Button>
        }
      />

      {!aiAvailable && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              X3 AI is not available for now. Please try again after a while — deterministic OCR &amp; Manual Ticket Fallback remain available.
            </span>
          </div>
          <Button size="xs" variant="secondary" onClick={() => openQuickTicket()}>
            Create Manually
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT SIDE: Source Upload, Images & OCR Text */}
        <div className="space-y-4">
          <Card>
            <form onSubmit={handleAnalyze} className="space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">1. Input Source</span>
                <select
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value)}
                  className="rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-1 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
                >
                  <option value="screenshot">Screenshot / Image</option>
                  <option value="email">Copied Email</option>
                  <option value="text">Text Description</option>
                </select>
              </div>

              {/* Drag-and-Drop Dropzone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="rounded-xl border-2 border-dashed border-[#D8D8D3] dark:border-[#2C2E33] bg-[#F4F4F2]/50 dark:bg-white/[0.02] p-5 text-center"
              >
                <Upload className="mx-auto h-6 w-6 text-[#777777] mb-2" />
                <div className="font-medium">Drag & drop Sage X3 error screenshots here</div>
                <p className="text-[11px] text-[#777777] mt-0.5">
                  Processed 100% locally via Tesseract OCR & Ollama (qwen2.5-coder:1.5b)
                </p>
                <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#171717] px-3 py-1.5 text-xs font-medium text-[#C6F36B]">
                  Choose Image(s)
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files || [])])}
                  />
                </label>
              </div>

              {previews.length > 0 && (
                <div className="grid grid-cols-2 gap-2.5">
                  {previews.map((p, i) => (
                    <div key={i} className="relative rounded-lg border border-[#E8E8E5] dark:border-[#2C2E33] overflow-hidden">
                      <img src={p.url} alt={p.name} className="h-28 w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 rounded-full bg-[#171717]/80 p-1 text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <div className="px-2 py-1 text-[10px] truncate bg-white dark:bg-[#17181B]">{p.name}</div>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="block font-medium mb-1">Client Hint (Optional — AI also auto-detects)</label>
                <select
                  value={selectedClientOverride}
                  onChange={(e) => setSelectedClientOverride(e.target.value)}
                  className="w-full rounded-lg border border-[#E8E8E5] bg-white px-3 py-2 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
                >
                  <option value="">Auto-detect from text / screenshot</option>
                  {clients.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.companyName} ({c.clientFolderCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium mb-1">Email / Issue Description</label>
                <textarea
                  rows={4}
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  placeholder="Paste email thread or raw issue details here..."
                  className="w-full rounded-lg border border-[#E8E8E5] bg-white px-3 py-2 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
                />
              </div>

              <div>
                <label className="block font-medium mb-1">
                  User&apos;s View / Actual Job <span className="text-[10px] font-normal text-[#777777]">(used by AI with image + issue desc)</span>
                </label>
                <textarea
                  rows={3}
                  value={userView}
                  onChange={(e) => setUserView(e.target.value)}
                  placeholder="Describe in your own words what the actual job is, what needs to be done, or what the screenshot/email is about..."
                  className="w-full rounded-lg border border-[#E8E8E5] bg-white px-3 py-2 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
                />
              </div>

              <div>
                <label className="block font-medium mb-1">Description Output Length</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'short', label: 'Short', hint: '1–2 lines' },
                    { id: 'medium', label: 'Medium', hint: '1 paragraph' },
                    { id: 'long', label: 'Long', hint: 'Detailed' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDescriptionLength(opt.id)}
                      className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${
                        descriptionLength === opt.id
                          ? 'border-[#171717] bg-[#C6F36B] text-[#171717]'
                          : 'border-[#E8E8E5] bg-white text-[#555555] hover:bg-[#F4F4F2] dark:border-[#2C2E33] dark:bg-[#1E2025] dark:text-slate-300'
                      }`}
                    >
                      <div className="text-xs font-semibold">{opt.label}</div>
                      <div className="text-[10px] opacity-75">{opt.hint}</div>
                    </button>
                  ))}
                </div>
              </div>

              <Button type="submit" disabled={processing} className="w-full">
                <Sparkles className="h-4 w-4" />
                {processing ? 'Running Local OCR & Qwen2.5-Coder Analysis...' : 'Analyze & Prepare Ticket Draft'}
              </Button>
            </form>
          </Card>

          {draft?.extractedText && (
            <Card>
              <div className="flex items-center gap-2 text-xs font-semibold mb-2">
                <FileText className="h-4 w-4 text-[#35B8A6]" /> Local OCR Extracted Text
              </div>
              <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[#F4F4F2] dark:bg-black/30 p-3 font-mono text-[11px]">
                {draft.extractedText}
              </pre>
            </Card>
          )}
        </div>

        {/* RIGHT SIDE: Editable AI-Generated Ticket Preview */}
        <Card>
          {!draft || !editFields ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Sparkles className="h-8 w-8 text-[#777777] mb-3" />
              <h3 className="text-sm font-semibold">AI Ticket Draft Preview</h3>
              <p className="mt-1 max-w-sm text-xs text-[#777777]">
                Upload a screenshot or describe an issue on the left to generate a structured Sage X3 draft and suggested subtasks for Team Lead review.
              </p>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-[#E8E8E5] dark:border-[#26282D] pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[#638BEF]">{draft.draftId}</span>
                    <Badge value={draft.aiProcessingStatus === 'Needs Clarification' ? 'Pending' : 'Completed'}>
                      {draft.aiProcessingStatus}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-[#777777] mt-0.5">
                    Review and edit generated fields before submitting to TL Approval
                  </div>
                </div>
              </div>

              {!editClientId && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-amber-900 dark:text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">Client Confirmation Required</div>
                    <div>Please select the verified Sage X3 client below.</div>
                    {(draft.candidateClients || []).length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {draft.candidateClients.map((cand) => (
                          <button
                            key={cand.client}
                            type="button"
                            onClick={() => setEditClientId(cand.client)}
                            className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-[#171717] border"
                          >
                            Use {cand.companyName} ({cand.folderCode})
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-medium mb-1">Verified Client *</label>
                  <select
                    value={editClientId}
                    onChange={(e) => setEditClientId(e.target.value)}
                    className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
                  >
                    <option value="">Select client...</option>
                    {clients.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.companyName} ({c.clientFolderCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-medium mb-1">Ticket Title *</label>
                  <input
                    value={editFields.title || ''}
                    onChange={(e) => setEditFields({ ...editFields, title: e.target.value })}
                    className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
                  />
                </div>

                <div>
                  <label className="block font-medium mb-1">Category</label>
                  <select
                    value={editFields.category || 'Support Request'}
                    onChange={(e) => setEditFields({ ...editFields, category: e.target.value })}
                    className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
                  >
                    {TICKET_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium mb-1">Priority</label>
                    <select
                      value={editFields.priority || 'Medium'}
                      onChange={(e) => setEditFields({ ...editFields, priority: e.target.value })}
                      className="w-full rounded-lg border border-[#E8E8E5] px-2 py-2 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Severity</label>
                    <select
                      value={editFields.severity || 'Minor'}
                      onChange={(e) => setEditFields({ ...editFields, severity: e.target.value })}
                      className="w-full rounded-lg border border-[#E8E8E5] px-2 py-2 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
                    >
                      {SEVERITIES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-medium mb-1">Environment</label>
                  <select
                    value={editFields.environment || 'Pilot'}
                    onChange={(e) => setEditFields({ ...editFields, environment: e.target.value })}
                    className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
                  >
                    {[...DEPLOYMENT_ENVIRONMENTS, 'Unknown'].map((env) => (
                      <option key={env} value={env}>{env}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium mb-1">Folder Code</label>
                  <input
                    value={editFields.folderCode || ''}
                    onChange={(e) => setEditFields({ ...editFields, folderCode: e.target.value })}
                    className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-xs font-mono uppercase dark:border-[#2C2E33] dark:bg-[#1E2025]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <label className="block font-medium">Structured Description</label>
                    <div className="inline-flex rounded-lg border border-[#E8E8E5] dark:border-[#2C2E33] p-0.5 bg-[#F4F4F2]/70 dark:bg-[#141518]">
                      {[
                        { id: 'short', label: 'Short', key: 'shortDescription' },
                        { id: 'medium', label: 'Medium', key: 'mediumDescription' },
                        { id: 'long', label: 'Long', key: 'longDescription' },
                      ].map((opt) => {
                        const variantText = editFields[opt.key];
                        const isActive =
                          variantText && editFields.description === variantText;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={!variantText}
                            onClick={() =>
                              setEditFields({ ...editFields, description: variantText })
                            }
                            className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                              isActive
                                ? 'bg-[#171717] text-[#C6F36B] dark:bg-[#C6F36B] dark:text-[#171717]'
                                : 'text-[#555555] hover:text-[#171717] dark:text-slate-300 disabled:opacity-40'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <textarea
                    rows={4}
                    value={editFields.description || ''}
                    onChange={(e) => setEditFields({ ...editFields, description: e.target.value })}
                    className="w-full rounded-lg border border-[#E8E8E5] px-3 py-2 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
                  />
                </div>
              </div>

              {/* Suggested Subtasks */}
              <div className="border-t border-[#E8E8E5] dark:border-[#26282D] pt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">AI-Suggested Tasks ({editTasks.length})</span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditTasks((prev) => [
                        ...prev,
                        { title: 'New task', priority: 'Medium', estimatedHours: 2, accepted: true },
                      ])
                    }
                    className="inline-flex items-center gap-1 text-[#638BEF] hover:underline"
                  >
                    <Plus className="h-3 w-3" /> Add Task
                  </button>
                </div>
                <div className="space-y-2">
                  {editTasks.map((t, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={t.accepted !== false}
                        onChange={(e) =>
                          setEditTasks((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, accepted: e.target.checked } : x))
                          )
                        }
                      />
                      <input
                        value={t.title}
                        onChange={(e) =>
                          setEditTasks((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x))
                          )
                        }
                        className="flex-1 rounded-md border border-[#E8E8E5] px-2 py-1 text-xs dark:border-[#2C2E33] dark:bg-[#1E2025]"
                      />
                      <button
                        type="button"
                        onClick={() => setEditTasks((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-[#777777] hover:text-[#F16D64]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                type="button"
                variant="accent"
                onClick={handleSubmitForApproval}
                disabled={savingDraft}
                className="w-full"
              >
                <CheckCircle2 className="h-4 w-4" />
                {savingDraft ? 'Submitting...' : 'Submit for TL Approval'}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
