import { Search, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PipelineStage } from '@/hooks/useApplicationPipeline';

const FILTER_STAGES: { key: PipelineStage | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'saved', label: 'Saved' },
  { key: 'researching', label: 'Researching' },
  { key: 'applied', label: 'Applied' },
  { key: 'screening', label: 'Screening' },
  { key: 'interviewing', label: 'Interviewing' },
  { key: 'offer', label: 'Offer' },
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
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
        <input
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search applications..."
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] pl-9 pr-3 py-2 text-[13px] text-white/70 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30"
        />
      </div>

      {/* Stage filter pills */}
      <div className="flex items-center gap-1 flex-wrap">
        <Filter size={12} className="text-white/25 mr-1" />
        {FILTER_STAGES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onStageFilterChange(key)}
            className={cn(
              'rounded-md px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors',
              activeStageFilter === key
                ? 'bg-[#98b3ff]/15 text-[#98b3ff] font-medium'
                : 'text-white/35 hover:text-white/55 hover:bg-white/[0.04]',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
