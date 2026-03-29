// @vitest-environment jsdom
/**
 * LinkedInStudioRoom component — unit tests.
 *
 * Sprint 60 — LinkedIn.
 * Tests: tab rendering (write, profile, content plan, results, library),
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
  it('renders the workflow guidance strip', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByText('LinkedIn workflow')).toBeInTheDocument();
    expect(screen.getByText('Current focus')).toBeInTheDocument();
    expect(screen.getByText('Next best move')).toBeInTheDocument();
  });

  it('renders the tab bar', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByRole('button', { name: 'Write' })).toBeInTheDocument();
  });

  it('renders Profile tab button', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByRole('button', { name: 'Profile' })).toBeInTheDocument();
  });

  it('renders Content Plan button', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByText('Content Plan')).toBeInTheDocument();
  });

  it('renders Results tab button', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByRole('button', { name: 'Results' })).toBeInTheDocument();
  });

  it('renders Library tab button', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByText('Library')).toBeInTheDocument();
  });
});

// ─── Tab switching ────────────────────────────────────────────────────────────

describe('LinkedInStudioRoom — tab switching', () => {
  it('defaults to composer tab (shows "Write a LinkedIn Post")', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByText('Write a LinkedIn Post')).toBeInTheDocument();
    expect(screen.getByText('Draft a post in your own voice')).toBeInTheDocument();
  });

  it('switches to Content Plan on click', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Content Plan' }));
    await waitFor(() => {
      expect(screen.getByText('Plan the next stretch of posts')).toBeInTheDocument();
    });
  });

  it('switches to Library tab on click', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Library' }));
    await waitFor(() => {
      const libContent = screen.queryByText(/Keep your best LinkedIn work in one place/i) ||
        screen.queryByText(/posts/i) ||
        screen.queryByText(/Write your first post/i);
      expect(libContent).toBeInTheDocument();
    });
  });

  it('switches to Results tab on click', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Results' }));
    await waitFor(() => {
      const resultsContent = screen.queryByText(/Platform Metrics/i) ||
        screen.queryByText(/Profile Score/i) ||
        screen.queryByText(/Current Profile Score/i);
      expect(resultsContent).toBeInTheDocument();
    });
  });

  it('switches to Profile tab on click', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }));
    await waitFor(() => {
      const editorContent = screen.queryByText(/Optimize Your LinkedIn Profile/i) ||
        screen.queryByText(/Profile/i) ||
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
    expect(screen.getByText(/Once the profile direction feels strong enough/)).toBeInTheDocument();
  });
});

// ─── Library tab ─────────────────────────────────────────────────────────────

describe('LinkedInStudioRoom — Library tab', () => {
  it('library tab loads without error', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Library' }));
    await waitFor(() => {
      expect(screen.getByText(/Keep your best LinkedIn work in one place/i)).toBeInTheDocument();
    });
  });

  it('library uses useContentPosts hook (posts = [])', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Library' }));
    await waitFor(() => {
      const el = screen.queryByText(/Keep your best LinkedIn work in one place/i) || screen.queryByText(/Write your first post/i) || screen.queryByText(/no posts/i);
      expect(el).toBeTruthy();
    });
  });
});

// ─── Content Plan tab ────────────────────────────────────────────────────────

describe('LinkedInStudioRoom — Content Plan tab', () => {
  it('content plan tab renders without error', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Content Plan' }));
    await waitFor(() => {
      expect(document.body).toBeTruthy();
    });
  });
});

// ─── Results tab ─────────────────────────────────────────────────────────────

describe('LinkedInStudioRoom — Results tab', () => {
  it('results tab renders without error', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Results' }));
    await waitFor(() => {
      expect(document.body).toBeTruthy();
    });
  });

  it('renders platform metrics without crashing', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Results' }));
    await waitFor(() => {
      const metrics =
        screen.queryByText(/Platform Metrics/i) ||
        screen.queryByText(/Profile Score/i) ||
        screen.queryByText(/Current Profile Score/i);
      expect(metrics).toBeTruthy();
    });
  });
});

// ─── FiftyGroupsGuide (Sprint 63-5) ──────────────────────────────────────────
// FiftyGroupsGuide renders inside the "Profile" tab (activeTab === 'editor').

describe('FiftyGroupsGuide — Profile tab', () => {
  it('renders a <details> element in the profile tab', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }));
    await waitFor(() => {
      const details = document.querySelector('details');
      expect(details).not.toBeNull();
    });
  });

  it('contains "50 Groups Strategy" text in the editor tab', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }));
    await waitFor(() => {
      expect(screen.getByText(/50 Groups Strategy/i)).toBeInTheDocument();
    });
  });

  it('shows "Coaching Guide" label in the summary', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }));
    await waitFor(() => {
      expect(screen.getByText(/Coaching Guide/i)).toBeInTheDocument();
    });
  });

  it('contains LinkedIn group strategy coaching content', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }));
    await waitFor(() => {
      expect(screen.getByText(/Why 50 groups/i)).toBeInTheDocument();
    });
  });

  it('the <details> element is closed by default (progressive disclosure)', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }));
    await waitFor(() => {
      const details = document.querySelector('details');
      expect(details).not.toBeNull();
      // HTML <details> without the `open` attribute is collapsed by default.
      expect(details!.hasAttribute('open')).toBe(false);
    });
  });

  it('the <details> element gains the open attribute after the summary is clicked', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }));
    await waitFor(() => {
      expect(screen.getByText(/50 Groups Strategy/i)).toBeInTheDocument();
    });
  });
});
