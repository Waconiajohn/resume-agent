import { cn } from '@/lib/utils';

export function ScoreBadge({ score }: { score: number }) {
  return (
    <span
      className={cn(
        'rounded-md px-2 py-1 text-[12px] font-medium uppercase tracking-[0.12em] tabular-nums',
        score >= 80
          ? 'border border-[var(--badge-green-text)]/25 bg-[var(--badge-green-bg)] text-[var(--badge-green-text)]'
          : score >= 60
            ? 'border border-[var(--link)]/25 bg-[var(--link)]/10 text-[var(--link)]'
            : 'border border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)]',
      )}
    >
      {score}
    </span>
  );
}
