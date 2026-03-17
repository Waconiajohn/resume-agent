// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SessionHistoryTab } from '../SessionHistoryTab';
import type { CoachSession } from '@/types/session';
import type { FinalResume } from '@/types/resume';

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
    loading: false,
    onLoadSessions: vi.fn(),
    onResumeSession: vi.fn(),
    onDeleteSession: vi.fn().mockResolvedValue(true),
    onGetSessionResume: vi.fn().mockResolvedValue(makeFinalResume()),
    onGetSessionCoverLetter: vi.fn().mockResolvedValue({ letter: 'Hello there' }),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SessionHistoryTab', () => {
  it('renders company, role, date, and status for saved sessions', () => {
    render(<SessionHistoryTab {...makeProps()} />);

    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('VP Engineering')).toBeInTheDocument();
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);
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
});
