// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// --- Global jsdom patch ---
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// --- Mocks ---

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

const mockStartPipeline = vi.fn().mockResolvedValue(true);
const mockReset = vi.fn();
const mockRespondToGate = vi.fn().mockResolvedValue(true);

const idleState = {
  status: 'idle' as const,
  report: null,
  qualityScore: null,
  activityMessages: [],
  error: null,
  currentStage: null,
  noteReviewData: null,
  pendingGate: null,
  startPipeline: mockStartPipeline,
  respondToGate: mockRespondToGate,
  reset: mockReset,
};

const runningState = {
  ...idleState,
  status: 'running' as const,
  activityMessages: [
    { id: '1', message: 'Drafting email note for Sarah Chen', stage: 'drafting', timestamp: Date.now() },
    { id: '2', message: 'Quality checked note for Sarah Chen — score: 91', stage: 'quality', timestamp: Date.now() },
  ],
  currentStage: 'drafting',
};

const completeState = {
  ...idleState,
  status: 'complete' as const,
  report: '# Thank You Notes\n\n## Sarah Chen — VP Engineering\n\nDear Sarah, Thank you for taking the time...',
  qualityScore: 91,
};

vi.mock('@/hooks/useThankYouNote', () => ({
  useThankYouNote: vi.fn(),
}));

import { useThankYouNote } from '@/hooks/useThankYouNote';
import { ThankYouNoteRoom } from '@/components/career-iq/ThankYouNoteRoom';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ThankYouNoteRoom', () => {
  beforeEach(() => {
    vi.mocked(useThankYouNote).mockReturnValue(idleState);
  });

  it('renders without crashing', () => {
    render(<ThankYouNoteRoom />);
    expect(screen.getByText('Thank You Note Writer')).toBeInTheDocument();
  });

  it('shows interview details section with company and role fields', () => {
    render(<ThankYouNoteRoom />);
    expect(screen.getByText('Interview Details')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Medtronic')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. VP of Supply Chain')).toBeInTheDocument();
  });

  it('prefills company and role when opened from Interview Lab job context', () => {
    render(<ThankYouNoteRoom initialCompany="Acme Corp" initialRole="VP Engineering" />);
    expect(screen.getByDisplayValue('Acme Corp')).toBeInTheDocument();
    expect(screen.getByDisplayValue('VP Engineering')).toBeInTheDocument();
  });

  it('shows interviewers section with one card by default', () => {
    render(<ThankYouNoteRoom />);
    expect(screen.getByText('Interviewers')).toBeInTheDocument();
    expect(screen.getByText('Interviewer 1')).toBeInTheDocument();
  });

  it('adds a second interviewer card when add button is clicked', () => {
    render(<ThankYouNoteRoom />);
    fireEvent.click(screen.getByText('Add interviewer'));
    expect(screen.getByText('Interviewer 2')).toBeInTheDocument();
  });

  it('does not call startPipeline when required fields are empty', () => {
    render(<ThankYouNoteRoom />);
    fireEvent.click(screen.getByText('Generate Notes'));
    expect(mockStartPipeline).not.toHaveBeenCalled();
  });

  it('shows activity feed messages in running state', () => {
    vi.mocked(useThankYouNote).mockReturnValue(runningState);
    render(<ThankYouNoteRoom />);
    expect(screen.getByText('Drafting email note for Sarah Chen')).toBeInTheDocument();
  });

  it('shows report with quality score in complete state', () => {
    vi.mocked(useThankYouNote).mockReturnValue(completeState);
    render(<ThankYouNoteRoom />);
    // Quality badge is present
    expect(screen.getByText('Quality 91%')).toBeInTheDocument();
    // Copy button is present
    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('calls reset when Write more notes is clicked in complete state', () => {
    vi.mocked(useThankYouNote).mockReturnValue(completeState);
    render(<ThankYouNoteRoom />);
    fireEvent.click(screen.getByText('Write more notes'));
    expect(mockReset).toHaveBeenCalled();
  });
});
