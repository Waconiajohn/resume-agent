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
        source: 'workday' as const,
      }));
    } catch {
      continue;
    }
  }

  logger.debug({ slug }, 'Workday API failed on all servers');
  return [];
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────

export async function fetchFromATS(platform: ATSPlatform, slug: string): Promise<ATSJob[]> {
  switch (platform) {
    case 'lever': return fetchLeverJobs(slug);
    case 'greenhouse': return fetchGreenhouseJobs(slug);
    case 'ashby': return fetchAshbyJobs(slug);
    case 'workday': return fetchWorkdayJobs(slug);
    default: return [];
  }
}

// ─── Utility ────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
