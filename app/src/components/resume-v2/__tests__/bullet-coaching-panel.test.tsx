// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { BulletCoachingPanel } from '../cards/BulletCoachingPanel';
import type { GapChatContext } from '@/types/resume-v2';
import type { GapChatHook } from '@/hooks/useGapChat';

function makeGapChat(itemState?: Record<string, unknown>): GapChatHook & { sendMessage: ReturnType<typeof vi.fn> } {
  const mock = {
    getItemState: vi.fn(() => ({ isLoading: false, ...itemState })),
    sendMessage: vi.fn(() => Promise.resolve()),
    resolveLanguage: vi.fn(),
    clearResolution: vi.fn(),
    hydrate: vi.fn(),
    reset: vi.fn(),
    acceptLanguage: vi.fn(),
    clearResolvedLanguage: vi.fn(),
    getSnapshot: vi.fn(),
    hydrateSnapshot: vi.fn(),
    resetChat: vi.fn(),
    resolvedCount: 0,
    isAnyLoading: false,
  };

  return mock as unknown as GapChatHook & { sendMessage: ReturnType<typeof vi.fn> };
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
  it('renders Block 1 with section name and bullet text', () => {
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

    // Block 1: section name + item number
    expect(screen.getByText(/Executive Summary, item 1/i)).toBeInTheDocument();
    // Block 1: full bullet text (may appear more than once if also in a suggestion)
    expect(screen.getAllByText('Seasoned engineering leader driving outcomes at scale.').length).toBeGreaterThan(0);
  });

  it('shows Accept Enhancement / Edit Myself / Keep Original for AI-enhanced bullets', () => {
    render(
      <BulletCoachingPanel
        bulletText="Proven engineering leader who scaled teams across global product launches."
        section="executive_summary"
        bulletIndex={0}
        requirements={['Executive leadership']}
        reviewState="strengthen"
        requirementSource="job_description"
        evidenceFound="Led a 45-person engineering organization across multiple launches."
        isAIEnhanced
        gapChat={makeGapChat()}
        chatContext={makeChatContext()}
        onApplyToResume={vi.fn()}
        onRemoveBullet={vi.fn()}
        onClose={vi.fn()}
        onBulletEnhance={vi.fn(async () => null)}
      />,
    );

    expect(screen.getByRole('button', { name: /accept enhancement/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /edit myself/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /keep original/i })).toBeInTheDocument();
    // Diff labels (use getAllBy since "Keep Original" button also contains "original")
    expect(screen.getAllByText(/original/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/our enhancement/i)).toBeInTheDocument();
  });

  it('offers Use This Language / Write My Own / Skip This Gap when a code-red line is missing proof', () => {
    const gapChat = makeGapChat();

    render(
      <BulletCoachingPanel
        bulletText="Built and tracked performance metrics."
        section="professional_experience"
        bulletIndex={0}
        requirements={['Develop and track performance metrics']}
        reviewState="code_red"
        requirementSource="job_description"
        evidenceFound=""
        gapChat={gapChat}
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

    // Gap Identified block
    expect(screen.getByText(/gap identified/i)).toBeInTheDocument();
    expect(screen.getByText(/we don't have evidence/i)).toBeInTheDocument();

    // Code red clarifying detail hint
    expect(screen.getAllByText(/the extra detail i would want is/i).length).toBeGreaterThan(0);

    // Primary action buttons
    expect(screen.getByText('Use This Language')).toBeInTheDocument();
    expect(screen.getByText('Write My Own')).toBeInTheDocument();
    expect(screen.getByText('Skip This Gap')).toBeInTheDocument();

    // Clicking "Use This Language" triggers a safe rewrite via gapChat
    fireEvent.click(screen.getByText('Use This Language'));

    expect(gapChat.sendMessage).toHaveBeenCalledWith(
      'Develop and track performance metrics',
      expect.stringContaining('Rewrite this line in the safest truthful way using only evidence we already have.'),
      expect.objectContaining({
        primaryRequirement: 'Develop and track performance metrics',
      }),
      'missing',
    );
  });

  it('shows Use Suggestion / Edit Myself / Skip for a standard suggestion', () => {
    const { container } = render(
      <BulletCoachingPanel
        bulletText="Built and tracked performance metrics."
        section="professional_experience"
        bulletIndex={0}
        requirements={['Develop and track performance metrics']}
        reviewState="strengthen"
        requirementSource="job_description"
        evidenceFound="Built weekly KPI reviews and line-performance meetings across 3 plants."
        gapChat={makeGapChat({
          messages: [
            {
              role: 'assistant',
              content: 'Here is a stronger version.',
              suggestedLanguage: 'Built and tracked plant performance metrics across safety, throughput, and labor efficiency.',
            },
          ],
        })}
        chatContext={makeChatContext({
          lineKind: 'bullet',
          sectionKey: 'professional_experience',
          sectionLabel: 'Professional Experience',
          lineText: 'Built and tracked performance metrics.',
          primaryRequirement: 'Develop and track performance metrics',
          relatedRequirements: ['Develop and track performance metrics'],
        })}
        onApplyToResume={vi.fn()}
        onRemoveBullet={vi.fn()}
        onClose={vi.fn()}
        onBulletEnhance={vi.fn(async () => null)}
      />,
    );

    // Use container-scoped queries to avoid pollution from other tests in the same jsdom body
    const panel = container.querySelector('[data-testid="bullet-coaching-panel"]')!;
    expect(panel).toBeTruthy();
    expect(panel.querySelector('button[class*="bg-blue-600"]')?.textContent).toContain('Use Suggestion');
    expect(Array.from(panel.querySelectorAll('button')).some((b) => b.textContent?.includes('Edit Myself'))).toBe(true);
    expect(Array.from(panel.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Skip')).toBe(true);
    expect(panel.textContent).toContain('Suggested Improvement');
  });

  it('shows related line suggestions from one clarification answer and applies them safely', () => {
    const onApplyToResume = vi.fn();

    render(
      <BulletCoachingPanel
        bulletText="Built and tracked performance metrics."
        section="professional_experience"
        bulletIndex={0}
        requirements={['Develop and track performance metrics']}
        reviewState="strengthen"
        requirementSource="job_description"
        evidenceFound="Built weekly KPI reviews and line-performance meetings across 3 plants."
        gapChat={makeGapChat({
          messages: [
            {
              role: 'assistant',
              content: 'That answer gives us enough to strengthen this claim and a couple of nearby lines too.',
              suggestedLanguage: 'Built and tracked plant performance metrics across safety, throughput, and labor efficiency.',
              relatedLineSuggestions: [
                {
                  candidateId: 'selected_accomplishments:0',
                  lineText: 'Reduced defects by 50% through Agile ceremonies',
                  suggestedLanguage: 'Built weekly KPI reviews and operating rhythms that helped reduce defects by ~50% across three plants.',
                  rationale: 'The same KPI ownership answer gives this accomplishment a clearer operating-mechanism story.',
                  requirement: 'Develop and track performance metrics',
                },
                {
                  candidateId: 'executive_summary:0',
                  lineText: 'Seasoned engineering leader driving outcomes at scale.',
                  suggestedLanguage: 'Operations leader who uses KPI scorecards and operating rhythm to improve plant performance at scale.',
                  rationale: 'The KPI detail also sharpens the opening positioning.',
                  requirement: 'Own KPI development and scorecards',
                },
              ],
            },
          ],
        })}
        chatContext={makeChatContext({
          lineKind: 'bullet',
          sectionKey: 'professional_experience',
          sectionLabel: 'Professional Experience',
          lineText: 'Built and tracked performance metrics.',
          primaryRequirement: 'Develop and track performance metrics',
          relatedRequirements: ['Develop and track performance metrics'],
          relatedLineCandidates: [
            {
              id: 'selected_accomplishments:0',
              section: 'selected_accomplishments',
              index: 0,
              lineText: 'Reduced defects by 50% through Agile ceremonies',
              lineKind: 'bullet',
              label: 'Selected Accomplishments',
              requirements: ['Develop and track performance metrics'],
              evidenceFound: 'Introduced KPI reviews and release checklists.',
            },
            {
              id: 'executive_summary:0',
              section: 'executive_summary',
              index: 0,
              lineText: 'Seasoned engineering leader driving outcomes at scale.',
              lineKind: 'summary',
              label: 'Executive Summary',
              requirements: ['Own KPI development and scorecards'],
              evidenceFound: 'Led plant-wide KPI reviews and performance cadences.',
            },
          ],
        })}
        onApplyToResume={onApplyToResume}
        onRemoveBullet={vi.fn()}
        onClose={vi.fn()}
        onBulletEnhance={vi.fn(async () => null)}
      />,
    );

    expect(screen.getByText('Also improve nearby lines')).toBeInTheDocument();
    expect(screen.getByText(/this same detail can also improve 2 other lines/i)).toBeInTheDocument();
    expect(screen.getByText('Built weekly KPI reviews and operating rhythms that helped reduce defects by ~50% across three plants.')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('Apply to this line')[0]);
    expect(onApplyToResume).toHaveBeenCalledWith(
      'selected_accomplishments',
      0,
      'Built weekly KPI reviews and operating rhythms that helped reduce defects by ~50% across three plants.',
      expect.objectContaining({
        requirement: 'Develop and track performance metrics',
        reviewState: 'strengthen',
      }),
    );

    fireEvent.click(screen.getByText('Apply all nearby lines'));
    expect(onApplyToResume).toHaveBeenCalledWith(
      'executive_summary',
      0,
      'Operations leader who uses KPI scorecards and operating rhythm to improve plant performance at scale.',
      expect.objectContaining({
        requirement: 'Develop and track performance metrics',
        reviewState: 'strengthen',
      }),
    );
  });

  it('shows matching prior clarifications from earlier answers and triggers a reuse rewrite', () => {
    const gapChat = makeGapChat();

    render(
      <BulletCoachingPanel
        bulletText="Built and tracked performance metrics."
        section="professional_experience"
        bulletIndex={0}
        requirements={['Develop and track performance metrics']}
        reviewState="strengthen"
        requirementSource="job_description"
        evidenceFound="Built weekly KPI reviews and line-performance meetings across 3 plants."
        gapChat={gapChat}
        chatContext={makeChatContext({
          lineKind: 'bullet',
          sectionKey: 'professional_experience',
          sectionLabel: 'Professional Experience',
          lineText: 'Built and tracked performance metrics.',
          primaryRequirement: 'Develop and track performance metrics',
          relatedRequirements: ['Develop and track performance metrics'],
          priorClarifications: [
            {
              id: 'gap_chat:performance metrics',
              source: 'gap_chat',
              topic: 'Performance metrics',
              userInput: 'I owned weekly KPI reviews across three plants and used them to address safety and throughput issues.',
              appliedLanguage: 'Built weekly KPI reviews across 3 plants.',
              primaryFamily: 'metrics',
              families: ['metrics'],
            },
          ],
        })}
        onApplyToResume={vi.fn()}
        onRemoveBullet={vi.fn()}
        onClose={vi.fn()}
        onBulletEnhance={vi.fn(async () => null)}
      />,
    );

    // Prior clarification text shown under the suggestion
    expect(screen.getByText(/I am also using this earlier detail you confirmed/i)).toBeInTheDocument();
    expect(screen.getByText(/I owned weekly KPI reviews across three plants/i)).toBeInTheDocument();
  });

  it('auto-reuses a remembered clarification when the panel opens from that cue', async () => {
    const gapChat = makeGapChat();

    render(
      <BulletCoachingPanel
        bulletText="Built and tracked performance metrics."
        section="professional_experience"
        bulletIndex={0}
        requirements={['Develop and track performance metrics']}
        reviewState="strengthen"
        requirementSource="job_description"
        evidenceFound="Built weekly KPI reviews and line-performance meetings across 3 plants."
        gapChat={gapChat}
        initialReuseClarificationId="gap_chat:performance metrics"
        chatContext={makeChatContext({
          lineKind: 'bullet',
          sectionKey: 'professional_experience',
          sectionLabel: 'Professional Experience',
          lineText: 'Built and tracked performance metrics.',
          primaryRequirement: 'Develop and track performance metrics',
          relatedRequirements: ['Develop and track performance metrics'],
          priorClarifications: [
            {
              id: 'gap_chat:performance metrics',
              source: 'gap_chat',
              topic: 'Performance metrics',
              userInput: 'I owned weekly KPI reviews across three plants and used them to address safety and throughput issues.',
              appliedLanguage: 'Built weekly KPI reviews across 3 plants.',
              primaryFamily: 'metrics',
              families: ['metrics'],
            },
          ],
        })}
        onApplyToResume={vi.fn()}
        onRemoveBullet={vi.fn()}
        onClose={vi.fn()}
        onBulletEnhance={vi.fn(async () => null)}
      />,
    );

    await waitFor(() => {
      expect(gapChat.sendMessage).toHaveBeenCalledWith(
        'Develop and track performance metrics',
        expect.stringContaining('Use my earlier confirmed detail to rewrite this line'),
        expect.objectContaining({
          priorClarifications: [
            expect.objectContaining({
              id: 'gap_chat:performance metrics',
            }),
          ],
        }),
        'partial',
      );
    });
  });
});
