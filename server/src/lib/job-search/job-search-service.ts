/**
 * Job Search Service — Business logic extracted from routes/job-search.ts
 *
 * Contains the search pipeline orchestration, AI scoring pipeline, and
 * NI contact enrichment pipeline. Route handlers call these functions and
 * return the results.
 */

import { supabaseAdmin } from '../supabase.js';
import logger from '../logger.js';
import { searchAllSources } from './index.js';
import { SerperJobsAdapter } from './adapters/serper-jobs.js';
import { FirecrawlAdapter } from './adapters/firecrawl.js';
import { matchJobsToProfile } from './ai-matcher.js';
import { crossReferenceWithNetwork } from './ni-crossref.js';
import { enrichWithReferralBonuses } from './referral-enrichment.js';
import type { JobResult, SearchFilters } from './types.js';

export type { SearchFilters };

export interface SearchPipelineResult {
  scan_id: string;
  jobs: JobResult[];
  executionTimeMs: number;
  sources_queried: string[];
}

export interface ScorePipelineResult {
  scored_count: number;
  results: Array<{ external_id: string; match_score: number }>;
}

type UnscoredRow = {
  id: string;
  listing_id: string;
  job_listings: {
    external_id: string;
    source: string;
    title: string;
    company: string;
    location: string | null;
    description: string | null;
    salary_min: number | null;
    salary_max: number | null;
    posted_date: string | null;
    apply_url: string | null;
    remote_type: string | null;
    employment_type: string | null;
    required_skills: string[] | null;
  } | null;
};

type JobStub = { external_id: string; company: string };

// ─── Search pipeline ──────────────────────────────────────────────────────────

/**
 * Executes the full search pipeline:
 * 1. Fan-out to Firecrawl adapter
 * 2. Persist scan record
 * 3. Upsert job listings
 * 4. Insert job_search_results join records
 *
 * Returns null (with an error reason) if scan persistence fails.
 */
