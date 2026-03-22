import { Building2, Plus } from 'lucide-react';
import type { WatchlistCompany } from '@/hooks/useWatchlist';

interface WatchlistBarProps {
  companies: WatchlistCompany[];
  onSearchCompany: (companyName: string) => void;
  onManage: () => void;
}

export function WatchlistBar({ companies, onSearchCompany, onManage }: WatchlistBarProps) {
  const topFive = [...companies]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] text-white/30 uppercase tracking-wider flex-shrink-0">
        Target Companies
      </span>

      {topFive.length === 0 ? (
        <span className="text-[12px] text-white/25 italic">Add target companies to watch</span>
      ) : (
        topFive.map((company) => (
          <button
            key={company.id}
            type="button"
            onClick={() => onSearchCompany(company.name)}
            className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-white/55 transition-all hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white/80"
          >
            <Building2 size={11} className="flex-shrink-0 text-[#98b3ff]/60" />
            {company.name}
          </button>
        ))
      )}

      <button
        type="button"
        onClick={onManage}
        className="flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35 transition-all hover:bg-white/[0.04] hover:text-white/55"
        title="Manage watchlist"
      >
        <Plus size={12} />
      </button>
    </div>
  );
}
