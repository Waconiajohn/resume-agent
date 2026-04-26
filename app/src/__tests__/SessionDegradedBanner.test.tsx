// @vitest-environment jsdom
/**
 * SessionDegradedBanner — token-refresh-failure surface.
 *
 * Hidden when degraded=false. When degraded=true, renders an alert with the
 * "Sign in again" CTA wired to the supplied callback.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SessionDegradedBanner } from '@/components/SessionDegradedBanner';

afterEach(() => cleanup());

describe('SessionDegradedBanner', () => {
  it('renders nothing when degraded is false', () => {
    render(<SessionDegradedBanner degraded={false} onSignInAgain={vi.fn()} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders an alert with sign-in CTA when degraded is true', () => {
    render(<SessionDegradedBanner degraded={true} onSignInAgain={vi.fn()} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/session is having trouble refreshing/i);
    expect(screen.getByRole('button', { name: /sign in again/i })).toBeInTheDocument();
  });

  it('invokes onSignInAgain when the CTA is clicked', () => {
    const handler = vi.fn();
    render(<SessionDegradedBanner degraded={true} onSignInAgain={handler} />);
    fireEvent.click(screen.getByRole('button', { name: /sign in again/i }));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
