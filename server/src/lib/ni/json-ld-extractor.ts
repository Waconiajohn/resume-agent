/**
 * JSON-LD Job Extractor — shared utility for extracting Schema.org JobPosting
 * objects from HTML pages that embed structured data.
 *
 * Used as Tier 1.5 in the job scanning strategy: after ATS API fails and before
 * falling back to Serper. Also used internally by the iCIMS client.
 */

import logger from '../logger.js';
import { normalizeJobPostedDate } from '../job-date.js';
import type { ATSJob } from './types.js';

const REQUEST_TIMEOUT_MS = 10_000;

// Stateless regex — must reset lastIndex before each use due to /g flag
const JSON_LD_PATTERN = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

// ─── Core Extraction Utilities ────────────────────────────────────────────────

/** Unwrap JSON-LD: handles single JobPosting, arrays, and ItemList wrappers. */
export function extractJobPostings(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter(
      (d) => d && typeof d === 'object' && (d as Record<string, unknown>)['@type'] === 'JobPosting',
    ) as Record<string, unknown>[];
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

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ─── HTML → Jobs ──────────────────────────────────────────────────────────────

/**
 * Extract ATSJob records from all JSON-LD blocks found in the provided HTML.
 * Sets source to 'jsonld'. Callers that need a different source should remap.
 */
export function extractJsonLdJobs(html: string, baseUrl: string): ATSJob[] {
  const jobs: ATSJob[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex — the /g flag makes this regex stateful
  JSON_LD_PATTERN.lastIndex = 0;

  while ((match = JSON_LD_PATTERN.exec(html)) !== null) {
    try {
      const data: unknown = JSON.parse(match[1]);
      const items = extractJobPostings(data);
      for (const item of items) {
        const title = typeof item.title === 'string' ? item.title : null;
        if (!title) continue;

        const jobUrl = typeof item.url === 'string' ? item.url : null;
        const location = extractJsonLdLocation(item);
        const postedDate = normalizeJobPostedDate(item.datePosted);
        const postedOn = postedDate ? postedDate.toISOString() : null;

        jobs.push({
          title,
          url: jobUrl ?? baseUrl,
          location,
          salaryRange: null,
          descriptionSnippet:
            typeof item.description === 'string' ? stripHtml(item.description).slice(0, 300) : null,
          postedOn,
          source: 'jsonld',
        });
      }
    } catch {
      // Malformed JSON-LD — skip this block
    }
  }

  return jobs;
}

// ─── Fetch + Extract ──────────────────────────────────────────────────────────

/**
 * Fetch a career page URL and extract job listings via JSON-LD structured data.
 * Returns [] on any error — callers should try multiple URL patterns.
 */
export async function extractJobsFromCareerPage(url: string): Promise<ATSJob[]> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; CareerIQ/1.0)',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const html = await res.text();
    if (!html || html.length < 200) return [];
    return extractJsonLdJobs(html, url);
  } catch (err) {
    logger.debug({ err, url }, 'json-ld-extractor: fetch failed');
    return [];
  }
}
