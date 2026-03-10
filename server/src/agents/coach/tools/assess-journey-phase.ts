/**
 * Virtual Coach Tool — assess_journey_phase
 *
 * Evaluates where the client is in the 8-phase coaching journey. Returns the
 * current phase, completed phases, what is blocking progress, and what the
 * next phase requires.
 *
 * Call this after load_client_context to understand the client's trajectory.
 * No LLM call — pure deterministic logic using JOURNEY_PHASES definitions.
 */

import type { CoachTool } from '../types.js';
import type { CoachingPhase } from '../types.js';
import { JOURNEY_PHASES } from '../knowledge/journey-phases.js';

// ─── Tool ──────────────────────────────────────────────────────────

const assessJourneyPhaseTool: CoachTool = {
  name: 'assess_journey_phase',
  description:
    'Evaluate where the client is in the 8-phase coaching journey. Returns the current phase, ' +
    'what has been completed, what is blocking progress, and what the next phase requires. ' +
    'Use this to understand the client\'s overall trajectory.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
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

    const currentPhase = snapshot.journey_phase;
    const completedProducts = new Set(snapshot.completed_products);
    const platformContextTypes = new Set([
      ...(snapshot.client_profile ? ['client_profile'] : []),
      ...(snapshot.positioning_strategy ? ['positioning_strategy'] : []),
      ...(snapshot.emotional_baseline ? ['emotional_baseline'] : []),
      ...(snapshot.evidence_items.length > 0 ? ['evidence_item'] : []),
      ...(snapshot.career_narratives.length > 0 ? ['career_narrative'] : []),
    ]);

    const allCompleted = new Set([...completedProducts, ...platformContextTypes]);

    // ─── Determine completed phases ───────────────────────────

    const completedPhases: CoachingPhase[] = [];
    for (const phaseDef of JOURNEY_PHASES) {
      const isComplete = phaseDef.completion_signals.every((s) => allCompleted.has(s));
      if (isComplete) {
        completedPhases.push(phaseDef.phase);
      }
    }

    // ─── Find current phase definition ────────────────────────

    const currentPhaseDef = JOURNEY_PHASES.find((p) => p.phase === currentPhase)
      ?? JOURNEY_PHASES[0];

    // ─── Determine next phase ─────────────────────────────────

    const currentIndex = JOURNEY_PHASES.findIndex((p) => p.phase === currentPhase);
    const nextPhaseDef = currentIndex >= 0 && currentIndex < JOURNEY_PHASES.length - 1
      ? JOURNEY_PHASES[currentIndex + 1]
      : null;

    // ─── Identify blockers ────────────────────────────────────

    const blockers: string[] = [];

    // Blockers for completing the current phase
    for (const signal of currentPhaseDef.completion_signals) {
      if (!allCompleted.has(signal)) {
        blockers.push(`"${signal}" must be completed to finish the ${currentPhaseDef.name} phase`);
      }
    }

    // Blockers for advancing to next phase
    if (nextPhaseDef) {
      for (const prereq of nextPhaseDef.prerequisites) {
        if (!allCompleted.has(prereq)) {
          blockers.push(
            `"${prereq}" is required before starting ${nextPhaseDef.name} — ${nextPhaseDef.sequencing_note}`,
          );
        }
      }
    }

    // ─── Stall assessment ─────────────────────────────────────

    const hasStalls = snapshot.stalled_items.length > 0;
    const stalledProductNames = snapshot.stalled_items.map(
      (s) => `${s.product_type} (stalled ${s.stalled_days}d)`,
    );

    // ─── Compute days in current phase ────────────────────────

    // Best approximation: time since last activity, or since latest active pipeline started
    let daysInCurrentPhase = snapshot.days_since_last_activity;
    if (snapshot.active_pipelines.length > 0) {
      const earliest = snapshot.active_pipelines.reduce((acc, p) => {
        const t = new Date(p.started_at).getTime();
        return t < acc ? t : acc;
      }, Date.now());
      daysInCurrentPhase = Math.floor((Date.now() - earliest) / (24 * 60 * 60 * 1000));
    }

    // ─── Recommended focus ────────────────────────────────────

    let recommendedFocus: string;
    if (hasStalls) {
      recommendedFocus = `Resume a stalled pipeline: ${stalledProductNames.join(', ')}`;
    } else if (snapshot.active_pipelines.length > 0) {
      const names = snapshot.active_pipelines.map((p) => p.product_type).join(', ');
      recommendedFocus = `Continue active pipeline: ${names}`;
    } else if (blockers.length > 0) {
      recommendedFocus = `Address blockers to advance from ${currentPhaseDef.name}`;
    } else if (nextPhaseDef) {
      recommendedFocus = `Start ${nextPhaseDef.name} — ${nextPhaseDef.description}`;
    } else {
      recommendedFocus = 'Transition complete — focus on succeeding in the new role';
    }

    const emotionalState =
      typeof (snapshot.emotional_baseline as Record<string, unknown> | undefined)?.['state'] === 'string'
        ? String((snapshot.emotional_baseline as Record<string, unknown>)['state'])
        : 'unknown';

    ctx.emit({
      type: 'phase_assessed',
      current_phase: currentPhase,
      completed_phases: completedPhases,
      blockers,
    });

    return JSON.stringify({
      current_phase: currentPhase,
      phase_name: currentPhaseDef.name,
      phase_description: currentPhaseDef.description,
      completed_phases: completedPhases,
      next_phase: nextPhaseDef?.phase ?? null,
      next_phase_name: nextPhaseDef?.name ?? null,
      next_phase_sequencing_note: nextPhaseDef?.sequencing_note ?? null,
      blockers,
      recommended_focus: recommendedFocus,
      days_in_current_phase: daysInCurrentPhase,
      has_stalled_items: hasStalls,
      stalled_items: stalledProductNames,
      emotional_state: emotionalState,
      active_pipelines: snapshot.active_pipelines.map((p) => ({
        product_type: p.product_type,
        status: p.pipeline_status,
        stage: p.pipeline_stage ?? null,
        pending_gate: p.pending_gate ?? null,
      })),
    });
  },
};

export { assessJourneyPhaseTool };
