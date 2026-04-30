/**
 * Structured public job-listing search for Insider Jobs.
 *
 * This reuses the same structured provider as Broad Search, then applies
 * company-level guardrails so network searches only store roles that appear
 * to belong to the selected company.
 */

import { SerpApiGoogleJobsAdapter } from '../job-search/adapters/serpapi-google-jobs.js';
import type { JobResult, SearchFilters } from '../job-search/types.js';
import { isWithinFreshnessWindow } from '../job-date.js';
import type { ATSJob, CompanyInfo, NiScrapeFilters, NiWorkMode } from './types.js';

const GENERIC_COMPANY_TOKENS = new Set([
  'careers',
  'co',
  'company',
  'corp',
  'corporation',
  'inc',
  'incorporated',
  'jobs',
  'llc',
  'ltd',
  'limited',
  'plc',
  'the',
]);

const COMPANY_SUFFIX_PATTERN = /\s*[,.]?\s*\b(Inc|LLC|Ltd|Corp|Co|PLC|GmbH|SA|BV|Pty|Limited|Incorporated|Corporation|Company)\.?\s*$/i;

function cleanQueryTerm(value: string): string {
  return value.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
}

function buildQueries(companyName: string, targetTitles: string[]): string[] {
  const cleanTitles = [...new Set(targetTitles.map((title) => title.trim()).filter(Boolean))];
  const company = cleanQueryTerm(companyName);
  if (cleanTitles.length === 0) return [company];

  return cleanTitles.map((title) => `${company} ${cleanQueryTerm(title)}`);
}

function datePostedForDays(maxDaysOld: number | undefined): SearchFilters['datePosted'] {
  if (!maxDaysOld || maxDaysOld <= 7) {
    if (maxDaysOld && maxDaysOld <= 1) return '24h';
    if (maxDaysOld && maxDaysOld <= 3) return '3d';
    return '7d';
  }
  if (maxDaysOld <= 14) return '14d';
  return '30d';
}

function remoteTypeForModes(filters: NiScrapeFilters): SearchFilters['remoteType'] {
  const selectedModes = filters.work_modes?.length
    ? [...new Set(filters.work_modes)]
    : filters.remote_only
      ? ['remote' as NiWorkMode]
      : [];

  if (selectedModes.length !== 1) return 'any';
  return selectedModes[0];
}

function toSearchFilters(filters: NiScrapeFilters): SearchFilters {
  return {
    datePosted: datePostedForDays(filters.max_days_old),
    remoteType: remoteTypeForModes(filters),
  };
}

function normalizeTokens(value: string | null | undefined): Set<string> {
  let company = (value ?? '').trim();
  let previous = '';
  while (previous !== company) {
    previous = company;
    company = company.replace(COMPANY_SUFFIX_PATTERN, '').trim();
  }

  const normalized = company
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !GENERIC_COMPANY_TOKENS.has(token));
  return new Set(normalized);
}

function tokenSetContainsAll(haystack: Set<string>, needles: Set<string>): boolean {
  if (needles.size === 0) return false;
  for (const token of needles) {
    if (!haystack.has(token)) return false;
  }
  return true;
}

function normalizeDomain(domain: string | null | undefined): string | null {
  const clean = domain?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  return clean || null;
}

function urlMatchesCompanyDomain(url: string | null, companyDomain: string | null | undefined): boolean {
  const domain = normalizeDomain(companyDomain);
  if (!url || !domain) return false;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

function companyMatches(job: JobResult, company: CompanyInfo): boolean {
  const requested = normalizeTokens(company.name);
  const returned = normalizeTokens(job.company);
  return tokenSetContainsAll(returned, requested)
    || tokenSetContainsAll(requested, returned)
    || urlMatchesCompanyDomain(job.apply_url, company.domain);
}

function withinMaxAge(job: JobResult, maxDaysOld: number): boolean {
  const cappedDays = Math.max(1, Math.min(maxDaysOld, 30));
  return isWithinFreshnessWindow(job.posted_date, cappedDays);
}

function formatSalaryRange(job: JobResult): string | null {
  if (job.salary_min == null && job.salary_max == null) return null;
  const formatValue = (value: number) => (
    value >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value}`
  );
  if (job.salary_min != null && job.salary_max != null) {
    return `${formatValue(job.salary_min)}-${formatValue(job.salary_max)}`;
  }
  if (job.salary_min != null) return `${formatValue(job.salary_min)}+`;
  return job.salary_max != null ? `Up to ${formatValue(job.salary_max)}` : null;
}

function mapToATSJob(job: JobResult): ATSJob {
  return {
    title: job.title,
    url: job.apply_url,
    location: job.location,
    salaryRange: formatSalaryRange(job),
    descriptionSnippet: job.description?.slice(0, 300) ?? null,
    postedOn: job.posted_date,
    source: 'serpapi',
  };
}

export async function searchCompanyJobsViaSerpApi(
  company: CompanyInfo,
  targetTitles: string[],
  filters: NiScrapeFilters,
): Promise<ATSJob[]> {
  if (!process.env.SERPAPI_API_KEY) return [];

  const adapter = new SerpApiGoogleJobsAdapter();
  const searchFilters = toSearchFilters(filters);
  const location = searchFilters.remoteType === 'remote' ? '' : filters.location?.trim() ?? '';
  const jobs: ATSJob[] = [];

  for (const query of buildQueries(company.name, targetTitles)) {
    const results = await adapter.search(query, location, searchFilters);
    jobs.push(
      ...results
        .filter((job) => withinMaxAge(job, filters.max_days_old))
        .filter((job) => companyMatches(job, company))
        .map(mapToATSJob),
    );
  }

  const seen = new Set<string>();
  return jobs.filter((job) => {
    const key = `${job.url ?? ''}|${job.title}|${job.location ?? ''}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
