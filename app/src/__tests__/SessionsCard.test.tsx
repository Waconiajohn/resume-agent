// @vitest-environment jsdom
/**
 * SessionsCard — Settings → Active sessions surface.
 *
 * Verifies list rendering with current marker, revoke flow with refetch,
 * sign-out-everywhere-else confirm step, and inline error surfacing on
 * a 500 from the API.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

const supabaseGetSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: supabaseGetSession } },
}));

vi.mock('@/lib/api', () => ({ API_BASE: 'http://localhost:3001/api' }));

import { SessionsCard } from '@/components/settings/SessionsCard';

const fakeSessions = [
  {
    id: 'sess-1',
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0 Safari/537.36',
    ip: '203.0.113.5',
    aal: 'aal1',
    created_at: '2026-04-26T08:00:00Z',
    updated_at: '2026-04-26T10:00:00Z',
    not_after: '2026-04-27T08:00:00Z',
    current: true,
  },
  {
    id: 'sess-2',
    user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605.1.15',
    ip: '198.51.100.10',
    aal: 'aal1',
    created_at: '2026-04-25T08:00:00Z',
    updated_at: '2026-04-25T10:00:00Z',
    not_after: '2026-04-26T08:00:00Z',
    current: false,
  },
];

beforeEach(() => {
  supabaseGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-xyz' } } });
});

afterEach(() => cleanup());

describe('SessionsCard', () => {
  it('renders rows with the current-device badge', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sessions: fakeSessions, current_session_id: 'sess-1' }), { status: 200 }),
    ));

    render(<SessionsCard />);

    await waitFor(() => expect(screen.getByTestId('sessions-list')).toBeInTheDocument());
    expect(screen.getByTestId('sessions-current-badge')).toBeInTheDocument();
    expect(screen.getByText(/203\.0\.113\.5/)).toBeInTheDocument();
    expect(screen.getByText(/198\.51\.100\.10/)).toBeInTheDocument();
    // The Revoke button only appears for non-current sessions.
    expect(screen.getAllByTestId('session-revoke-button')).toHaveLength(1);
  });

  it('revokes a session and refetches', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: fakeSessions, current_session_id: 'sess-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ revoked: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [fakeSessions[0]], current_session_id: 'sess-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<SessionsCard />);

    await waitFor(() => screen.getByTestId('sessions-list'));
    fireEvent.click(screen.getByTestId('session-revoke-button'));

    await waitFor(() => expect(screen.queryAllByTestId('session-revoke-button')).toHaveLength(0));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/api/auth/sessions/sess-2',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ Authorization: 'Bearer tok-xyz' }),
      }),
    );
    expect(screen.getByRole('status').textContent).toMatch(/Session revoked/);
  });

  it('sign-out-everywhere-else requires confirm and posts on confirm', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: fakeSessions, current_session_id: 'sess-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ revoked: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [fakeSessions[0]], current_session_id: 'sess-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<SessionsCard />);

    await waitFor(() => screen.getByTestId('sessions-list'));

    // First click reveals the confirm step; doesn't fire POST yet.
    fireEvent.click(screen.getByTestId('sessions-sign-out-others-button'));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('sessions-confirm-sign-out-others'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'http://localhost:3001/api/auth/sessions/sign-out-others',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Signed out of 1 other session/));
  });

  it('surfaces an error when the GET fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Failed to load sessions' }), { status: 500 }),
    ));

    render(<SessionsCard />);

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Failed to load sessions/));
  });

  it('hides the sign-out-others button when there are no other sessions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sessions: [fakeSessions[0]], current_session_id: 'sess-1' }), { status: 200 }),
    ));

    render(<SessionsCard />);

    await waitFor(() => screen.getByTestId('sessions-list'));
    expect(screen.queryByTestId('sessions-sign-out-others-button')).toBeNull();
  });
});
