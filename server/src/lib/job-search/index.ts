/**
 * Job Search Aggregator — fans out to all registered adapters in parallel.
 *
 * - Runs all adapters concurrently via Promise.allSettled (per-adapter error isolation)
 * - Deduplicates results by normalised "title + company + location" key, keeping first seen
 * - Extracts the first title group from "(title1 OR title2)" query syntax for cleaner searches
 */

import logger from '../logger.js';
import { freshnessDaysForDatePosted, isWithinFreshnessWindow } from '../job-date.js';
import type { SearchAdapter, SearchFilters, SearchResponse, JobResult, SearchFilterStats } from './types.js';

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

function matchesRemoteType(job: JobResult, filters: SearchFilters): boolean {
  const remoteType = filters.remoteType;
  if (!remoteType || remoteType === 'any') return true;
  return (job.remote_type ?? '').toLowerCase().trim() === remoteType;
}

function buildEmptyReason(filters: SearchFilters, stats: SearchFilterStats, adapterCount: number): string {
  if (adapterCount === 0) {
    return 'No job-search provider is configured for this environment.';
  }

  const providerErrors = stats.provider_diagnostics?.filter((diagnostic) => diagnostic.status !== 'ok') ?? [];
  if (providerErrors.length > 0 && stats.raw_returned === 0) {
    if (providerErrors.some((diagnostic) => diagnostic.status === 'missing_key')) {
      return 'Job search is not fully configured for this environment. Try again after the search connection is enabled.';
    }
    if (providerErrors.some((diagnostic) => diagnostic.http_status === 402 || diagnostic.http_status === 429)) {
      return 'The job listing service is temporarily unavailable because the search quota or rate limit was reached. Try again shortly.';
    }
    return 'The job listing service could not return usable results. Try again in a moment or broaden the search.';
  }

  const rawProviderReturned = stats.provider_diagnostics
    ?.reduce((total, diagnostic) => total + (diagnostic.jobs_returned ?? 0), 0) ?? 0;
  if (stats.raw_returned === 0 && rawProviderReturned > 0) {
    return `The provider returned raw jobs, but none had a readable posting date inside ${filters.datePosted}. Try a wider posted-within filter or a broader title.`;
  }

  if (stats.raw_returned === 0) {
    return stats.adapter_failures > 0
      ? 'The job-search provider did not return usable results. Try again in a moment or broaden the search.'
      : 'No jobs came back from the provider for this title and location. Try a broader title, fewer keywords, or a wider location.';
  }

  if (stats.filtered_by_freshness >= stats.raw_returned) {
    const nextWindow = filters.datePosted === '24h'
      ? 'Last 3 days'
      : filters.datePosted === '3d'
        ? 'Last 7 days'
        : filters.datePosted === '7d'
          ? 'Last 14 days'
          : filters.datePosted === '14d'
            ? 'Last 30 days'
            : null;
    return nextWindow
      ? `We found jobs, but none had a readable posting date inside ${filters.datePosted}. Try ${nextWindow} or a broader title.`
      : `We found jobs, but none had a readable posting date inside ${filters.datePosted}. Try a broader title or fewer keywords.`;
  }

  if (stats.filtered_by_work_mode >= stats.raw_returned && filters.remoteType && filters.remoteType !== 'any') {
    return `We found jobs, but none matched ${filters.remoteType}. Run remote, hybrid, and on-site as separate searches or switch work mode to Any.`;
  }

  return 'We found jobs from the provider, but they were removed by the current filters or duplicates. Broaden the filters and search again.';
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
    adapters.map((adapter) => {
      const adapterQuery = adapter.queryMode === 'raw' ? query : primaryQuery;
      return adapter.search(adapterQuery, location, filters);
    }),
  );

  const seen = new Set<string>();
  const jobs: JobResult[] = [];
  const sources_queried: string[] = [];
  const maxDaysOld = freshnessDaysForDatePosted(filters.datePosted);
  const filter_stats: SearchFilterStats = {
    raw_returned: 0,
    filtered_by_work_mode: 0,
    filtered_by_freshness: 0,
    deduped: 0,
    adapter_failures: 0,
    provider_diagnostics: [],
  };

  for (let i = 0; i < adapters.length; i++) {
    const adapter = adapters[i];
    const result = settled[i];

    sources_queried.push(adapter.name);

    if (adapter.getDiagnostics) {
      filter_stats.provider_diagnostics?.push(...adapter.getDiagnostics());
    }

    if (result.status === 'rejected') {
      filter_stats.adapter_failures += 1;
      filter_stats.provider_diagnostics?.push({
        provider: adapter.name,
        status: 'error',
        message: `${adapter.name} failed before returning results.`,
        jobs_returned: 0,
      });
      logger.warn(
        { adapter: adapter.name, reason: result.reason instanceof Error ? result.reason.message : String(result.reason) },
        'Job search adapter failed',
      );
      continue;
    }

    for (const job of result.value) {
      filter_stats.raw_returned += 1;
      if (!matchesRemoteType(job, filters)) {
        filter_stats.filtered_by_work_mode += 1;
        continue;
      }
      if (maxDaysOld && !isWithinFreshnessWindow(job.posted_date, maxDaysOld)) {
        filter_stats.filtered_by_freshness += 1;
        continue;
      }

      const key = dedupeKey(job);
      if (!seen.has(key)) {
        seen.add(key);
        jobs.push(job);
      } else {
        filter_stats.deduped += 1;
      }
    }
  }

  return {
    jobs,
    executionTimeMs: Date.now() - startedAt,
    sources_queried,
    filter_stats,
    ...(jobs.length === 0 ? { empty_reason: buildEmptyReason(filters, filter_stats, adapters.length) } : {}),
  };
}

export type { SearchAdapter, SearchFilters, SearchResponse, JobResult } from './types.js';
