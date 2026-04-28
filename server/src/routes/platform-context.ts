/**
 * Platform Context Routes — /api/platform-context/*
 *
 * Lightweight read-only endpoints for querying which platform context types
 * exist for the authenticated user. Used by the frontend ContextLoadedBadge
 * component to show users which AI-generated context is powering each room.
 *
 * Endpoints:
 *   GET /summary — Returns the latest context record per type for the user
 *
 * Mounted at /api/platform-context by server/src/index.ts.
 */

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { listUserContextByType, upsertUserContext, getLatestUserContext, getUserContext } from '../lib/platform-context.js';
import type { ContextType } from '../lib/platform-context.js';
import { loadCareerProfileContext } from '../lib/career-profile-context.js';
import logger from '../lib/logger.js';

const app = new Hono();

// ─── Context types surfaced to the frontend ───────────────────────────────────

const SUMMARY_TYPES: ContextType[] = [
  'career_profile',
  'positioning_strategy',
  'evidence_item',
  'career_narrative',
  'client_profile',
  'linkedin_profile',
  'positioning_foundation',
  'benchmark_candidate',
  'gap_analysis',
  'emotional_baseline',
];

// ─── GET /summary ─────────────────────────────────────────────────────────────

// Auth runs first, then rate limit — auth rejects unauthenticated requests
// before they consume rate limit capacity.
app.use('/summary', authMiddleware);
app.use('/summary', rateLimitMiddleware(60, 60_000));
app.use('/career-profile', authMiddleware);
app.use('/career-profile', rateLimitMiddleware(30, 60_000));
app.use('/linkedin-profile', authMiddleware);
app.use('/linkedin-profile', rateLimitMiddleware(30, 60_000));
app.use('/story-bank', authMiddleware);
app.use('/story-bank', rateLimitMiddleware(60, 60_000));

app.get('/summary', async (c) => {
  const user = c.get('user') as { id: string };

  try {
    const rows = await listUserContextByType(user.id, SUMMARY_TYPES);

    // Deduplicate to the latest record per context_type (rows already ordered
    // by updated_at DESC from listUserContextByType)
    const seen = new Set<string>();
    const types = rows
      .filter((r) => {
        if (seen.has(r.context_type)) return false;
        seen.add(r.context_type);
        return true;
      })
      .map((r) => ({
        context_type: r.context_type,
        source_product: r.source_product,
        updated_at: r.updated_at,
      }));

    return c.json({ types });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ error: message, userId: user.id }, 'platform-context summary failed');
    return c.json({ error: 'Failed to load platform context summary' }, 500);
  }
});

// ─── GET /career-profile ─────────────────────────────────────────────────────

app.get('/career-profile', async (c) => {
  const user = c.get('user') as { id: string };

  try {
    const careerProfile = await loadCareerProfileContext(user.id);
    return c.json({ career_profile: careerProfile });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ error: message, userId: user.id }, 'career-profile context load failed');
    return c.json({ error: 'Failed to load career profile context' }, 500);
  }
});

const REVIEW_STATUSES = new Set(['draft', 'needs_confirmation', 'approved', 'needs_evidence']);

function cloneRecord<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function updateBenchmarkItemById(
  value: unknown,
  itemId: string,
  changes: { statement?: string; review_status?: string },
): boolean {
  if (!value || typeof value !== 'object') return false;

  if (Array.isArray(value)) {
    for (const item of value) {
      if (updateBenchmarkItemById(item, itemId, changes)) return true;
    }
    return false;
  }

  const record = value as Record<string, unknown>;
  if (record.id === itemId && typeof record.statement === 'string') {
    if (typeof changes.statement === 'string') {
      record.statement = changes.statement;
    }
    if (typeof changes.review_status === 'string') {
      record.review_status = changes.review_status;
    }
    return true;
  }

  for (const child of Object.values(record)) {
    if (updateBenchmarkItemById(child, itemId, changes)) return true;
  }

  return false;
}

function updateBenchmarkDiscoveryQuestion(
  benchmarkProfile: unknown,
  questionId: string,
  answer: string,
): boolean {
  if (!benchmarkProfile || typeof benchmarkProfile !== 'object') return false;

  const record = benchmarkProfile as Record<string, unknown>;
  const questions = Array.isArray(record.discovery_questions)
    ? record.discovery_questions
    : [];

  for (const rawQuestion of questions) {
    if (!rawQuestion || typeof rawQuestion !== 'object') continue;
    const question = rawQuestion as Record<string, unknown>;
    if (question.id !== questionId) continue;
    question.answer = answer;
    question.answered_at = new Date().toISOString();
    return true;
  }

  return false;
}

// ─── PATCH /career-profile/benchmark-item ───────────────────────────────────

