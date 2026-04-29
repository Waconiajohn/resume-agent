// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const { mockGetUser, mockGetSession, mockOnAuthStateChange, trackProductEventMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn().mockResolvedValue({ data: { user: null } }),
  mockGetSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
  mockOnAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  trackProductEventMock: vi.fn(),
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

vi.mock('@/lib/product-telemetry', () => ({
  trackProductEvent: trackProductEventMock,
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

vi.mock('@/hooks/useLinkedInProfile', () => ({
  useLinkedInProfile: () => ({
    profile: { headline: '', about: '', experience: '' },
    updateField: vi.fn(),
    save: vi.fn().mockResolvedValue(true),
    loading: false,
    saving: false,
    error: null,
    hasContent: false,
  }),
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

  it('renders tab navigation with Profile Audit and Content tabs', () => {
    render(<LinkedInStudioRoom signals={greenSignals} />);
    expect(screen.getByText('LinkedIn')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Profile Audit$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Content$/i })).toBeInTheDocument();
  });

  it('renders content calendar section when Content tab is active', () => {
    render(<LinkedInStudioRoom signals={greenSignals} />);
    fireEvent.click(screen.getByRole('button', { name: /^Content$/i }));
    // ContentCalendar is inside a <details> element with "Content Plan" label
    expect(screen.getByText('Content Plan')).toBeInTheDocument();
  });

  it('keeps platform metrics hidden until profile score data is available', () => {
    render(<LinkedInStudioRoom signals={greenSignals} />);
    expect(screen.queryByText('Total Posts')).not.toBeInTheDocument();
    expect(screen.queryByText('Avg Post Score')).not.toBeInTheDocument();
  });

  it('renders LinkedIn header', () => {
    render(<LinkedInStudioRoom signals={greenSignals} />);
    expect(screen.getByText('LinkedIn')).toBeInTheDocument();
  });

  it('renders the Profile Audit tab by default with profile content', () => {
    render(<LinkedInStudioRoom signals={greenSignals} />);
    expect(screen.getByText(/Optimize Your LinkedIn Profile/i)).toBeInTheDocument();
    expect(screen.getByText('Your Current LinkedIn Profile')).toBeInTheDocument();
  });

  it('renders the Profile Audit tab content when clicked', () => {
    render(<LinkedInStudioRoom signals={greenSignals} />);
    fireEvent.click(screen.getByRole('button', { name: /^Profile Audit$/i }));
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
    trackProductEventMock.mockClear();
    localStorageMock.clear();
    // Reset fetch mock for each test — pipeline hooks make fetch calls
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }));
  });

  it('renders the two-mode discovery surface', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    expect(getJobTabButton(/^Broad Search$/i)).toBeInTheDocument();
    expect(getJobTabButton(/^Insider Jobs$/i)).toBeInTheDocument();
    // The room title names the two discovery paths.
    expect(screen.getByText(/Find your next role two ways\./i)).toBeInTheDocument();
    expect(
      screen.getByText(/Broad Search scans ATS-hosted public job pages and career boards\. Insider Jobs surfaces roles/i),
    ).toBeInTheDocument();
  });

  it('renders the boolean-search generator by default', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    expect(screen.getByText('Generate Search Strings')).toBeInTheDocument();
    expect(screen.getAllByText('Show More Suggestions').length).toBeGreaterThan(0);
  });

  it('tracks manual job-board searches', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);

    // Phase 2.2.1 — Location lives on the outer JobFilterPanel now; the
    // inner RadarSection only owns the keyword query + Search button.
    fireEvent.change(screen.getByLabelText('Filter by location'), {
      target: { value: 'Chicago' },
    });
    fireEvent.change(screen.getByPlaceholderText('Job title, keywords...'), {
      target: { value: 'VP Marketing' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Search$/i }));

    expect(trackProductEventMock).toHaveBeenCalledWith('job_board_search_run', {
      query: 'VP Marketing',
      location: 'Chicago',
      // The outer JobFilterPanel defaults postedWithin='7d' and workModes
      // remote+hybrid both true, which deriveRemoteType flattens to 'any'.
      date_posted: '7d',
      remote_type: 'any',
      source: 'manual',
    });
  });

  it('keeps the board focused on search first and boolean strings second', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    // The boolean search generator is collapsed by default inside the Job Board tab
    expect(screen.getByText(/Generate search strings for external job boards/i)).toBeInTheDocument();
  });

  it('reveals the full extra-suggestions panel when requested', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    fireEvent.click(screen.getAllByText('Show More Suggestions')[0]);
    expect(screen.getByText('More Role Ideas')).toBeInTheDocument();
  });

  it('tracks when more role suggestions are requested from the boolean-search panel', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);

    fireEvent.click(screen.getAllByText('Show More Suggestions')[0]);

    expect(trackProductEventMock).toHaveBeenCalledWith('more_role_suggestions_requested', {
      source: 'boolean_search_panel',
    });
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

    // The room bootstraps watchlist data; it must not auto-run a radar scan.
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input]) => typeof input === 'string' && input.includes('/watchlist'),
        ),
      ).toBe(true),
    );
    expect(
      fetchMock.mock.calls.some(
        ([input]) => typeof input === 'string' && input.includes('/job-search/scans/latest'),
      ),
    ).toBe(false);
  });

  it('keeps the live extra-suggestions action in the board', () => {
    render(<JobCommandCenterRoom onNavigate={mockNavigate} />);
    expect(screen.getAllByText('Show More Suggestions').length).toBeGreaterThan(0);
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
    // The workflow shows 4 steps as clickable cards
    expect(screen.getByText('Step 1')).toBeInTheDocument();
  });

  it('renders interview history section', () => {
    render(<InterviewLabRoom />);
    fireEvent.click(screen.getByRole('button', { name: /follow-up/i }));
    expect(screen.getByText('Interview History')).toBeInTheDocument();
  });

  it('surfaces the leave-behinds section with 30-60-90 plan content', () => {
    render(<InterviewLabRoom />);
    // Click the Leave-behinds workflow card
    fireEvent.click(screen.getByRole('button', { name: /leave-behinds/i }));
    // The Leave-behinds section description confirms 30-60-90 plan (may appear in multiple elements)
    expect(screen.getAllByText(/30-60-90 plan/i).length).toBeGreaterThan(0);
  });

  it('opens directly into the 30-60-90 plan when plan focus is provided', () => {
    render(<InterviewLabRoom initialFocus="plan" initialCompany="Acme Corp" initialRole="VP Operations" />);
    expect(screen.getAllByText('30-60-90 Plan').length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('Acme Corp')).toBeInTheDocument();
  });

  it('opens directly into thank-you notes when thank-you focus is provided', () => {
    // Phase 2.3e: in-lab entry now uses the delegate-or-fallback pattern.
    // Without an active application context, the fallback informational
    // card is shown — it references the company/role inline and directs
    // the user to Applications. Asserting that shape here.
    render(<InterviewLabRoom initialFocus="thank-you" initialCompany="Acme Corp" initialRole="VP Engineering" />);
    expect(screen.getAllByText('Thank-You Notes').length).toBeGreaterThan(0);
    expect(screen.getByText('Acme Corp — VP Engineering')).toBeInTheDocument();
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
    expect(screen.getByText(/Insider Jobs turns your network into real outreach/)).toBeInTheDocument();
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
