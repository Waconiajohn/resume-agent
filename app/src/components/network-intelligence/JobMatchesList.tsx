import { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';
import type { JobMatch, JobMatchSearchContext, JobMatchStatus } from '@/types/ni';
import type { WorkModes } from '@/hooks/useJobFilters';
import { API_BASE } from '@/lib/api';

type MatchFilter = 'all' | JobMatchSearchContext | 'referral_bonus';

function formatAge(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const ms = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

export interface JobMatchesListProps {
  accessToken: string | null;
  initialFilter?: MatchFilter;
  title?: string;
  description?: string;
  onApplyWithResume?: (jobUrl: string) => void;
  /** Increment this key to trigger a re-fetch of matches (e.g. after a scan completes) */
  refreshKey?: number;
  /** When provided, applies client-side work mode filtering to results */
  workModes?: WorkModes;
}

const STATUS_OPTIONS: JobMatchStatus[] = ['new', 'applied', 'referred', 'interviewing', 'rejected', 'archived'];

const STATUS_COLORS: Record<JobMatchStatus, string> = {
  new: 'bg-[var(--badge-blue-bg)] text-[var(--badge-blue-text)]',
  applied: 'bg-[var(--badge-purple-bg)] text-[var(--badge-purple-text)]',
  referred: 'bg-[var(--badge-green-bg)] text-[var(--badge-green-text)]',
  interviewing: 'bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)]',
  rejected: 'bg-[var(--badge-red-bg)] text-[var(--badge-red-text)]',
  archived: 'bg-[var(--accent-muted)] text-[var(--text-soft)]',
};

const SEARCH_CONTEXT_BADGES: Record<NonNullable<JobMatch['searchContext']>, string> = {
  network_connections: 'bg-[var(--badge-blue-bg)] text-[var(--badge-blue-text)]',
  bonus_search: 'bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)]',
};

const SEARCH_CONTEXT_LABELS: Record<NonNullable<JobMatch['searchContext']>, string> = {
  network_connections: 'Your Network',
  bonus_search: 'Bonus Search',
};

const FILTER_LABELS: Record<MatchFilter, string> = {
  all: 'All Matches',
  network_connections: 'Your Network',
  bonus_search: 'Bonus Search',
  referral_bonus: 'Referral Bonus',
};

const SOURCE_LABELS: Record<string, string> = {
  lever: 'Lever',
  greenhouse: 'Greenhouse',
  workday: 'Workday',
  ashby: 'Ashby',
  icims: 'iCIMS',
  recruitee: 'Recruitee',
  workable: 'Workable',
  personio: 'Personio',
  jsonld: 'Career Page',
  serper: 'Google Jobs',
};

function mapJobMatch(m: Record<string, unknown>): JobMatch {
  const metadata = (m.metadata as Record<string, unknown> | null) ?? {};
  const rawSearchContext = metadata.search_context;
  const searchContext =
    rawSearchContext === 'network_connections' || rawSearchContext === 'bonus_search'
      ? rawSearchContext
      : null;

  return {
    id: m.id as string,
    companyId: m.company_id as string,
    companyName: (m.company_name as string) ?? null,
    title: m.title as string,
    url: (m.url as string) ?? null,
    location: (m.location as string) ?? null,
    salaryRange: (m.salary_range as string) ?? null,
    descriptionSnippet: (m.description_snippet as string) ?? null,
    matchScore: ((m.match_score as number | null) ?? (m.fit_score as number | null)) ?? null,
    referralAvailable: m.referral_available as boolean,
    connectionCount: m.connection_count as number,
    searchContext,
    source: (metadata.source as string) ?? null,
    remoteType: (metadata.remote_type as string) ?? null,
    status: m.status as JobMatchStatus,
    postedOn: (m.posted_on as string) ?? null,
    scrapedAt: (m.scraped_at as string) ?? null,
    createdAt: m.created_at as string,
  };
}

export function JobMatchesList({
  accessToken,
  initialFilter = 'all',
  title = 'Job Matches',
  description = 'Review one combined result stream, then narrow it by source or by known referral bonus.',
  onApplyWithResume,
  refreshKey,
  workModes,
}: JobMatchesListProps) {
  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<MatchFilter>(initialFilter);

  useEffect(() => {
    setActiveFilter(initialFilter);
  }, [initialFilter]);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${API_BASE}/ni/matches`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setMatches((data.matches ?? []).map((m: Record<string, unknown>) => mapJobMatch(m)));
        }
      } catch {
        // Silently fail — empty state will show
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [accessToken, refreshKey]);

  const filteredMatches = matches.filter((match) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'referral_bonus') return match.referralAvailable;
    return match.searchContext === activeFilter;
  }).filter((match) => {
    if (!workModes) return true;
    // If all modes are off, show everything (no meaningful filter)
    const anyActive = workModes.remote || workModes.hybrid || workModes.onsite;
    if (!anyActive) return true;
    const rt = (match.remoteType ?? '').toLowerCase();
    if (workModes.remote && rt === 'remote') return true;
    if (workModes.hybrid && rt === 'hybrid') return true;
    if (workModes.onsite && (rt === 'onsite' || rt === 'on-site' || rt === 'in-person')) return true;
    // Jobs with no remote_type pass through when at least one non-all filter is active
    if (!rt) return true;
    return false;
  });

  const filterCounts: Record<MatchFilter, number> = {
    all: matches.length,
    network_connections: matches.filter((match) => match.searchContext === 'network_connections').length,
    bonus_search: matches.filter((match) => match.searchContext === 'bonus_search').length,
    referral_bonus: matches.filter((match) => match.referralAvailable).length,
  };

  const handleStatusChange = useCallback(async (matchId: string, status: JobMatchStatus) => {
    if (!accessToken) return;

    // Optimistic update
    setMatches((prev) => prev.map((m) => m.id === matchId ? { ...m, status } : m));

    try {
      const res = await fetch(`${API_BASE}/ni/matches/${matchId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        // Revert on failure — refetch
        const refetch = await fetch(`${API_BASE}/ni/matches`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (refetch.ok) {
          const data = await refetch.json();
          setMatches((data.matches ?? []).map((m: Record<string, unknown>) => mapJobMatch(m)));
        }
      }
    } catch {
      // Network error — state may be stale
    }
  }, [accessToken]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 motion-safe:animate-pulse rounded-[18px] bg-[var(--accent-muted)]" />
        ))}
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--line-soft)] p-8 text-center">
        <p className="text-sm text-[var(--text-soft)]">
          No job matches yet — matches appear as we find openings from your network companies and bonus-company scans
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-muted)]">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-soft)]">
            {description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'network_connections', 'bonus_search', 'referral_bonus'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setActiveFilter(filter)}
              className={cn(
                'rounded-md border px-2.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] transition-colors',
                activeFilter === filter
                  ? 'border-[var(--link)]/20 bg-[var(--badge-blue-bg)] text-[var(--link)]/80'
                  : 'border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)] hover:text-[var(--text-muted)] hover:bg-[var(--surface-1)]',
              )}
            >
              {FILTER_LABELS[filter]} ({filterCounts[filter]})
            </button>
          ))}
        </div>
      </div>

      {filteredMatches.length === 0 && (
        <div className="rounded-xl border border-[var(--line-soft)] p-6 text-center">
          <p className="text-sm text-[var(--text-soft)]">
            No matches in <span className="text-[var(--text-muted)]">{FILTER_LABELS[activeFilter]}</span> yet.
          </p>
        </div>
      )}

      {filteredMatches.map((match) => (
        <GlassCard key={match.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {match.url ? (
                  <a
                    href={match.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-sm font-medium text-[var(--link)] hover:text-[var(--link-hover)] hover:underline"
                  >
                    {match.title}
                  </a>
                ) : (
                  <h4 className="truncate text-sm font-medium text-[var(--text-strong)]">{match.title}</h4>
                )}
                {match.searchContext && (
                  <span className={cn(
                    'shrink-0 rounded-md px-2 py-1 text-[12px] font-semibold uppercase tracking-[0.12em]',
                    SEARCH_CONTEXT_BADGES[match.searchContext],
                  )}>
                    {SEARCH_CONTEXT_LABELS[match.searchContext]}
                  </span>
                )}
                {match.referralAvailable && (
                  <span className="shrink-0 rounded-md bg-[var(--badge-green-bg)] px-2 py-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--badge-green-text)]/80">
                    Referral
                  </span>
                )}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-[var(--text-soft)]">
                {match.companyName && (
                  <span className="text-[var(--text-muted)]">{match.companyName}</span>
                )}
                {match.companyName && (match.location || formatAge(match.postedOn) || formatAge(match.scrapedAt)) && (
                  <span className="text-[var(--line-strong)]">&middot;</span>
                )}
                {match.location && <span>{match.location}</span>}
                {match.location && (formatAge(match.postedOn) || formatAge(match.scrapedAt)) && (
                  <span className="text-[var(--line-strong)]">&middot;</span>
                )}
                {formatAge(match.postedOn) ? (
                  <span>Posted {formatAge(match.postedOn)}</span>
                ) : formatAge(match.scrapedAt) ? (
                  <span>Found {formatAge(match.scrapedAt)}</span>
                ) : null}
                {match.salaryRange && (
                  <>
                    <span className="text-[var(--line-strong)]">&middot;</span>
                    <span>{match.salaryRange}</span>
                  </>
                )}
                {match.connectionCount > 0 && (
                  <>
                    <span className="text-[var(--line-strong)]">&middot;</span>
                    <span>{match.connectionCount} connection{match.connectionCount !== 1 ? 's' : ''}</span>
                  </>
                )}
                {match.source && SOURCE_LABELS[match.source] && (
                  <>
                    <span className="text-[var(--line-strong)]">&middot;</span>
                    <span>via {SOURCE_LABELS[match.source]}</span>
                  </>
                )}
              </div>

              {match.matchScore !== null && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1 flex-1 bg-[var(--line-soft)]">
                    <div
                      className="h-full bg-[var(--bar-fill)]"
                      style={{ width: `${Math.min(match.matchScore, 100)}%` }}
                    />
                  </div>
                  <span className="text-[12px] text-[var(--text-soft)]">{match.matchScore}% title match</span>
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              <select
                value={match.status}
                onChange={(e) => void handleStatusChange(match.id, e.target.value as JobMatchStatus)}
                className={cn(
                  'rounded-md border-0 px-2 py-1 text-[12px] font-medium outline-none',
                  STATUS_COLORS[match.status],
                )}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s} className="bg-[var(--surface-0)] text-[var(--text-strong)]">
                    {s}
                  </option>
                ))}
              </select>
              {match.url && onApplyWithResume && (
                <GlassButton
                  variant="ghost"
                  className="!px-3 !py-1.5 text-[11px]"
                  onClick={() => onApplyWithResume(match.url!)}
                >
                  Tailor Resume
                </GlassButton>
              )}
            </div>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}
