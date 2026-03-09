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

const idleState = {
  status: 'idle' as const,
  report: null,
  qualityScore: null,
  activityMessages: [],
  error: null,
  currentStage: null,
  startPipeline: mockStartPipeline,
  reset: mockReset,
};

const runningState = {
  ...idleState,
  status: 'running' as const,
  activityMessages: [
    { id: '1', message: 'Selecting your strongest achievements', stage: 'selection', timestamp: Date.now() },
    { id: '2', message: 'Drafting case study #1', stage: 'drafting', timestamp: Date.now() },
  ],
  currentStage: 'drafting',
};

const completeState = {
  ...idleState,
  status: 'complete' as const,
  report: '# Case Study Portfolio\n\n## Case Study 1: Supply Chain Transformation\n\nChallenge: ...',
  qualityScore: 85,
};

vi.mock('@/hooks/useCaseStudy', () => ({
  useCaseStudy: vi.fn(),
}));

import { useCaseStudy } from '@/hooks/useCaseStudy';
import { CaseStudyRoom } from '@/components/career-iq/CaseStudyRoom';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CaseStudyRoom', () => {
  beforeEach(() => {
    vi.mocked(useCaseStudy).mockReturnValue(idleState);
  });

  it('renders without crashing', () => {
    render(<CaseStudyRoom />);
    expect(screen.getByText('Case Study Generator')).toBeInTheDocument();
  });

  it('shows case study count slider in idle state', () => {
    render(<CaseStudyRoom />);
    expect(screen.getByText('Number of Case Studies')).toBeInTheDocument();
  });

  it('shows default count of 3 on the slider', () => {
    render(<CaseStudyRoom />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows descriptive text for the default count of 3', () => {
    render(<CaseStudyRoom />);
    expect(screen.getByText('3 consulting-grade case studies')).toBeInTheDocument();
  });

  it('has a generate button in idle state', () => {
    render(<CaseStudyRoom />);
    expect(screen.getByRole('button', { name: /Generate Case Studies/i })).toBeInTheDocument();
  });

  it('shows activity feed messages in running state', () => {
    vi.mocked(useCaseStudy).mockReturnValue(runningState);
    render(<CaseStudyRoom />);
    expect(screen.getByText('Selecting your strongest achievements')).toBeInTheDocument();
    expect(screen.getByText('Drafting case study #1')).toBeInTheDocument();
  });

  it('shows Case Study Portfolio heading in complete state', () => {
    vi.mocked(useCaseStudy).mockReturnValue(completeState);
    render(<CaseStudyRoom />);
    expect(screen.getAllByText('Case Study Portfolio').length).toBeGreaterThan(0);
  });

  it('calls reset when New Case Studies is clicked in complete state', () => {
    vi.mocked(useCaseStudy).mockReturnValue(completeState);
    render(<CaseStudyRoom />);
    fireEvent.click(screen.getByText('New Case Studies'));
    expect(mockReset).toHaveBeenCalled();
  });
});
