/**
 * Virtual Coach Tool — dispatch_pipeline
 *
 * Prepares a specialized agent pipeline for the client by verifying budget,
 * checking for an already-active session of the same product, then emitting
 * a recommendation_ready event so the frontend can navigate the user to the
 * correct room.
 *
 * The coach is a CONSUMER of product pipelines — it never embeds pipeline
 * logic. It checks state, validates budget, and directs the user. Execution
 * happens inside the product's own room/route.
 */

import type { CoachTool } from '../types.js';
import { JOURNEY_PHASES } from '../knowledge/journey-phases.js';
import logger from '../../../lib/logger.js';
import { PRODUCT_ROOM_MAP } from '../knowledge/room-map.js';

const log = logger.child({ tool: 'dispatch_pipeline' });

// ─── Tool ──────────────────────────────────────────────────────────

const dispatchPipelineTool: CoachTool = {
  name: 'dispatch_pipeline',
  description:
    'Prepare a specialized agent pipeline for the client. Validates budget, checks for duplicate ' +
    'active sessions, and emits a navigation event so the frontend routes the user to the correct room. ' +
    'Use this when you have determined the client should run a specific product pipeline (resume, ' +
    'cover_letter, linkedin_editor, interview_prep, salary_negotiation, etc.). ' +
    'Always call estimate_task_cost first to confirm the budget can support the pipeline.',
  model_tier: undefined, // Pure orchestration — no LLM call inside the tool
  input_schema: {
    type: 'object',
    properties: {
      product: {
        type: 'string',
        description:
          'The product domain to dispatch (e.g., "resume", "cover_letter", "linkedin_editor", ' +
          '"interview_prep", "salary_negotiation", "networking_outreach", "executive_bio", ' +
          '"job_finder", "ninety_day_plan", "personal_brand")',
      },
      reason: {
        type: 'string',
        description: 'Why this pipeline is being dispatched right now — surfaces to the client as context',
      },
    },
    required: ['product', 'reason'],
  },

  async execute(input, ctx) {
    const state = ctx.getState();
    const product = String(input.product ?? '').trim();
    const reason = String(input.reason ?? '').trim();

    // ─── Validate product ────────────────────────────────────
    if (!product) {
      return JSON.stringify({ error: 'Product domain is required' });
    }

    const room = PRODUCT_ROOM_MAP[product];
    if (!room) {
      return JSON.stringify({
        error: `Unknown product domain: "${product}". Valid products: ${Object.keys(PRODUCT_ROOM_MAP).join(', ')}`,
      });
    }

    // ─── Budget guard ────────────────────────────────────────
    const budget = state.budget;
    if (budget) {
      const phase = JOURNEY_PHASES.find((p) => p.typical_products.includes(product));
      const estimatedCost = phase?.estimated_cost_usd ?? 0.10;

      if (budget.remaining_daily_usd < estimatedCost) {
        log.warn(
          { userId: state.user_id, product, remaining: budget.remaining_daily_usd, estimatedCost },
          'dispatch_pipeline: daily budget exceeded',
        );
        return JSON.stringify({
          error: 'daily_budget_exceeded',
          message:
            `Daily AI budget is low ($${budget.remaining_daily_usd.toFixed(2)} remaining). ` +
            `The ${product} pipeline costs approximately $${estimatedCost.toFixed(2)}. ` +
            `Consider waiting until tomorrow or focusing on lower-cost actions.`,
          remaining_budget_usd: budget.remaining_daily_usd,
          estimated_cost_usd: estimatedCost,
        });
      }
    }

    // ─── Duplicate active session guard ───────────────────────
    const snapshot = state.client_snapshot;
    if (snapshot) {
      const existing = snapshot.active_pipelines.find((p) => p.product_type === product);
      if (existing) {
        log.info(
          { userId: state.user_id, product, sessionId: existing.session_id },
          'dispatch_pipeline: pipeline already active',
        );
        return JSON.stringify({
          status: 'already_active',
          message:
            `A ${product} pipeline is already active ` +
            `(session: ${existing.session_id}, status: ${existing.pipeline_status}). ` +
            `Navigate to the ${room} room to continue it.`,
          session_id: existing.session_id,
          room,
        });
      }
    }

    // ─── Emit navigation event ───────────────────────────────
    ctx.emit({
      type: 'recommendation_ready',
      action: `Start ${product.replace(/_/g, ' ')} pipeline`,
      product,
      room,
      urgency: 'immediate',
    });

    log.info({ userId: state.user_id, product, room, reason }, 'dispatch_pipeline: pipeline dispatched');

    return JSON.stringify({
      status: 'ready',
      product,
      room,
      reason,
      message:
        `I've prepared the ${product.replace(/_/g, ' ')} pipeline. ` +
        `Navigate to the ${room} room to get started. ${reason}`,
    });
  },
};

export { dispatchPipelineTool };
