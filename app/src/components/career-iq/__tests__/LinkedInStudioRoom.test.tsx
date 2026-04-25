// @vitest-environment jsdom
/**
 * LinkedInStudioRoom component — unit tests.
 *
 * Sprint 60 — LinkedIn.
 * Tests: main workflow rendering, embedded support workspace launchers,
 * support workspace loading, and 50 Groups Guide presence.
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
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
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
  it('renders the tab bar with Profile Audit and Content tabs', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByRole('button', { name: 'Profile Audit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Content' })).toBeInTheDocument();
  });

  it('renders Profile Audit tab button', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByRole('button', { name: 'Profile Audit' })).toBeInTheDocument();
  });

  it('renders Content tab button', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByRole('button', { name: 'Content' })).toBeInTheDocument();
  });

  it('renders the Content Plan section when Content tab is active', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Content' }));
    expect(screen.getByText('Content Plan')).toBeInTheDocument();
  });

  it('renders the Post Library section when Content tab is active', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Content' }));
    expect(screen.getByText('Post Library')).toBeInTheDocument();
  });

  it('renders the LinkedIn eyebrow label', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByText('LinkedIn')).toBeInTheDocument();
  });
});

// ─── Tab switching ────────────────────────────────────────────────────────────

describe('LinkedInStudioRoom — tab switching', () => {
  it('defaults to profile audit tab showing profile content', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByText('Optimize Your LinkedIn Profile')).toBeInTheDocument();
  });

  it('switches to Content tab on click and shows PostComposer', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Content' }));
    await waitFor(() => {
      expect(screen.getByText('Write a Post')).toBeInTheDocument();
    });
  });

  it('shows Content Plan collapsible in Content tab', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Content' }));
    await waitFor(() => {
      expect(screen.getByText('Content Plan')).toBeInTheDocument();
    });
  });

  it('shows Post Library collapsible in Content tab', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Content' }));
    await waitFor(() => {
      expect(screen.getByText('Post Library')).toBeInTheDocument();
    });
  });

  it('switches back to Profile Audit tab on click', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Content' }));
    fireEvent.click(screen.getByRole('button', { name: 'Profile Audit' }));
    await waitFor(() => {
      expect(screen.getByText(/Optimize Your LinkedIn Profile/i)).toBeInTheDocument();
    });
  });
});

// ─── Composer idle state ──────────────────────────────────────────────────────

describe('LinkedInStudioRoom — Composer (Content tab, idle)', () => {
  it('renders "Write a Post" button in Content tab', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Content' }));
    expect(screen.getByText('Write a Post')).toBeInTheDocument();
  });

  it('shows clarity warning when signals.clarity is not green', () => {
    render(<LinkedInStudioRoom signals={makeSignals({ clarity: 'yellow' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Content' }));
    expect(
      screen.getByText(/Strengthen your Clarity signal first/),
    ).toBeInTheDocument();
  });

  it('does not show clarity warning when signals.clarity is green', () => {
    render(<LinkedInStudioRoom signals={makeSignals({ clarity: 'green' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Content' }));
    expect(
      screen.queryByText(/Strengthen your Clarity signal first/),
    ).not.toBeInTheDocument();
  });

  it('renders the post description text', () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Content' }));
    expect(screen.getByText(/Once the profile direction feels strong enough/)).toBeInTheDocument();
  });
});

// ─── Library tab ─────────────────────────────────────────────────────────────

describe('LinkedInStudioRoom — Library (Post Library in Content tab)', () => {
  it('Post Library section is present in Content tab', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Content' }));
    await waitFor(() => {
      expect(screen.getByText('Post Library')).toBeInTheDocument();
    });
  });

  it('Post Library collapsible renders without error', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Content' }));
    await waitFor(() => {
      expect(document.body).toBeTruthy();
    });
  });
});

// ─── Content Plan tab ────────────────────────────────────────────────────────

describe('LinkedInStudioRoom — Content Plan (in Content tab)', () => {
  it('Content Plan collapsible renders without error in Content tab', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Content' }));
    await waitFor(() => {
      expect(screen.getByText('Content Plan')).toBeInTheDocument();
    });
  });
});

// ─── Results tab ─────────────────────────────────────────────────────────────

describe('LinkedInStudioRoom — Profile Audit results section', () => {
  it('Profile Audit tab renders without error', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    await waitFor(() => {
      expect(document.body).toBeTruthy();
    });
  });

  it('hides profile metrics until there is a profile score', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    await waitFor(() => {
      expect(screen.getByText('Your Current LinkedIn Profile')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Current Profile Score/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Platform Metrics/i)).not.toBeInTheDocument();
  });
});

// ─── Profile Audit tab — input fields ────────────────────────────────────────

describe('LinkedInStudioRoom — Profile Audit input fields', () => {
  it('renders the profile input section heading', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    await waitFor(() => {
      expect(screen.getByText('Your Current LinkedIn Profile')).toBeInTheDocument();
    });
  });

  it('renders the Current Headline label', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    await waitFor(() => {
      expect(screen.getByText('Current Headline')).toBeInTheDocument();
    });
  });

  it('renders the Current About Section label', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    await waitFor(() => {
      expect(screen.getByText('Current About Section')).toBeInTheDocument();
    });
  });

  it('renders the headline input placeholder', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Senior Product Owner/i)).toBeInTheDocument();
    });
  });

  it('renders the profile editor workflow section', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    await waitFor(() => {
      expect(screen.getByText(/Optimize Your LinkedIn Profile/i)).toBeInTheDocument();
    });
  });

  it('renders without crashing when signals have non-green values', async () => {
    render(
      <LinkedInStudioRoom signals={makeSignals({ clarity: 'red', alignment: 'yellow' })} />,
    );
    await waitFor(() => {
      expect(screen.getByText('Your Current LinkedIn Profile')).toBeInTheDocument();
    });
  });

  it('renders the Profile Audit tab as active by default', async () => {
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    const profileAuditBtn = screen.getByRole('button', { name: 'Profile Audit' });
    expect(profileAuditBtn.className).toContain('text-[var(--link)]');
    expect(profileAuditBtn.className).toContain('border-[var(--link)]');
  });
});
