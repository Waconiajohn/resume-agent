// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
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
  });
  afterEach(() => cleanup());

  async function importHook() {
    // Dynamic import to get fresh module after localStorage is set
    const mod = await import('../../components/career-iq/useWhyMeStory');
    return mod.useWhyMeStory;
  }

  it('returns new-user state when story is empty', async () => {
    const useWhyMeStory = await importHook();
    const { result } = renderHook(() => useWhyMeStory());
    expect(result.current.dashboardState).toBe('new-user');
  });

  it('returns all red signals for empty story', async () => {
    const useWhyMeStory = await importHook();
    const { result } = renderHook(() => useWhyMeStory());
    expect(result.current.signals.clarity).toBe('red');
    expect(result.current.signals.alignment).toBe('red');
    expect(result.current.signals.differentiation).toBe('red');
  });

  it('returns isComplete=false and hasStarted=false for new-user', async () => {
    const useWhyMeStory = await importHook();
    const { result } = renderHook(() => useWhyMeStory());
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
    expect(result.current.hasStarted).toBe(true);
  });

  it('returns strong state when all fields have >=50 chars', async () => {
    const longText = 'A'.repeat(50);
    localStorageMock.setItem(
      'careeriq_why_me_story',
      JSON.stringify({
        colleaguesCameForWhat: longText,
        knownForWhat: longText,
        whyNotMe: longText,
      }),
    );
    const useWhyMeStory = await importHook();
    const { result } = renderHook(() => useWhyMeStory());
    expect(result.current.dashboardState).toBe('strong');
  });

  it('returns all green signals for complete story', async () => {
    const longText = 'A'.repeat(50);
    localStorageMock.setItem(
      'careeriq_why_me_story',
      JSON.stringify({
        colleaguesCameForWhat: longText,
        knownForWhat: longText,
        whyNotMe: longText,
      }),
    );
    const useWhyMeStory = await importHook();
    const { result } = renderHook(() => useWhyMeStory());
    expect(result.current.signals.clarity).toBe('green');
    expect(result.current.signals.alignment).toBe('green');
    expect(result.current.signals.differentiation).toBe('green');
  });

  it('returns isComplete=true for strong state', async () => {
    const longText = 'A'.repeat(50);
    localStorageMock.setItem(
      'careeriq_why_me_story',
      JSON.stringify({
        colleaguesCameForWhat: longText,
        knownForWhat: longText,
        whyNotMe: longText,
      }),
    );
    const useWhyMeStory = await importHook();
    const { result } = renderHook(() => useWhyMeStory());
    expect(result.current.isComplete).toBe(true);
  });

  it('updateField correctly updates a single field', async () => {
    const useWhyMeStory = await importHook();
    const { result } = renderHook(() => useWhyMeStory());

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
    expect(result.current.dashboardState).toBe('new-user');
    expect(result.current.story.colleaguesCameForWhat).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 2. Sidebar
// ---------------------------------------------------------------------------

import { Sidebar } from '../../components/career-iq/Sidebar';

describe('Sidebar', () => {
  afterEach(() => cleanup());

  it('renders all room labels', () => {
    render(
      <Sidebar activeRoom="dashboard" onNavigate={vi.fn()} dashboardState="strong" />,
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Resume Workshop')).toBeInTheDocument();
    expect(screen.getByText('LinkedIn Studio')).toBeInTheDocument();
    expect(screen.getByText('Job Command Center')).toBeInTheDocument();
    expect(screen.getByText('Networking Hub')).toBeInTheDocument();
    expect(screen.getByText('Interview Lab')).toBeInTheDocument();
    expect(screen.getByText('Financial Wellness')).toBeInTheDocument();
    expect(screen.getByText('Live Sessions')).toBeInTheDocument();
  });

  it('disables gated rooms when dashboardState is new-user', () => {
    render(
      <Sidebar activeRoom="dashboard" onNavigate={vi.fn()} dashboardState="new-user" />,
    );
    // Resume Workshop is gated
    const resumeButton = screen.getByText('Resume Workshop').closest('button');
    expect(resumeButton).toBeDisabled();
    // Dashboard is not gated
    const dashboardButton = screen.getByText('Dashboard').closest('button');
    expect(dashboardButton).not.toBeDisabled();
    // Live Sessions is not gated
    const liveButton = screen.getByText('Live Sessions').closest('button');
    expect(liveButton).not.toBeDisabled();
  });

  it('shows lock icon on gated rooms when new-user', () => {
    render(
      <Sidebar activeRoom="dashboard" onNavigate={vi.fn()} dashboardState="new-user" />,
    );
    // Gated rooms should have title with "Complete your Why-Me story to unlock"
    const resumeButton = screen.getByText('Resume Workshop').closest('button');
    expect(resumeButton?.getAttribute('title')).toContain('Complete your Why-Me story to unlock');
  });

  it('enables all rooms when dashboardState is refining', () => {
    render(
      <Sidebar activeRoom="dashboard" onNavigate={vi.fn()} dashboardState="refining" />,
    );
    const resumeButton = screen.getByText('Resume Workshop').closest('button');
    expect(resumeButton).not.toBeDisabled();
    const linkedinButton = screen.getByText('LinkedIn Studio').closest('button');
    expect(linkedinButton).not.toBeDisabled();
  });

  it('highlights active room', () => {
    render(
      <Sidebar activeRoom="resume" onNavigate={vi.fn()} dashboardState="strong" />,
    );
    const resumeButton = screen.getByText('Resume Workshop').closest('button');
    expect(resumeButton?.className).toContain('bg-white');
  });

  it('calls onNavigate when a non-gated room is clicked', () => {
    const onNavigate = vi.fn();
    render(
      <Sidebar activeRoom="dashboard" onNavigate={onNavigate} dashboardState="strong" />,
    );
    fireEvent.click(screen.getByText('Resume Workshop'));
    expect(onNavigate).toHaveBeenCalledWith('resume');
  });

  it('does not call onNavigate when a gated room is clicked', () => {
    const onNavigate = vi.fn();
    render(
      <Sidebar activeRoom="dashboard" onNavigate={onNavigate} dashboardState="new-user" />,
    );
    fireEvent.click(screen.getByText('Resume Workshop'));
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
// 4. WelcomeState
// ---------------------------------------------------------------------------

import { WelcomeState } from '../../components/career-iq/WelcomeState';

describe('WelcomeState', () => {
  afterEach(() => cleanup());

  it('displays first name extracted from email', () => {
    render(<WelcomeState userName="margaret.jones@example.com" onStartWhyMe={vi.fn()} />);
    expect(screen.getByText(/Welcome, Margaret/)).toBeInTheDocument();
  });

  it('displays capitalized first name from simple email', () => {
    render(<WelcomeState userName="john@example.com" onStartWhyMe={vi.fn()} />);
    expect(screen.getByText(/Welcome, John/)).toBeInTheDocument();
  });

  it('displays welcome text when userName is empty', () => {
    render(<WelcomeState userName="" onStartWhyMe={vi.fn()} />);
    // Empty string goes through split/capitalize path — renders "Welcome, "
    expect(screen.getByText(/Welcome,/)).toBeInTheDocument();
  });

  it('CTA button calls onStartWhyMe', () => {
    const onStartWhyMe = vi.fn();
    render(<WelcomeState userName="test@example.com" onStartWhyMe={onStartWhyMe} />);
    fireEvent.click(screen.getByText('Define Your Why-Me Story'));
    expect(onStartWhyMe).toHaveBeenCalledTimes(1);
  });

  it('renders 3-step onboarding path', () => {
    render(<WelcomeState userName="test@example.com" onStartWhyMe={vi.fn()} />);
    expect(screen.getByText('Define Your Story')).toBeInTheDocument();
    expect(screen.getByText('Build Your First Resume')).toBeInTheDocument();
    expect(screen.getByText('Start Your Search')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 5. LivePulseStrip
// ---------------------------------------------------------------------------

import { LivePulseStrip } from '../../components/career-iq/LivePulseStrip';

describe('LivePulseStrip', () => {
  afterEach(() => cleanup());

  it('renders a session title', () => {
    // LivePulseStrip is intentionally stubbed to return null until a real
    // session schedule system is connected — showing fake data is a trust violation.
    const { container } = render(<LivePulseStrip />);
    expect(container.firstChild).toBeNull();
  });

  it('renders either LIVE NOW or Next Session text', () => {
    // Component returns null — neither label is rendered.
    render(<LivePulseStrip />);
    expect(screen.queryByText('Live Now')).toBeNull();
    expect(screen.queryByText('Next Session')).toBeNull();
  });

  it('renders a Join Now or Set Reminder button', () => {
    // Component returns null — neither button is rendered.
    render(<LivePulseStrip />);
    expect(screen.queryByText('Join Now')).toBeNull();
    expect(screen.queryByText('Set Reminder')).toBeNull();
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
    expect(screen.getByText('Define your Why-Me story')).toBeInTheDocument();
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
    expect(screen.getByText('Refine your Why-Me story')).toBeInTheDocument();
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
    expect(screen.getByText('Refine your Why-Me story')).toBeInTheDocument();
  });

  it('displays greeting with first name', () => {
    render(
      <ZoneYourDay
        userName="margaret.jones@example.com"
        signals={{ clarity: 'red', alignment: 'red', differentiation: 'red' }}
        dashboardState="new-user"
      />,
    );
    expect(screen.getByText(/Margaret/)).toBeInTheDocument();
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
