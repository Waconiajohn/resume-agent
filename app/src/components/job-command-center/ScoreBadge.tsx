import { cn } from '@/lib/utils';

export function ScoreBadge({ score }: { score: number }) {
  return (
    <span
      className={cn(
        'rounded-md px-2 py-1 text-[12px] font-medium uppercase tracking-[0.12em] tabular-nums',
        score >= 80
          ? 'border border-[#b5dec2]/25 bg-[#b5dec2]/10 text-[#b5dec2]'
          : score >= 60
            ? 'border border-[#98b3ff]/25 bg-[#98b3ff]/10 text-[#98b3ff]'
            : 'border border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)]',
      )}
    >
      {score}
    </span>
  );
}
