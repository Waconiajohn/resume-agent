import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api';
import type { JobMatchSearchContext } from '@/types/ni';

export interface NiScrapeStatus {
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
  started_at?: string;
  completed_at?: string | null;
}

export interface NiScrapeResult {
  companiesScanned: number;
  jobsFound: number;
  matchingJobs: number;
  referralAvailable: number;
  errorCount: number;
}

interface StartNiScrapeOptions {
  companyIds: string[];
  targetTitles?: string[];
  searchContext: JobMatchSearchContext;
  emptyMessage: string;
}

function buildResult(log: NiScrapeStatus): NiScrapeResult {
  return {
    companiesScanned: log.output_summary.companies_scanned ?? 0,
    jobsFound: log.output_summary.jobs_found ?? 0,
    matchingJobs: log.output_summary.matching_jobs ?? 0,
    referralAvailable: log.output_summary.referral_available ?? 0,
    errorCount: log.output_summary.error_count ?? 0,
  };
}

export function useNiScrapeRunner(accessToken: string | null) {
  const [scrapeLogId, setScrapeLogId] = useState<string | null>(null);
  const [scrapeStatus, setScrapeStatus] = useState<NiScrapeStatus | null>(null);
  const [result, setResult] = useState<NiScrapeResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousTokenRef = useRef<string | null>(accessToken);

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
      const log = data.log as NiScrapeStatus;
      setScrapeStatus(log);

      if (log.status === 'completed') {
        stopPolling();
        setRunning(false);
        setResult(buildResult(log));
      } else if (log.status === 'failed') {
        stopPolling();
        setRunning(false);
        setError(log.error_message ?? 'Scan failed. Please try again.');
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

    setError(previousToken ? 'Sign in again to continue scanning.' : null);
  }, [accessToken, stopPolling]);

  const startScan = useCallback(async ({
    companyIds,
    targetTitles = [],
    searchContext,
    emptyMessage,
  }: StartNiScrapeOptions) => {
    if (!accessToken) {
      stopPolling();
      setRunning(false);
      setError('Sign in to start a company scan.');
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
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `Server error ${res.status}`);
      }

      const data = await res.json();
      const logId = data.scrape_log_id as string;
      setScrapeLogId(logId);

      void pollStatus(logId);
      pollRef.current = setInterval(() => void pollStatus(logId), 3_000);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start scan. Please try again.');
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
    currentScanned: scrapeStatus?.output_summary.companies_scanned ?? 0,
  };
}
