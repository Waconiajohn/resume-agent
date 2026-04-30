/**
 * SerpApi Google Jobs Adapter — structured Google Jobs results for Broad Search.
 *
 * SerpApi exposes the Google Jobs surface through engine=google_jobs. This is
 * the primary broad job-board provider because it returns structured postings,
 * apply options, detected posting age, work-from-home signals, and pagination.
 */

import { createHash } from 'node:crypto';
import logger from '../../logger.js';
import { findPostedDateText, normalizeJobPostedDate } from '../../job-date.js';
import { isKnownATSUrl } from '../../ats-search-targets.js';
import { classifyWorkMode } from '../work-mode-classifier.js';
import type { JobResult, SearchAdapter, SearchFilters, SearchProviderDiagnostic } from '../types.js';

const SERPAPI_GOOGLE_JOBS_URL = 'https://serpapi.com/search.json';
const REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_PAGES = 1;
const MAX_ALLOWED_PAGES = 3;
const LOCAL_CACHE_TTL_MS = 5 * 60 * 1000;

const APPLY_AGGREGATOR_TITLES = new Set([
  'aarp job board',
  'adzuna',
  'bandana.com',
  'bebee',
  'breakroom',
  'careerbuilder',
  'dice',
  'earnbetter',
  'factoryfix',
  'glassdoor',
  'indeed',
  'jobget',
  'jobgether',
  'jobilize',
  'jooble',
  'learn4good',
  'lensa',
  'linkedin',
  'monster',
  'recruit.net',
  'salary.com',
  'simplyhired',
  'snagajob',
  'talent.com',
  'tarta.ai',
  'teal',
  'whatjobs',
  'ziprecruiter',
]);

interface SerpApiApplyOption {
  title?: string;
  link?: string;
}

interface SerpApiDetectedExtensions {
  posted_at?: string;
  salary?: string;
  schedule_type?: string;
  work_from_home?: boolean;
}

interface SerpApiJobResult {
  title?: string;
  company_name?: string;
  location?: string;
  via?: string;
  share_link?: string;
  extensions?: string[];
  detected_extensions?: SerpApiDetectedExtensions;
  description?: string;
  apply_options?: SerpApiApplyOption[];
  job_id?: string;
}

interface SerpApiPagination {
  next_page_token?: string;
}

interface SerpApiGoogleJobsResponse {
  error?: string;
  search_metadata?: {
    status?: string;
  };
  jobs_results?: SerpApiJobResult[];
  serpapi_pagination?: SerpApiPagination;
}

interface CachedSerpApiResult {
  expiresAt: number;
  jobs: JobResult[];
  diagnostics: SearchProviderDiagnostic[];
}

const localCache = new Map<string, CachedSerpApiResult>();

function parseMaxPages(): number {
  const raw = process.env.SERPAPI_GOOGLE_JOBS_MAX_PAGES;
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_PAGES;
  return Math.min(parsed, MAX_ALLOWED_PAGES);
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripSiteOperators(query: string): string {
  return normalizeSpaces(query.replace(/\bsite:[^\s)]+/gi, ''));
}

function queryHasJobsIntent(query: string): boolean {
  return /\b(job|jobs|hiring|opening|openings|career|careers)\b/i.test(query);
}

function withFreshnessIntent(query: string, datePosted: SearchFilters['datePosted']): string {
  if (datePosted === '24h') return `${query} since yesterday`;
  if (datePosted === '3d') return `${query} in the last 3 days`;
  if (datePosted === '7d') return `${query} in the last week`;
  if (datePosted === '14d' || datePosted === '30d') return `${query} in the last month`;
  return query;
}

function withEmploymentIntent(query: string, employmentType: SearchFilters['employmentType']): string {
  if (!employmentType || employmentType === 'any') return query;
  if (employmentType === 'full-time') return `${query} full time`;
  return `${query} ${employmentType}`;
}

function buildSearchQuery(query: string, filters: SearchFilters): string {
  let out = stripSiteOperators(query);
  if (filters.remoteType === 'remote' && !/\b(remote|work from home|work-from-home)\b/i.test(out)) {
    out = `${out} remote`;
  }
  out = withEmploymentIntent(out, filters.employmentType);
  if (!queryHasJobsIntent(out)) out = `${out} jobs`;
  return withFreshnessIntent(normalizeSpaces(out), filters.datePosted);
}

function buildUrl(
  apiKey: string,
  query: string,
  location: string,
  filters: SearchFilters,
  nextPageToken?: string,
): URL {
  const url = new URL(SERPAPI_GOOGLE_JOBS_URL);
  url.searchParams.set('engine', 'google_jobs');
  url.searchParams.set('q', query);
  url.searchParams.set('google_domain', 'google.com');
  url.searchParams.set('gl', 'us');
  url.searchParams.set('hl', 'en');
  url.searchParams.set('api_key', apiKey);
  if (nextPageToken) {
    url.searchParams.set('next_page_token', nextPageToken);
  }
  if (location.trim() && filters.remoteType !== 'remote') {
    url.searchParams.set('location', location.trim());
  } else if (filters.remoteType === 'remote') {
    // Still supported by SerpApi for Google Jobs even though Google marks it
    // deprecated. The server-side work-mode filter remains the real guardrail.
    url.searchParams.set('ltype', '1');
  }
  return url;
}

