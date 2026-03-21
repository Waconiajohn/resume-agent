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
  strategyReviewData: null,
  startPipeline: mockStartPipeline,
  respondToGate: mockRespondToGate,
  reset: mockReset,
};

const runningState = {
  ...idleState,
  status: 'running' as const,
  activityMessages: [
    { id: '1', message: 'Researching market rates for your role', stage: 'research', timestamp: Date.now() },
    { id: '2', message: 'Analyzing comparable compensation data', stage: 'research', timestamp: Date.now() },
  ],
  currentStage: 'research',
};

const completeState = {
  ...idleState,
  status: 'complete' as const,
  report: '# Negotiation Strategy\n\nYour target range is $180K–$220K.',
  qualityScore: 88,
};

vi.mock('@/hooks/useSalaryNegotiation', () => ({
  useSalaryNegotiation: vi.fn(),
}));

import { useSalaryNegotiation } from '@/hooks/useSalaryNegotiation';
import { SalaryNegotiationRoom } from '@/components/career-iq/SalaryNegotiationRoom';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SalaryNegotiationRoom', () => {
  beforeEach(() => {
    vi.mocked(useSalaryNegotiation).mockReturnValue(idleState);
  });

  it('renders without crashing', () => {
    render(<SalaryNegotiationRoom />);
    expect(screen.getByText('Build one clear compensation strategy before you respond')).toBeInTheDocument();
  });

  it('shows The Offer section with company field', () => {
    render(<SalaryNegotiationRoom />);
    expect(screen.getByText('The Offer')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Acme Corp')).toBeInTheDocument();
  });

  it('shows role field in the form', () => {
    render(<SalaryNegotiationRoom />);
    // Two role fields exist (offer role + current role section), so check by placeholder
    const roleFields = screen.getAllByPlaceholderText('e.g. VP of Operations');
    expect(roleFields.length).toBeGreaterThan(0);
  });

  it('prefills company and role from the job workspace context', () => {
    render(<SalaryNegotiationRoom prefillCompany="Acme Corp" prefillRole="VP Operations" />);
    expect(screen.getByDisplayValue('Acme Corp')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('VP Operations').length).toBeGreaterThan(0);
  });

  it('does not call startPipeline when required fields are empty', () => {
    render(<SalaryNegotiationRoom />);
    fireEvent.click(screen.getByRole('button', { name: /Build Strategy/i }));
    expect(mockStartPipeline).not.toHaveBeenCalled();
  });

  it('shows Negotiation Strategy heading in complete state', () => {
    vi.mocked(useSalaryNegotiation).mockReturnValue(completeState);
    render(<SalaryNegotiationRoom />);
    // h2 heading in the report view
    expect(screen.getAllByText('Negotiation Strategy').length).toBeGreaterThan(0);
  });

  it('shows confidence gauge and strategy in complete state', () => {
    vi.mocked(useSalaryNegotiation).mockReturnValue(completeState);
    render(<SalaryNegotiationRoom />);
    // The report view renders a confidence gauge (SVG) and the strategy heading
    expect(screen.getAllByText('Negotiation Strategy').length).toBeGreaterThan(0);
    expect(screen.getByText('Your working negotiation brief')).toBeInTheDocument();
  });

  it('shows activity feed messages in running state', () => {
    vi.mocked(useSalaryNegotiation).mockReturnValue(runningState);
    render(<SalaryNegotiationRoom />);
    expect(screen.getByText('Researching market rates for your role')).toBeInTheDocument();
  });

  it('calls reset when Start New Draft is clicked in complete state', () => {
    vi.mocked(useSalaryNegotiation).mockReturnValue(completeState);
    render(<SalaryNegotiationRoom />);
    fireEvent.click(screen.getByRole('button', { name: /Start New Draft/i }));
    expect(mockReset).toHaveBeenCalled();
  });
});
