/**
 * JSearch Adapter — RapidAPI JSearch job search source.
 *
 * API: https://jsearch.p.rapidapi.com/search
 * Auth: X-RapidAPI-Key header from JSEARCH_API_KEY env var
 * Returns empty array on missing key or any network/parse error.
 */

import logger from '../../logger.js';
import type { SearchAdapter, SearchFilters, JobResult } from '../types.js';

const JSEARCH_HOST = 'jsearch.p.rapidapi.com';
const JSEARCH_BASE_URL = `https://${JSEARCH_HOST}/search`;
const REQUEST_TIMEOUT_MS = 15_000;

/** Maps our canonical datePosted filter to JSearch's date_posted param. */
const DATE_FILTER_MAP: Record<string, string> = {
  '24h': 'today',
  '3d': '3days',
  '7d': 'week',
  '14d': 'week', // JSearch has no 14d option; week is closest
  '30d': 'month',
  'any': 'all',
};

/** Maps our canonical employmentType to JSearch's employment_types param. */
const EMPLOYMENT_TYPE_MAP: Record<string, string> = {
  'full-time': 'FULLTIME',
  'contract': 'CONTRACTOR',
  'freelance': 'CONTRACTOR',
};

interface JSearchJob {
  job_id?: string;
  job_title?: string;
  employer_name?: string;
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_min_salary?: number | null;
  job_max_salary?: number | null;
  job_description?: string | null;
  job_posted_at_datetime_utc?: string;
  job_apply_link?: string | null;
  job_is_remote?: boolean;
  job_employment_type?: string | null;
  job_required_skills?: string[] | null;
}

interface JSearchResponse {
  data?: JSearchJob[];
}

function buildLocation(job: JSearchJob): string | null {
  const parts = [job.job_city, job.job_state, job.job_country]
    .filter(Boolean)
    .join(', ');
  return parts || null;
}

function mapEmploymentType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes('full')) return 'full-time';
  if (lower.includes('contract') || lower.includes('contractor')) return 'contract';
  if (lower.includes('part')) return 'part-time';
  return raw;
}

export class JSearchAdapter implements SearchAdapter {
  readonly name = 'jsearch';

  async search(query: string, location: string, filters: SearchFilters): Promise<JobResult[]> {
    const apiKey = process.env.JSEARCH_API_KEY;
    if (!apiKey) {
      logger.warn({ adapter: this.name }, 'JSEARCH_API_KEY not set — skipping adapter');
      return [];
    }

    try {
      const combinedQuery = location ? `${query} in ${location}` : query;

      const params = new URLSearchParams({
        query: combinedQuery,
        page: '1',
        num_pages: '1',
      });

      // Date filter
      const dateParam = DATE_FILTER_MAP[filters.datePosted] ?? 'all';
      if (dateParam !== 'all') {
        params.set('date_posted', dateParam);
      }

      // Remote filter
      if (filters.remoteType === 'remote') {
        params.set('remote_jobs_only', 'true');
      }

      // Employment type filter
      if (filters.employmentType && filters.employmentType !== 'any') {
        const mappedType = EMPLOYMENT_TYPE_MAP[filters.employmentType];
        if (mappedType) {
          params.set('employment_types', mappedType);
        }
      }

      const url = `${JSEARCH_BASE_URL}?${params.toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': JSEARCH_HOST,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        logger.warn(
          { adapter: this.name, status: response.status, body: body.slice(0, 200) },
          'JSearch API returned non-OK status',
        );
        return [];
      }

      const data = await response.json() as JSearchResponse;
      const jobs = data.data ?? [];

      return jobs.map((job): JobResult => ({
        external_id: `jsearch_${job.job_id ?? Math.random().toString(36).slice(2)}`,
        title: job.job_title ?? 'Unknown Title',
        company: job.employer_name ?? 'Unknown Company',
        location: buildLocation(job),
        salary_min: job.job_min_salary ?? null,
        salary_max: job.job_max_salary ?? null,
        description: job.job_description ?? null,
        posted_date: job.job_posted_at_datetime_utc ?? new Date().toISOString(),
        apply_url: job.job_apply_link ?? null,
        source: this.name,
        remote_type: job.job_is_remote === true ? 'remote' : (job.job_is_remote === false ? 'onsite' : null),
        employment_type: mapEmploymentType(job.job_employment_type),
        required_skills: job.job_required_skills ?? null,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ adapter: this.name, error: message }, 'JSearch adapter error');
      return [];
    }
  }
}
