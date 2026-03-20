// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SessionHistoryTab } from '../SessionHistoryTab';
import type { CoachSession } from '@/types/session';
import type { FinalResume } from '@/types/resume';
import type { Application } from '@/hooks/useApplicationPipeline';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

vi.mock('../SessionResumeModal', () => ({
  SessionResumeModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="session-resume-modal">
      <button onClick={onClose}>Close Resume Modal</button>
    </div>
  ),
}));

vi.mock('../SessionCoverLetterModal', () => ({
  SessionCoverLetterModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="session-cover-letter-modal">
      <button onClick={onClose}>Close Cover Letter Modal</button>
    </div>
  ),
}));

function makeSession(overrides: Partial<CoachSession> = {}): CoachSession {
  return {
    id: 'session-1',
    status: 'active',
    current_phase: 'onboarding',
    master_resume_id: null,
    job_application_id: null,
    pipeline_status: 'complete',
    product_type: 'resume_v2',
    company_name: 'Acme Corp',
    job_title: 'VP Engineering',
    job_stage: 'applied',
    created_at: '2026-01-01T12:00:00Z',
    updated_at: '2026-01-02T12:00:00Z',
    ...overrides,
  };
}

function makeFinalResume(): FinalResume {
  return {
    summary: 'Experienced VP',
    experience: [],
    skills: {},
    education: [],
    certifications: [],
    ats_score: 85,
  };
}

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    sessions: [makeSession()],
    jobApplications: [],
    loading: false,
    onLoadSessions: vi.fn(),
    onResumeSession: vi.fn(),
    onMoveJobStage: vi.fn().mockResolvedValue(true),
    onDeleteSession: vi.fn().mockResolvedValue(true),
    onGetSessionResume: vi.fn().mockResolvedValue(makeFinalResume()),
    onGetSessionCoverLetter: vi.fn().mockResolvedValue({ letter: 'Hello there' }),
    ...overrides,
  };
}

