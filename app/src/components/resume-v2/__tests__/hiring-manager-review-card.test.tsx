// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HiringManagerReviewCard } from '../cards/HiringManagerReviewCard';
import type { HiringManagerReviewResult } from '@/hooks/useHiringManagerReview';

function makeResult(): HiringManagerReviewResult {
  return {
    six_second_scan: {
      decision: 'continue_reading',
      reason: 'The top third shows enough relevant leadership to keep reading.',
      top_signals_seen: [],
      important_signals_missing: [],
    },
    hiring_manager_verdict: {
      rating: 'possible_interview',
      summary: 'The draft is directionally strong but still needs better proof in one key area.',
    },
    fit_assessment: {
      job_description_fit: 'moderate',
      benchmark_alignment: 'moderate',
      business_impact: 'strong',
      clarity_and_credibility: 'moderate',
    },
    top_wins: [],
    concerns: [
      {
        id: 'concern-1',
        severity: 'critical',
        type: 'missing_evidence',
        observation: 'Performance metrics ownership is still too vague.',
        why_it_hurts: 'The hiring manager may not trust that the candidate owned the KPI system.',
        fix_strategy: 'Tie the claim to a concrete metrics line that is already on the resume.',
        target_section: 'Professional Experience - Acme Manufacturing',
        related_requirement: 'Develop and track performance metrics',
        requires_candidate_input: false,
      },
    ],
    structure_recommendations: [],
    benchmark_comparison: {
      advantages_vs_benchmark: [],
      gaps_vs_benchmark: [],
      reframing_opportunities: [],
    },
    improvement_summary: [],
  } as HiringManagerReviewResult;
}

describe('HiringManagerReviewCard', () => {
  it('shows the resolved resume target preview for an expanded concern', () => {
    render(
      <HiringManagerReviewCard
        result={makeResult()}
        isLoading={false}
        error={null}
        companyName="Acme Manufacturing"
        roleTitle="VP Operations"
        onRequestReview={vi.fn()}
        onApplyRecommendation={vi.fn()}
        resolveConcernTarget={() => ({
          section: 'Professional Experience - Acme Manufacturing',
          text: 'Built and tracked plant performance metrics across safety, throughput, and labor efficiency.',
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Performance metrics ownership is still too vague/i }));

    expect(screen.getByText('Will revise on the resume')).toBeInTheDocument();
    expect(screen.getByText('Professional Experience - Acme Manufacturing')).toBeInTheDocument();
    expect(screen.getByText(/Built and tracked plant performance metrics across safety, throughput, and labor efficiency/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Review Edit on Resume/i })).toBeInTheDocument();
  });
});
