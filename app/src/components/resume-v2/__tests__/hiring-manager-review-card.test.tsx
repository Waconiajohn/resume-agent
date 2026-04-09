// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HiringManagerReviewCard } from '../cards/HiringManagerReviewCard';
import type { HiringManagerReviewResult } from '@/hooks/useHiringManagerReview';
import type { FinalReviewChatContext } from '@/types/resume-v2';

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
        suggested_resume_edit: 'Built and tracked weekly plant scorecards across safety, throughput, and labor efficiency targets.',
        clarifying_question: 'What operating metric or scorecard detail makes the ownership clear?',
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

function makeFinalReviewContext(): FinalReviewChatContext {
  return {
    concernId: 'concern-1',
    concernType: 'missing_evidence',
    severity: 'critical',
    observation: 'Performance metrics ownership is still too vague.',
    whyItHurts: 'The hiring manager may not trust that the candidate owned the KPI system.',
    fixStrategy: 'Tie the claim to a concrete metrics line that is already on the resume.',
    requiresCandidateInput: false,
    clarifyingQuestion: 'What operating metric or scorecard detail makes the ownership clear?',
    targetSection: 'Professional Experience - Acme Manufacturing',
    relatedRequirement: 'Develop and track performance metrics',
    suggestedResumeEdit: 'Built and tracked weekly plant scorecards across safety, throughput, and labor efficiency targets.',
    roleTitle: 'VP Operations',
    companyName: 'Acme Manufacturing',
    jobDescriptionFit: 'moderate',
    benchmarkAlignment: 'moderate',
    businessImpact: 'strong',
    clarityAndCredibility: 'moderate',
    resumeExcerpt: 'Built and tracked plant performance metrics across safety, throughput, and labor efficiency.',
  };
}

describe('HiringManagerReviewCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows the resolved resume target preview for an expanded concern', () => {
    const onPreviewConcernTarget = vi.fn();

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
          selector: '[data-bullet-id="professional_experience-0"]',
        })}
        onPreviewConcernTarget={onPreviewConcernTarget}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /Performance metrics ownership is still too vague/i })[0]);

    expect(screen.getByText('Resume line to edit')).toBeInTheDocument();
    expect(screen.getAllByText('Professional Experience - Acme Manufacturing')).toHaveLength(2);
    expect(screen.getByText(/Built and tracked plant performance metrics across safety, throughput, and labor efficiency/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show on Resume/i }));
    expect(onPreviewConcernTarget).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Show on Resume/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Review Edit on Resume/i })).toBeInTheDocument();
  });

  it('scrolls the coaching thread into view on mobile when a concern coach opens', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(max-width: 640px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = vi.fn();

    render(
      <HiringManagerReviewCard
        result={makeResult()}
        isLoading={false}
        error={null}
        companyName="Acme Manufacturing"
        roleTitle="VP Operations"
        onRequestReview={vi.fn()}
        onApplyRecommendation={vi.fn()}
        finalReviewChat={{
          getItemState: vi.fn(() => ({ messages: [], isLoading: false, error: null, resolvedLanguage: null })),
          sendMessage: vi.fn(),
          hydrate: vi.fn(),
          reset: vi.fn(),
        } as never}
        buildFinalReviewChatContext={() => makeFinalReviewContext()}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /Performance metrics ownership is still too vague/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /coach this fix|brainstorm another fix/i }));

    expect(screen.getByTestId('final-review-thread')).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('surfaces direct final review actions for suggested wording and questions', () => {
    const onApplyRecommendation = vi.fn();

    render(
      <HiringManagerReviewCard
        result={makeResult()}
        isLoading={false}
        error={null}
        companyName="Acme Manufacturing"
        roleTitle="VP Operations"
        onRequestReview={vi.fn()}
        onApplyRecommendation={onApplyRecommendation}
        finalReviewChat={{
          getItemState: vi.fn(() => ({ messages: [], isLoading: false, error: null, resolvedLanguage: null })),
          sendMessage: vi.fn(),
          hydrate: vi.fn(),
          reset: vi.fn(),
        } as never}
        buildFinalReviewChatContext={() => makeFinalReviewContext()}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /Performance metrics ownership is still too vague/i })[0]);

    expect(screen.getByRole('button', { name: /Use suggested wording/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit suggested wording/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Answer this question/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Use suggested wording/i }));
    expect(onApplyRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'concern-1' }),
      'Built and tracked weekly plant scorecards across safety, throughput, and labor efficiency targets.',
      false,
    );

    fireEvent.click(screen.getByRole('button', { name: /Edit suggested wording/i }));
    expect(screen.getByTestId('final-review-thread')).toBeInTheDocument();
  });
});
