/**
 * ATS API Clients — Free, unauthenticated public job board APIs.
 *
 * Tier 1 of the three-tier job scanning strategy.
 * Each function hits a specific ATS platform's public endpoint and
 * returns normalized ATSJob[] results.
 */

import logger from '../logger.js';
import type { ATSJob, ATSPlatform } from './types.js';

const REQUEST_TIMEOUT_MS = 10_000;

// ─── Lever ──────────────────────────────────────────────────────────────────

interface LeverPosting {
  text: string;
  hostedUrl?: string;
  categories?: { location?: string; team?: string; commitment?: string };
  descriptionPlain?: string;
  createdAt?: number;
}

export async function fetchLeverJobs(slug: string): Promise<ATSJob[]> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) return [];
    const postings = (await res.json()) as LeverPosting[];
    if (!Array.isArray(postings)) return [];

    return postings.map((p) => ({
      title: p.text,
      url: p.hostedUrl ?? null,
      location: p.categories?.location ?? null,
      salaryRange: null,
      descriptionSnippet: p.descriptionPlain?.slice(0, 300) ?? null,
      postedOn: p.createdAt ? new Date(p.createdAt).toISOString() : null,
      source: 'lever' as const,
    }));
  } catch (err) {
    logger.debug({ err, slug }, 'Lever API failed');
    return [];
  }
}

// ─── Greenhouse ─────────────────────────────────────────────────────────────

interface GreenhouseJob {
  title: string;
  absolute_url?: string;
  location?: { name?: string };
  content?: string;
  updated_at?: string;
}

export async function fetchGreenhouseJobs(slug: string): Promise<ATSJob[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) return [];
    const data = (await res.json()) as { jobs?: GreenhouseJob[] };
    if (!Array.isArray(data.jobs)) return [];

    return data.jobs.map((j) => ({
      title: j.title,
      url: j.absolute_url ?? null,
      location: j.location?.name ?? null,
      salaryRange: null,
      descriptionSnippet: j.content ? stripHtml(j.content).slice(0, 300) : null,
      postedOn: j.updated_at ?? null,
      source: 'greenhouse' as const,
    }));
  } catch (err) {
    logger.debug({ err, slug }, 'Greenhouse API failed');
    return [];
  }
}

// ─── Ashby ──────────────────────────────────────────────────────────────────

interface AshbyJobSummary {
  title?: string;
  location?: string;
  employmentType?: string;
}

interface AshbyResponse {
  jobs?: AshbyJobSummary[];
}

export async function fetchAshbyJobs(slug: string): Promise<ATSJob[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) return [];
    const data = (await res.json()) as AshbyResponse;
    if (!Array.isArray(data.jobs)) return [];

    return data.jobs.map((j) => ({
      title: j.title ?? 'Unknown',
      url: `https://jobs.ashbyhq.com/${encodeURIComponent(slug)}`,
      location: j.location ?? null,
      salaryRange: null,
      descriptionSnippet: null,
      postedOn: null,
      source: 'ashby' as const,
    }));
  } catch (err) {
    logger.debug({ err, slug }, 'Ashby API failed');
    return [];
  }
}

// ─── Workday ────────────────────────────────────────────────────────────────

interface WorkdayPosting {
  title?: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
  externalPath?: string;
}

/**
 * Workday uses an undocumented but stable CXS API.
 * The slug format is "{tenant}/{site}" (e.g. "microsoft/en-us").
 * The server varies (wd1, wd5, etc.) — we try wd5 first.
 */
export async function fetchWorkdayJobs(slug: string): Promise<ATSJob[]> {
  const parts = slug.split('/');
  if (parts.length < 2) return [];
  const tenant = parts[0];
  const site = parts.slice(1).join('/');

  const servers = ['wd5', 'wd1', 'wd3'];
  for (const server of servers) {
    const url = `https://${tenant}.${server}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 20, offset: 0, appliedFacets: {} }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) continue;

      const data = (await res.json()) as { jobPostings?: WorkdayPosting[] };
      if (!Array.isArray(data.jobPostings) || data.jobPostings.length === 0) continue;

      const baseUrl = `https://${tenant}.${server}.myworkdayjobs.com/en-US/${site}`;
      return data.jobPostings.map((j) => ({
        title: j.title ?? 'Unknown',
        url: j.externalPath ? `${baseUrl}${j.externalPath}` : baseUrl,
        location: j.locationsText ?? null,
        salaryRange: null,
        descriptionSnippet: j.bulletFields?.join(' ').slice(0, 300) ?? null,
        postedOn: j.postedOn ?? null,
        source: 'workday' as const,
      }));
    } catch {
      continue;
    }
  }

  logger.debug({ slug }, 'Workday API failed on all servers');
  return [];
}

// ─── iCIMS ─────────────────────────────────────────────────────────────────
//
// iCIMS has no public JSON API. Portal pages are HTML-rendered at
// careers-{slug}.icims.com. We fetch the HTML and extract job data from
// embedded JSON-LD (Schema.org JobPosting) or structured HTML elements.
// This is best-effort — returns [] when parsing fails. Serper catches the rest.

