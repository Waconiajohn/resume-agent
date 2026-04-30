import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api';
import { readApiError } from '@/lib/api-errors';
import type { JobMatchSearchContext } from '@/types/ni';
import type { WorkModeKey } from '@/hooks/useJobFilters';

const SCAN_TIMEOUT_MS = 5 * 60_000; // 5 minutes
const STALE_THRESHOLD_MS = 10 * 60_000; // 10 minutes

export interface NiScrapeStatus {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output_summary: {
    companies_scanned?: number;
    raw_jobs_found?: number;
    jobs_found?: number;
    matching_jobs?: number;
    referral_available?: number;
    error_count?: number;
    serper_configured?: boolean;
  };
  error_message: string | null;
  started_at?: string;
  completed_at?: string | null;
}

export interface NiScrapeResult {
  companiesScanned: number;
  rawJobsFound: number;
  jobsFound: number;
  matchingJobs: number;
  referralAvailable: number;
  errorCount: number;
  serperConfigured: boolean | null;
}

interface StartNiScrapeOptions {
  companyIds: string[];
  targetTitles?: string[];
  searchContext: JobMatchSearchContext;
  emptyMessage: string;
  location?: string;
  radiusMiles?: number;
  remoteOnly?: boolean;
  workModes?: WorkModeKey[];
  maxDaysOld?: number;
}

function buildResult(log: NiScrapeStatus): NiScrapeResult {
  return {
    companiesScanned: log.output_summary.companies_scanned ?? 0,
    rawJobsFound: log.output_summary.raw_jobs_found ?? log.output_summary.jobs_found ?? 0,
    jobsFound: log.output_summary.jobs_found ?? 0,
    matchingJobs: log.output_summary.matching_jobs ?? 0,
    referralAvailable: log.output_summary.referral_available ?? 0,
    errorCount: log.output_summary.error_count ?? 0,
    serperConfigured: typeof log.output_summary.serper_configured === 'boolean'
      ? log.output_summary.serper_configured
      : null,
  };
}

function isStale(startedAt?: string): boolean {
  if (!startedAt) return false;
  return Date.now() - new Date(startedAt).getTime() > STALE_THRESHOLD_MS;
}

export function useNiScrapeRunner(accessToken: string | null) {
  const [scrapeLogId, setScrapeLogId] = useState<string | null>(null);
  const [scrapeStatus, setScrapeStatus] = useState<NiScrapeStatus | null>(null);
  const [result, setResult] = useState<NiScrapeResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousTokenRef = useRef<string | null>(accessToken);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(async (logId: string) => {
    if (!accessToken) return;

    try {
      const res = await fetch(`${API_BASE}/ni/scrape/status/${logId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        stopPolling();
        setRunning(false);
        setError(await readApiError(res, `Company job search status failed (${res.status}).`));
        return;
      }

      const data = await res.json();
      const log = data.log as NiScrapeStatus;
      setScrapeStatus(log);

      if (log.status === 'completed') {
        stopPolling();
        setRunning(false);
        setResult(buildResult(log));
      } else if (log.status === 'failed') {
        stopPolling();
        setRunning(false);
        setError(log.error_message ?? 'Company job search failed. Please try again.');
      } else if (log.status === 'running' && isStale(log.started_at)) {
        stopPolling();
        setRunning(false);
        setError('Company job search appears stuck. Please try again.');
      }
    } catch {
      // Keep polling on transient failures.
    }
  }, [accessToken, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    const previousToken = previousTokenRef.current;
    if (previousToken === accessToken) return;
    previousTokenRef.current = accessToken;

    stopPolling();
    setScrapeLogId(null);
    setScrapeStatus(null);
    setResult(null);
    setRunning(false);

    if (accessToken) {
      setError(null);
      return;
    }

    setError(previousToken ? 'Sign in again to continue company job search.' : null);
  }, [accessToken, stopPolling]);

  const cancel = useCallback(() => {
    stopPolling();
    setRunning(false);
    setError(null);
    setScrapeStatus(null);
    setScrapeLogId(null);
  }, [stopPolling]);

  const startScan = useCallback(async ({
    companyIds,
    targetTitles = [],
    searchContext,
    emptyMessage,
    location,
    radiusMiles,
    remoteOnly,
    workModes,
    maxDaysOld,
  }: StartNiScrapeOptions) => {
    if (!accessToken) {
      stopPolling();
      setRunning(false);
      setError('Sign in to start company job search.');
      return false;
    }

    stopPolling();
    setError(null);
    setResult(null);
    setScrapeStatus(null);
    setScrapeLogId(null);
    setRunning(true);

    if (companyIds.length === 0) {
      setError(emptyMessage);
      setRunning(false);
      return false;
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
          target_titles: targetTitles,
          search_context: searchContext,
          ...(location ? { location } : {}),
          ...(radiusMiles !== undefined ? { radius_miles: radiusMiles } : {}),
          ...(remoteOnly !== undefined ? { remote_only: remoteOnly } : {}),
          ...(workModes && workModes.length > 0 ? { work_modes: workModes } : {}),
          ...(maxDaysOld !== undefined ? { max_days_old: maxDaysOld } : {}),
        }),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, `Server error ${res.status}`));
      }

      const data = await res.json();
      const logId = data.scrape_log_id as string;
      setScrapeLogId(logId);

      void pollStatus(logId);
      pollRef.current = setInterval(() => void pollStatus(logId), 3_000);

      // Safety timeout — don't spin forever
      timeoutRef.current = setTimeout(() => {
        stopPolling();
        setRunning(false);
        setError('Company job search timed out. Results may still be processing — try refreshing the page.');
      }, SCAN_TIMEOUT_MS);

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start company job search. Please try again.');
      setRunning(false);
      return false;
    }
  }, [accessToken, pollStatus, stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setScrapeLogId(null);
    setScrapeStatus(null);
    setResult(null);
    setRunning(false);
    setError(null);
  }, [stopPolling]);

  return {
    scrapeLogId,
    scrapeStatus,
    result,
    running,
    error,
    startScan,
    reset,
    cancel,
    currentScanned: scrapeStatus?.output_summary.companies_scanned ?? 0,
  };
}
