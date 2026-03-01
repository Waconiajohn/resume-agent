import { useCallback, useEffect, useState } from 'react';
import { EvidenceItemCard } from '@/components/dashboard/EvidenceItemCard';
import type { MasterResume, MasterResumeEvidenceItem, MasterResumeListItem } from '@/types/resume';

type SourceFilter = 'all' | MasterResumeEvidenceItem['source'];

const SOURCE_FILTERS: Array<{ id: SourceFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'crafted', label: 'Crafted' },
  { id: 'upgraded', label: 'Upgraded' },
  { id: 'interview', label: 'Interview' },
];

interface EvidenceLibraryTabProps {
  resumes: MasterResumeListItem[];
  onGetDefaultResume: () => Promise<MasterResume | null>;
  onGetResumeById: (id: string) => Promise<MasterResume | null>;
  onUpdateMasterResume: (id: string, changes: Record<string, unknown>) => Promise<MasterResume | null>;
}

export function EvidenceLibraryTab({
  onGetDefaultResume,
  onUpdateMasterResume,
}: EvidenceLibraryTabProps) {
  const [resume, setResume] = useState<MasterResume | null>(null);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [searchText, setSearchText] = useState('');
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);

  const loadResume = useCallback(async () => {
    setLoading(true);
    try {
      const data = await onGetDefaultResume();
      setResume(data);
    } finally {
      setLoading(false);
    }
  }, [onGetDefaultResume]);

  useEffect(() => {
    void loadResume();
  }, [loadResume]);

  const handleDelete = async (index: number) => {
    if (!resume) return;
    if (!window.confirm('Delete this evidence item? This action cannot be undone.')) return;
    setDeletingIndex(index);
    try {
      const updatedItems = resume.evidence_items.filter((_, i) => i !== index);
      const updated = await onUpdateMasterResume(resume.id, { evidence_items: updatedItems });
      if (updated) {
        setResume(updated);
      }
    } finally {
      setDeletingIndex(null);
    }
  };

  const allItems = resume?.evidence_items ?? [];

  const filteredItems = allItems.filter((item) => {
    const matchesSource = sourceFilter === 'all' || item.source === sourceFilter;
    const matchesSearch = !searchText.trim() || item.text.toLowerCase().includes(searchText.toLowerCase());
    return matchesSource && matchesSearch;
  });

  return (
    <div>
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1">
          {SOURCE_FILTERS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSourceFilter(opt.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                sourceFilter === opt.id
                  ? 'bg-white/[0.1] text-white'
                  : 'text-white/50 hover:bg-white/[0.06] hover:text-white/80'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search evidence..."
          className="rounded-lg border border-white/[0.12] bg-white/[0.05] px-3 py-1.5 text-xs text-white/80 placeholder-white/30 outline-none focus:border-white/[0.22] sm:w-60"
        />
        {resume && (
          <span className="ml-auto text-xs text-white/40">
            {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-white/[0.04]" />
          ))}
        </div>
      ) : !resume ? (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-6 py-12 text-center">
          <p className="text-sm text-white/40">No master resume found.</p>
          <p className="mt-1 text-xs text-white/30">Complete a session to generate evidence items.</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-6 py-8 text-center">
          <p className="text-sm text-white/40">No evidence items match your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {filteredItems.map((item, i) => {
            const originalIndex = allItems.indexOf(item);
            return (
              <EvidenceItemCard
                key={`${originalIndex}-${item.text.slice(0, 20)}`}
                item={item}
                onDelete={deletingIndex === originalIndex ? undefined : () => void handleDelete(originalIndex)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
