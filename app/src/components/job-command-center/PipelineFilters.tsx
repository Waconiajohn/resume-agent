import { Search, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PipelineStage } from '@/hooks/useJobApplications';

const FILTER_STAGES: { key: PipelineStage | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'saved', label: 'Shortlist' },
  { key: 'researching', label: 'Researching' },
  { key: 'applied', label: 'Applied' },
  { key: 'screening', label: 'Screening' },
  { key: 'interviewing', label: 'Interviewing' },
  { key: 'offer', label: 'Offer' },
  { key: 'closed_won', label: 'Won' },
  { key: 'closed_lost', label: 'Lost' },
];

interface PipelineFiltersProps {
  searchText: string;
  onSearchChange: (text: string) => void;
  activeStageFilter: PipelineStage | 'all';
  onStageFilterChange: (stage: PipelineStage | 'all') => void;
}

export function PipelineFilters({
  searchText,
  onSearchChange,
  activeStageFilter,
  onStageFilterChange,
}: PipelineFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      {/* Search */}
      <div className="relative flex-1 min-w-0 w-full sm:max-w-[280px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-soft)]" />
        <input
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search applications..."
          className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] pl-9 pr-3 py-2 text-[13px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--link)]/30"
        />
      </div>

      {/* Stage filter pills */}
      <div className="flex items-center gap-1 flex-wrap">
        <Filter size={12} className="text-[var(--text-soft)] mr-1" />
        {FILTER_STAGES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onStageFilterChange(key)}
            aria-pressed={activeStageFilter === key}
            className={cn(
              'rounded-md px-2.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] transition-colors',
              activeStageFilter === key
                ? 'bg-[var(--link)]/15 text-[var(--link)] font-medium'
                : 'text-[var(--text-soft)] hover:text-[var(--text-muted)] hover:bg-[var(--accent-muted)]',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
