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
  stakeholderReviewData: null,
  pendingGate: null,
  startPipeline: mockStartPipeline,
  respondToGate: mockRespondToGate,
  reset: mockReset,
};

const runningState = {
  ...idleState,
  status: 'running' as const,
  activityMessages: [
    { id: '1', message: 'Researching the role and company context', stage: 'research', timestamp: Date.now() },
    { id: '2', message: 'Mapping key stakeholders', stage: 'stakeholders', timestamp: Date.now() },
  ],
  currentStage: 'stakeholders',
};

const completeState = {
  ...idleState,
  status: 'complete' as const,
  report: '# 90-Day Success Plan\n\n## Days 1–30: Listen & Learn\n\nPriority: build trust, understand the landscape.',
  qualityScore: 90,
};

vi.mock('@/hooks/useNinetyDayPlan', () => ({
  useNinetyDayPlan: vi.fn(),
}));

import { useNinetyDayPlan } from '@/hooks/useNinetyDayPlan';
import { NinetyDayPlanRoom } from '@/components/career-iq/NinetyDayPlanRoom';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NinetyDayPlanRoom', () => {
  beforeEach(() => {
    vi.mocked(useNinetyDayPlan).mockReturnValue(idleState);
  });

  it('renders without crashing', () => {
    render(<NinetyDayPlanRoom />);
    expect(screen.getByText('90-Day Plan Generator')).toBeInTheDocument();
  });

  it('shows the three phase overview pills', () => {
    render(<NinetyDayPlanRoom />);
    expect(screen.getByText('Days 1–30')).toBeInTheDocument();
    expect(screen.getByText('Days 31–60')).toBeInTheDocument();
    expect(screen.getByText('Days 61–90')).toBeInTheDocument();
  });

  it('shows required role and company fields', () => {
    render(<NinetyDayPlanRoom />);
    expect(screen.getByPlaceholderText('e.g. VP of Supply Chain Operations')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Medtronic')).toBeInTheDocument();
  });

  it('does not call startPipeline when required fields are empty', () => {
    render(<NinetyDayPlanRoom />);
    fireEvent.click(screen.getByText('Generate Plan'));
    expect(mockStartPipeline).not.toHaveBeenCalled();
  });

  it('shows "What you will get" section in idle state', () => {
    render(<NinetyDayPlanRoom />);
    expect(screen.getByText('What you will get')).toBeInTheDocument();
    expect(screen.getByText('Quick wins for the first 30 days')).toBeInTheDocument();
  });

  it('shows activity feed messages in running state', () => {
    vi.mocked(useNinetyDayPlan).mockReturnValue(runningState);
    render(<NinetyDayPlanRoom />);
    expect(screen.getByText('Researching the role and company context')).toBeInTheDocument();
    expect(screen.getByText('Mapping key stakeholders')).toBeInTheDocument();
  });

  it('shows 90-Day Success Plan report in complete state', () => {
    vi.mocked(useNinetyDayPlan).mockReturnValue(completeState);
    render(<NinetyDayPlanRoom />);
    expect(screen.getAllByText('90-Day Success Plan').length).toBeGreaterThan(0);
    expect(screen.getByText('Quality 90%')).toBeInTheDocument();
  });

  it('calls reset when Build another plan is clicked in complete state', () => {
    vi.mocked(useNinetyDayPlan).mockReturnValue(completeState);
    render(<NinetyDayPlanRoom />);
    fireEvent.click(screen.getByText('Build another plan'));
    expect(mockReset).toHaveBeenCalled();
  });
});
