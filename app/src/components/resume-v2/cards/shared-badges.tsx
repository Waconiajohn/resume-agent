import { CheckCircle2, Shuffle, X } from 'lucide-react';

// ─── Status badge (structured marker) ───────────────────────────────────────

export function StatusBadge({
  status,
  labelOverride,
}: {
  status: 'strong' | 'repositioned' | 'gap';
  labelOverride?: string;
}) {
  switch (status) {
    case 'strong':
      return (
        <span
          className="inline-flex items-center gap-1.5 border-l-2 rounded-md px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.14em] shrink-0"
          style={{
            color: '#b5dec2',
            backgroundColor: 'rgba(181,222,194,0.08)',
            border: '1px solid rgba(181,222,194,0.18)',
            borderLeftColor: 'rgba(181,222,194,0.42)',
          }}
        >
          <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
          {labelOverride ?? 'Already Covered'}
        </span>
      );
    case 'repositioned':
      return (
        <span
          className="inline-flex items-center gap-1.5 border-l-2 rounded-md px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.14em] shrink-0"
          style={{
            color: '#afc4ff',
            backgroundColor: 'rgba(175,196,255,0.08)',
            border: '1px solid rgba(175,196,255,0.18)',
            borderLeftColor: 'rgba(175,196,255,0.42)',
          }}
        >
          <Shuffle className="h-2.5 w-2.5" aria-hidden="true" />
          {labelOverride ?? 'Partially Covered'}
        </span>
      );
    case 'gap':
      return (
        <span
          className="inline-flex items-center gap-1.5 border-l-2 rounded-md px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.14em] shrink-0"
          style={{
            color: '#f0b8b8',
            backgroundColor: 'rgba(240,184,184,0.08)',
            border: '1px solid rgba(240,184,184,0.18)',
            borderLeftColor: 'rgba(240,184,184,0.42)',
          }}
        >
          <X className="h-2.5 w-2.5" aria-hidden="true" />
          {labelOverride ?? 'Not Addressed'}
        </span>
      );
  }
}

// ─── Importance labels (unified) ────────────────────────────────────────────────

export const IMPORTANCE_LABELS: Record<string, string> = {
  must_have: 'Must Have',
  important: 'Important',
  nice_to_have: 'Nice to Have',
};

export function importanceLabel(importance: string): string {
  return IMPORTANCE_LABELS[importance] ?? importance;
}

export function importanceStyle(
  importance: string,
): { color: string; backgroundColor: string; border: string; borderColor: string } {
  switch (importance) {
    case 'must_have':
      return {
        color: '#f0b8b8',
        backgroundColor: 'rgba(240,184,184,0.10)',
        border: '1px solid rgba(240,184,184,0.20)',
        borderColor: 'rgba(240,184,184,0.20)',
      };
    case 'important':
      return {
        color: '#f0d99f',
        backgroundColor: 'rgba(240,217,159,0.10)',
        border: '1px solid rgba(240,217,159,0.20)',
        borderColor: 'rgba(240,217,159,0.20)',
      };
    case 'nice_to_have':
    default:
      return {
        color: 'rgba(255,255,255,0.40)',
        backgroundColor: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderColor: 'rgba(255,255,255,0.10)',
      };
  }
}
