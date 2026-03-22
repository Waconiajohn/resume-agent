// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UnifiedGapAnalysisCard } from '../cards/UnifiedGapAnalysisCard';
import type { GapAnalysis, PositioningAssessment, ResumeDraft } from '@/types/resume-v2';

const mockScrollToBullet = vi.fn();

vi.mock('../useStrategyThread', () => ({
  scrollToBullet: (requirement: string) => mockScrollToBullet(requirement),
}));

function makeResume(): ResumeDraft {
  return {
    header: {
      name: 'Jane Leader',
      phone: '555-111-2222',
      email: 'jane@example.com',
      branded_title: 'COO',
    },
    executive_summary: {
      content: 'Operational executive who scales multi-site teams.',
      is_new: false,
      addresses_requirements: ['Multi-site leadership'],
    },
    core_competencies: ['Operations', 'Leadership'],
    selected_accomplishments: [
      {
        content: 'Led operations across 18 sites and improved margin by 12%.',
        is_new: false,
        addresses_requirements: ['Multi-site leadership'],
      },
    ],
    professional_experience: [
      {
        company: 'Acme',
        title: 'VP Operations',
        start_date: '2020',
        end_date: '2025',
        scope_statement: 'Owned regional operations for a distributed footprint.',
        bullets: [
          {
            text: 'Managed a 120-person org across manufacturing and field operations.',
            is_new: false,
            addresses_requirements: ['Team leadership at scale'],
          },
        ],
      },
    ],
    education: [],
    certifications: [],
  };
}

function makeGapAnalysis(): GapAnalysis {
  return {
    coverage_score: 67,
    strength_summary: 'Some core requirements are covered, but leadership depth still needs stronger proof.',
    critical_gaps: [],
    pending_strategies: [],
    requirements: [
      {
        requirement: 'Team leadership at scale',
        source: 'job_description',
        importance: 'must_have',
        classification: 'partial',
        evidence: ['Managed a 120-person org across manufacturing and field operations.'],
      },
      {
        requirement: 'Multi-site leadership',
        source: 'job_description',
        importance: 'must_have',
        classification: 'strong',
        evidence: ['Led operations across 18 sites and improved margin by 12%.'],
      },
      {
        requirement: 'Board-level communication',
        source: 'benchmark',
        importance: 'important',
        classification: 'missing',
        evidence: [],
      },
    ],
    score_breakdown: {
      job_description: {
        total: 2,
        strong: 1,
        partial: 1,
        missing: 0,
        addressed: 2,
        coverage_score: 100,
      },
      benchmark: {
        total: 1,
        strong: 0,
        partial: 0,
        missing: 1,
        addressed: 0,
        coverage_score: 0,
      },
    },
  };
}

function makePositioningAssessment(): PositioningAssessment {
  return {
    summary: 'Assessment summary',
    before_score: 54,
    after_score: 72,
    strategies_applied: [],
    requirement_map: [
      {
        requirement: 'Team leadership at scale',
        importance: 'must_have',
        status: 'repositioned',
        addressed_by: [
          {
            section: 'Professional Experience - Acme',
            bullet_text: 'Managed a 120-person org across manufacturing and field operations.',
          },
        ],
      },
      {
        requirement: 'Multi-site leadership',
        importance: 'must_have',
        status: 'strong',
        addressed_by: [
          {
            section: 'Selected Accomplishments',
            bullet_text: 'Led operations across 18 sites and improved margin by 12%.',
          },
        ],
      },
      {
        requirement: 'Board-level communication',
        importance: 'important',
        status: 'gap',
        addressed_by: [],
      },
    ],
  };
}

describe('UnifiedGapAnalysisCard inventory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows separate inventory groups for job description and benchmark requirements', () => {
    render(
      <UnifiedGapAnalysisCard
        gapAnalysis={makeGapAnalysis()}
        gapCoachingCards={null}
        roleTitle="COO"
        companyName="Acme"
        onRespondGapCoaching={vi.fn()}
        currentResume={makeResume()}
        positioningAssessment={makePositioningAssessment()}
      />,
    );

    expect(screen.getByText('Job Description Requirements')).toBeInTheDocument();
    expect(screen.getByText('Benchmark Requirements')).toBeInTheDocument();
    expect(screen.getByText('What You’re Matching')).toBeInTheDocument();
  });

  it('shows current resume proof and status labels in the inventory', () => {
    render(
      <UnifiedGapAnalysisCard
        gapAnalysis={makeGapAnalysis()}
        gapCoachingCards={null}
        onRespondGapCoaching={vi.fn()}
        currentResume={makeResume()}
        positioningAssessment={makePositioningAssessment()}
      />,
    );

    expect(screen.getAllByText('Partially Covered').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Covered').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not Yet Covered').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Currently shown in Professional Experience - Acme/).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Not clearly mapped to a specific line in the current resume yet/).length,
    ).toBeGreaterThan(0);
  });

  it('lets the user jump from the inventory to the mapped resume proof', () => {
    render(
      <UnifiedGapAnalysisCard
        gapAnalysis={makeGapAnalysis()}
        gapCoachingCards={null}
        onRespondGapCoaching={vi.fn()}
        currentResume={makeResume()}
        positioningAssessment={makePositioningAssessment()}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Show in Resume' })[0]);
    expect(mockScrollToBullet).toHaveBeenCalledWith('Team leadership at scale');
  });

  it('opens requirements that need work with a clearer issue and draft flow', () => {
    render(
      <UnifiedGapAnalysisCard
        gapAnalysis={makeGapAnalysis()}
        gapCoachingCards={null}
        onRespondGapCoaching={vi.fn()}
        currentResume={makeResume()}
        positioningAssessment={makePositioningAssessment()}
      />,
    );

    expect(screen.getAllByText('Needs stronger proof').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not yet covered').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Issue').length).toBeGreaterThan(0);
    expect(screen.getAllByText('What your resume shows today').length).toBeGreaterThan(0);
  });
});
