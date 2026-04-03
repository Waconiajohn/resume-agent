import { cn } from '@/lib/utils';

interface ComparisonSectionBlockProps {
  title: string;
  leftContent: string | null;
  rightContent: string | null;
}

export function ComparisonSectionBlock({ title, leftContent, rightContent }: ComparisonSectionBlockProps) {
  const isDifferent = leftContent !== rightContent;

  return (
    <div className={cn(
      'rounded-xl border p-4',
      isDifferent ? 'border-[var(--badge-green-text)]/30 bg-[var(--badge-green-bg)]' : 'border-[var(--line-soft)] bg-[var(--accent-muted)]',
    )}>
      <div className="mb-3 flex items-center gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">{title}</h4>
        {isDifferent && (
          <span className="rounded-full bg-[var(--badge-green-bg)] px-2 py-0.5 text-[12px] text-[var(--badge-green-text)]">
            Different
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-[var(--accent-muted)] px-3 py-2">
          {leftContent ? (
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--text-muted)]">{leftContent}</pre>
          ) : (
            <span className="text-xs text-[var(--text-soft)] italic">Not available</span>
          )}
        </div>
        <div className="rounded-lg bg-[var(--accent-muted)] px-3 py-2">
          {rightContent ? (
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--text-muted)]">{rightContent}</pre>
          ) : (
            <span className="text-xs text-[var(--text-soft)] italic">Not available</span>
          )}
        </div>
      </div>
    </div>
  );
}
