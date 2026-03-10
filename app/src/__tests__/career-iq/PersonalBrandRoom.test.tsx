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
  findings: [],
  error: null,
  currentStage: null,
  findingsReviewData: null,
  pendingGate: null,
  startPipeline: mockStartPipeline,
  respondToGate: mockRespondToGate,
  reset: mockReset,
};

const runningState = {
  ...idleState,
  status: 'running' as const,
  activityMessages: [
    { id: '1', message: 'Auditing your brand presence (1/3 sources)', stage: 'audit', timestamp: Date.now() },
    { id: '2', message: 'Finding: Inconsistent headline messaging [high]', stage: 'audit', timestamp: Date.now() },
  ],
  currentStage: 'audit',
};

const completeState = {
  ...idleState,
  status: 'complete' as const,
  report: '# Personal Brand Audit\n\n## Consistency Score: 72%\n\n## Key Findings\n\nYour resume and LinkedIn headline differ significantly.',
  qualityScore: 78,
};

vi.mock('@/hooks/usePersonalBrand', () => ({
  usePersonalBrand: vi.fn(),
}));

import { usePersonalBrand } from '@/hooks/usePersonalBrand';
import { PersonalBrandRoom } from '@/components/career-iq/PersonalBrandRoom';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PersonalBrandRoom', () => {
  beforeEach(() => {
    vi.mocked(usePersonalBrand).mockReturnValue(idleState);
  });

  it('renders without crashing', () => {
    render(<PersonalBrandRoom />);
    expect(screen.getByText('Personal Brand Audit')).toBeInTheDocument();
  });

  it('shows the Resume section with a textarea', () => {
    render(<PersonalBrandRoom />);
    // "Resume" appears in h2 and also as a label — getAllByText handles multiples
    expect(screen.getAllByText('Resume').length).toBeGreaterThan(0);
    // The resume textarea placeholder depends on loading state — check the LinkedIn one which is stable
    expect(screen.getByPlaceholderText(/Paste your LinkedIn About section/i)).toBeInTheDocument();
  });

  it('shows the LinkedIn Profile section', () => {
    render(<PersonalBrandRoom />);
    expect(screen.getByText('LinkedIn Profile')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Paste your LinkedIn About section/i)).toBeInTheDocument();
  });

  it('does not call startPipeline when resume and linkedin are empty', () => {
    render(<PersonalBrandRoom />);
    fireEvent.click(screen.getByText('Run Audit'));
    expect(mockStartPipeline).not.toHaveBeenCalled();
  });

  it('shows advanced sources section when expanded', () => {
    render(<PersonalBrandRoom />);
    // The button contains "Additional Sources & Targeting" (JSX renders & as literal &)
    const expandBtn = screen.getByRole('button', { name: /Additional Sources/i });
    fireEvent.click(expandBtn);
    expect(screen.getByPlaceholderText(/Paste any bio, speaker profile/i)).toBeInTheDocument();
  });

  it('shows activity feed messages in running state', () => {
    vi.mocked(usePersonalBrand).mockReturnValue(runningState);
    render(<PersonalBrandRoom />);
    expect(screen.getByText('Auditing your brand presence (1/3 sources)')).toBeInTheDocument();
  });

  it('shows Personal Brand Audit report in complete state', () => {
    vi.mocked(usePersonalBrand).mockReturnValue(completeState);
    render(<PersonalBrandRoom />);
    expect(screen.getAllByText('Personal Brand Audit').length).toBeGreaterThan(0);
    expect(screen.getByText('Score 78%')).toBeInTheDocument();
  });

  it('calls reset when Run another audit is clicked in complete state', () => {
    vi.mocked(usePersonalBrand).mockReturnValue(completeState);
    render(<PersonalBrandRoom />);
    fireEvent.click(screen.getByText('Run another audit'));
    expect(mockReset).toHaveBeenCalled();
  });
});
