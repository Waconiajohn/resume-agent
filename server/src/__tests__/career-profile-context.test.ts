import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetLatestUserContext = vi.hoisted(() => vi.fn());
const mockGetUserContext = vi.hoisted(() => vi.fn());
const mockGetWhyMeContext = vi.hoisted(() => vi.fn());
const mockGetEmotionalBaseline = vi.hoisted(() => vi.fn());

vi.mock('../lib/platform-context.js', () => ({
  getLatestUserContext: mockGetLatestUserContext,
  getUserContext: mockGetUserContext,
  getWhyMeContext: mockGetWhyMeContext,
}));

vi.mock('../lib/emotional-baseline.js', () => ({
  getEmotionalBaseline: mockGetEmotionalBaseline,
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
import { buildSharedContextFromLegacyBundle } from '../contracts/shared-context-adapter.js';

const v2Profile = {
  version: 'career_profile_v2' as const,
  source: 'career_profile' as const,
  generated_at: '2026-04-14T00:00:00.000Z',
  targeting: {
    target_roles: ['Senior Program Manager'],
    target_industries: ['Technology'],
    seniority: 'director',
    transition_type: 'voluntary',
    preferred_company_environments: [],
  },
  positioning: {
    core_strengths: ['Program leadership', 'Cross-functional execution'],
    proof_themes: ['Strong operator with repeatable execution systems.'],
    differentiators: ['Bridges strategy and delivery'],
    adjacent_positioning: [],
    positioning_statement: 'Operator who turns ambiguity into execution momentum',
    narrative_summary: 'Turns ambiguity into execution momentum.',
    leadership_scope: '14+ years of experience',
    scope_of_responsibility: 'Focused on Senior Program Manager',
  },
  narrative: {
    colleagues_came_for_what: 'People brought me failing cross-functional programs.',
    known_for_what: 'Turning ambiguity into execution momentum.',
    why_not_me: 'I have led equivalent scope in adjacent environments.',
    story_snippet: 'Turns ambiguity into execution momentum.',
  },
  preferences: {
    must_haves: ['Senior Program Manager'],
    constraints: ['Remote preferred'],
    compensation_direction: '',
  },
  coaching: {
    financial_segment: 'ideal',
    emotional_state: 'acceptance',
    coaching_tone: 'direct',
    urgency_score: 6,
    recommended_starting_point: 'resume',
  },
  evidence_positioning_statements: ['Program leadership positioned against Senior Program Manager requirements.'],
  profile_signals: { clarity: 'green' as const, alignment: 'green' as const, differentiation: 'green' as const },
  completeness: {
    overall_score: 85,
    dashboard_state: 'strong' as const,
    sections: [],
  },
  profile_summary: 'Operator who turns ambiguity into execution momentum',
};

describe('loadCareerProfileContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLatestUserContext.mockResolvedValue(null);
    mockGetUserContext.mockResolvedValue([]);
    mockGetWhyMeContext.mockResolvedValue(null);
    mockGetEmotionalBaseline.mockResolvedValue(null);
  });

  it('returns null when no career_profile row exists', async () => {
    mockGetLatestUserContext.mockResolvedValue(null);
    const profile = await loadCareerProfileContext('user-1');
    expect(profile).toBeNull();
  });

  it('returns null when stored profile is not V2 format', async () => {
    mockGetLatestUserContext.mockResolvedValue({
      content: { career_thread: 'Old format without version field' },
    });
    const profile = await loadCareerProfileContext('user-1');
    expect(profile).toBeNull();
  });

  it('returns the V2 profile directly when version matches', async () => {
    mockGetLatestUserContext.mockResolvedValue({ content: v2Profile });

    const profile = await loadCareerProfileContext('user-1');

    expect(profile).not.toBeNull();
    expect(profile?.version).toBe('career_profile_v2');
    expect(profile?.targeting.target_roles).toContain('Senior Program Manager');
    expect(profile?.positioning.core_strengths).toContain('Program leadership');
    expect(profile?.narrative.known_for_what).toBe('Turning ambiguity into execution momentum.');
    expect(profile?.completeness.dashboard_state).toBe('strong');
  });
});

