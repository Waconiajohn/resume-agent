import { useState, useEffect, useCallback, useRef } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/api';
import type { CompanySummary, TargetTitle } from '@/types/ni';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ScrapeStatus {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output_summary: {
    companies_scanned?: number;
    jobs_found?: number;
    matching_jobs?: number;
    referral_available?: number;
    error_count?: number;
  };
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

interface ScrapeResult {
  companiesScanned: number;
  jobsFound: number;
  matchingJobs: number;
  referralAvailable: number;
  errorCount: number;
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number;
  accent?: string;
  dim?: boolean;
}

function StatCard({ label, value, accent, dim }: StatCardProps) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-[var(--accent-muted)] px-4 py-3 text-center">
      <span
        className={cn('text-2xl font-bold tabular-nums', accent ?? (dim ? 'text-[var(--text-soft)]' : 'text-[var(--text-strong)]'))}
      >
        {value}
      </span>
      <span className="mt-0.5 text-[12px] font-medium uppercase tracking-wider text-[var(--text-soft)]">
        {label}
      </span>
    </div>
  );
}

// ─── Progress bar ──────────────────────────────────────────────────────────────

interface ProgressBarProps {
  scanned: number;
  total: number;
}

function ProgressBar({ scanned, total }: ProgressBarProps) {
  const pct = total > 0 ? Math.min(Math.round((scanned / total) * 100), 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-[var(--text-soft)]">
        <span>Scanning companies</span>
        <span className="tabular-nums">
          {scanned} / {total}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden bg-[var(--line-soft)]">
        <div
          className="h-full bg-[#afc4ff]/60 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export interface ScrapeJobsPanelProps {
  accessToken: string | null;
}

export function ScrapeJobsPanel({ accessToken }: ScrapeJobsPanelProps) {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [titles, setTitles] = useState<TargetTitle[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [scrapeLogId, setScrapeLogId] = useState<string | null>(null);
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Load companies + titles ───────────────────────────────────────────────

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;

    async function load() {
      try {
        const [companiesRes, titlesRes] = await Promise.all([
          fetch(`${API_BASE}/ni/connections/companies`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          fetch(`${API_BASE}/ni/target-titles`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
        ]);

        if (!cancelled) {
          if (companiesRes.ok) {
            const data = await companiesRes.json();
            setCompanies(data.companies ?? []);
          }
          if (titlesRes.ok) {
            const data = await titlesRes.json();
            setTitles(
              (data.titles ?? []).map((t: Record<string, unknown>) => ({
                id: t.id as string,
                title: t.title as string,
                priority: t.priority as number,
                createdAt: t.created_at as string,
              })),
            );
          }
        }
      } catch {
        // Silently fail — empty state shown below
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [accessToken]);

  // ─── Poll for scrape status ────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(async (logId: string) => {
    if (!accessToken) return;

    try {
      const res = await fetch(`${API_BASE}/ni/scrape/status/${logId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return;

      const data = await res.json();
      const log = data.log as ScrapeStatus;
      setScrapeStatus(log);

      if (log.status === 'completed') {
        stopPolling();
        setRunning(false);
        setResult({
          companiesScanned: log.output_summary.companies_scanned ?? 0,
          jobsFound: log.output_summary.jobs_found ?? 0,
          matchingJobs: log.output_summary.matching_jobs ?? 0,
          referralAvailable: log.output_summary.referral_available ?? 0,
          errorCount: log.output_summary.error_count ?? 0,
        });
      } else if (log.status === 'failed') {
        stopPolling();
        setRunning(false);
        setError(log.error_message ?? 'Scrape failed. Please try again.');
      }
    } catch {
      // Polling error — keep trying
    }
  }, [accessToken, stopPolling]);

  // Clean up polling on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  // ─── Start scrape ──────────────────────────────────────────────────────────

  const handleScan = useCallback(async () => {
    if (!accessToken) return;

    stopPolling();
    setError(null);
    setResult(null);
    setScrapeStatus(null);
    setScrapeLogId(null);
    setRunning(true);

    // Collect company IDs that have a known companyId
    const companyIds = companies
      .filter((c) => c.companyId !== null)
      .map((c) => c.companyId as string)
      .slice(0, 50);

    if (companyIds.length === 0) {
      setError('No companies with recognized IDs found. Import connections and wait for normalization to complete.');
      setRunning(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/ni/scrape/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          company_ids: companyIds,
          target_titles: titles.map((t) => t.title),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `Server error ${res.status}`);
      }

      const data = await res.json();
      const logId = data.scrape_log_id as string;
      setScrapeLogId(logId);

      // Start polling every 3 seconds
      void pollStatus(logId);
      pollRef.current = setInterval(() => void pollStatus(logId), 3_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start scan. Please try again.');
      setRunning(false);
    }
  }, [accessToken, companies, titles, pollStatus]);

  // ─── Derived state ─────────────────────────────────────────────────────────

  const eligibleCompanyCount = companies.filter((c) => c.companyId !== null).length;
  const currentScanned = scrapeStatus?.output_summary.companies_scanned ?? 0;

  // ─── Loading skeleton ──────────────────────────────────────────────────────

  if (loadingData) {
    return (
      <GlassCard className="rounded-xl p-6">
        <div className="space-y-4">
          <div className="h-5 w-40 motion-safe:animate-pulse rounded-lg bg-[var(--accent-muted)]" />
          <div className="h-3 w-72 motion-safe:animate-pulse rounded bg-[var(--accent-muted)]" />
          <div className="mt-4 h-10 w-36 motion-safe:animate-pulse rounded-xl bg-[var(--accent-muted)]" />
        </div>
      </GlassCard>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header card */}
      <GlassCard className="rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-[var(--text-strong)]">Scan for Job Openings</h3>
            <p className="text-sm text-[var(--text-soft)]">
              Search career pages at{' '}
              <span className="text-[var(--text-muted)]">{eligibleCompanyCount}</span>{' '}
              of your connected companies
              {titles.length > 0 && (
                <>
                  {' '}matching{' '}
                  <span className="text-[var(--text-muted)]">{titles.length}</span>{' '}
                  target title{titles.length !== 1 ? 's' : ''}
                </>
              )}
              .
            </p>

            {eligibleCompanyCount === 0 && !running && (
              <p className="mt-2 text-xs text-[#f0d99f]/70">
                Import LinkedIn connections first — companies need to be normalized before scanning.
              </p>
            )}
          </div>

          <GlassButton
            onClick={() => void handleScan()}
            disabled={running || eligibleCompanyCount === 0}
            loading={running}
            className="shrink-0"
          >
            {running ? 'Scanning...' : 'Scan for Jobs'}
          </GlassButton>
        </div>

        {/* Active progress */}
        {running && scrapeLogId && (
          <div className="mt-5 space-y-3">
            <ProgressBar scanned={currentScanned} total={eligibleCompanyCount} />

            {scrapeStatus && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatCard label="Scanned" value={scrapeStatus.output_summary.companies_scanned ?? 0} />
                <StatCard label="Jobs Found" value={scrapeStatus.output_summary.jobs_found ?? 0} />
                <StatCard
                  label="Matching"
                  value={scrapeStatus.output_summary.matching_jobs ?? 0}
                  accent="text-[#afc4ff]/90"
                />
                <StatCard
                  label="Referral"
                  value={scrapeStatus.output_summary.referral_available ?? 0}
                  accent="text-[#57CDA4]/90"
                />
              </div>
            )}

            {!scrapeStatus && (
              <p className="text-center text-xs text-[var(--text-soft)]">Starting scan...</p>
            )}
          </div>
        )}

        {/* Error state */}
        {error && !running && (
          <div className="mt-4 rounded-md border border-[#f87171]/20 bg-[#f87171]/5 px-4 py-3">
            <p className="text-sm text-[#f87171]/80">{error}</p>
          </div>
        )}
      </GlassCard>

      {/* Result summary card */}
      {result && !running && (
      <GlassCard className="rounded-xl p-6">
          <h4 className="mb-4 text-sm font-semibold text-[var(--text-muted)]">Scan Complete</h4>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Companies" value={result.companiesScanned} />
            <StatCard label="Jobs Found" value={result.jobsFound} />
            <StatCard
              label="Matching"
              value={result.matchingJobs}
              accent={result.matchingJobs > 0 ? 'text-[#afc4ff]/90' : undefined}
              dim={result.matchingJobs === 0}
            />
            <div className="flex flex-col items-center rounded-md border border-[#57CDA4]/20 bg-[#57CDA4]/10 px-4 py-3 text-center">
              <span
                className={cn(
                  'text-2xl font-bold tabular-nums',
                  result.referralAvailable > 0 ? 'text-[#57CDA4]' : 'text-[var(--text-soft)]',
                )}
              >
                {result.referralAvailable}
              </span>
              <span className="mt-0.5 text-[12px] font-medium uppercase tracking-wider text-[#57CDA4]/60">
                Referral
              </span>
            </div>
          </div>

          {result.matchingJobs > 0 ? (
            <p className="mt-4 text-center text-sm text-[var(--text-soft)]">
              Found{' '}
              <span className="font-medium text-[#afc4ff]/80">{result.matchingJobs}</span>{' '}
              matching job{result.matchingJobs !== 1 ? 's' : ''}.
              {result.referralAvailable > 0 && (
                <>
                  {' '}
                  <span className="font-medium text-[#57CDA4]">{result.referralAvailable}</span>{' '}
                  ha{result.referralAvailable !== 1 ? 've' : 's'} a referral bonus available.
                </>
              )}
              {' '}View results in the Job Matches tab.
            </p>
          ) : (
            <p className="mt-4 text-center text-sm text-[var(--text-soft)]">
              No matching jobs found this time. Try adjusting your target titles or scan again later.
            </p>
          )}

          {result.errorCount > 0 && (
            <p className="mt-2 text-center text-xs text-[var(--text-soft)]">
              {result.errorCount} compan{result.errorCount !== 1 ? 'ies' : 'y'} could not be reached.
            </p>
          )}

          <div className="mt-4 flex justify-center">
            <GlassButton
              variant="ghost"
              className="!px-4 !py-2 text-xs"
              onClick={() => void handleScan()}
              disabled={running}
            >
              Scan Again
            </GlassButton>
          </div>
        </GlassCard>
      )}

      {/* Target titles hint */}
      {titles.length === 0 && !running && (
        <GlassCard className="rounded-xl p-4">
          <p className="text-center text-xs text-[var(--text-soft)]">
            Add target titles in the Target Titles section to filter jobs by role.
            Without targets, all executive-level jobs found will be listed.
          </p>
        </GlassCard>
      )}
    </div>
  );
}
