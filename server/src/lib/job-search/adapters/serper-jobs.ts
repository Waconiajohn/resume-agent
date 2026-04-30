/**
 * Serper ATS/Web Fallback Adapter — job pages discovered through Google Search.
 *
 * Serper does not expose a stable structured Google Jobs endpoint on the
 * current API. This adapter uses the supported /search endpoint and narrows
 * results to known ATS/career domains. It is intentionally a fallback behind
 * the SerpApi Google Jobs adapter, not the broad job-board source of truth.
 *
 * Auth: X-API-KEY header with SERPER_API_KEY env var.
 * Returns empty array on missing key or any error (graceful degradation).
 */

import { createHash } from 'node:crypto';
import logger from '../../logger.js';
import {
  findPostedDateText,
  freshnessDaysForDatePosted,
  googleTbsForFreshnessDays,
  normalizeJobPostedDate,
} from '../../job-date.js';
import { isKnownATSUrl, PUBLIC_ATS_SITE_QUERY } from '../../ats-search-targets.js';
import { classifyWorkMode } from '../work-mode-classifier.js';
import type { SearchAdapter, SearchFilters, JobResult, SearchProviderDiagnostic } from '../types.js';

const SERPER_SEARCH_URL = 'https://google.serper.dev/search';
const REQUEST_TIMEOUT_MS = 15_000;
const GENERIC_ATS_TITLE_PATTERN =
  /^(search\s+(for\s+)?jobs?|job\s+search|jobs?|careers?|career\s+opportunities|current\s+openings?|open\s+roles?)$/i;
const QUERY_STOP_WORDS = new Set([
  'and',
  'are',
  'for',
  'from',
  'job',
  'jobs',
  'near',
  'of',
  'on',
  'remote',
  'hybrid',
  'onsite',
  'site',
  'the',
  'with',
  'within',
]);
const SENIORITY_ONLY_TOKENS = new Set([
  'chief',
  'coo',
  'cto',
  'cfo',
  'director',
  'executive',
  'head',
  'lead',
  'manager',
  'principal',
  'senior',
  'sr',
  'vp',
]);

// ─── Serper response shape ────────────────────────────────────────────────────

interface SerperJob {
  title?: string;
  companyName?: string;
  location?: string;
  source?: string;
  date?: string;
  snippet?: string;
  link?: string;
  extensions?: string[];
}

interface SerperOrganicResult {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
}

interface SerperJobsResponse {
  jobs?: SerperJob[];
  organic?: SerperOrganicResult[];
}

// ─── Freshness filter mapping ─────────────────────────────────────────────────

// ─── Salary extraction ────────────────────────────────────────────────────────

const SALARY_PATTERN =
  /\$\s*([\d,]+)\s*[kK]?\s*[-–—]\s*\$\s*([\d,]+)\s*[kK]?|\$\s*([\d,]+)\s*[kK]/;

/**
 * Attempt to extract min/max salary values (in whole dollars) from extensions.
 * Handles both "$120K–$180K" range and "$120K" single-value formats.
 */
function extractSalary(
  extensions: string[],
): { salary_min: number | null; salary_max: number | null } {
  for (const ext of extensions) {
    const match = SALARY_PATTERN.exec(ext);
    if (!match) continue;

    const parseValue = (raw: string): number => {
      const cleaned = raw.replace(/,/g, '');
      const n = parseFloat(cleaned);
      // Values < 1000 are assumed to be "K" shorthand
      return n < 1000 ? n * 1000 : n;
    };

    if (match[1] && match[2]) {
      // Range: "$120K–$180K"
      return {
        salary_min: parseValue(match[1]),
        salary_max: parseValue(match[2]),
      };
    }
    if (match[3]) {
      // Single: "$120K"
      const val = parseValue(match[3]);
      return { salary_min: val, salary_max: null };
    }
  }
  return { salary_min: null, salary_max: null };
}

function buildSearchQuery(
  query: string,
  remoteType: SearchFilters['remoteType'],
  location: string,
): string {
  const workModeQuery = queryForWorkMode(query, remoteType);
  const locationHint = location.trim() && remoteType !== 'remote'
    ? ` near "${location.trim()}"`
    : '';
  return `${workModeQuery} jobs${locationHint} (${PUBLIC_ATS_SITE_QUERY})`;
}

