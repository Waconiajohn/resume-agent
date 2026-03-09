// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Mock supabase client (used by ZoneYourPipeline and pipeline hooks)
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
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

// Mock fetch for CRUD pipeline hooks
vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

// Mock SSE parser for useJobFinder
vi.mock('@/lib/sse-parser', () => ({
  parseSSEStream: vi.fn().mockReturnValue({ [Symbol.asyncIterator]: async function* () {} }),
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

  it('renders tab navigation with all tabs', () => {
    render(<LinkedInStudioRoom signals={greenSignals} whyMeClarity="test" />);
    expect(screen.getByText('Post Composer')).toBeInTheDocument();
    expect(screen.getByText('Profile Editor')).toBeInTheDocument();
    expect(screen.getByText('Calendar')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
  });

  it('renders content calendar when Calendar tab is clicked', () => {
    render(<LinkedInStudioRoom signals={greenSignals} whyMeClarity="test" />);
    fireEvent.click(screen.getByText('Calendar'));
    expect(screen.getByText('Content Calendar')).toBeInTheDocument();
  });

  it('renders analytics when Analytics tab is clicked', () => {
    render(<LinkedInStudioRoom signals={greenSignals} whyMeClarity="test" />);
    fireEvent.click(screen.getByText('Analytics'));
    expect(screen.getByText('Profile Views')).toBeInTheDocument();
    expect(screen.getByText('Search Appearances')).toBeInTheDocument();
    expect(screen.getByText('Post Engagement')).toBeInTheDocument();
  });

  it('renders LinkedIn Studio header', () => {
    render(<LinkedInStudioRoom signals={greenSignals} whyMeClarity="test" />);
    expect(screen.getByText('LinkedIn Studio')).toBeInTheDocument();
  });

  it('renders post composer tab by default', () => {
    render(<LinkedInStudioRoom signals={greenSignals} whyMeClarity="test" />);
    // Post Composer shows a start button when idle
    expect(screen.getByText(/Write a Post/i)).toBeInTheDocument();
  });

  it('renders profile editor tab content when clicked', () => {
    render(<LinkedInStudioRoom signals={greenSignals} whyMeClarity="test" />);
    fireEvent.click(screen.getByText('Profile Editor'));
    expect(screen.getByText(/Edit Profile/i)).toBeInTheDocument();
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
    // Reset fetch mock for each test — pipeline hooks make fetch calls
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }));
  });

  it('renders smart matches section', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    expect(screen.getByText('Smart Matches')).toBeInTheDocument();
  });

  it('renders "Run Job Finder" button when no matches exist', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    expect(screen.getByText('Run Job Finder')).toBeInTheDocument();
  });

  it('renders boolean search builder section', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    expect(screen.getByText('Boolean Search Builder')).toBeInTheDocument();
  });

  it('renders "Generate Searches" button when no searches exist', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    expect(screen.getByText('Generate Searches')).toBeInTheDocument();
  });

  it('renders search preferences section', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    expect(screen.getByText('Search Preferences')).toBeInTheDocument();
  });

  it('renders application pipeline kanban board', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    expect(screen.getByText('Application Pipeline')).toBeInTheDocument();
  });

  it('renders kanban stage columns', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    // Use getAllByText because stage names appear in multiple places (kanban + PipelineSummary)
    expect(screen.getAllByText('Saved').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Applied').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Interviewing').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Offer').length).toBeGreaterThan(0);
  });

  it('renders daily ops section', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    // "Daily Ops" appears in both the tab bar and the section content
    expect(screen.getAllByText('Daily Ops').length).toBeGreaterThan(0);
  });

  it('renders application tracker section', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    expect(screen.getByText('Application Tracker')).toBeInTheDocument();
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
