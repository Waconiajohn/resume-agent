/**
 * Planner Handoff (Story 6-4) — Server tests.
 *
 * Tests qualifyLead, matchPlanners, generateHandoffDocument, createReferral,
 * and updateReferralStatus from server/src/lib/planner-handoff.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockFrom = vi.fn();

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// ─── LLM mock ─────────────────────────────────────────────────────────────────

vi.mock('../lib/llm.js', () => ({
  llm: { chat: vi.fn() },
  MODEL_PRIMARY: 'mock-primary',
  MODEL_MID: 'mock-mid',
  MODEL_ORCHESTRATOR: 'mock-orchestrator',
  MODEL_LIGHT: 'mock-light',
  MODEL_PRICING: {},
}));

// ─── Logger mock ──────────────────────────────────────────────────────────────

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

// ─── json-repair mock ─────────────────────────────────────────────────────────

vi.mock('../lib/json-repair.js', () => ({
  repairJSON: vi.fn((text: string) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import {
  qualifyLead,
  matchPlanners,
  generateHandoffDocument,
  createReferral,
  updateReferralStatus,
} from '../lib/planner-handoff.js';

import type {
  HandoffDocument,
  QualificationResult,
  PlannerProfile,
  AssetRange,
} from '../lib/planner-handoff.js';

import { llm } from '../lib/llm.js';

// ─── Supabase chain builder helpers ──────────────────────────────────────────

function buildSelectChain(data: unknown[], error: null | { message: string } = null) {
  const limitFn = vi.fn().mockResolvedValue({ data, error });
  const containsFn = vi.fn().mockReturnValue({ limit: limitFn });
  const eqFn = vi.fn().mockReturnValue({ limit: limitFn, contains: containsFn });
  const selectFn = vi.fn().mockReturnValue({ eq: eqFn, contains: containsFn });
  return { selectFn, eqFn, containsFn, limitFn };
}

function buildPlannerSelectChain(
  data: PlannerProfile[],
  error: null | { message: string } = null,
) {
  const limitFn = vi.fn().mockResolvedValue({ data, error });
  const orderFn = vi.fn().mockReturnValue({ limit: limitFn });
  const lteFn = vi.fn().mockReturnValue({ order: orderFn, limit: limitFn });
  const containsFn = vi.fn().mockReturnValue({ lte: lteFn, order: orderFn, limit: limitFn });
  const eqFn = vi.fn().mockReturnValue({ contains: containsFn, lte: lteFn, order: orderFn });
  const selectFn = vi.fn().mockReturnValue({ eq: eqFn, contains: containsFn });
  return { selectFn, eqFn, containsFn, lteFn, orderFn, limitFn };
}

function makeMockChat(text: string) {
  return {
    text,
    tool_calls: [],
    usage: { input_tokens: 100, output_tokens: 200 },
  };
}

const samplePlanner: PlannerProfile = {
  id: 'planner-1',
  name: 'Jane Smith CFP',
  firm: 'Smith Financial',
  specializations: ['executive_transitions', 'retirement_planning'],
  geographic_regions: ['CA', 'NV'],
  asset_minimum: 250_000,
  bio: 'Experienced fiduciary planner.',
  is_active: true,
};

// ═══════════════════════════════════════════════════════════════════════════════
// qualifyLead Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('qualifyLead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes when all 5 gates pass', async () => {
    // Set up mock for assessment check (returns 1 row) + geographic check (returns 1 row)
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Retirement readiness assessment query
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [{ id: 'assessment-1' }], error: null }),
            }),
          }),
        };
      }
      // Geographic planner query
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            contains: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [{ id: 'planner-1' }], error: null }),
            }),
          }),
        }),
      };
    });

    const result = await qualifyLead('user-1', true, '500k_1m', 'CA', true);
    expect(result.passed).toBe(true);
    expect(result.failure_reasons).toHaveLength(0);
  });

  it('fails when asset range is under_100k', async () => {
    // Both DB queries still need to succeed for other checks
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [{ id: 'row-1' }], error: null }),
          contains: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [{ id: 'row-1' }], error: null }),
          }),
        }),
      }),
    });

    const result = await qualifyLead('user-1', true, 'under_100k', 'CA', true);
    expect(result.passed).toBe(false);
    expect(result.checks.asset_minimum).toBe(false);
    expect(result.failure_reasons).toContain('Minimum $100K investable assets not met');
  });

  it('fails when user has not opted in', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [{ id: 'assessment-1' }], error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            contains: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [{ id: 'planner-1' }], error: null }),
            }),
          }),
        }),
      };
    });

    const result = await qualifyLead('user-1', false, '500k_1m', 'CA', true);
    expect(result.passed).toBe(false);
    expect(result.checks.user_opt_in).toBe(false);
    expect(result.failure_reasons).toContain('User has not opted in');
  });

  it('fails when no assessment completed (supabase returns empty array)', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Assessment query returns empty
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      // Geographic query returns match
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            contains: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [{ id: 'planner-1' }], error: null }),
            }),
          }),
        }),
      };
    });

    const result = await qualifyLead('user-1', true, '500k_1m', 'CA', true);
    expect(result.passed).toBe(false);
    expect(result.checks.assessment_completed).toBe(false);
    expect(result.failure_reasons).toContain('Retirement readiness assessment not completed');
  });

  it('fails when no geographic match (supabase returns empty array)', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Assessment query returns a match
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [{ id: 'assessment-1' }], error: null }),
            }),
          }),
        };
      }
      // Geographic query returns empty
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            contains: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      };
    });

    const result = await qualifyLead('user-1', true, '500k_1m', 'AK', true);
    expect(result.passed).toBe(false);
    expect(result.checks.geographic_match).toBe(false);
    expect(result.failure_reasons).toContain('No active planner available in geographic region');
  });

  it('fails when emotional readiness is false', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [{ id: 'assessment-1' }], error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            contains: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [{ id: 'planner-1' }], error: null }),
            }),
          }),
        }),
      };
    });

    const result = await qualifyLead('user-1', true, '500k_1m', 'CA', false);
    expect(result.passed).toBe(false);
    expect(result.checks.emotional_readiness).toBe(false);
    expect(result.failure_reasons).toContain('Emotional readiness check not passed');
  });

  it('returns failure reasons for each failing gate', async () => {
    // Both DB queries return empty so geographic and assessment fail
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          contains: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    });

    // Fail asset + opt-in + emotional as well
    const result = await qualifyLead('user-1', false, 'under_100k', 'AK', false);
    expect(result.passed).toBe(false);
    expect(result.failure_reasons.length).toBeGreaterThanOrEqual(5);
  });

  it('returned QualificationResult has expected shape', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [{ id: 'a' }], error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            contains: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [{ id: 'p' }], error: null }),
            }),
          }),
        }),
      };
    });

    const result = await qualifyLead('user-1', true, '250k_500k', 'NY', true);
    expect(typeof result.passed).toBe('boolean');
    expect(typeof result.checks.asset_minimum).toBe('boolean');
    expect(typeof result.checks.user_opt_in).toBe('boolean');
    expect(typeof result.checks.assessment_completed).toBe('boolean');
    expect(typeof result.checks.geographic_match).toBe('boolean');
    expect(typeof result.checks.emotional_readiness).toBe('boolean');
    expect(Array.isArray(result.failure_reasons)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// matchPlanners Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('matchPlanners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns planners matching geography and asset range', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          contains: vi.fn().mockReturnValue({
            lte: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [samplePlanner], error: null }),
              }),
            }),
          }),
        }),
      }),
    });

    const result = await matchPlanners('CA', '500k_1m');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('planner-1');
  });

  it('returns empty array when query fails', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          contains: vi.fn().mockReturnValue({
            lte: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'DB error' },
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const result = await matchPlanners('CA', '500k_1m');
    expect(result).toEqual([]);
  });

  it('sorts by specialization match count when specializations provided', async () => {
    const plannerA: PlannerProfile = {
      ...samplePlanner,
      id: 'planner-a',
      name: 'Aardvark CFP',
      specializations: ['executive_transitions'],
    };
    const plannerB: PlannerProfile = {
      ...samplePlanner,
      id: 'planner-b',
      name: 'Bravo CFP',
      specializations: ['executive_transitions', 'equity_compensation'],
    };

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          contains: vi.fn().mockReturnValue({
            lte: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                // Return A before B (alphabetical from DB)
                limit: vi.fn().mockResolvedValue({ data: [plannerA, plannerB], error: null }),
              }),
            }),
          }),
        }),
      }),
    });

    // Request sorting by both specializations — planner B matches 2, A matches 1
    const result = await matchPlanners('CA', '500k_1m', ['executive_transitions', 'equity_compensation']);
    expect(result[0].id).toBe('planner-b');
    expect(result[1].id).toBe('planner-a');
  });

  it('returns empty array on unexpected exception', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('Unexpected DB crash');
    });

    const result = await matchPlanners('CA', '500k_1m');
    expect(result).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// generateHandoffDocument Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateHandoffDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns structured HandoffDocument when LLM succeeds', async () => {
    const llmDoc = {
      career_situation: 'VP Engineering transitioning after 8 years',
      transition_context: 'Planned exit with 6-month severance',
      retirement_readiness_summary: 'Mixed signals — healthcare and equity concerns',
      key_concerns: ['Healthcare bridge', 'Equity vesting forfeiture'],
      recommended_discussion_topics: ['COBRA vs marketplace', 'Rollover timing'],
      talking_points_for_planner: ['Client has completed retirement readiness assessment'],
    };
    vi.mocked(llm.chat).mockResolvedValueOnce(makeMockChat(JSON.stringify(llmDoc)));

    const result = await generateHandoffDocument({ career_situation: 'VP Engineering exit' });
    expect(result.career_situation).toBe('VP Engineering transitioning after 8 years');
    expect(Array.isArray(result.key_concerns)).toBe(true);
    expect(Array.isArray(result.recommended_discussion_topics)).toBe(true);
    expect(Array.isArray(result.talking_points_for_planner)).toBe(true);
  });

  it('falls back to static document when LLM fails', async () => {
    vi.mocked(llm.chat).mockRejectedValueOnce(new Error('LLM unavailable'));

    const result = await generateHandoffDocument({ career_situation: 'Some situation' });
    expect(typeof result.career_situation).toBe('string');
    expect(result.career_situation.length).toBeGreaterThan(0);
    expect(Array.isArray(result.key_concerns)).toBe(true);
    expect(result.key_concerns.length).toBeGreaterThan(0);
  });

  it('includes all required HandoffDocument fields in output', async () => {
    const llmDoc = {
      career_situation: 'Career transition',
      transition_context: 'Planned exit',
      retirement_readiness_summary: 'Summary text',
      key_concerns: ['Concern 1'],
      recommended_discussion_topics: ['Topic 1'],
      talking_points_for_planner: ['Point 1'],
    };
    vi.mocked(llm.chat).mockResolvedValueOnce(makeMockChat(JSON.stringify(llmDoc)));

    const result = await generateHandoffDocument({});
    expect('career_situation' in result).toBe(true);
    expect('transition_context' in result).toBe(true);
    expect('retirement_readiness_summary' in result).toBe(true);
    expect('key_concerns' in result).toBe(true);
    expect('recommended_discussion_topics' in result).toBe(true);
    expect('talking_points_for_planner' in result).toBe(true);
  });

  it('falls back when LLM returns invalid JSON', async () => {
    vi.mocked(llm.chat).mockResolvedValueOnce(makeMockChat('NOT JSON'));

    const result = await generateHandoffDocument({ transition_context: 'Exit context' });
    // Should still return a valid document (fallback path)
    expect(typeof result.career_situation).toBe('string');
    expect(Array.isArray(result.key_concerns)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// createReferral Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('createReferral', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockHandoffDoc: HandoffDocument = {
    career_situation: 'VP Engineering transition',
    transition_context: '6-month severance',
    retirement_readiness_summary: 'Mixed signals',
    key_concerns: ['Healthcare'],
    recommended_discussion_topics: ['COBRA'],
    talking_points_for_planner: ['Assessment completed'],
  };

  const mockQualification: QualificationResult = {
    passed: true,
    checks: {
      asset_minimum: true,
      user_opt_in: true,
      assessment_completed: true,
      geographic_match: true,
      emotional_readiness: true,
    },
    failure_reasons: [],
  };

  it('creates referral with correct follow-up dates', async () => {
    const createdRecord = {
      id: 'ref-1',
      user_id: 'user-1',
      planner_id: 'planner-1',
      status: 'pending',
      handoff_document: mockHandoffDoc,
      qualification_results: mockQualification,
      follow_up_dates: {
        hours_48: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        week_1: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        week_2: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };

    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: createdRecord, error: null }),
        }),
      }),
    });

    const before = Date.now();
    const result = await createReferral('user-1', 'planner-1', mockHandoffDoc, mockQualification);
    const after = Date.now();

    expect(result).not.toBeNull();
    expect(result!.id).toBe('ref-1');
    expect(result!.status).toBe('pending');

    // Verify follow-up dates are in the future
    const hours48 = new Date(result!.follow_up_dates.hours_48!).getTime();
    expect(hours48).toBeGreaterThan(before);
    expect(hours48).toBeLessThan(after + 49 * 60 * 60 * 1000);
  });

  it('returns null when insert fails', async () => {
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Insert failed' } }),
        }),
      }),
    });

    const result = await createReferral('user-1', 'planner-1', mockHandoffDoc, mockQualification);
    expect(result).toBeNull();
  });

  it('returns null on unexpected exception', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('DB connection lost');
    });

    const result = await createReferral('user-1', 'planner-1', mockHandoffDoc, mockQualification);
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// updateReferralStatus Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('updateReferralStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls supabase update with correct parameters', async () => {
    const eqFn = vi.fn().mockResolvedValue({ data: null, error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
    mockFrom.mockReturnValue({ update: updateFn });

    await updateReferralStatus('ref-123', 'introduced');

    expect(mockFrom).toHaveBeenCalledWith('planner_referrals');
    expect(updateFn).toHaveBeenCalledWith({ status: 'introduced' });
    expect(eqFn).toHaveBeenCalledWith('id', 'ref-123');
  });

  it('handles update error gracefully without throwing', async () => {
    const eqFn = vi.fn().mockResolvedValue({ data: null, error: { message: 'Update failed' } });
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
    mockFrom.mockReturnValue({ update: updateFn });

    await expect(updateReferralStatus('ref-bad', 'declined')).resolves.toBeUndefined();
  });

  it('handles unexpected exception without throwing', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('Network failure');
    });

    await expect(updateReferralStatus('ref-xyz', 'expired')).resolves.toBeUndefined();
  });
});
