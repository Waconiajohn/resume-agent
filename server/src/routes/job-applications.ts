/**
 * Job Applications CRUD Routes — /api/job-applications/*
 *
 * Approach C, Phase 0.3 — the canonical CRUD endpoint for the
 * `job_applications` table (the parent entity). Distinct from
 * `/api/applications` (which manages `application_pipeline` — the parallel
 * kanban table that Phase 3 will consolidate into job_applications).
 *
 * Both routes coexist during the Approach C migration. After Phase 3 drops
 * `application_pipeline`, `/api/applications` can alias to this handler or
 * be removed.
 *
 * Wire-format contract: this route presents `role_title` and `company_name`
 * (matching the frontend's existing shape from `useApplicationPipeline`) but
 * reads/writes the underlying columns `title` and `company` in the
 * `job_applications` schema. Keeps the frontend unaware of the rename debt
 * so a future column rename is a one-file server change.
 *
 * Feature-flagged via FF_APPLICATION_PIPELINE (same flag as the pipeline
 * route — controls visibility of the entire applications surface).
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { FF_APPLICATION_PIPELINE } from '../lib/feature-flags.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../lib/logger.js';

export const jobApplicationsRoutes = new Hono();

// Auth required for all routes.
jobApplicationsRoutes.use('*', authMiddleware);

// Feature-flag guard. Matches application-pipeline's pattern so both
// surfaces light up or dim together.
jobApplicationsRoutes.use('*', async (c, next) => {
  if (!FF_APPLICATION_PIPELINE) {
    return c.json({ data: null, feature_disabled: true }, 200);
  }
  await next();
});

// ─── Schemas ─────────────────────────────────────────────────────────────

const STAGES = [
  'saved',
  'researching',
  'applied',
  'screening',
  'interviewing',
  'offer',
  'closed_won',
  'closed_lost',
] as const;

const SOURCES = ['job_finder', 'manual', 'referral', 'linkedin', 'indeed', 'other'] as const;

const SORT_FIELDS = [
  'created_at',
  'updated_at',
  'applied_date',
  'next_action_due',
  'company_name',
  'role_title',
] as const;

/**
 * Create schema. Accepts the wire-format field names the frontend already
 * uses (`role_title`, `company_name`) and maps them to the `title`/`company`
 * columns in the database. `jd_text` and `url` are specific to
 * `job_applications` and pass through.
 */
const createJobApplicationSchema = z.object({
  role_title: z.string().min(1).max(500),
  company_name: z.string().min(1).max(500),
  company_id: z.string().uuid().optional(),
  jd_text: z.string().max(50_000).optional(),
  url: z.string().url().max(2000).optional(),
  stage: z.enum(STAGES).optional().default('saved'),
  source: z.enum(SOURCES).optional(),
  applied_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  next_action: z.string().max(500).optional(),
  next_action_due: z.string().datetime().optional(),
  resume_version_id: z.string().uuid().optional(),
  notes: z.string().max(10_000).optional(),
  score: z.number().int().min(0).max(100).optional(),
  // Phase 2.3b — Interview Prep toggle. NULL defers to stage-derived default.
  interview_prep_enabled: z.boolean().nullable().optional(),
  // Phase 2.3c — Offer/Negotiation toggle. NULL defers to stage-derived default.
  offer_enabled: z.boolean().nullable().optional(),
});

const updateJobApplicationSchema = createJobApplicationSchema.partial().extend({
  stage: z.enum(STAGES).optional(),
});

const listQuerySchema = z.object({
  stage: z.enum(STAGES).optional(),
  search: z.string().max(200).optional(),
  sort_by: z.enum(SORT_FIELDS).optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  /**
   * Sprint B4 — archived filter. "active" (default) hides rows where
   * archived_at IS NOT NULL; "archived" shows only those; "all" returns
   * everything. Default matches pre-B4 list semantics.
   */
  archived: z.enum(['active', 'archived', 'all']).optional(),
});

// ─── Wire-format mappers ─────────────────────────────────────────────────

/**
 * Row from DB (uses `title`/`company`) → wire format (uses `role_title`/
 * `company_name`). Keeping this in one place means a future column rename
 * is a one-file change.
 */
function rowToWireFormat(row: Record<string, unknown>): Record<string, unknown> {
  const { title, company, ...rest } = row;
  return {
    ...rest,
    role_title: title,
    company_name: company,
  };
}

