// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V2ResumeScreen } from '../V2ResumeScreen';
import type { ResumeDraft, V2PipelineData } from '@/types/resume-v2';

const {
  mockStreamingDisplay,
  mockPipelineState,
  mockSetInitialScores,
  mockStart,
  mockGapChatSnapshot,
  mockFinalReviewChatSnapshot,
} = vi.hoisted(() => ({
  mockStreamingDisplay: vi.fn(),
  mockPipelineState: {
    data: null as V2PipelineData | null,
  },
  mockSetInitialScores: vi.fn(),
  mockStart: vi.fn(),
  mockGapChatSnapshot: { items: {} } as { items: Record<string, unknown> },
  mockFinalReviewChatSnapshot: { items: {} } as { items: Record<string, unknown> },
}));

vi.mock('@/hooks/useV2Pipeline', () => ({
  useV2Pipeline: () => ({
    data: mockPipelineState.data,
    isConnected: true,
    isComplete: true,
    isStarting: false,
    error: null,
    start: mockStart,
    reset: vi.fn(),
    loadSession: vi.fn(),
    saveDraftState: vi.fn(),
    integrateKeyword: vi.fn(),
  }),
}));

vi.mock('@/hooks/useInlineEdit', () => ({
  useInlineEdit: () => ({
    pendingEdit: null,
    isEditing: false,
    editError: null,
    undoCount: 0,
    redoCount: 0,
    requestEdit: vi.fn(),
    acceptEdit: vi.fn(),
    rejectEdit: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    resetHistory: vi.fn(),
  }),
  resumeToPlainText: () => '',
}));

vi.mock('@/hooks/useLiveScoring', () => ({
  useLiveScoring: () => ({
    scores: null,
    isScoring: false,
    setInitialScores: mockSetInitialScores,
  }),
}));

vi.mock('@/hooks/useGapChat', () => ({
  useGapChat: () => ({
    resetChat: vi.fn(),
    acceptLanguage: vi.fn(),
    clearResolvedLanguage: vi.fn(),
    getSnapshot: () => mockGapChatSnapshot,
    hydrateSnapshot: vi.fn(),
    getItemState: vi.fn(),
    sendMessage: vi.fn(),
  }),
}));

vi.mock('@/hooks/useFinalReviewChat', () => ({
  useFinalReviewChat: () => ({
    resetChat: vi.fn(),
    acceptLanguage: vi.fn(),
    clearResolvedLanguage: vi.fn(),
    getSnapshot: () => mockFinalReviewChatSnapshot,
    hydrateSnapshot: vi.fn(),
  }),
}));

