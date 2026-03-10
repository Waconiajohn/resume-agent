/**
 * Virtual Coach Tool — check_pipeline_status
 *
 * Queries the coach_sessions table for the user's active and recently
 * completed pipelines. Returns a structured summary the coach LLM can
 * reason about — what's running, what's waiting for user input, what
 * finished, and what has stalled.
 *
 * This tool makes a direct DB read. No LLM call. The agent loop reasons
 * about the returned data.
 */

import type { CoachTool } from '../types.js';
import { supabaseAdmin } from '../../../lib/supabase.js';
import logger from '../../../lib/logger.js';

const log = logger.child({ tool: 'check_pipeline_status' });

/** A session idle for longer than this is considered stalled */
const STALL_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Tool ──────────────────────────────────────────────────────────

const checkPipelineStatusTool: CoachTool = {
  name: 'check_pipeline_status',
  description:
    "Check the status of the client's active and recently completed pipelines. " +
    'Returns running pipelines, sessions waiting for user input (pending gates), ' +
    'recently completed sessions, errored sessions, and any items that have stalled ' +
    '(no activity in 24+ hours). Use this to understand what the client has been ' +
    'working on and what needs their attention.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {
      product_filter: {
        type: 'string',
        description:
          'Optional: filter results to a specific product type (e.g., "resume", "cover_letter"). ' +
          'Omit to return all products.',
      },
    },
    required: [],
  },

  async execute(input, ctx) {
    const state = ctx.getState();
    const userId = state.user_id;
    const productFilter =
      typeof input.product_filter === 'string' && input.product_filter.trim().length > 0
        ? input.product_filter.trim()
        : null;

    try {
      // ─── Query sessions ──────────────────────────────────────
      let query = supabaseAdmin
        .from('coach_sessions')
        .select('id, product_type, pipeline_status, pipeline_stage, pending_gate, created_at, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(20);

      if (productFilter) {
        query = query.eq('product_type', productFilter);
      }

      const { data: sessions, error } = await query;

      if (error) {
        log.warn({ error: error.message, userId }, 'check_pipeline_status: query failed');
        return JSON.stringify({ error: 'Failed to check pipeline status' });
      }

      const allSessions = sessions ?? [];
      const now = Date.now();

      // ─── Categorise by status ────────────────────────────────
      const active = allSessions
        .filter((s) => s.pipeline_status === 'running' || s.pipeline_status === 'waiting')
        .map((s) => {
          const updatedMs = new Date(s.updated_at as string).getTime();
          const idleMs = now - updatedMs;
          const stalledHours = Math.round(idleMs / (60 * 60 * 1000));
          return {
            session_id: String(s.id),
            product: String(s.product_type ?? 'unknown'),
            status: String(s.pipeline_status),
            stage: s.pipeline_stage ? String(s.pipeline_stage) : 'unknown',
            pending_gate: s.pending_gate ? String(s.pending_gate) : null,
            started_at: String(s.created_at),
            is_stalled: idleMs > STALL_THRESHOLD_MS,
            stalled_hours: stalledHours,
          };
        });

      const completed = allSessions
        .filter((s) => s.pipeline_status === 'complete')
        .slice(0, 10)
        .map((s) => ({
          session_id: String(s.id),
          product: String(s.product_type ?? 'unknown'),
          completed_at: String(s.updated_at),
        }));

      const errored = allSessions
        .filter((s) => s.pipeline_status === 'error')
        .slice(0, 5)
        .map((s) => ({
          session_id: String(s.id),
          product: String(s.product_type ?? 'unknown'),
          errored_at: String(s.updated_at),
        }));

      const waitingForUser = active.filter((a) => a.status === 'waiting');
      const stalled = active.filter((a) => a.is_stalled);

      log.info(
        {
          userId,
          activeCount: active.length,
          waitingCount: waitingForUser.length,
          stalledCount: stalled.length,
          completedCount: completed.length,
          erroredCount: errored.length,
        },
        'check_pipeline_status: status retrieved',
      );

      return JSON.stringify({
        active_count: active.length,
        active,
        completed_count: completed.length,
        completed,
        errored_count: errored.length,
        errored,
        waiting_for_user_count: waitingForUser.length,
        waiting_for_user: waitingForUser,
        stalled_count: stalled.length,
        stalled,
      });
    } catch (err) {
      log.error({ err, userId }, 'check_pipeline_status: unexpected error');
      return JSON.stringify({ error: 'Failed to check pipeline status' });
    }
  },
};

export { checkPipelineStatusTool };