function titleCaseToken(token: string): string {
  if (/^[a-z0-9]{2,5}$/.test(token)) {
    return token.toUpperCase();
  }
  return token
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function inferCompanyFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const segments = parsed.pathname.split('/').filter(Boolean);
    const subdomain = parsed.hostname.split('.')[0];

    if (hostname.includes('greenhouse.io') || hostname.includes('lever.co')) {
      return segments[0] ? titleCaseToken(segments[0]) : null;
    }

    if (
      hostname.includes('ashbyhq.com')
      || hostname.includes('smartrecruiters.com')
      || hostname.includes('workable.com')
    ) {
      return segments[0] ? titleCaseToken(segments[0]) : null;
    }

    if (
      hostname.includes('myworkdayjobs.com')
      || hostname.includes('oraclecloud.com')
      || hostname.includes('successfactors.com')
      || hostname.includes('bamboohr.com')
      || hostname.includes('jobvite.com')
    ) {
      return subdomain ? titleCaseToken(subdomain.replace(/careers?$/i, '')) : null;
    }

    if (hostname.includes('recruitee.com') || hostname.includes('personio.')) {
      return subdomain ? titleCaseToken(subdomain.replace(/^jobs-?/i, '')) : null;
    }

    if (hostname.includes('icims.com')) {
      const cleanedSubdomain = hostname
        .replace('.icims.com', '')
        .replace(/^(careers|jobs)-/i, '');
      return cleanedSubdomain ? titleCaseToken(cleanedSubdomain) : null;
    }

    return null;
  } catch {
    return null;
  }
}

function cleanOrganicTitle(rawTitle: string): string {
  return rawTitle
    .replace(/\s*[-|·]\s*(Greenhouse|Lever|Workday|Ashby|iCIMS|SmartRecruiters|Workable|Jobvite).*$/i, '')
    .replace(/\s*[-|·]\s*Careers?.*$/i, '')
    .replace(/\s*[-|·]\s*Jobs?.*$/i, '')
    .trim();
}

function splitOrganicTitle(rawTitle: string, url: string | undefined): { title: string; company: string } {
  const cleaned = cleanOrganicTitle(rawTitle);
  const inferredCompany = inferCompanyFromUrl(url);

  const applicationMatch = cleaned.match(/^Job Application for\s+(.+?)\s+at\s+(.+)$/i);
  if (applicationMatch) {
    return {
      title: applicationMatch[1]?.trim() || cleaned,
      company: applicationMatch[2]?.trim() || inferredCompany || 'Unknown Company',
    };
  }

  const atMatch = cleaned.match(/^(.+?)\s+at\s+(.+)$/i);
  if (atMatch) {
    return {
      title: atMatch[1]?.trim() || cleaned,
      company: atMatch[2]?.trim() || inferredCompany || 'Unknown Company',
    };
  }

  const dashParts = cleaned.split(/\s+[-|·]\s+/).map((part) => part.trim()).filter(Boolean);
  if (dashParts.length >= 2 && inferredCompany) {
    const [first, second] = dashParts;
    if (first.toLowerCase().includes(inferredCompany.toLowerCase())) {
      return { title: second, company: first };
    }
    return { title: first, company: inferredCompany };
  }

  return {
    title: cleaned,
    company: inferredCompany || 'Unknown Company',
  };
}

