// @vitest-environment jsdom
/**
 * Phase 5 — TodayView component tests.
 *
 * useTodayTimeline is stubbed so we can drive the rendering logic directly
 * without spinning up a fetch. The test cases focus on:
 *   - empty-state rendering
 *   - tier rendering + ordering (overdue thank-yous lead)
 *   - deep-link routing on company name and action button
 *   - urgency styling on tier-A entries
 *   - loading skeleton path
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { TodayAggregation, TodayItem } from '@/lib/timeline/today';

const useTodayTimelineMock = vi.fn();

vi.mock('@/hooks/useTodayTimeline', () => ({
  useTodayTimeline: () => useTodayTimelineMock(),
}));

import { TodayView } from '@/components/applications/TodayView';

function setHook({
  aggregation = { tierA: [], tierB: [], tierC: [] } as TodayAggregation,
  loading = false,
  error = null as string | null,
  refresh = vi.fn(),
}: Partial<{ aggregation: TodayAggregation; loading: boolean; error: string | null; refresh: () => Promise<void> }> = {}) {
  const totalCount = aggregation.tierA.length + aggregation.tierB.length + aggregation.tierC.length;
  useTodayTimelineMock.mockReturnValue({
    pursuits: [],
    aggregation,
    loading,
    error,
    totalCount,
    refresh,
  });
}

function buildItem(overrides: Partial<TodayItem> & { kind: TodayItem['kind']; applicationId: string }): TodayItem {
  return {
    tier: 'B',
    companyName: 'Acme',
    roleTitle: 'Director',
    label: 'Tailor your resume',
    target: 'resume',
    rankedAtMs: Date.parse('2026-04-25T09:00:00Z'),
    ...overrides,
  } as TodayItem;
}

beforeEach(() => useTodayTimelineMock.mockReset());
afterEach(() => cleanup());

describe('TodayView', () => {
  it('renders the loading skeleton', () => {
    setHook({ loading: true });
    render(
      <MemoryRouter>
        <TodayView />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('today-view-skeleton')).toBeInTheDocument();
  });

  it('renders the empty state when nothing fires', () => {
    setHook();
    render(
      <MemoryRouter>
        <TodayView />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('today-empty-state')).toBeInTheDocument();
    expect(screen.getByText(/Nothing urgent right now/i)).toBeInTheDocument();
  });

  it('renders the specific load error and retries on request', () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    setHook({ error: 'Timeline aggregation failed.', refresh });
    render(
      <MemoryRouter>
        <TodayView />
      </MemoryRouter>,
    );

    expect(screen.getByText("We couldn't load Today.")).toBeInTheDocument();
    expect(screen.getByText('Timeline aggregation failed.')).toBeInTheDocument();
    expect(screen.queryByTestId('today-empty-state')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('renders tier-A items with the time-sensitive region label', () => {
    setHook({
      aggregation: {
        tierA: [
          buildItem({
            kind: 'overdue_thank_you',
            tier: 'A',
            applicationId: 'a1',
            companyName: 'Acme',
            roleTitle: 'Director',
            label: 'Send your thank-you (overdue)',
            target: 'thank-you-note',
            days: -2,
          }),
        ],
        tierB: [],
        tierC: [],
      },
    });
    render(
      <MemoryRouter>
        <TodayView />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('today-region-time-sensitive')).toBeInTheDocument();
    expect(screen.getByTestId('today-item-overdue_thank_you')).toBeInTheDocument();
  });

  it('renders tier-B items with the get-unblocked region label', () => {
    setHook({
      aggregation: {
        tierA: [],
        tierB: [
          buildItem({
            kind: 'next_rule',
            ruleId: 'N1',
            applicationId: 'a1',
            label: 'Tailor your resume for this role',
            target: 'resume',
          }),
        ],
        tierC: [],
      },
    });
    render(
      <MemoryRouter>
        <TodayView />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('today-region-get-unblocked')).toBeInTheDocument();
    expect(screen.getByTestId('today-item-next_rule')).toBeInTheDocument();
  });

  it('renders tier-C items with the waiting region label', () => {
    setHook({
      aggregation: {
        tierA: [],
        tierB: [],
        tierC: [
          buildItem({
            kind: 'their_turn',
            tier: 'C',
            applicationId: 'a1',
            ruleId: 'T1',
            label: 'You applied 5 days ago. No response yet.',
            target: 'overview',
            days: 5,
          }),
        ],
      },
    });
    render(
      <MemoryRouter>
        <TodayView />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('today-region-waiting')).toBeInTheDocument();
    expect(screen.getByTestId('today-item-their_turn')).toBeInTheDocument();
  });

  it('navigates to the pursuit overview when company link is clicked', () => {
    setHook({
      aggregation: {
        tierA: [],
        tierB: [
          buildItem({
            kind: 'next_rule',
            ruleId: 'N1',
            applicationId: 'app-123',
            target: 'resume',
          }),
        ],
        tierC: [],
      },
    });
    const onNavigate = vi.fn();
    render(
      <MemoryRouter>
        <TodayView onNavigate={onNavigate} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('today-item-pursuit-link'));
    const dest = onNavigate.mock.calls[0]?.[0] ?? '';
    expect(dest).toContain('app-123');
    expect(dest).toContain('overview');
  });

  it('navigates to the rule target when action button is clicked', () => {
    setHook({
      aggregation: {
        tierA: [],
        tierB: [
          buildItem({
            kind: 'next_rule',
            ruleId: 'N2',
            applicationId: 'app-456',
            target: 'cover-letter',
            label: 'Draft your cover letter',
          }),
        ],
        tierC: [],
      },
    });
    const onNavigate = vi.fn();
    render(
      <MemoryRouter>
        <TodayView onNavigate={onNavigate} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('today-item-action'));
    const dest = onNavigate.mock.calls[0]?.[0] ?? '';
    expect(dest).toContain('app-456');
    expect(dest).toContain('cover-letter');
  });
});
