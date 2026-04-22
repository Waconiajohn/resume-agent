/**
 * EmailVerificationBanner — Sprint E1.
 *
 * Renders a thin, dismissable banner at the top of authenticated pages when
 * the current Supabase user has not yet confirmed their email
 * (email_confirmed_at is null). Includes a resend-verification CTA and a
 * "close for now" action.
 *
 * Hidden entirely when the user has already verified. Uses sessionStorage
 * to remember a dismissal for the tab so the banner doesn't re-nag on
 * every navigation.
 */

import { useState, useEffect } from 'react';
import { AlertCircle, Mail, X, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface EmailVerificationBannerProps {
  user: SupabaseUser | null;
}

const DISMISS_KEY = 'email-verification-dismissed';

export function EmailVerificationBanner({ user }: EmailVerificationBannerProps) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return sessionStorage.getItem(DISMISS_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [resendError, setResendError] = useState<string | null>(null);

  // Reset the "sent" UI after 8s so a second click can send again.
  useEffect(() => {
    if (resendState !== 'sent') return;
    const t = setTimeout(() => setResendState('idle'), 8000);
    return () => clearTimeout(t);
  }, [resendState]);

  if (!user) return null;
  if (user.email_confirmed_at) return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      // ignore storage errors
    }
  };

  const handleResend = async () => {
    if (!user.email) return;
    setResendState('sending');
    setResendError(null);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: user.email });
      if (error) {
        setResendError(error.message);
        setResendState('error');
        return;
      }
      setResendState('sent');
    } catch (err) {
      setResendError(err instanceof Error ? err.message : 'Failed to send');
      setResendState('error');
    }
  };

  return (
    <div
      role="alert"
      className="flex items-center gap-3 border-b border-[var(--badge-amber-text)]/25 bg-[var(--badge-amber-text)]/[0.08] px-4 py-2 text-[13px] text-[var(--text-strong)]"
    >
      <AlertCircle className="h-4 w-4 flex-shrink-0 text-[var(--badge-amber-text)]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <span className="font-semibold">Verify your email.</span>{' '}
        <span className="text-[var(--text-muted)]">
          We sent a link to {user.email ?? 'your address'}. Some features stay locked until you confirm.
        </span>
        {resendState === 'error' && resendError && (
          <span className="ml-2 text-[var(--badge-red-text)]">· {resendError}</span>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {resendState === 'sent' ? (
          <span className="flex items-center gap-1 text-[var(--badge-green-text)]">
            <CheckCircle className="h-3.5 w-3.5" />
            Sent
          </span>
        ) : (
          <button
            type="button"
            onClick={() => void handleResend()}
            disabled={resendState === 'sending' || !user.email}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-strong)] hover:border-[var(--link)]/40 disabled:opacity-60"
          >
            {resendState === 'sending' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Mail className="h-3.5 w-3.5" />
            )}
            Resend
          </button>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-md p-1 text-[var(--text-soft)] hover:bg-[var(--accent-muted)] hover:text-[var(--text-strong)]"
          aria-label="Dismiss email verification banner"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
