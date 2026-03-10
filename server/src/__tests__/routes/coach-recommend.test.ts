/**
 * Unit tests for the getRecommendation engine in recommend-next-action.
 *
 * Tests the pure deterministic decision tree directly — no HTTP layer,
 * no mocking of the Anthropic or Supabase clients required.
 *
 * Decision tree priority order (highest to lowest):
 * 1. Emotional crisis (denial / anger / depression)
 * 2. No client_profile — onboarding required
 * 3. No positioning_strategy — resume pipeline required
 * 4. Stalled items — resume the stall
 * 5. Active pipeline waiting at a gate — take action
 * 6. Active pipeline running — wait for it
 * 7. Current phase incomplete — start primary product
 * 8. Current phase complete — advance to next phase
 * 9. All phases complete — maintenance
 */

import { describe, it, expect } from 'vitest';
import { getRecommendation } from '../../agents/coach/tools/recommend-next-action.js';
import type { ClientSnapshot, ActivePipeline, StalledItem } from '../../agents/coach/types.js';

// ─── Fixture factory ────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<ClientSnapshot> = {}): ClientSnapshot {
  return {
    user_id: 'test-user',
    journey_phase: 'onboarding',
    evidence_items: [],
    career_narratives: [],
    active_pipelines: [],
    completed_products: [],
    stalled_items: [],
    days_since_last_activity: 0,
    ...overrides,
  };
}