describe('loadAgentContextBundle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLatestUserContext.mockResolvedValue(null);
    mockGetUserContext.mockResolvedValue([]);
    mockGetWhyMeContext.mockResolvedValue(null);
    mockGetEmotionalBaseline.mockResolvedValue(null);
  });

  it('returns V2 career profile plus requested context', async () => {
    mockGetLatestUserContext.mockImplementation(async (_userId: string, contextType: string) => {
      if (contextType === 'career_profile') {
        return {
          content: {
            version: 'career_profile_v2',
            source: 'career_profile',
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

      if (contextType === 'linkedin_profile') {
        return {
          id: 'linkedin-context-1',
          context_type: 'linkedin_profile',
          content: {
            headline: 'Operations leader | Complex distributed teams',
            about: 'I turn operational ambiguity into repeatable systems.',
            experience: 'Regional operations leadership and process redesign.',
          },
          source_product: 'your_profile',
          source_session_id: null,
          updated_at: '2026-04-14T12:00:00.000Z',
        };
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

    expect(bundle.careerProfile?.version).toBe('career_profile_v2');
    expect(bundle.careerProfile?.profile_summary).toContain('Operations leader');
    expect(bundle.platformContext.career_profile).toBeTruthy();
    expect(bundle.platformContext.positioning_strategy).toEqual({ angle: 'Operator-builder' });
    expect(bundle.platformContext.linkedin_profile).toEqual({
      headline: 'Operations leader | Complex distributed teams',
      about: 'I turn operational ambiguity into repeatable systems.',
      experience: 'Regional operations leadership and process redesign.',
    });
    expect(bundle.platformContext.evidence_items).toEqual([{ proof: 'Saved $2M' }]);
    expect(bundle.sharedContext.sourceArtifacts.linkedinProfile?.artifactType).toBe('linkedin_profile');
    expect(bundle.platformContext.why_me_story).toEqual({
      colleaguesCameForWhat: 'Messy operational fixes',
      knownForWhat: 'Scaling operational discipline',
      whyNotMe: 'Equivalent adjacent scope',
    });
  });
});

describe('Benchmark Profile shared context mapping', () => {
  it('turns answered discovery questions into eligible shared evidence', () => {
    const context = buildSharedContextFromLegacyBundle({
      userId: 'user-1',
      careerProfile: {
        ...v2Profile,
        benchmark_profile: {
          version: 'benchmark_profile_v1',
          generated_at: '2026-04-14T00:00:00.000Z',
          source_material_summary: {
            resume_quality: 'strong',
            linkedin_quality: 'partial',
            strongest_inputs: [],
            missing_inputs: [],
          },
          identity: {
            benchmark_headline: {
              id: 'identity.headline',
              label: 'Benchmark headline',
              statement: 'Enterprise delivery leader',
              confidence: 'high_confidence',
              review_status: 'approved',
              source: 'resume',
              evidence: [],
              used_by: ['resume'],
            },
            why_me_story: {
              id: 'identity.why_me',
              label: 'Why me',
              statement: 'I bring clarity to complex delivery.',
              confidence: 'high_confidence',
              review_status: 'approved',
              source: 'resume',
              evidence: [],
              used_by: ['linkedin'],
            },
            why_not_me: {
              id: 'identity.why_not_me',
              label: 'Why not me',
              statement: 'Need to confirm hands-on API ownership.',
              confidence: 'needs_answer',
              review_status: 'needs_confirmation',
              source: 'inference',
              evidence: [],
              used_by: ['interview'],
            },
            operating_identity: {
              id: 'identity.operating',
              label: 'Operating identity',
              statement: 'Structured operator',
              confidence: 'good_inference',
              review_status: 'approved',
              source: 'resume',
              evidence: [],
              used_by: ['cover_letter'],
            },
          },
          proof: {
            signature_accomplishments: [],
            proof_themes: [],
            scope_markers: [],
          },
          linkedin_brand: {
            five_second_verdict: {
              id: 'linkedin.verdict',
              label: 'Five-second verdict',
              statement: 'Clear delivery brand',
              confidence: 'good_inference',
              review_status: 'approved',
              source: 'linkedin',
              evidence: [],
              used_by: ['linkedin'],
            },
            headline_direction: {
              id: 'linkedin.headline',
              label: 'Headline direction',
              statement: 'Enterprise delivery leader',
              confidence: 'good_inference',
              review_status: 'approved',
              source: 'linkedin',
              evidence: [],
              used_by: ['linkedin'],
            },
            about_opening: {
              id: 'linkedin.about',
              label: 'About opening',
              statement: 'I bring order to ambiguity.',
              confidence: 'good_inference',
              review_status: 'approved',
              source: 'linkedin',
              evidence: [],
              used_by: ['linkedin'],
            },
            recruiter_keywords: [],
            content_pillars: [],
            profile_gaps: [],
          },
          risk_and_gaps: {
            objections: [],
            adjacent_proof_needed: [],
            claims_to_soften: [],
          },
          approved_language: {
            positioning_statement: 'Enterprise delivery leader for complex environments.',
            resume_summary_seed: '',
            linkedin_opening: '',
            networking_intro: '',
            cover_letter_thesis: '',
          },
          discovery_questions: [
            {
              id: 'dq.answered',
              question: 'Do you own API-driven delivery?',
              why_it_matters: 'It supports technical product roles.',
              evidence_found: [],
              answer: 'Yes, I owned API authentication workflow requirements with architects and QA.',
              answered_at: '2026-04-14T01:00:00.000Z',
              confidence_if_confirmed: 'high_confidence',
              used_by: ['resume', 'linkedin'],
            },
            {
              id: 'dq.pending',
              question: 'Can you confirm Salesforce certification status?',
              why_it_matters: 'It affects credential claims.',
              evidence_found: [],
              confidence_if_confirmed: 'high_confidence',
              used_by: ['resume'],
            },
          ],
          downstream_readiness: {
            resume: { status: 'usable', summary: '' },
            linkedin: { status: 'usable', summary: '' },
            cover_letter: { status: 'usable', summary: '' },
            networking: { status: 'usable', summary: '' },
            interview: { status: 'usable', summary: '' },
            job_search: { status: 'usable', summary: '' },
            thank_you: { status: 'usable', summary: '' },
            follow_up: { status: 'usable', summary: '' },
          },
        },
      },
    });

    expect(context.workflowState.pendingQuestions).toBe(1);
    expect(context.positioningStrategy.framingStillRequiringConfirmation).toContain('Can you confirm Salesforce certification status?');
    expect(context.positioningStrategy.framingStillRequiringConfirmation).not.toContain('Do you own API-driven delivery?');
    expect(context.evidenceInventory.evidenceItems.some((item) =>
      item.sourceType === 'benchmark_profile_discovery_answer' &&
      item.statement.includes('API authentication workflow'),
    )).toBe(true);
  });
});
