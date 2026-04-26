// @vitest-environment jsdom
/**
 * SecurityCard — Settings → Security surface.
 *
 * Verifies the no-factor / enrolling / enrolled / unenroll-confirm
 * states. The MfaEnrollFlow itself is exercised in its own tests; here
 * we just confirm SecurityCard mounts it when the user clicks "Enable
 * two-factor authentication."
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

const listFactors = vi.hoisted(() => vi.fn());
const enroll = vi.hoisted(() => vi.fn());
const unenroll = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      mfa: {
        listFactors,
        enroll,
        unenroll,
        challenge: vi.fn(),
        verify: vi.fn(),
      },
      getSession,
    },
  },
}));

vi.mock('@/lib/api', () => ({ API_BASE: 'http://localhost:3001/api' }));

import { SecurityCard } from '@/components/settings/SecurityCard';

beforeEach(() => {
  listFactors.mockReset();
  enroll.mockReset();
  unenroll.mockReset();
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok-xyz' } } });
});

afterEach(() => cleanup());

describe('SecurityCard', () => {
  it('shows the enroll CTA when the user has no verified factors', async () => {
    listFactors.mockResolvedValue({ data: { totp: [] }, error: null });

    render(<SecurityCard />);

    await waitFor(() => expect(screen.getByTestId('mfa-enroll-button')).toBeInTheDocument());
    expect(screen.queryByTestId('mfa-factor-list')).toBeNull();
  });

  it('lists verified factors with friendly name and enrolled date', async () => {
    listFactors.mockResolvedValue({
      data: {
        totp: [
          {
            id: 'f1',
            factor_type: 'totp',
            status: 'verified',
            friendly_name: 'iPhone 15',
            created_at: '2026-04-26T10:00:00Z',
            updated_at: '2026-04-26T10:00:00Z',
          },
        ],
      },
      error: null,
    });

    render(<SecurityCard />);

    await waitFor(() => expect(screen.getByTestId('mfa-factor-list')).toBeInTheDocument());
    expect(screen.getByText(/iPhone 15/)).toBeInTheDocument();
    expect(screen.getByTestId('mfa-disable-button')).toBeInTheDocument();
  });

  it('hides unverified factors so half-finished enrollments do not pose as MFA', async () => {
    listFactors.mockResolvedValue({
      data: {
        totp: [
          { id: 'f-unv', factor_type: 'totp', status: 'unverified', friendly_name: null, created_at: '2026-04-26T10:00:00Z', updated_at: '2026-04-26T10:00:00Z' },
        ],
      },
      error: null,
    });

    render(<SecurityCard />);

    await waitFor(() => expect(screen.getByTestId('mfa-enroll-button')).toBeInTheDocument());
    expect(screen.queryByTestId('mfa-factor-list')).toBeNull();
  });

  it('enters the enroll flow when the CTA is clicked', async () => {
    listFactors.mockResolvedValue({ data: { totp: [] }, error: null });

    render(<SecurityCard />);

    await waitFor(() => expect(screen.getByTestId('mfa-enroll-button')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mfa-enroll-button'));

    expect(screen.getByTestId('mfa-enroll-intro')).toBeInTheDocument();
  });

  it('requires password re-auth before disabling a factor', async () => {
    listFactors.mockResolvedValue({
      data: {
        totp: [
          { id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'iPhone', created_at: '2026-04-26T10:00:00Z', updated_at: '2026-04-26T10:00:00Z' },
        ],
      },
      error: null,
    });
    unenroll.mockResolvedValue({ data: null, error: null });

    // Verify-password endpoint succeeds.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ verified: true }), { status: 200 }),
    ));

    render(<SecurityCard />);

    await waitFor(() => expect(screen.getByTestId('mfa-disable-button')).toBeInTheDocument());

    // First click reveals the confirm UI with password input; doesn't fire unenroll yet.
    fireEvent.click(screen.getByTestId('mfa-disable-button'));
    expect(unenroll).not.toHaveBeenCalled();
    expect(screen.getByTestId('mfa-disable-password-input')).toBeInTheDocument();
    // Confirm button disabled while password is empty.
    expect(screen.getByTestId('mfa-confirm-disable')).toBeDisabled();

    fireEvent.change(screen.getByTestId('mfa-disable-password-input'), { target: { value: 'pwd-123' } });
    expect(screen.getByTestId('mfa-confirm-disable')).not.toBeDisabled();

    listFactors.mockResolvedValueOnce({ data: { totp: [] }, error: null });
    fireEvent.click(screen.getByTestId('mfa-confirm-disable'));

    await waitFor(() => expect(unenroll).toHaveBeenCalledWith({ factorId: 'f1' }));
  });

  it('blocks unenroll when password verification returns 401', async () => {
    listFactors.mockResolvedValue({
      data: {
        totp: [
          { id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'iPhone', created_at: '2026-04-26T10:00:00Z', updated_at: '2026-04-26T10:00:00Z' },
        ],
      },
      error: null,
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Incorrect password' }), { status: 401 }),
    ));

    render(<SecurityCard />);

    await waitFor(() => expect(screen.getByTestId('mfa-disable-button')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mfa-disable-button'));
    fireEvent.change(screen.getByTestId('mfa-disable-password-input'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByTestId('mfa-confirm-disable'));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/Incorrect password/),
    );
    expect(unenroll).not.toHaveBeenCalled();
  });
});
