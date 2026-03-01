// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ResumeComparisonModal } from '../ResumeComparisonModal';
import type { CoachSession } from '@/types/session';
import type { FinalResume } from '@/types/resume';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../ComparisonSectionBlock', () => ({
  ComparisonSectionBlock: ({
    title,
    leftContent,
    rightContent,
  }: {
    title: string;
    leftContent: string | null;
    rightContent: string | null;
  }) => (
    <div data-testid="comparison-section-block" data-title={title}>
      <span>{leftContent ?? '(empty)'}</span>
      <span>{rightContent ?? '(empty)'}</span>
    </div>
  ),
}));

vi.mock('@/lib/export', () => ({
  resumeToText: vi.fn().mockImplementation((resume: FinalResume) => resume.summary ?? ''),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SESSION_ID_1 = 'f47ac10b-58cc-4372-a567-0e02b2c3d401';
const SESSION_ID_2 = 'f47ac10b-58cc-4372-a567-0e02b2c3d402';

function makeSession(id: string, overrides: Partial<CoachSession> = {}): CoachSession {
  return {
    id,
    status: 'active',
    current_phase: 'onboarding',
    master_resume_id: null,
    job_application_id: null,
    pipeline_status: 'complete',
    company_name: `Company for ${id.slice(-4)}`,
    job_title: 'VP Engineering',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

function makeFinalResume(summary: string): FinalResume {
  return {
    summary,
    experience: [
      {
        company: 'Acme Corp',
        title: 'VP Engineering',
        start_date: 'Jan 2020',
        end_date: 'Present',
        location: 'SF',
        bullets: [{ text: 'Led team', source: 'crafted' }],
      },
    ],
    skills: { 'Leadership': ['Strategy'] },
    education: [{ degree: 'BS', field: 'CS', institution: 'MIT', year: '2005' }],
    certifications: [],
    ats_score: 85,
  };
}

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    sessionIds: [SESSION_ID_1, SESSION_ID_2] as [string, string],
    onClose: vi.fn(),
    onGetSessionResume: vi.fn().mockResolvedValue(makeFinalResume('Summary from session')),
    sessions: [makeSession(SESSION_ID_1), makeSession(SESSION_ID_2)],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ResumeComparisonModal', () => {
  it('shows loading state while fetching resumes', () => {
    const neverResolve = vi.fn().mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <ResumeComparisonModal {...makeProps({ onGetSessionResume: neverResolve })} />,
    );
    const spinner = container.querySelector('[class*="animate-spin"]');
    expect(spinner).toBeInTheDocument();
  });

  it('renders comparison sections after both resumes load', async () => {
    render(<ResumeComparisonModal {...makeProps()} />);
    await waitFor(() => {
      const blocks = screen.getAllByTestId('comparison-section-block');
      expect(blocks.length).toBeGreaterThan(0);
    });
  });

  it('renders column headers with session labels', async () => {
    render(<ResumeComparisonModal {...makeProps()} />);
    // Column headers show company_name from sessions
    await waitFor(() => {
      expect(screen.getByText(/d401/i)).toBeInTheDocument();
    });
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(<ResumeComparisonModal {...makeProps({ onClose })} />);
    await waitFor(() => screen.getByRole('button', { name: /close/i }));
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows error message when resume fetch fails', async () => {
    const onGetSessionResume = vi.fn().mockRejectedValue(new Error('Network error'));
    render(<ResumeComparisonModal {...makeProps({ onGetSessionResume })} />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load resumes/i)).toBeInTheDocument();
    });
  });

  it('shows empty state when both resumes are null', async () => {
    const onGetSessionResume = vi.fn().mockResolvedValue(null);
    render(<ResumeComparisonModal {...makeProps({ onGetSessionResume })} />);
    await waitFor(() => {
      expect(screen.getByText(/no resumes found/i)).toBeInTheDocument();
    });
  });

  it('calls onGetSessionResume for both session IDs', async () => {
    const onGetSessionResume = vi.fn().mockResolvedValue(makeFinalResume('Test'));
    render(<ResumeComparisonModal {...makeProps({ onGetSessionResume })} />);
    await waitFor(() => {
      expect(onGetSessionResume).toHaveBeenCalledTimes(2);
      expect(onGetSessionResume).toHaveBeenCalledWith(SESSION_ID_1);
      expect(onGetSessionResume).toHaveBeenCalledWith(SESSION_ID_2);
    });
  });

  it('renders the comparison modal title', async () => {
    render(<ResumeComparisonModal {...makeProps()} />);
    expect(screen.getByText(/resume comparison/i)).toBeInTheDocument();
  });
});
