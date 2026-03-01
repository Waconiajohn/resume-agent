// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { DashboardScreen } from '../DashboardScreen';
import type { CoachSession } from '@/types/session';
import type { MasterResumeListItem } from '@/types/resume';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Prevent real rendering of complex child tabs that call APIs
vi.mock('../SessionHistoryTab', () => ({
  SessionHistoryTab: (props: Record<string, unknown>) => (
    <div data-testid="session-history-tab">
      SessionHistoryTab ({(props.sessions as unknown[]).length} sessions)
    </div>
  ),
}));

vi.mock('../MasterResumeTab', () => ({
  MasterResumeTab: () => <div data-testid="master-resume-tab">MasterResumeTab</div>,
}));

vi.mock('../EvidenceLibraryTab', () => ({
  EvidenceLibraryTab: () => <div data-testid="evidence-library-tab">EvidenceLibraryTab</div>,
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<CoachSession> = {}): CoachSession {
  return {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    status: 'active',
    current_phase: 'onboarding',
    master_resume_id: null,
    job_application_id: null,
    pipeline_status: 'complete',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

function makeResume(overrides: Partial<MasterResumeListItem> = {}): MasterResumeListItem {
  return {
    id: 'resume-id-1',
    summary: 'Experienced engineer',
    version: 1,
    is_default: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    accessToken: 'test-token',
    sessions: [makeSession()],
    resumes: [makeResume()],
    onLoadSessions: vi.fn(),
    onLoadResumes: vi.fn(),
    onResumeSession: vi.fn(),
    onDeleteSession: vi.fn().mockResolvedValue(true),
    onGetSessionResume: vi.fn().mockResolvedValue(null),
    onGetDefaultResume: vi.fn().mockResolvedValue(null),
    onGetResumeById: vi.fn().mockResolvedValue(null),
    onUpdateMasterResume: vi.fn().mockResolvedValue(null),
    onGetResumeHistory: vi.fn().mockResolvedValue([]),
    onSetDefaultResume: vi.fn().mockResolvedValue(true),
    onDeleteResume: vi.fn().mockResolvedValue(true),
    loading: false,
    resumesLoading: false,
    error: null,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DashboardScreen', () => {
  it('renders with 3 tabs', () => {
    render(<DashboardScreen {...makeProps()} />);
    expect(screen.getByRole('button', { name: /session history/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /master resume/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /evidence library/i })).toBeInTheDocument();
  });

  it('shows Session History tab content by default', () => {
    render(<DashboardScreen {...makeProps()} />);
    expect(screen.getByTestId('session-history-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('master-resume-tab')).not.toBeInTheDocument();
    expect(screen.queryByTestId('evidence-library-tab')).not.toBeInTheDocument();
  });

  it('switches to Master Resume tab on click', async () => {
    render(<DashboardScreen {...makeProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /master resume/i }));
    await waitFor(() => {
      expect(screen.getByTestId('master-resume-tab')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('session-history-tab')).not.toBeInTheDocument();
  });

  it('switches to Evidence Library tab on click', async () => {
    render(<DashboardScreen {...makeProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /evidence library/i }));
    await waitFor(() => {
      expect(screen.getByTestId('evidence-library-tab')).toBeInTheDocument();
    });
  });

  it('switches back to Session History from another tab', async () => {
    render(<DashboardScreen {...makeProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /master resume/i }));
    fireEvent.click(screen.getByRole('button', { name: /session history/i }));
    await waitFor(() => {
      expect(screen.getByTestId('session-history-tab')).toBeInTheDocument();
    });
  });

  it('calls onLoadSessions and onLoadResumes on mount', () => {
    const onLoadSessions = vi.fn();
    const onLoadResumes = vi.fn();
    render(<DashboardScreen {...makeProps({ onLoadSessions, onLoadResumes })} />);
    expect(onLoadSessions).toHaveBeenCalledOnce();
    expect(onLoadResumes).toHaveBeenCalledOnce();
  });

  it('renders dashboard heading', () => {
    render(<DashboardScreen {...makeProps()} />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('displays error message when error prop is set', () => {
    render(<DashboardScreen {...makeProps({ error: 'Something went wrong' })} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('passes sessions to SessionHistoryTab', () => {
    const sessions = [makeSession(), makeSession({ id: 'session-2' })];
    render(<DashboardScreen {...makeProps({ sessions })} />);
    expect(screen.getByText(/2 sessions/i)).toBeInTheDocument();
  });

  it('does not display error banner when error is null', () => {
    const { container } = render(<DashboardScreen {...makeProps({ error: null })} />);
    const errorBanners = container.querySelectorAll('[class*="red"]');
    // Error banner should not be visible
    for (const banner of errorBanners) {
      expect(banner.textContent).toBe('');
    }
  });
});
