/**
 * Job Search Routes — /api/job-search/*
 *
 * Fans out to ATS-aware search providers, deduplicates results, persists a scan
 * record plus individual job listings to the DB, and returns the aggregated
 * result set.
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
import {
  runSearchPipeline,
  runScorePipeline,
  runEnrichmentPipeline,
  enrichRowsWithContacts,
} from '../lib/job-search/job-search-service.js';

export const jobSearchRoutes = new Hono();

// Auth required for all routes
jobSearchRoutes.use('*', authMiddleware);

// Feature flag guard
jobSearchRoutes.use('*', async (c, next) => {
  if (!FF_JOB_SEARCH) {
    return c.json({ data: null, feature_disabled: true }, 200);
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

    const outcome = await runSearchPipeline(user.id, query, location, filters);
    if (!outcome.ok) {
      return c.json({ error: outcome.error }, outcome.status as 400 | 500);
    }

    const { result } = outcome;
    if (result.jobs.length === 0) {
      return c.json({
        scan_id: result.scan_id,
        jobs: [],
        executionTimeMs: result.executionTimeMs,
        sources_queried: result.sources_queried,
        empty_reason: result.empty_reason,
        filter_stats: result.filter_stats,
      });
    }

    return c.json({
      scan_id: result.scan_id,
      jobs: result.jobs,
      executionTimeMs: result.executionTimeMs,
      sources_queried: result.sources_queried,
      filter_stats: result.filter_stats,
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

    const outcome = await runScorePipeline(user.id, scan_id);
    if (!outcome.ok) {
      return c.json({ error: outcome.error }, outcome.status as 400 | 500);
    }

    return c.json({
      scored_count: outcome.result.scored_count,
      results: outcome.result.results,
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

    // Freshness window: honour the filter stored with the scan, default 7d.
    // A freshness-filtered result must have a known posting date. Unknown
    // dates are intentionally excluded so the UI never claims false precision.
    const scanFilters = (scan as Record<string, unknown>).filters as { datePosted?: string } | null;
    const datePosted = scanFilters?.datePosted ?? '7d';
    const freshnessMap: Record<string, number> = { '24h': 1, '3d': 3, '7d': 7, '14d': 14, '30d': 30 };
    const freshnessDays = datePosted === 'any' ? null : freshnessMap[datePosted] ?? 7;
    const freshnessThreshold = freshnessDays
      ? new Date(Date.now() - freshnessDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // Fetch results for this scan, joined with listing data.
    // Exclude explicitly-expired rows and rows older than 30 days that haven't
    // been saved/promoted — these are stale and not worth surfacing.
    // Sort: unseen (first_seen_at IS NULL) first, then by posted_date desc.
    let resultsQuery = supabaseAdmin
      .from('job_search_results')
      .select(`
        id,
        scan_id,
        listing_id,
        user_id,
        status,
        match_score,
        first_seen_at,
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
      // Exclude expired rows
      .neq('status', 'expired')
      // Staleness guard: drop rows older than 30 days unless saved/promoted
      .or(`created_at.gt.${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()},status.in.(saved,promoted)`)
      .order('first_seen_at', { ascending: true, nullsFirst: true })
      .order('match_score', { ascending: false, nullsFirst: false });

    if (freshnessThreshold) {
      // Freshness-filtered results must have a known posting date. "Any date"
      // intentionally skips this filter so undated public job pages can be recovered.
      resultsQuery = resultsQuery.gt('job_listings.posted_date', freshnessThreshold);
    }

    const { data: resultRows, error: resultsError } = await resultsQuery;

    if (resultsError) {
      logger.error(
        { userId: user.id, scanId: scan.id, error: resultsError.message },
        'scans/latest: failed to fetch results',
      );
      return c.json({ error: 'Failed to fetch scan results' }, 500);
    }

    const rows = (resultRows ?? []) as Array<Record<string, unknown>>;

    // Mark first_seen_at for results that don't have it yet (best-effort, non-blocking)
    const unseenIds = rows
      .filter((r) => !r.first_seen_at)
      .map((r) => r.id as string)
      .filter(Boolean);
    if (unseenIds.length > 0) {
      void (async () => {
        const { error: markError } = await supabaseAdmin
          .from('job_search_results')
          .update({ first_seen_at: new Date().toISOString() })
          .in('id', unseenIds);
        if (markError) {
          logger.warn({ userId: user.id, count: unseenIds.length, error: markError.message }, 'scans/latest: failed to mark first_seen_at');
        }
      })();
    }

    if (!includeContacts || rows.length === 0) {
      return c.json({ scan, results: rows });
    }

    // Enrich with NI contacts (best-effort, never blocks)
    let enrichedRows = rows;
    try {
      enrichedRows = await enrichRowsWithContacts(user.id, rows);
    } catch (err) {
      logger.warn({ err, userId: user.id, scanId: scan.id }, 'enrichRowsWithContacts failed — returning unenriched results');
    }

    return c.json({ scan, results: enrichedRows });
  },
);

// ─── GET /enriched/:scanId — scan results enriched with NI contacts ───────────

jobSearchRoutes.get(
  '/enriched/:scanId',
  rateLimitMiddleware(20, 60_000),
  async (c) => {
    const user = c.get('user');
    const scanId = c.req.param('scanId') ?? '';

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

    const outcome = await runEnrichmentPipeline(user.id, scanId);
    if (!outcome.ok) {
      return c.json({ error: outcome.error }, outcome.status as 400 | 500);
    }

    return c.json(outcome.result);
  },
);
