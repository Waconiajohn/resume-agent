import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE } from '@/lib/api';
import { readApiError } from '@/lib/api-errors';
import { supabase } from '@/lib/supabase';
import { safeNumber, safeString, safeStringArray } from '@/lib/safe-cast';
import {
  buildAuthScopedSessionStorageKey,
  decodeUserIdFromAccessToken,
  readJsonFromSessionStorage,
  writeJsonToSessionStorage,
} from '@/lib/auth-scoped-storage';

export interface NetworkContact {
  id: string;
  name: string;
  title: string | null;
  company: string;
}

export interface ReferralBonusInfo {
  bonus_amount: string | null;
  bonus_entry: string | null;
  bonus_mid: string | null;
  bonus_senior: string | null;
  bonus_executive: string | null;
  program_url: string | null;
  confidence: string | null;
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
  referral_bonus?: ReferralBonusInfo | null;
}

export interface RadarSearchFilters {
  datePosted?: '24h' | '3d' | '7d' | '14d' | '30d';
  remoteType?: 'remote' | 'hybrid' | 'onsite' | 'any';
  employmentType?: 'full-time' | 'contract' | 'freelance' | 'any';
  salaryMin?: number;
  salaryMax?: number;
}

export interface RadarProviderDiagnostic {
  provider: string;
  status: 'ok' | 'missing_key' | 'http_error' | 'network_error' | 'error';
  message: string;
  jobs_returned?: number;
  http_status?: number;
}

export interface RadarSearchFilterStats {
  raw_returned: number;
  filtered_by_work_mode: number;
  filtered_by_freshness: number;
  deduped: number;
  adapter_failures: number;
  provider_diagnostics: RadarProviderDiagnostic[];
}

interface RadarSearchState {
  jobs: RadarJob[];
  loading: boolean;
  error: string | null;
  hasSearched: boolean;
  lastQuery: string | null;
  lastLocation: string | null;
  lastFilters: RadarSearchFilters | null;
  scanId: string | null;
  sourcesQueried: string[];
  executionTimeMs: number | null;
  emptyReason: string | null;
  filterStats: RadarSearchFilterStats | null;
}

interface SearchResponse {
  jobs: RadarJob[];
  scan_id?: string | null;
  executionTimeMs?: number | null;
  sources_queried?: unknown;
  empty_reason?: unknown;
  filter_stats?: unknown;
}

type CachedRadarState = Omit<RadarSearchState, 'loading' | 'error'>;

const RADAR_SEARCH_CACHE_NAMESPACE = 'career-iq:radar-search:last';

function cacheKeyForToken(accessToken: string | null | undefined): string {
  return buildAuthScopedSessionStorageKey(
    RADAR_SEARCH_CACHE_NAMESPACE,
    decodeUserIdFromAccessToken(accessToken),
  );
}

interface EnrichedResult {
  job_listings: {
    external_id: string;
    [key: string]: unknown;
  } | null;
  network_contacts: NetworkContact[];
  referral_bonus?: Record<string, unknown> | null;
}

interface EnrichedResponse {
  scan_id: string;
  results: EnrichedResult[];
}

interface EnrichmentResult {
  jobs: RadarJob[];
  warning: string | null;
}

function safeNullableString(value: unknown): string | null {
  const normalized = safeString(value).trim();
  return normalized ? normalized : null;
}

function safeNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function sanitizeStringList(value: unknown): string[] | null {
  const items = safeStringArray(value).map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : null;
}

function sanitizeNetworkContact(value: unknown): NetworkContact | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const id = safeString(candidate.id).trim();
  const name = safeString(candidate.name).trim();
  const company = safeString(candidate.company).trim();
  if (!id || !name || !company) return null;

  return {
    id,
    name,
    title: safeNullableString(candidate.title),
    company,
  };
}

function sanitizeReferralBonus(value: unknown): ReferralBonusInfo | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;

  const bonusAmount = safeNullableString(candidate.bonus_amount);
  const bonusEntry = safeNullableString(candidate.bonus_entry);
  const bonusMid = safeNullableString(candidate.bonus_mid);
  const bonusSenior = safeNullableString(candidate.bonus_senior);
  const bonusExecutive = safeNullableString(candidate.bonus_executive);
  const programUrl = safeNullableString(candidate.program_url);
  const confidence = safeNullableString(candidate.confidence);

  // Only return an object if there is at least one bonus value
  if (!bonusAmount && !bonusEntry && !bonusMid && !bonusSenior && !bonusExecutive) {
    return null;
  }

  return {
    bonus_amount: bonusAmount,
    bonus_entry: bonusEntry,
    bonus_mid: bonusMid,
    bonus_senior: bonusSenior,
    bonus_executive: bonusExecutive,
    program_url: programUrl,
    confidence,
  };
}

