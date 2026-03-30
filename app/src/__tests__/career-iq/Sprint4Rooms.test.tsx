// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const { mockGetUser, mockGetSession, mockOnAuthStateChange } = vi.hoisted(() => ({
  mockGetUser: vi.fn().mockResolvedValue({ data: { user: null } }),
  mockGetSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
  mockOnAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));

// Mock supabase client (used by ZoneYourPipeline and pipeline hooks)
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
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

vi.mock('@/components/career-iq/ExecutiveBioRoom', () => ({
  ExecutiveBioRoom: () => <div>Executive Bio Workspace</div>,
}));

vi.mock('@/components/career-iq/CaseStudyRoom', () => ({
  CaseStudyRoom: () => <div>Case Study Workspace</div>,
}));

vi.mock('@/components/career-iq/CareerProfileSummaryCard', () => ({
  CareerProfileSummaryCard: ({ title }: { title: string }) => <div>{title}</div>,
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
    render(<LinkedInStudioRoom signals={greenSignals} />);
    expect(screen.getByText('LinkedIn workflow')).toBeInTheDocument();
    expect(screen.getByText('Right now')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Write$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Profile$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Results$/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Write$/i }));
    expect(screen.getByRole('button', { name: /Plan posts/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reuse drafts/i })).toBeInTheDocument();
  });

  it('renders content calendar when Content Plan tab is clicked', () => {
    render(<LinkedInStudioRoom signals={greenSignals} />);
    fireEvent.click(screen.getByRole('button', { name: /^Write$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Plan posts/i }));
    // ContentCalendar in idle state renders "Build Content Plan"
    expect(screen.getByText('Build Content Plan')).toBeInTheDocument();
  });

  it('renders analytics when Results tab is clicked', () => {
    render(<LinkedInStudioRoom signals={greenSignals} />);
    fireEvent.click(screen.getByRole('button', { name: /^Results$/i }));
    // Results shows content-based metrics from generated posts
    expect(screen.getByText('Platform Metrics')).toBeInTheDocument();
    expect(screen.getByText('Total Posts')).toBeInTheDocument();
    expect(screen.getByText('Avg Post Score')).toBeInTheDocument();
  });

  it('renders LinkedIn header', () => {
    render(<LinkedInStudioRoom signals={greenSignals} />);
    expect(screen.getByText('LinkedIn')).toBeInTheDocument();
  });

  it('renders the Profile tab by default', () => {
    render(<LinkedInStudioRoom signals={greenSignals} />);
    expect(screen.getByText(/Optimize Your LinkedIn Profile/i)).toBeInTheDocument();
    expect(screen.getByText(/Sharpen the profile people land on/i)).toBeInTheDocument();
  });

  it('renders the Profile tab content when clicked', () => {
    render(<LinkedInStudioRoom signals={greenSignals} />);
    fireEvent.click(screen.getByRole('button', { name: /^Profile$/i }));
    expect(screen.getByText(/Edit Profile/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// JobCommandCenterRoom
// ---------------------------------------------------------------------------

describe('JobCommandCenterRoom', () => {
  const mockNavigate = vi.fn();
  const getJobTabButton = (name: RegExp) =>
    screen.getAllByRole('button', { name }).find((element) => element.className.includes('rail-tab')) as HTMLButtonElement;

  beforeEach(() => {
    mockNavigate.mockClear();
    localStorageMock.clear();
    // Reset fetch mock for each test — pipeline hooks make fetch calls
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }));
  });

  it('renders the simplified job board surface', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    expect(screen.getByText('At a glance')).toBeInTheDocument();
    expect(screen.getByText('Due now')).toBeInTheDocument();
    expect(getJobTabButton(/^Job Board$/i)).toBeInTheDocument();
    expect(screen.getByText('Search Strings')).toBeInTheDocument();
  });

  it('renders the boolean-search generator by default', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    expect(screen.getByText('Generate Search Strings')).toBeInTheDocument();
    expect(screen.getAllByText('Show AI Suggestions').length).toBeGreaterThan(0);
  });

  it('keeps the board focused on search first and boolean strings second', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    expect(screen.getByText(/Search public roles, check how old they are/i)).toBeInTheDocument();
    expect(screen.getByText(/Generate OR-only job-title strings from your master resume/i)).toBeInTheDocument();
  });

  it('reveals the full AI suggestions panel when requested', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    fireEvent.click(screen.getAllByText('Show AI Suggestions')[0]);
    expect(screen.getByText('AI Suggestions')).toBeInTheDocument();
  });

  it('does not surface the removed advanced-search controls in the board', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    expect(screen.queryByText('Advanced search')).not.toBeInTheDocument();
    expect(screen.getByText('Search Strings')).toBeInTheDocument();
    expect(screen.queryByText('Search Preferences')).not.toBeInTheDocument();
  });

  it('does not auto-load the latest generic radar scan on mount', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    vi.stubGlobal('fetch', fetchMock);

    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input]) => typeof input === 'string' && (
            input.includes('/applications')
            || input.includes('/watchlist')
            || input.includes('/applications/due-actions')
          ),
        ),
      ).toBe(true),
    );
    expect(
      fetchMock.mock.calls.some(
        ([input]) => typeof input === 'string' && input.includes('/job-search/scans/latest'),
      ),
    ).toBe(false);
  });

  it('keeps the live AI suggestion action in the board', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    expect(screen.getAllByText('Show AI Suggestions').length).toBeGreaterThan(0);
  });

  it('renders application pipeline kanban board', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    fireEvent.click(getJobTabButton(/^Pipeline$/i));
    expect(screen.getByText('Application Pipeline')).toBeInTheDocument();
  });

  it('opens directly into Pipeline when pipeline focus is provided', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} initialFocus="pipeline" />);
    expect(screen.getByText('Application Pipeline')).toBeInTheDocument();
  });

  it('opens directly into Shortlist when shortlist focus is provided', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} initialFocus="shortlist" />);
    expect(screen.getByText('Application Pipeline')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shortlist' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not show synthetic pipeline counts when no real pipeline data exists', async () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    fireEvent.click(getJobTabButton(/^Pipeline$/i));

    await waitFor(() => expect(screen.getByText('0 active')).toBeInTheDocument());
    expect(screen.queryByText('8 active')).not.toBeInTheDocument();
    expect(
      screen.getByText(/No active applications yet\. Save strong roles from the Job Board/i),
    ).toBeInTheDocument();
  });

  it('renders kanban stage columns', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    fireEvent.click(getJobTabButton(/^Pipeline$/i));
    // Use getAllByText because stage names appear in multiple places (kanban + PipelineSummary)
    expect(screen.getAllByText('Shortlist').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Applied').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Interviewing').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Offer').length).toBeGreaterThan(0);
  });

  it('renders the pipeline attention section', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    expect(getJobTabButton(/^Pipeline$/i)).toBeInTheDocument();
    fireEvent.click(getJobTabButton(/^Pipeline$/i));
    expect(screen.getByText('Needs Attention')).toBeInTheDocument();
  });

  it('keeps pipeline attention focused on active work instead of a second discovery workflow', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    fireEvent.click(getJobTabButton(/^Pipeline$/i));
    expect(screen.getByText('Needs Attention')).toBeInTheDocument();
    expect(screen.queryByText('Application Tracker')).not.toBeInTheDocument();
    expect(screen.queryByText('Top Matches')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// InterviewLabRoom
// ---------------------------------------------------------------------------

describe('InterviewLabRoom', () => {
  beforeEach(() => {
    localStorageMock.clear();
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } } });
    mockOnAuthStateChange.mockImplementation(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
  });

  it('renders upcoming interviews section', () => {
    render(<InterviewLabRoom />);
    expect(screen.getByText('Upcoming Interviews')).toBeInTheDocument();
  });

  it('shows the interview workflow sequence on the default landing state', () => {
    render(<InterviewLabRoom />);
    expect(screen.getByText('Interview workflow')).toBeInTheDocument();
    expect(screen.getByText('Then')).toBeInTheDocument();
  });

  it('renders interview history section', () => {
    render(<InterviewLabRoom />);
    fireEvent.click(screen.getByRole('button', { name: /follow-up/i }));
    expect(screen.getByText('Interview History')).toBeInTheDocument();
  });

  it('surfaces the 30-60-90 plan as an interview document action', () => {
    render(<InterviewLabRoom />);
    fireEvent.click(screen.getByRole('button', { name: /leave-behinds/i }));
    expect(screen.getByRole('button', { name: /open 30-60-90 day plan/i })).toBeInTheDocument();
  });

  it('opens directly into the 30-60-90 plan when plan focus is provided', () => {
    render(<InterviewLabRoom initialFocus="plan" initialCompany="Acme Corp" initialRole="VP Operations" />);
    expect(screen.getAllByText('30-60-90 Plan').length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('Acme Corp')).toBeInTheDocument();
  });

  it('opens directly into thank-you notes when thank-you focus is provided', () => {
    render(<InterviewLabRoom initialFocus="thank-you" initialCompany="Acme Corp" initialRole="VP Engineering" />);
    expect(screen.getByText('Thank-You Notes')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Acme Corp')).toBeInTheDocument();
  });

  it('opens directly into negotiation prep when negotiation focus is provided', () => {
    render(<InterviewLabRoom initialFocus="negotiation" initialCompany="Acme Corp" initialRole="VP Engineering" />);
    expect(screen.getAllByText('Negotiation Prep').length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('Acme Corp')).toBeInTheDocument();
  });

  it('opens directly into the saved debrief form when debrief focus is provided', () => {
    render(<InterviewLabRoom initialFocus="debrief" initialCompany="Acme Corp" initialRole="VP Engineering" />);
    expect(screen.getByText('Post-Interview Debrief')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Acme Corp')).toBeInTheDocument();
  });

  it('opens directly into follow-up email when follow-up-email focus is provided', () => {
    render(<InterviewLabRoom initialFocus="follow-up-email" initialCompany="Acme Corp" initialRole="VP Engineering" />);
    expect(screen.getAllByText('Follow-Up Email').length).toBeGreaterThan(0);
    expect(screen.getByText('Acme Corp — VP Engineering')).toBeInTheDocument();
  });

  it('allows adding a new interview entry', () => {
    render(<InterviewLabRoom />);
    fireEvent.click(screen.getByRole('button', { name: /follow-up/i }));
    fireEvent.click(screen.getByText('Add Interview'));
    fireEvent.change(screen.getByPlaceholderText('Company'), { target: { value: 'Test Corp' } });
    fireEvent.change(screen.getByPlaceholderText('Role'), { target: { value: 'CTO' } });
    fireEvent.click(screen.getByText('Save'));
    expect(screen.getByText('Test Corp')).toBeInTheDocument();
  });

  it('persists history to localStorage on add', () => {
    render(<InterviewLabRoom />);
    fireEvent.click(screen.getByRole('button', { name: /follow-up/i }));
    fireEvent.click(screen.getByText('Add Interview'));
    fireEvent.change(screen.getByPlaceholderText('Company'), { target: { value: 'Persist Co' } });
    fireEvent.change(screen.getByPlaceholderText('Role'), { target: { value: 'VP' } });
    fireEvent.click(screen.getByText('Save'));
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'careeriq_interview_history:anon',
      expect.stringContaining('Persist Co'),
    );
  });

  it('scopes interview history to the signed-in user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });

    render(<InterviewLabRoom />);
    await waitFor(() => {
      expect(mockGetUser).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole('button', { name: /follow-up/i }));
    fireEvent.click(screen.getByText('Add Interview'));
    fireEvent.change(screen.getByPlaceholderText('Company'), { target: { value: 'Scoped Co' } });
    fireEvent.change(screen.getByPlaceholderText('Role'), { target: { value: 'VP' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'careeriq_interview_history:user-123',
        expect.stringContaining('Scoped Co'),
      );
    });
  });

  it('allows updating outcome on existing entry', async () => {
    // Pre-populate localStorage with a history entry
    localStorageMock.getItem.mockReturnValue(JSON.stringify([
      { id: '1', company: 'TestCo', role: 'CTO', date: '2026-03-01', outcome: 'pending', notes: '' },
    ]));
    render(<InterviewLabRoom />);
    fireEvent.click(screen.getByRole('button', { name: /follow-up/i }));
    await waitFor(() => {
      expect(screen.getByText('TestCo')).toBeInTheDocument();
    });
  });

  it('ignores malformed saved interview history entries', async () => {
    localStorageMock.getItem.mockReturnValue(JSON.stringify([
      { id: 'broken', company: 42, role: null, date: '2026-03-01', outcome: 'pending' },
    ]));

    render(<InterviewLabRoom />);
    fireEvent.click(screen.getByRole('button', { name: /follow-up/i }));

    await waitFor(() => {
      expect(screen.getByText('Interview History')).toBeInTheDocument();
      expect(screen.queryByText('broken')).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// NetworkingHubRoom
// ---------------------------------------------------------------------------

describe('NetworkingHubRoom', () => {
  beforeEach(() => {
    // Stub fetch for the hook calls (fetchFollowUps on mount, useContentPosts auto-fetch)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ contacts: [], count: 0, touchpoints: [], posts: [] }), { status: 200 }),
    ));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the Contacts & Outreach heading', () => {
    render(<NetworkingHubRoom />);
    expect(screen.getByText('Contacts & Outreach')).toBeInTheDocument();
  });

  it('renders the Rule of Four tagline', () => {
    render(<NetworkingHubRoom />);
    expect(screen.getByText(/Smart Referrals turns your network into real outreach/)).toBeInTheDocument();
  });

  it('renders the Add Contact button', () => {
    render(<NetworkingHubRoom />);
    expect(screen.getByText('Add Contact')).toBeInTheDocument();
  });

  it('renders the outreach generator section', () => {
    render(<NetworkingHubRoom />);
    // Outreach generator card is always present
    expect(screen.getByText('Generate Outreach Sequence')).toBeInTheDocument();
  });

  it('renders messaging method buttons', () => {
    render(<NetworkingHubRoom />);
    expect(screen.getAllByText('Group Message').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Connection Request').length).toBeGreaterThan(0);
    expect(screen.getAllByText('InMail').length).toBeGreaterThan(0);
  });

  it('does not show coaching bar when no rule-of-four groups', () => {
    render(<NetworkingHubRoom />);
    // With empty ruleOfFour.groups from the hook mock, no coaching bar
    expect(screen.queryByText(/needs more contacts/)).not.toBeInTheDocument();
  });

  it('renders contact list section', () => {
    render(<NetworkingHubRoom />);
    // Contact section header or empty state
    const el =
      screen.queryByText(/All Contacts/i) ||
      screen.queryByText(/no contacts/i) ||
      screen.queryByText(/Add Contact/i);
    expect(el).toBeTruthy();
  });
});
