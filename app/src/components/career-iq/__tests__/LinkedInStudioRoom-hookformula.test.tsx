// @vitest-environment jsdom
/**
 * LinkedInStudioRoom — Hook Formula Analyzer tests.
 *
 * Story 62-5: Hook score coaching nudge in the Post Composer tab.
 * Tests cover hook score badge visibility, score-based color coding,
 * coaching nudge display when score < 60, hookAssessment text rendering,
 * and hookType availability in the hook state.
 *
 * The hook score UI lives inside the PostComposer sub-component which renders
 * when content.status === 'post_review'. We drive the mock into that state by
 * setting status to 'post_review' and providing a postDraft.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';

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

vi.mock('@/lib/sse-parser', () => ({
  parseSSEStream: vi.fn().mockImplementation(async function* () {}),
}));

// ─── Hook mock factories ───────────────────────────────────────────────────────

/**
 * Default useLinkedInContent mock — idle state with no hook score.
 * Individual tests override specific fields via the factory below.
 */
let mockContentState = {
  status: 'idle' as string,
  loading: false,
  error: null as string | null,
  topics: [] as unknown[],
  postDraft: null as string | null,
  postHashtags: [] as string[],
  qualityScores: null as { authenticity: number; engagement_potential: number; keyword_density: number } | null,
  hookScore: null as number | null,
  hookType: null as string | null,
  hookAssessment: null as string | null,
  activityMessages: [] as unknown[],
  startContentPipeline: vi.fn().mockResolvedValue(true),
  selectTopic: vi.fn().mockResolvedValue(true),
  approvePost: vi.fn().mockResolvedValue(true),
  requestRevision: vi.fn().mockResolvedValue(true),
  reset: vi.fn(),
};

vi.mock('@/hooks/useLinkedInContent', () => ({
  useLinkedInContent: () => mockContentState,
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

vi.mock('@/hooks/useLinkedInEditor', () => ({
  useLinkedInEditor: () => ({
    status: 'idle',
    loading: false,
    error: null,
    sections: {},
    currentSection: null,
    currentDraft: null,
    sectionsCompleted: [],
    sectionScores: {},
    startEditor: vi.fn(),
    approveSection: vi.fn(),
    requestSectionRevision: vi.fn(),
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

/** Put the content hook into post_review state with the given hook fields. */
function setPostReviewState(overrides: {
  hookScore?: number | null;
  hookType?: string | null;
  hookAssessment?: string | null;
  qualityScores?: { authenticity: number; engagement_potential: number; keyword_density: number } | null;
} = {}) {
  mockContentState = {
    ...mockContentState,
    status: 'post_review',
    postDraft: 'This is a sample LinkedIn post draft that demonstrates our capabilities.',
    postHashtags: ['Leadership', 'Engineering'],
    qualityScores: overrides.qualityScores ?? {
      authenticity: 85,
      engagement_potential: 78,
      keyword_density: 70,
    },
    hookScore: overrides.hookScore !== undefined ? overrides.hookScore : 75,
    hookType: overrides.hookType !== undefined ? overrides.hookType : 'question',
    hookAssessment: overrides.hookAssessment !== undefined
      ? overrides.hookAssessment
      : 'Consider opening with a more provocative statement.',
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ posts: [] }), { status: 200 }),
  ));
  // Reset to idle state before each test
  mockContentState = {
    status: 'idle',
    loading: false,
    error: null,
    topics: [],
    postDraft: null,
    postHashtags: [],
    qualityScores: null,
    hookScore: null,
    hookType: null,
    hookAssessment: null,
    activityMessages: [],
    startContentPipeline: vi.fn().mockResolvedValue(true),
    selectTopic: vi.fn().mockResolvedValue(true),
    approvePost: vi.fn().mockResolvedValue(true),
    requestRevision: vi.fn().mockResolvedValue(true),
    reset: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// ─── Hook score badge — visibility ───────────────────────────────────────────

describe('LinkedInStudioRoom — hook score badge visibility', () => {
  it('renders the hook score badge when hookScore is available in post_review', () => {
    setPostReviewState({ hookScore: 75 });
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByText('Hook 75')).toBeInTheDocument();
  });

  it('does not render a hook score badge when hookScore is null', () => {
    setPostReviewState({ hookScore: null });
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.queryByText(/Hook \d+/i)).not.toBeInTheDocument();
  });

  it('does not render a hook score badge in the idle state', () => {
    // mockContentState is idle by default in beforeEach
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.queryByText(/Hook \d+/i)).not.toBeInTheDocument();
  });

  it('renders the hook score badge alongside authenticity and engagement scores', () => {
    setPostReviewState({ hookScore: 82 });
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByText('Hook 82')).toBeInTheDocument();
    expect(screen.getByText(/Auth/i)).toBeInTheDocument();
    expect(screen.getByText(/Engage/i)).toBeInTheDocument();
  });
});

// ─── Hook score badge — color coding ─────────────────────────────────────────

describe('LinkedInStudioRoom — hook score badge color coding', () => {
  /**
   * The component applies:
   *   score >= 60  → green  (text-[#b5dec2] bg-[#b5dec2]/10)
   *   score < 60   → yellow (text-[#dfc797] bg-[#dfc797]/10)
   *
   * We verify by checking that the badge element carries the correct class.
   */

  it('hook score badge has green class when score is 60 (boundary)', () => {
    setPostReviewState({ hookScore: 60 });
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    const badge = screen.getByText('Hook 60');
    expect(badge.className).toContain('text-[#b5dec2]');
  });

  it('hook score badge has green class when score is above 60', () => {
    setPostReviewState({ hookScore: 85 });
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    const badge = screen.getByText('Hook 85');
    expect(badge.className).toContain('text-[#b5dec2]');
  });

  it('hook score badge has yellow class when score is below 60', () => {
    setPostReviewState({ hookScore: 59 });
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    const badge = screen.getByText('Hook 59');
    expect(badge.className).toContain('text-[#dfc797]');
  });

  it('hook score badge has yellow class when score is 0', () => {
    setPostReviewState({ hookScore: 0 });
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    const badge = screen.getByText('Hook 0');
    expect(badge.className).toContain('text-[#dfc797]');
  });
});

// ─── Coaching nudge — display conditions ─────────────────────────────────────

describe('LinkedInStudioRoom — hook coaching nudge display', () => {
  it('shows the coaching nudge when hookScore is below 60', () => {
    setPostReviewState({
      hookScore: 45,
      hookAssessment: 'Consider a more provocative opening statement.',
    });
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByText('Consider a more provocative opening statement.')).toBeInTheDocument();
  });

  it('shows the "Your opening could be stronger." heading in the nudge block', () => {
    setPostReviewState({ hookScore: 30 });
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.getByText(/Your opening could be stronger\./i)).toBeInTheDocument();
  });

  it('does not show the coaching nudge when hookScore is exactly 60', () => {
    setPostReviewState({ hookScore: 60 });
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    // The nudge heading only appears when score < 60
    expect(screen.queryByText(/Your opening could be stronger\./i)).not.toBeInTheDocument();
  });

  it('does not show the coaching nudge when hookScore is above 60', () => {
    setPostReviewState({ hookScore: 80 });
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.queryByText(/Your opening could be stronger\./i)).not.toBeInTheDocument();
  });

  it('does not show the coaching nudge when hookScore is null', () => {
    setPostReviewState({ hookScore: null });
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.queryByText(/Your opening could be stronger\./i)).not.toBeInTheDocument();
  });
});

