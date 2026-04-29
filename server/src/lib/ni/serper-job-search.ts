/**
 * Serper Google Jobs Search — Tier 3 fallback for companies without known ATS.
 *
 * Uses Serper.dev API to search Google for job listings at specific companies.
 * Targets ATS domains in the query to maximize signal quality.
 */

import logger from '../logger.js';
import {
  findPostedDateText,
  googleTbsForFreshnessDays,
  normalizeJobPostedDate,
} from '../job-date.js';
import { isKnownATSUrl, PUBLIC_ATS_SITE_QUERY } from '../ats-search-targets.js';
import type { ATSJob, NiWorkMode } from './types.js';

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
  radiusMiles?: number,
  workModes?: NiWorkMode[],
): Promise<ATSJob[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    logger.warn('SERPER_API_KEY not configured — skipping Google Jobs search fallback');
    return [];
  }

  const allJobs: ATSJob[] = [];

  // One search per target title (or one generic search if no titles)
  const queries = targetTitles.length > 0
    ? targetTitles.map((title) => buildQuery(companyName, title, location, radiusMiles, workModes))
    : [buildQuery(companyName, null, location, radiusMiles, workModes)];

  for (const query of queries) {
    try {
      // Build Serper request body with optional time filter
      const serperBody: Record<string, unknown> = { q: query, num: 10 };
      const tbs = googleTbsForFreshnessDays(maxDaysOld);
      if (tbs) serperBody.tbs = tbs;

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

function buildQuery(
  companyName: string,
  targetTitle: string | null,
  location?: string,
  radiusMiles?: number,
  workModes?: NiWorkMode[],
): string {
  const company = `"${companyName}"`;
  const title = targetTitle ? ` "${targetTitle}"` : '';
  const workModePart = buildWorkModePart(workModes);
  const locationPart = location && location.trim().length > 0
    ? radiusMiles && radiusMiles > 0
      ? ` within ${radiusMiles} miles of "${location.trim()}"`
      : ` near "${location.trim()}"`
    : '';
  return `${company}${title}${workModePart}${locationPart} (${PUBLIC_ATS_SITE_QUERY})`;
}

function buildWorkModePart(workModes?: NiWorkMode[]): string {
  if (!workModes?.length || workModes.length >= 3) return '';

  const uniqueModes = [...new Set(workModes)];
  if (uniqueModes.length >= 3) return '';

  const terms = uniqueModes.map((mode) => (mode === 'onsite' ? 'on-site' : mode));
  return terms.length === 1 ? ` ${terms[0]}` : ` (${terms.join(' OR ')})`;
}

// ─── Serper Response Parsing ────────────────────────────────────────────────

interface SerperResult {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
  position?: number;
}

interface SerperResponse {
  organic?: SerperResult[];
  answerBox?: { title?: string; link?: string };
}

function parseSerperResults(data: SerperResponse, _companyName: string): ATSJob[] {
  const results: ATSJob[] = [];
  const organicResults = data.organic ?? [];

  for (const result of organicResults) {
    if (!result.link || !result.title) continue;

    // Prioritize results from known ATS domains
    if (!isKnownATSUrl(result.link)) continue;

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
      postedOn: extractPostedOn(result),
      source: 'serper',
    });
  }

  return results;
}

function extractPostedOn(result: SerperResult): string | null {
  const dateText = result.date ?? findPostedDateText(result.snippet);
  const postedDate = normalizeJobPostedDate(dateText);
  return postedDate ? postedDate.toISOString() : null;
}

function extractLocationFromSnippet(snippet?: string): string | null {
  if (!snippet) return null;
  // Common patterns: "Location: San Francisco, CA" or "San Francisco, CA · Full-time"
  const locationMatch = snippet.match(/(?:location|located in|based in)[:\s]+([^.·\n]+)/i)
    ?? snippet.match(/^([A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2})\b/);
  return locationMatch?.[1]?.trim() ?? null;
}
