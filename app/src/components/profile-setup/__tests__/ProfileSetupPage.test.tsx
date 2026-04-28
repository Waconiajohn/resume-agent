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
  InterviewView: ({
    onAnswer,
    onComplete,
  }: {
    onAnswer: (answer: string) => Promise<boolean>;
    onComplete: () => void;
  }) => (
    <div>
      <button type="button" onClick={() => { void onAnswer('Saved proof answer'); }}>
        Save answer
      </button>
      <button type="button" onClick={onComplete}>
        Finish interview
      </button>
    </div>
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
    version: 'career_profile_v2' as const,
    source: 'career_profile' as const,
    generated_at: '2026-04-07T00:00:00.000Z',
    targeting: {
      target_roles: ['VP Engineering'],
      target_industries: [],
      seniority: 'executive',
      transition_type: 'lateral',
      preferred_company_environments: [],
    },
    positioning: {
      core_strengths: [],
      proof_themes: [],
      differentiators: [],
      adjacent_positioning: [],
      positioning_statement: 'Operator to engineering leader',
      narrative_summary: '',
      leadership_scope: '',
      scope_of_responsibility: '',
    },
    narrative: {
      colleagues_came_for_what: 'Scales platforms and teams.',
      known_for_what: 'Engineering leader',
      why_not_me: '',
      story_snippet: '',
    },
    preferences: {
      must_haves: [],
      constraints: [],
      compensation_direction: '',
    },
    coaching: {
      financial_segment: 'ideal',
      emotional_state: 'confident',
      coaching_tone: 'direct',
      urgency_score: 5,
      recommended_starting_point: 'resume',
    },
    evidence_positioning_statements: [],
    profile_signals: {
      clarity: 'green' as const,
      alignment: 'green' as const,
      differentiation: 'green' as const,
    },
    completeness: {
      overall_score: 80,
      dashboard_state: 'strong' as const,
      sections: [],
    },
    profile_summary: '',
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

  it('does not advance profile setup locally when an interview answer fails to save', async () => {
    mockAnalyze.mockResolvedValue({
      session_id: 'profile-setup-session',
      intake: makeIntake(),
    });
    mockAnswer.mockResolvedValue(null);

    render(<ProfileSetupPage />);

    fireEvent.click(screen.getByRole('button', { name: /start setup/i }));
    fireEvent.click(await screen.findByRole('button', { name: /save answer/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not save that answer/i);
    });

    expect(mockAnswer).toHaveBeenCalledWith('profile-setup-session', 'Saved proof answer');
    expect(screen.getByRole('button', { name: /save answer/i })).toBeInTheDocument();
  });
});