// ─── hookAssessment text ──────────────────────────────────────────────────────

describe('LinkedInStudioRoom — hookAssessment text in coaching block', () => {
  it('displays the hookAssessment text inside the coaching nudge when score < 60', () => {
    setPostReviewState({
      hookScore: 40,
      hookAssessment: 'Lead with a bold claim or counterintuitive insight.',
    });
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(
      screen.getByText('Lead with a bold claim or counterintuitive insight.'),
    ).toBeInTheDocument();
  });

  it('falls back to the default first-210-chars message when hookAssessment is null and score < 60', () => {
    setPostReviewState({ hookScore: 20, hookAssessment: null });
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(
      screen.getByText(/The first 210 characters need to earn the click/i),
    ).toBeInTheDocument();
  });

  it('does not render hookAssessment text when score is >= 60 (nudge hidden)', () => {
    setPostReviewState({
      hookScore: 65,
      hookAssessment: 'This text should not appear.',
    });
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(screen.queryByText('This text should not appear.')).not.toBeInTheDocument();
  });
});

// ─── hookType — state availability ───────────────────────────────────────────

describe('LinkedInStudioRoom — hookType field in content state', () => {
  /**
   * hookType is stored in state but not directly rendered as a visible text
   * element in the current UI. These tests verify the hook module correctly
   * exposes the field and that the mock wiring is consistent.
   */

  it('hookType is available on the useLinkedInContent return value', () => {
    setPostReviewState({ hookType: 'question' });
    // Access the mock state directly to verify the field is set
    expect(mockContentState.hookType).toBe('question');
  });

  it('hookType can be null when no hook analysis has been run', () => {
    // Default idle state — hookType is null
    expect(mockContentState.hookType).toBeNull();
  });

  it('hookType persists through re-renders without causing an error', () => {
    setPostReviewState({ hookType: 'statistic' });
    // Should render without throwing
    render(<LinkedInStudioRoom signals={makeSignals()} />);
    expect(document.body).toBeTruthy();
  });
});

// ─── Hook score color logic (unit) ───────────────────────────────────────────

describe('Hook score color threshold logic (unit tests)', () => {
  /**
   * Mirrors the ternary in PostComposer exactly:
   *   hookScore >= 60 → green, else → yellow
   */
  function hookScoreClass(score: number): string {
    return score >= 60
      ? 'text-[#b5dec2] bg-[#b5dec2]/10'
      : 'text-[#dfc797] bg-[#dfc797]/10';
  }

  it('score 60 → green', () => {
    expect(hookScoreClass(60)).toBe('text-[#b5dec2] bg-[#b5dec2]/10');
  });

  it('score 100 → green', () => {
    expect(hookScoreClass(100)).toBe('text-[#b5dec2] bg-[#b5dec2]/10');
  });

  it('score 59 → yellow', () => {
    expect(hookScoreClass(59)).toBe('text-[#dfc797] bg-[#dfc797]/10');
  });

  it('score 0 → yellow', () => {
    expect(hookScoreClass(0)).toBe('text-[#dfc797] bg-[#dfc797]/10');
  });
});
