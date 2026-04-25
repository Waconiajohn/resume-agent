import { useState, useCallback } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/api';
import type { CompanySummary, CompanyConnectionName } from '@/types/ni';

export interface CompanyPickerRowProps {
  company: CompanySummary;
  selected: boolean;
  disabled: boolean;
  atLimit: boolean;
  onToggle: (companyRaw: string) => void;
  accessToken: string | null;
}

export function CompanyPickerRow({
  company,
  selected,
  disabled,
  atLimit,
  onToggle,
  accessToken,
}: CompanyPickerRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [connections, setConnections] = useState<CompanyConnectionName[] | null>(null);
  const [loading, setLoading] = useState(false);

  const eligible = company.companyId !== null;
  const displayName = company.companyDisplayName ?? company.companyRaw;
  const canToggle = eligible && !disabled && (selected || !atLimit);

  const handleRowClick = useCallback(() => {
    if (!canToggle) return;
    onToggle(company.companyRaw);
  }, [canToggle, onToggle, company.companyRaw]);

  const handleRowKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    handleRowClick();
  }, [handleRowClick]);

  const handleBadgeClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);
    if (connections !== null) return;
    if (!accessToken) return;

    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/ni/connections/by-company?company_raw=${encodeURIComponent(company.companyRaw)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setConnections(
          ((data.connections ?? []) as Array<Record<string, unknown>>).map((c) => ({
            id: c.id as string,
            firstName: c.first_name as string,
            lastName: c.last_name as string,
            position: (c.position as string) ?? null,
            linkedinUrl: (c.linkedin_url as string) ?? null,
          })),
        );
      }
    } catch {
      // Silently fail — badge still shows count
    } finally {
      setLoading(false);
    }
  }, [expanded, connections, accessToken, company.companyRaw]);

  return (
    <div>
      <div
        role="button"
        tabIndex={canToggle ? 0 : -1}
        aria-label={`${selected ? 'Deselect' : 'Select'} ${displayName}`}
        aria-pressed={selected}
        aria-disabled={!canToggle}
        onClick={handleRowClick}
        onKeyDown={handleRowKeyDown}
        className={cn(
          'flex items-center gap-2.5 px-3 py-2 outline-none transition-[background-color,box-shadow,color]',
          selected && 'bg-[var(--link)]/10 shadow-[inset_3px_0_0_var(--link)] ring-1 ring-inset ring-[var(--link)]/35',
          canToggle
            ? 'cursor-pointer hover:bg-[var(--accent-muted)]/40 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]'
            : '',
          !eligible && 'opacity-40',
        )}
      >
        {/* Selection indicator */}
        <div className="shrink-0">
          {selected ? (
            <CheckCircle2 className="h-4 w-4 text-[var(--link)]" />
          ) : (
            <Circle className={cn('h-4 w-4', eligible ? 'text-[var(--text-soft)]' : 'text-[var(--text-soft)]/40')} />
          )}
        </div>

        {/* Company name */}
        <span className={cn(
          'min-w-0 flex-1 truncate text-sm',
          selected ? 'text-[var(--text-strong)]' : 'text-[var(--text-muted)]',
        )}>
          {displayName}
        </span>

        {selected && (
          <span className="shrink-0 rounded-full border border-[var(--link)]/35 bg-[var(--link)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--link)]">
            Selected
          </span>
        )}

        {/* Connection count badge — clickable */}
        <button
          type="button"
          onClick={handleBadgeClick}
          className={cn(
            'shrink-0 rounded-md px-2 py-0.5 text-[12px] font-semibold tabular-nums transition-colors',
            expanded
              ? 'bg-[var(--badge-blue-bg)] text-[var(--link)]/90'
              : 'bg-[var(--accent-muted)] text-[var(--text-soft)] hover:bg-[var(--badge-blue-bg)] hover:text-[var(--link)]/70',
          )}
        >
          {company.connectionCount}
        </button>
      </div>

      {/* Expanded connection names */}
      {expanded && (
        <div className="pb-1.5 pl-9 pr-3">
          {loading ? (
            <div className="space-y-1 py-1">
              {[1, 2].map((i) => (
                <div key={i} className="h-3.5 w-32 motion-safe:animate-pulse rounded bg-[var(--accent-muted)]" />
              ))}
            </div>
          ) : connections && connections.length > 0 ? (
            <ul className="space-y-0.5 py-0.5">
              {connections.map((conn) => {
                const linkedInUrl = conn.linkedinUrl
                  ?? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${conn.firstName} ${conn.lastName} ${company.companyDisplayName ?? company.companyRaw}`)}`;
                return (
                  <li key={conn.id} className="flex items-baseline gap-2 text-xs leading-tight">
                    <a
                      href={linkedInUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[var(--link)] hover:text-[var(--link-hover)] hover:underline"
                    >
                      {conn.firstName} {conn.lastName}
                    </a>
                    {conn.position && (
                      <span className="truncate text-[var(--text-muted)]">{conn.position}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-0.5 text-xs text-[var(--text-soft)]">No details available</p>
          )}
        </div>
      )}
    </div>
  );
}
