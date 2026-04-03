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
            color: 'var(--badge-green-text)',
            backgroundColor: 'var(--badge-green-bg)',
            border: '1px solid color-mix(in srgb, var(--badge-green-text) 18%, transparent)',
            borderLeftColor: 'color-mix(in srgb, var(--badge-green-text) 42%, transparent)',
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
            color: 'var(--link)',
            backgroundColor: 'var(--badge-blue-bg)',
            border: '1px solid color-mix(in srgb, var(--link) 18%, transparent)',
            borderLeftColor: 'color-mix(in srgb, var(--link) 42%, transparent)',
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
            color: 'var(--badge-red-text)',
            backgroundColor: 'var(--badge-red-bg)',
            border: '1px solid color-mix(in srgb, var(--badge-red-text) 18%, transparent)',
            borderLeftColor: 'color-mix(in srgb, var(--badge-red-text) 42%, transparent)',
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
        color: 'var(--badge-red-text)',
        backgroundColor: 'var(--badge-red-bg)',
        border: '1px solid color-mix(in srgb, var(--badge-red-text) 20%, transparent)',
        borderColor: 'color-mix(in srgb, var(--badge-red-text) 20%, transparent)',
      };
    case 'important':
      return {
        color: 'var(--badge-amber-text)',
        backgroundColor: 'var(--badge-amber-bg)',
        border: '1px solid color-mix(in srgb, var(--badge-amber-text) 20%, transparent)',
        borderColor: 'color-mix(in srgb, var(--badge-amber-text) 20%, transparent)',
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
