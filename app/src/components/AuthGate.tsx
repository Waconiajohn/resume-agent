import { useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { GlassButton } from './GlassButton';
import { GlassInput } from './GlassInput';
import { supabase } from '@/lib/supabase';
import { SOCIAL_AUTH_PROVIDERS, type SocialAuthProvider } from '@/lib/auth-providers';
import {
  MIN_PASSWORD_LENGTH,
  validatePasswordPolicy,
  checkPasswordBreached,
} from '@/lib/password-policy';

/**
 * Sales page "Get started" links include `?auth=signup` so the gate opens on
 * the signup tab. Direct app links keep the default sign-in view.
 */
function initialViewFromUrl(): AuthView {
  if (typeof window === 'undefined') return 'sign_in';
  const params = new URLSearchParams(window.location.search);
  return params.get('auth') === 'signup' ? 'sign_up' : 'sign_in';
}

interface AuthGateProps {
  onSignIn: (email: string, password: string) => Promise<{ error: unknown }>;
  onSignUp: (
    email: string,
    password: string,
    metadata?: { firstName: string; lastName: string; phone?: string },
  ) => Promise<{ error: unknown }>;
  onSocialSignIn: (provider: SocialAuthProvider) => Promise<{ error: unknown }>;
}

type AuthView = 'sign_in' | 'sign_up' | 'forgot_password';

const PROOF_POINTS = [
  'Build one master profile, then tailor each application from it.',
  'Keep every claim grounded in your actual career evidence.',
  'Move from job search to resume, networking, interview prep, and follow-up in one workspace.',
];

const PRODUCT_STEPS = [
  { label: 'Profile', value: 'Career proof' },
  { label: 'Target', value: 'Role benchmark' },
  { label: 'Apply', value: 'Resume and outreach' },
];

function getAuthErrorMessage(error: unknown, mode: AuthView): string {
  const raw = ((error as { message?: string; code?: string })?.message ?? String(error)).trim();
  const normalized = raw.toLowerCase();

  if (
    normalized.includes('provider is not enabled')
    || normalized.includes('unsupported provider')
    || normalized.includes('provider not found')
  ) {
    return 'That sign-in option is not enabled in Supabase yet. Use email and password for now, or try another social option.';
  }

  if (normalized.includes('rate limit') || normalized.includes('too many')) {
    if (mode === 'sign_up') {
      return 'Supabase is temporarily limiting new-account emails for this address or browser. Wait a few minutes, then try again, or use Sign In if the account was already created.';
    }
    if (mode === 'forgot_password') {
      return 'Password-reset emails are temporarily rate limited. Wait a few minutes before sending another reset link.';
    }
    return 'Too many sign-in attempts. Wait a few minutes, then try again.';
  }

  if (normalized.includes('email not confirmed')) {
    return 'Your account exists, but the email still needs to be confirmed. Check your inbox and spam folder for the confirmation link.';
  }

  if (normalized.includes('invalid login credentials')) {
    return 'That email and password did not match. Check the password, or use "Forgot password?" to reset it.';
  }

  return raw || 'Something went wrong. Please try again.';
}

function ProviderMark({ provider }: { provider: SocialAuthProvider }) {
  if (provider === 'google') {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[13px] font-extrabold text-[#4285f4]">
        G
      </span>
    );
  }

  if (provider === 'azure') {
    return (
      <span className="grid h-5 w-5 grid-cols-2 gap-0.5" aria-hidden="true">
        <span className="bg-[#f25022]" />
        <span className="bg-[#7fba00]" />
        <span className="bg-[#00a4ef]" />
        <span className="bg-[#ffb900]" />
      </span>
    );
  }

  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[#0a66c2] text-[12px] font-extrabold text-white">
      in
    </span>
  );
}

function AuthShell({
  children,
  eyebrow,
  title,
  subtitle,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="min-h-screen bg-surface">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,rgba(5,102,141,0.08)_1px,transparent_1px),linear-gradient(180deg,rgba(5,102,141,0.06)_1px,transparent_1px)] bg-[length:56px_56px]" />
      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_440px] lg:px-8">
        <section className="hidden lg:block">
          <div className="max-w-xl">
            <a href="/sales" className="inline-flex items-center gap-2 text-sm font-extrabold text-[var(--text-strong)]">
              <BriefcaseBusiness className="h-5 w-5 text-[var(--link)]" />
              Career<span className="text-[var(--link)]">IQ</span>
            </a>
            <p className="mt-16 text-xs font-extrabold uppercase tracking-[0.22em] text-[var(--link)]">
              {eyebrow}
            </p>
            <h1 className="mt-4 text-4xl font-extrabold tracking-normal text-[var(--text-strong)] xl:text-5xl">
              {title}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-[var(--text-muted)]">
              {subtitle}
            </p>
            <div className="mt-8 grid gap-3">
              {PROOF_POINTS.map((point) => (
                <div key={point} className="flex items-start gap-3 rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-2)] p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--badge-green-text)]" />
                  <span className="text-sm font-medium leading-6 text-[var(--text-muted)]">{point}</span>
                </div>
              ))}
            </div>
            <div className="mt-8 grid max-w-lg grid-cols-3 gap-3">
              {PRODUCT_STEPS.map((step) => (
                <div key={step.label} className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-1)] p-4">
                  <div className="text-xs font-bold uppercase text-[var(--text-soft)]">{step.label}</div>
                  <div className="mt-2 text-sm font-extrabold text-[var(--text-strong)]">{step.value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <main className="mx-auto w-full max-w-[440px]">
          <div className="mb-5 flex items-center justify-center gap-2 lg:hidden">
            <BriefcaseBusiness className="h-5 w-5 text-[var(--link)]" />
            <span className="text-base font-extrabold text-[var(--text-strong)]">
              Career<span className="text-[var(--link)]">IQ</span>
            </span>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

export function AuthGate({ onSignIn, onSignUp, onSocialSignIn }: AuthGateProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [view, setView] = useState<AuthView>(initialViewFromUrl);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<SocialAuthProvider | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [signUpSent, setSignUpSent] = useState(false);
  const [signUpEmail, setSignUpEmail] = useState('');

  const isSignUp = view === 'sign_up';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

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
            + 'Pick a different one, or use a password manager to generate a strong unique password.',
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
      setError(getAuthErrorMessage(error, view));
    } else if (isSignUp) {
      setSignUpEmail(email);
      setSignUpSent(true);
      setPassword('');
    }
    setLoading(false);
  };

  const handleSocialSignIn = async (provider: SocialAuthProvider) => {
    setError(null);
    setLoadingProvider(provider);
    const { error } = await onSocialSignIn(provider);
    if (error) {
      setError(getAuthErrorMessage(error, view));
      setLoadingProvider(null);
    }
  };

  const handleForgotPassword = async (e: FormEvent) => {
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
      setError(getAuthErrorMessage(error, 'forgot_password'));
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
      <AuthShell
        eyebrow="Account recovery"
        title="Get back into your workspace."
        subtitle="Password reset stays inside Supabase Auth. We only send the recovery link to the email on the account."
      >
        <section className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-1)] p-6 shadow-[var(--shadow-mid)] sm:p-8">
          <div className="mb-6 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[var(--badge-blue-bg)] text-[var(--link)]">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-[var(--text-strong)]">Reset password</h1>
              <p className="mt-1 text-sm text-[var(--text-soft)]">Enter your email and we will send a reset link.</p>
            </div>
          </div>

          {resetSent ? (
            <div className="space-y-4">
              <p className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-sm text-[var(--text-strong)]">
                Check your email for a reset link. It may take a minute to arrive.
              </p>
              <GlassButton type="button" variant="secondary" onClick={() => switchView('sign_in')} className="w-full">
                Back to sign in
              </GlassButton>
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
                <p id="auth-error" className="rounded-[8px] bg-[var(--badge-red-bg)] px-3 py-2 text-xs font-semibold text-[var(--badge-red-text)]" role="alert">{error}</p>
              )}

              <GlassButton type="submit" loading={loading} className="w-full">
                Send reset link
              </GlassButton>

              <button
                type="button"
                onClick={() => switchView('sign_in')}
                className="w-full text-xs font-bold text-[var(--text-soft)] transition-colors hover:text-[var(--text-strong)]"
              >
                Back to sign in
              </button>
            </form>
          )}
        </section>
      </AuthShell>
    );
  }

  if (signUpSent) {
    return (
      <AuthShell
        eyebrow="One last step"
        title="Confirm your email to activate CareerIQ."
        subtitle="Supabase email confirmation is on, so new accounts are not active until the inbox link is clicked."
      >
        <section className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-1)] p-6 shadow-[var(--shadow-mid)] sm:p-8">
          <div className="mb-6 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[var(--badge-green-bg)] text-[var(--badge-green-text)]">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-[var(--text-strong)]">Almost there</h1>
              <p className="mt-1 text-sm text-[var(--text-soft)]">Confirm your email to finish creating your account.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-sm text-[var(--text-strong)]">
              <p>
                We sent a confirmation link to{' '}
                <span className="font-extrabold text-[var(--link)]">{signUpEmail}</span>.
              </p>
              <p className="mt-2 text-[13px] leading-5 text-[var(--text-muted)]">
                Click that link, then return here and sign in. Check spam if it does not show up in a minute.
              </p>
            </div>

            <GlassButton type="button" variant="secondary" onClick={() => switchView('sign_in')} className="w-full">
              Back to sign in
            </GlassButton>
          </div>
        </section>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow={isSignUp ? 'Create your workspace' : 'Welcome back'}
      title={isSignUp ? 'Start with your career proof, not a blank page.' : 'Open your career command center.'}
      subtitle={isSignUp
        ? 'Create your account, confirm your email, and CareerIQ will guide you into your first Career Vault.'
        : 'Pick up your job search, applications, networking, interview prep, and follow-ups where you left them.'}
    >
      <section className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-1)] p-6 shadow-[var(--shadow-mid)] sm:p-8">
        <div className="mb-6">
          <div className="inline-flex rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-2)] p-1" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              role="tab"
              aria-selected={!isSignUp}
              onClick={() => switchView('sign_in')}
              className={`min-h-[36px] rounded-[6px] px-4 text-sm font-extrabold transition-colors ${
                !isSignUp
                  ? 'bg-[var(--surface-3)] text-[var(--text-strong)] shadow-[var(--shadow-low)]'
                  : 'text-[var(--text-soft)] hover:text-[var(--text-strong)]'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isSignUp}
              onClick={() => switchView('sign_up')}
              className={`min-h-[36px] rounded-[6px] px-4 text-sm font-extrabold transition-colors ${
                isSignUp
                  ? 'bg-[var(--surface-3)] text-[var(--text-strong)] shadow-[var(--shadow-low)]'
                  : 'text-[var(--text-soft)] hover:text-[var(--text-strong)]'
              }`}
            >
              Create account
            </button>
          </div>
          <h1 className="mt-5 text-2xl font-extrabold text-[var(--text-strong)]">
            {isSignUp ? 'Create your account' : 'Sign in'}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            {isSignUp
              ? 'Use social login or email. Email accounts require confirmation before the workspace opens.'
              : 'Use the same method you used when you created the account.'}
          </p>
        </div>

        <div className="grid gap-2">
          {SOCIAL_AUTH_PROVIDERS.map((provider) => (
            <GlassButton
              key={provider.id}
              variant="ghost"
              type="button"
              onClick={() => void handleSocialSignIn(provider.id)}
              disabled={Boolean(loadingProvider)}
              className="w-full justify-start border-[var(--line-soft)] bg-[var(--surface-3)] px-4"
            >
              {loadingProvider === provider.id ? (
                <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
              ) : (
                <ProviderMark provider={provider.id} />
              )}
              <span>{provider.label}</span>
            </GlassButton>
          ))}
        </div>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-[var(--line-soft)]" />
          <span className="text-xs font-bold uppercase text-[var(--text-soft)]">or use email</span>
          <div className="h-px flex-1 bg-[var(--line-soft)]" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
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
                <div>
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
                <p className="mt-1.5 text-xs text-[var(--text-soft)]">For account recovery only. Never shared.</p>
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
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={() => switchView('forgot_password')}
                  className="text-xs font-bold text-[var(--text-soft)] transition-colors hover:text-[var(--text-strong)]"
                >
                  Forgot password?
                </button>
              </div>
            )}
          </div>

          {error && (
            <p id="auth-error" className="rounded-[8px] bg-[var(--badge-red-bg)] px-3 py-2 text-xs font-semibold text-[var(--badge-red-text)]" role="alert">{error}</p>
          )}

          <GlassButton type="submit" loading={loading} className="w-full">
            {isSignUp ? 'Create Account' : 'Sign In'}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </GlassButton>
        </form>

        <div className="mt-5 grid gap-3 rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-2)] p-4 text-sm">
          <div className="flex items-center gap-2 font-bold text-[var(--text-strong)]">
            <ShieldCheck className="h-4 w-4 text-[var(--badge-green-text)]" />
            Supabase-secured session
          </div>
          <div className="grid gap-2 text-xs font-medium leading-5 text-[var(--text-muted)]">
            <span className="flex items-center gap-2"><BadgeCheck className="h-3.5 w-3.5 text-[var(--link)]" /> Email confirmation stays on.</span>
            <span className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-[var(--link)]" /> Built to support future outplacement teams.</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => switchView(isSignUp ? 'sign_in' : 'sign_up')}
          className="mt-5 w-full text-xs font-bold text-[var(--text-soft)] transition-colors hover:text-[var(--text-strong)]"
        >
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </button>
      </section>
    </AuthShell>
  );
}
