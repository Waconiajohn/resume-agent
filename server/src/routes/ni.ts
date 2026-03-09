/**
 * Network Intelligence Routes — /api/ni/*
 *
 * Feature-flagged via FF_NETWORK_INTELLIGENCE.
 * Provides CSV import, company normalization, and job matching endpoints.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { FF_NETWORK_INTELLIGENCE } from '../lib/feature-flags.js';
import { parseJsonBodyWithLimit } from '../lib/http-body-guard.js';
import {
  getEnrichedConnectionsByUser,
  getConnectionCount,
  getCompanySummary,
  createScrapeLogEntry,
} from '../lib/ni/connections-store.js';
import {
  insertTargetTitle,
  getTargetTitlesByUser,
  deleteTargetTitle,
} from '../lib/ni/target-titles-store.js';
import {
  insertJobMatch,
  getJobMatchesByUser,
  updateJobMatchStatus,
} from '../lib/ni/job-matches-store.js';
import { generateBooleanSearch, getBooleanSearch } from '../lib/ni/boolean-search.js';
import { runCsvImportPipeline, runCareerScrape } from '../lib/ni/import-service.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import type { CsvUploadResponse } from '../lib/ni/types.js';

export const ni = new Hono();

// Auth required for all NI routes
ni.use('*', authMiddleware);

// Feature flag guard — 404 when disabled
ni.use('*', async (c, next) => {
  if (!FF_NETWORK_INTELLIGENCE) {
    return c.json({ error: 'Not found' }, 404);
  }
  await next();
});

// ─── Schemas ──────────────────────────────────────────────────────────────────

const csvParseSchema = z.object({
  csv_text: z.string().min(1, 'csv_text is required'),
  file_name: z.string().optional(),
});

const targetTitleSchema = z.object({
  title: z.string().min(1).max(200),
  priority: z.number().int().min(1).optional(),
});

const JOB_MATCH_STATUSES = ['new', 'applied', 'referred', 'interviewing', 'rejected', 'archived'] as const;

const jobMatchSchema = z.object({
  company_id: z.string().uuid(),
  title: z.string().min(1).max(500),
  url: z.string().url().optional(),
  location: z.string().max(200).optional(),
  salary_range: z.string().max(200).optional(),
  description_snippet: z.string().max(2000).optional(),
  match_score: z.number().min(0).max(100).optional(),
  referral_available: z.boolean().optional(),
  connection_count: z.number().int().min(0).optional(),
  status: z.enum(JOB_MATCH_STATUSES).optional(),
  scraped_at: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const jobMatchStatusSchema = z.object({
  status: z.enum(JOB_MATCH_STATUSES),
});

const booleanSearchSchema = z.object({
  resume_text: z.string().min(1, 'resume_text is required').max(50_000),
  target_titles: z.array(z.string().min(1).max(200)).max(20).optional(),
});

const scrapeStartSchema = z.object({
  company_ids: z.array(z.string().uuid()).min(1).max(50),
  target_titles: z.array(z.string().min(1).max(200)).max(20).optional(),
});

// ─── CSV Upload ───────────────────────────────────────────────────────────────

ni.post('/csv/parse', rateLimitMiddleware(5, 60_000), async (c) => {
  const bodyResult = await parseJsonBodyWithLimit(c, 5_200_000);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = csvParseSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400);
  }

  const userId = c.get('user').id;
  const { csv_text, file_name } = parsed.data;

  try {
    const response: CsvUploadResponse = await runCsvImportPipeline(userId, csv_text, file_name);
    if (!response.success) {
      return c.json(response, 400);
    }
    return c.json(response);
  } catch {
    return c.json({ error: 'Failed to store connections' }, 500);
  }
});

// ─── Connections ──────────────────────────────────────────────────────────────

ni.get('/connections', async (c) => {
  const userId = c.get('user').id;
  const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10) || 100, 500);
  const offset = parseInt(c.req.query('offset') ?? '0', 10) || 0;

  const connections = await getEnrichedConnectionsByUser(userId, limit, offset);
  return c.json({ connections });
});

ni.get('/connections/count', async (c) => {
  const userId = c.get('user').id;
  const count = await getConnectionCount(userId);
  return c.json({ count });
});

ni.get('/connections/companies', async (c) => {
  const userId = c.get('user').id;
  const companies = await getCompanySummary(userId);
  return c.json({ companies });
});

// ─── Target Titles ───────────────────────────────────────────────────────────

ni.get('/target-titles', async (c) => {
  const userId = c.get('user').id;
  const titles = await getTargetTitlesByUser(userId);
  return c.json({ titles });
});

ni.post('/target-titles', async (c) => {
  const bodyResult = await parseJsonBodyWithLimit(c, 10_000);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = targetTitleSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400);
  }

  const userId = c.get('user').id;
  const title = await insertTargetTitle(userId, parsed.data.title, parsed.data.priority);

  if (!title) {
    return c.json({ error: 'Failed to create target title' }, 500);
  }

  return c.json({ title }, 201);
});

ni.delete('/target-titles/:id', async (c) => {
  const userId = c.get('user').id;
  const titleId = c.req.param('id');

  const deleted = await deleteTargetTitle(userId, titleId);
  if (!deleted) {
    return c.json({ error: 'Target title not found' }, 404);
  }

  return c.json({ success: true });
});

// ─── Job Matches ──────────────────────────────────────────────────────────────

ni.get('/matches', async (c) => {
  const userId = c.get('user').id;
  const status = c.req.query('status') as typeof JOB_MATCH_STATUSES[number] | undefined;
  const limit = parseInt(c.req.query('limit') ?? '50', 10) || 50;
  const offset = parseInt(c.req.query('offset') ?? '0', 10) || 0;

  const matches = await getJobMatchesByUser(userId, { status, limit, offset });
  return c.json({ matches });
});

ni.post('/matches', async (c) => {
  const bodyResult = await parseJsonBodyWithLimit(c, 50_000);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = jobMatchSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400);
  }

  const userId = c.get('user').id;
  const match = await insertJobMatch(userId, parsed.data);

  if (!match) {
    return c.json({ error: 'Failed to create job match' }, 500);
  }

  return c.json({ match }, 201);
});

ni.patch('/matches/:id/status', async (c) => {
  const bodyResult = await parseJsonBodyWithLimit(c, 1_000);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = jobMatchStatusSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400);
  }

  const userId = c.get('user').id;
  const matchId = c.req.param('id');

  const updated = await updateJobMatchStatus(userId, matchId, parsed.data.status);
  if (!updated) {
    return c.json({ error: 'Job match not found' }, 404);
  }

  return c.json({ success: true });
});

// ─── Boolean Search ───────────────────────────────────────────────────────────

ni.post('/boolean-search/generate', rateLimitMiddleware(10, 60_000), async (c) => {
  const bodyResult = await parseJsonBodyWithLimit(c, 100_000);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = booleanSearchSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400);
  }

  const userId = c.get('user').id;
  const { resume_text, target_titles = [] } = parsed.data;

  try {
    const { id, result } = await generateBooleanSearch(resume_text, target_titles);
    logger.info({ userId, id }, 'boolean-search: generated');
    return c.json({ id, ...result });
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), userId },
      'boolean-search: generation failed',
    );
    return c.json({ error: 'Failed to generate boolean search strings' }, 500);
  }
});

ni.get('/boolean-search/:id', async (c) => {
  const id = c.req.param('id');
  const result = getBooleanSearch(id);

  if (!result) {
    return c.json({ error: 'Boolean search not found' }, 404);
  }

  return c.json({ id, ...result });
});

// ─── Career Page Scraper ──────────────────────────────────────────────────────

ni.post('/scrape/start', rateLimitMiddleware(3, 60_000), async (c) => {
  const bodyResult = await parseJsonBodyWithLimit(c, 10_000);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = scrapeStartSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400);
  }

  const userId = c.get('user').id;
  const { company_ids, target_titles = [] } = parsed.data;

  // Create scrape log entry upfront so we can return its ID immediately
  const logId = await createScrapeLogEntry(userId, 'job_scrape', {
    company_ids,
    target_title_count: target_titles.length,
  });

  if (!logId) {
    return c.json({ error: 'Failed to start scrape' }, 500);
  }

  // Fire-and-forget — scrape runs in background via import-service
  void runCareerScrape(userId, logId, company_ids, target_titles);

  return c.json({ scrape_log_id: logId }, 202);
});

ni.get('/scrape/status/:id', async (c) => {
  const userId = c.get('user').id;
  const logId = c.req.param('id');

  const { data, error } = await supabaseAdmin
    .from('scrape_logs')
    .select('*')
    .eq('id', logId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return c.json({ error: 'Scrape log not found' }, 404);
  }

  return c.json({ log: data });
});
