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
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

vi.mock('@/lib/api', () => ({ API_BASE: 'http://localhost:3001/api' }));

import { SecurityCard } from '@/components/settings/SecurityCard';

beforeEach(() => {
  listFactors.mockReset();
  enroll.mockReset();
  unenroll.mockReset();
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

  it('requires explicit confirm before disabling a factor', async () => {
    listFactors.mockResolvedValue({
      data: {
        totp: [
          { id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'iPhone', created_at: '2026-04-26T10:00:00Z', updated_at: '2026-04-26T10:00:00Z' },
        ],
      },
      error: null,
    });
    unenroll.mockResolvedValue({ data: null, error: null });

    render(<SecurityCard />);

    await waitFor(() => expect(screen.getByTestId('mfa-disable-button')).toBeInTheDocument());

    // First click reveals the confirm; doesn't fire unenroll yet.
    fireEvent.click(screen.getByTestId('mfa-disable-button'));
    expect(unenroll).not.toHaveBeenCalled();
    expect(screen.getByTestId('mfa-confirm-disable')).toBeInTheDocument();

    // Second click fires the unenroll.
    listFactors.mockResolvedValueOnce({ data: { totp: [] }, error: null });
    fireEvent.click(screen.getByTestId('mfa-confirm-disable'));

    await waitFor(() => expect(unenroll).toHaveBeenCalledWith({ factorId: 'f1' }));
  });
});
