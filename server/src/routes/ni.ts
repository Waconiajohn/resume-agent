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
import { parseCsv } from '../lib/ni/csv-parser.js';
import {
  deleteConnectionsByUser,
  insertConnections,
  getEnrichedConnectionsByUser,
  getConnectionCount,
  getCompanySummary,
  createScrapeLogEntry,
  completeScrapeLogEntry,
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
import { normalizeCompanyBatch } from '../lib/ni/company-normalizer.js';
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

  // Parse CSV
  const result = parseCsv(csv_text);

  if (result.connections.length === 0) {
    const response: CsvUploadResponse = {
      success: false,
      totalRows: result.totalRows,
      validRows: 0,
      skippedRows: result.skippedRows,
      duplicatesRemoved: result.duplicatesRemoved,
      uniqueCompanies: 0,
      errors: result.errors,
    };
    return c.json(response, 400);
  }

  // Create scrape log entry
  const logId = await createScrapeLogEntry(userId, 'csv_import', {
    file_name: file_name ?? 'unknown',
    total_rows: result.totalRows,
    valid_rows: result.validRows,
  });

  try {
    // Wipe previous upload, then insert new connections
    await deleteConnectionsByUser(userId);
    const batchId = file_name ?? new Date().toISOString();
    const inserted = await insertConnections(userId, result.connections, batchId);

    if (logId) {
      await completeScrapeLogEntry(logId, 'completed', {
        inserted,
        unique_companies: result.uniqueCompanies,
        duplicates_removed: result.duplicatesRemoved,
      });
    }

    logger.info(
      { userId, inserted, uniqueCompanies: result.uniqueCompanies },
      'CSV import completed',
    );

    // Fire-and-forget: normalize company names in background
    const uniqueCompanyNames = [...new Set(result.connections.map((c) => c.companyRaw))];
    void normalizeCompanyBatch(userId, uniqueCompanyNames).catch((normErr) => {
      logger.error(
        { error: normErr instanceof Error ? normErr.message : String(normErr), userId },
        'Background company normalization failed',
      );
    });

    const response: CsvUploadResponse = {
      success: true,
      totalRows: result.totalRows,
      validRows: result.validRows,
      skippedRows: result.skippedRows,
      duplicatesRemoved: result.duplicatesRemoved,
      uniqueCompanies: result.uniqueCompanies,
      errors: result.errors,
    };

    return c.json(response);
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), userId },
      'CSV import failed',
    );

    if (logId) {
      await completeScrapeLogEntry(logId, 'failed', {}, err instanceof Error ? err.message : 'Unknown error');
    }

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