function sanitizeRadarJob(value: unknown): RadarJob | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const externalId = safeString(candidate.external_id).trim();
  const title = safeString(candidate.title).trim();
  const company = safeString(candidate.company).trim();
  const source = safeString(candidate.source).trim();
  if (!externalId || !title || !company || !source) return null;

  const salaryMin = safeNullableNumber(candidate.salary_min);
  const salaryMax = safeNullableNumber(candidate.salary_max);
  const matchScore = safeNullableNumber(candidate.match_score);
  const contacts = Array.isArray(candidate.network_contacts)
    ? candidate.network_contacts
        .map((contact) => sanitizeNetworkContact(contact))
        .filter((contact): contact is NetworkContact => contact !== null)
    : undefined;
  const referralBonus = sanitizeReferralBonus(candidate.referral_bonus);

  return {
    external_id: externalId,
    title,
    company,
    location: safeNullableString(candidate.location),
    salary_min: salaryMin,
    salary_max: salaryMax,
    description: safeNullableString(candidate.description),
    posted_date: safeString(candidate.posted_date).trim(),
    apply_url: safeNullableString(candidate.apply_url),
    source,
    remote_type: safeNullableString(candidate.remote_type),
    employment_type: safeNullableString(candidate.employment_type),
    required_skills: sanitizeStringList(candidate.required_skills),
    match_score: matchScore,
    network_contacts: contacts && contacts.length > 0 ? contacts : undefined,
    referral_bonus: referralBonus ?? undefined,
  };
}

function sanitizeRadarJobs(value: unknown): RadarJob[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((job) => sanitizeRadarJob(job))
    .filter((job): job is RadarJob => job !== null);
}

function sanitizeProviderDiagnostic(value: unknown): RadarProviderDiagnostic | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const provider = safeString(candidate.provider).trim();
  const status = safeString(candidate.status).trim() as RadarProviderDiagnostic['status'];
  const message = safeString(candidate.message).trim();
  if (!provider || !message) return null;
  if (!['ok', 'missing_key', 'http_error', 'network_error', 'error'].includes(status)) return null;
  const jobsReturned = safeNullableNumber(candidate.jobs_returned);
  const httpStatus = safeNullableNumber(candidate.http_status);
  return {
    provider,
    status,
    message,
    ...(jobsReturned !== null ? { jobs_returned: jobsReturned } : {}),
    ...(httpStatus !== null ? { http_status: httpStatus } : {}),
  };
}

function sanitizeFilterStats(value: unknown): RadarSearchFilterStats | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const providerDiagnostics = Array.isArray(candidate.provider_diagnostics)
    ? candidate.provider_diagnostics
        .map((diagnostic) => sanitizeProviderDiagnostic(diagnostic))
        .filter((diagnostic): diagnostic is RadarProviderDiagnostic => diagnostic !== null)
    : [];
  return {
    raw_returned: safeNumber(candidate.raw_returned),
    filtered_by_work_mode: safeNumber(candidate.filtered_by_work_mode),
    filtered_by_freshness: safeNumber(candidate.filtered_by_freshness),
    deduped: safeNumber(candidate.deduped),
    adapter_failures: safeNumber(candidate.adapter_failures),
    provider_diagnostics: providerDiagnostics,
  };
}

/**
 * Best-effort NI enrichment — fetches network contacts for a scan and merges them
 * into the job list. Returns the original jobs unchanged on any error, plus a
 * warning so the UI does not imply there were no network contacts.
 */
