// @vitest-environment jsdom
/**
 * WhatsNextCTABar — Phase 4 of pursuit timeline.
 *
 * The bar reads from useApplicationTimeline and renders the top N next-rule
 * recommendations as buttons. These tests stub the hook so we can exercise
 * the rendering / routing / urgency / fallback / no-application branches in
 * isolation from the network.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { NextItem } from '@/lib/timeline/rules';

// ── Mocks ──────────────────────────────────────────────────────────────

const useApplicationTimelineMock = vi.fn();

vi.mock('@/hooks/useApplicationTimeline', () => ({
  useApplicationTimeline: (...args: unknown[]) => useApplicationTimelineMock(...args),
}));

// IAppliedCTA depends on useApplicationEvents which makes a real fetch — stub
// it to a recognizable element so the N3 special-case test can detect it.
vi.mock('@/components/applications/IAppliedCTA', () => ({
  IAppliedCTA: ({ applicationId }: { applicationId: string }) => (
    <div data-testid="iapplied-cta" data-application-id={applicationId}>
      I applied
    </div>
  ),
}));

import { WhatsNextCTABar } from '@/components/applications/WhatsNextCTABar';

// ── Helpers ─────────────────────────────────────────────────────────────

function buildNextItem(overrides: Partial<NextItem> = {}): NextItem {
  return {
    id: 'N1',
    tier: 'B',
    title: 'Tailor your resume for this role',
    body: '',
    target: 'resume',
    rankedAt: new Date().toISOString(),
    ...overrides,
  };
}

function setHook({
  next = [] as NextItem[],
  loading = false,
  error = null as string | null,
}: {
  next?: NextItem[];
  loading?: boolean;
  error?: string | null;
} = {}) {
  useApplicationTimelineMock.mockReturnValue({
    payload: null,
    done: [],
    next,
    theirTurn: [],
    hasAnyDone: false,
    loading,
    error,
    refresh: vi.fn(),
  });
}

beforeEach(() => {
  useApplicationTimelineMock.mockReset();
});

afterEach(() => cleanup());

// ── Tests ──────────────────────────────────────────────────────────────

describe('WhatsNextCTABar', () => {
  it('renders nothing when applicationId is undefined', () => {
    setHook({ next: [buildNextItem()] });
    const { container } = render(
      <MemoryRouter>
        <WhatsNextCTABar applicationId={undefined} />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
    // Hook still gets called with undefined; component bails before render.
    expect(useApplicationTimelineMock).toHaveBeenCalled();
  });

  it('renders nothing when timeline is loading', () => {
    setHook({ loading: true, next: [buildNextItem()] });
    const { container } = render(
      <MemoryRouter>
        <WhatsNextCTABar applicationId="app-1" />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the back-to-overview fallback when next[] is empty', () => {
    setHook({ next: [] });
    render(
      <MemoryRouter>
        <WhatsNextCTABar applicationId="app-1" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('whats-next-back-to-overview')).toBeInTheDocument();
    expect(screen.getByText(/back to overview/i)).toBeInTheDocument();
  });

  it('renders top 3 next entries by default', () => {
    setHook({
      next: [
        buildNextItem({ id: 'N1', title: 'Tailor your resume', target: 'resume' }),
        buildNextItem({ id: 'N2', title: 'Draft your cover letter', target: 'cover-letter' }),
        buildNextItem({ id: 'N5', tier: 'A', title: 'Prep for your interview', target: 'interview-prep' }),
        buildNextItem({ id: 'N7', tier: 'C', title: 'Plan your negotiation', target: 'offer-negotiation' }),
      ],
    });
    render(
      <MemoryRouter>
        <WhatsNextCTABar applicationId="app-1" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('whats-next-button-N1')).toBeInTheDocument();
    expect(screen.getByTestId('whats-next-button-N2')).toBeInTheDocument();
    expect(screen.getByTestId('whats-next-button-N5')).toBeInTheDocument();
    expect(screen.queryByTestId('whats-next-button-N7')).toBeNull();
  });

  it('honors maxButtons prop', () => {
    setHook({
      next: [
        buildNextItem({ id: 'N1', target: 'resume' }),
        buildNextItem({ id: 'N2', target: 'cover-letter' }),
      ],
    });
    render(
      <MemoryRouter>
        <WhatsNextCTABar applicationId="app-1" maxButtons={1} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('whats-next-button-N1')).toBeInTheDocument();
    expect(screen.queryByTestId('whats-next-button-N2')).toBeNull();
  });

  it('marks tier-A entries with the urgency indicator', () => {
    setHook({
      next: [
        buildNextItem({ id: 'N6', tier: 'A', title: 'Send your thank-you', target: 'thank-you-note' }),
        buildNextItem({ id: 'N1', tier: 'B', title: 'Tailor your resume', target: 'resume' }),
      ],
    });
    render(
      <MemoryRouter>
        <WhatsNextCTABar applicationId="app-1" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('whats-next-urgency-N6')).toBeInTheDocument();
    // Non-urgent rules don't get the indicator.
    expect(screen.queryByTestId('whats-next-urgency-N1')).toBeNull();
    // The data attribute reflects the urgency tier.
    const urgentBtn = screen.getByTestId('whats-next-button-N6');
    expect(urgentBtn.getAttribute('data-urgent')).toBe('true');
  });

  it('navigates to the rule target on click', () => {
    setHook({
      next: [buildNextItem({ id: 'N2', target: 'cover-letter' })],
    });
    const onNavigate = vi.fn();
    render(
      <MemoryRouter>
        <WhatsNextCTABar applicationId="app-1" onNavigate={onNavigate} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('whats-next-button-N2'));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    const dest = onNavigate.mock.calls[0][0];
    expect(typeof dest).toBe('string');
    expect(dest).toContain('app-1');
    expect(dest).toContain('cover-letter');
  });

  it('renders IAppliedCTA inline for the N3 (Apply now) rule', () => {
    setHook({
      next: [buildNextItem({ id: 'N3', target: 'resume', title: 'Apply now' })],
    });
    render(
      <MemoryRouter>
        <WhatsNextCTABar applicationId="app-1" />
      </MemoryRouter>,
    );
    // The N3 entry renders IAppliedCTA, not a router button.
    expect(screen.getByTestId('iapplied-cta')).toBeInTheDocument();
    expect(screen.getByTestId('iapplied-cta').getAttribute('data-application-id')).toBe('app-1');
  });
});
