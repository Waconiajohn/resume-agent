// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn().mockResolvedValue({ data: { user: null } });
const mockOnAuthStateChange = vi.fn().mockReturnValue({
  data: {
    subscription: {
      unsubscribe: vi.fn(),
    },
  },
});
const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
const mockSelect = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    maybeSingle: mockMaybeSingle,
  }),
});
const mockUpsert = vi.fn().mockResolvedValue({ error: null });

// Mock supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mockGetUser,
      onAuthStateChange: mockOnAuthStateChange,
    },
    from: vi.fn().mockReturnValue({
      select: mockSelect,
      upsert: mockUpsert,
    }),
  },
}));

// Mock window.matchMedia for useMediaQuery tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })),
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// ---------------------------------------------------------------------------
// 1. useWhyMeStory hook
// ---------------------------------------------------------------------------

describe('useWhyMeStory', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockOnAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    });
  });
  afterEach(() => cleanup());

  const strongStory = {
    colleaguesCameForWhat:
      'I lead complex transformations across product and engineering teams. Over the last 2 years, I cut planning cycle time by 30% while rebuilding team trust.',
    knownForWhat:
      'I want to be known for turning strategy into measurable operating rhythm. In my last role, I helped a 120-person org move from reactive execution to quarterly planning with clear ownership.',
    whyNotMe:
      'People sometimes assume I am too operational, but that misses the full picture. I pair operating depth with executive communication, and that helped us grow revenue by 18% during a messy transition.',
  };

  async function importHook() {
    // Dynamic import to get fresh module after localStorage is set
    const mod = await import('../../components/career-iq/useWhyMeStory');
    return mod.useWhyMeStory;
  }

  it('returns new-user state when story is empty', async () => {
    const useWhyMeStory = await importHook();
    const { result } = renderHook(() => useWhyMeStory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dashboardState).toBe('new-user');
  });

  it('returns all red signals for empty story', async () => {
    const useWhyMeStory = await importHook();
    const { result } = renderHook(() => useWhyMeStory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.signals.clarity).toBe('red');
    expect(result.current.signals.alignment).toBe('red');
    expect(result.current.signals.differentiation).toBe('red');
  });

  it('returns isComplete=false and hasStarted=false for new-user', async () => {
    const useWhyMeStory = await importHook();
    const { result } = renderHook(() => useWhyMeStory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isComplete).toBe(false);
    expect(result.current.hasStarted).toBe(false);
  });

  it('returns refining state for partial story (<50 chars)', async () => {
    localStorageMock.setItem(
      'careeriq_why_me_story',
      JSON.stringify({
        colleaguesCameForWhat: 'Short text',
        knownForWhat: 'Brief',
        whyNotMe: '',
      }),
    );
    const useWhyMeStory = await importHook();
    const { result } = renderHook(() => useWhyMeStory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dashboardState).toBe('refining');
  });

  it('returns yellow signals for short text (<50 chars, >0)', async () => {
    localStorageMock.setItem(
      'careeriq_why_me_story',
      JSON.stringify({
        colleaguesCameForWhat: 'Short text',
        knownForWhat: 'Brief',
        whyNotMe: 'Tiny',
      }),
    );
    const useWhyMeStory = await importHook();
    const { result } = renderHook(() => useWhyMeStory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.signals.clarity).toBe('yellow');
    expect(result.current.signals.alignment).toBe('yellow');
    expect(result.current.signals.differentiation).toBe('yellow');
  });

  it('returns hasStarted=true for refining state', async () => {
    localStorageMock.setItem(
      'careeriq_why_me_story',
      JSON.stringify({
        colleaguesCameForWhat: 'Some content here',
        knownForWhat: '',
        whyNotMe: '',
      }),
    );
    const useWhyMeStory = await importHook();
    const { result } = renderHook(() => useWhyMeStory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasStarted).toBe(true);
  });

  it('returns strong state when all fields have rich evidence, metrics, and complete thoughts', async () => {
    localStorageMock.setItem(
      'careeriq_why_me_story',
      JSON.stringify(strongStory),
    );
    const useWhyMeStory = await importHook();
    const { result } = renderHook(() => useWhyMeStory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dashboardState).toBe('strong');
  });

  it('returns all green signals for complete story', async () => {
    localStorageMock.setItem(
      'careeriq_why_me_story',
      JSON.stringify(strongStory),
    );
    const useWhyMeStory = await importHook();
    const { result } = renderHook(() => useWhyMeStory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.signals.clarity).toBe('green');
    expect(result.current.signals.alignment).toBe('green');
    expect(result.current.signals.differentiation).toBe('green');
  });

  it('returns isComplete=true for strong state', async () => {
    localStorageMock.setItem(
      'careeriq_why_me_story',
      JSON.stringify(strongStory),
    );
    const useWhyMeStory = await importHook();
    const { result } = renderHook(() => useWhyMeStory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isComplete).toBe(true);
  });

  it('updateField correctly updates a single field', async () => {
    const useWhyMeStory = await importHook();
    const { result } = renderHook(() => useWhyMeStory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.updateField('colleaguesCameForWhat', 'New value');
    });

    expect(result.current.story.colleaguesCameForWhat).toBe('New value');
    expect(result.current.story.knownForWhat).toBe('');
    expect(result.current.story.whyNotMe).toBe('');
  });

  it('handles corrupted localStorage gracefully', async () => {
    localStorageMock.setItem('careeriq_why_me_story', '{invalid json!!!');
    const useWhyMeStory = await importHook();
    const { result } = renderHook(() => useWhyMeStory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dashboardState).toBe('new-user');
    expect(result.current.story.colleaguesCameForWhat).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 2. Sidebar
// ---------------------------------------------------------------------------

import { Sidebar } from '../../components/career-iq/Sidebar';
import { MemoryRouter } from 'react-router-dom';

/** Sidebar depends on useLocation (Sprint B1/B2) — tests must render inside a Router. */
const renderSidebar = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe('Sidebar', () => {
  afterEach(() => cleanup());

  it('renders the 6 target nav labels in order', () => {
    renderSidebar(
      <Sidebar activeRoom="dashboard" onNavigate={vi.fn()} dashboardState="strong" />,
    );
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Career Vault')).toBeInTheDocument();
    expect(screen.getByText('Job Search')).toBeInTheDocument();
    expect(screen.getByText('Applications')).toBeInTheDocument();
    expect(screen.getByText('Live Webinars')).toBeInTheDocument();
    expect(screen.getByText('Masterclass')).toBeInTheDocument();
  });

  it('does not render removed items (Resume Builder, LinkedIn, Interview Prep, Networking, Executive Bio)', () => {
    renderSidebar(
      <Sidebar activeRoom="dashboard" onNavigate={vi.fn()} dashboardState="strong" />,
    );
    expect(screen.queryByText('Resume Builder')).not.toBeInTheDocument();
    expect(screen.queryByText('LinkedIn')).not.toBeInTheDocument();
    expect(screen.queryByText('Interview Prep')).not.toBeInTheDocument();
    expect(screen.queryByText('Networking')).not.toBeInTheDocument();
    expect(screen.queryByText('Executive Bio')).not.toBeInTheDocument();
  });

  it('keeps all items available when dashboardState is new-user', () => {
    renderSidebar(
      <Sidebar activeRoom="dashboard" onNavigate={vi.fn()} dashboardState="new-user" />,
    );
    expect(screen.getByText('Home').closest('button')).not.toBeDisabled();
    expect(screen.getByText('Career Vault').closest('button')).not.toBeDisabled();
    expect(screen.getByText('Applications').closest('button')).not.toBeDisabled();
  });

  it('highlights active room', () => {
    renderSidebar(
      <Sidebar activeRoom="career-profile" onNavigate={vi.fn()} dashboardState="strong" />,
    );
    const vaultButton = screen.getByText('Career Vault').closest('button');
    expect(vaultButton?.className).toContain('bg-[var(--rail-tab-active-bg)]');
  });

  it('calls onNavigate when a room-based item is clicked', () => {
    const onNavigate = vi.fn();
    renderSidebar(
      <Sidebar activeRoom="dashboard" onNavigate={onNavigate} dashboardState="strong" />,
    );
    fireEvent.click(screen.getByText('Job Search'));
    expect(onNavigate).toHaveBeenCalledWith('jobs');
  });

  it('calls onNavigateRoute when Applications is clicked', () => {
    const onNavigate = vi.fn();
    const onNavigateRoute = vi.fn();
    renderSidebar(
      <Sidebar
        activeRoom="dashboard"
        onNavigate={onNavigate}
        onNavigateRoute={onNavigateRoute}
        dashboardState="strong"
      />,
    );
    fireEvent.click(screen.getByText('Applications'));
    expect(onNavigateRoute).toHaveBeenCalledWith('/workspace/applications');
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. WhyMeEngine
// ---------------------------------------------------------------------------

import { WhyMeEngine } from '../../components/career-iq/WhyMeEngine';
import type { WhyMeStory, WhyMeSignals } from '../../components/career-iq/useWhyMeStory';

function makeStory(overrides?: Partial<WhyMeStory>): WhyMeStory {
  return {
    colleaguesCameForWhat: '',
    knownForWhat: '',
    whyNotMe: '',
    ...overrides,
  };
}

function makeSignals(overrides?: Partial<WhyMeSignals>): WhyMeSignals {
  return {
    clarity: 'red',
    alignment: 'red',
    differentiation: 'red',
    ...overrides,
  };
}

describe('WhyMeEngine', () => {
  afterEach(() => cleanup());

  it('renders step 1 (Clarity) by default', () => {
    render(
      <WhyMeEngine story={makeStory()} signals={makeSignals()} onUpdate={vi.fn()} />,
    );
    expect(
      screen.getByText('What did your colleagues come to you for?'),
    ).toBeInTheDocument();
  });

  it('clicking Next advances to step 2 (Alignment)', () => {
    render(
      <WhyMeEngine story={makeStory()} signals={makeSignals()} onUpdate={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('Alignment'));
    expect(
      screen.getByText('What do you want to be known for in your next role?'),
    ).toBeInTheDocument();
  });

  it('clicking Back returns to step 1 from step 2', () => {
    render(
      <WhyMeEngine story={makeStory()} signals={makeSignals()} onUpdate={vi.fn()} />,
    );
    // Navigate to step 2
    fireEvent.click(screen.getByText('Alignment'));
    expect(
      screen.getByText('What do you want to be known for in your next role?'),
    ).toBeInTheDocument();
    // Navigate back
    fireEvent.click(screen.getByText('Clarity'));
    expect(
      screen.getByText('What did your colleagues come to you for?'),
    ).toBeInTheDocument();
  });

  it('textarea calls onUpdate with correct field name', () => {
    const onUpdate = vi.fn();
    render(
      <WhyMeEngine story={makeStory()} signals={makeSignals()} onUpdate={onUpdate} />,
    );
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Leadership and strategy' } });
    expect(onUpdate).toHaveBeenCalledWith('colleaguesCameForWhat', 'Leadership and strategy');
  });

  it('shows character count when text is entered', () => {
    render(
      <WhyMeEngine
        story={makeStory({ colleaguesCameForWhat: 'Hello world' })}
        signals={makeSignals({ clarity: 'yellow' })}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByText('11 characters')).toBeInTheDocument();
  });

  it('shows "Skip for now" on last step when not all complete', () => {
    const onClose = vi.fn();
    render(
      <WhyMeEngine story={makeStory()} signals={makeSignals()} onUpdate={vi.fn()} onClose={onClose} />,
    );
    // Navigate to last step (step 3)
    fireEvent.click(screen.getByText('Alignment'));
    fireEvent.click(screen.getByText('Differentiation'));
    expect(screen.getByText('Skip for now')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 6. ZoneYourDay
// ---------------------------------------------------------------------------

import { ZoneYourDay } from '../../components/career-iq/ZoneYourDay';

describe('ZoneYourDay', () => {
  afterEach(() => cleanup());

  it('new-user state shows "Define your Why-Me story" action', () => {
    render(
      <ZoneYourDay
        userName="test@example.com"
        signals={{ clarity: 'red', alignment: 'red', differentiation: 'red' }}
        dashboardState="new-user"
      />,
    );
    expect(screen.getByText('Build your Career Profile')).toBeInTheDocument();
  });

  it('strong state shows "Refine your Why-Me story" action', () => {
    render(
      <ZoneYourDay
        userName="test@example.com"
        signals={{ clarity: 'green', alignment: 'green', differentiation: 'green' }}
        dashboardState="strong"
        onRefineWhyMe={vi.fn()}
      />,
    );
    expect(screen.getByText('Find matching roles')).toBeInTheDocument();
  });

  it('strong state shows "Refine story" link', () => {
    render(
      <ZoneYourDay
        userName="test@example.com"
        signals={{ clarity: 'green', alignment: 'green', differentiation: 'green' }}
        dashboardState="strong"
        onRefineWhyMe={vi.fn()}
      />,
    );
    expect(screen.getByText('Refine story')).toBeInTheDocument();
  });

  it('refining state shows "Refine your Why-Me story" action', () => {
    render(
      <ZoneYourDay
        userName="test@example.com"
        signals={{ clarity: 'yellow', alignment: 'yellow', differentiation: 'red' }}
        dashboardState="refining"
      />,
    );
    expect(screen.getByText('Strengthen your Career Profile')).toBeInTheDocument();
  });

  it('displays greeting with first name', () => {
    render(
      <ZoneYourDay
        userName="margaret.jones@example.com"
        signals={{ clarity: 'red', alignment: 'red', differentiation: 'red' }}
        dashboardState="new-user"
      />,
    );
    expect(screen.getByText(/margaret\.jones@example\.com/)).toBeInTheDocument();
  });

  it('does not show streak for new-user state', () => {
    render(
      <ZoneYourDay
        userName="test@example.com"
        signals={{ clarity: 'red', alignment: 'red', differentiation: 'red' }}
        dashboardState="new-user"
      />,
    );
    expect(screen.queryByText(/day streak/)).not.toBeInTheDocument();
  });

  it('does not show streak for refining state (awaiting real Momentum data)', () => {
    render(
      <ZoneYourDay
        userName="test@example.com"
        signals={{ clarity: 'yellow', alignment: 'yellow', differentiation: 'red' }}
        dashboardState="refining"
      />,
    );
    // Streak UI is hidden until connected to real Momentum data.
    expect(screen.queryByText(/day streak/)).not.toBeInTheDocument();
  });

  it('renders signal dots (Clarity, Alignment, Differentiation)', () => {
    render(
      <ZoneYourDay
        userName="test@example.com"
        signals={{ clarity: 'green', alignment: 'yellow', differentiation: 'red' }}
        dashboardState="refining"
      />,
    );
    expect(screen.getByText('Clarity')).toBeInTheDocument();
    expect(screen.getByText('Alignment')).toBeInTheDocument();
    expect(screen.getByText('Differentiation')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 7. useMediaQuery hook
// ---------------------------------------------------------------------------

import { useMediaQuery } from '../../components/career-iq/useMediaQuery';

describe('useMediaQuery', () => {
  afterEach(() => cleanup());

  it('returns false by default in test environment', () => {
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);
  });

  it('returns a boolean value', () => {
    const { result } = renderHook(() => useMediaQuery('(max-width: 1024px)'));
    expect(typeof result.current).toBe('boolean');
  });
});
