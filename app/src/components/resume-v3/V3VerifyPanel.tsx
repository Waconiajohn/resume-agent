// B1 stub — fleshed out in B4.
import { GlassCard } from '@/components/GlassCard';
import type { V3VerifyResult } from '@/hooks/useV3Pipeline';

interface Props {
  verify: V3VerifyResult | null;
  isRunning: boolean;
}

export function V3VerifyPanel({ verify, isRunning }: Props) {
  return (
    <GlassCard className="p-5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        Verify
      </h2>
      {!verify ? (
        <p className="text-sm text-[var(--text-soft)] mt-3">
          {isRunning ? 'Verify stage pending…' : 'Not yet run.'}
        </p>
      ) : (
        <div className="mt-3">
          <div className="text-sm font-medium text-[var(--text-strong)]">
            {verify.passed ? 'Passed' : `Failed with ${verify.issues.filter(i => i.severity === 'error').length} errors`}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
