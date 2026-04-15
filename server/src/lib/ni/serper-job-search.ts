/**
 * Serper Google Jobs Search — Tier 3 fallback for companies without known ATS.
 *
 * Uses Serper.dev API to search Google for job listings at specific companies.
 * Targets ATS domains in the query to maximize signal quality.
 */

import logger from '../logger.js';
import type { ATSJob } from './types.js';

const REQUEST_TIMEOUT_MS = 10_000;
const SERPER_API_URL = 'https://google.serper.dev/search';

/**
 * Search Google via Serper for job listings at a specific company.
 * Returns normalized ATSJob[] results.
 *
 * Gracefully returns [] if SERPER_API_KEY is not configured.
 *
 * @param location - Optional city/state string appended to the query (e.g. "Portland, OR")
 */
export async function searchJobsViaSerper(
  companyName: string,
  targetTitles: string[],
  location?: string,
  maxDaysOld?: number,
): Promise<ATSJob[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    logger.warn('SERPER_API_KEY not configured — skipping Google Jobs search fallback');
    return [];
  }

  const allJobs: ATSJob[] = [];

  // One search per target title (or one generic search if no titles)
  const queries = targetTitles.length > 0
    ? targetTitles.map((title) => buildQuery(companyName, title, location))
    : [buildQuery(companyName, null, location)];

  for (const query of queries) {
    try {
      // Build Serper request body with optional time filter
      const serperBody: Record<string, unknown> = { q: query, num: 10 };
      if (maxDaysOld && maxDaysOld > 0) {
        // Google tbs parameter: qdr:d = past day, qdr:d3 = past 3 days, qdr:w = past week, qdr:w2 = past 2 weeks
        if (maxDaysOld <= 1) serperBody.tbs = 'qdr:d';
        else if (maxDaysOld <= 3) serperBody.tbs = 'qdr:d3';
        else if (maxDaysOld <= 7) serperBody.tbs = 'qdr:w';
        else if (maxDaysOld <= 14) serperBody.tbs = 'qdr:w2';
      }

      const res = await fetch(SERPER_API_URL, {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(serperBody),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) {
        logger.warn({ status: res.status, query }, 'Serper API returned non-OK');
        continue;
      }

      const data = (await res.json()) as SerperResponse;
      const parsed = parseSerperResults(data, companyName);
      allJobs.push(...parsed);
    } catch (err) {
      logger.debug({ err, query }, 'Serper search failed');
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  return allJobs.filter((job) => {
    if (!job.url) return true;
    const key = job.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Query Building ─────────────────────────────────────────────────────────

function buildQuery(companyName: string, targetTitle: string | null, location?: string): string {
  const company = `"${companyName}"`;
  const title = targetTitle ? ` "${targetTitle}"` : '';
  const locationPart = location && location.trim().length > 0 ? ` near "${location.trim()}"` : '';
  const atsSites = 'site:boards.greenhouse.io OR site:jobs.lever.co OR site:myworkdayjobs.com OR site:jobs.ashbyhq.com OR site:icims.com OR site:recruitee.com OR site:apply.workable.com OR site:jobs.personio.de OR site:jobs.personio.com';
  return `${company}${title}${locationPart} (${atsSites})`;
}

// ─── Serper Response Parsing ────────────────────────────────────────────────

interface SerperResult {
  title?: string;
  link?: string;
  snippet?: string;
  position?: number;
}

interface SerperResponse {
  organic?: SerperResult[];
  answerBox?: { title?: string; link?: string };
}

/** Known ATS domains that indicate a real job listing. */
const ATS_DOMAINS = [
  'boards.greenhouse.io',
  'jobs.lever.co',
  'myworkdayjobs.com',
  'jobs.ashbyhq.com',
  'icims.com',
  'workday.com',
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'recruitee.com',
  'workable.com',
  'personio.de',
  'personio.com',
];

function isATSDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return ATS_DOMAINS.some((d) => hostname.includes(d));
  } catch {
    return false;
  }
}

function parseSerperResults(data: SerperResponse, _companyName: string): ATSJob[] {
  const results: ATSJob[] = [];
  const organicResults = data.organic ?? [];

  for (const result of organicResults) {
    if (!result.link || !result.title) continue;

    // Prioritize results from known ATS domains
    if (!isATSDomain(result.link)) continue;

    // Clean the title — remove site name suffixes
    const cleanTitle = result.title
      .replace(/\s*[-|·]\s*(Greenhouse|Lever|Workday|Ashby|iCIMS).*$/i, '')
      .replace(/\s*[-|·]\s*.*careers.*$/i, '')
      .trim();

    if (!cleanTitle || cleanTitle.length < 4) continue;

    results.push({
      title: cleanTitle,
      url: result.link,
      location: extractLocationFromSnippet(result.snippet),
      salaryRange: null,
      descriptionSnippet: result.snippet?.slice(0, 300) ?? null,
      postedOn: null,
      source: 'serper',
    });
  }

  return results;
}

function extractLocationFromSnippet(snippet?: string): string | null {
  if (!snippet) return null;
  // Common patterns: "Location: San Francisco, CA" or "San Francisco, CA · Full-time"
  const locationMatch = snippet.match(/(?:location|located in|based in)[:\s]+([^.·\n]+)/i)
    ?? snippet.match(/^([A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2})\b/);
  return locationMatch?.[1]?.trim() ?? null;
}
