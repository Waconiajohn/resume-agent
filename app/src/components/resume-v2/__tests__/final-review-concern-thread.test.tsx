// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';

import { FinalReviewConcernThread } from '../cards/FinalReviewConcernThread';
import type { FinalReviewChatContext } from '@/types/resume-v2';

function makeContext(overrides?: Partial<FinalReviewChatContext>): FinalReviewChatContext {
  return {
    concernId: 'concern-1',
    concernType: 'missing_evidence',
    severity: 'critical',
    observation: 'Executive communication is not obvious enough.',
    whyItHurts: 'The hiring manager may not trust the candidate in board-level settings.',
    fixStrategy: 'Add one concrete example showing board or executive-facing communication and what decision came from it.',
    requiresCandidateInput: true,
    clarifyingQuestion: 'Who was the audience, what did you present, and what decision or next step came from it?',
    targetSection: 'Executive Summary',
    relatedRequirement: 'Board-level communication',
    suggestedResumeEdit: 'Presented quarterly operating updates to the board and executive leadership, translating performance issues into investment priorities.',
    roleTitle: 'COO',
    companyName: 'Acme',
    jobDescriptionFit: 'moderate',
    benchmarkAlignment: 'moderate',
    businessImpact: 'strong',
    clarityAndCredibility: 'moderate',
    resumeExcerpt: 'Operational executive who scales multi-site teams.',
    ...overrides,
  };
}

describe('FinalReviewConcernThread', () => {
  afterEach(() => {
    cleanup();
  });

  if (!('scrollIntoView' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: vi.fn(),
      writable: true,
    });
  }

  it('shows structured intro guidance and editable starter draft before any chat messages exist', () => {
    const view = render(
      <FinalReviewConcernThread
        concernId="concern-1"
        messages={[]}
        isLoading={false}
        error={null}
        resolvedLanguage={null}
        onSendMessage={vi.fn()}
        onReviewEdit={vi.fn()}
        context={makeContext()}
      />,
    );

    expect(view.getByText('What needs to be fixed')).toBeInTheDocument();
    expect(view.getByText('Board-level communication')).toBeInTheDocument();
    expect(view.getByText('Best next detail to add')).toBeInTheDocument();
    expect(view.getByText(/who was the audience, what did you present/i)).toBeInTheDocument();
    expect(view.getByText('Suggested rewrite to start from')).toBeInTheDocument();
    expect(view.getByDisplayValue(/Presented quarterly operating updates to the board/i)).toBeInTheDocument();
  });

  it('uses the structured clarifying question when asking AI what detail is missing', () => {
    const onSendMessage = vi.fn();

    const view = render(
      <FinalReviewConcernThread
        concernId="concern-1"
        messages={[]}
        isLoading={false}
        error={null}
        resolvedLanguage={null}
        onSendMessage={onSendMessage}
        onReviewEdit={vi.fn()}
        context={makeContext()}
      />,
    );

    const thread = within(view.container).getByTestId('final-review-thread');
    fireEvent.click(within(thread).getAllByRole('button', { name: /ask ai what detail is missing/i })[0]);

    expect(onSendMessage).toHaveBeenCalledWith(
      'concern-1',
      expect.stringContaining('Who was the audience, what did you present, and what decision or next step came from it?'),
      expect.objectContaining({
        clarifyingQuestion: 'Who was the audience, what did you present, and what decision or next step came from it?',
      }),
    );
  });

  it('prefers the structured concern question over a generic legacy message question', () => {
    const view = render(
      <FinalReviewConcernThread
        concernId="concern-1"
        messages={[
          {
            role: 'assistant',
            content: 'We can tighten this concern if we get one missing detail.',
            currentQuestion: 'What additional detail can you share that would make this point more credible or specific?',
          },
        ]}
        isLoading={false}
        error={null}
        resolvedLanguage={null}
        onSendMessage={vi.fn()}
        onReviewEdit={vi.fn()}
        context={makeContext()}
      />,
    );

    expect(view.getByText(/Next question:/)).toHaveTextContent(
      'Who was the audience, what did you present, and what decision or next step came from it?',
    );
    expect(view.queryByText(/what additional detail can you share/i)).not.toBeInTheDocument();
  });
});
