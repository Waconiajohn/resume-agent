import { useState } from 'react';
import type { MouseEvent } from 'react';
import { GlassButton } from '@/components/GlassButton';
import { X, Trash2, Pencil, Check } from 'lucide-react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import type { WatchlistCompany } from '@/hooks/useWatchlist';

interface WatchlistManagerProps {
  open: boolean;
  companies: WatchlistCompany[];
  onClose: () => void;
  onAdd: (data: Partial<WatchlistCompany>) => void;
  onUpdate: (id: string, data: Partial<WatchlistCompany>) => void;
  onRemove: (id: string) => void;
}

const INPUT_CLASS =
  'w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-[13px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--link)]/30';

const LABEL_CLASS = 'text-[13px] text-[var(--text-soft)] uppercase tracking-wider mb-1 block';

export function WatchlistManager({
  open,
  companies,
  onClose,
  onAdd,
  onUpdate,
  onRemove,
}: WatchlistManagerProps) {
  const { dialogRef } = useDialogA11y(open, onClose);
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [website, setWebsite] = useState('');
  const [careersUrl, setCareersUrl] = useState('');
  const [priority, setPriority] = useState('3');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPriority, setEditPriority] = useState('');

  if (!open) return null;

  const canAdd = name.trim().length > 0;

  function handleAdd() {
    if (!canAdd) return;
    onAdd({
      name: name.trim(),
      industry: industry.trim() || null,
      website: website.trim() || null,
      careers_url: careersUrl.trim() || null,
      priority: parseInt(priority, 10) || 3,
      source: 'manual',
    });
    setName('');
    setIndustry('');
    setWebsite('');
    setCareersUrl('');
    setPriority('3');
  }

  function startEdit(company: WatchlistCompany) {
    setEditingId(company.id);
    setEditPriority(String(company.priority));
  }

  function commitEdit(id: string) {
    const p = parseInt(editPriority, 10);
    if (!isNaN(p)) {
      onUpdate(id, { priority: p });
    }
    setEditingId(null);
  }

  const sorted = [...companies].sort((a, b) => b.priority - a.priority);

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="watchlist-title" tabIndex={-1} className="relative w-full max-w-lg rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-1)] p-6 shadow-2xl max-h-[85vh] flex flex-col focus:outline-none">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors"
        >
          <X size={18} />
        </button>

        <h2 id="watchlist-title" className="text-[16px] font-semibold text-[var(--text-strong)] mb-5">Target Companies</h2>

        {/* Add form */}
        <div className="space-y-3 mb-5 pb-5 border-b border-[var(--line-soft)]">
          <h3 className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider">Add Company</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={LABEL_CLASS}>Company Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Corp"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Industry</label>
              <input
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g. SaaS"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Priority (1-5)</label>
              <input
                type="number"
                min="1"
                max="5"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Website</label>
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://..."
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Careers URL</label>
              <input
                value={careersUrl}
                onChange={(e) => setCareersUrl(e.target.value)}
                placeholder="https://.../careers"
                className={INPUT_CLASS}
              />
            </div>
          </div>
          <GlassButton onClick={handleAdd} disabled={!canAdd} className="w-full">
            Add Company
          </GlassButton>
        </div>

        {/* Company list */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {sorted.length === 0 ? (
            <p className="text-[12px] text-[var(--text-soft)] text-center py-6">
              No companies added yet. Add your first target company above.
            </p>
          ) : (
            sorted.map((company) => (
              <div
                key={company.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2.5"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[var(--text-muted)] truncate">
                    {company.name}
                  </div>
                  {company.industry && (
                    <div className="text-[13px] text-[var(--text-soft)] truncate">{company.industry}</div>
                  )}
                </div>

                {/* Priority edit */}
                {editingId === company.id ? (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value)}
                      className="w-12 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2 py-1 text-[12px] text-[var(--text-muted)] text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--link)]/30"
                    />
                    <button
                      type="button"
                      onClick={() => commitEdit(company.id)}
                      aria-label="Save"
                      className="text-[var(--badge-green-text)]/60 hover:text-[var(--badge-green-text)] transition-colors"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[13px] text-[var(--text-soft)] tabular-nums">
                      P{company.priority}
                    </span>
                    <button
                      type="button"
                      onClick={() => startEdit(company)}
                      aria-label="Edit"
                      className="text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors"
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onRemove(company.id)}
                  aria-label="Remove"
                  className="text-[var(--text-soft)] hover:text-[var(--badge-red-text)]/60 transition-colors flex-shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="mt-5 pt-4 border-t border-[var(--line-soft)]">
          <GlassButton onClick={onClose} className="w-full">
            Done
          </GlassButton>
        </div>
      </div>
    </div>
  );
}
