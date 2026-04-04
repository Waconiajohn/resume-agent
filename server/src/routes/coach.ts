/**
 * Virtual Coach Routes — /api/coach/*
 *
 * Lightweight recommendation endpoint for the Virtual Coach. Returns the
 * single most impactful next action using a deterministic decision tree —
 * no LLM call, pure phase + context logic.
 *
 * Endpoints:
 *   GET /recommend — Deterministic next-action recommendation
 *
 * Feature-flagged via FF_VIRTUAL_COACH.
 * Mounted at /api/coach by server/src/index.ts.
 */

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { FF_VIRTUAL_COACH } from '../lib/feature-flags.js';
import logger from '../lib/logger.js';
import { loadClientSnapshot } from '../agents/coach/client-snapshot.js';
import { PHASE_LABELS } from '../agents/coach/types.js';
import { getRecommendation } from '../agents/coach/tools/recommend-next-action.js';

const app = new Hono();

// ─── Feature Flag Gate ────────────────────────────────────────────────────────

app.use('*', async (c, next) => {
  if (!FF_VIRTUAL_COACH) return c.json({ data: null, feature_disabled: true }, 200);
  await next();
});

app.use('*', authMiddleware);

// ─── GET /recommend ───────────────────────────────────────────────────────────

// Lightweight deterministic endpoint — no LLM call, pure decision tree.
// Returns the single most impactful next action for the sidebar/dashboard.
// 60 rpm — higher than a conversational endpoint since it's called on room navigation.
app.use('/recommend', rateLimitMiddleware(60, 60_000));

app.get('/recommend', async (c) => {
  const user = c.get('user');

  try {
    // TODO: Consider adding a 30-60s per-user TTL cache for loadClientSnapshot
    // to reduce DB load on rapid room navigation
    const snapshot = await loadClientSnapshot(user.id);
    const rec = getRecommendation(snapshot);
    const phaseLabel = PHASE_LABELS[snapshot.journey_phase] ?? snapshot.journey_phase;

    return c.json({
      action: rec.action,
      product: rec.product ?? null,
      room: rec.room ?? null,
      urgency: rec.urgency,
      phase: snapshot.journey_phase,
      phase_label: phaseLabel,
      rationale: rec.rationale,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ error: msg, userId: user.id }, 'Coach recommend failed');
    return c.json({ error: 'Failed to generate recommendation' }, 500);
  }
});

export const coachRoutes = app;