vi.mock('@/hooks/usePostReviewPolish', () => ({
  usePostReviewPolish: () => ({
    state: { status: 'idle', result: null },
    runPolish: vi.fn(),
    hydrateState: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock('@/hooks/useHiringManagerReview', () => ({
  useHiringManagerReview: () => ({
    result: null,
    isLoading: false,
    error: null,
    requestReview: vi.fn(),
    reset: vi.fn(),
    hydrateResult: vi.fn(),
  }),
}));

vi.mock('@/components/Toast', () => ({
  useToast: () => ({
    addToast: vi.fn(),
  }),
}));

vi.mock('@/lib/master-resume-promotion', () => ({
  getPromotableResumeItems: () => [],
}));

vi.mock('../V2IntakeForm', () => ({
  V2IntakeForm: () => <div data-testid="v2-intake-form">intake</div>,
}));

vi.mock('../V2StreamingDisplay', () => ({
  V2StreamingDisplay: (props: unknown) => {
    mockStreamingDisplay(props);
    return <div data-testid="v2-streaming-display">streaming</div>;
  },
}));

function makeResumeDraft(): ResumeDraft {
  return {
    header: {
      name: 'Jane Doe',
      phone: '555-0100',
      email: 'jane@example.com',
      branded_title: 'VP Engineering',
    },
    executive_summary: {
      content: 'Seasoned engineering leader driving outcomes at scale.',
      is_new: false,
      addresses_requirements: ['Product delivery'],
    },
    core_competencies: ['Team Leadership', 'Cloud Architecture'],
    selected_accomplishments: [
      {
        content: 'Reduced deploy time by 60%',
        is_new: false,
        addresses_requirements: ['CI/CD experience'],
        confidence: 'strong',
        evidence_found: '',
        requirement_source: 'job_description',
      },
    ],
    professional_experience: [
      {
        company: 'Acme Corp',
        title: 'VP Engineering',
        start_date: 'Jan 2020',
        end_date: 'Present',
        scope_statement: 'Led org of 45 engineers',
        bullets: [
          {
            text: 'Shipped 3 major product lines',
            is_new: false,
            addresses_requirements: ['Product delivery'],
            confidence: 'strong',
            evidence_found: '',
            requirement_source: 'job_description',
          },
        ],
      },
    ],
    education: [{ degree: 'BS Computer Science', institution: 'MIT', year: '2005' }],
    certifications: ['AWS Solutions Architect'],
    custom_sections: [
      {
        id: 'ai_highlights',
        title: 'AI Highlights',
        kind: 'bullet_list',
        lines: ['Applied AI workflow automation to speed cross-functional planning'],
      },
    ],
  };
}

function makePipelineData(): V2PipelineData {
  return {
    sessionId: 'session-1',
    stage: 'complete',
    jobIntelligence: {
      company_name: 'TechCorp',
      role_title: 'VP Engineering',
      seniority_level: 'VP',
      core_competencies: [
        { competency: 'CI/CD experience', importance: 'must_have', evidence_from_jd: 'Required' },
        { competency: 'Product delivery', importance: 'important', evidence_from_jd: 'Preferred' },
      ],
      strategic_responsibilities: ['Lead engineering org'],
      business_problems: ['Scale engineering team'],
      cultural_signals: ['Bias for action'],
      hidden_hiring_signals: ['Needs a builder'],
      language_keywords: ['platform', 'scale'],
      industry: 'SaaS',
    },
    candidateIntelligence: null,
    benchmarkCandidate: null,
    gapAnalysis: {
      requirements: [
        {
          requirement: 'CI/CD experience',
          importance: 'must_have',
          classification: 'strong',
          evidence: ['Reduced deploy time by 60%'],
        },
      ],
      coverage_score: 80,
      strength_summary: 'Strong leadership background.',
      critical_gaps: [],
      pending_strategies: [],
    },
    gapCoachingCards: null,
    gapQuestions: null,
    preScores: null,
    narrativeStrategy: null,
    resumeDraft: makeResumeDraft(),
    assembly: null,
    hiringManagerScan: null,
    verificationDetail: null,
    error: null,
    stageMessages: [],
  };
}

function latestStreamingProps(): Record<string, unknown> {
  const latest = mockStreamingDisplay.mock.calls.at(-1)?.[0];
  if (!latest) {
    throw new Error('V2StreamingDisplay was not rendered');
  }
  return latest as Record<string, unknown>;
}

describe('V2ResumeScreen inline editing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPipelineState.data = makePipelineData();
    mockGapChatSnapshot.items = {};
    mockFinalReviewChatSnapshot.items = {};
  });

  afterEach(() => {
    cleanup();
  });

  it('updates summary, competency, and custom section lines in the working resume', () => {
    render(<V2ResumeScreen accessToken={null} onBack={vi.fn()} />);

    act(() => {
      const props = latestStreamingProps();
      (props.onBulletEdit as (section: string, index: number, text: string) => void)(
        'executive_summary',
        0,
        'Executive operator who scales product and platform teams.',
      );
    });

    expect((latestStreamingProps().editableResume as ResumeDraft).executive_summary.content).toBe(
      'Executive operator who scales product and platform teams.',
    );

    act(() => {
      const props = latestStreamingProps();
      (props.onBulletEdit as (section: string, index: number, text: string) => void)(
        'core_competencies',
        1,
        'Platform Strategy',
      );
    });

    expect((latestStreamingProps().editableResume as ResumeDraft).core_competencies).toEqual([
      'Team Leadership',
      'Platform Strategy',
    ]);

    act(() => {
      const props = latestStreamingProps();
      (props.onBulletEdit as (section: string, index: number, text: string) => void)(
        'custom_section:ai_highlights',
        0,
        'Applied AI workflow automation to accelerate planning and reporting cadence',
      );
    });

    expect((latestStreamingProps().editableResume as ResumeDraft).custom_sections?.[0].lines).toEqual([
      'Applied AI workflow automation to accelerate planning and reporting cadence',
    ]);
  });

  it('removes competencies and deletes a custom section when its last line is removed', () => {
    render(<V2ResumeScreen accessToken={null} onBack={vi.fn()} />);

    act(() => {
      const props = latestStreamingProps();
      (props.onBulletRemove as (section: string, index: number) => void)('core_competencies', 0);
    });

    expect((latestStreamingProps().editableResume as ResumeDraft).core_competencies).toEqual([
      'Cloud Architecture',
    ]);

    act(() => {
      const props = latestStreamingProps();
      (props.onBulletRemove as (section: string, index: number) => void)('custom_section:ai_highlights', 0);
    });

    expect((latestStreamingProps().editableResume as ResumeDraft).custom_sections ?? []).toEqual([]);
  });

  it('passes clarification memory into reruns when the user adds more context', () => {
    mockGapChatSnapshot.items = {
      'Platform leadership': {
        messages: [
          { role: 'assistant', content: 'What was the scale?', currentQuestion: 'What was the scale?' },
          { role: 'user', content: 'I led platform modernization across four business units.' },
          { role: 'assistant', content: 'Great.', suggestedLanguage: 'Led platform modernization across 4 business units.' },
        ],
        resolvedLanguage: null,
        error: null,
      },
    };

    render(<V2ResumeScreen accessToken={null} onBack={vi.fn()} />);

    act(() => {
      const props = latestStreamingProps();
      (props.onAddContext as (text: string) => void)('Also emphasize executive stakeholder alignment.');
    });

    expect(mockStart).toHaveBeenCalledWith(
      '',
      '',
      expect.objectContaining({
        userContext: 'Also emphasize executive stakeholder alignment.',
        clarificationMemory: [
          expect.objectContaining({
            id: 'gap_chat:platform leadership',
            topic: 'Platform leadership',
            userInput: 'I led platform modernization across four business units.',
          }),
        ],
      }),
    );
  });

  it('passes clarification memory through when syncing the working resume to master', async () => {
    mockGapChatSnapshot.items = {
      'Platform leadership': {
        messages: [
          { role: 'assistant', content: 'What was the scale?', currentQuestion: 'What was the scale?' },
          { role: 'user', content: 'I led platform modernization across four business units.' },
          { role: 'assistant', content: 'Great.', suggestedLanguage: 'Led platform modernization across 4 business units.' },
        ],
        resolvedLanguage: null,
        error: null,
      },
    };

    const syncToMaster = vi.fn().mockResolvedValue({
      success: true,
      message: 'Synced to master resume.',
    });

    render(<V2ResumeScreen accessToken={null} onBack={vi.fn()} onSyncToMasterResume={syncToMaster} />);

    await act(async () => {
      const props = latestStreamingProps();
      await (props.onSaveCurrentToMaster as () => Promise<void>)();
    });

    expect(syncToMaster).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        clarificationMemory: [
          expect.objectContaining({
            id: 'gap_chat:platform leadership',
            topic: 'Platform leadership',
            userInput: 'I led platform modernization across four business units.',
          }),
        ],
      }),
    );
  });

  it('surfaces matching prior clarifications in buildChatContext for related requirements', () => {
    mockPipelineState.data = {
      ...makePipelineData(),
      gapCoachingCards: [
        {
          requirement: 'Develop and track performance metrics',
          importance: 'must_have',
          classification: 'partial',
          ai_reasoning: 'Need clearer KPI ownership.',
          proposed_strategy: 'Frame KPI cadence and operating rhythm more clearly.',
          evidence_found: ['Built weekly KPI reviews and line-performance meetings across 3 plants.'],
          coaching_policy: {
            primaryFamily: 'metrics',
            families: ['metrics'],
            clarifyingQuestion: 'Which metrics or scorecards did you personally track, how often did you review them, and what decision or improvement did they drive?',
            proofActionRequiresInput: 'Explain which metrics or scorecards you tracked, how often you reviewed them, and what decision or improvement they drove.',
            proofActionDirect: 'Name the metrics, cadence, and improvement directly.',
            rationale: 'Specific metrics and cadence make the claim believable.',
            lookingFor: 'Named metrics, cadence, and resulting decisions.',
          },
        },
      ],
    };
    mockGapChatSnapshot.items = {
      'Develop and track performance metrics': {
        messages: [
          { role: 'assistant', content: 'What KPI rhythm did you own?', currentQuestion: 'What KPI rhythm did you own?' },
          { role: 'user', content: 'I owned weekly KPI reviews across three plants and used them to improve throughput and safety.' },
          { role: 'assistant', content: 'Great.', suggestedLanguage: 'Owned weekly KPI reviews across 3 plants.' },
        ],
        resolvedLanguage: null,
        error: null,
      },
    };

    render(<V2ResumeScreen accessToken={null} onBack={vi.fn()} />);

    const props = latestStreamingProps();
    const chatContext = (props.buildChatContext as (target: Record<string, unknown>) => Record<string, unknown>)({
      requirement: 'Develop and track performance metrics',
      requirements: ['Develop and track performance metrics'],
      lineText: 'Built and tracked performance metrics.',
      section: 'professional_experience',
      index: 0,
      reviewState: 'strengthen',
      evidenceFound: 'Built weekly KPI reviews and line-performance meetings across 3 plants.',
    });

    expect(chatContext.priorClarifications).toEqual([
      expect.objectContaining({
        topic: 'Develop and track performance metrics',
        primaryFamily: 'metrics',
        userInput: 'I owned weekly KPI reviews across three plants and used them to improve throughput and safety.',
      }),
    ]);
  });

  it('optimistically promotes work-item state after a coached line edit', () => {
    mockPipelineState.data = {
      ...makePipelineData(),
      requirementWorkItems: [
        {
          id: 'work-item-product-delivery',
          requirement: 'Product delivery',
          source: 'job_description',
          importance: 'important',
          candidate_evidence: [],
          proof_level: 'none',
          framing_guardrail: 'blocked',
          current_claim_strength: 'code_red',
          next_best_action: 'answer',
        },
      ],
      resumeDraft: {
        ...makeResumeDraft(),
        professional_experience: [
          {
            ...makeResumeDraft().professional_experience[0],
            bullets: [
              {
                ...makeResumeDraft().professional_experience[0].bullets[0],
                confidence: 'needs_validation',
                review_state: 'code_red',
                work_item_id: 'work-item-product-delivery',
                proof_level: 'none',
                framing_guardrail: 'blocked',
                next_best_action: 'answer',
              },
            ],
          },
        ],
      },
    };

    render(<V2ResumeScreen accessToken={null} onBack={vi.fn()} />);

    act(() => {
      const props = latestStreamingProps();
      (props.onBulletEdit as (
        section: string,
        index: number,
        text: string,
        metadata?: Record<string, unknown>,
      ) => void)(
        'professional_experience',
        0,
        'Delivered product roadmap milestones across three product lines with weekly operating reviews.',
        {
          requirement: 'Product delivery',
          requirements: ['Product delivery'],
          reviewState: 'code_red',
          requirementSource: 'job_description',
          evidenceFound: '',
          workItemId: 'work-item-product-delivery',
          proofLevel: 'none',
          nextBestAction: 'answer',
        },
      );
    });

    expect((latestStreamingProps().editableResume as ResumeDraft).professional_experience[0].bullets[0]).toEqual(
      expect.objectContaining({
        text: 'Delivered product roadmap milestones across three product lines with weekly operating reviews.',
        review_state: 'strengthen',
        confidence: 'partial',
        proof_level: 'adjacent',
        next_best_action: 'tighten',
      }),
    );
    expect(((latestStreamingProps().data as V2PipelineData).requirementWorkItems ?? [])[0]).toEqual(
      expect.objectContaining({
        id: 'work-item-product-delivery',
        current_claim_strength: 'strengthen',
        proof_level: 'adjacent',
        next_best_action: 'tighten',
      }),
    );
  });
});
