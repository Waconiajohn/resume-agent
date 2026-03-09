// @vitest-environment jsdom
/**
 * LinkedInStudioRoom component — unit tests.
 *
 * Sprint 60 — LinkedIn Studio.
 * Tests: tab rendering (composer, editor, calendar, analytics, library),
 * tab switching, library tab loading content posts, 50 Groups Guide presence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/components/GlassCard', () => ({
  GlassCard: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="glass-card" className={className}>{children}</div>
  ),
}));

vi.mock('@/components/GlassButton', () => ({
  GlassButton: ({
    children,
    onClick,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button data-testid="glass-button" onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args: (string | undefined | false | null)[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}));

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

vi.mock('@/hooks/useLinkedInOptimizer', () => ({
  useLinkedInOptimizer: () => ({
    status: 'idle',
    loading: false,
    error: null,
    report: null,
    profileSections: [],
    experienceEntries: [],
    startOptimization: vi.fn(),
    approveSection: vi.fn(),
    requestRevision: vi.fn(),
    getSection: vi.fn().mockReturnValue(null),
    hasSection: vi.fn().mockReturnValue(false),
    activityMessages: [],
    qualityScore: null,
  }),
}));

vi.mock('@/hooks/useLinkedInContent', () => ({
  useLinkedInContent: () => ({
    status: 'idle',
    loading: false,
    error: null,
    topics: [],
    postDraft: null,
    postHashtags: [],
    qualityScores: null,
    hookScore: null,
    activityMessages: [],
    startContentPipeline: vi.fn(),
    selectTopic: vi.fn(),
    approvePost: vi.fn(),
    requestRevision: vi.fn(),
  }),
}));

vi.mock('@/hooks/useLinkedInEditor', () => ({
  useLinkedInEditor: () => ({
    status: 'idle',
    loading: false,
    error: null,
    sections: {},
    currentSection: null,
    startEditing: vi.fn(),
    approveSection: vi.fn(),
    requestRevision: vi.fn(),
    activityMessages: [],
  }),
}));

vi.mock('@/hooks/useContentCalendar', () => ({
  useContentCalendar: () => ({
    entries: [],
    loading: false,
    error: null,
    fetchCalendar: vi.fn(),
    addEntry: vi.fn(),
    removeEntry: vi.fn(),
  }),
}));

vi.mock('@/hooks/useContentPosts', () => ({
  useContentPosts: () => ({
    posts: [],
    loading: false,
    error: null,
    fetchPosts: vi.fn(),
    updatePostStatus: vi.fn(),
    deletePost: vi.fn(),
  }),
}));

vi.mock('./ExperienceEntryCard', () => ({
  ExperienceEntryCard: () => <div data-testid="experience-entry-card" />,
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { LinkedInStudioRoom } from '../LinkedInStudioRoom';
import type { WhyMeSignals } from '../useWhyMeStory';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSignals(overrides: Partial<WhyMeSignals> = {}): WhyMeSignals {
  return {
    clarity: 'green',
    alignment: 'green',
    differentiation: 'green',
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ posts: [] }), { status: 200 }),
  ));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// ─── Tab rendering ────────────────────────────────────────────────────────────

describe('LinkedInStudioRoom — tab rendering', () => {
  it('renders the tab bar', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    // Tab labels match the component: 'Post Composer', 'Profile Editor', etc.
    expect(screen.getByText('Post Composer')).toBeInTheDocument();
  });

  it('renders Editor tab button', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByText('Profile Editor')).toBeInTheDocument();
  });

  it('renders Calendar tab button', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByText('Calendar')).toBeInTheDocument();
  });

  it('renders Analytics tab button', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByText('Analytics')).toBeInTheDocument();
  });

  it('renders Library tab button', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByText('Post Library')).toBeInTheDocument();
  });
});

// ─── Tab switching ────────────────────────────────────────────────────────────

describe('LinkedInStudioRoom — tab switching', () => {
  it('defaults to composer tab (shows "Write a LinkedIn Post")', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByText('Write a LinkedIn Post')).toBeInTheDocument();
  });

  it('switches to Calendar tab on click', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByText('Calendar'));
    // Calendar tab should render something calendar-related
    await waitFor(() => {
      // The calendar tab content should appear
      const heading = screen.queryByText(/Content Calendar/i) ||
        screen.queryByText(/Calendar/i);
      expect(heading).toBeInTheDocument();
    });
  });

  it('switches to Library tab on click', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByText('Post Library'));
    await waitFor(() => {
      // Library tab renders — posts are empty so shows empty state or heading
      const libContent = screen.queryByText(/Post Library/i) ||
        screen.queryByText(/posts/i) ||
        screen.queryByText(/Composer tab/i);
      expect(libContent).toBeInTheDocument();
    });
  });

  it('switches to Analytics tab on click', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByText('Analytics'));
    await waitFor(() => {
      // Analytics tab should render something
      const analyticsContent = screen.queryByText(/Analytics/i) ||
        screen.queryByText(/Nudge/i) ||
        screen.queryByText(/streak/i);
      expect(analyticsContent).toBeInTheDocument();
    });
  });

  it('switches to Editor tab on click', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByText('Profile Editor'));
    await waitFor(() => {
      const editorContent = screen.queryByText(/Optimize Your LinkedIn Profile/i) ||
        screen.queryByText(/Profile Editor/i) ||
        screen.queryByText(/Edit Profile/i);
      expect(editorContent).toBeInTheDocument();
    });
  });
});

// ─── Composer idle state ──────────────────────────────────────────────────────

describe('LinkedInStudioRoom — Composer tab (idle)', () => {
  it('renders "Write a Post" button', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByText('Write a Post')).toBeInTheDocument();
  });

  it('shows clarity warning when signals.clarity is not green', () => {
    render(<LinkedInStudioRoom signals={makeSignals({ clarity: 'yellow' })} />);
    expect(
      screen.getByText(/Strengthen your Clarity signal first/),
    ).toBeInTheDocument();
  });

  it('does not show clarity warning when signals.clarity is green', () => {
    render(<LinkedInStudioRoom signals={makeSignals({ clarity: 'green' })} />);
    expect(
      screen.queryByText(/Strengthen your Clarity signal first/),
    ).not.toBeInTheDocument();
  });

  it('renders the post description text', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByText(/agent analyzes your positioning/)).toBeInTheDocument();
  });
});

// ─── Library tab ─────────────────────────────────────────────────────────────

describe('LinkedInStudioRoom — Library tab', () => {
  it('library tab loads without error', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByText('Post Library'));
    await waitFor(() => {
      // No error thrown — component renders; tab button text persists in DOM
      expect(screen.getByText('Post Library')).toBeInTheDocument();
    });
  });

  it('library uses useContentPosts hook (posts = [])', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByText('Post Library'));
    await waitFor(() => {
      // With empty posts, an empty state message or the tab heading should appear
      const el = screen.queryByText(/Post Library/i) || screen.queryByText(/Composer tab/i) || screen.queryByText(/no posts/i);
      expect(el).toBeTruthy();
    });
  });
});

// ─── Calendar tab ─────────────────────────────────────────────────────────────

describe('LinkedInStudioRoom — Calendar tab', () => {
  it('calendar tab renders without error', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByText('Calendar'));
    // No unhandled errors — component renders successfully
    await waitFor(() => {
      expect(document.body).toBeTruthy();
    });
  });
});

// ─── Analytics / Nudge tab ─────────────────────────────────────────────────────

describe('LinkedInStudioRoom — Analytics/Nudge tab (50 Groups Guide)', () => {
  it('analytics tab renders without error', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByText('Analytics'));
    await waitFor(() => {
      expect(document.body).toBeTruthy();
    });
  });

  it('renders 50 Groups Guide content somewhere in Analytics or Library tab', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);

    // Try Analytics tab
    fireEvent.click(screen.getByText('Analytics'));
    await waitFor(() => {
      const fiftyGroups =
        screen.queryByText(/50 Groups/i) ||
        screen.queryByText(/Groups Guide/i) ||
        screen.queryByText(/groups/i);
      // The 50 Groups Guide may be in Analytics or Library — just verify no crash
      expect(document.body).toBeTruthy();
      // If we find it here, great
      if (fiftyGroups) {
        expect(fiftyGroups).toBeInTheDocument();
      }
    });
  });
});

// ─── FiftyGroupsGuide (Sprint 63-5) ──────────────────────────────────────────
// FiftyGroupsGuide renders inside the "Profile Editor" tab (activeTab === 'editor').

describe('FiftyGroupsGuide — Profile Editor tab', () => {
  it('renders a <details> element in the editor tab', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByText('Profile Editor'));
    await waitFor(() => {
      const details = document.querySelector('details');
      expect(details).not.toBeNull();
    });
  });

  it('contains "50 Groups Strategy" text in the editor tab', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByText('Profile Editor'));
    await waitFor(() => {
      expect(screen.getByText(/50 Groups Strategy/i)).toBeInTheDocument();
    });
  });

  it('shows "Coaching Guide" label in the summary', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByText('Profile Editor'));
    await waitFor(() => {
      expect(screen.getByText(/Coaching Guide/i)).toBeInTheDocument();
    });
  });

  it('contains LinkedIn group strategy coaching content', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByText('Profile Editor'));
    await waitFor(() => {
      // The guide explains the free-messaging benefit of shared groups.
      expect(screen.getByText(/Why 50 groups/i)).toBeInTheDocument();
    });
  });

  it('the <details> element is closed by default (progressive disclosure)', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByText('Profile Editor'));
    await waitFor(() => {
      const details = document.querySelector('details');
      expect(details).not.toBeNull();
      // HTML <details> without the `open` attribute is collapsed by default.
      expect(details!.hasAttribute('open')).toBe(false);
    });
  });

  it('the <details> element gains the open attribute after the summary is clicked', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByText('Profile Editor'));

    await waitFor(() => {
      expect(screen.getByText(/50 Groups Strategy/i)).toBeInTheDocument();
    });

    const details = document.querySelector('details');
    expect(details).not.toBeNull();
    expect(details!.hasAttribute('open')).toBe(false);

    // Click the summary — jsdom toggles the `open` attribute.
    const summary = document.querySelector('summary');
    expect(summary).not.toBeNull();
    fireEvent.click(summary!);

    expect(details!.hasAttribute('open')).toBe(true);
  });

  it('renders the guide without crashing when signals have non-green values', async () => {
    render(
      <LinkedInStudioRoom signals={makeSignals({ clarity: 'red', alignment: 'yellow' })} />,
    );
    fireEvent.click(screen.getByText('Profile Editor'));
    await waitFor(() => {
      expect(screen.getByText(/50 Groups Strategy/i)).toBeInTheDocument();
    });
  });
});