app.patch('/career-profile/benchmark-item', async (c) => {
  const user = c.get('user') as { id: string };

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return c.json({ error: 'Body must be a JSON object' }, 400);
  }

  const record = body as Record<string, unknown>;
  const itemId = typeof record.item_id === 'string' ? record.item_id.trim() : '';
  const changes = record.changes && typeof record.changes === 'object' && !Array.isArray(record.changes)
    ? record.changes as Record<string, unknown>
    : {};
  const statement = typeof changes.statement === 'string' ? changes.statement.trim() : undefined;
  const reviewStatus = typeof changes.review_status === 'string' ? changes.review_status.trim() : undefined;

  if (!itemId) {
    return c.json({ error: 'item_id is required' }, 400);
  }
  if (statement !== undefined && statement.length === 0) {
    return c.json({ error: 'statement cannot be empty' }, 400);
  }
  if (statement !== undefined && statement.length > 5_000) {
    return c.json({ error: 'statement must be 5,000 characters or fewer' }, 400);
  }
  if (reviewStatus !== undefined && !REVIEW_STATUSES.has(reviewStatus)) {
    return c.json({ error: 'Invalid review_status' }, 400);
  }
  if (statement === undefined && reviewStatus === undefined) {
    return c.json({ error: 'No supported changes provided' }, 400);
  }

  try {
    const row = await getLatestUserContext(user.id, 'career_profile');
    if (!row || !row.content || row.content.version !== 'career_profile_v2') {
      return c.json({ error: 'Career profile not found' }, 404);
    }

    const nextProfile = cloneRecord(row.content);
    const benchmarkProfile = (nextProfile as Record<string, unknown>).benchmark_profile;
    if (!benchmarkProfile || typeof benchmarkProfile !== 'object') {
      return c.json({ error: 'Benchmark Profile draft not found' }, 404);
    }

    const updated = updateBenchmarkItemById(benchmarkProfile, itemId, {
      ...(statement !== undefined ? { statement } : {}),
      ...(reviewStatus !== undefined ? { review_status: reviewStatus } : {}),
    });

    if (!updated) {
      return c.json({ error: 'Benchmark Profile item not found' }, 404);
    }

    const saved = await upsertUserContext(
      user.id,
      'career_profile',
      nextProfile,
      row.source_product || 'profile-setup',
      row.source_session_id ?? undefined,
    );

    if (!saved) {
      return c.json({ error: 'Failed to save Benchmark Profile update' }, 500);
    }

    return c.json({ career_profile: saved.content });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ error: message, userId: user.id, itemId }, 'benchmark profile item update failed');
    return c.json({ error: 'Failed to update Benchmark Profile item' }, 500);
  }
});

// ─── PATCH /career-profile/discovery-question ───────────────────────────────

app.patch('/career-profile/discovery-question', async (c) => {
  const user = c.get('user') as { id: string };

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return c.json({ error: 'Body must be a JSON object' }, 400);
  }

  const record = body as Record<string, unknown>;
  const questionId = typeof record.question_id === 'string' ? record.question_id.trim() : '';
  const answer = typeof record.answer === 'string' ? record.answer.trim() : '';

  if (!questionId) {
    return c.json({ error: 'question_id is required' }, 400);
  }
  if (!answer) {
    return c.json({ error: 'answer is required' }, 400);
  }
  if (answer.length > 5_000) {
    return c.json({ error: 'answer must be 5,000 characters or fewer' }, 400);
  }

  try {
    const row = await getLatestUserContext(user.id, 'career_profile');
    if (!row || !row.content || row.content.version !== 'career_profile_v2') {
      return c.json({ error: 'Career profile not found' }, 404);
    }

    const nextProfile = cloneRecord(row.content);
    const benchmarkProfile = (nextProfile as Record<string, unknown>).benchmark_profile;
    if (!benchmarkProfile || typeof benchmarkProfile !== 'object') {
      return c.json({ error: 'Benchmark Profile draft not found' }, 404);
    }

    const updated = updateBenchmarkDiscoveryQuestion(benchmarkProfile, questionId, answer);
    if (!updated) {
      return c.json({ error: 'Discovery question not found' }, 404);
    }

    const saved = await upsertUserContext(
      user.id,
      'career_profile',
      nextProfile,
      row.source_product || 'profile-setup',
      row.source_session_id ?? undefined,
    );

    if (!saved) {
      return c.json({ error: 'Failed to save discovery answer' }, 500);
    }

    return c.json({ career_profile: saved.content });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ error: message, userId: user.id, questionId }, 'benchmark profile discovery answer update failed');
    return c.json({ error: 'Failed to update discovery answer' }, 500);
  }
});

// ─── GET /linkedin-profile ────────────────────────────────────────────────────

