// @vitest-environment jsdom
/**
 * ActivityLogCard — Settings → Recent activity surface.
 *
 * Verifies the load lifecycle (loading → list / empty / error), event
 * label mapping, and refresh button behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

const supabaseGetSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: supabaseGetSession } },
}));

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

import { ActivityLogCard } from '@/components/settings/ActivityLogCard';

beforeEach(() => {
  supabaseGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-xyz' } } });
});

afterEach(() => cleanup());

describe('ActivityLogCard', () => {
  it('shows the empty state when the log is empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ events: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<ActivityLogCard />);

    await waitFor(() => expect(screen.getByText(/no activity recorded yet/i)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/auth/events?limit=50',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer tok-xyz' }),
      }),
    );
  });

  it('renders rows for known event types with friendly labels', async () => {
    const events = [
      { id: 'e1', event_type: 'signed_in', ip_address: '203.0.113.5', user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0 Safari/537.36', metadata: null, occurred_at: '2026-04-26T10:00:00Z' },
      { id: 'e2', event_type: 'password_recovery_started', ip_address: null, user_agent: null, metadata: null, occurred_at: '2026-04-25T08:00:00Z' },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ events }), { status: 200 }),
    ));

    render(<ActivityLogCard />);

    await waitFor(() => expect(screen.getByText('Signed in')).toBeInTheDocument());
    expect(screen.getByText('Password reset link opened')).toBeInTheDocument();
    expect(screen.getByText(/203\.0\.113\.5/)).toBeInTheDocument();
    expect(screen.getByText(/Chrome on Mac OS X/)).toBeInTheDocument();
  });

  it('shows an inline error when the API returns 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Failed to load activity log' }), { status: 500 }),
    ));

    render(<ActivityLogCard />);

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Failed to load activity/));
  });

  it('refetches when the refresh button is clicked', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ events: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        events: [
          { id: 'e1', event_type: 'signed_in', ip_address: null, user_agent: null, metadata: null, occurred_at: '2026-04-26T10:00:00Z' },
        ],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<ActivityLogCard />);

    await waitFor(() => expect(screen.getByText(/no activity recorded yet/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /refresh activity/i }));

    await waitFor(() => expect(screen.getByText('Signed in')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('appends rows when Load more is clicked using the cursor', async () => {
    const firstPage = {
      events: [
        { id: 'e1', event_type: 'signed_in', ip_address: null, user_agent: null, metadata: null, occurred_at: '2026-04-26T10:00:00Z' },
      ],
      nextCursor: '2026-04-26T10:00:00Z',
    };
    const secondPage = {
      events: [
        { id: 'e2', event_type: 'signed_out', ip_address: null, user_agent: null, metadata: null, occurred_at: '2026-04-25T09:00:00Z' },
      ],
      nextCursor: null,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(firstPage), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(secondPage), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<ActivityLogCard />);

    await waitFor(() => expect(screen.getByText('Signed in')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('activity-log-load-more'));

    await waitFor(() => expect(screen.getByText('Signed out')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondCallUrl).toContain('before=2026-04-26T10%3A00%3A00Z');
    expect(screen.queryByTestId('activity-log-load-more')).not.toBeInTheDocument();
  });
});
