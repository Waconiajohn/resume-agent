import { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { cn } from '@/lib/utils';
import type { JobMatch, JobMatchStatus } from '@/types/ni';
import { API_BASE } from '@/lib/api';

export interface JobMatchesListProps {
  accessToken: string | null;
}

const STATUS_OPTIONS: JobMatchStatus[] = ['new', 'applied', 'referred', 'interviewing', 'rejected', 'archived'];

const STATUS_COLORS: Record<JobMatchStatus, string> = {
  new: 'bg-[#afc4ff]/20 text-[#afc4ff]/80',
  applied: 'bg-purple-400/20 text-purple-300/80',
  referred: 'bg-[#b5dec2]/20 text-[#b5dec2]/80',
  interviewing: 'bg-[#f0d99f]/20 text-[#f0d99f]/80',
  rejected: 'bg-[#f0b8b8]/20 text-[#f0b8b8]/80',
  archived: 'bg-[var(--accent-muted)] text-[var(--text-soft)]',
};

const SEARCH_CONTEXT_BADGES: Record<NonNullable<JobMatch['searchContext']>, string> = {
  network_connections: 'bg-[#afc4ff]/15 text-[#afc4ff]/80',
  bonus_search: 'bg-[#f0d99f]/15 text-[#f0d99f]/80',
};

const SEARCH_CONTEXT_LABELS: Record<NonNullable<JobMatch['searchContext']>, string> = {
  network_connections: 'Your Network',
  bonus_search: 'Bonus Search',
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
    title: m.title as string,
    url: (m.url as string) ?? null,
    location: (m.location as string) ?? null,
    salaryRange: (m.salary_range as string) ?? null,
    descriptionSnippet: (m.description_snippet as string) ?? null,
    matchScore: ((m.match_score as number | null) ?? (m.fit_score as number | null)) ?? null,
    referralAvailable: m.referral_available as boolean,
    connectionCount: m.connection_count as number,
    searchContext,
    status: m.status as JobMatchStatus,
    scrapedAt: (m.scraped_at as string) ?? null,
    createdAt: m.created_at as string,
  };
}

export function JobMatchesList({ accessToken }: JobMatchesListProps) {
  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(true);

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
  }, [accessToken]);

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
      <h3 className="text-sm font-semibold text-[var(--text-muted)]">Job Matches</h3>
      {matches.map((match) => (
        <GlassCard key={match.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h4 className="truncate text-sm font-medium text-[var(--text-strong)]">{match.title}</h4>
                {match.searchContext && (
                  <span className={cn(
                    'shrink-0 rounded-md px-2 py-1 text-[12px] font-semibold uppercase tracking-[0.12em]',
                    SEARCH_CONTEXT_BADGES[match.searchContext],
                  )}>
                    {SEARCH_CONTEXT_LABELS[match.searchContext]}
                  </span>
                )}
                {match.referralAvailable && (
                  <span className="shrink-0 rounded-md bg-[#b5dec2]/15 px-2 py-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#b5dec2]/80">
                    Referral
                  </span>
                )}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-soft)]">
                {match.location && <span>{match.location}</span>}
                {match.salaryRange && <span>{match.salaryRange}</span>}
                {match.connectionCount > 0 && (
                  <span>{match.connectionCount} connection{match.connectionCount !== 1 ? 's' : ''}</span>
                )}
              </div>

              {match.matchScore !== null && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1 flex-1 bg-[var(--line-soft)]">
                    <div
                      className="h-full bg-[#afc4ff]/60"
                      style={{ width: `${Math.min(match.matchScore, 100)}%` }}
                    />
                  </div>
                  <span className="text-[12px] text-[var(--text-soft)]">{match.matchScore}%</span>
                </div>
              )}
            </div>

            <select
              value={match.status}
              onChange={(e) => void handleStatusChange(match.id, e.target.value as JobMatchStatus)}
              className={cn(
                'shrink-0 rounded-md border-0 px-2 py-1 text-[12px] font-medium outline-none',
                STATUS_COLORS[match.status],
              )}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s} className="bg-gray-900 text-white">
                  {s}
                </option>
              ))}
            </select>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}
