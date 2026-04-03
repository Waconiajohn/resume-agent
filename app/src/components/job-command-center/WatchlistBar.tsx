import { Building2, Plus } from 'lucide-react';
import type { WatchlistCompany } from '@/hooks/useWatchlist';

interface WatchlistBarProps {
  companies: WatchlistCompany[];
  onSearchCompany: (companyName: string) => void;
  onManage: () => void;
  description?: string;
}

export function WatchlistBar({
  companies,
  onSearchCompany,
  onManage,
  description,
}: WatchlistBarProps) {
  const topFive = [...companies]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13px] text-[var(--text-soft)] uppercase tracking-wider flex-shrink-0">
          Target Companies
        </span>

        {description && (
          <span className="text-[12px] text-[var(--text-soft)]">{description}</span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {topFive.length === 0 ? (
          <span className="text-[12px] text-[var(--text-soft)] italic">Add target companies to watch</span>
        ) : (
          topFive.map((company) => (
            <button
              key={company.id}
              type="button"
              onClick={() => onSearchCompany(company.name)}
              className="flex items-center gap-1.5 rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-1.5 text-[13px] font-medium text-[var(--text-soft)] transition-all hover:border-[var(--line-strong)] hover:bg-[var(--surface-1)] hover:text-[var(--text-muted)]"
            >
              <Building2 size={11} className="flex-shrink-0 text-[var(--link)]/60" />
              {company.name}
            </button>
          ))
        )}

        <button
          type="button"
          onClick={onManage}
          className="flex items-center gap-1 rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)] transition-all hover:bg-[var(--surface-1)] hover:text-[var(--text-muted)]"
          title="Manage watchlist"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}
