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
import { listUserContextByType } from '../lib/platform-context.js';
import type { ContextType } from '../lib/platform-context.js';
import logger from '../lib/logger.js';

const app = new Hono();

// ─── Context types surfaced to the frontend ───────────────────────────────────

const SUMMARY_TYPES: ContextType[] = [
  'positioning_strategy',
  'evidence_item',
  'career_narrative',
  'client_profile',
  'positioning_foundation',
  'benchmark_candidate',
  'gap_analysis',
  'emotional_baseline',
];

// ─── GET /summary ─────────────────────────────────────────────────────────────

// 60 requests per minute — called on room navigation, should be cheap
app.use('/summary', rateLimitMiddleware(60, 60_000));

app.get('/summary', authMiddleware, async (c) => {
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

export const platformContextRoutes = app;
