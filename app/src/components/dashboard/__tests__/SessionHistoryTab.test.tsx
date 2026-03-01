// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { SessionHistoryTab } from '../SessionHistoryTab';
import type { CoachSession } from '@/types/session';
import type { FinalResume } from '@/types/resume';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Prevent modals from rendering actual complex content
vi.mock('../SessionResumeModal', () => ({
  SessionResumeModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="session-resume-modal">
      <button onClick={onClose}>Close Modal</button>
    </div>
  ),
}));

vi.mock('../ResumeComparisonModal', () => ({
  ResumeComparisonModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="resume-comparison-modal">
      <button onClick={onClose}>Close Comparison</button>
    </div>
  ),
}));

vi.mock('../DashboardSessionCard', () => ({
  DashboardSessionCard: ({
    session,
    onResume,
    onDelete,
    onViewResume,
    isSelected,
    onToggleSelect,
    showSelectCheckbox,
  }: {
    session: CoachSession;
    onResume: (id: string) => void;
    onDelete: (id: string) => void;
    onViewResume: (id: string) => void;
    isSelected?: boolean;
    onToggleSelect?: (id: string) => void;
    showSelectCheckbox?: boolean;
  }) => (
    <div data-testid={`session-card-${session.id}`} data-selected={isSelected}>
      <span>{session.company_name ?? 'Untitled'}</span>
      <button onClick={() => onResume(session.id)}>Resume</button>
      <button onClick={() => onDelete(session.id)}>Delete</button>
      <button onClick={() => onViewResume(session.id)}>View Resume</button>
      {showSelectCheckbox && (
        <button onClick={() => onToggleSelect?.(session.id)}>Select</button>
      )}
    </div>
  ),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<CoachSession> = {}): CoachSession {
  return {
    id: 'session-1',
    status: 'active',
    current_phase: 'onboarding',
    master_resume_id: null,
    job_application_id: null,
    pipeline_status: 'complete',
    company_name: 'Acme Corp',
    job_title: 'VP Engineering',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
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
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SessionHistoryTab', () => {
  it('renders session cards for provided sessions', () => {
    render(<SessionHistoryTab {...makeProps()} />);
    expect(screen.getByTestId('session-card-session-1')).toBeInTheDocument();
  });

  it('renders multiple session cards', () => {
    const sessions = [
      makeSession({ id: 'session-1' }),
      makeSession({ id: 'session-2', company_name: 'Beta Ltd' }),
    ];
    render(<SessionHistoryTab {...makeProps({ sessions })} />);
    expect(screen.getByTestId('session-card-session-1')).toBeInTheDocument();
    expect(screen.getByTestId('session-card-session-2')).toBeInTheDocument();
  });

  it('shows loading skeleton when loading is true', () => {
    render(<SessionHistoryTab {...makeProps({ sessions: [], loading: true })} />);
    // Loading skeleton renders animated pulse divs, no session cards
    expect(screen.queryByTestId('session-card-session-1')).not.toBeInTheDocument();
    // Look for the skeleton pulse elements
    const { container } = render(<SessionHistoryTab {...makeProps({ sessions: [], loading: true })} />);
    const pulseElements = container.querySelectorAll('[class*="animate-pulse"]');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('shows empty state when no sessions and not loading', () => {
    render(<SessionHistoryTab {...makeProps({ sessions: [] })} />);
    expect(screen.getByText(/no sessions found/i)).toBeInTheDocument();
  });

  it('shows filter buttons for All, Completed, In Progress, Error', () => {
    render(<SessionHistoryTab {...makeProps()} />);
    expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /completed/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /in progress/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /error/i })).toBeInTheDocument();
  });

  it('calls onLoadSessions with status filter when filter changes', async () => {
    const onLoadSessions = vi.fn();
    render(<SessionHistoryTab {...makeProps({ onLoadSessions })} />);
    fireEvent.click(screen.getByRole('button', { name: /completed/i }));
    await waitFor(() => {
      expect(onLoadSessions).toHaveBeenCalledWith({ status: 'complete' });
    });
  });

  it('calls onLoadSessions without filter when All is selected', async () => {
    const onLoadSessions = vi.fn();
    render(<SessionHistoryTab {...makeProps({ onLoadSessions })} />);
    // First click a non-all filter, then all
    fireEvent.click(screen.getByRole('button', { name: /completed/i }));
    fireEvent.click(screen.getByRole('button', { name: /all/i }));
    await waitFor(() => {
      // Last call should be without filter
      const calls = onLoadSessions.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).toBeUndefined();
    });
  });

  it('shows compare button when two complete sessions are selected', async () => {
    const sessions = [
      makeSession({ id: 'session-1', pipeline_status: 'complete' }),
      makeSession({ id: 'session-2', pipeline_status: 'complete', company_name: 'Beta Ltd' }),
    ];
    render(<SessionHistoryTab {...makeProps({ sessions })} />);

    fireEvent.click(screen.getAllByRole('button', { name: /select/i })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /select/i })[1]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /compare selected/i })).toBeInTheDocument();
    });
  });

  it('shows comparison modal when Compare Selected is clicked', async () => {
    const sessions = [
      makeSession({ id: 'session-1', pipeline_status: 'complete' }),
      makeSession({ id: 'session-2', pipeline_status: 'complete', company_name: 'Beta Ltd' }),
    ];
    render(<SessionHistoryTab {...makeProps({ sessions })} />);

    fireEvent.click(screen.getAllByRole('button', { name: /select/i })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /select/i })[1]);
    await waitFor(() => screen.getByRole('button', { name: /compare selected/i }));
    fireEvent.click(screen.getByRole('button', { name: /compare selected/i }));

    await waitFor(() => {
      expect(screen.getByTestId('resume-comparison-modal')).toBeInTheDocument();
    });
  });
});
