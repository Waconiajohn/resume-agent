import { CheckCircle2, Shuffle, X } from 'lucide-react';

// ─── Status badge (filled pill) ────────────────────────────────────────────────

export function StatusBadge({ status }: { status: 'strong' | 'repositioned' | 'gap' }) {
  switch (status) {
    case 'strong':
      return (
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0"
          style={{
            color: '#b5dec2',
            backgroundColor: 'rgba(181,222,194,0.15)',
            border: '1px solid rgba(181,222,194,0.20)',
          }}
        >
          <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
          Direct Match
        </span>
      );
    case 'repositioned':
      return (
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0"
          style={{
            color: '#afc4ff',
            backgroundColor: 'rgba(175,196,255,0.15)',
            border: '1px solid rgba(175,196,255,0.20)',
          }}
        >
          <Shuffle className="h-2.5 w-2.5" aria-hidden="true" />
          Positioned
        </span>
      );
    case 'gap':
      return (
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0"
          style={{
            color: '#f0b8b8',
            backgroundColor: 'rgba(240,184,184,0.15)',
            border: '1px solid rgba(240,184,184,0.20)',
          }}
        >
          <X className="h-2.5 w-2.5" aria-hidden="true" />
          Gap
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
): { color: string; backgroundColor: string; border: string } {
  switch (importance) {
    case 'must_have':
      return {
        color: '#f0b8b8',
        backgroundColor: 'rgba(240,184,184,0.10)',
        border: '1px solid rgba(240,184,184,0.20)',
      };
    case 'important':
      return {
        color: '#f0d99f',
        backgroundColor: 'rgba(240,217,159,0.10)',
        border: '1px solid rgba(240,217,159,0.20)',
      };
    case 'nice_to_have':
    default:
      return {
        color: 'rgba(255,255,255,0.40)',
        backgroundColor: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.10)',
      };
  }
}
