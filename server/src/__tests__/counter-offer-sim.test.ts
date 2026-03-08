/**
 * Tests for Counter-Offer simulation tools.
 * Validates evaluate_response tool produces structured evaluations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────

const mockChat = vi.hoisted(() => vi.fn());

vi.mock('../lib/llm.js', () => ({
  llm: { chat: mockChat },
  MODEL_MID: 'test-mid',
  MODEL_PRIMARY: 'test-primary',
  MODEL_LIGHT: 'test-light',
  MODEL_ORCHESTRATOR: 'test-orchestrator',
}));

vi.mock('../lib/json-repair.js', () => ({
  repairJSON: vi.fn((text: string) => {
    try { return JSON.parse(text); } catch { return null; }
  }),
}));

import { employerTools } from '../agents/salary-negotiation/simulation/employer/tools.js';
import type { CounterOfferSimState } from '../agents/salary-negotiation/simulation/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeState(overrides: Partial<CounterOfferSimState> = {}): CounterOfferSimState {
  return {
    session_id: 'sess-1',
    user_id: 'user-1',
    current_stage: 'negotiation',
    mode: 'full',
    max_rounds: 3,
    current_round: 1,
    pushbacks: [{
      round: 1,
      round_type: 'initial_response',
      employer_statement: 'This is our best offer at this time.',
      employer_tactic: 'anchoring',
      coaching_hint: 'Stay anchored to your value.',
    }],
    evaluations: [],
    offer_company: 'TechCorp',
    offer_role: 'VP Engineering',
    offer_base_salary: 200000,
    offer_total_comp: 280000,
    target_salary: 240000,
    ...overrides,
  };
}

function makeContext(state: CounterOfferSimState) {
  return {
    getState: () => state,
    updateState: vi.fn(),
    emit: vi.fn(),
    waitForUser: vi.fn(),
    scratchpad: {} as Record<string, unknown>,
    signal: new AbortController().signal,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('evaluateResponseTool', () => {
  const evaluateResponse = employerTools.find(t => t.name === 'evaluate_response')!;

  beforeEach(() => {
    mockChat.mockReset();
  });

  it('returns structured evaluation with tactic effectiveness scores', async () => {
    mockChat.mockResolvedValue({
      text: JSON.stringify({
        scores: { confidence: 85, value_anchoring: 78, specificity: 72, collaboration: 90 },
        overall_score: 82,
        what_worked: ['Strong value anchoring', 'Professional tone'],
        what_to_improve: ['Add specific market data'],
        coach_note: 'Lead with your unique value proposition next round.',
      }),
    });

    const state = makeState();
    const ctx = makeContext(state);
    const result = await evaluateResponse.execute(
      { round: 1, user_response: 'I appreciate the offer. Based on market data and my track record...' },
      ctx as never,
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.evaluation).toBeDefined();
    expect(parsed.evaluation.scores.confidence).toBe(85);
    expect(parsed.evaluation.overall_score).toBe(82);
    expect(parsed.evaluation.what_worked).toHaveLength(2);
    expect(parsed.evaluation.coach_note).toContain('value proposition');
    expect(ctx.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'response_evaluated' }));
  });

  it('handles missing optional state fields gracefully', async () => {
    mockChat.mockResolvedValue({
      text: JSON.stringify({
        scores: { confidence: 60 },
        overall_score: 55,
        coach_note: 'Be more specific.',
      }),
    });

    const state = makeState({
      offer_base_salary: undefined,
      offer_total_comp: undefined,
      target_salary: undefined,
    });
    const ctx = makeContext(state);
    const result = await evaluateResponse.execute(
      { round: 1, user_response: 'I think the offer should be higher.' },
      ctx as never,
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.evaluation.scores.value_anchoring).toBe(50); // default
    expect(parsed.evaluation.scores.specificity).toBe(50); // default
  });

  it('returns error for invalid round', async () => {
    const state = makeState({ pushbacks: [] });
    const ctx = makeContext(state);
    const result = await evaluateResponse.execute(
      { round: 5, user_response: 'test' },
      ctx as never,
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.error).toContain('No pushback found');
  });
});
