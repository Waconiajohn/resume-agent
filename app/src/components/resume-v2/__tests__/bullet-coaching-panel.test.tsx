// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { BulletCoachingPanel } from '../cards/BulletCoachingPanel';
import type { GapChatContext } from '@/types/resume-v2';

function makeGapChat() {
  return {
    getItemState: vi.fn(() => ({ isLoading: false })),
    sendMessage: vi.fn(() => Promise.resolve()),
    resolveLanguage: vi.fn(),
    clearResolution: vi.fn(),
    hydrate: vi.fn(),
    reset: vi.fn(),
  } as never;
}

function makeChatContext(overrides: Partial<GapChatContext> = {}): GapChatContext {
  return {
    evidence: [],
    currentStrategy: undefined,
    aiReasoning: undefined,
    inferredMetric: undefined,
    coachingPolicy: undefined,
    jobDescriptionExcerpt: 'Own KPI development, scorecards, and operating rhythm.',
    candidateExperienceSummary: 'Led a 45-person engineering organization across multiple launches.',
    alternativeBullets: [],
    primaryRequirement: 'Product delivery',
    requirementSource: 'job_description',
    sourceEvidence: 'Own KPI development, scorecards, and operating rhythm.',
    lineText: 'Seasoned engineering leader driving outcomes at scale.',
    lineKind: 'summary',
    sectionKey: 'executive_summary',
    sectionLabel: 'Executive Summary',
    relatedRequirements: ['Product delivery', 'Executive leadership'],
    coachingGoal: 'Rewrite this executive summary line so it quickly sells role fit, leadership scope, and business relevance.',
    clarifyingQuestions: ['What scale or business outcome makes this summary more concrete?'],
    ...overrides,
  };
}

describe('BulletCoachingPanel', () => {
  it('renders summary-specific enhancement actions and clarifying guidance', () => {
    render(
      <BulletCoachingPanel
        bulletText="Seasoned engineering leader driving outcomes at scale."
        section="executive_summary"
        bulletIndex={0}
        requirements={['Product delivery', 'Executive leadership']}
        reviewState="strengthen"
        requirementSource="job_description"
        evidenceFound="Led a 45-person engineering organization across multiple launches."
        gapChat={makeGapChat()}
        chatContext={makeChatContext()}
        onApplyToResume={vi.fn()}
        onRemoveBullet={vi.fn()}
        onClose={vi.fn()}
        canRemove={false}
        onBulletEnhance={vi.fn(async () => null)}
      />,
    );

    expect(screen.getByText('AI summary upgrades')).toBeInTheDocument();
    expect(screen.getByText('Sharpen opening story')).toBeInTheDocument();
    expect(screen.getByText('Show leadership scope')).toBeInTheDocument();
    expect(screen.getByText('Match this role')).toBeInTheDocument();
    expect(screen.getByText('Add business impact')).toBeInTheDocument();
    expect(screen.getByText('Fastest way to strengthen this summary line')).toBeInTheDocument();
    expect(screen.getByText('What scale or business outcome makes this summary more concrete?')).toBeInTheDocument();
  });

  it('uses the top clarifying question as the code-red placeholder when evidence is missing', () => {
    render(
      <BulletCoachingPanel
        bulletText="Built and tracked performance metrics."
        section="professional_experience"
        bulletIndex={0}
        requirements={['Develop and track performance metrics']}
        reviewState="code_red"
        requirementSource="job_description"
        evidenceFound=""
        gapChat={makeGapChat()}
        chatContext={makeChatContext({
          lineKind: 'bullet',
          sectionKey: 'professional_experience',
          sectionLabel: 'Professional Experience',
          lineText: 'Built and tracked performance metrics.',
          primaryRequirement: 'Develop and track performance metrics',
          relatedRequirements: ['Develop and track performance metrics'],
          clarifyingQuestions: ['What KPI review, scorecard, or operating rhythm did you actually own?'],
        })}
        onApplyToResume={vi.fn()}
        onRemoveBullet={vi.fn()}
        onClose={vi.fn()}
        onBulletEnhance={vi.fn(async () => null)}
      />,
    );

    expect(screen.getByText(/start with this:/i)).toHaveTextContent(
      'Start with this: What KPI review, scorecard, or operating rhythm did you actually own?',
    );

    const textarea = screen.getByLabelText('Provide context about your experience');
    expect(textarea).toHaveAttribute(
      'placeholder',
      'What KPI review, scorecard, or operating rhythm did you actually own?',
    );

    fireEvent.change(textarea, { target: { value: 'Owned weekly KPI reviews across 3 plants.' } });
    expect(textarea).toHaveValue('Owned weekly KPI reviews across 3 plants.');
  });
});
