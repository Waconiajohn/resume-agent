/**
 * SessionDegradedBanner — Sprint B (auth hardening).
 *
 * Renders a thin banner at the top of authenticated pages when token
 * refresh has failed but the session hasn't been invalidated yet — the
 * user is in a borrowed-time state where the next API call will 401.
 * Surfaces a "Sign in again" CTA so the user isn't booted mid-task.
 *
 * Hidden when the session is healthy. The flag is owned by useAuth and
 * cleared automatically on the next successful TOKEN_REFRESHED event.
 */

import { AlertTriangle, LogIn } from 'lucide-react';

interface SessionDegradedBannerProps {
  degraded: boolean;
  onSignInAgain: () => void | Promise<void>;
}

export function SessionDegradedBanner({ degraded, onSignInAgain }: SessionDegradedBannerProps) {
  if (!degraded) return null;

  return (
    <div
      role="alert"
      className="flex items-center gap-3 border-b border-[var(--badge-amber-text)]/25 bg-[var(--badge-amber-text)]/[0.08] px-4 py-2 text-[13px] text-[var(--text-strong)]"
    >
      <AlertTriangle className="h-4 w-4 flex-shrink-0 text-[var(--badge-amber-text)]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <span className="font-semibold">Your session is having trouble refreshing.</span>{' '}
        <span className="text-[var(--text-muted)]">
          Sign in again to be safe — otherwise the next save may fail.
        </span>
      </div>
      <button
        type="button"
        onClick={() => void onSignInAgain()}
        className="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-strong)] hover:border-[var(--link)]/40"
      >
        <LogIn className="h-3.5 w-3.5" />
        Sign in again
      </button>
    </div>
  );
}
