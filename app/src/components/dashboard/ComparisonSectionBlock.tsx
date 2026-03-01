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
      isDifferent ? 'border-emerald-400/30 bg-emerald-500/[0.04]' : 'border-white/[0.08] bg-white/[0.02]',
    )}>
      <div className="mb-3 flex items-center gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-white/60">{title}</h4>
        {isDifferent && (
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
            Different
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-white/[0.03] px-3 py-2">
          {leftContent ? (
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-white/75">{leftContent}</pre>
          ) : (
            <span className="text-xs text-white/30 italic">Not available</span>
          )}
        </div>
        <div className="rounded-lg bg-white/[0.03] px-3 py-2">
          {rightContent ? (
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-white/75">{rightContent}</pre>
          ) : (
            <span className="text-xs text-white/30 italic">Not available</span>
          )}
        </div>
      </div>
    </div>
  );
}
