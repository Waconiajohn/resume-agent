/**
 * Adzuna Adapter — Adzuna job search API source.
 *
 * API: https://api.adzuna.com/v1/api/jobs/us/search/1
 * Auth: app_id and app_key query params from ADZUNA_APP_ID, ADZUNA_API_KEY env vars
 * Returns empty array on missing credentials or any network/parse error.
 */

import logger from '../../logger.js';
import type { SearchAdapter, SearchFilters, JobResult } from '../types.js';

const ADZUNA_BASE_URL = 'https://api.adzuna.com/v1/api/jobs/us/search/1';
const REQUEST_TIMEOUT_MS = 15_000;

/** Maps our canonical datePosted filter to Adzuna's max_days_old param. */
const DATE_DAYS_MAP: Record<string, number | null> = {
  '24h': 1,
  '3d': 3,
  '7d': 7,
  '14d': 14,
  '30d': 30,
  'any': null,
};

interface AdzunaCompany {
  display_name?: string;
}

interface AdzunaLocation {
  display_name?: string;
}

interface AdzunaJob {
  id?: string;
  title?: string;
  company?: AdzunaCompany;
  location?: AdzunaLocation;
  salary_min?: number | null;
  salary_max?: number | null;
  description?: string | null;
  created?: string;
  redirect_url?: string | null;
  contract_type?: string | null;
  category?: { tag?: string };
}

interface AdzunaResponse {
  results?: AdzunaJob[];
}

function mapRemoteType(job: AdzunaJob): string | null {
  const title = (job.title ?? '').toLowerCase();
  const desc = (job.description ?? '').toLowerCase().slice(0, 500);
  if (title.includes('remote') || desc.includes('fully remote') || desc.includes('100% remote')) {
    return 'remote';
  }
  if (title.includes('hybrid') || desc.includes('hybrid')) {
    return 'hybrid';
  }
  return null;
}

function mapContractType(contractType: string | null | undefined): string | null {
  if (!contractType) return null;
  const lower = contractType.toLowerCase();
  if (lower === 'permanent' || lower === 'full_time' || lower === 'full-time') return 'full-time';
  if (lower === 'contract' || lower === 'part_time') return lower === 'contract' ? 'contract' : 'part-time';
  return contractType;
}

export class AdzunaAdapter implements SearchAdapter {
  readonly name = 'adzuna';

  async search(query: string, location: string, filters: SearchFilters): Promise<JobResult[]> {
    const appId = process.env.ADZUNA_APP_ID;
    const apiKey = process.env.ADZUNA_API_KEY;

    if (!appId || !apiKey) {
      logger.warn({ adapter: this.name }, 'ADZUNA_APP_ID or ADZUNA_API_KEY not set — skipping adapter');
      return [];
    }

    try {
      const params = new URLSearchParams({
        app_id: appId,
        app_key: apiKey,
        results_per_page: '50',
      });

      if (query) params.set('what', query);
      if (location) params.set('where', location);

      // Date filter
      const maxDays = DATE_DAYS_MAP[filters.datePosted];
      if (maxDays != null) {
        params.set('max_days_old', String(maxDays));
      }

      // Salary filters
      if (filters.salaryMin != null) {
        params.set('salary_min', String(filters.salaryMin));
      }
      if (filters.salaryMax != null) {
        params.set('salary_max', String(filters.salaryMax));
      }

      // Employment type filter
      if (filters.employmentType === 'full-time') {
        params.set('contract_type', 'permanent');
      } else if (filters.employmentType === 'contract' || filters.employmentType === 'freelance') {
        params.set('contract_type', 'contract');
      }

      const url = `${ADZUNA_BASE_URL}?${params.toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        logger.warn(
          { adapter: this.name, status: response.status, body: body.slice(0, 200) },
          'Adzuna API returned non-OK status',
        );
        return [];
      }

      const data = await response.json() as AdzunaResponse;
      const jobs = data.results ?? [];

      return jobs.map((job): JobResult => ({
        external_id: `adzuna_${job.id ?? Math.random().toString(36).slice(2)}`,
        title: job.title ?? 'Unknown Title',
        company: job.company?.display_name ?? 'Unknown Company',
        location: job.location?.display_name ?? null,
        salary_min: job.salary_min ?? null,
        salary_max: job.salary_max ?? null,
        description: job.description ?? null,
        posted_date: job.created ?? new Date().toISOString(),
        apply_url: job.redirect_url ?? null,
        source: this.name,
        remote_type: mapRemoteType(job),
        employment_type: mapContractType(job.contract_type),
        required_skills: null, // Adzuna does not provide a structured skills field
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ adapter: this.name, error: message }, 'Adzuna adapter error');
      return [];
    }
  }
}