function cacheKey(query: string, location: string, filters: SearchFilters): string {
  return JSON.stringify({
    query,
    location: location.trim(),
    datePosted: filters.datePosted,
    remoteType: filters.remoteType ?? 'any',
    employmentType: filters.employmentType ?? 'any',
    salaryMin: filters.salaryMin ?? null,
    salaryMax: filters.salaryMax ?? null,
  });
}

function cloneJobs(jobs: JobResult[]): JobResult[] {
  return jobs.map((job) => ({
    ...job,
    required_skills: job.required_skills ? [...job.required_skills] : job.required_skills,
  }));
}

function isLikelyAggregator(title: string | undefined): boolean {
  if (!title) return false;
  return APPLY_AGGREGATOR_TITLES.has(title.trim().toLowerCase());
}

function pickApplyUrl(job: SerpApiJobResult): string | null {
  const options = job.apply_options ?? [];
  const directAts = options.find((option) => option.link && isKnownATSUrl(option.link));
  if (directAts?.link) return directAts.link;

  const directCompany = options.find((option) => option.link && !isLikelyAggregator(option.title));
  if (directCompany?.link) return directCompany.link;

  const firstApply = options.find((option) => option.link);
  return firstApply?.link ?? job.share_link ?? null;
}

function parseMoneyValue(raw: string, forceThousands: boolean): number | null {
  const parsed = Number.parseFloat(raw.replace(/,/g, ''));
  if (!Number.isFinite(parsed)) return null;
  return forceThousands ? parsed * 1000 : parsed;
}

function extractSalary(
  salaryText: string | undefined,
  extensions: string[],
): { salary_min: number | null; salary_max: number | null } {
  const text = salaryText ?? extensions.find((item) => /\$|\b\d+[\d,.]*\s*[-–—]\s*\d+/.test(item));
  if (!text) return { salary_min: null, salary_max: null };

  const isHourly = /\b(hour|hourly|hr)\b/i.test(text);
  const range = text.match(/\$?\s*([\d,.]+)\s*([kK])?\s*(?:[-–—]|to)\s*\$?\s*([\d,.]+)\s*([kK])?/);
  if (range?.[1] && range[3]) {
    const low = Number.parseFloat(range[1].replace(/,/g, ''));
    const high = Number.parseFloat(range[3].replace(/,/g, ''));
    const forceThousands = !isHourly && Boolean(range[2] || range[4] || (low < 1000 && high < 1000));
    return {
      salary_min: parseMoneyValue(range[1], forceThousands),
      salary_max: parseMoneyValue(range[3], forceThousands),
    };
  }

  const single = text.match(/\$?\s*([\d,.]+)\s*([kK])?/);
  if (single?.[1]) {
    const value = Number.parseFloat(single[1].replace(/,/g, ''));
    const forceThousands = !isHourly && Boolean(single[2] || value >= 50 && value < 1000);
    return {
      salary_min: parseMoneyValue(single[1], forceThousands),
      salary_max: null,
    };
  }

  return { salary_min: null, salary_max: null };
}

function extractEmploymentType(
  scheduleType: string | undefined,
  extensions: string[],
): string | null {
  const values = [scheduleType, ...extensions].filter((value): value is string => Boolean(value));
  for (const value of values) {
    const lower = value.toLowerCase().trim();
    if (lower.includes('full-time') || lower.includes('full time')) return 'full-time';
    if (lower.includes('part-time') || lower.includes('part time')) return 'part-time';
    if (lower.includes('contractor') || lower.includes('contract')) return 'contract';
    if (lower.includes('internship')) return 'internship';
    if (lower.includes('temporary')) return 'temporary';
  }
  return null;
}

function buildStableExternalId(job: SerpApiJobResult, applyUrl: string | null): string {
  const identity = [
    job.job_id,
    applyUrl,
    job.title,
    job.company_name,
    job.location,
  ]
    .filter(Boolean)
    .join('|')
    .toLowerCase();
  const digest = createHash('sha1').update(identity).digest('hex').slice(0, 18);
  return `serpapi_${digest}`;
}

