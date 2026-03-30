import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { safeString, safeStringArray } from '@/lib/safe-cast';

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
  datePosted?: '24h' | '3d' | '7d' | '14d' | '30d' | 'any';
  remoteType?: 'remote' | 'hybrid' | 'onsite' | 'any';
  employmentType?: 'full-time' | 'contract' | 'freelance' | 'any';
  salaryMin?: number;
  salaryMax?: number;
}

interface RadarSearchState {
  jobs: RadarJob[];
  loading: boolean;
  error: string | null;
}

interface SearchResponse { jobs: RadarJob[]; scan_id?: string | null; }

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

    if (contactMap.size === 0 && referralMap.size === 0) return jobs;

    return jobs.map((job) => {
      const contacts = contactMap.get(job.external_id);
      const bonus = referralMap.get(job.external_id);
      return {
        ...job,
        ...(contacts ? { network_contacts: contacts } : {}),
        ...(bonus ? { referral_bonus: bonus } : {}),
      };
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
    error: null,
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

        const res = await fetch(`${API_BASE}/job-search`, {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, location, filters }),
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
        const rawJobs = sanitizeRadarJobs(data.jobs);
        const scanId = safeString(data.scan_id).trim() || null;

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
    dismissJob,
    promoteJob,
  };
}
