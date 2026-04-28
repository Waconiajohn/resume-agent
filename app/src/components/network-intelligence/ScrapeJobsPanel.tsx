import { useState, useEffect, useCallback, useRef } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/api';
import type { CompanySummary, TargetTitle } from '@/types/ni';
import { useNiScrapeRunner } from './useNiScrapeRunner';
import { useCompanySelection } from './useCompanySelection';
import { CompanyPickerList } from './CompanyPickerList';
import { JobFilterPanel } from '@/components/shared/JobFilterPanel';

import { useJobFilters, type WorkModeKey } from '@/hooks/useJobFilters';

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
          className="h-full bg-[var(--link)]/60 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export interface ScrapeJobsPanelProps {
  accessToken: string | null;
  onViewMatches?: () => void;
  /** Called once when a scan result first appears (i.e. the scan just completed) */
  onScanComplete?: () => void;
}

export function ScrapeJobsPanel({ accessToken, onViewMatches, onScanComplete }: ScrapeJobsPanelProps) {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [titles, setTitles] = useState<TargetTitle[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const mountedRef = useRef(true);
  const {
    scrapeLogId,
    scrapeStatus,
    running,
    result,
    error,
    currentScanned,
    startScan,
    cancel,
  } = useNiScrapeRunner(accessToken);

  const selection = useCompanySelection(companies);
  const { filters, setLocation, setRadiusMiles, setWorkModes, setPostedWithin } = useJobFilters('ni-job-filters');

  useEffect(() => {
    const enabledModes = (Object.entries(filters.workModes) as Array<[WorkModeKey, boolean]>)
      .filter(([, enabled]) => enabled)
      .map(([mode]) => mode);
    if (enabledModes.length === 1) return;

    const fallbackMode: WorkModeKey = filters.location.trim() ? 'hybrid' : 'remote';
    setWorkModes({
      remote: fallbackMode === 'remote',
      hybrid: fallbackMode === 'hybrid',
      onsite: false,
    });
  }, [filters.location, filters.workModes, setWorkModes]);

  // ─── Load companies + titles ───────────────────────────────────────────────

  const loadPanelData = useCallback(async (options?: { silent?: boolean }) => {
    if (!accessToken) {
      if (!options?.silent && mountedRef.current) setLoadingData(false);
      return;
    }

    if (!options?.silent && mountedRef.current) {
      setLoadingData(true);
    }

    try {
      const [companiesRes, titlesRes] = await Promise.all([
        fetch(`${API_BASE}/ni/connections/companies`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch(`${API_BASE}/ni/target-titles`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);

      if (!mountedRef.current) return;

      if (companiesRes.ok) {
        const data = await companiesRes.json();
        if (mountedRef.current) {
          setCompanies(data.companies ?? []);
        }
      }

      if (titlesRes.ok) {
        const data = await titlesRes.json();
        if (mountedRef.current) {
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
      if (!options?.silent && mountedRef.current) {
        setLoadingData(false);
      }
    }
  }, [accessToken]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void loadPanelData();
  }, [loadPanelData]);

  // ─── Derived state ─────────────────────────────────────────────────────────

  const eligibleCompanyCount = companies.filter((c) => c.companyId !== null).length;
  const normalizationPending = companies.length > 0 && eligibleCompanyCount === 0;

  useEffect(() => {
    if (!accessToken || running || !normalizationPending) return;

    const normalizationPoll = setInterval(() => {
      void loadPanelData({ silent: true });
    }, 5_000);

    return () => {
      clearInterval(normalizationPoll);
    };
  }, [accessToken, loadPanelData, normalizationPending, running]);

  // ─── Notify parent when scan result first appears ─────────────────────────

  const prevResultRef = useRef<typeof result>(null);
  useEffect(() => {
    if (result && !prevResultRef.current) {
      onScanComplete?.();
    }
    prevResultRef.current = result;
  }, [result, onScanComplete]);

  // ─── Start scrape ──────────────────────────────────────────────────────────

  const handleScan = useCallback(async () => {
    const companyIds = selection.getSelectedCompanyIds();
    const maxDaysOldMap: Record<string, number> = { '24h': 1, '3d': 3, '7d': 7, '14d': 14, '30d': 30 };
    const workModes = (Object.entries(filters.workModes) as Array<[WorkModeKey, boolean]>)
      .filter(([, enabled]) => enabled)
      .map(([mode]) => mode);
    const remoteOnly = workModes.length === 1 && workModes[0] === 'remote';
    const location = filters.location.trim();
    const useLocation = location.length > 0 && !remoteOnly;
    await startScan({
      companyIds,
      targetTitles: titles.map((t) => t.title),
      searchContext: 'network_connections',
      emptyMessage: 'Select at least one company to scan.',
      location: useLocation ? location : undefined,
      radiusMiles: useLocation ? filters.radiusMiles : undefined,
      remoteOnly,
      workModes,
      maxDaysOld: maxDaysOldMap[filters.postedWithin],
    });
  }, [filters, selection, startScan, titles]);

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
              <span className="text-[var(--text-muted)]">{selection.selectedCount} selected</span>{' '}
              of {eligibleCompanyCount} eligible companies
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
              <p className="mt-2 text-xs text-[var(--badge-amber-text)]/70">
                {normalizationPending
                  ? 'Connections imported — company matching is still normalizing before we can scan career pages. This updates automatically.'
                  : 'Import LinkedIn connections first — companies need to be normalized before scanning.'}
              </p>
            )}
          </div>

          <GlassButton
            onClick={() => void handleScan()}
            disabled={running || selection.selectedCount === 0}
            loading={running}
            className="shrink-0"
          >
            {running ? 'Scanning...' : 'Scan for Jobs'}
          </GlassButton>
        </div>

        {/* Active progress */}
        {running && scrapeLogId && (
          <div className="mt-5 space-y-3">
            <ProgressBar scanned={currentScanned} total={selection.selectedCount} />

            {scrapeStatus && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatCard label="Scanned" value={scrapeStatus.output_summary.companies_scanned ?? 0} />
                <StatCard label="Jobs Found" value={scrapeStatus.output_summary.jobs_found ?? 0} />
                <StatCard
                  label="Matching"
                  value={scrapeStatus.output_summary.matching_jobs ?? 0}
                  accent="text-[var(--link)]/90"
                />
                <StatCard
                  label="Referral"
                  value={scrapeStatus.output_summary.referral_available ?? 0}
                  accent="text-[var(--badge-green-text)]/90"
                />
              </div>
            )}

            {!scrapeStatus && (
              <p className="text-center text-xs text-[var(--text-soft)]">Starting scan...</p>
            )}

            <div className="flex justify-center">
              <button
                type="button"
                onClick={cancel}
                className="text-xs text-[var(--text-soft)] transition-colors hover:text-[var(--text-muted)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !running && (
          <div className="mt-4 rounded-md border border-[var(--badge-red-text)]/20 bg-[var(--badge-red-text)]/5 px-4 py-3">
            <p className="text-sm text-[var(--badge-red-text)]/80">{error}</p>
          </div>
        )}
      </GlassCard>

      <JobFilterPanel
        location={filters.location}
        onLocationChange={setLocation}
        radiusMiles={filters.radiusMiles}
        onRadiusMilesChange={setRadiusMiles}
        workModes={filters.workModes}
        onWorkModesChange={setWorkModes}
        postedWithin={filters.postedWithin}
        onPostedWithinChange={setPostedWithin}
        workModeSelection="scan-shape"
      />

      {/* Company picker */}
      {eligibleCompanyCount > 0 && (
        <CompanyPickerList
          companies={companies}
          selectedRaws={selection.selectedRaws}
          selectedCount={selection.selectedCount}
          maxSelection={selection.maxSelection}
          isAtLimit={selection.isAtLimit}
          onToggle={selection.toggleCompany}
          onSelectAll={selection.selectAll}
          onClear={selection.clearAll}
          accessToken={accessToken}
          disabled={running}
        />
      )}

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
              accent={result.matchingJobs > 0 ? 'text-[var(--link)]/90' : undefined}
              dim={result.matchingJobs === 0}
            />
            <div className="flex flex-col items-center rounded-md border border-[var(--badge-green-text)]/20 bg-[var(--badge-green-text)]/10 px-4 py-3 text-center">
              <span
                className={cn(
                  'text-2xl font-bold tabular-nums',
                  result.referralAvailable > 0 ? 'text-[var(--badge-green-text)]' : 'text-[var(--text-soft)]',
                )}
              >
                {result.referralAvailable}
              </span>
              <span className="mt-0.5 text-[12px] font-medium uppercase tracking-wider text-[var(--badge-green-text)]/60">
                Referral
              </span>
            </div>
          </div>

          {result.matchingJobs > 0 ? (
            <div className="mt-4 space-y-3">
              <p className="text-center text-sm text-[var(--text-soft)]">
                Found{' '}
                <span className="font-medium text-[var(--link)]/80">{result.matchingJobs}</span>{' '}
                matching job{result.matchingJobs !== 1 ? 's' : ''}.
                {result.referralAvailable > 0 && (
                  <>
                    {' '}
                    <span className="font-medium text-[var(--badge-green-text)]">{result.referralAvailable}</span>{' '}
                    ha{result.referralAvailable !== 1 ? 've' : 's'} a referral bonus available.
                  </>
                )}
              </p>
              {onViewMatches && (
                <div className="flex justify-center">
                  <GlassButton onClick={onViewMatches}>
                    View Matches
                  </GlassButton>
                </div>
              )}
            </div>
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