function makeActivePipeline(overrides: Partial<ActivePipeline> = {}): ActivePipeline {
  return {
    session_id: 'session-abc',
    product_type: 'resume',
    pipeline_status: 'running',
    started_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeStalledItem(overrides: Partial<StalledItem> = {}): StalledItem {
  return {
    session_id: 'session-stalled',
    product_type: 'resume',
    stalled_days: 2,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('getRecommendation', () => {
  // ── Priority 1: Emotional crisis ──────────────────────────────────────────

  it('returns emotional support recommendation when emotional state is denial', () => {
    const snapshot = makeSnapshot({
      client_profile: { career_level: 'executive' },
      positioning_strategy: { positioning_angle: 'VP Engineering' },
      emotional_baseline: { state: 'denial' },
    });

    const result = getRecommendation(snapshot);

    expect(result.product).toBeUndefined();
    expect(result.room).toBeUndefined();
    expect(result.urgency).toBe('soon');
    expect(result.action).toContain('check in on how you\'re doing');
  });

  it('returns immediate urgency for emotional crisis combined with financial crisis', () => {
    const snapshot = makeSnapshot({
      client_profile: { financial_segment: 'crisis' },
      positioning_strategy: { positioning_angle: 'VP Engineering' },
      emotional_baseline: { state: 'depression' },
    });

    const result = getRecommendation(snapshot);

    expect(result.urgency).toBe('immediate');
    expect(result.action).toContain('immediate attention');
  });

  // ── Priority 2: No client_profile ─────────────────────────────────────────

  it('returns onboarding recommendation when client_profile is missing', () => {
    const snapshot = makeSnapshot({
      client_profile: undefined,
    });

    const result = getRecommendation(snapshot);

    expect(result.product).toBe('onboarding');
    expect(result.room).toBe('dashboard');
    expect(result.urgency).toBe('immediate');
    expect(result.action).toContain('onboarding assessment');
  });

  it('returns onboarding even when stalled items exist but profile is missing', () => {
    const snapshot = makeSnapshot({
      client_profile: undefined,
      stalled_items: [makeStalledItem()],
    });

    const result = getRecommendation(snapshot);

    // Profile check outranks stalled items
    expect(result.product).toBe('onboarding');
  });

  // ── Priority 3: No positioning_strategy ───────────────────────────────────

  it('returns resume recommendation when positioning_strategy is missing', () => {
    const snapshot = makeSnapshot({
      client_profile: { career_level: 'vp' },
      positioning_strategy: undefined,
    });

    const result = getRecommendation(snapshot);

    expect(result.product).toBe('resume');
    expect(result.room).toBe('resume');
    expect(result.action).toContain('resume pipeline');
  });

  it('returns immediate urgency for missing positioning_strategy when client is in financial crisis', () => {
    const snapshot = makeSnapshot({
      client_profile: { financial_segment: 'crisis' },
      positioning_strategy: undefined,
    });

    const result = getRecommendation(snapshot);

    expect(result.product).toBe('resume');
    expect(result.urgency).toBe('immediate');
  });

  it('returns soon urgency for missing positioning_strategy when client is not in crisis', () => {
    const snapshot = makeSnapshot({
      client_profile: { career_level: 'director' },
      positioning_strategy: undefined,
    });

    const result = getRecommendation(snapshot);

    expect(result.urgency).toBe('soon');
  });

  // ── Priority 4: Stalled items ─────────────────────────────────────────────

  it('returns stalled item recommendation when stalled_items has entries', () => {
    const snapshot = makeSnapshot({
      client_profile: { career_level: 'vp' },
      positioning_strategy: { positioning_angle: 'VP Engineering' },
      stalled_items: [makeStalledItem({ product_type: 'cover_letter', stalled_days: 2 })],
    });

    const result = getRecommendation(snapshot);

    expect(result.product).toBe('cover_letter');
    expect(result.action).toContain('cover letter');
    expect(result.action).toContain('2 days');
    expect(result.urgency).toBe('soon');
  });

  it('returns immediate urgency for stalled item when stalled 3 or more days', () => {
    const snapshot = makeSnapshot({
      client_profile: { career_level: 'vp' },
      positioning_strategy: { positioning_angle: 'VP Engineering' },
      stalled_items: [makeStalledItem({ stalled_days: 5 })],
    });

    const result = getRecommendation(snapshot);

    expect(result.urgency).toBe('immediate');
    expect(result.action).toContain('5 days');
  });

  it('uses the first stalled item when multiple are present', () => {
    const snapshot = makeSnapshot({
      client_profile: { career_level: 'vp' },
      positioning_strategy: { positioning_angle: 'VP Engineering' },
      stalled_items: [
        makeStalledItem({ product_type: 'resume', stalled_days: 1 }),
        makeStalledItem({ product_type: 'cover_letter', stalled_days: 4 }),
      ],
    });

    const result = getRecommendation(snapshot);

    expect(result.product).toBe('resume');
  });

  // ── Priority 5: Active pipeline waiting at gate ───────────────────────────

  it('returns waiting pipeline recommendation when active pipeline has a pending gate', () => {
    const snapshot = makeSnapshot({
      client_profile: { career_level: 'vp' },
      positioning_strategy: { positioning_angle: 'VP Engineering' },
      active_pipelines: [
        makeActivePipeline({
          product_type: 'resume',
          pipeline_status: 'waiting',
          pending_gate: 'architect_review',
        }),
      ],
    });

    const result = getRecommendation(snapshot);

    expect(result.product).toBe('resume');
    expect(result.room).toBe('resume');
    expect(result.urgency).toBe('immediate');
    expect(result.action).toContain('architect_review');
    expect(result.action).toContain('waiting');
  });

  it('uses the room map slug for waiting pipeline room value', () => {
    const snapshot = makeSnapshot({
      client_profile: { career_level: 'vp' },
      positioning_strategy: { positioning_angle: 'VP Engineering' },
      active_pipelines: [
        makeActivePipeline({
          product_type: 'interview_prep',
          pipeline_status: 'waiting',
          pending_gate: 'question_review',
        }),
      ],
    });

    const result = getRecommendation(snapshot);

    expect(result.room).toBe('interview');
  });

  // ── Priority 6: Active pipeline running ───────────────────────────────────

  it('returns running pipeline recommendation when pipeline is active but not waiting', () => {
    const snapshot = makeSnapshot({
      client_profile: { career_level: 'vp' },
      positioning_strategy: { positioning_angle: 'VP Engineering' },
      active_pipelines: [
        makeActivePipeline({ pipeline_status: 'running' }),
      ],
    });

    const result = getRecommendation(snapshot);

    expect(result.product).toBe('resume');
    expect(result.urgency).toBe('when_ready');
    expect(result.action).toContain('running');
  });

  it('does not treat a waiting pipeline without a pending_gate as a gate action', () => {
    const snapshot = makeSnapshot({
      client_profile: { career_level: 'vp' },
      positioning_strategy: { positioning_angle: 'VP Engineering' },
      active_pipelines: [
        makeActivePipeline({
          pipeline_status: 'waiting',
          pending_gate: undefined,
        }),
      ],
    });

    const result = getRecommendation(snapshot);

    // Falls through to priority 6 (running pipeline message)
    expect(result.urgency).toBe('when_ready');
  });

  // ── Priority 7 / 8: Phase advancement ─────────────────────────────────────

  it('returns primary product for current phase when no other conditions match', () => {
    const snapshot = makeSnapshot({
      journey_phase: 'interview_prep',
      client_profile: { career_level: 'director' },
      positioning_strategy: { positioning_angle: 'Director Product' },
    });

    const result = getRecommendation(snapshot);

    expect(result.product).toBe('interview_prep');
    expect(result.room).toBe('interview');
  });

  it('advances to the next phase when the current phase primary product is already complete', () => {
    const snapshot = makeSnapshot({
      journey_phase: 'onboarding',
      client_profile: { career_level: 'vp' },
      positioning_strategy: { positioning_angle: 'VP Engineering' },
      // onboarding product already completed — expect next phase (positioning → resume)
      completed_products: ['onboarding'],
    });

    const result = getRecommendation(snapshot);

    // Next phase after onboarding is 'positioning', whose primary product is 'resume'
    expect(result.product).toBe('resume');
  });

  // ── Priority 9: All phases complete ───────────────────────────────────────

  it('returns maintenance recommendation when journey_phase is complete and no other conditions apply', () => {
    const snapshot = makeSnapshot({
      journey_phase: 'complete',
      client_profile: { career_level: 'vp' },
      positioning_strategy: { positioning_angle: 'VP Engineering' },
      // complete phase primary products already done
      completed_products: ['ninety_day_plan', 'personal_brand'],
    });

    const result = getRecommendation(snapshot);

    expect(result.product).toBe('personal_brand');
    expect(result.room).toBe('personal-brand');
    expect(result.urgency).toBe('when_ready');
    expect(result.action).toContain('personal brand');
  });

  // ── Return shape ──────────────────────────────────────────────────────────

  it('always returns an object with the required shape fields', () => {
    const snapshot = makeSnapshot({ client_profile: undefined });
    const result = getRecommendation(snapshot);

    expect(result).toHaveProperty('action');
    expect(result).toHaveProperty('rationale');
    expect(result).toHaveProperty('urgency');
    expect(result).toHaveProperty('sequencing_note');
    expect(result).toHaveProperty('estimated_cost_usd');
    expect(['immediate', 'soon', 'when_ready']).toContain(result.urgency);
    expect(typeof result.estimated_cost_usd).toBe('number');
  });
});
