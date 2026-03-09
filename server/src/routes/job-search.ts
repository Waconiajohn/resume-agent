/**
 * Job Search Routes — /api/job-search/*
 *
 * Fans out to JSearch (RapidAPI) and Adzuna adapters in parallel, deduplicates
 * results, persists a scan record plus individual job listings to the DB, and
 * returns the aggregated result set.
 *
 * Feature-flagged via FF_JOB_SEARCH.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { FF_JOB_SEARCH } from '../lib/feature-flags.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import { searchAllSources } from '../lib/job-search/index.js';
import { JSearchAdapter } from '../lib/job-search/adapters/jsearch.js';
import { AdzunaAdapter } from '../lib/job-search/adapters/adzuna.js';
import { matchJobsToProfile } from '../lib/job-search/ai-matcher.js';
import { crossReferenceWithNetwork } from '../lib/job-search/ni-crossref.js';
import type { JobResult } from '../lib/job-search/types.js';

export const jobSearchRoutes = new Hono();

// Auth required for all routes
jobSearchRoutes.use('*', authMiddleware);

// Feature flag guard
jobSearchRoutes.use('*', async (c, next) => {
  if (!FF_JOB_SEARCH) {
    return c.json({ error: 'Not found' }, 404);
  }
  await next();
});

// ─── Schemas ──────────────────────────────────────────────────────────────────

const searchFiltersSchema = z.object({
  datePosted: z.enum(['24h', '3d', '7d', '14d', '30d', 'any']).optional().default('7d'),
  remoteType: z.enum(['remote', 'hybrid', 'onsite', 'any']).optional(),
  employmentType: z.enum(['full-time', 'contract', 'freelance', 'any']).optional(),
  salaryMin: z.number().int().min(0).optional(),
  salaryMax: z.number().int().min(0).optional(),
});

const searchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  location: z.string().max(200).optional().default(''),
  filters: searchFiltersSchema.optional(),
});

// ─── POST / — Search ──────────────────────────────────────────────────────────

jobSearchRoutes.post(
  '/',
  rateLimitMiddleware(20, 60_000),
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);

    const parsed = searchRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
    }

    const { query, location, filters: rawFilters } = parsed.data;
    const filters = rawFilters ?? { datePosted: '7d' as const };

    const adapters = [new JSearchAdapter(), new AdzunaAdapter()];

    logger.info(
      { userId: user.id, query, location, filters },
      'Job search started',
    );

    const searchResult = await searchAllSources(query, location, filters, adapters);

    // Persist scan record
    const { data: scanData, error: scanError } = await supabaseAdmin
      .from('job_search_scans')
      .insert({
        user_id: user.id,
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
      logger.error({ userId: user.id, error: message }, 'Failed to persist job search scan');
      return c.json({ error: 'Failed to save search results' }, 500);
    }

    const scanId = scanData.id as string;

    if (searchResult.jobs.length === 0) {
      logger.info(
        { userId: user.id, scanId, executionTimeMs: searchResult.executionTimeMs },
        'Job search returned no results',
      );
      return c.json({
        jobs: [],
        executionTimeMs: searchResult.executionTimeMs,
        sources_queried: searchResult.sources_queried,
      });
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
      logger.error({ userId: user.id, scanId, error: message }, 'Failed to upsert job listings');
      return c.json({ error: 'Failed to save job listings' }, 500);
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
          user_id: user.id,
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
          { userId: user.id, scanId, error: resultsError.message },
          'Failed to insert job_search_results — scan and listings are persisted',
        );
      }
    }

    logger.info(
      {
        userId: user.id,
        scanId,
        jobCount: searchResult.jobs.length,
        sources: searchResult.sources_queried,
        executionTimeMs: searchResult.executionTimeMs,
      },
      'Job search complete',
    );

    return c.json({
      scan_id: scanId,
      jobs: searchResult.jobs,
      executionTimeMs: searchResult.executionTimeMs,
      sources_queried: searchResult.sources_queried,
    });
  },
);

// ─── POST /score — AI-score unscored results from a scan ──────────────────────

const scoreRequestSchema = z.object({
  scan_id: z.string().uuid(),
});

jobSearchRoutes.post(
  '/score',
  rateLimitMiddleware(5, 60_000),
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);

    const parsed = scoreRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
    }

    const { scan_id } = parsed.data;

    // Verify the scan belongs to this user
    const { data: scanCheck, error: scanCheckError } = await supabaseAdmin
      .from('job_search_scans')
      .select('id')
      .eq('id', scan_id)
      .eq('user_id', user.id)
      .single();

    if (scanCheckError || !scanCheck) {
      return c.json({ error: 'Scan not found' }, 404);
    }

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
      .eq('scan_id', scan_id)
      .eq('user_id', user.id)
      .is('match_score', null);

    if (fetchError) {
      logger.error(
        { userId: user.id, scanId: scan_id, error: fetchError.message },
        'score: failed to fetch unscored results',
      );
      return c.json({ error: 'Failed to fetch unscored results' }, 500);
    }

    if (!unscoredRows || unscoredRows.length === 0) {
      return c.json({ scored_count: 0, results: [] });
    }

    // Map DB rows to JobResult shape expected by the AI matcher
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
      { userId: user.id, scanId: scan_id, jobCount: jobs.length },
      'score: calling AI matcher',
    );

    const matchResults = await matchJobsToProfile(user.id, jobs);

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
        userId: user.id,
        scanId: scan_id,
        scoredCount: matchResults.length,
        totalUnscored: jobs.length,
      },
      'score: AI scoring complete',
    );

    return c.json({
      scored_count: matchResults.length,
      results: matchResults,
    });
  },
);

// ─── GET /scans/latest — latest scan with results ─────────────────────────────

jobSearchRoutes.get(
  '/scans/latest',
  rateLimitMiddleware(30, 60_000),
  async (c) => {
    const user = c.get('user');
    const includeContacts = c.req.query('include_contacts') === 'true';

    // Fetch the most recent scan for this user
    const { data: scan, error: scanError } = await supabaseAdmin
      .from('job_search_scans')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (scanError || !scan) {
      // No scans yet — return empty state rather than 404
      return c.json({ scan: null, results: [] });
    }

    // Fetch results for this scan, joined with listing data
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
      .eq('scan_id', scan.id as string)
      .eq('user_id', user.id)
      .order('match_score', { ascending: false, nullsFirst: false });

    if (resultsError) {
      logger.error(
        { userId: user.id, scanId: scan.id, error: resultsError.message },
        'scans/latest: failed to fetch results',
      );
      return c.json({ error: 'Failed to fetch scan results' }, 500);
    }

    const rows = resultRows ?? [];

    if (!includeContacts || rows.length === 0) {
      return c.json({ scan, results: rows });
    }

    // Enrich with NI contacts (best-effort, never blocks)
    type ResultRow = {
      job_listings: { external_id: string; company: string } | null;
    };
    const jobStubs = (rows as unknown as ResultRow[])
      .filter((r) => r.job_listings !== null)
      .map((r) => ({
        external_id: r.job_listings!.external_id,
        company: r.job_listings!.company,
      }));

    const contactMap = await crossReferenceWithNetwork(user.id, jobStubs);

    type AnyRow = Record<string, unknown>;
    const enrichedRows = (rows as AnyRow[]).map((row) => {
      const listing = row.job_listings as { external_id: string } | null;
      if (!listing) return row;
      const contacts = contactMap.get(listing.external_id) ?? [];
      return { ...row, network_contacts: contacts };
    });

    return c.json({ scan, results: enrichedRows });
  },
);

// ─── GET /enriched/:scanId — scan results enriched with NI contacts ───────────

jobSearchRoutes.get(
  '/enriched/:scanId',
  rateLimitMiddleware(20, 60_000),
  async (c) => {
    const user = c.get('user');
    const scanId = c.req.param('scanId');

    // Verify the scan belongs to this user
    const { data: scanCheck, error: scanCheckError } = await supabaseAdmin
      .from('job_search_scans')
      .select('id')
      .eq('id', scanId)
      .eq('user_id', user.id)
      .single();

    if (scanCheckError || !scanCheck) {
      return c.json({ error: 'Scan not found' }, 404);
    }

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
      .eq('user_id', user.id)
      .order('match_score', { ascending: false, nullsFirst: false });

    if (resultsError) {
      logger.error(
        { userId: user.id, scanId, error: resultsError.message },
        'enriched: failed to fetch results',
      );
      return c.json({ error: 'Failed to fetch scan results' }, 500);
    }

    const rows = resultRows ?? [];

    if (rows.length === 0) {
      return c.json({ scan_id: scanId, results: [] });
    }

    // Cross-reference with NI contacts
    type ResultRow = {
      job_listings: { external_id: string; company: string } | null;
    };
    const jobStubs = (rows as unknown as ResultRow[])
      .filter((r) => r.job_listings !== null)
      .map((r) => ({
        external_id: r.job_listings!.external_id,
        company: r.job_listings!.company,
      }));

    const contactMap = await crossReferenceWithNetwork(user.id, jobStubs);

    type AnyRow = Record<string, unknown>;
    const enrichedRows = (rows as AnyRow[]).map((row) => {
      const listing = row.job_listings as { external_id: string } | null;
      if (!listing) return { ...row, network_contacts: [] };
      const contacts = contactMap.get(listing.external_id) ?? [];
      return { ...row, network_contacts: contacts };
    });

    logger.info(
      { userId: user.id, scanId, resultCount: rows.length, matchedJobs: contactMap.size },
      'enriched: complete',
    );

    return c.json({ scan_id: scanId, results: enrichedRows });
  },
);
