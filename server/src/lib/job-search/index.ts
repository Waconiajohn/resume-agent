/**
 * Job Search Aggregator — fans out to all registered adapters in parallel.
 *
 * - Runs all adapters concurrently via Promise.allSettled (per-adapter error isolation)
 * - Deduplicates results by normalised "title + company + location" key, keeping first seen
 * - Extracts the first title group from "(title1 OR title2)" query syntax for cleaner searches
 */

import logger from '../logger.js';
import type { SearchAdapter, SearchFilters, SearchResponse, JobResult } from './types.js';

/**
 * Normalise a job result's identity into a string key for deduplication.
 * Lowercases and trims all three fields before joining.
 */
function dedupeKey(job: JobResult): string {
  const title = (job.title ?? '').toLowerCase().trim();
  const company = (job.company ?? '').toLowerCase().trim();
  const location = (job.location ?? '').toLowerCase().trim();
  return `${title}|${company}|${location}`;
}

/**
 * Parse boolean search strings like "(VP of Engineering OR CTO)" and return
 * the first title group as the effective query for adapters that don't
 * natively support OR syntax.
 */
export function extractPrimaryQuery(query: string): string {
  const match = query.match(/\(([^)]+)\)/);
  if (!match) return query;
  const group = match[1] ?? '';
  const titles = group.split(/\s+OR\s+/i).map(t => t.trim()).filter(Boolean);
  return titles[0] ?? query;
}

/**
 * Fan out to all adapters in parallel and aggregate results.
 *
 * @param query    Raw search query (may contain OR groups)
 * @param location Location string passed to each adapter
 * @param filters  Common search filters
 * @param adapters Adapter instances to query
 */
export async function searchAllSources(
  query: string,
  location: string,
  filters: SearchFilters,
  adapters: SearchAdapter[],
): Promise<SearchResponse> {
  const startedAt = Date.now();
  const primaryQuery = extractPrimaryQuery(query);

  const settled = await Promise.allSettled(
    adapters.map(adapter => adapter.search(primaryQuery, location, filters)),
  );

  const seen = new Set<string>();
  const jobs: JobResult[] = [];
  const sources_queried: string[] = [];

  for (let i = 0; i < adapters.length; i++) {
    const adapter = adapters[i];
    const result = settled[i];

    sources_queried.push(adapter.name);

    if (result.status === 'rejected') {
      logger.warn(
        { adapter: adapter.name, reason: result.reason instanceof Error ? result.reason.message : String(result.reason) },
        'Job search adapter failed',
      );
      continue;
    }

    for (const job of result.value) {
      const key = dedupeKey(job);
      if (!seen.has(key)) {
        seen.add(key);
        jobs.push(job);
      }
    }
  }

  return {
    jobs,
    executionTimeMs: Date.now() - startedAt,
    sources_queried,
  };
}

export type { SearchAdapter, SearchFilters, SearchResponse, JobResult } from './types.js';