/** URL patterns to try for iCIMS portals (slug = subdomain prefix). */
const ICIMS_URL_PATTERNS = [
  (slug: string) => `https://careers-${slug}.icims.com/jobs/search`,
  (slug: string) => `https://jobs-${slug}.icims.com/jobs/search`,
  (slug: string) => `https://${slug}.icims.com/jobs/search`,
];

export async function fetchICIMSJobs(slug: string): Promise<ATSJob[]> {
  for (const buildUrl of ICIMS_URL_PATTERNS) {
    const url = buildUrl(slug);
    try {
      const res = await fetch(url, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml',
          'User-Agent': 'Mozilla/5.0 (compatible; CareerIQ/1.0)',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) continue;

      const html = await res.text();
      if (!html || html.length < 200) continue;

      // Strategy 1: Extract JSON-LD structured data (most reliable)
      const jsonLdJobs = extractJsonLdJobs(html, url);
      if (jsonLdJobs.length > 0) return jsonLdJobs;

      // Strategy 2: Parse job links from HTML (fallback)
      const htmlJobs = extractJobLinksFromHtml(html, url);
      if (htmlJobs.length > 0) return htmlJobs;
    } catch {
      continue;
    }
  }

  logger.debug({ slug }, 'iCIMS: no jobs extracted from any URL pattern');
  return [];
}

/** Extract jobs from JSON-LD `<script type="application/ld+json">` blocks. */
function extractJsonLdJobs(html: string, baseUrl: string): ATSJob[] {
  const jobs: ATSJob[] = [];
  const jsonLdPattern = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = jsonLdPattern.exec(html)) !== null) {
    try {
      const data: unknown = JSON.parse(match[1]);
      const items = extractJobPostings(data);
      for (const item of items) {
        const title = typeof item.title === 'string' ? item.title : null;
        if (!title) continue;

        const jobUrl = typeof item.url === 'string' ? item.url : null;
        const location = extractJsonLdLocation(item);

        jobs.push({
          title,
          url: jobUrl ?? baseUrl,
          location,
          salaryRange: null,
          descriptionSnippet: typeof item.description === 'string'
            ? stripHtml(item.description).slice(0, 300)
            : null,
          postedOn: typeof item.datePosted === 'string' ? item.datePosted : null,
          source: 'icims',
        });
      }
    } catch {
      // Malformed JSON-LD — skip this block
    }
  }

  return jobs;
}

/** Unwrap JSON-LD: handles single JobPosting, arrays, and ItemList wrappers. */
function extractJobPostings(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter((d) => d && typeof d === 'object' && (d as Record<string, unknown>)['@type'] === 'JobPosting') as Record<string, unknown>[];
  }
  if (!data || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  if (obj['@type'] === 'JobPosting') return [obj];
  // ItemList with itemListElement array
  if (obj['@type'] === 'ItemList' && Array.isArray(obj.itemListElement)) {
    return (obj.itemListElement as Record<string, unknown>[])
      .map((el) => (el.item ?? el) as Record<string, unknown>)
      .filter((el) => el['@type'] === 'JobPosting');
  }
  return [];
}

function extractJsonLdLocation(item: Record<string, unknown>): string | null {
  const loc = item.jobLocation as Record<string, unknown> | undefined;
  if (!loc) return null;
  const address = loc.address as Record<string, unknown> | undefined;
  if (!address) return typeof loc.name === 'string' ? loc.name : null;
  const parts = [address.addressLocality, address.addressRegion].filter((p) => typeof p === 'string');
  return parts.length > 0 ? parts.join(', ') : null;
}

/** Fallback: extract job titles and URLs from iCIMS HTML structure. */
function extractJobLinksFromHtml(html: string, baseUrl: string): ATSJob[] {
  const jobs: ATSJob[] = [];
  const seen = new Set<string>();
  const baseOrigin = new URL(baseUrl).origin;

  // iCIMS job links typically follow pattern: /jobs/{id}/job or /jobs/{id}/{title-slug}
  const linkPattern = /<a[^>]+href=["']([^"']*\/jobs\/\d+[^"']*)["'][^>]*>([^<]+)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1];
    const title = match[2].trim();
    if (!title || title.length < 3) continue;

    // Skip navigation/filter links
    if (/search|filter|category|page|sort/i.test(title)) continue;

    const fullUrl = href.startsWith('http') ? href : `${baseOrigin}${href}`;
    const key = fullUrl.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    jobs.push({
      title,
      url: fullUrl,
      location: null,
      salaryRange: null,
      descriptionSnippet: null,
      postedOn: null,
      source: 'icims',
    });
  }

  return jobs;
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────

export async function fetchFromATS(platform: ATSPlatform, slug: string): Promise<ATSJob[]> {
  switch (platform) {
    case 'lever': return fetchLeverJobs(slug);
    case 'greenhouse': return fetchGreenhouseJobs(slug);
    case 'ashby': return fetchAshbyJobs(slug);
    case 'workday': return fetchWorkdayJobs(slug);
    case 'icims': return fetchICIMSJobs(slug);
    default: return [];
  }
}

// ─── Utility ────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