function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: 'job-app-1',
    role_title: 'VP Engineering',
    company_name: 'Acme Corp',
    stage: 'interviewing',
    source: 'manual',
    stage_history: [{ stage: 'interviewing', at: '2026-01-02T12:00:00Z' }],
    created_at: '2026-01-01T12:00:00Z',
    updated_at: '2026-01-02T12:00:00Z',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SessionHistoryTab', () => {
  it('renders company, role, date, and stage-aware status for saved sessions', () => {
    render(<SessionHistoryTab {...makeProps()} />);

    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('VP Engineering')).toBeInTheDocument();
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);
    expect(screen.getByText('Applied')).toBeInTheDocument();
    expect(screen.getByText('Jan 1, 2026')).toBeInTheDocument();
  });

  it('shows an empty state when there are no saved sessions', () => {
    render(<SessionHistoryTab {...makeProps({ sessions: [] })} />);
    expect(screen.getByText(/no saved tailored work found/i)).toBeInTheDocument();
  });

  it('shows loading rows when loading is true', () => {
    const { container } = render(<SessionHistoryTab {...makeProps({ sessions: [], loading: true })} />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('calls onLoadSessions with the selected status filter', async () => {
    const onLoadSessions = vi.fn();
    render(<SessionHistoryTab {...makeProps({ onLoadSessions })} />);

    fireEvent.click(screen.getByRole('button', { name: /completed/i }));

    await waitFor(() => {
      expect(onLoadSessions).toHaveBeenLastCalledWith({ status: 'complete' });
    });
  });

  it('shows the asset type filter when multiple supported product types exist', () => {
    render(
      <SessionHistoryTab
        {...makeProps({
          sessions: [
            makeSession({ id: 'resume-1', product_type: 'resume_v2' }),
            makeSession({ id: 'letter-1', product_type: 'cover_letter', company_name: 'Beta Co', job_title: 'Director' }),
          ],
        })}
      />,
    );

    expect(screen.getByRole('combobox', { name: /filter by asset type/i })).toBeInTheDocument();
  });

  it('filters rows by selected asset type', () => {
    render(
      <SessionHistoryTab
        {...makeProps({
          sessions: [
            makeSession({ id: 'resume-1', product_type: 'resume_v2' }),
            makeSession({ id: 'letter-1', product_type: 'cover_letter', company_name: 'Beta Co', job_title: 'Director' }),
          ],
        })}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: /filter by asset type/i }), {
      target: { value: 'cover_letter' },
    });

    expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();
    expect(screen.getByText('Beta Co')).toBeInTheDocument();
  });

  it('opens the resume modal from a resume row', async () => {
    render(<SessionHistoryTab {...makeProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /view resume/i }));

    await waitFor(() => {
      expect(screen.getByTestId('session-resume-modal')).toBeInTheDocument();
    });
  });

  it('opens the cover letter modal for a cover letter row', async () => {
    render(
      <SessionHistoryTab
        {...makeProps({
          sessions: [
            makeSession({ id: 'letter-1', product_type: 'cover_letter', company_name: 'Beta Co', job_title: 'Director' }),
          ],
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /view letter/i }));

    await waitFor(() => {
      expect(screen.getByTestId('session-cover-letter-modal')).toBeInTheDocument();
    });
  });

  it('calls onResumeSession when Open is clicked', () => {
    const onResumeSession = vi.fn();
    render(<SessionHistoryTab {...makeProps({ onResumeSession })} />);

    fireEvent.click(screen.getByRole('button', { name: /^open$/i }));

    expect(onResumeSession).toHaveBeenCalledWith('session-1');
  });

  it('groups assets by company, role, and day into one job record', () => {
    const onResumeSession = vi.fn();
    render(
      <SessionHistoryTab
        {...makeProps({
          onResumeSession,
          sessions: [
            makeSession({
              id: 'resume-1',
              product_type: 'resume_v2',
              company_name: 'Acme Corp',
              job_title: 'VP Engineering',
              created_at: '2026-01-01T12:00:00Z',
              updated_at: '2026-01-01T13:00:00Z',
            }),
            makeSession({
              id: 'letter-1',
              product_type: 'cover_letter',
              company_name: 'Acme Corp',
              job_title: 'VP Engineering',
              created_at: '2026-01-01T15:00:00Z',
              updated_at: '2026-01-01T16:00:00Z',
            }),
          ],
        })}
      />,
    );

    expect(screen.getByText('Job workspace')).toBeInTheDocument();
    expect(screen.getAllByText('Acme Corp')).toHaveLength(1);
    expect(screen.getByText('Resume')).toBeInTheDocument();
    expect(screen.getAllByText('Cover Letter').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /^open$/i }));

    expect(onResumeSession).toHaveBeenCalledWith('resume-1');
  });

  it('shows interview assets only when the job stage reaches interviewing', () => {
    render(
      <SessionHistoryTab
        {...makeProps({
          sessions: [
            makeSession({
              id: 'resume-1',
              product_type: 'resume_v2',
              job_stage: 'interviewing',
            }),
          ],
        })}
      />,
    );

    expect(screen.getByText(/Available now: Interview Prep/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open Interview Prep/i })).toBeInTheDocument();
    expect(screen.getByText(/30-60-90 Day Plan/i)).toBeInTheDocument();
  });

  it('opens a job workspace panel with stage controls and stage-aware actions', () => {
    const onMoveJobStage = vi.fn().mockResolvedValue(true);
    render(
      <SessionHistoryTab
        {...makeProps({
          onMoveJobStage,
          sessions: [
            makeSession({
              id: 'resume-1',
              product_type: 'resume_v2',
              job_application_id: 'job-app-1',
              job_stage: 'interviewing',
            }),
          ],
          jobApplications: [
            makeApplication({
              id: 'job-app-1',
              next_action: 'Run interview prep and tighten the 30-60-90 story.',
            }),
          ],
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /view workspace/i }));

    expect(screen.getByText('Stage control')).toBeInTheDocument();
    expect(screen.getByText(/Run interview prep and tighten the 30-60-90 story\./i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Open Interview Prep/i }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Offer' }));

    expect(onMoveJobStage).toHaveBeenCalledWith('job-app-1', 'offer');
  });

  it('can open a first-class job workspace screen for linked applications', () => {
    const onNavigate = vi.fn();
    render(
      <SessionHistoryTab
        {...makeProps({
          onNavigate,
          sessions: [
            makeSession({
              id: 'resume-1',
              product_type: 'resume_v2',
              job_application_id: 'job-app-1',
              job_stage: 'interviewing',
            }),
          ],
          jobApplications: [makeApplication({ id: 'job-app-1' })],
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /full page/i }));

    expect(onNavigate).toHaveBeenCalledWith('/workspace/job/job-app-1');
  });

  it('shows later-stage assets inside the job workspace when they are linked to the same job application', () => {
    const onNavigate = vi.fn();
    render(
      <SessionHistoryTab
        {...makeProps({
          onNavigate,
          sessions: [
            makeSession({
              id: 'resume-1',
              product_type: 'resume_v2',
              job_application_id: 'job-app-1',
              job_stage: 'offer',
            }),
            makeSession({
              id: 'prep-1',
              product_type: 'interview_prep',
              job_application_id: 'job-app-1',
              job_stage: 'offer',
            }),
            makeSession({
              id: 'note-1',
              product_type: 'thank_you_note',
              job_application_id: 'job-app-1',
              job_stage: 'offer',
            }),
            makeSession({
              id: 'plan-1',
              product_type: 'ninety_day_plan',
              job_application_id: 'job-app-1',
              job_stage: 'offer',
            }),
            makeSession({
              id: 'nego-1',
              product_type: 'salary_negotiation',
              job_application_id: 'job-app-1',
              job_stage: 'offer',
            }),
          ],
          jobApplications: [makeApplication({ id: 'job-app-1', stage: 'offer' })],
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /view workspace/i }));

    expect(screen.getAllByText('Interview Prep').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Thank You Note').length).toBeGreaterThan(0);
    expect(screen.getAllByText('30-60-90 Plan').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Salary Negotiation').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: /review saved strategy/i })[0]);

    expect(onNavigate).toHaveBeenCalledWith('/workspace?room=interview&job=job-app-1&company=Acme+Corp&role=VP+Engineering&focus=negotiation&session=nego-1');
  });
});
