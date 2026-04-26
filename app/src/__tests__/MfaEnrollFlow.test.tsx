// @vitest-environment jsdom
/**
 * MfaEnrollFlow — three-step enrollment dialog.
 *
 * Verifies the intro → scan → verify → done sequence and that an
 * invalid TOTP code surfaces inline rather than crashing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

const enroll = vi.hoisted(() => vi.fn());
const challenge = vi.hoisted(() => vi.fn());
const verify = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      mfa: { enroll, challenge, verify },
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

vi.mock('@/lib/api', () => ({ API_BASE: 'http://localhost:3001/api' }));

import { MfaEnrollFlow } from '@/components/auth/MfaEnrollFlow';

const enrollResponse = {
  data: {
    id: 'factor-1',
    type: 'totp',
    totp: {
      qr_code: 'data:image/svg+xml;utf8,<svg/>',
      secret: 'JBSWY3DPEHPK3PXP',
      uri: 'otpauth://totp/CareerIQ:jane@example.com?secret=...',
    },
  },
  error: null,
};

beforeEach(() => {
  enroll.mockReset();
  challenge.mockReset();
  verify.mockReset();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
});

afterEach(() => cleanup());

describe('MfaEnrollFlow', () => {
  it('shows intro then advances to scan/verify on Start', async () => {
    enroll.mockResolvedValue(enrollResponse);

    render(<MfaEnrollFlow onEnrolled={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByTestId('mfa-enroll-intro')).toBeInTheDocument();

    fireEvent.click(screen.getByText(/start enrollment/i));

    await waitFor(() => expect(screen.getByTestId('mfa-enroll-scan')).toBeInTheDocument());
    expect(screen.getByText(/JBSWY3DPEHPK3PXP/)).toBeInTheDocument();
  });

  it('verifies the entered code and reaches the done state', async () => {
    enroll.mockResolvedValue(enrollResponse);
    challenge.mockResolvedValue({ data: { id: 'c1' }, error: null });
    verify.mockResolvedValue({ data: null, error: null });

    const onEnrolled = vi.fn();
    render(<MfaEnrollFlow onEnrolled={onEnrolled} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByText(/start enrollment/i));
    await waitFor(() => screen.getByTestId('mfa-enroll-scan'));
    fireEvent.click(screen.getByText(/^Continue$/));

    fireEvent.change(screen.getByTestId('mfa-enroll-code-input'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText(/verify and enable/i));

    await waitFor(() => expect(screen.getByTestId('mfa-enroll-done')).toBeInTheDocument());

    fireEvent.click(screen.getByText(/^Done$/));
    expect(onEnrolled).toHaveBeenCalled();
  });

  it('shows the verification error and stays on the verify step', async () => {
    enroll.mockResolvedValue(enrollResponse);
    challenge.mockResolvedValue({ data: { id: 'c1' }, error: null });
    verify.mockResolvedValue({ data: null, error: new Error('Invalid TOTP code') });

    render(<MfaEnrollFlow onEnrolled={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByText(/start enrollment/i));
    await waitFor(() => screen.getByTestId('mfa-enroll-scan'));
    fireEvent.click(screen.getByText(/^Continue$/));

    fireEvent.change(screen.getByTestId('mfa-enroll-code-input'), { target: { value: '999999' } });
    fireEvent.click(screen.getByText(/verify and enable/i));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Invalid TOTP code/));
    expect(screen.getByTestId('mfa-enroll-verify')).toBeInTheDocument();
  });

  it('rejects non-6-digit codes locally before calling verify', async () => {
    enroll.mockResolvedValue(enrollResponse);

    render(<MfaEnrollFlow onEnrolled={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByText(/start enrollment/i));
    await waitFor(() => screen.getByTestId('mfa-enroll-scan'));
    fireEvent.click(screen.getByText(/^Continue$/));

    // The button stays disabled until 6 digits are entered, so we never
    // even reach the network. Confirm verify wasn't called.
    fireEvent.change(screen.getByTestId('mfa-enroll-code-input'), { target: { value: 'abc12' } });
    expect(screen.getByText(/verify and enable/i).closest('button')).toBeDisabled();
    expect(verify).not.toHaveBeenCalled();
  });
});
