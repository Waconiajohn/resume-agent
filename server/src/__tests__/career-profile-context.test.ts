import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetLatestUserContext = vi.hoisted(() => vi.fn());
const mockGetUserContext = vi.hoisted(() => vi.fn());
const mockGetWhyMeContext = vi.hoisted(() => vi.fn());
const mockUpsertUserContext = vi.hoisted(() => vi.fn());
const mockGetEmotionalBaseline = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../lib/platform-context.js', () => ({
  getLatestUserContext: mockGetLatestUserContext,
  getUserContext: mockGetUserContext,
  getWhyMeContext: mockGetWhyMeContext,
  upsertUserContext: mockUpsertUserContext,
}));

vi.mock('../lib/emotional-baseline.js', () => ({
  getEmotionalBaseline: mockGetEmotionalBaseline,
}));

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { loadAgentContextBundle, loadCareerProfileContext } from '../lib/career-profile-context.js';

function makeChain(resolvedValue: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'limit', 'maybeSingle']) {
    chain[method] = vi.fn(() => chain);
  }
  (chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue(resolvedValue);
  return chain;
}

describe('loadCareerProfileContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLatestUserContext.mockResolvedValue(null);
    mockGetUserContext.mockResolvedValue([]);
    mockGetWhyMeContext.mockResolvedValue(null);
    mockUpsertUserContext.mockResolvedValue(null);
    mockGetEmotionalBaseline.mockResolvedValue({
      emotional_state: 'acceptance',
      financial_segment: 'ideal',
      coaching_tone: 'direct',
      urgency_score: 5,
      distress_detected: false,
    });
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }));
  });

  it('builds a normalized profile from legacy onboarding and why-me data', async () => {
    mockGetLatestUserContext.mockImplementation(async (_userId: string, contextType: string) => {
      if (contextType === 'client_profile') {
        return {
          content: {
            career_level: 'director',
            industry: 'Technology',
            years_experience: 14,
            financial_segment: 'ideal',
            emotional_state: 'acceptance',
            transition_type: 'voluntary',
            goals: ['Senior Program Manager'],
            constraints: ['Remote preferred'],
            strengths_self_reported: ['Program leadership', 'Cross-functional execution'],
            urgency_score: 6,
            recommended_starting_point: 'resume',
            coaching_tone: 'direct',
          },
        };
      }

      if (contextType === 'positioning_strategy') {
        return {
          content: {
            target_role: 'Senior Program Manager',
            target_industry: 'Technology',
            angle: 'Operator who turns ambiguity into execution momentum',
            differentiators: ['Bridges strategy and delivery'],
          },
        };
      }

      return null;
    });

    mockGetWhyMeContext.mockResolvedValue({
      colleaguesCameForWhat: 'People brought me failing cross-functional programs.',
      knownForWhat: 'Turning ambiguity into execution momentum.',
      whyNotMe: 'I have led equivalent scope in adjacent environments.',
    });

    mockFrom.mockReturnValue(makeChain({
      data: {
        client_profile: {
          career_level: 'director',
        },
        assessment_summary: {
          key_insights: ['Strong operator with repeatable execution systems.'],
          financial_signals: [],
          emotional_signals: [],
          recommended_actions: ['Refine positioning'],
        },
        created_at: '2026-03-16T12:00:00.000Z',
      },
      error: null,
    }));

    const profile = await loadCareerProfileContext('user-1');

    expect(profile).not.toBeNull();
    expect(profile?.targeting.target_roles).toContain('Senior Program Manager');
    expect(profile?.positioning.core_strengths).toContain('Program leadership');
    expect(profile?.narrative.known_for_what).toBe('Turning ambiguity into execution momentum.');
    expect(profile?.completeness.dashboard_state).toBe('strong');
    expect(mockUpsertUserContext).toHaveBeenCalledWith(
      'user-1',
      'career_profile',
      expect.any(Object),
      'career-profile-migration',
    );
  });
});

describe('loadAgentContextBundle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLatestUserContext.mockResolvedValue(null);
    mockGetUserContext.mockResolvedValue([]);
    mockGetWhyMeContext.mockResolvedValue(null);
    mockUpsertUserContext.mockResolvedValue(null);
    mockGetEmotionalBaseline.mockResolvedValue(null);
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }));
  });

  it('returns normalized career profile plus requested legacy context', async () => {
    mockGetLatestUserContext.mockImplementation(async (_userId: string, contextType: string) => {
      if (contextType === 'career_profile') {
        return {
          content: {
            generated_at: '2026-03-16T12:00:00.000Z',
            targeting: { target_roles: ['Head of Operations'], target_industries: ['Healthcare'], seniority: 'director', transition_type: 'voluntary', preferred_company_environments: [] },
            positioning: {
              core_strengths: ['Operations leadership'],
              proof_themes: ['Scaled distributed teams'],
              differentiators: ['Operator-builder'],
              adjacent_positioning: [],
              positioning_statement: 'Operations leader for complex distributed environments.',
              narrative_summary: 'Scales systems.',
              leadership_scope: 'Regional teams',
              scope_of_responsibility: 'Operations',
            },
            narrative: {
              colleagues_came_for_what: 'People came to me for messy operational fixes.',
              known_for_what: 'Scaling operational discipline.',
              why_not_me: 'I have equivalent scope from adjacent environments.',
              story_snippet: 'Scales systems.',
            },
            preferences: { must_haves: [], constraints: ['Chicago'], compensation_direction: '' },
            coaching: {
              financial_segment: 'ideal',
              emotional_state: 'acceptance',
              coaching_tone: 'direct',
              urgency_score: 5,
              recommended_starting_point: 'resume',
            },
            evidence_positioning_statements: ['Operations leadership positioned against Head of Operations requirements.'],
            profile_signals: { clarity: 'green', alignment: 'green', differentiation: 'green' },
            completeness: {
              overall_score: 85,
              dashboard_state: 'strong',
              sections: [],
            },
            profile_summary: 'Operations leader for complex distributed environments.',
          },
        };
      }

      if (contextType === 'positioning_strategy') {
        return { content: { angle: 'Operator-builder' } };
      }

      return null;
    });

    mockGetUserContext.mockResolvedValue([
      { content: { proof: 'Saved $2M' } },
    ]);
    mockGetWhyMeContext.mockResolvedValue({
      colleaguesCameForWhat: 'Messy operational fixes',
      knownForWhat: 'Scaling operational discipline',
      whyNotMe: 'Equivalent adjacent scope',
    });

    const bundle = await loadAgentContextBundle('user-1', {
      includeCareerProfile: true,
      includePositioningStrategy: true,
      includeEvidenceItems: true,
      includeWhyMeStory: true,
      includeEmotionalBaseline: false,
    });

    expect(bundle.careerProfile?.profile_summary).toContain('Operations leader');
    expect(bundle.platformContext.career_profile).toBeTruthy();
    expect(bundle.platformContext.positioning_strategy).toEqual({ angle: 'Operator-builder' });
    expect(bundle.platformContext.evidence_items).toEqual([{ proof: 'Saved $2M' }]);
    expect(bundle.platformContext.why_me_story).toEqual({
      colleaguesCameForWhat: 'Messy operational fixes',
      knownForWhat: 'Scaling operational discipline',
      whyNotMe: 'Equivalent adjacent scope',
    });
  });
});
