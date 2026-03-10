import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export interface NetworkContact {
  id: string;
  name: string;
  title: string | null;
  company: string;
}

export interface RadarJob {
  external_id: string;
  title: string;
  company: string;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  description: string | null;
  posted_date: string;
  apply_url: string | null;
  source: string;
  remote_type: string | null;
  employment_type: string | null;
  required_skills: string[] | null;
  match_score?: number | null;
  network_contacts?: NetworkContact[];
}

export interface RadarSearchFilters {
  datePosted?: '24h' | '3d' | '7d' | '14d' | '30d' | 'any';
  remoteType?: 'remote' | 'hybrid' | 'onsite' | 'any';
  employmentType?: 'full-time' | 'contract' | 'freelance' | 'any';
  salaryMin?: number;
  salaryMax?: number;
}

interface RadarSearchState {
  jobs: RadarJob[];
  loading: boolean;
  scoring: boolean;
  error: string | null;
  lastScanId: string | null;
  sources_queried: string[];
  executionTimeMs: number | null;
}

interface SearchResponse {
  scan_id: string;
  jobs: RadarJob[];
  sources_queried: string[];
  execution_time_ms: number;
}

interface EnrichedResult {
  job_listings: {
    external_id: string;
    [key: string]: unknown;
  } | null;
  network_contacts: NetworkContact[];
}

interface EnrichedResponse {
  scan_id: string;
  results: EnrichedResult[];
}

interface ScoreResponse {
  jobs: Array<{ external_id: string; match_score: number | null }>;
}

interface LatestScanMeta {
  id: string;
  query: string;
  location: string | null;
  sources_queried: string[];
  execution_time_ms: number | null;
  result_count: number;
  created_at: string;
}

interface LatestScanResultRow {
  id: string;
  scan_id: string;
  listing_id: string;
  user_id: string;
  status: string;
  match_score: number | null;
  created_at: string;
  updated_at: string;
  job_listings: {
    id: string;
    external_id: string;
    source: string;
    title: string;
    company: string;
    location: string | null;
    salary_min: number | null;
    salary_max: number | null;
    description: string | null;
    posted_date: string;
    apply_url: string | null;
    remote_type: string | null;
    employment_type: string | null;
    required_skills: string[] | null;
  } | null;
}

interface LatestScanResponse {
  scan: LatestScanMeta | null;
  results: LatestScanResultRow[];
}

/**
 * Best-effort NI enrichment — fetches network contacts for a scan and merges them
 * into the job list. Returns the original jobs unchanged on any error.
 */
async function enrichJobsWithContacts(
  scanId: string,
  jobs: RadarJob[],
  authHeader: Record<string, string>,
): Promise<RadarJob[]> {
  try {
    const res = await fetch(`${API_BASE}/job-search/enriched/${scanId}`, {
      headers: authHeader,
    });
    if (!res.ok) return jobs;

    const data = (await res.json()) as EnrichedResponse;
    if (!data.results || data.results.length === 0) return jobs;

    const contactMap = new Map<string, NetworkContact[]>();
    for (const result of data.results) {
      const extId = result.job_listings?.external_id;
      if (extId && result.network_contacts.length > 0) {
        contactMap.set(extId, result.network_contacts);
      }
    }

    if (contactMap.size === 0) return jobs;

    return jobs.map((job) => {
      const contacts = contactMap.get(job.external_id);
      return contacts ? { ...job, network_contacts: contacts } : job;
    });
  } catch {
    // Non-blocking — return original jobs on any failure
    return jobs;
  }
}

