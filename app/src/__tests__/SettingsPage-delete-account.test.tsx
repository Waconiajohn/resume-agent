// @vitest-environment jsdom
/**
 * Settings page — delete account flow.
 *
 * Type-to-confirm gate (must type DELETE), button stays disabled otherwise,
 * fetch hits /api/account with the bearer token, success redirects to
 * /sales, server failure surfaces error inline.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
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

  it('keeps the confirm button disabled until DELETE is typed exactly AND password is provided', () => {
    render(<SettingsPage user={fakeUser} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByText(/I understand — start deletion/i));
    const confirmInput = screen.getByTestId('delete-account-confirm-input');
    const passwordInput = screen.getByTestId('delete-account-password-input');

    fireEvent.change(confirmInput, { target: { value: 'delete' } });
    // Without password, still disabled.
    expect(screen.getByTestId('delete-account-confirm-button')).toBeDisabled();

    fireEvent.change(passwordInput, { target: { value: 'p' } });
    expect(screen.getByTestId('delete-account-confirm-button')).not.toBeDisabled(); // case-insensitive on confirm

    fireEvent.change(confirmInput, { target: { value: 'DEL' } });
    expect(screen.getByTestId('delete-account-confirm-button')).toBeDisabled();

    fireEvent.change(confirmInput, { target: { value: 'DELETE' } });
    expect(screen.getByTestId('delete-account-confirm-button')).not.toBeDisabled();
  });

  it('calls DELETE /api/account with bearer token and navigates on success', async () => {
    const onNavigate = vi.fn();
    // SettingsPage also fetches /auth/events on mount via ActivityLogCard;
    // dispatch by URL so the delete-account assertion is unambiguous.
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/events')) {
        return Promise.resolve(new Response(JSON.stringify({ events: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ deleted: true }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<SettingsPage user={fakeUser} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText(/I understand — start deletion/i));
    fireEvent.change(screen.getByTestId('delete-account-confirm-input'), { target: { value: 'DELETE' } });
    fireEvent.change(screen.getByTestId('delete-account-password-input'), { target: { value: 'pwd-123' } });
    fireEvent.click(screen.getByTestId('delete-account-confirm-button'));

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/sales'));

    const deleteCall = fetchMock.mock.calls.find((args) => args[0] === 'http://localhost:3001/api/account');
    expect(deleteCall).toBeDefined();
    const init = deleteCall![1] as RequestInit;
    expect(init.method).toBe('DELETE');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-123');
    expect(JSON.parse(init.body as string)).toEqual({ password: 'pwd-123' });
    expect(supabaseSignOut).toHaveBeenCalled();
  });

  it('shows server error inline and does NOT navigate on 502', async () => {
    const onNavigate = vi.fn();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/events')) {
        return Promise.resolve(new Response(JSON.stringify({ events: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response(
        JSON.stringify({ error: 'Failed to cancel subscription before account deletion. Please try again or contact support.' }),
        { status: 502 },
      ));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<SettingsPage user={fakeUser} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText(/I understand — start deletion/i));
    fireEvent.change(screen.getByTestId('delete-account-confirm-input'), { target: { value: 'DELETE' } });
    fireEvent.change(screen.getByTestId('delete-account-password-input'), { target: { value: 'pwd-123' } });
    fireEvent.click(screen.getByTestId('delete-account-confirm-button'));

    await waitFor(() => {
      const panel = screen.getByTestId('delete-account-confirm-panel');
      expect(within(panel).getByRole('alert').textContent).toMatch(/Failed to cancel subscription/);
    });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('cancels back to the closed state when Cancel is clicked', () => {
    render(<SettingsPage user={fakeUser} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByText(/I understand — start deletion/i));
    fireEvent.change(screen.getByTestId('delete-account-confirm-input'), { target: { value: 'DELETE' } });

    fireEvent.click(screen.getByText(/^Cancel$/));
    expect(screen.queryByTestId('delete-account-confirm-panel')).toBeNull();
  });

  it('surfaces "Incorrect password" when the server returns 401', async () => {
    const onNavigate = vi.fn();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/events')) {
        return Promise.resolve(new Response(JSON.stringify({ events: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response(
        JSON.stringify({ error: 'Incorrect password' }),
        { status: 401 },
      ));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<SettingsPage user={fakeUser} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText(/I understand — start deletion/i));
    fireEvent.change(screen.getByTestId('delete-account-confirm-input'), { target: { value: 'DELETE' } });
    fireEvent.change(screen.getByTestId('delete-account-password-input'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByTestId('delete-account-confirm-button'));

    await waitFor(() => {
      const panel = screen.getByTestId('delete-account-confirm-panel');
      expect(within(panel).getByRole('alert').textContent).toMatch(/Incorrect password/);
    });
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
