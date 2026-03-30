// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { V2ResumeScreen } from '../V2ResumeScreen';

const {
  mockLoadSession,
  mockReset,
  mockStart,
  mockSaveDraftState,
  mockIntegrateKeyword,
  mockSetInitialScores,
} = vi.hoisted(() => ({
  mockLoadSession: vi.fn(),
  mockReset: vi.fn(),
  mockStart: vi.fn(),
  mockSaveDraftState: vi.fn(),
  mockIntegrateKeyword: vi.fn(),
  mockSetInitialScores: vi.fn(),
}));

vi.mock('@/hooks/useV2Pipeline', () => ({
  useV2Pipeline: () => ({
    data: {
      sessionId: '',
      stage: 'intake',
      jobIntelligence: null,
      candidateIntelligence: null,
      benchmarkCandidate: null,
      gapAnalysis: null,
      gapCoachingCards: null,
      gapQuestions: null,
      preScores: null,
      narrativeStrategy: null,
      resumeDraft: null,
      assembly: null,
      hiringManagerScan: null,
      verificationDetail: null,
      error: null,
      stageMessages: [],
    },
    isConnected: false,
    isComplete: false,
    isStarting: false,
    error: null,
    start: mockStart,
    reset: mockReset,
    loadSession: mockLoadSession,
    saveDraftState: mockSaveDraftState,
    integrateKeyword: mockIntegrateKeyword,
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
  V2IntakeForm: ({ error }: { error?: string | null }) => (
    <div data-testid="v2-intake-form">{error ?? 'intake'}</div>
  ),
}));

vi.mock('../V2StreamingDisplay', () => ({
  V2StreamingDisplay: () => <div data-testid="v2-streaming-display">streaming</div>,
}));

function makeToken(userId: string): string {
  const header = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
  const payload = btoa(JSON.stringify({ sub: userId }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
  return `${header}.${payload}.signature`;
}

describe('V2ResumeScreen session boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadSession.mockResolvedValue({
      resume_text: 'resume text',
      job_description: 'job description',
      draftState: null,
    });
    mockSaveDraftState.mockResolvedValue(true);
  });

  afterEach(() => {
    cleanup();
  });

  it('reloads when the requested historical session changes without remounting', async () => {
    const { rerender } = render(
      <V2ResumeScreen
        accessToken={makeToken('user-a')}
        onBack={vi.fn()}
        initialSessionId="session-a"
      />,
    );

    await waitFor(() => expect(mockLoadSession).toHaveBeenCalledWith('session-a'));

    rerender(
      <V2ResumeScreen
        accessToken={makeToken('user-a')}
        onBack={vi.fn()}
        initialSessionId="session-b"
      />,
    );

    await waitFor(() => expect(mockLoadSession).toHaveBeenCalledWith('session-b'));
    expect(mockLoadSession).toHaveBeenCalledTimes(2);
  });

  it('resets the hydrated historical state when switching back to a fresh intake session', async () => {
    const { rerender } = render(
      <V2ResumeScreen
        accessToken={makeToken('user-a')}
        onBack={vi.fn()}
        initialSessionId="session-a"
      />,
    );

    await waitFor(() => expect(mockLoadSession).toHaveBeenCalledWith('session-a'));
    mockReset.mockClear();

    rerender(
      <V2ResumeScreen
        accessToken={makeToken('user-a')}
        onBack={vi.fn()}
        initialSessionId={undefined}
        initialResumeText="Fresh base resume"
      />,
    );

    await waitFor(() => expect(mockReset).toHaveBeenCalledTimes(1));
  });

  it('retries loading the requested session after auth drops and returns', async () => {
    const { rerender } = render(
      <V2ResumeScreen
        accessToken={makeToken('user-a')}
        onBack={vi.fn()}
        initialSessionId="session-a"
      />,
    );

    await waitFor(() => expect(mockLoadSession).toHaveBeenCalledWith('session-a'));

    mockLoadSession.mockClear();
    mockReset.mockClear();

    rerender(
      <V2ResumeScreen
        accessToken={null}
        onBack={vi.fn()}
        initialSessionId="session-a"
      />,
    );

    await waitFor(() => expect(mockReset).toHaveBeenCalled());

    rerender(
      <V2ResumeScreen
        accessToken={makeToken('user-a')}
        onBack={vi.fn()}
        initialSessionId="session-a"
      />,
    );

    await waitFor(() => expect(mockLoadSession).toHaveBeenCalledWith('session-a'));
  });
});
