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
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
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
  bioReviewData: null,
  pendingGate: null,
  startPipeline: mockStartPipeline,
  respondToGate: mockRespondToGate,
  reset: mockReset,
};

const runningState = {
  ...idleState,
  status: 'running' as const,
  activityMessages: [
    { id: '1', message: 'Analyzing your professional background', stage: 'analysis', timestamp: Date.now() },
    { id: '2', message: 'Drafting speaker bio', stage: 'drafting', timestamp: Date.now() },
  ],
  currentStage: 'drafting',
};

const completeState = {
  ...idleState,
  status: 'complete' as const,
  report: '# Executive Bio Collection\n\n## Speaker Bio\n\nJohn is a seasoned executive...',
  qualityScore: 92,
};

vi.mock('@/hooks/useExecutiveBio', () => ({
  useExecutiveBio: vi.fn(),
}));

import { useExecutiveBio } from '@/hooks/useExecutiveBio';
import { ExecutiveBioRoom } from '@/components/career-iq/ExecutiveBioRoom';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ExecutiveBioRoom', () => {
  beforeEach(() => {
    vi.mocked(useExecutiveBio).mockReturnValue(idleState);
  });

  it('renders without crashing', () => {
    render(<ExecutiveBioRoom />);
    expect(screen.getByText('Executive Bio Suite')).toBeInTheDocument();
  });

  it('shows format selector with all 5 format options', () => {
    render(<ExecutiveBioRoom />);
    expect(screen.getByText('Speaker')).toBeInTheDocument();
    expect(screen.getByText('Board')).toBeInTheDocument();
    expect(screen.getByText('Advisory')).toBeInTheDocument();
    expect(screen.getByText('Professional')).toBeInTheDocument();
    expect(screen.getByText('LinkedIn')).toBeInTheDocument();
  });

  it('shows length selector options', () => {
    render(<ExecutiveBioRoom />);
    expect(screen.getByText('Short')).toBeInTheDocument();
    expect(screen.getByText('Long')).toBeInTheDocument();
  });

  it('has a generate button present in idle state', () => {
    render(<ExecutiveBioRoom />);
    expect(screen.getByRole('button', { name: /Generate Bio Suite/i })).toBeInTheDocument();
  });

  it('shows activity feed messages in running state', () => {
    vi.mocked(useExecutiveBio).mockReturnValue(runningState);
    render(<ExecutiveBioRoom />);
    expect(screen.getByText('Analyzing your professional background')).toBeInTheDocument();
    expect(screen.getByText('Drafting speaker bio')).toBeInTheDocument();
  });

  it('shows Executive Bio Collection heading in complete state', () => {
    vi.mocked(useExecutiveBio).mockReturnValue(completeState);
    render(<ExecutiveBioRoom />);
    expect(screen.getAllByText('Executive Bio Collection').length).toBeGreaterThan(0);
  });

  it('shows quality score in complete state', () => {
    vi.mocked(useExecutiveBio).mockReturnValue(completeState);
    render(<ExecutiveBioRoom />);
    expect(screen.getByText('Quality 92%')).toBeInTheDocument();
  });

  it('calls reset when New Bios is clicked in complete state', () => {
    vi.mocked(useExecutiveBio).mockReturnValue(completeState);
    render(<ExecutiveBioRoom />);
    fireEvent.click(screen.getByText('New Bios'));
    expect(mockReset).toHaveBeenCalled();
  });
});
