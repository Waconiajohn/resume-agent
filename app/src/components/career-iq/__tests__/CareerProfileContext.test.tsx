import { describe, expect, it } from 'vitest';
import { buildCareerProfileSummary } from '../career-profile-summary';
import type { CareerProfileV2 } from '@/types/career-profile';

function makeProfile(overrides: Partial<CareerProfileV2> = {}): CareerProfileV2 {
  return {
    version: 'career_profile_v2',
    source: 'career_profile',
    generated_at: '2026-03-16T12:00:00.000Z',
    targeting: {
      target_roles: ['Senior Program Manager'],
      target_industries: ['Technology'],
      seniority: 'senior',
      transition_type: 'voluntary',
      preferred_company_environments: ['High-growth'],
    },
    positioning: {
      core_strengths: ['Cross-functional transformation'],
      proof_themes: ['Scaled operating rhythm across multiple teams'],
      differentiators: ['Bridges strategy and execution'],
      adjacent_positioning: ['Led equivalent scope without the exact title'],
      positioning_statement: 'Cross-functional operator who turns ambiguity into execution momentum.',
      narrative_summary: 'Turns complex programs into coordinated delivery systems.',
      leadership_scope: 'Global cross-functional teams',
      scope_of_responsibility: 'Enterprise programs',
    },
    narrative: {
      colleagues_came_for_what: 'People pulled me into ambiguous programs that needed structure fast.',
      known_for_what: 'Building operating rhythms that help teams ship measurable change.',
      why_not_me: 'I have already led equivalent scope in adjacent environments, even without the exact title.',
      story_snippet: 'Trusted for turning ambiguity into execution momentum.',
    },
    preferences: {
      must_haves: ['Hybrid or remote'],
      constraints: ['Chicago-based'],
      compensation_direction: '',
    },
    coaching: {
      financial_segment: 'ideal',
      emotional_state: 'acceptance',
      coaching_tone: 'direct',
      urgency_score: 5,
      recommended_starting_point: 'resume',
    },
    evidence_positioning_statements: ['Cross-functional transformation positioned against Senior Program Manager requirements.'],
    profile_signals: {
      clarity: 'green',
      alignment: 'green',
      differentiation: 'green',
    },
    completeness: {
      overall_score: 88,
      dashboard_state: 'strong',
      sections: [
        { id: 'direction', label: 'Direction', status: 'ready', score: 92, summary: 'Direction is clear.' },
        { id: 'positioning', label: 'Positioning', status: 'ready', score: 88, summary: 'Positioning is clear.' },
        { id: 'narrative', label: 'Narrative', status: 'ready', score: 86, summary: 'Narrative is clear.' },
        { id: 'constraints', label: 'Preferences', status: 'partial', score: 72, summary: 'Preferences can still be tightened.' },
      ],
    },
    profile_summary: 'Positioning for Senior Program Manager roles with emphasis on cross-functional transformation.',
    ...overrides,
  };
}

describe('buildCareerProfileSummary', () => {
  it('marks a strong profile as ready for execution work', () => {
    const summary = buildCareerProfileSummary(makeProfile());

    expect(summary.readinessLabel).toBe('Platform-ready');
    expect(summary.nextRecommendedRoom).toBe('jobs');
    expect(summary.highlightPoints.length).toBeGreaterThan(0);
  });

  it('keeps unfinished profiles focused on Career Profile completion', () => {
    const summary = buildCareerProfileSummary(makeProfile({
      narrative: {
        colleagues_came_for_what: '',
        known_for_what: '',
        why_not_me: '',
        story_snippet: '',
      },
      profile_signals: {
        clarity: 'red',
        alignment: 'yellow',
        differentiation: 'red',
      },
      completeness: {
        overall_score: 42,
        dashboard_state: 'refining',
        sections: [
          { id: 'direction', label: 'Direction', status: 'partial', score: 60, summary: 'Direction is usable.' },
          { id: 'positioning', label: 'Positioning', status: 'partial', score: 55, summary: 'Positioning needs more proof.' },
          { id: 'narrative', label: 'Narrative', status: 'missing', score: 20, summary: 'Narrative needs more detail.' },
          { id: 'constraints', label: 'Preferences', status: 'partial', score: 35, summary: 'Constraints need definition.' },
        ],
      },
    }));

    expect(summary.readinessLabel).toBe('Needs refinement');
    expect(summary.nextRecommendedRoom).toBe('career-profile');
    expect(summary.focusAreas).toContain('Narrative needs more detail.');
  });
});
