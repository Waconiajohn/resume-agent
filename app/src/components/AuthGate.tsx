import { useState } from 'react';
import { GlassCard } from './GlassCard';
import { GlassButton } from './GlassButton';
import { GlassInput } from './GlassInput';
import { Briefcase } from 'lucide-react';

interface AuthGateProps {
  onSignIn: (email: string, password: string) => Promise<{ error: unknown }>;
  onSignUp: (email: string, password: string, metadata?: { firstName: string; lastName: string; phone?: string }) => Promise<{ error: unknown }>;
  onGoogleSignIn: () => Promise<{ error: unknown }>;
}

export function AuthGate({ onSignIn, onSignUp, onGoogleSignIn }: AuthGateProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = isSignUp
      ? await onSignUp(email, password, { firstName, lastName, phone: phone || undefined })
      : await onSignIn(email, password);

    if (error) {
      setError((error as { message?: string })?.message ?? String(error));
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-300/[0.08] via-transparent to-transparent" />

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
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              aria-describedby={error ? 'auth-error' : undefined}
            />
          </div>

          {error && (
            <p id="auth-error" className="text-xs text-[var(--badge-red-text)]" role="alert">{error}</p>
          )}

          <GlassButton type="submit" disabled={loading} className="w-full">
            {loading ? 'Loading...' : isSignUp ? 'Create Account' : 'Sign In'}
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
            className="w-full border border-[var(--line-soft)]"
          >
            Continue with Google
          </GlassButton>

          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-xs text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors"
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}
