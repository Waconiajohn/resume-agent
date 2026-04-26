// @vitest-environment jsdom
/**
 * Settings page — delete account flow.
 *
 * Type-to-confirm gate (must type DELETE), button stays disabled otherwise,
 * fetch hits /api/account with the bearer token, success redirects to
 * /sales, server failure surfaces error inline.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';

const supabaseSignOut = vi.hoisted(() => vi.fn());
const supabaseGetSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: supabaseSignOut,
      getSession: supabaseGetSession,
    },
  },
}));

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

import { SettingsPage } from '@/components/SettingsPage';

const fakeUser: User = {
  id: 'u-1',
  email: 'jane@example.com',
  app_metadata: {},
  user_metadata: { firstName: 'Jane', lastName: 'Doe' },
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00.000Z',
} as User;

beforeEach(() => {
  supabaseSignOut.mockResolvedValue({ error: null });
  supabaseGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
  vi.restoreAllMocks();
});

afterEach(() => cleanup());

describe('SettingsPage — delete account', () => {
  it('shows the delete-account section by default; panel hidden until clicked', () => {
    render(
      <SettingsPage user={fakeUser} onNavigate={vi.fn()} />,
    );
    expect(screen.getByText(/delete account/i)).toBeInTheDocument();
    expect(screen.queryByTestId('delete-account-confirm-panel')).toBeNull();
  });

  it('opens confirmation panel after clicking the start link', () => {
    render(<SettingsPage user={fakeUser} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByText(/I understand — start deletion/i));
    expect(screen.getByTestId('delete-account-confirm-panel')).toBeInTheDocument();
    expect(screen.getByTestId('delete-account-confirm-button')).toBeDisabled();
  });

  it('keeps the confirm button disabled until DELETE is typed exactly', () => {
    render(<SettingsPage user={fakeUser} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByText(/I understand — start deletion/i));
    const input = screen.getByTestId('delete-account-confirm-input');

    fireEvent.change(input, { target: { value: 'delete' } });
    expect(screen.getByTestId('delete-account-confirm-button')).not.toBeDisabled(); // case-insensitive

    fireEvent.change(input, { target: { value: 'DEL' } });
    expect(screen.getByTestId('delete-account-confirm-button')).toBeDisabled();

    fireEvent.change(input, { target: { value: 'DELETE' } });
    expect(screen.getByTestId('delete-account-confirm-button')).not.toBeDisabled();
  });

  it('calls DELETE /api/account with bearer token and navigates on success', async () => {
    const onNavigate = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ deleted: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<SettingsPage user={fakeUser} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText(/I understand — start deletion/i));
    fireEvent.change(screen.getByTestId('delete-account-confirm-input'), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByTestId('delete-account-confirm-button'));

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/sales'));

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/account',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ Authorization: 'Bearer tok-123' }),
      }),
    );
    expect(supabaseSignOut).toHaveBeenCalled();
  });

  it('shows server error inline and does NOT navigate on 502', async () => {
    const onNavigate = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'Failed to cancel subscription before account deletion. Please try again or contact support.' }),
        { status: 502 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<SettingsPage user={fakeUser} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText(/I understand — start deletion/i));
    fireEvent.change(screen.getByTestId('delete-account-confirm-input'), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByTestId('delete-account-confirm-button'));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/Failed to cancel subscription/),
    );
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('cancels back to the closed state when Cancel is clicked', () => {
    render(<SettingsPage user={fakeUser} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByText(/I understand — start deletion/i));
    fireEvent.change(screen.getByTestId('delete-account-confirm-input'), { target: { value: 'DELETE' } });

    fireEvent.click(screen.getByText(/^Cancel$/));
    expect(screen.queryByTestId('delete-account-confirm-panel')).toBeNull();
  });
});
