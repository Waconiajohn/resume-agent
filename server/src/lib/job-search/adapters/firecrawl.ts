/**
 * Firecrawl Adapter — Web search powered job discovery via Firecrawl SDK.
 *
 * Uses @mendable/firecrawl-js SDK for search.
 * Auth: FIRECRAWL_API_KEY env var.
 * Returns empty array on missing key or any error.
 */

import FirecrawlApp from '@mendable/firecrawl-js';
import { createHash } from 'node:crypto';
import logger from '../../logger.js';
import type { SearchAdapter, SearchFilters, JobResult } from '../types.js';

/**
 * Try to extract a company name from a search result's URL or title.
 */
function extractCompanyFromResult(title: string, url: string): string {
  const atMatch = title.match(/\bat\s+(.+?)(?:\s*[-–|]|\s*$)/i);
  if (atMatch) return atMatch[1].trim();

  try {
    const hostname = new URL(url).hostname.replace(/^(www|jobs|careers|boards)\./i, '');
    const name = hostname.split('.')[0];
    if (name) return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    // fall through
  }

  return 'Unknown Company';
}

function normalizeIdentityUrl(rawUrl: string | undefined): string {
  if (!rawUrl) return '';
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

export function isLikelyJobPostingResult(title: string, rawUrl: string): boolean {
  const normalizedTitle = title.toLowerCase();
  if (
    (/\bjobs?\b/.test(normalizedTitle) && !/\bat\s+/.test(normalizedTitle))
    || /\b(job listings|career opportunities)\b/.test(normalizedTitle)
    || /\b(jobs|employment|openings)\s+in\b/.test(normalizedTitle)
    || /\b(hiring now|best .+ jobs|job search|salary|salaries|compensation)\b/.test(normalizedTitle)
    || /\b\d+\s+(chief|director|vp|manager|operations?|manufacturing|engineer).+\s+jobs?\b/.test(normalizedTitle)
  ) {
    return false;
  }

  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    const search = url.search.toLowerCase();
    const full = `${host}${path}${search}`;

    if (
      full.includes('/salaries/')
      || full.includes('/research/salary/')
      || path === '/jobs'
      || path === '/search'
      || path.endsWith('/jobs.html')
      || path.includes('/q-') && path.includes('-jobs')
      || path.includes('/job/') && path.includes('/search')
      || (host.includes('linkedin.com') && /\/jobs\/[^/]+-jobs(?:-|$)/.test(path))
      || (host.includes('ziprecruiter.com') && /^\/jobs\//.test(path))
      || (host.includes('glassdoor.com') && path.includes('-jobs-'))
      || (host.includes('simplyhired.com') && path.includes('/search'))
      || (host.includes('indeed.com') && path !== '/viewjob')
    ) {
      return false;
    }

    if (
      (host.includes('indeed.com') && path === '/viewjob' && search.includes('jk='))
      || (host.includes('linkedin.com') && path.includes('/jobs/view/'))
      || host.includes('greenhouse.io')
      || host.includes('lever.co')
      || host.includes('workdayjobs.com')
      || path.includes('/job-listing/opening/')
      || /\/jobs?\/[^/]+/.test(path)
    ) {
      return true;
    }
  } catch {
    // Fall through to conservative title heuristic.
  }

  return /\b(chief|coo|cto|cfo|vp|vice president|director|manager|lead|head)\b/i.test(title)
    && !/\bjobs?\b/i.test(title);
}

function buildStableExternalId(title: string, company: string, url: string | undefined): string {
  const identity = [
    normalizeIdentityUrl(url),
    title.trim().toLowerCase(),
    company.trim().toLowerCase(),
  ].join('|');
  const digest = createHash('sha1').update(identity).digest('hex').slice(0, 16);
  return `firecrawl_${digest}`;
}

export class FirecrawlAdapter implements SearchAdapter {
  readonly name = 'firecrawl';

  async search(query: string, location: string, _filters: SearchFilters): Promise<JobResult[]> {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      logger.warn({ adapter: this.name }, 'FIRECRAWL_API_KEY not set — skipping adapter');
      return [];
    }

    try {
      const fc = new FirecrawlApp({ apiKey });
      const searchQuery = location ? `${query} jobs in ${location}` : `${query} jobs`;

      const result = await fc.search(searchQuery, { limit: 20 });
      const webResults = (result.web ?? []) as Array<{ url?: string; title?: string; description?: string }>;

      return webResults
        .filter((r) => r.title && r.url)
        .filter((r) => isLikelyJobPostingResult(r.title ?? '', r.url ?? ''))
        .map(
          (r): JobResult => {
            const company = extractCompanyFromResult(r.title ?? '', r.url ?? '');
            return {
              external_id: buildStableExternalId(r.title ?? 'Unknown Title', company, r.url),
              title: r.title ?? 'Unknown Title',
              company,
              location: null,
              salary_min: null,
              salary_max: null,
              description: r.description ?? null,
              posted_date: null,
              apply_url: r.url ?? null,
              source: this.name,
              remote_type: null,
              employment_type: null,
              required_skills: null,
            };
          },
        );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ adapter: this.name, error: message }, 'Firecrawl adapter error');
      return [];
    }
  }
}
