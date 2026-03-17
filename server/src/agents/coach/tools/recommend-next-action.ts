/**
 * Virtual Coach Tool — recommend_next_action
 *
 * The coach's primary recommendation engine. Uses the coaching methodology to
 * recommend the single most impactful next action for the client.
 *
 * Decision logic is deterministic — the LLM calling this tool receives a
 * structured recommendation to reason about and present to the client.
 * No LLM call inside the tool — the agent loop is the reasoning layer.
 */

import type { CoachTool, ClientSnapshot } from '../types.js';
import { JOURNEY_PHASES } from '../knowledge/journey-phases.js';
import { PRODUCT_ROOM_MAP } from '../knowledge/room-map.js';

// ─── Urgency type ──────────────────────────────────────────────────

type Urgency = 'immediate' | 'soon' | 'when_ready';

// ─── Reusable recommendation engine ────────────────────────────────

/**
 * Pure deterministic recommendation engine. Runs the decision tree against
 * a client snapshot and returns a structured recommendation. No LLM call.
 *
 * Shared between the agent tool (called during conversation) and the
 * GET /api/coach/recommend endpoint (lightweight API for sidebar/dashboard).
 */
export function getRecommendation(snapshot: ClientSnapshot): RecommendationResult {
  const phase = snapshot.journey_phase;
  const currentPhaseDef = JOURNEY_PHASES.find((p) => p.phase === phase);

  const emotionalState =
    typeof (snapshot.emotional_baseline as Record<string, unknown> | undefined)?.['state'] === 'string'
      ? String((snapshot.emotional_baseline as Record<string, unknown>)['state'])
      : 'unknown';

  const financialSegment =
    typeof (snapshot.client_profile as Record<string, unknown> | undefined)?.['financial_segment'] === 'string'
      ? String((snapshot.client_profile as Record<string, unknown>)['financial_segment'])
      : 'ideal';

  // ─── Decision tree ────────────────────────────────────────
  // Priority order (highest to lowest):
  // 1. Emotional crisis — support first
  // 2. No client profile — must onboard
  // 3. No positioning strategy — must position
  // 4. Stalled items — resume the stall
  // 5. Active pipelines waiting on user — take action
  // 6. Active pipelines running — let them run
  // 7. Incomplete current phase — start it
  // 8. Current phase complete — advance to next
  // 9. All phases complete — maintenance

  // 1. Emotional crisis takes absolute priority
  if (emotionalState === 'denial' || emotionalState === 'anger' || emotionalState === 'depression') {
    const isFinancialCrisis = financialSegment === 'crisis';
    return {
      action: isFinancialCrisis
        ? 'Your situation needs our immediate attention. Let\'s talk through where you are and create a focused action plan for the next 7 days.'
        : 'Before we dive into strategy, let\'s check in on how you\'re doing. Career transitions are hard — especially this kind.',
      product: undefined,
      room: undefined,
      rationale:
        'Coaching methodology rule: emotional state is the foundation of all other work. A client in crisis cannot effectively execute career strategy. We address the human first.',
      estimated_cost_usd: 0,
      urgency: isFinancialCrisis ? 'immediate' : 'soon',
      sequencing_note:
        'Emotional readiness precedes strategic execution. Processing the transition is not a detour — it is the path.',
    };
  }

  // 2. No client profile — onboarding is mandatory
  if (!snapshot.client_profile) {
    return {
      action: 'Complete the onboarding assessment to establish your coaching profile.',
      product: 'onboarding',
      room: PRODUCT_ROOM_MAP['onboarding'],
      rationale:
        'Every downstream agent — resume writer, LinkedIn optimizer, interview coach — adapts to your profile. Without it, coaching is generic. With it, every tool is calibrated to you.',
      estimated_cost_usd: JOURNEY_PHASES.find((p) => p.phase === 'onboarding')?.estimated_cost_usd ?? 0.01,
      urgency: 'immediate',
      sequencing_note:
        'Onboarding is the keystone. It takes less than 5 minutes and unlocks personalized coaching across the entire platform.',
    };
  }

  // 3. No positioning strategy — resume pipeline is next
  if (!snapshot.positioning_strategy) {
    return {
      action: 'Start the resume pipeline to surface your positioning strategy through the positioning interview.',
      product: 'resume',
      room: PRODUCT_ROOM_MAP['resume'],
      rationale:
        'Positioning is the foundation of everything. The interview surfaces experience that never makes it onto a resume — the 99% that makes an executive the benchmark candidate.',
      estimated_cost_usd: JOURNEY_PHASES.find((p) => p.phase === 'positioning')?.estimated_cost_usd ?? 0.23,
      urgency: financialSegment === 'crisis' ? 'immediate' : 'soon',
      sequencing_note:
        'Positioning flows downhill. A resume, LinkedIn profile, or interview pitch written without a positioning strategy produces generic output. Positioning comes first, always.',
    };
  }

  // 4. Stalled items — address the stall before starting new work
  if (snapshot.stalled_items.length > 0) {
    const stall = snapshot.stalled_items[0];
    const room = PRODUCT_ROOM_MAP[stall.product_type] ?? stall.product_type;
    const days = stall.stalled_days;
    return {
      action: `Resume your ${stall.product_type.replace(/_/g, ' ')} pipeline — it has been paused for ${days} day${days !== 1 ? 's' : ''}.`,
      product: stall.product_type,
      room,
      rationale:
        `A pipeline in progress is halfway done. Resuming takes seconds — starting over costs time and AI credits. The ${stall.product_type} pipeline is waiting for your input.`,
      estimated_cost_usd: 0,
      urgency: days >= 3 ? 'immediate' : 'soon',
      sequencing_note:
        'Momentum matters. Paused pipelines lose context and lose the thread of work. Resume this pipeline before starting anything new.',
    };
  }

  // 5. Active pipelines with a pending gate — take action
  const waitingPipeline = snapshot.active_pipelines.find((p) => p.pipeline_status === 'waiting' && p.pending_gate);
  if (waitingPipeline) {
    const room = PRODUCT_ROOM_MAP[waitingPipeline.product_type] ?? waitingPipeline.product_type;
    return {
      action: `Your ${waitingPipeline.product_type.replace(/_/g, ' ')} pipeline is waiting for your response at the "${waitingPipeline.pending_gate}" step.`,
      product: waitingPipeline.product_type,
      room,
      rationale:
        'The pipeline is mid-execution and paused for your input. Responding now continues the pipeline where it left off — no restart needed.',
      estimated_cost_usd: 0,
      urgency: 'immediate',
      sequencing_note:
        'Pipeline gates are checkpoints where your review and approval shapes the final output. Your input here directly affects quality.',
    };
  }

  // 6. Active pipelines running — they are in progress, move on
  if (snapshot.active_pipelines.length > 0) {
    const running = snapshot.active_pipelines[0];
    const room = PRODUCT_ROOM_MAP[running.product_type] ?? running.product_type;
    return {
      action: `Your ${running.product_type.replace(/_/g, ' ')} pipeline is running — check back in a few minutes for results.`,
      product: running.product_type,
      room,
      rationale:
        'An active pipeline is already doing work. No action needed right now — the AI is processing.',
      estimated_cost_usd: 0,
      urgency: 'when_ready',
      sequencing_note:
        'Pipelines run asynchronously. You will receive a notification when the pipeline reaches a gate that needs your input.',
    };
  }

  // 7. Current phase incomplete — recommend starting the primary product
  if (currentPhaseDef) {
    const primaryProduct = currentPhaseDef.typical_products[0];
    if (primaryProduct && !snapshot.completed_products.includes(primaryProduct)) {
      const room = PRODUCT_ROOM_MAP[primaryProduct] ?? primaryProduct;
      return {
        action: `Start the ${primaryProduct.replace(/_/g, ' ')} pipeline to advance through the ${currentPhaseDef.name} phase.`,
        product: primaryProduct,
        room,
        rationale: currentPhaseDef.description,
        estimated_cost_usd: currentPhaseDef.estimated_cost_usd,
        urgency: financialSegment === 'crisis' ? 'immediate' : financialSegment === 'stressed' ? 'soon' : 'when_ready',
        sequencing_note: currentPhaseDef.sequencing_note,
      };
    }
  }

  // 8. Current phase complete — advance to next phase
  const currentIndex = JOURNEY_PHASES.findIndex((p) => p.phase === phase);
  const nextPhaseDef = currentIndex >= 0 && currentIndex < JOURNEY_PHASES.length - 1
    ? JOURNEY_PHASES[currentIndex + 1]
    : null;

  if (nextPhaseDef) {
    const primaryProduct = nextPhaseDef.typical_products[0];
    const room = primaryProduct ? (PRODUCT_ROOM_MAP[primaryProduct] ?? primaryProduct) : undefined;
    return {
      action: `You're ready to advance to ${nextPhaseDef.name}. ${nextPhaseDef.description}`,
      product: primaryProduct,
      room,
      rationale: nextPhaseDef.description,
      estimated_cost_usd: nextPhaseDef.estimated_cost_usd,
      urgency: financialSegment === 'crisis' ? 'immediate' : 'soon',
      sequencing_note: nextPhaseDef.sequencing_note,
    };
  }

  // 9. All phases complete — maintenance / career profile refresh
  return {
    action: 'Your transition is complete. Refresh your Career Profile so your positioning, LinkedIn story, and future applications stay aligned.',
    product: 'onboarding',
    room: PRODUCT_ROOM_MAP.onboarding,
    rationale:
      'Career Profile now carries the platform-wide positioning context. Keeping it current preserves consistency across resume, LinkedIn, interviews, and future transitions.',
    estimated_cost_usd: JOURNEY_PHASES.find((p) => p.phase === 'complete')?.estimated_cost_usd ?? 0.10,
    urgency: 'when_ready',
    sequencing_note:
      'Treat Career Profile as the source of truth for your brand story. Update it when your scope, differentiators, or target direction change.',
  };
}

