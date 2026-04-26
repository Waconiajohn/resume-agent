/**
 * MfaEnrollFlow — Sprint B (auth hardening).
 *
 * Inline 3-step enrollment flow rendered inside SecurityCard:
 *   1. Scan the QR (or copy the secret) into an authenticator app.
 *   2. Type the 6-digit code from the app.
 *   3. Success — note that the next sign-in will require a code.
 *
 * The factor stays in 'unverified' state until step 2 succeeds; if the
 * user abandons the flow, the unverified factor is harmless and is
 * cleaned up next time the user enrolls successfully.
 */

import { useState } from 'react';
import { GlassButton } from '@/components/GlassButton';
import { GlassInput } from '@/components/GlassInput';
import { Loader2, ShieldCheck } from 'lucide-react';
import {
  enrollTotp,
  verifyEnrollment,
  recordMfaEvent,
  type EnrollmentInProgress,
} from '@/lib/mfa';

interface MfaEnrollFlowProps {
  onEnrolled: () => void;
  onCancel: () => void;
}

type Step = 'scan' | 'verify' | 'done';

export function MfaEnrollFlow({ onEnrolled, onCancel }: MfaEnrollFlowProps) {
  const [step, setStep] = useState<Step>('scan');
  const [enrollment, setEnrollment] = useState<EnrollmentInProgress | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const e = await enrollTotp();
      setEnrollment(e);
      setStep('scan');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start enrollment');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!enrollment) return;
    if (!/^\d{6}$/.test(code)) {
      setError('Code must be 6 digits.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await verifyEnrollment(enrollment.factorId, code);
      void recordMfaEvent('mfa_enrolled');
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code. Try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 0 — initial CTA. Defer the actual enroll API call until the user
  // confirms they want to start, so we don't leave orphaned unverified
  // factors when the user just clicks into Settings out of curiosity.
  if (!enrollment) {
    return (
      <div className="space-y-3" data-testid="mfa-enroll-intro">
        <p className="text-xs text-[var(--text-soft)]">
          Two-factor authentication adds a 6-digit code from an authenticator app on top of your
          password. You'll need an app like 1Password, Authy, or Google Authenticator.
        </p>
        {error && <p className="text-xs text-[var(--badge-red-text)]" role="alert">{error}</p>}
        <div className="flex gap-2">
          <GlassButton onClick={() => void handleStart()} disabled={loading}>
            {loading ? <Loader2 size={13} className="motion-safe:animate-spin" /> : 'Start enrollment'}
          </GlassButton>
          <GlassButton variant="ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </GlassButton>
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="space-y-3" data-testid="mfa-enroll-done">
        <div className="flex items-center gap-2 text-[var(--badge-green-text)]">
          <ShieldCheck size={16} />
          <span className="text-sm font-semibold">Two-factor authentication enabled.</span>
        </div>
        <p className="text-xs text-[var(--text-soft)]">
          Your next sign-in will ask for a 6-digit code from your authenticator app. If you ever
          lose access to that device, contact support to reset your password (which clears MFA so
          you can enroll a new one).
        </p>
        <div>
          <GlassButton onClick={onEnrolled}>Done</GlassButton>
        </div>
      </div>
    );
  }

  if (step === 'verify') {
    return (
      <div className="space-y-3" data-testid="mfa-enroll-verify">
        <p className="text-xs text-[var(--text-soft)]">
          Type the 6-digit code your authenticator app shows for{' '}
          <span className="font-mono">{enrollment.uri.split('?')[0].split('/').pop() ?? 'this account'}</span>.
        </p>
        <GlassInput
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          maxLength={6}
          data-testid="mfa-enroll-code-input"
        />
        {error && <p className="text-xs text-[var(--badge-red-text)]" role="alert">{error}</p>}
        <div className="flex gap-2">
          <GlassButton onClick={() => void handleVerify()} disabled={loading || code.length !== 6}>
            {loading ? <Loader2 size={13} className="motion-safe:animate-spin" /> : 'Verify and enable'}
          </GlassButton>
          <GlassButton variant="ghost" onClick={() => setStep('scan')} disabled={loading}>
            Back
          </GlassButton>
        </div>
      </div>
    );
  }

  // Default: 'scan' step.
  return (
    <div className="space-y-3" data-testid="mfa-enroll-scan">
      <p className="text-xs text-[var(--text-soft)]">
        Scan this QR code with your authenticator app, or copy the secret manually.
      </p>
      <div className="rounded-md border border-[var(--line-soft)] bg-white p-3 text-center">
        {/* qrCode is a data:image/svg+xml;... URL from Supabase. */}
        <img
          src={enrollment.qrCode}
          alt="MFA QR code"
          className="mx-auto max-w-[220px]"
        />
      </div>
      <div className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] p-2 text-center">
        <span className="block text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Manual entry</span>
        <code className="block break-all text-[12px] font-mono text-[var(--text-strong)]">{enrollment.secret}</code>
      </div>
      <div className="flex gap-2">
        <GlassButton onClick={() => setStep('verify')}>Continue</GlassButton>
        <GlassButton variant="ghost" onClick={onCancel}>Cancel</GlassButton>
      </div>
    </div>
  );
}
