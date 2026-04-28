// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ProfileReveal } from '../ProfileReveal';

const navigateMock = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

function makeProfile() {
  return {
    version: 'career_profile_v2' as const,
    source: 'career_profile' as const,
    generated_at: '2026-04-07T00:00:00.000Z',
    targeting: {
      target_roles: ['VP Engineering'],
      target_industries: [],
      seniority: 'executive',
      transition_type: 'lateral',
      preferred_company_environments: [],
    },
    positioning: {
      core_strengths: ['Executive communication'],
      proof_themes: [],
      differentiators: [],
      adjacent_positioning: [],
      positioning_statement: 'Operator to engineering leader',
      narrative_summary: '',
      leadership_scope: '',
      scope_of_responsibility: '',
    },
    narrative: {
      colleagues_came_for_what: 'Scales platforms and teams.',
      known_for_what: 'Engineering leader',
      why_not_me: '',
      story_snippet: '',
    },
    preferences: {
      must_haves: [],
      constraints: [],
      compensation_direction: '',
    },
    coaching: {
      financial_segment: 'ideal',
      emotional_state: 'confident',
      coaching_tone: 'direct',
      urgency_score: 5,
      recommended_starting_point: 'resume',
    },
    evidence_positioning_statements: [],
    profile_signals: {
      clarity: 'green' as const,
      alignment: 'green' as const,
      differentiation: 'green' as const,
    },
    completeness: {
      overall_score: 80,
      dashboard_state: 'strong' as const,
      sections: [],
    },
    profile_summary: '',
  };
}

describe('ProfileReveal', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows a retry affordance when Career Proof was not created', () => {
    const onRetry = vi.fn();

    render(
      <ProfileReveal
        profile={makeProfile()}
        masterResumeCreated={false}
        onRetryMasterResume={onRetry}
      />,
    );

    expect(screen.getByText(/your profile is saved, but your first career proof still needs one more step/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry creating my career proof/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('hides the retry affordance once Career Proof exists', () => {
    render(
      <ProfileReveal
        profile={makeProfile()}
        masterResumeCreated
      />,
    );

    expect(screen.queryByRole('button', { name: /retry creating my career proof/i })).not.toBeInTheDocument();
  });

  it('shows a success confirmation once the Career Proof retry succeeds', () => {
    render(
      <ProfileReveal
        profile={makeProfile()}
        masterResumeCreated
        masterResumeRecovered
      />,
    );

    expect(screen.getByText(/your career proof is ready now/i)).toBeInTheDocument();
    expect(screen.getByText(/the retry worked/i)).toBeInTheDocument();
  });
});