/** Wire-format input → DB column names. */
function wireFormatToRow<T extends { role_title?: string; company_name?: string }>(
  input: T,
): Omit<T, 'role_title' | 'company_name'> & { title?: string; company?: string } {
  const { role_title, company_name, ...rest } = input;
  const dbRow: Record<string, unknown> = { ...rest };
  if (role_title !== undefined) dbRow.title = role_title;
  if (company_name !== undefined) dbRow.company = company_name;
  return dbRow as Omit<T, 'role_title' | 'company_name'> & { title?: string; company?: string };
}

// ─── POST /job-applications — Create ─────────────────────────────────────

jobApplicationsRoutes.post('/', rateLimitMiddleware(30, 60_000), async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);

  const parsed = createJobApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, 400);
  }

  const now = new Date().toISOString();
  const stageHistory = [{ stage: parsed.data.stage ?? 'saved', at: now }];

  const dbRow = wireFormatToRow(parsed.data);

  const { data, error } = await supabaseAdmin
    .from('job_applications')
    .insert({
      user_id: user.id,
      ...dbRow,
      stage_history: stageHistory,
    })
    .select()
    .single();

  if (error) {
    logger.error({ error: error.message, userId: user.id }, 'job-applications: create failed');
    return c.json({ error: 'Failed to create application' }, 500);
  }

  return c.json(rowToWireFormat(data as Record<string, unknown>), 201);
});

// ─── GET /job-applications — List with filters ───────────────────────────

jobApplicationsRoutes.get('/', rateLimitMiddleware(60, 60_000), async (c) => {
  const user = c.get('user');
  const rawQuery = Object.fromEntries(new URL(c.req.url).searchParams);
  const parsed = listQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return c.json({ error: 'Invalid query', details: parsed.error.flatten().fieldErrors }, 400);
  }

  const { stage, search, sort_by, sort_order, limit, offset, archived } = parsed.data;

  let query = supabaseAdmin
    .from('job_applications')
    .select('*')
    .eq('user_id', user.id);

  // Sprint B4 — default filter hides archived rows. Callers ask for
  // 'archived' to see only archived, or 'all' to see both.
  const archivedFilter = archived ?? 'active';
  if (archivedFilter === 'active') {
    query = query.is('archived_at', null);
  } else if (archivedFilter === 'archived') {
    query = query.not('archived_at', 'is', null);
  }

  if (stage) {
    query = query.eq('stage', stage);
  }

  if (search) {
    // Escape PostgREST ILIKE special characters to prevent filter injection.
    const safe = search.replace(/[%_\\]/g, (ch) => `\\${ch}`);
    // Note: searches are over DB column names (`title`, `company`), not the
    // wire-format names (`role_title`, `company_name`).
    query = query.or(`title.ilike.%${safe}%,company.ilike.%${safe}%`);
  }

  // Map wire-format sort field names to DB column names where they differ.
  const dbSortBy =
    sort_by === 'role_title' ? 'title' : sort_by === 'company_name' ? 'company' : sort_by ?? 'updated_at';

  query = query.order(dbSortBy, { ascending: (sort_order ?? 'desc') === 'asc' });
  query = query.range(offset ?? 0, (offset ?? 0) + (limit ?? 50) - 1);

  const { data, error } = await query;

  if (error) {
    logger.error({ error: error.message, userId: user.id }, 'job-applications: list failed');
    return c.json({ error: 'Failed to list applications' }, 500);
  }

  const applications = (data ?? []).map((row) => rowToWireFormat(row as Record<string, unknown>));
  return c.json({ applications, count: applications.length });
});

// ─── GET /job-applications/due-actions — Daily Ops ───────────────────────
// Phase 3. Returns rows with next_action set and next_action_due within the
// requested day window, excluding terminal stages. MUST be registered
// BEFORE /:id — Hono matches in declaration order and /:id is greedy.

jobApplicationsRoutes.get('/due-actions', rateLimitMiddleware(60, 60_000), async (c) => {
  const user = c.get('user');
  const rawQuery = Object.fromEntries(new URL(c.req.url).searchParams);
  const daysParsed = z.coerce.number().int().min(1).max(90).optional().safeParse(rawQuery.days);
  if (!daysParsed.success) {
    return c.json({ error: 'Invalid days parameter', details: daysParsed.error.flatten() }, 400);
  }
  const days = daysParsed.data ?? 7;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + days);

  const { data, error } = await supabaseAdmin
    .from('job_applications')
    .select('*')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .not('next_action_due', 'is', null)
    .lte('next_action_due', dueDate.toISOString())
    .not('stage', 'in', '(closed_won,closed_lost)')
    .order('next_action_due', { ascending: true });

  if (error) {
    logger.error({ error: error.message, userId: user.id }, 'job-applications: due-actions failed');
    return c.json({ error: 'Failed to fetch due actions' }, 500);
  }

  const actions = (data ?? []).map((row) => rowToWireFormat(row as Record<string, unknown>));
  return c.json({ actions, count: actions.length });
});