// ─── Tool ──────────────────────────────────────────────────────────

const recommendNextActionTool: CoachTool = {
  name: 'recommend_next_action',
  description:
    'Based on the coaching methodology, the client\'s journey phase, emotional state, and platform data, ' +
    'recommend the single most impactful next action. This considers sequencing rules, stalled items, ' +
    'and the client\'s readiness.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      context: {
        type: 'string',
        description: 'Optional additional context about what the client just asked or what triggered this recommendation',
      },
    },
    required: [],
  },

  async execute(_input, ctx) {
    const state = ctx.getState();
    const snapshot = state.client_snapshot;

    if (!snapshot) {
      return JSON.stringify({
        error: 'Client snapshot not loaded. Call load_client_context first.',
      });
    }

    const rec = getRecommendation(snapshot);
    return buildRecommendationJson(rec);
  },
};

// ─── Helpers ───────────────────────────────────────────────────────

export interface RecommendationResult {
  action: string;
  product: string | undefined;
  room: string | undefined;
  rationale: string;
  estimated_cost_usd: number;
  urgency: Urgency;
  sequencing_note: string;
}

function buildRecommendationJson(rec: RecommendationResult): string {
  return JSON.stringify({
    action: rec.action,
    product: rec.product ?? null,
    room: rec.room ?? null,
    rationale: rec.rationale,
    estimated_cost_usd: rec.estimated_cost_usd,
    urgency: rec.urgency,
    sequencing_note: rec.sequencing_note,
  });
}

export { recommendNextActionTool };
