/**
 * Cover Letter Context Tests — Cross-product context consumption.
 *
 * Verifies that:
 * 1. CoverLetterState accepts an optional platform_context field
 * 2. buildAgentMessage includes positioning strategy when available
 * 3. buildAgentMessage includes evidence items when available
 * 4. buildAgentMessage works without platform context (first-time user)
 * 5. createInitialState passes through platform_context from input
 * 6. createInitialState works when platform_context is absent from input
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: () => ({ insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
  },
}));

vi.mock('../lib/emotional-baseline.js', () => ({
  getToneGuidanceFromInput: () => '',
  getDistressFromInput: () => null,
}));

import { createCoverLetterProductConfig } from '../agents/cover-letter/product.js';
import type { CoverLetterState } from '../agents/cover-letter/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBaseInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    resume_text: 'Senior Software Engineer at Acme. Led team of 10. Built distributed systems.',
    job_description: 'Looking for a VP of Engineering with 10+ years experience.',
    company_name: 'Globex',
    ...overrides,
  };
}

// ─── Type tests ───────────────────────────────────────────────────────────────

describe('CoverLetterState — platform_context field', () => {
  it('accepts state without platform_context (optional field)', () => {
    const state: CoverLetterState = {
      session_id: 'sess-1',
      user_id: 'user-1',
      current_stage: 'analysis',
    };
    expect(state.platform_context).toBeUndefined();
  });

  it('accepts state with positioning_strategy in platform_context', () => {
    const state: CoverLetterState = {
      session_id: 'sess-1',
      user_id: 'user-1',
      current_stage: 'analysis',
      platform_context: {
        positioning_strategy: { angle: 'Transformational leader', keywords: ['scale', 'growth'] },
      },
    };
    expect(state.platform_context?.positioning_strategy).toBeDefined();
    expect(state.platform_context?.positioning_strategy?.angle).toBe('Transformational leader');
  });

  it('accepts state with evidence_items in platform_context', () => {
    const state: CoverLetterState = {
      session_id: 'sess-1',
      user_id: 'user-1',
      current_stage: 'analysis',
      platform_context: {
        evidence_items: [
          { situation: 'Led 10-person team', action: 'Hired and mentored', result: '30% velocity increase' },
        ],
      },
    };
    expect(state.platform_context?.evidence_items).toHaveLength(1);
  });
});

// ─── createInitialState tests ─────────────────────────────────────────────────

describe('createInitialState — platform context passthrough', () => {
  it('passes through platform_context when present in input', () => {
    const config = createCoverLetterProductConfig();
    const platformContext = {
      positioning_strategy: { angle: 'Strategic operator' },
      evidence_items: [{ key: 'evidence-1' }],
    };
    const state = config.createInitialState('sess-abc', 'user-xyz', {
      platform_context: platformContext,
    });

    expect(state.platform_context).toBeDefined();
    expect(state.platform_context?.positioning_strategy).toEqual({ angle: 'Strategic operator' });
    expect(state.platform_context?.evidence_items).toHaveLength(1);
  });

  it('produces undefined platform_context when not in input (first-time user)', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('sess-abc', 'user-xyz', {});

    expect(state.platform_context).toBeUndefined();
  });

  it('always sets required fields regardless of platform_context', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('sess-1', 'user-1', { platform_context: undefined });

    expect(state.session_id).toBe('sess-1');
    expect(state.user_id).toBe('user-1');
    expect(state.current_stage).toBe('analysis');
  });
});

// ─── buildAgentMessage tests ──────────────────────────────────────────────────

describe('buildAgentMessage — analyst with platform context', () => {
  it('includes positioning strategy section when provided', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('s', 'u', {
      platform_context: {
        positioning_strategy: {
          angle: 'Transformational leader',
          target_level: 'VP / SVP',
        },
      },
    });

    const msg = config.buildAgentMessage('analyst', state, makeBaseInput());

    expect(msg).toContain('Prior Positioning Strategy');
    expect(msg).toContain('Transformational leader');
    expect(msg).toContain('VP / SVP');
  });

  it('includes evidence items section when provided', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('s', 'u', {
      platform_context: {
        evidence_items: [
          { situation: 'Scaled team', action: 'Hired 20 engineers', result: '40% faster releases' },
        ],
      },
    });

    const msg = config.buildAgentMessage('analyst', state, makeBaseInput());

    expect(msg).toContain('Prior Evidence Items');
    expect(msg).toContain('Scaled team');
    expect(msg).toContain('40% faster releases');
  });

  it('includes both sections when both are present', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('s', 'u', {
      platform_context: {
        positioning_strategy: { angle: 'Operator' },
        evidence_items: [{ result: 'Revenue grew 3x' }],
      },
    });

    const msg = config.buildAgentMessage('analyst', state, makeBaseInput());

    expect(msg).toContain('Prior Positioning Strategy');
    expect(msg).toContain('Prior Evidence Items');
    expect(msg).toContain('Revenue grew 3x');
  });

  it('includes Career Profile when present', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('s', 'u', {
      platform_context: {
        career_profile: {
          version: 'career_profile_v2',
          source: 'career_profile',
          generated_at: '2026-03-16T00:00:00.000Z',
          targeting: {
            target_roles: ['VP Engineering'],
            target_industries: ['SaaS'],
            seniority: 'VP',
            transition_type: 'growth',
            preferred_company_environments: [],
          },
          positioning: {
            core_strengths: ['Scaling teams'],
            proof_themes: ['Execution'],
            differentiators: ['Builder'],
            adjacent_positioning: [],
            positioning_statement: 'I scale engineering teams.',
            narrative_summary: 'Builder and operator.',
            leadership_scope: 'Global',
            scope_of_responsibility: 'Product and platform',
          },
          narrative: {
            colleagues_came_for_what: '',
            known_for_what: '',
            why_not_me: '',
            story_snippet: '',
          },
          preferences: {
            must_haves: [],
            constraints: [],
            compensation_direction: '',
          },
          coaching: {
            financial_segment: '',
            emotional_state: '',
            coaching_tone: '',
            urgency_score: 0,
            recommended_starting_point: '',
          },
          evidence_positioning_statements: [],
          profile_signals: {
            clarity: 'green',
            alignment: 'green',
            differentiation: 'green',
          },
          completeness: {
            overall_score: 100,
            dashboard_state: 'strong',
            sections: [],
          },
          profile_summary: 'VP engineering builder',
        },
      },
    });

    const msg = config.buildAgentMessage('analyst', state, makeBaseInput());

    expect(msg).toContain('Career Profile');
    expect(msg).toContain('VP Engineering');
  });

  it('omits platform context sections when not provided (first-time user)', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('s', 'u', {});

    const msg = config.buildAgentMessage('analyst', state, makeBaseInput());

    expect(msg).not.toContain('Prior Positioning Strategy');
    expect(msg).not.toContain('Prior Evidence Items');
  });

  it('omits evidence section when evidence_items array is empty', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('s', 'u', {
      platform_context: {
        positioning_strategy: { angle: 'Executive' },
        evidence_items: [],
      },
    });

    const msg = config.buildAgentMessage('analyst', state, makeBaseInput());

    expect(msg).toContain('Prior Positioning Strategy');
    expect(msg).not.toContain('Prior Evidence Items');
  });

  it('always includes resume text, JD, and company name regardless of context', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('s', 'u', {
      platform_context: { positioning_strategy: { angle: 'Operator' } },
    });

    const msg = config.buildAgentMessage('analyst', state, makeBaseInput());

    expect(msg).toContain('Senior Software Engineer at Acme');
    expect(msg).toContain('VP of Engineering');
    expect(msg).toContain('Globex');
  });

  it('ends with an objective-driven planning instruction', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('s', 'u', {});

    const msg = config.buildAgentMessage('analyst', state, makeBaseInput());

    expect(msg).toContain('Objective');
    expect(msg).toContain('build a letter plan');
  });
});