app.get('/linkedin-profile', async (c) => {
  const user = c.get('user') as { id: string };

  try {
    const row = await getLatestUserContext(user.id, 'linkedin_profile');
    if (!row) {
      return c.json({ linkedin_profile: null });
    }
    return c.json({ linkedin_profile: row.content });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ error: message, userId: user.id }, 'linkedin-profile context load failed');
    return c.json({ error: 'Failed to load LinkedIn profile context' }, 500);
  }
});

// ─── PUT /linkedin-profile ────────────────────────────────────────────────────

app.put('/linkedin-profile', async (c) => {
  const user = c.get('user') as { id: string };

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const record = body as Record<string, unknown> | null;
  if (
    typeof body !== 'object' ||
    body === null ||
    typeof record?.headline !== 'string' ||
    typeof record?.about !== 'string' ||
    (record.experience !== undefined && typeof record.experience !== 'string')
  ) {
    return c.json({ error: 'Body must contain headline (string), about (string), and optional experience (string)' }, 400);
  }

  const { headline, about } = record as { headline: string; about: string };
  const experience = typeof record.experience === 'string' ? record.experience : '';

  try {
    const row = await upsertUserContext(
      user.id,
      'linkedin_profile',
      { headline, about, experience },
      'your_profile',
    );
    if (!row) {
      return c.json({ error: 'Failed to save LinkedIn profile' }, 500);
    }
    return c.json({ linkedin_profile: row.content });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ error: message, userId: user.id }, 'linkedin-profile context upsert failed');
    return c.json({ error: 'Failed to save LinkedIn profile context' }, 500);
  }
});

// ─── GET /story-bank ──────────────────────────────────────────────────────────

app.get('/story-bank', async (c) => {
  const user = c.get('user') as { id: string };

  try {
    const rows = await getUserContext(user.id, 'interview_story');
    const stories = rows.map((row, i) => ({
      id: row.id,
      index: i,
      content: row.content,
      source_session_id: row.source_session_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
    return c.json({ stories });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ error: message, userId: user.id }, 'story-bank GET failed');
    return c.json({ error: 'Failed to load story bank' }, 500);
  }
});

// ─── DELETE /story-bank/:id ───────────────────────────────────────────────────

app.delete('/story-bank/:id', async (c) => {
  const user = c.get('user') as { id: string };
  const storyId = c.req.param('id') ?? '';

  if (!storyId) {
    return c.json({ error: 'Missing story id' }, 400);
  }

  try {
    const { error } = await (await import('../lib/supabase.js')).supabaseAdmin
      .from('user_platform_context')
      .delete()
      .eq('id', storyId)
      .eq('user_id', user.id)
      .eq('context_type', 'interview_story');

    if (error) {
      logger.error({ error: error.message, userId: user.id, storyId }, 'story-bank DELETE failed');
      return c.json({ error: 'Failed to delete story' }, 500);
    }

    return c.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ error: message, userId: user.id, storyId }, 'story-bank DELETE unexpected error');
    return c.json({ error: 'Failed to delete story' }, 500);
  }
});

// ─── PUT /story-bank/:id ─────────────────────────────────────────────────────

app.put('/story-bank/:id', async (c) => {
  const user = c.get('user') as { id: string };
  const storyId = c.req.param('id') ?? '';

  if (!storyId) {
    return c.json({ error: 'Missing story id' }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (typeof body !== 'object' || body === null) {
    return c.json({ error: 'Body must be a JSON object' }, 400);
  }

  // Validate required InterviewStory fields
  const storyBody = body as Record<string, unknown>;
  const requiredStringFields = ['situation', 'task', 'action', 'result', 'reflection'];
  for (const field of requiredStringFields) {
    if (typeof storyBody[field] !== 'string' || (storyBody[field]).trim().length === 0) {
      return c.json({ error: `Missing or empty required field: ${field}` }, 400);
    }
  }
  if (!Array.isArray(storyBody.themes)) {
    return c.json({ error: 'themes must be an array' }, 400);
  }

  try {
    const { data, error } = await (await import('../lib/supabase.js')).supabaseAdmin
      .from('user_platform_context')
      .update({ content: body as Record<string, unknown>, updated_at: new Date().toISOString() })
      .eq('id', storyId)
      .eq('user_id', user.id)
      .eq('context_type', 'interview_story')
      .select()
      .maybeSingle();

    if (error) {
      logger.error({ error: error.message, userId: user.id, storyId }, 'story-bank PUT failed');
      return c.json({ error: 'Failed to update story' }, 500);
    }

    if (!data) {
      return c.json({ error: 'Story not found' }, 404);
    }

    return c.json({ story: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ error: message, userId: user.id, storyId }, 'story-bank PUT unexpected error');
    return c.json({ error: 'Failed to update story' }, 500);
  }
});

export const platformContextRoutes = app;
