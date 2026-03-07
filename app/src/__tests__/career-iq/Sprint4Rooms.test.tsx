// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Mock supabase client (used by ZoneYourPipeline)
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        neq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  },
}));

// Mock clipboard
Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

import { LinkedInStudioRoom } from '@/components/career-iq/LinkedInStudioRoom';
import { JobCommandCenterRoom } from '@/components/career-iq/JobCommandCenterRoom';
import { InterviewLabRoom } from '@/components/career-iq/InterviewLabRoom';
import { NetworkingHubRoom } from '@/components/career-iq/NetworkingHubRoom';
import type { WhyMeSignals } from '@/components/career-iq/useWhyMeStory';

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// LinkedInStudioRoom
// ---------------------------------------------------------------------------

describe('LinkedInStudioRoom', () => {
  const greenSignals: WhyMeSignals = { clarity: 'green', alignment: 'green', differentiation: 'green' };
  const yellowSignals: WhyMeSignals = { clarity: 'yellow', alignment: 'green', differentiation: 'green' };

  it('renders profile optimizer with headline sections', () => {
    render(<LinkedInStudioRoom signals={greenSignals} whyMeClarity="test" />);
    expect(screen.getByText('Profile Optimizer')).toBeInTheDocument();
    expect(screen.getByText('Headline')).toBeInTheDocument();
    expect(screen.getByText('About Section')).toBeInTheDocument();
  });

  it('renders content calendar section', () => {
    render(<LinkedInStudioRoom signals={greenSignals} whyMeClarity="test" />);
    expect(screen.getByText('Content Calendar')).toBeInTheDocument();
    expect(screen.getByText('4-week plan')).toBeInTheDocument();
  });

  it('renders analytics overview with 3 metric cards', () => {
    render(<LinkedInStudioRoom signals={greenSignals} whyMeClarity="test" />);
    expect(screen.getByText('Profile Views')).toBeInTheDocument();
    expect(screen.getByText('Search Appearances')).toBeInTheDocument();
    expect(screen.getByText('Post Engagement')).toBeInTheDocument();
  });

  it('shows agent suggestion banner when clarity is not green', () => {
    render(<LinkedInStudioRoom signals={yellowSignals} whyMeClarity="test" />);
    expect(screen.getByText(/Your LinkedIn Agent suggests/)).toBeInTheDocument();
  });

  it('hides agent suggestion banner when clarity is green', () => {
    render(<LinkedInStudioRoom signals={greenSignals} whyMeClarity="test" />);
    expect(screen.queryByText(/Your LinkedIn Agent suggests/)).not.toBeInTheDocument();
  });

  it('renders suggested headline text', () => {
    render(<LinkedInStudioRoom signals={greenSignals} whyMeClarity="test" />);
    expect(screen.getByText(/I turn around underperforming supply chains/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// JobCommandCenterRoom
// ---------------------------------------------------------------------------

describe('JobCommandCenterRoom', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    mockNavigate.mockClear();
    localStorageMock.clear();
  });

  it('renders smart matches with match scores', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    expect(screen.getByText('Smart Matches')).toBeInTheDocument();
    expect(screen.getByText('94')).toBeInTheDocument();
    expect(screen.getByText('VP of Supply Chain Operations')).toBeInTheDocument();
  });

  it('renders boolean search builder with platform names', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    expect(screen.getByText('Boolean Search Builder')).toBeInTheDocument();
    expect(screen.getByText('LinkedIn')).toBeInTheDocument();
    expect(screen.getByText('Indeed')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
  });

  it('renders search preferences section', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    expect(screen.getByText('Search Preferences')).toBeInTheDocument();
  });

  it('cover letter button triggers onNavigate', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    const coverLetterButtons = screen.getAllByText('Cover Letter');
    fireEvent.click(coverLetterButtons[0]);
    expect(mockNavigate).toHaveBeenCalledWith('cover-letter');
  });

  it('renders company names for all matches', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    expect(screen.getByText('Medtronic')).toBeInTheDocument();
    expect(screen.getByText('Abbott Labs')).toBeInTheDocument();
    expect(screen.getByText('Precision Castparts')).toBeInTheDocument();
  });

  it('shows "Why this matches" explanation', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    expect(screen.getByText(/turnaround experience directly matches/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// InterviewLabRoom
// ---------------------------------------------------------------------------

describe('InterviewLabRoom', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('renders upcoming interviews section', () => {
    render(<InterviewLabRoom />);
    expect(screen.getByText('Upcoming Interviews')).toBeInTheDocument();
  });

  it('renders company research section', () => {
    render(<InterviewLabRoom />);
    expect(screen.getByText(/Company Intel/)).toBeInTheDocument();
  });

  it('renders practice questions that expand on click', () => {
    render(<InterviewLabRoom />);
    expect(screen.getByText('Predicted Questions')).toBeInTheDocument();
    // Click on the question text's parent button
    const questionText = screen.getByText(/Tell me about a time you led a major supply chain/);
    const button = questionText.closest('button');
    if (button) fireEvent.click(button);
    expect(screen.getByText(/Lead with the turnaround story/)).toBeInTheDocument();
  });

  it('collapses expanded question on second click', () => {
    render(<InterviewLabRoom />);
    const questionText = screen.getByText(/Tell me about a time you led a major supply chain/);
    const button = questionText.closest('button');
    if (button) {
      fireEvent.click(button);
      expect(screen.getByText(/Lead with the turnaround story/)).toBeInTheDocument();
      fireEvent.click(button);
      expect(screen.queryByText(/Lead with the turnaround story/)).not.toBeInTheDocument();
    }
  });

  it('renders interview history section', () => {
    render(<InterviewLabRoom />);
    expect(screen.getByText('Interview History')).toBeInTheDocument();
    expect(screen.getByText('Honeywell')).toBeInTheDocument();
  });

  it('allows adding a new interview entry', () => {
    render(<InterviewLabRoom />);
    fireEvent.click(screen.getByText('Add Interview'));
    fireEvent.change(screen.getByPlaceholderText('Company'), { target: { value: 'Test Corp' } });
    fireEvent.change(screen.getByPlaceholderText('Role'), { target: { value: 'CTO' } });
    fireEvent.click(screen.getByText('Save'));
    expect(screen.getByText('Test Corp')).toBeInTheDocument();
  });

  it('persists history to localStorage on add', () => {
    render(<InterviewLabRoom />);
    fireEvent.click(screen.getByText('Add Interview'));
    fireEvent.change(screen.getByPlaceholderText('Company'), { target: { value: 'Persist Co' } });
    fireEvent.change(screen.getByPlaceholderText('Role'), { target: { value: 'VP' } });
    fireEvent.click(screen.getByText('Save'));
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'careeriq_interview_history',
      expect.stringContaining('Persist Co'),
    );
  });

  it('allows updating outcome on existing entry', () => {
    render(<InterviewLabRoom />);
    // Click a "Not Selected" button to change outcome
    const notSelectedButtons = screen.getAllByText('Not Selected');
    fireEvent.click(notSelectedButtons[0]);
    expect(localStorageMock.setItem).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// NetworkingHubRoom
// ---------------------------------------------------------------------------

describe('NetworkingHubRoom', () => {
  it('renders Rule of Four section', () => {
    render(<NetworkingHubRoom />);
    expect(screen.getByText('Rule of Four')).toBeInTheDocument();
    expect(screen.getByText(/Networking is your sales force/)).toBeInTheDocument();
  });

  it('shows first company group expanded by default', () => {
    render(<NetworkingHubRoom />);
    // Medtronic group expanded — shows contacts
    expect(screen.getByText('Sarah Chen')).toBeInTheDocument();
    expect(screen.getByText('Marcus Rivera')).toBeInTheDocument();
  });

  it('shows outreach status badges on contacts', () => {
    render(<NetworkingHubRoom />);
    expect(screen.getAllByText('Messaged').length).toBeGreaterThan(0);
    expect(screen.getByText('Responded')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('renders outreach templates section', () => {
    render(<NetworkingHubRoom />);
    expect(screen.getByText('Outreach Templates')).toBeInTheDocument();
    expect(screen.getByText('Warm Introduction')).toBeInTheDocument();
    expect(screen.getByText('Direct Outreach')).toBeInTheDocument();
  });

  it('expands template to show content with copy button', () => {
    render(<NetworkingHubRoom />);
    fireEvent.click(screen.getByText('Warm Introduction'));
    expect(screen.getByText(/came across your profile/)).toBeInTheDocument();
    expect(screen.getByText('Copy Template')).toBeInTheDocument();
  });

  it('renders weekly activity metrics', () => {
    render(<NetworkingHubRoom />);
    expect(screen.getByText('Weekly Activity')).toBeInTheDocument();
    expect(screen.getByText('Messages Sent')).toBeInTheDocument();
    expect(screen.getByText('Responses')).toBeInTheDocument();
    expect(screen.getByText('Connections Made')).toBeInTheDocument();
  });

  it('renders recruiter tracker', () => {
    render(<NetworkingHubRoom />);
    expect(screen.getByText('Recruiter Tracker')).toBeInTheDocument();
    expect(screen.getByText('James Morrison')).toBeInTheDocument();
    expect(screen.getByText(/Spencer Stuart/)).toBeInTheDocument();
  });

  it('shows contact connection levels', () => {
    render(<NetworkingHubRoom />);
    expect(screen.getAllByText('2nd').length).toBeGreaterThan(0);
  });
});
