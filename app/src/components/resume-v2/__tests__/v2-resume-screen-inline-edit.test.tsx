// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V2ResumeScreen } from '../V2ResumeScreen';
import type { ResumeDraft, V2PipelineData } from '@/types/resume-v2';

const {
  mockStreamingDisplay,
  mockPipelineState,
  mockSetInitialScores,
} = vi.hoisted(() => ({
  mockStreamingDisplay: vi.fn(),
  mockPipelineState: {
    data: null as V2PipelineData | null,
  },
  mockSetInitialScores: vi.fn(),
}));

vi.mock('@/hooks/useV2Pipeline', () => ({
  useV2Pipeline: () => ({
    data: mockPipelineState.data,
    isConnected: true,
    isComplete: true,
    isStarting: false,
    error: null,
    start: vi.fn(),
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
    getSnapshot: () => ({ items: {} }),
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
    getSnapshot: () => ({ items: {} }),
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
});
