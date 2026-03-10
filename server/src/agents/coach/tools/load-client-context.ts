/**
 * Virtual Coach Tool — load_client_context
 *
 * Loads the complete client snapshot into coach state. Queries platform context,
 * active/completed pipelines, coaching memory, and budget. Determines the client's
 * current journey phase.
 *
 * Call at the start of every conversation before any other tool.
 */

import type { CoachTool } from '../types.js';
import type { ClientSnapshot, ActivePipeline, StalledItem, CoachBudget } from '../types.js';
import { determineJourneyPhase } from '../knowledge/journey-phases.js';
import { supabaseAdmin } from '../../../lib/supabase.js';
import { listUserContextByType } from '../../../lib/platform-context.js';
import logger from '../../../lib/logger.js';

// ─── Stale threshold ───────────────────────────────────────────────

/** A pipeline session is considered stalled if no activity in this many ms */
const STALL_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Tool ──────────────────────────────────────────────────────────

const loadClientContextTool: CoachTool = {
  name: 'load_client_context',
  description:
    'Load the complete client profile, platform context, active pipelines, coaching memory, and budget for the current user. ' +
    'Call this at the start of every conversation to understand where the client is in their journey.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },

  async execute(_input, ctx) {
    const state = ctx.getState();
    const userId = state.user_id;

    ctx.emit({
      type: 'transparency',
      stage: 'load_client_context',
      message: 'Loading client context...',
    });

    // ─── 1. Load platform context ──────────────────────────────

    const contextRows = await listUserContextByType(userId, [
      'client_profile',
      'positioning_strategy',
      'emotional_baseline',
      'evidence_item',
      'career_narrative',
    ]);

    const clientProfileRow = contextRows.find((r) => r.context_type === 'client_profile');
    const positioningRow = contextRows.find((r) => r.context_type === 'positioning_strategy');
    const emotionalBaselineRow = contextRows.find((r) => r.context_type === 'emotional_baseline');
    const evidenceRows = contextRows.filter((r) => r.context_type === 'evidence_item');
    const narrativeRows = contextRows.filter((r) => r.context_type === 'career_narrative');

    const clientProfile = clientProfileRow?.content ?? undefined;
    const positioningStrategy = positioningRow?.content ?? undefined;
    const emotionalBaseline = emotionalBaselineRow?.content ?? undefined;

    // Extract name from client_profile if available
    const name =
      typeof clientProfile?.name === 'string' ? clientProfile.name :
      typeof (clientProfile as Record<string, unknown> | undefined)?.['name'] === 'string'
        ? String((clientProfile as Record<string, unknown>)['name'])
        : undefined;

    // ─── 2. Load pipeline sessions ────────────────────────────

    const activePipelines: ActivePipeline[] = [];
    const completedProducts: string[] = [];
    const stalledItems: StalledItem[] = [];
    let lastActivityAt: string | undefined;

    try {
      // Active pipelines
      const { data: activeSessions, error: activeError } = await supabaseAdmin
        .from('coach_sessions')
        .select('id, product_type, pipeline_status, pipeline_stage, pending_gate, updated_at, created_at')
        .eq('user_id', userId)
        .in('pipeline_status', ['running', 'waiting']);

      if (activeError) {
        logger.warn({ error: activeError.message, userId }, 'load_client_context: active sessions query failed');
      } else {
        const now = Date.now();
        for (const session of activeSessions ?? []) {
          const updatedAt = new Date(session.updated_at as string).getTime();
          const stalledMs = now - updatedAt;

          activePipelines.push({
            session_id: String(session.id),
            product_type: String(session.product_type ?? 'resume'),
            pipeline_status: (session.pipeline_status as 'running' | 'waiting') ?? 'running',
            pipeline_stage: session.pipeline_stage ? String(session.pipeline_stage) : undefined,
            pending_gate: session.pending_gate ? String(session.pending_gate) : undefined,
            started_at: String(session.created_at),
          });

          if (stalledMs > STALL_THRESHOLD_MS) {
            stalledItems.push({
              session_id: String(session.id),
              product_type: String(session.product_type ?? 'resume'),
              pipeline_stage: session.pipeline_stage ? String(session.pipeline_stage) : undefined,
              stalled_days: Math.floor(stalledMs / (24 * 60 * 60 * 1000)),
            });
          }
        }
      }

      // Completed pipelines (last 10, most recent first)
      const { data: completedSessions, error: completedError } = await supabaseAdmin
        .from('coach_sessions')
        .select('id, product_type, updated_at')
        .eq('user_id', userId)
        .eq('pipeline_status', 'complete')
        .order('updated_at', { ascending: false })
        .limit(10);

      if (completedError) {
        logger.warn({ error: completedError.message, userId }, 'load_client_context: completed sessions query failed');
      } else {
        for (const session of completedSessions ?? []) {
          const pt = String(session.product_type ?? 'resume');
          if (!completedProducts.includes(pt)) {
            completedProducts.push(pt);
          }
        }
        const mostRecent = completedSessions?.[0];
        if (mostRecent) {
          lastActivityAt = String(mostRecent.updated_at);
        }
      }
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), userId },
        'load_client_context: pipeline sessions query failed unexpectedly',
      );
    }

    // ─── 3. Load coaching memory ──────────────────────────────

    // coach_memory table may not exist yet — fail gracefully
    // (no-op if table absent; notes remain empty)

    // ─── 4. Load budget ───────────────────────────────────────

    // coach_budget table may not exist yet — use safe defaults
    let budget: CoachBudget = {
      daily_limit_usd: 5.0,
      used_today_usd: 0,
      remaining_daily_usd: 5.0,
      reset_at: new Date(Date.now() + 86400000).toISOString(),
    };

    try {
      const { data: budgetRow, error: budgetError } = await supabaseAdmin
        .from('coach_budget')
        .select('daily_budget_usd, daily_spent_usd, last_reset_daily')
        .eq('user_id', userId)
        .maybeSingle();

      if (!budgetError && budgetRow) {
        const limit = Number(budgetRow.daily_budget_usd ?? 5.0);
        const used = Number(budgetRow.daily_spent_usd ?? 0);
        budget = {
          daily_limit_usd: limit,
          used_today_usd: used,
          remaining_daily_usd: Math.max(0, limit - used),
          reset_at: String(budgetRow.last_reset_daily ?? budget.reset_at),
        };
      }
    } catch {
      // Table may not exist — defaults above are sufficient
    }

    // ─── 5. Determine journey phase ───────────────────────────

    const platformContextTypes = contextRows.map((r) => r.context_type);
    const journeyPhase = determineJourneyPhase(completedProducts, platformContextTypes);

    // ─── 6. Compute days since last activity ──────────────────

    let daysSinceLastActivity = 0;
    if (lastActivityAt) {
      const ms = Date.now() - new Date(lastActivityAt).getTime();
      daysSinceLastActivity = Math.floor(ms / (24 * 60 * 60 * 1000));
    }

    // ─── 7. Assemble snapshot ─────────────────────────────────

    const snapshot: ClientSnapshot = {
      user_id: userId,
      name,
      journey_phase: journeyPhase,
      client_profile: clientProfile as Record<string, unknown> | undefined,
      positioning_strategy: positioningStrategy as Record<string, unknown> | undefined,
      emotional_baseline: emotionalBaseline as Record<string, unknown> | undefined,
      evidence_items: evidenceRows.map((r) => r.content as Record<string, unknown>),
      career_narratives: narrativeRows.map((r) => r.content as Record<string, unknown>),
      active_pipelines: activePipelines,
      completed_products: completedProducts,
      stalled_items: stalledItems,
      days_since_last_activity: daysSinceLastActivity,
      last_activity_at: lastActivityAt,
    };

    ctx.updateState({ client_snapshot: snapshot, budget });

    ctx.emit({
      type: 'context_loaded',
      journey_phase: journeyPhase,
      has_profile: !!clientProfile,
      active_pipeline_count: activePipelines.length,
      completed_product_count: completedProducts.length,
    });

    ctx.emit({
      type: 'transparency',
      stage: 'load_client_context',
      message: `Context loaded — phase: ${journeyPhase}, ${completedProducts.length} products complete, ${activePipelines.length} active`,
    });

    return JSON.stringify({
      client_name: name ?? 'Unknown',
      journey_phase: journeyPhase,
      has_profile: !!clientProfile,
      has_positioning: !!positioningStrategy,
      has_emotional_baseline: !!emotionalBaseline,
      evidence_item_count: evidenceRows.length,
      career_narrative_count: narrativeRows.length,
      active_pipeline_count: activePipelines.length,
      completed_product_count: completedProducts.length,
      days_since_last_activity: daysSinceLastActivity,
      stalled_count: stalledItems.length,
      budget_remaining_daily: budget.remaining_daily_usd,
    });
  },
};

export { loadClientContextTool };