function normalizeSearchToken(token: string): string {
  const normalized = token.toLowerCase().replace(/[^a-z0-9+#.]/g, '').trim();
  if (normalized === 'ops') return 'operation';
  if (normalized === 'operational') return 'operation';
  if (normalized === 'operations') return 'operation';
  if (normalized === 'systems') return 'system';
  if (normalized === 'products') return 'product';
  if (normalized === 'managers') return 'manager';
  if (normalized === 'directors') return 'director';
  if (normalized.length > 4 && normalized.endsWith('s') && !normalized.endsWith('ss')) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function tokenizeSearchText(value: string): string[] {
  return value
    .split(/[\s,/|()[\]{}"':;–—-]+/)
    .map(normalizeSearchToken)
    .filter((token) => token.length >= 2 && !QUERY_STOP_WORDS.has(token));
}

function tokenSet(value: string): Set<string> {
  return new Set(tokenizeSearchText(value));
}

function hasToken(tokens: Set<string>, token: string): boolean {
  return tokens.has(token) || (token === 'operation' && tokens.has('ops'));
}

function passesQueryRelevance(job: SerperJob, query: string): boolean {
  const queryTokens = Array.from(new Set(tokenizeSearchText(query)));
  if (queryTokens.length <= 1) return true;

  const titleTokens = tokenSet(job.title ?? '');
  const fullTokens = tokenSet(`${job.title ?? ''} ${job.snippet ?? ''}`);
  const titleMatches = queryTokens.filter((token) => hasToken(titleTokens, token));
  if (titleMatches.length === 0) return false;

  if (titleMatches.some((token) => !SENIORITY_ONLY_TOKENS.has(token))) return true;

  const fullMatches = queryTokens.filter((token) => hasToken(fullTokens, token));
  return fullMatches.some((token) => !SENIORITY_ONLY_TOKENS.has(token)) || fullMatches.length >= 2;
}

function isLikelyConcreteAtsJob(title: string, rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;
  const cleanedTitle = cleanOrganicTitle(title);
  if (!cleanedTitle || GENERIC_ATS_TITLE_PATTERN.test(cleanedTitle)) return false;

  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase().replace(/\/+$/, '');
    const search = url.search.toLowerCase();

    if (
      search.includes('refreshfacet')
      || path === ''
      || path === '/'
      || path === '/jobs'
      || path === '/job-search'
      || path === '/search'
      || path.endsWith('/jobs')
      || path.endsWith('/careers')
      || path.includes('/search/')
    ) {
      return false;
    }

    if ((host.includes('myworkdayjobs.com') || host.includes('workdayjobs.com')) && !path.includes('/job/')) {
      return false;
    }
    if (host.includes('oraclecloud.com') && !path.includes('/job/')) {
      return false;
    }
    if (host.includes('successfactors.com') && !path.includes('/job/')) {
      return false;
    }
    if (host.includes('greenhouse.io') && !/\/jobs?\/\d+/i.test(path)) {
      return false;
    }
    if (host.includes('lever.co') && path.split('/').filter(Boolean).length < 2) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

// ─── Employment type extraction ───────────────────────────────────────────────

function extractEmploymentType(extensions: string[]): string | null {
  for (const ext of extensions) {
    const lower = ext.toLowerCase().trim();
    if (lower === 'full-time' || lower === 'full time') return 'full-time';
    if (lower === 'part-time' || lower === 'part time') return 'part-time';
    if (lower === 'contract') return 'contract';
    if (lower === 'internship') return 'internship';
    if (lower === 'temporary') return 'temporary';
  }
  return null;
}

// ─── Stable external ID ───────────────────────────────────────────────────────

function buildStableExternalId(
  title: string,
  company: string,
  link: string | undefined,
): string {
  const identity = [
    (link ?? '').trim().toLowerCase(),
    title.trim().toLowerCase(),
    company.trim().toLowerCase(),
  ].join('|');
  const digest = createHash('sha1').update(identity).digest('hex').slice(0, 16);
  return `serper_${digest}`;
}

function queryForWorkMode(query: string, remoteType: SearchFilters['remoteType']): string {
  if (!remoteType || remoteType === 'any') return query;
  const workModeTerm = remoteType === 'onsite' ? 'on-site' : remoteType;
  return `${query} ${workModeTerm}`;
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class SerperJobsAdapter implements SearchAdapter {
  readonly name = 'serper';
  private diagnostics: SearchProviderDiagnostic[] = [];

  getDiagnostics(): SearchProviderDiagnostic[] {
    return this.diagnostics;
  }

  private setDiagnostic(diagnostic: Omit<SearchProviderDiagnostic, 'provider'>): void {
    this.diagnostics = [{ provider: this.name, ...diagnostic }];
  }

  async search(
    query: string,
    location: string,
    filters: SearchFilters,
  ): Promise<JobResult[]> {
    this.diagnostics = [];
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
      logger.warn(
        { adapter: this.name },
        'SERPER_API_KEY not set — skipping Serper Jobs adapter',
      );
      this.setDiagnostic({
        status: 'missing_key',
        message: 'Serper is not configured, so public job search cannot query ATS-hosted job pages.',
        jobs_returned: 0,
      });
      return [];
    }

    const searchQuery = buildSearchQuery(query, filters.remoteType, location);
    const requestBody: Record<string, unknown> = {
      q: searchQuery,
      gl: 'us',
      num: 20,
    };

    if (location && filters.remoteType !== 'remote') {
      requestBody.location = location;
    }

    const maxDaysOld = freshnessDaysForDatePosted(filters.datePosted);
    const tbs = googleTbsForFreshnessDays(maxDaysOld);
    if (tbs) {
      requestBody.tbs = tbs;
    }

    try {
      const response = await fetch(SERPER_SEARCH_URL, {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        logger.warn(
          { adapter: this.name, status: response.status, query: searchQuery },
          'Serper Search API returned non-OK status',
        );
        this.setDiagnostic({
          status: 'http_error',
          message: response.status === 401 || response.status === 403
            ? 'Serper rejected the configured API key.'
            : response.status === 402 || response.status === 429
              ? 'Serper did not return jobs because the API quota or rate limit was hit.'
              : 'Serper returned an upstream error before jobs could be read.',
          http_status: response.status,
          jobs_returned: 0,
        });
        return [];
      }

      const data = (await response.json()) as SerperJobsResponse;
      const jobs = (data.jobs ?? [])
        .filter((job) => Boolean(job.title))
        .filter((job) => passesQueryRelevance(job, query));
      const organicJobs = (data.organic ?? [])
        .filter((result): result is Required<Pick<SerperOrganicResult, 'title' | 'link'>> & SerperOrganicResult =>
          Boolean(
            result.title
              && result.link
              && isKnownATSUrl(result.link)
              && isLikelyConcreteAtsJob(result.title, result.link),
          ),
        )
        .map((result): SerperJob => {
          const { title, company } = splitOrganicTitle(result.title, result.link);
          return {
            title,
            companyName: company,
            location: filters.remoteType === 'remote' ? undefined : location || undefined,
            source: 'Google Search',
            date: result.date ?? findPostedDateText(result.snippet) ?? undefined,
            snippet: result.snippet,
            link: result.link,
            extensions: [],
          };
        })
        .filter((job) => passesQueryRelevance(job, query));
      const allJobs = [...jobs, ...organicJobs];
      this.setDiagnostic({
        status: 'ok',
        message: allJobs.length > 0
          ? `Serper returned ${allJobs.length} raw job result${allJobs.length === 1 ? '' : 's'}.`
          : 'Serper responded successfully but returned no raw job results.',
        jobs_returned: allJobs.length,
      });

      logger.info(
        { adapter: this.name, query: searchQuery, location, jobCount: allJobs.length },
        'Serper Search adapter returned job results',
      );

      return allJobs
        .filter((job): job is Required<Pick<SerperJob, 'title'>> & SerperJob =>
          Boolean(job.title),
        )
        .map((job): JobResult | null => {
          const title = job.title ?? 'Unknown Title';
          const company = job.companyName ?? 'Unknown Company';
          const extensions = job.extensions ?? [];
          const { salary_min, salary_max } = extractSalary(extensions);
          const postedDate = normalizeJobPostedDate(job.date);
          const workMode = classifyWorkMode(
            title,
            job.snippet ?? '',
            job.location ?? undefined,
            extensions,
          );

          return {
            external_id: buildStableExternalId(title, company, job.link),
            title,
            company,
            location: job.location ?? null,
            salary_min,
            salary_max,
            description: job.snippet ?? null,
            posted_date: postedDate ? postedDate.toISOString() : null,
            apply_url: job.link ?? null,
            source: job.source ? `serper:${job.source.toLowerCase()}` : this.name,
            remote_type: workMode === 'unknown' ? null : workMode,
            employment_type: extractEmploymentType(extensions),
            required_skills: null,
          };
        })
        .filter((job): job is JobResult => job !== null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { adapter: this.name, error: message, query: searchQuery },
        'Serper Jobs adapter error',
      );
      this.setDiagnostic({
        status: message.toLowerCase().includes('timeout') ? 'network_error' : 'error',
        message: `Serper search failed: ${message}`,
        jobs_returned: 0,
      });
      return [];
    }
  }
}
