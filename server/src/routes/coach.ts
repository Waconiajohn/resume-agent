/**
 * Virtual Coach Routes — /api/coach/*
 *
 * Conversational agent routes for the Virtual Coach. This is a custom route
 * pattern (not a product-route-factory pipeline) because the coach runs as
 * a multi-turn conversation, not a one-shot pipeline.
 *
 * Endpoints:
 *   POST /message      — Send a message and receive the coach's reply
 *   GET  /conversation — Load conversation history
 *   GET  /stream       — SSE stream for proactive notifications (future use)
 *   POST /mode         — Switch coaching mode (chat | guided)
 *
 * Feature-flagged via FF_VIRTUAL_COACH.
 * Mounted at /api/coach by server/src/index.ts.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { FF_VIRTUAL_COACH } from '../lib/feature-flags.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { parseJsonBodyWithLimit } from '../lib/http-body-guard.js';
import logger from '../lib/logger.js';
import { runConversationTurn, loadClientSnapshot } from '../agents/coach/conversation-loop.js';
import { coachAgentConfig } from '../agents/coach/agent.js';
import { PHASE_LABELS } from '../agents/coach/types.js';
import type { CoachSSEEvent } from '../agents/coach/types.js';
import { RED_FLAG_THRESHOLDS } from '../agents/coach/knowledge/red-flags.js';
import { getRecommendation } from '../agents/coach/tools/recommend-next-action.js';

const app = new Hono();

// ─── Feature Flag Gate ────────────────────────────────────────────────────────

app.use('*', async (c, next) => {
  if (!FF_VIRTUAL_COACH) return c.json({ error: 'Not found' }, 404);
  await next();
});

app.use('*', authMiddleware);

// ─── Schemas ─────────────────────────────────────────────────────────────────

const messageSchema = z.object({
  conversation_id: z.string().uuid(),
  message: z.string().min(1).max(10_000),
});

const modeSchema = z.object({
  conversation_id: z.string().uuid(),
  mode: z.enum(['chat', 'guided']),
});

// ─── GET /recommend ───────────────────────────────────────────────────────────

// Lightweight deterministic endpoint — no LLM call, pure decision tree.
// Returns the single most impactful next action for the sidebar/dashboard.
// 60 rpm — higher than /message since it's called on room navigation.
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

// ─── POST /message ────────────────────────────────────────────────────────────

// 30 messages per minute per user
app.use('/message', rateLimitMiddleware(30, 60_000));

app.post('/message', async (c) => {
  const bodyResult = await parseJsonBodyWithLimit(c, 32_000);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = messageSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
  }

  const user = c.get('user');
  const { conversation_id, message } = parsed.data;
  const events: CoachSSEEvent[] = [];

  // Verify conversation ownership before running the LLM loop
  const { data: existing } = await supabaseAdmin
    .from('coach_conversations')
    .select('id')
    .eq('id', conversation_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!existing) {
    return c.json({ error: 'Conversation not found' }, 404);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const result = await runConversationTurn({
      userId: user.id,
      conversationId: conversation_id,
      userMessage: message,
      config: coachAgentConfig,
      emit: (event) => events.push(event),
      signal: controller.signal,
    });

    return c.json({
      response: result.response,
      turn_count: result.turn_count,
      usage: result.usage,
      events,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ error: msg, userId: user.id }, 'Coach message failed');
    return c.json({ error: 'Coach processing failed' }, 500);
  } finally {
    clearTimeout(timeout);
  }
});

// ─── GET /conversation ────────────────────────────────────────────────────────

// 30 requests per minute per user — conversation history loads
app.use('/conversation', rateLimitMiddleware(30, 60_000));

app.get('/conversation', async (c) => {
  const user = c.get('user');
  const conversationId = c.req.query('conversation_id');

  if (!conversationId) {
    return c.json({ error: 'conversation_id query parameter is required' }, 400);
  }

  // Validate UUID format
  const uuidParsed = z.string().uuid().safeParse(conversationId);
  if (!uuidParsed.success) {
    return c.json({ error: 'Invalid conversation_id — must be a UUID' }, 400);
  }

  const { data, error: dbError } = await supabaseAdmin
    .from('coach_conversations')
    .select('messages, turn_count, mode, created_at')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single();

  if (dbError && dbError.code !== 'PGRST116') {
    logger.error({ error: dbError.message, conversationId, userId: user.id }, 'Failed to load coach conversation');
    return c.json({ error: 'Failed to load conversation' }, 500);
  }

  if (!data) {
    return c.json({ messages: [], turn_count: 0, mode: 'guided', created_at: null });
  }

  return c.json({
    messages: data.messages ?? [],
    turn_count: data.turn_count ?? 0,
    mode: data.mode ?? 'guided',
    created_at: data.created_at ?? null,
  });
});

// ─── GET /stream ──────────────────────────────────────────────────────────────

// 10 SSE connections per minute per user — SSE connections are expensive
app.use('/stream', rateLimitMiddleware(10, 60_000));

// Placeholder SSE stream for future proactive nudges (red-flag detection, stall
// alerts, milestone celebrations). Sprint D will wire live events here.
app.get('/stream', async (c) => {
  const user = c.get('user');

  return streamSSE(c, async (stream) => {
    // Announce connection
    await stream.writeSSE({
      event: 'connected',
      data: JSON.stringify({ status: 'ok' }),
    });

    // ─── Login-time red flag scan ─────────────────────────────────
    try {
      const snapshot = await loadClientSnapshot(user.id);
      const nudges: Array<{ type: string; priority: string; message: string }> = [];

      for (const threshold of RED_FLAG_THRESHOLDS) {
        if (
          threshold.type === 'no_login' &&
          snapshot.days_since_last_activity >= threshold.days
        ) {
          nudges.push({
            type: threshold.type,
            priority: threshold.priority,
            message: `Welcome back! It's been ${snapshot.days_since_last_activity} days since your last session. Let's pick up where you left off.`,
          });
        }
        if (threshold.type === 'stalled_pipeline') {
          for (const stall of snapshot.stalled_items) {
            if (stall.stalled_days >= threshold.days) {
              nudges.push({
                type: threshold.type,
                priority: threshold.priority,
                message: `Your ${String(stall.product_type ?? 'pipeline').replace(/[^a-z_]/gi, '').replace(/_/g, ' ')} is waiting for you — it's been paused for ${stall.stalled_days} days.`,
              });
            }
          }
        }
      }

      if (nudges.length > 0) {
        await stream.writeSSE({
          event: 'coach_nudge',
          data: JSON.stringify({ nudges }),
        });
      }
    } catch {
      // Red flag scan is best-effort — don't break the stream
    }

    // Heartbeat every 30s to keep the connection alive
    const interval = setInterval(async () => {
      try {
        await stream.writeSSE({
          event: 'heartbeat',
          data: JSON.stringify({ ts: Date.now() }),
        });
      } catch {
        clearInterval(interval);
      }
    }, 30_000);

    // Block until disconnect
    try {
      await new Promise<void>((_, reject) => {
        stream.onAbort(() => reject(new Error('aborted')));
      });
    } catch {
      // Expected on client disconnect — not an error
    } finally {
      clearInterval(interval);
    }
  });
});

// ─── POST /mode ───────────────────────────────────────────────────────────────

app.post('/mode', async (c) => {
  const bodyResult = await parseJsonBodyWithLimit(c, 4_096);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = modeSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
  }

  const user = c.get('user');
  const { conversation_id, mode } = parsed.data;

  const { data: updated, error } = await supabaseAdmin
    .from('coach_conversations')
    .update({ mode })
    .eq('id', conversation_id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error) {
    logger.error({ error: error.message, userId: user.id, conversationId: conversation_id }, 'Failed to update coach mode');
    return c.json({ error: 'Failed to update coaching mode' }, 500);
  }

  if (!updated) {
    return c.json({ error: 'Conversation not found' }, 404);
  }

  return c.json({ mode, updated: true });
});

export const coachRoutes = app;
