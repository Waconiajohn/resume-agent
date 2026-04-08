// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProfileSetupPage from '../ProfileSetupPage';

const {
  mockAnalyze,
  mockAnswer,
  mockComplete,
  mockTrackProductEvent,
} = vi.hoisted(() => ({
  mockAnalyze: vi.fn(),
  mockAnswer: vi.fn(),
  mockComplete: vi.fn(),
  mockTrackProductEvent: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    session: { access_token: 'token-123' },
  }),
}));

vi.mock('@/hooks/useProfileSetup', () => ({
  useProfileSetup: () => ({
    analyze: mockAnalyze,
    answer: mockAnswer,
    complete: mockComplete,
    analyzing: false,
    answering: false,
    completing: false,
    error: null,
    clearError: vi.fn(),
  }),
}));

vi.mock('@/lib/product-telemetry', () => ({
  trackProductEvent: mockTrackProductEvent,
}));

vi.mock('../IntakeForm', () => ({
  IntakeForm: ({ onSubmit }: { onSubmit: (resume: string, linkedin: string, target: string, situation: string) => void }) => (
    <button
      type="button"
      onClick={() => onSubmit('A'.repeat(120), '', 'VP Engineering', '')}
    >
      Start setup
    </button>
  ),
}));

vi.mock('../InterviewView', () => ({
  InterviewView: ({ onComplete }: { onComplete: () => void }) => (
    <button type="button" onClick={onComplete}>
      Finish interview
    </button>
  ),
}));

vi.mock('../ProfileReveal', () => ({
  ProfileReveal: ({
    masterResumeCreated,
    masterResumeRecovered,
    onRetryMasterResume,
  }: {
    masterResumeCreated?: boolean | null;
    masterResumeRecovered?: boolean;
    onRetryMasterResume?: () => void;
  }) => (
    <div>
      <div data-testid="master-resume-state">{String(masterResumeCreated)}</div>
      <div data-testid="master-resume-recovered">{String(masterResumeRecovered)}</div>
      {masterResumeCreated === false && onRetryMasterResume && (
        <button type="button" onClick={onRetryMasterResume}>
          Retry master resume
        </button>
      )}
    </div>
  ),
}));

function makeIntake() {
  return {
    why_me_draft: 'Strong operator',
    career_thread: 'Operator to engineering leader',
    top_capabilities: [],
    profile_gaps: [],
    primary_concern: null,
    interview_questions: [
      {
        question: 'What was the scale?',
        what_we_are_looking_for: 'platform scale',
        references_resume_element: 'Acme Corp',
        suggested_starters: [],
      },
    ],
    structured_experience: [],
  };
}

function makeProfile() {
  return {
    career_thread: 'Operator to engineering leader',
    top_capabilities: [],
    signature_story: {
      situation: '',
      task: '',
      action: '',
      result: '',
      reflection: '',
    },
    honest_answer: {
      concern: '',
      response: '',
    },
    righteous_close: '',
    why_me_final: {
      headline: 'Engineering leader',
      body: 'Scales platforms and teams.',
    },
    target_roles: ['VP Engineering'],
    created_at: '2026-04-07T00:00:00.000Z',
  };
}

describe('ProfileSetupPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('lets the user retry master resume creation from the reveal screen', async () => {
    mockAnalyze.mockResolvedValue({
      session_id: 'profile-setup-session',
      intake: makeIntake(),
    });
    mockComplete
      .mockResolvedValueOnce({
        profile: makeProfile(),
        master_resume_created: false,
        master_resume_id: null,
      })
      .mockResolvedValueOnce({
        profile: makeProfile(),
        master_resume_created: true,
        master_resume_id: 'resume-123',
      });

    render(<ProfileSetupPage />);

    fireEvent.click(screen.getByRole('button', { name: /start setup/i }));
    fireEvent.click(await screen.findByRole('button', { name: /finish interview/i }));

    await waitFor(() => {
      expect(screen.getByTestId('master-resume-state')).toHaveTextContent('false');
    });

    expect(mockTrackProductEvent).toHaveBeenCalledWith('profile_setup_retry_needed', {
      session_id: 'profile-setup-session',
      source: 'initial_complete',
    });

    fireEvent.click(screen.getByRole('button', { name: /retry master resume/i }));

    await waitFor(() => {
      expect(screen.getByTestId('master-resume-state')).toHaveTextContent('true');
    });
    expect(screen.getByTestId('master-resume-recovered')).toHaveTextContent('true');

    expect(mockComplete).toHaveBeenCalledTimes(2);
    expect(mockComplete).toHaveBeenNthCalledWith(1, 'profile-setup-session');
    expect(mockComplete).toHaveBeenNthCalledWith(2, 'profile-setup-session');
    expect(mockTrackProductEvent).toHaveBeenCalledWith('profile_setup_retry_requested', {
      session_id: 'profile-setup-session',
      source: 'reveal',
    });
    expect(mockTrackProductEvent).toHaveBeenCalledWith('profile_setup_retry_succeeded', {
      session_id: 'profile-setup-session',
      master_resume_id: 'resume-123',
    });
  });
});