function mapJob(job: SerpApiJobResult): JobResult | null {
  const title = job.title?.trim();
  const company = job.company_name?.trim();
  if (!title || !company) return null;

  const extensions = job.extensions ?? [];
  const detected = job.detected_extensions ?? {};
  const applyUrl = pickApplyUrl(job);
  const postedText = detected.posted_at ?? extensions.map(findPostedDateText).find(Boolean) ?? null;
  const postedDate = normalizeJobPostedDate(postedText);
  const salary = extractSalary(detected.salary, extensions);
  const workMode = detected.work_from_home
    ? 'remote'
    : classifyWorkMode(title, job.description ?? '', job.location, extensions);

  return {
    external_id: buildStableExternalId(job, applyUrl),
    title,
    company,
    location: job.location ?? null,
    salary_min: salary.salary_min,
    salary_max: salary.salary_max,
    description: job.description ?? null,
    posted_date: postedDate ? postedDate.toISOString() : null,
    apply_url: applyUrl,
    source: job.via ? `serpapi:${job.via.toLowerCase()}` : 'serpapi:google_jobs',
    remote_type: workMode === 'unknown' ? null : workMode,
    employment_type: extractEmploymentType(detected.schedule_type, extensions),
    required_skills: null,
  };
}

export class SerpApiGoogleJobsAdapter implements SearchAdapter {
  readonly name = 'serpapi_google_jobs';
  readonly queryMode = 'raw' as const;
  private diagnostics: SearchProviderDiagnostic[] = [];

  getDiagnostics(): SearchProviderDiagnostic[] {
    return this.diagnostics;
  }

  private setDiagnostic(diagnostic: Omit<SearchProviderDiagnostic, 'provider'>): void {
    this.diagnostics = [{ provider: this.name, ...diagnostic }];
  }

  async search(query: string, location: string, filters: SearchFilters): Promise<JobResult[]> {
    this.diagnostics = [];
    const apiKey = process.env.SERPAPI_API_KEY;
    if (!apiKey) {
      logger.warn({ adapter: this.name }, 'SERPAPI_API_KEY not set — skipping Google Jobs adapter');
      this.setDiagnostic({
        status: 'missing_key',
        message: 'SerpApi Google Jobs is not configured, so Broad Search cannot query the structured Google Jobs board.',
        jobs_returned: 0,
      });
      return [];
    }

    const searchQuery = buildSearchQuery(query, filters);
    const key = cacheKey(searchQuery, location, filters);
    const cached = localCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      this.diagnostics = cached.diagnostics.map((diagnostic) => ({ ...diagnostic }));
      return cloneJobs(cached.jobs);
    }

    const jobs: JobResult[] = [];
    let nextPageToken: string | undefined;
    const maxPages = parseMaxPages();

    try {
      for (let page = 0; page < maxPages; page++) {
        const url = buildUrl(apiKey, searchQuery, location, filters, nextPageToken);
        const response = await fetch(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) {
          logger.warn(
            { adapter: this.name, status: response.status, query: searchQuery, page: page + 1 },
            'SerpApi Google Jobs returned non-OK status',
          );
          this.setDiagnostic({
            status: 'http_error',
            message: response.status === 401 || response.status === 403
              ? 'SerpApi rejected the configured API key.'
              : response.status === 402 || response.status === 429
                ? 'SerpApi Google Jobs did not return jobs because the API quota or rate limit was hit.'
                : 'SerpApi Google Jobs returned an upstream error before jobs could be read.',
            http_status: response.status,
            jobs_returned: 0,
          });
          return [];
        }

        const data = (await response.json()) as SerpApiGoogleJobsResponse;
        if (data.error) {
          logger.warn({ adapter: this.name, query: searchQuery, error: data.error }, 'SerpApi Google Jobs returned error payload');
          this.setDiagnostic({
            status: 'error',
            message: `SerpApi Google Jobs returned an error: ${data.error}`,
            jobs_returned: 0,
          });
          return [];
        }

        jobs.push(
          ...(data.jobs_results ?? [])
            .map(mapJob)
            .filter((job): job is JobResult => job !== null),
        );

        nextPageToken = data.serpapi_pagination?.next_page_token;
        if (!nextPageToken) break;
      }

      this.setDiagnostic({
        status: 'ok',
        message: jobs.length > 0
          ? `SerpApi Google Jobs returned ${jobs.length} raw job result${jobs.length === 1 ? '' : 's'}.`
          : 'SerpApi Google Jobs responded successfully but returned no raw job results.',
        jobs_returned: jobs.length,
      });

      logger.info(
        { adapter: this.name, query: searchQuery, location, jobCount: jobs.length },
        'SerpApi Google Jobs adapter returned job results',
      );

      localCache.set(key, {
        expiresAt: Date.now() + LOCAL_CACHE_TTL_MS,
        jobs: cloneJobs(jobs),
        diagnostics: this.getDiagnostics().map((diagnostic) => ({ ...diagnostic })),
      });

      return jobs;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { adapter: this.name, error: message, query: searchQuery },
        'SerpApi Google Jobs adapter error',
      );
      this.setDiagnostic({
        status: message.toLowerCase().includes('timeout') ? 'network_error' : 'error',
        message: `SerpApi Google Jobs search failed: ${message}`,
        jobs_returned: 0,
      });
      return [];
    }
  }
}
