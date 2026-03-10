/**
 * Virtual Coach Tool — create_action_plan
 *
 * Generates a structured, multi-step coaching plan tailored to the client's
 * current journey phase, completed products, and financial situation.
 * Uses MODEL_MID to synthesize recommendations into a cohesive plan.
 */

import type { CoachTool } from '../types.js';
import { llm, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import logger from '../../../lib/logger.js';
import { JOURNEY_PHASES } from '../knowledge/journey-phases.js';

const createActionPlanTool: CoachTool = {
  name: 'create_action_plan',
  description:
    'Generate a comprehensive, multi-step coaching action plan for the client. ' +
    'Includes specific product recommendations, estimated costs, timeline, and ' +
    'sequencing rationale. Use this when the client asks "what should I do?", ' +
    '"what\'s my plan?", or when starting a new coaching engagement in review mode.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      focus: {
        type: 'string',
        description:
          'Optional focus area for the plan (e.g., "interview preparation", "job search", "full transition")',
      },
      timeline_weeks: {
        type: 'number',
        description: 'Target timeline in weeks (default: determined by urgency)',
      },
    },
    required: [],
  },

  async execute(input, ctx) {
    const state = ctx.getState();
    const snapshot = state.client_snapshot;

    if (!snapshot) {
      return JSON.stringify({
        error: 'Client snapshot not loaded. Call load_client_context first.',
      });
    }

    const rawFocus = typeof input.focus === 'string' ? input.focus : 'full transition';
    const focus = rawFocus.replace(/[^\w\s,.\-']/g, '').trim().slice(0, 100) || 'full transition';
    const timelineWeeks = typeof input.timeline_weeks === 'number' ? input.timeline_weeks : null;

    // Build remaining phases context — skip phases whose products are all done
    const currentPhaseIndex = JOURNEY_PHASES.findIndex((p) => p.phase === snapshot.journey_phase);
    const remainingPhases = JOURNEY_PHASES.slice(Math.max(0, currentPhaseIndex));

    const totalEstimatedCost = remainingPhases.reduce((sum, p) => {
      const alreadyDone = p.typical_products.every((tp) =>
        snapshot.completed_products.includes(tp),
      );
      return alreadyDone ? sum : sum + p.estimated_cost_usd;
    }, 0);

    const profile = snapshot.client_profile as Record<string, unknown> | undefined;
    const financialSegment =
      typeof profile?.['financial_segment'] === 'string'
        ? profile['financial_segment']
        : 'ideal';
    const rawCareerLevel =
      typeof profile?.['career_level'] === 'string'
        ? profile['career_level']
        : 'mid-level executive';
    const careerLevel = rawCareerLevel.replace(/[^\w\s\-']/g, '').trim().slice(0, 50) || 'mid-level executive';

    // Urgency-based default timeline
    const defaultWeeks =
      financialSegment === 'crisis' ? 2 : financialSegment === 'stressed' ? 4 : 8;
    const targetWeeks = timelineWeeks ?? defaultWeeks;

    const planContext = {
      current_phase: snapshot.journey_phase,
      completed_products: snapshot.completed_products,
      active_pipelines: snapshot.active_pipelines.map((p) => ({
        product: p.product_type,
        status: p.pipeline_status,
        stage: p.pipeline_stage,
      })),
      stalled_items: snapshot.stalled_items.map((s) => ({
        product: s.product_type,
        days_stalled: s.stalled_days,
      })),
      remaining_phases: remainingPhases.map((p) => ({
        phase: p.phase,
        name: p.name,
        products: p.typical_products,
        cost: p.estimated_cost_usd,
        sequencing_note: p.sequencing_note,
      })),
      financial_segment: financialSegment,
      career_level: careerLevel,
      focus,
      target_weeks: targetWeeks,
      total_estimated_cost: totalEstimatedCost,
      budget_remaining: state.budget?.remaining_daily_usd ?? 0.5,
    };

    ctx.emit({
      type: 'stage_start',
      stage: 'action_plan',
      message: 'Generating your personalized action plan...',
    });

    try {
      const response = await llm.chat({
        model: MODEL_MID,
        system: `You are a career coaching strategist creating an action plan for a ${careerLevel}.
Generate a structured coaching action plan as a JSON object with this shape:
{
  "title": "string — plan title",
  "summary": "string — 1-2 sentence overview",
  "timeline_weeks": number,
  "total_estimated_cost_usd": number,
  "steps": [
    {
      "week": number,
      "action": "string — what to do",
      "product": "string | null — which platform product to use",
      "estimated_cost_usd": number,
      "rationale": "string — why this step matters now"
    }
  ],
  "urgency_note": "string | null — if financial pressure, note timeline implications"
}

Rules:
- Respect sequencing: positioning before resume, resume before LinkedIn, etc.
- Skip already-completed products.
- Address stalled items first.
- For crisis/stressed clients, compress timeline and prioritize highest-impact actions.
- Keep steps concrete and actionable.
- Return ONLY the JSON object, no markdown.`,
        messages: [
          {
            role: 'user',
            content: `Create a coaching action plan focused on "${focus}" with this client context:\n${JSON.stringify(planContext, null, 2)}`,
          },
        ],
        max_tokens: 2000,
        signal: ctx.signal,
        session_id: ctx.sessionId,
      });

      const parsed = repairJSON<Record<string, unknown>>(response.text);

      if (!parsed) {
        logger.warn(
          { sessionId: ctx.sessionId },
          'create_action_plan: JSON parse failed, using deterministic fallback',
        );
        return JSON.stringify(buildFallbackPlan(focus, targetWeeks, remainingPhases, snapshot.completed_products, totalEstimatedCost, financialSegment));
      }

      ctx.emit({
        type: 'stage_complete',
        stage: 'action_plan',
        message: 'Action plan ready',
      });

      return JSON.stringify(parsed);
    } catch (err) {
      logger.error({ err, sessionId: ctx.sessionId }, 'create_action_plan: LLM call failed');

      ctx.emit({
        type: 'pipeline_error',
        stage: 'action_plan',
        error: err instanceof Error ? err.message : String(err),
      });

      // Deterministic fallback — no LLM required
      return JSON.stringify(
        buildFallbackPlan(
          focus,
          targetWeeks,
          remainingPhases,
          snapshot.completed_products,
          totalEstimatedCost,
          financialSegment,
        ),
      );
    }
  },
};

// ─── Helpers ──────────────────────────────────────────────────────

import type { PhaseDefinition } from '../knowledge/journey-phases.js';

function buildFallbackPlan(
  focus: string,
  targetWeeks: number,
  remainingPhases: PhaseDefinition[],
  completedProducts: string[],
  totalEstimatedCost: number,
  financialSegment: string,
): Record<string, unknown> {
  const incompletePhases = remainingPhases.filter(
    (p) => !p.typical_products.every((tp) => completedProducts.includes(tp)),
  );

  const steps = incompletePhases.map((p, i) => ({
    week: Math.max(1, Math.ceil(((i + 1) / Math.max(incompletePhases.length, 1)) * targetWeeks)),
    action: `Complete ${p.name}: ${p.description}`,
    product: p.typical_products[0] ?? null,
    estimated_cost_usd: p.estimated_cost_usd,
    rationale: p.sequencing_note,
  }));

  return {
    title: `${focus} Action Plan`,
    summary: `A ${targetWeeks}-week plan covering ${steps.length} remaining phase${steps.length !== 1 ? 's' : ''}.`,
    timeline_weeks: targetWeeks,
    total_estimated_cost_usd: totalEstimatedCost,
    steps,
    urgency_note:
      financialSegment === 'crisis' || financialSegment === 'stressed'
        ? `Financial segment is "${financialSegment}" — compressed timeline recommended.`
        : null,
  };
}

export { createActionPlanTool };
