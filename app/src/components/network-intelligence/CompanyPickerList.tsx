import { useState, useMemo } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { CompanyPickerRow } from './CompanyPickerRow';
import type { CompanySummary } from '@/types/ni';

export interface CompanyPickerListProps {
  companies: CompanySummary[];
  selectedRaws: Set<string>;
  selectedCount: number;
  maxSelection: number;
  isAtLimit: boolean;
  onToggle: (companyRaw: string) => void;
  onSelectAll: (filtered: CompanySummary[]) => void;
  onClear: () => void;
  accessToken: string | null;
  disabled?: boolean;
}

export function CompanyPickerList({
  companies,
  selectedRaws,
  selectedCount,
  maxSelection,
  isAtLimit,
  onToggle,
  onSelectAll,
  onClear,
  accessToken,
  disabled = false,
}: CompanyPickerListProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return companies;
    const q = search.toLowerCase();
    return companies.filter(
      (c) =>
        c.companyRaw.toLowerCase().includes(q) ||
        (c.companyDisplayName?.toLowerCase().includes(q) ?? false),
    );
  }, [companies, search]);

  return (
    <GlassCard className="rounded-[8px] p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-[var(--text-muted)]">Select Companies to Scan</h4>
        <div className="flex items-center gap-2 text-xs">
          <span className="tabular-nums text-[var(--text-soft)]">
            <span className="font-semibold text-[var(--text-muted)]">{selectedCount}</span>
            {' / '}
            {maxSelection}
          </span>
          <span className="text-[var(--line-soft)]">|</span>
          <button
            type="button"
            onClick={() => onSelectAll(filtered)}
            disabled={disabled}
            className="text-[var(--link)]/70 transition-colors hover:text-[var(--link)] disabled:opacity-40"
          >
            Top 50
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="text-[var(--text-soft)] transition-colors hover:text-[var(--text-muted)] disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search companies..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-2 w-full rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-1.5 text-xs text-[var(--text-muted)] placeholder:text-[var(--text-soft)] outline-none focus:border-[var(--line-strong)]"
      />

      {search && (
        <p className="mb-1 text-[11px] text-[var(--text-soft)]">
          {filtered.length} {filtered.length === 1 ? 'company' : 'companies'} matching &ldquo;{search}&rdquo;
        </p>
      )}

      {/* Company list */}
      <div className="max-h-[400px] overflow-y-auto rounded-lg border border-[var(--line-soft)]/50">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-[var(--text-soft)]">
            {search ? 'No companies match your search' : 'No companies available'}
          </p>
        ) : (
          <div className="divide-y divide-[var(--line-soft)]/30">
            {filtered.map((company) => (
              <CompanyPickerRow
                key={company.companyRaw}
                company={company}
                selected={selectedRaws.has(company.companyRaw)}
                disabled={disabled}
                atLimit={isAtLimit}
                onToggle={onToggle}
                accessToken={accessToken}
              />
            ))}
          </div>
        )}
      </div>

      {/* At-limit hint */}
      {isAtLimit && !disabled && (
        <p className="mt-2 text-center text-[11px] text-[var(--badge-amber-text)]/60">
          Maximum {maxSelection} companies per scan. Deselect one to add another.
        </p>
      )}
    </GlassCard>
  );
}