async function enrichJobsWithContacts(
  scanId: string,
  jobs: RadarJob[],
  authHeader: Record<string, string>,
): Promise<EnrichmentResult> {
  try {
    const res = await fetch(`${API_BASE}/job-search/enriched/${scanId}`, {
      headers: authHeader,
    });
    if (!res.ok) {
      return {
        jobs,
        warning: await readApiError(
          res,
          `Jobs loaded, but network contacts and referral bonuses could not be loaded (${res.status}).`,
        ),
      };
    }

    const data = (await res.json()) as EnrichedResponse;
    if (!data.results || data.results.length === 0) return { jobs, warning: null };

    const contactMap = new Map<string, NetworkContact[]>();
    const referralMap = new Map<string, ReferralBonusInfo>();
    for (const result of data.results) {
      const extId = result.job_listings?.external_id;
      if (extId) {
        if (result.network_contacts.length > 0) {
          contactMap.set(extId, result.network_contacts);
        }
        const bonus = sanitizeReferralBonus(result.referral_bonus);
        if (bonus) {
          referralMap.set(extId, bonus);
        }
      }
    }

    if (contactMap.size === 0 && referralMap.size === 0) return { jobs, warning: null };

    const enrichedJobs = jobs.map((job) => {
      const contacts = contactMap.get(job.external_id);
      const bonus = referralMap.get(job.external_id);
      return {
        ...job,
        ...(contacts ? { network_contacts: contacts } : {}),
        ...(bonus ? { referral_bonus: bonus } : {}),
      };
    });

    return { jobs: enrichedJobs, warning: null };
  } catch {
    return {
      jobs,
      warning: 'Jobs loaded, but network contacts and referral bonuses could not be loaded.',
    };
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
    error: null,
    hasSearched: false,
    lastQuery: null,
    lastLocation: null,
    lastFilters: null,
    scanId: null,
    sourcesQueried: [],
    executionTimeMs: null,
    emptyReason: null,
    filterStats: null,
  });

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !mountedRef.current) return;
      const cached = readJsonFromSessionStorage<Partial<CachedRadarState>>(
        cacheKeyForToken(session?.access_token),
      );
      if (!cached?.hasSearched) return;
      setState((prev) => {
        if (prev.hasSearched || prev.loading) return prev;
        return {
          jobs: sanitizeRadarJobs(cached.jobs),
          loading: false,
          error: null,
          hasSearched: true,
          lastQuery: safeNullableString(cached.lastQuery),
          lastLocation: safeNullableString(cached.lastLocation),
          lastFilters: cached.lastFilters ?? null,
          scanId: safeNullableString(cached.scanId),
          sourcesQueried: safeStringArray(cached.sourcesQueried),
          executionTimeMs: safeNullableNumber(cached.executionTimeMs),
          emptyReason: safeNullableString(cached.emptyReason),
          filterStats: sanitizeFilterStats(cached.filterStats),
        };
      });
    }).catch(() => {
      // Cache restore is best-effort only.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const search = useCallback(
    async (query: string, location: string, filters?: RadarSearchFilters): Promise<void> => {
      if (!mountedRef.current) return;
      const trimmedQuery = query.trim();
      const trimmedLocation = location.trim();
      setState((prev) => ({
        ...prev,
        jobs: [],
        loading: true,
        error: null,
        hasSearched: true,
        lastQuery: trimmedQuery,
        lastLocation: trimmedLocation,
        lastFilters: filters ?? null,
        scanId: null,
        sourcesQueried: [],
        executionTimeMs: null,
        emptyReason: null,
        filterStats: null,
      }));

      try {
        const authHeader = await getAuthHeader();
        if (!authHeader) {
          if (mountedRef.current) {
            setState((prev) => ({
              ...prev,
              jobs: [],
              loading: false,
              error: 'Not authenticated',
            }));
          }
          return;
        }
        const accessToken = authHeader.Authorization.replace(/^Bearer\s+/i, '');

        const res = await fetch(`${API_BASE}/job-search`, {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, location, filters }),
        });

        if (!res.ok) {
          const body = await res.text();
          let message = `Search failed (${res.status})`;
          try {
            const parsed = JSON.parse(body) as { error?: unknown };
            if (typeof parsed.error === 'string' && parsed.error.trim()) {
              message = parsed.error;
            }
          } catch {
            if (body.trim()) message = `${message}: ${body.trim().slice(0, 240)}`;
          }
          if (mountedRef.current) {
            setState((prev) => ({
              ...prev,
              loading: false,
              error: message,
            }));
          }
          return;
        }

        const data = (await res.json()) as SearchResponse;
        const rawJobs = sanitizeRadarJobs(data.jobs);
        const scanId = safeString(data.scan_id).trim() || null;
        const sourcesQueried = safeStringArray(data.sources_queried);
        const executionTimeMs = safeNullableNumber(data.executionTimeMs);
        const emptyReason = safeNullableString(data.empty_reason);
        const filterStats = sanitizeFilterStats(data.filter_stats);

        // Enrich with NI contacts (best-effort, non-blocking)
        const enrichment =
          scanId && rawJobs.length > 0
            ? await enrichJobsWithContacts(scanId, rawJobs, authHeader)
            : { jobs: rawJobs, warning: null };
        const enrichedJobs = enrichment.jobs;

        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            jobs: enrichedJobs,
            loading: false,
            error: enrichment.warning,
            scanId,
            sourcesQueried,
            executionTimeMs,
            emptyReason: enrichedJobs.length === 0 ? emptyReason : null,
            filterStats,
          }));
          writeJsonToSessionStorage(cacheKeyForToken(accessToken), {
            jobs: enrichedJobs,
            hasSearched: true,
            lastQuery: trimmedQuery,
            lastLocation: trimmedLocation,
            lastFilters: filters ?? null,
            scanId,
            sourcesQueried,
            executionTimeMs,
            emptyReason: enrichedJobs.length === 0 ? emptyReason : null,
            filterStats,
          } satisfies CachedRadarState);
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

  const dismissJob = useCallback((externalId: string): void => {
    if (!mountedRef.current) return;
    setState((prev) => ({
      ...prev,
      jobs: prev.jobs.filter((j) => j.external_id !== externalId),
    }));
  }, []);

  const reset = useCallback((): void => {
    if (!mountedRef.current) return;
    setState({
      jobs: [],
      loading: false,
      error: null,
      hasSearched: false,
      lastQuery: null,
      lastLocation: null,
      lastFilters: null,
      scanId: null,
      sourcesQueried: [],
      executionTimeMs: null,
      emptyReason: null,
      filterStats: null,
    });
  }, []);

  return {
    ...state,
    search,
    dismissJob,
    reset,
  };
}