async function getAuthHeader(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

export function useRadarSearch() {
  const [state, setState] = useState<RadarSearchState>({
    jobs: [],
    loading: false,
    scoring: false,
    error: null,
    lastScanId: null,
    sources_queried: [],
    executionTimeMs: null,
  });

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const search = useCallback(
    async (query: string, location: string, filters?: RadarSearchFilters): Promise<void> => {
      if (!mountedRef.current) return;
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const authHeader = await getAuthHeader();
        if (!authHeader) {
          if (mountedRef.current) {
            setState((prev) => ({ ...prev, loading: false, error: 'Not authenticated' }));
          }
          return;
        }

        // Merge saved preferences from SearchPreferences component.
        // Caller-supplied filter values always win; prefs fill in only unset fields.
        let savedPrefs: { salaryMin?: string; remote?: string } = {};
        try {
          const raw = localStorage.getItem('careeriq_search_prefs');
          if (raw) savedPrefs = JSON.parse(raw) as { salaryMin?: string; remote?: string };
        } catch {
          // ignore — corrupted storage should not break the search
        }

        const mergedFilters: RadarSearchFilters = { ...filters };

        if (mergedFilters.salaryMin == null && savedPrefs.salaryMin) {
          const parsed = parseInt(savedPrefs.salaryMin, 10);
          if (!isNaN(parsed) && parsed > 0) {
            mergedFilters.salaryMin = parsed;
          }
        }

        if (mergedFilters.remoteType == null && savedPrefs.remote) {
          const validRemoteTypes = ['remote', 'hybrid', 'onsite', 'any'] as const;
          type RemoteType = (typeof validRemoteTypes)[number];
          if (validRemoteTypes.includes(savedPrefs.remote as RemoteType)) {
            mergedFilters.remoteType = savedPrefs.remote as RemoteType;
          }
        }

        const res = await fetch(`${API_BASE}/job-search`, {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, location, filters: mergedFilters }),
        });

        if (!res.ok) {
          const body = await res.text();
          if (mountedRef.current) {
            setState((prev) => ({
              ...prev,
              loading: false,
              error: `Search failed (${res.status}): ${body}`,
            }));
          }
          return;
        }

        const data = (await res.json()) as SearchResponse;
        const rawJobs = data.jobs ?? [];
        const scanId = data.scan_id ?? null;

        // Enrich with NI contacts (best-effort, non-blocking)
        const enrichedJobs =
          scanId && rawJobs.length > 0
            ? await enrichJobsWithContacts(scanId, rawJobs, authHeader)
            : rawJobs;

        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            jobs: enrichedJobs,
            loading: false,
            lastScanId: scanId,
            sources_queried: data.sources_queried ?? [],
            executionTimeMs: data.execution_time_ms ?? null,
          }));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, loading: false, error: message }));
        }
      }
    },
    [],
  );

  const scoreResults = useCallback(async (): Promise<void> => {
    if (!mountedRef.current) return;

    const scanId = state.lastScanId;
    if (!scanId) return;

    setState((prev) => ({ ...prev, scoring: true, error: null }));

    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) {
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, scoring: false, error: 'Not authenticated' }));
        }
        return;
      }

      const res = await fetch(`${API_BASE}/job-search/score`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scan_id: scanId }),
      });

      if (!res.ok) {
        const body = await res.text();
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            scoring: false,
            error: `Scoring failed (${res.status}): ${body}`,
          }));
        }
        return;
      }

      const data = (await res.json()) as ScoreResponse;
      if (mountedRef.current) {
        setState((prev) => {
          const scoreMap = new Map<string, number | null>();
          for (const item of data.jobs ?? []) {
            scoreMap.set(item.external_id, item.match_score);
          }
          return {
            ...prev,
            scoring: false,
            jobs: prev.jobs.map((job) =>
              scoreMap.has(job.external_id)
                ? { ...job, match_score: scoreMap.get(job.external_id) }
                : job,
            ),
          };
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, scoring: false, error: message }));
      }
    }
  }, [state.lastScanId]);

  const loadLatestScan = useCallback(async (): Promise<void> => {
    if (!mountedRef.current) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) {
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, loading: false, error: 'Not authenticated' }));
        }
        return;
      }

      const res = await fetch(`${API_BASE}/job-search/scans/latest`, {
        headers: authHeader,
      });

      if (!res.ok) {
        const body = await res.text();
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: `Failed to load scan (${res.status}): ${body}`,
          }));
        }
        return;
      }

      const data = (await res.json()) as LatestScanResponse;

      // No scans yet — backend returns 200 with scan: null
      if (!data.scan) {
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, loading: false }));
        }
        return;
      }

      // Flatten each result row: merge job_listings fields + match_score → RadarJob
      const jobs: RadarJob[] = (data.results ?? [])
        .filter((row) => row.job_listings !== null)
        .map((row) => {
          const listing = row.job_listings!;
          return {
            external_id: listing.external_id,
            title: listing.title,
            company: listing.company,
            location: listing.location,
            salary_min: listing.salary_min,
            salary_max: listing.salary_max,
            description: listing.description,
            posted_date: listing.posted_date,
            apply_url: listing.apply_url,
            source: listing.source,
            remote_type: listing.remote_type,
            employment_type: listing.employment_type,
            required_skills: listing.required_skills,
            match_score: row.match_score,
          };
        });

      if (mountedRef.current) {
        setState((prev) => ({
          ...prev,
          jobs,
          loading: false,
          lastScanId: data.scan!.id,
          sources_queried: data.scan!.sources_queried ?? [],
          executionTimeMs: data.scan!.execution_time_ms ?? null,
        }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, loading: false, error: message }));
      }
    }
  }, []);

  const dismissJob = useCallback((externalId: string): void => {
    if (!mountedRef.current) return;
    setState((prev) => ({
      ...prev,
      jobs: prev.jobs.filter((j) => j.external_id !== externalId),
    }));
  }, []);

  const promoteJob = useCallback((job: RadarJob): RadarJob => {
    return job;
  }, []);

  return {
    ...state,
    search,
    scoreResults,
    loadLatestScan,
    dismissJob,
    promoteJob,
  };
}