// ─── GET /job-applications/:id — Get single ──────────────────────────────

jobApplicationsRoutes.get('/:id', rateLimitMiddleware(60, 60_000), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id') ?? '';

  const { data, error } = await supabaseAdmin
    .from('job_applications')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    logger.error({ error: error.message, userId: user.id, id }, 'job-applications: get failed');
    return c.json({ error: 'Failed to fetch application' }, 500);
  }
  if (!data) {
    return c.json({ error: 'Application not found' }, 404);
  }

  return c.json(rowToWireFormat(data as Record<string, unknown>));
});

// ─── PATCH /job-applications/:id — Update ────────────────────────────────

jobApplicationsRoutes.patch('/:id', rateLimitMiddleware(30, 60_000), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id') ?? '';
  const body = await c.req.json().catch(() => null);

  const parsed = updateJobApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, 400);
  }

  const dbPatch = wireFormatToRow(parsed.data);

  // If the caller is moving stage, append to stage_history.
  let stageHistoryUpdate: Record<string, unknown> | undefined;
  if (parsed.data.stage) {
    const { data: existing } = await supabaseAdmin
      .from('job_applications')
      .select('stage, stage_history')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing && existing.stage !== parsed.data.stage) {
      const history = Array.isArray(existing.stage_history) ? existing.stage_history : [];
      stageHistoryUpdate = {
        stage_history: [
          ...history,
          { stage: parsed.data.stage, at: new Date().toISOString(), from: existing.stage },
        ],
      };
    }
  }

  const { data, error } = await supabaseAdmin
    .from('job_applications')
    .update({ ...dbPatch, ...(stageHistoryUpdate ?? {}) })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .maybeSingle();

  if (error) {
    logger.error({ error: error.message, userId: user.id, id }, 'job-applications: update failed');
    return c.json({ error: 'Failed to update application' }, 500);
  }
  if (!data) {
    return c.json({ error: 'Application not found' }, 404);
  }

  return c.json(rowToWireFormat(data as Record<string, unknown>));
});

// ─── POST /job-applications/:id/archive — Soft archive ──────────────────
// Sprint B4. Sets archived_at = now(). Row stays in the database; listing
// with ?archived=active (the default) filters it out.

jobApplicationsRoutes.post('/:id/archive', rateLimitMiddleware(30, 60_000), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id') ?? '';

  const { data, error } = await supabaseAdmin
    .from('job_applications')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .maybeSingle();

  if (error) {
    logger.error({ error: error.message, userId: user.id, id }, 'job-applications: archive failed');
    return c.json({ error: 'Failed to archive application' }, 500);
  }
  if (!data) return c.json({ error: 'Application not found' }, 404);

  return c.json(rowToWireFormat(data as Record<string, unknown>));
});

// ─── POST /job-applications/:id/restore — Undo archive ──────────────────

jobApplicationsRoutes.post('/:id/restore', rateLimitMiddleware(30, 60_000), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id') ?? '';

  const { data, error } = await supabaseAdmin
    .from('job_applications')
    .update({ archived_at: null })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .maybeSingle();

  if (error) {
    logger.error({ error: error.message, userId: user.id, id }, 'job-applications: restore failed');
    return c.json({ error: 'Failed to restore application' }, 500);
  }
  if (!data) return c.json({ error: 'Application not found' }, 404);

  return c.json(rowToWireFormat(data as Record<string, unknown>));
});

// ─── DELETE /job-applications/:id — Hard delete ─────────────────────────

jobApplicationsRoutes.delete('/:id', rateLimitMiddleware(10, 60_000), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id') ?? '';

  const { error } = await supabaseAdmin
    .from('job_applications')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    logger.error({ error: error.message, userId: user.id, id }, 'job-applications: delete failed');
    return c.json({ error: 'Failed to delete application' }, 500);
  }

  return c.json({ deleted: true });
});