export async function runSearchPipeline(
  userId: string,
  query: string,
  location: string,
  filters: SearchFilters,
): Promise<{ ok: true; result: SearchPipelineResult } | { ok: false; error: string; status: number }> {
  // Serper Google Jobs is primary — structured data aggregated from all major boards.
  // Firecrawl is fallback — web scraping when Serper is unavailable or unkeyed.
  const adapters = [
    new SerperJobsAdapter(),
    ...(process.env.FIRECRAWL_API_KEY ? [new FirecrawlAdapter()] : []),
  ];

  logger.info(
    { userId, query, location, filters },
    'Job search started',
  );

  const searchResult = await searchAllSources(query, location, filters, adapters);

  // Persist scan record
  const { data: scanData, error: scanError } = await supabaseAdmin
    .from('job_search_scans')
    .insert({
      user_id: userId,
      query,
      location: location || null,
      filters,
      result_count: searchResult.jobs.length,
      sources_queried: searchResult.sources_queried,
      execution_time_ms: searchResult.executionTimeMs,
    })
    .select('id')
    .single();

  if (scanError || !scanData) {
    const message = scanError?.message ?? 'Failed to persist scan';
    logger.error({ userId, error: message }, 'Failed to persist job search scan');
    return { ok: false, error: 'Failed to save search results', status: 500 };
  }

  const scanId = scanData.id as string;

  if (searchResult.jobs.length === 0) {
    logger.info(
      { userId, scanId, executionTimeMs: searchResult.executionTimeMs },
      'Job search returned no results',
    );
    return {
      ok: true,
      result: {
        scan_id: scanId,
        jobs: [],
        executionTimeMs: searchResult.executionTimeMs,
        sources_queried: searchResult.sources_queried,
      },
    };
  }

  // Upsert job listings (unique on external_id + source)
  const listingRows = searchResult.jobs.map((job: JobResult) => ({
    external_id: job.external_id,
    source: job.source,
    title: job.title,
    company: job.company,
    location: job.location,
    salary_min: job.salary_min,
    salary_max: job.salary_max,
    description: job.description,
    posted_date: job.posted_date,
    apply_url: job.apply_url,
    remote_type: job.remote_type,
    employment_type: job.employment_type,
    required_skills: job.required_skills ? JSON.stringify(job.required_skills) : null,
  }));

  const { data: listingData, error: listingError } = await supabaseAdmin
    .from('job_listings')
    .upsert(listingRows, { onConflict: 'external_id,source', ignoreDuplicates: false })
    .select('id, external_id, source');

  if (listingError || !listingData) {
    const message = listingError?.message ?? 'Upsert failed';
    logger.error({ userId, scanId, error: message }, 'Failed to upsert job listings');
    return { ok: false, error: 'Failed to save job listings', status: 500 };
  }

  // Build a map from external_id+source to listing id for result linking
  const listingIdMap = new Map<string, string>();
  for (const listing of listingData) {
    const key = `${listing.external_id as string}|${listing.source as string}`;
    listingIdMap.set(key, listing.id as string);
  }

  // Insert job_search_results join records
  const resultRows = searchResult.jobs
    .map((job: JobResult) => {
      const key = `${job.external_id}|${job.source}`;
      const listingId = listingIdMap.get(key);
      if (!listingId) return null;
      return {
        scan_id: scanId,
        listing_id: listingId,
        user_id: userId,
        status: 'new' as const,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (resultRows.length > 0) {
    const { error: resultsError } = await supabaseAdmin
      .from('job_search_results')
      .insert(resultRows);

    if (resultsError) {
      // Non-fatal: scan and listings are persisted; log and continue
      logger.warn(
        { userId, scanId, error: resultsError.message },
        'Failed to insert job_search_results — scan and listings are persisted',
      );
    }
  }

  logger.info(
    {
      userId,
      scanId,
      jobCount: searchResult.jobs.length,
      sources: searchResult.sources_queried,
      executionTimeMs: searchResult.executionTimeMs,
    },
    'Job search complete',
  );

  return {
    ok: true,
    result: {
      scan_id: scanId,
      jobs: searchResult.jobs,
      executionTimeMs: searchResult.executionTimeMs,
      sources_queried: searchResult.sources_queried,
    },
  };
}

// ─── Score pipeline ───────────────────────────────────────────────────────────

/**
 * Fetches unscored results for a scan, runs AI matching, and writes scores back.
 */
export async function runScorePipeline(
  userId: string,
  scanId: string,
): Promise<{ ok: true; result: ScorePipelineResult } | { ok: false; error: string; status: number }> {
  // Load unscored results joined with listing data
  const { data: unscoredRows, error: fetchError } = await supabaseAdmin
    .from('job_search_results')
    .select(`
      id,
      listing_id,
      job_listings (
        external_id,
        source,
        title,
        company,
        location,
        description,
        salary_min,
        salary_max,
        posted_date,
        apply_url,
        remote_type,
        employment_type,
        required_skills
      )
    `)
    .eq('scan_id', scanId)
    .eq('user_id', userId)
    .is('match_score', null);

  if (fetchError) {
    logger.error(
      { userId, scanId, error: fetchError.message },
      'score: failed to fetch unscored results',
    );
    return { ok: false, error: 'Failed to fetch unscored results', status: 500 };
  }

  if (!unscoredRows || unscoredRows.length === 0) {
    return { ok: true, result: { scored_count: 0, results: [] } };
  }

  const rows = unscoredRows as unknown as UnscoredRow[];
  const jobs: JobResult[] = rows
    .filter((row) => row.job_listings !== null)
    .map((row) => {
      const l = row.job_listings!;
      return {
        external_id: l.external_id,
        title: l.title,
        company: l.company,
        location: l.location,
        salary_min: l.salary_min,
        salary_max: l.salary_max,
        description: l.description,
        posted_date: l.posted_date ?? new Date().toISOString(),
        apply_url: l.apply_url,
        source: l.source,
        remote_type: l.remote_type,
        employment_type: l.employment_type,
        required_skills: l.required_skills,
      };
    });

  logger.info(
    { userId, scanId, jobCount: jobs.length },
    'score: calling AI matcher',
  );

  const matchResults = await matchJobsToProfile(userId, jobs);

  // Build a map from external_id to match result for DB updates
  const matchMap = new Map(matchResults.map((m) => [m.external_id, m]));

  // Update match_score for each scored result row
  const updatePromises = rows
    .filter((row) => row.job_listings !== null)
    .map(async (row) => {
      const externalId = row.job_listings!.external_id;
      const match = matchMap.get(externalId);
      if (!match) return;

      const { error: updateError } = await supabaseAdmin
        .from('job_search_results')
        .update({ match_score: match.match_score })
        .eq('id', row.id);

      if (updateError) {
        logger.warn(
          { resultId: row.id, externalId, error: updateError.message },
          'score: failed to update match_score for result',
        );
      }
    });

  await Promise.allSettled(updatePromises);

  logger.info(
    {
      userId,
      scanId,
      scoredCount: matchResults.length,
      totalUnscored: jobs.length,
    },
    'score: AI scoring complete',
  );

  return {
    ok: true,
    result: {
      scored_count: matchResults.length,
      results: matchResults,
    },
  };
}

// ─── Enrichment pipeline ──────────────────────────────────────────────────────

/**
 * Fetches scan results joined with listing data, then enriches each result
 * with NI network contacts via crossReferenceWithNetwork.
 */
export async function runEnrichmentPipeline(
  userId: string,
  scanId: string,
): Promise<{
  ok: true;
  result: { scan_id: string; results: Array<Record<string, unknown>> };
} | { ok: false; error: string; status: number }> {
  // Fetch results joined with listing data
  const { data: resultRows, error: resultsError } = await supabaseAdmin
    .from('job_search_results')
    .select(`
      id,
      scan_id,
      listing_id,
      user_id,
      status,
      match_score,
      created_at,
      updated_at,
      job_listings (
        id,
        external_id,
        source,
        title,
        company,
        location,
        salary_min,
        salary_max,
        description,
        posted_date,
        apply_url,
        remote_type,
        employment_type,
        required_skills
      )
    `)
    .eq('scan_id', scanId)
    .eq('user_id', userId)
    .order('match_score', { ascending: false, nullsFirst: false });

  if (resultsError) {
    logger.error(
      { userId, scanId, error: resultsError.message },
      'enriched: failed to fetch results',
    );
    return { ok: false, error: 'Failed to fetch scan results', status: 500 };
  }

  const rows = resultRows ?? [];

  if (rows.length === 0) {
    return { ok: true, result: { scan_id: scanId, results: [] } };
  }

  // Cross-reference with NI contacts and referral bonus programs
  type ResultRow = {
    job_listings: { external_id: string; company: string } | null;
  };
  const jobStubs: JobStub[] = (rows as unknown as ResultRow[])
    .filter((r) => r.job_listings !== null)
    .map((r) => ({
      external_id: r.job_listings!.external_id,
      company: r.job_listings!.company,
    }));

  const companyNames = [...new Set(jobStubs.map((s) => s.company))];

  const [contactMap, referralMap] = await Promise.all([
    crossReferenceWithNetwork(userId, jobStubs),
    enrichWithReferralBonuses(companyNames),
  ]);

  type AnyRow = Record<string, unknown>;
  const enrichedRows = (rows as AnyRow[]).map((row) => {
    const listing = row.job_listings as { external_id: string; company: string } | null;
    if (!listing) return { ...row, network_contacts: [], referral_bonus: null };
    const contacts = contactMap.get(listing.external_id) ?? [];
    const referralBonus = referralMap.get(listing.company) ?? null;
    return { ...row, network_contacts: contacts, referral_bonus: referralBonus };
  });

  logger.info(
    {
      userId,
      scanId,
      resultCount: rows.length,
      matchedJobs: contactMap.size,
      referralMatches: referralMap.size,
    },
    'enriched: complete',
  );

  return { ok: true, result: { scan_id: scanId, results: enrichedRows } };
}

/**
 * Enriches scan results already in memory with NI contacts and referral bonuses
 * (best-effort). Used by the /scans/latest route when include_contacts=true.
 */
export async function enrichRowsWithContacts(
  userId: string,
  rows: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  type ResultRow = {
    job_listings: { external_id: string; company: string } | null;
  };
  const jobStubs: JobStub[] = (rows as unknown as ResultRow[])
    .filter((r) => r.job_listings !== null)
    .map((r) => ({
      external_id: r.job_listings!.external_id,
      company: r.job_listings!.company,
    }));

  const companyNames = [...new Set(jobStubs.map((s) => s.company))];

  const [contactMap, referralMap] = await Promise.all([
    crossReferenceWithNetwork(userId, jobStubs),
    enrichWithReferralBonuses(companyNames),
  ]);

  return rows.map((row) => {
    const listing = row.job_listings as { external_id: string; company: string } | null;
    if (!listing) return row;
    const contacts = contactMap.get(listing.external_id) ?? [];
    const referralBonus = referralMap.get(listing.company) ?? null;
    return { ...row, network_contacts: contacts, referral_bonus: referralBonus };
  });
}
