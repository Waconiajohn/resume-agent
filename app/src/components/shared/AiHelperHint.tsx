import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AiHelperHintProps {
  title: string;
  body: string;
  tip?: string;
  className?: string;
}

export function AiHelperHint({ title, body, tip, className }: AiHelperHintProps) {
  return (
    <div className={cn('support-callout px-3.5 py-3', className)}>
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--link)]/78" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--link)]/78">
            {title}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{body}</p>
          {tip ? (
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-soft)]">{tip}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
