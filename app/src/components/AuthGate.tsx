import { useState } from 'react';
import { GlassCard } from './GlassCard';
import { GlassButton } from './GlassButton';
import { GlassInput } from './GlassInput';
import { Briefcase, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  MIN_PASSWORD_LENGTH,
  validatePasswordPolicy,
  checkPasswordBreached,
} from '@/lib/password-policy';

/**
 * Sprint E4 — initial view preference. Sales page "Get started free" links
 * include `?auth=signup` so the gate opens on the signup tab; "Sign In" links
 * do not. Returns 'sign_up' when the URL advertises signup, otherwise
 * 'sign_in' (the pre-E4 default).
 */
function initialViewFromUrl(): AuthView {
  if (typeof window === 'undefined') return 'sign_in';
  const params = new URLSearchParams(window.location.search);
  return params.get('auth') === 'signup' ? 'sign_up' : 'sign_in';
}

interface AuthGateProps {
  onSignIn: (email: string, password: string) => Promise<{ error: unknown }>;
  onSignUp: (email: string, password: string, metadata?: { firstName: string; lastName: string; phone?: string }) => Promise<{ error: unknown }>;
  onGoogleSignIn: () => Promise<{ error: unknown }>;
}

type AuthView = 'sign_in' | 'sign_up' | 'forgot_password';

