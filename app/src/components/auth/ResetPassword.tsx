import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { GlassCard } from '@/components/GlassCard';
import { GlassInput } from '@/components/GlassInput';
import { GlassButton } from '@/components/GlassButton';
import { Briefcase, Loader2 } from 'lucide-react';
import {
  MIN_PASSWORD_LENGTH,
  validatePasswordPolicy,
  checkPasswordBreached,
} from '@/lib/password-policy';

export function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);

  useEffect(() => {
    document.title = 'Reset Password | CareerIQ';
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSessionReady(true);
      } else {
        setSessionError(true);
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

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

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError((updateError as { message?: string })?.message ?? String(updateError));
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      navigate('/workspace');
    }, 2000);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-300/[0.08] via-transparent to-transparent" />

      <GlassCard className="relative z-10 w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Briefcase className="h-8 w-8 text-[var(--link)]" />
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">Set new password</h1>
          <p className="text-center text-sm text-[var(--text-soft)]">
            Choose a new password for your account.
          </p>
        </div>

        {success && (
          <div className="space-y-4">
            <p className="rounded-lg bg-[var(--accent-muted)] px-4 py-3 text-sm text-[var(--text-strong)]">
              Password updated. Redirecting to your workspace&hellip;
            </p>
          </div>
        )}

        {sessionError && !success && (
          <div className="space-y-4">
            <p className="rounded-lg bg-[var(--badge-red-bg,#fef2f2)] px-4 py-3 text-sm text-[var(--badge-red-text)]">
              This reset link has expired or is invalid. Please request a new one.
            </p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full text-xs text-[var(--text-soft)] transition-colors hover:text-[var(--text-strong)]"
            >
              Back to sign in
            </button>
          </div>
        )}

        {sessionReady && !success && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="reset-new-password" className="sr-only">New password</label>
              <GlassInput
                id="reset-new-password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder={`New password (${MIN_PASSWORD_LENGTH}+ characters)`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                aria-describedby={error ? 'reset-error' : undefined}
              />
            </div>
            <div>
              <label htmlFor="reset-confirm-password" className="sr-only">Confirm new password</label>
              <GlassInput
                id="reset-confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                aria-describedby={error ? 'reset-error' : undefined}
              />
            </div>

            {error && (
              <p id="reset-error" className="text-xs text-[var(--badge-red-text)]" role="alert">
                {error}
              </p>
            )}

            <GlassButton type="submit" disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
                  Updating&hellip;
                </>
              ) : (
                'Update password'
              )}
            </GlassButton>

            <button
              type="button"
              onClick={() => navigate('/')}
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
