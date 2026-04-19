// B1 stub — fleshed out in B3/B5.
import { GlassCard } from '@/components/GlassCard';
import type { V3StructuredResume, V3WrittenResume, V3VerifyResult } from '@/hooks/useV3Pipeline';

interface Props {
  structured: V3StructuredResume | null;
  written: V3WrittenResume | null;
  verify: V3VerifyResult | null;
  editable?: boolean;
  onEdit?: (updated: V3WrittenResume | null) => void;
}

export function V3ResumeView({ written }: Props) {
  return (
    <GlassCard className="p-6">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        Resume
      </h2>
      {!written ? (
        <p className="text-sm text-[var(--text-soft)] mt-3">Waiting on write stage…</p>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-[var(--text-strong)] leading-relaxed">
            {written.summary}
          </p>
          <p className="text-[11px] text-[var(--text-soft)] mt-4">
            ({written.positions.length} positions, {written.selectedAccomplishments.length} accomplishments, {written.coreCompetencies.length} competencies — detail rendering in B3)
          </p>
        </div>
      )}
    </GlassCard>
  );
}