export function AuthGate({ onSignIn, onSignUp, onGoogleSignIn }: AuthGateProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [view, setView] = useState<AuthView>(initialViewFromUrl);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [signUpSent, setSignUpSent] = useState(false);
  const [signUpEmail, setSignUpEmail] = useState('');

  const isSignUp = view === 'sign_up';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Password policy enforced only on signup. Sign-in passes the existing
    // password through unchanged (a user with a legacy short password should
    // still be able to sign in; they'd hit the policy on their next reset).
    if (isSignUp) {
      const policy = validatePasswordPolicy(password);
      if (!policy.ok) {
        setError(policy.reasons.join(' '));
        return;
      }
      setLoading(true);
      const breach = await checkPasswordBreached(password);
      if (breach.breached) {
        setLoading(false);
        setError(
          `This password has appeared in ${breach.count.toLocaleString()} known data breaches. `
            + 'Pick a different one — even one not on the list — or use a password manager to generate a strong unique password.',
        );
        return;
      }
    } else {
      setLoading(true);
    }

    const { error } = isSignUp
      ? await onSignUp(email, password, { firstName, lastName, phone: phone || undefined })
      : await onSignIn(email, password);

    if (error) {
      setError((error as { message?: string })?.message ?? String(error));
    } else if (isSignUp) {
      // Supabase email-confirmation flow: signUp succeeded but the user
      // must click the link in their inbox before they're authenticated.
      // Show the check-your-email state so they know what to do next.
      setSignUpEmail(email);
      setSignUpSent(true);
      // Clear sensitive fields from the form state.
      setPassword('');
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError((error as { message?: string })?.message ?? String(error));
    } else {
      setResetSent(true);
    }
    setLoading(false);
  };

  const switchView = (next: AuthView) => {
    setView(next);
    setError(null);
    setResetSent(false);
    setSignUpSent(false);
  };

  if (view === 'forgot_password') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-4">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(5,102,141,0.08),transparent_42%)]" />

        <GlassCard className="relative z-10 w-full max-w-sm p-8">
          <div className="mb-6 flex flex-col items-center gap-2">
            <Briefcase className="h-8 w-8 text-[var(--link)]" />
            <h1 className="text-xl font-semibold text-[var(--text-strong)]">Reset password</h1>
            <p className="text-center text-sm text-[var(--text-soft)]">
              Enter your email and we&apos;ll send you a reset link.
            </p>
          </div>

          {resetSent ? (
            <div className="space-y-4">
              <p className="rounded-lg bg-[var(--accent-muted)] px-4 py-3 text-sm text-[var(--text-strong)]">
                Check your email for a reset link. It may take a minute to arrive.
              </p>
              <button
                type="button"
                onClick={() => switchView('sign_in')}
                className="w-full text-xs text-[var(--text-soft)] transition-colors hover:text-[var(--text-strong)]"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label htmlFor="reset-email" className="sr-only">Email address</label>
                <GlassInput
                  id="reset-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  aria-describedby={error ? 'auth-error' : undefined}
                />
              </div>

              {error && (
                <p id="auth-error" className="text-xs text-[var(--badge-red-text)]" role="alert">{error}</p>
              )}

              <GlassButton type="submit" disabled={loading} className="w-full">
                {loading ? 'Sending...' : 'Send reset link'}
              </GlassButton>

              <button
                type="button"
                onClick={() => switchView('sign_in')}
                className="w-full text-xs text-[var(--text-soft)] transition-colors hover:text-[var(--text-strong)]"
              >
                Back to sign in
              </button>
            </form>
          )}
        </GlassCard>
      </div>
    );
  }

  // Post-signup "check your email" screen. Shown instead of the form after
  // a successful signUp() call, because Supabase's default flow requires
  // email confirmation before the user is authenticated.
  if (signUpSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-4">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(5,102,141,0.08),transparent_42%)]" />

        <GlassCard className="relative z-10 w-full max-w-sm p-8">
          <div className="mb-6 flex flex-col items-center gap-2">
            <Briefcase className="h-8 w-8 text-[var(--link)]" />
            <h1 className="text-xl font-semibold text-[var(--text-strong)]">Almost there</h1>
            <p className="text-center text-sm text-[var(--text-soft)]">
              Confirm your email to finish creating your account.
            </p>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg bg-[var(--accent-muted)] px-4 py-3 text-sm text-[var(--text-strong)] space-y-2">
              <p>
                We sent a confirmation link to{' '}
                <span className="font-semibold text-[var(--link)]">{signUpEmail}</span>.
              </p>
              <p className="text-[13px] text-[var(--text-muted)]">
                Click the link in that email to verify your address, then come back here and sign in.
                It may take a minute to arrive — and check your spam folder if you don&apos;t see it.
              </p>
            </div>

            <button
              type="button"
              onClick={() => switchView('sign_in')}
              className="w-full rounded-[var(--radius-control,12px)] bg-[var(--surface-2)] py-2 text-sm text-[var(--text-strong)] hover:bg-[var(--surface-elevated)] transition-colors"
            >
              Back to sign in
            </button>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(5,102,141,0.08),transparent_42%)]" />

      <GlassCard className="relative z-10 w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Briefcase className="h-8 w-8 text-[var(--link)]" />
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">CareerIQ</h1>
          <p className="text-sm text-[var(--text-soft)]">Your career workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label htmlFor="auth-first-name" className="sr-only">First name</label>
                  <GlassInput
                    id="auth-first-name"
                    name="firstName"
                    type="text"
                    autoComplete="given-name"
                    placeholder="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor="auth-last-name" className="sr-only">Last name</label>
                  <GlassInput
                    id="auth-last-name"
                    name="lastName"
                    type="text"
                    autoComplete="family-name"
                    placeholder="Last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div>
                <label htmlFor="auth-phone" className="sr-only">Phone number</label>
                <GlassInput
                  id="auth-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="Phone (optional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <p className="text-xs text-[var(--text-soft)] mt-1">For account recovery only. Never shared.</p>
              </div>
            </>
          )}
          <div>
            <label htmlFor="auth-email" className="sr-only">Email address</label>
            <GlassInput
              id="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-describedby={error ? 'auth-error' : undefined}
            />
          </div>
          <div>
            <label htmlFor="auth-password" className="sr-only">Password</label>
            <GlassInput
              id="auth-password"
              name="password"
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              placeholder={isSignUp ? `Password (${MIN_PASSWORD_LENGTH}+ characters)` : 'Password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={isSignUp ? MIN_PASSWORD_LENGTH : 1}
              aria-describedby={error ? 'auth-error' : undefined}
            />
            {!isSignUp && (
              <div className="mt-1.5 text-right">
                <button
                  type="button"
                  onClick={() => switchView('forgot_password')}
                  className="text-xs text-[var(--text-soft)] transition-colors hover:text-[var(--text-strong)]"
                >
                  Forgot password?
                </button>
              </div>
            )}
          </div>

          {error && (
            <p id="auth-error" className="text-xs text-[var(--badge-red-text)]" role="alert">{error}</p>
          )}

          <GlassButton type="submit" disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
                {isSignUp ? 'Creating account...' : 'Signing in...'}
              </>
            ) : isSignUp ? 'Create Account' : 'Sign In'}
          </GlassButton>
        </form>

        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-[var(--accent-muted)]" />
            <span className="text-xs text-[var(--text-soft)]">or</span>
            <div className="h-px flex-1 bg-[var(--accent-muted)]" />
          </div>

          <GlassButton
            variant="ghost"
            onClick={() => onGoogleSignIn()}
            className="w-full border border-[var(--line-soft)] gap-2"
          >
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </GlassButton>

          <button
            type="button"
            onClick={() => switchView(isSignUp ? 'sign_in' : 'sign_up')}
            className="text-xs text-[var(--text-soft)] hover:text-[var(--text-strong)] transition-colors"
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}
