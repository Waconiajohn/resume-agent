// B1 stub — fleshed out in B2.
import { GlassCard } from '@/components/GlassCard';
import type { V3Strategy } from '@/hooks/useV3Pipeline';

interface Props {
  strategy: V3Strategy | null;
}

export function V3StrategyPanel({ strategy }: Props) {
  return (
    <GlassCard className="p-5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        Strategy
      </h2>
      {!strategy ? (
        <p className="text-sm text-[var(--text-soft)] mt-3">Waiting on strategize stage…</p>
      ) : (
        <div className="mt-3 space-y-2 text-sm text-[var(--text-strong)]">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-soft)]">Frame</div>
            <div className="font-medium">{strategy.positioningFrame}</div>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
