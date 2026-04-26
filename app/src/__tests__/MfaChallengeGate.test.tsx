// @vitest-environment jsdom
/**
 * MfaChallengeGate — overlay that blocks the app when AAL2 is required.
 *
 * Renders nothing when no session, when AAL is sufficient, or when
 * AAL says aal2 is needed but no verified factors exist (defensive,
 * inconsistent state — don't strand the user).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

const getAal = vi.hoisted(() => vi.fn());
const listFactors = vi.hoisted(() => vi.fn());
const challenge = vi.hoisted(() => vi.fn());
const verify = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn());
const onAuthStateChange = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession,
      onAuthStateChange,
      mfa: {
        getAuthenticatorAssuranceLevel: getAal,
        listFactors,
        challenge,
        verify,
      },
    },
  },
}));

vi.mock('@/lib/api', () => ({ API_BASE: 'http://localhost:3001/api' }));

import { MfaChallengeGate } from '@/components/auth/MfaChallengeGate';

beforeEach(() => {
  getAal.mockReset();
  listFactors.mockReset();
  challenge.mockReset();
  verify.mockReset();
  onAuthStateChange.mockImplementation(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  }));
  getSession.mockResolvedValue({ data: { session: null } });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
});

afterEach(() => cleanup());

describe('MfaChallengeGate', () => {
  it('renders nothing when there is no session', () => {
    render(<MfaChallengeGate hasSession={false} onSignOut={vi.fn()} />);
    expect(screen.queryByTestId('mfa-challenge-gate')).toBeNull();
    expect(getAal).not.toHaveBeenCalled();
  });

  it('renders nothing when AAL is already aal2', async () => {
    getAal.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null });
    render(<MfaChallengeGate hasSession={true} onSignOut={vi.fn()} />);
    await waitFor(() => expect(getAal).toHaveBeenCalled());
    expect(screen.queryByTestId('mfa-challenge-gate')).toBeNull();
  });

  it('blocks the app and shows the challenge when AAL2 is required and a factor exists', async () => {
    getAal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
    listFactors.mockResolvedValue({
      data: { totp: [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'iPhone', created_at: '2026-04-26T10:00:00Z', updated_at: '2026-04-26T10:00:00Z' }] },
      error: null,
    });

    render(<MfaChallengeGate hasSession={true} onSignOut={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId('mfa-challenge-gate')).toBeInTheDocument());
    expect(screen.getByText(/two-factor authentication/i)).toBeInTheDocument();
  });

  it('does not strand the user if AAL2 is required but no factors are listed', async () => {
    getAal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
    listFactors.mockResolvedValue({ data: { totp: [] }, error: null });

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(<MfaChallengeGate hasSession={true} onSignOut={vi.fn()} />);

    await waitFor(() => expect(listFactors).toHaveBeenCalled());
    expect(screen.queryByTestId('mfa-challenge-gate')).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('verifies the code on submit and dismisses the gate', async () => {
    getAal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
    listFactors.mockResolvedValue({
      data: { totp: [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'iPhone', created_at: '2026-04-26T10:00:00Z', updated_at: '2026-04-26T10:00:00Z' }] },
      error: null,
    });
    challenge.mockResolvedValue({ data: { id: 'c1' }, error: null });
    verify.mockResolvedValue({ data: null, error: null });

    render(<MfaChallengeGate hasSession={true} onSignOut={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId('mfa-challenge-gate')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('mfa-challenge-code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByTestId('mfa-challenge-verify'));

    await waitFor(() => expect(verify).toHaveBeenCalledWith({ factorId: 'f1', challengeId: 'c1', code: '123456' }));
    await waitFor(() => expect(screen.queryByTestId('mfa-challenge-gate')).toBeNull());
  });

  it('surfaces a verification error and stays on the gate', async () => {
    getAal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
    listFactors.mockResolvedValue({
      data: { totp: [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'iPhone', created_at: '2026-04-26T10:00:00Z', updated_at: '2026-04-26T10:00:00Z' }] },
      error: null,
    });
    challenge.mockResolvedValue({ data: { id: 'c1' }, error: null });
    verify.mockResolvedValue({ data: null, error: new Error('Invalid TOTP code') });

    render(<MfaChallengeGate hasSession={true} onSignOut={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId('mfa-challenge-gate')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('mfa-challenge-code'), { target: { value: '999999' } });
    fireEvent.click(screen.getByTestId('mfa-challenge-verify'));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Invalid TOTP code/i));
    expect(screen.getByTestId('mfa-challenge-gate')).toBeInTheDocument();
  });
});
