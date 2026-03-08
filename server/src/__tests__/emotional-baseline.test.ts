/**
 * Tests for the Emotional Baseline cross-cutting middleware.
 *
 * Story 1C-1: Detection utility
 * Story 1C-2: Tone guidance generation
 * Story 1C-3: Distress detection and referral resources
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock platform-context
const mockGetUserContext = vi.hoisted(() => vi.fn());
vi.mock('../lib/platform-context.js', () => ({
  getUserContext: mockGetUserContext,
}));

import {
  getEmotionalBaseline,
  buildToneGuidance,
  detectDistress,
  getToneGuidanceFromInput,
  getDistressFromInput,
  type EmotionalBaseline,
} from '../lib/emotional-baseline.js';

// ─── Fixtures ────────────────────────────────────────────────────────────

function makeClientProfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    emotional_state: 'acceptance',
    financial_segment: 'ideal',
    coaching_tone: 'direct',
    urgency_score: 5,
    career_level: 'director',
    industry: 'Technology',
    years_experience: 15,
    transition_type: 'voluntary',
    goals: ['Senior leadership role'],
    constraints: [],
    strengths_self_reported: ['Strategic planning'],
    recommended_starting_point: 'resume',
    ...overrides,
  };
}

function makeBaseline(overrides: Partial<EmotionalBaseline> = {}): EmotionalBaseline {
  return {
    emotional_state: 'acceptance',
    financial_segment: 'ideal',
    coaching_tone: 'direct',
    urgency_score: 5,
    distress_detected: false,
    ...overrides,
  };
}

// ─── getEmotionalBaseline tests ──────────────────────────────────────────

describe('getEmotionalBaseline', () => {
  beforeEach(() => {
    mockGetUserContext.mockReset();
  });

  it('returns null when no client_profile exists', async () => {
    mockGetUserContext.mockResolvedValue([]);
    const result = await getEmotionalBaseline('user-1');
    expect(result).toBeNull();
  });

  it('extracts baseline from client_profile', async () => {
    mockGetUserContext.mockResolvedValue([{
      id: 'ctx-1',
      content: makeClientProfile(),
    }]);

    const result = await getEmotionalBaseline('user-1');
    expect(result).not.toBeNull();
    expect(result!.emotional_state).toBe('acceptance');
    expect(result!.financial_segment).toBe('ideal');
    expect(result!.coaching_tone).toBe('direct');
    expect(result!.urgency_score).toBe(5);
    expect(result!.distress_detected).toBe(false);
  });

  it('detects distress when depression + crisis', async () => {
    mockGetUserContext.mockResolvedValue([{
      id: 'ctx-1',
      content: makeClientProfile({
        emotional_state: 'depression',
        financial_segment: 'crisis',
        coaching_tone: 'supportive',
        urgency_score: 9,
      }),
    }]);

    const result = await getEmotionalBaseline('user-1');
    expect(result!.distress_detected).toBe(true);
  });

  it('does NOT detect distress for depression + ideal', async () => {
    mockGetUserContext.mockResolvedValue([{
      id: 'ctx-1',
      content: makeClientProfile({
        emotional_state: 'depression',
        financial_segment: 'ideal',
        urgency_score: 5,
      }),
    }]);

    const result = await getEmotionalBaseline('user-1');
    expect(result!.distress_detected).toBe(false);
  });

  it('detects distress for anger + urgency >= 9', async () => {
    mockGetUserContext.mockResolvedValue([{
      id: 'ctx-1',
      content: makeClientProfile({
        emotional_state: 'anger',
        financial_segment: 'stressed',
        urgency_score: 9,
      }),
    }]);

    const result = await getEmotionalBaseline('user-1');
    expect(result!.distress_detected).toBe(true);
  });

  it('defaults to acceptance/ideal when fields are missing', async () => {
    mockGetUserContext.mockResolvedValue([{
      id: 'ctx-1',
      content: {},
    }]);

    const result = await getEmotionalBaseline('user-1');
    expect(result!.emotional_state).toBe('acceptance');
    expect(result!.financial_segment).toBe('ideal');
    expect(result!.coaching_tone).toBe('direct'); // derived: acceptance + ideal = direct
  });

  it('derives coaching tone when not stored', async () => {
    mockGetUserContext.mockResolvedValue([{
      id: 'ctx-1',
      content: makeClientProfile({
        emotional_state: 'denial',
        financial_segment: 'crisis',
        coaching_tone: undefined,
      }),
    }]);

    const result = await getEmotionalBaseline('user-1');
    expect(result!.coaching_tone).toBe('supportive');
  });

  it('derives motivational tone for growth state', async () => {
    mockGetUserContext.mockResolvedValue([{
      id: 'ctx-1',
      content: makeClientProfile({
        emotional_state: 'growth',
        financial_segment: 'comfortable',
        coaching_tone: undefined,
      }),
    }]);

    const result = await getEmotionalBaseline('user-1');
    expect(result!.coaching_tone).toBe('motivational');
  });

  it('clamps urgency score to 1-10', async () => {
    mockGetUserContext.mockResolvedValue([{
      id: 'ctx-1',
      content: makeClientProfile({ urgency_score: 15 }),
    }]);

    const result = await getEmotionalBaseline('user-1');
    expect(result!.urgency_score).toBe(10);
  });

  it('returns null on getUserContext failure', async () => {
    mockGetUserContext.mockRejectedValue(new Error('DB failure'));
    const result = await getEmotionalBaseline('user-1');
    expect(result).toBeNull();
  });
});

// ─── buildToneGuidance tests ─────────────────────────────────────────────

describe('buildToneGuidance', () => {
  it('returns empty string for null baseline', () => {
    expect(buildToneGuidance(null)).toBe('');
  });

  it('generates supportive tone guidance', () => {
    const guidance = buildToneGuidance(makeBaseline({ coaching_tone: 'supportive' }));
    expect(guidance).toContain('SUPPORTIVE');
    expect(guidance).toContain('empathy');
    expect(guidance).toContain('we');
  });

  it('generates direct tone guidance', () => {
    const guidance = buildToneGuidance(makeBaseline({ coaching_tone: 'direct' }));
    expect(guidance).toContain('DIRECT');
    expect(guidance).toContain('candor');
  });

  it('generates motivational tone guidance', () => {
    const guidance = buildToneGuidance(makeBaseline({ coaching_tone: 'motivational' }));
    expect(guidance).toContain('MOTIVATIONAL');
    expect(guidance).toContain('aspirational');
  });

  it('includes high urgency notice', () => {
    const guidance = buildToneGuidance(makeBaseline({ urgency_score: 9 }));
    expect(guidance).toContain('URGENCY: High');
    expect(guidance).toContain('9/10');
  });

  it('includes low urgency notice', () => {
    const guidance = buildToneGuidance(makeBaseline({ urgency_score: 2 }));
    expect(guidance).toContain('URGENCY: Low');
    expect(guidance).toContain('2/10');
  });

  it('omits urgency notice for mid-range scores', () => {
    const guidance = buildToneGuidance(makeBaseline({ urgency_score: 5 }));
    expect(guidance).not.toContain('URGENCY');
  });
});

// ─── detectDistress tests ────────────────────────────────────────────────

describe('detectDistress', () => {
  it('returns null for null baseline', () => {
    expect(detectDistress(null)).toBeNull();
  });

  it('returns null when no distress detected', () => {
    expect(detectDistress(makeBaseline({ distress_detected: false }))).toBeNull();
  });

  it('returns resources when distress is detected', () => {
    const result = detectDistress(makeBaseline({ distress_detected: true }));
    expect(result).not.toBeNull();
    expect(result!.message).toContain('Career transitions');
    expect(result!.resources).toHaveLength(3);
  });

  it('includes NAMI resource', () => {
    const result = detectDistress(makeBaseline({ distress_detected: true }));
    const nami = result!.resources.find(r => r.name.includes('NAMI'));
    expect(nami).toBeDefined();
    expect(nami!.contact).toContain('800');
  });

  it('includes 988 Lifeline', () => {
    const result = detectDistress(makeBaseline({ distress_detected: true }));
    const lifeline = result!.resources.find(r => r.name.includes('988'));
    expect(lifeline).toBeDefined();
  });

  it('includes career coaching referral', () => {
    const result = detectDistress(makeBaseline({ distress_detected: true }));
    const coach = result!.resources.find(r => r.name.includes('Career'));
    expect(coach).toBeDefined();
  });
});

// ─── Input helper tests ──────────────────────────────────────────────────

describe('getToneGuidanceFromInput', () => {
  it('returns empty string when no baseline in input', () => {
    expect(getToneGuidanceFromInput({})).toBe('');
  });

  it('returns guidance when baseline is present', () => {
    const input = { emotional_baseline: makeBaseline({ coaching_tone: 'supportive' }) };
    const result = getToneGuidanceFromInput(input);
    expect(result).toContain('SUPPORTIVE');
  });
});

describe('getDistressFromInput', () => {
  it('returns null when no baseline in input', () => {
    expect(getDistressFromInput({})).toBeNull();
  });

  it('returns null when no distress', () => {
    const input = { emotional_baseline: makeBaseline({ distress_detected: false }) };
    expect(getDistressFromInput(input)).toBeNull();
  });

  it('returns resources when distress detected', () => {
    const input = { emotional_baseline: makeBaseline({ distress_detected: true }) };
    const result = getDistressFromInput(input);
    expect(result).not.toBeNull();
    expect(result!.resources).toHaveLength(3);
  });
});

// ─── Route integration patterns (Fix 10) ────────────────────────────────

describe('emotional baseline — route integration patterns', () => {
  it('baseline loads from platform context for a given userId', async () => {
    mockGetUserContext.mockResolvedValue([{
      id: 'ctx-1',
      content: makeClientProfile({
        emotional_state: 'bargaining',
        financial_segment: 'stressed',
        coaching_tone: 'supportive',
        urgency_score: 7,
      }),
    }]);

    const baseline = await getEmotionalBaseline('user-route-1');

    expect(mockGetUserContext).toHaveBeenCalledWith('user-route-1', 'client_profile');
    expect(baseline).not.toBeNull();
    expect(baseline!.emotional_state).toBe('bargaining');
    expect(baseline!.coaching_tone).toBe('supportive');
  });

  it('tone guidance is injectable into agent system prompts', () => {
    const baseline = makeBaseline({ coaching_tone: 'supportive', urgency_score: 8 });
    const guidance = buildToneGuidance(baseline);

    // Guidance should be a non-empty string suitable for prompt injection
    expect(typeof guidance).toBe('string');
    expect(guidance.length).toBeGreaterThan(50);
    expect(guidance).toContain('SUPPORTIVE');
    expect(guidance).toContain('URGENCY');
  });

  it('missing baseline gracefully returns empty guidance (no crash)', () => {
    const guidance = buildToneGuidance(null);
    expect(guidance).toBe('');
    // Callers can safely append empty string to prompts
  });

  it('missing baseline returns null distress (no crash)', () => {
    const distress = detectDistress(null);
    expect(distress).toBeNull();
  });
});
