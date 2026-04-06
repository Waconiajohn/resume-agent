import { useState, useId } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ResumeHighlightProps {
  bulletText: string;
  highlightType: 'referenced' | 'strengthened' | 'added';
  contextSnippet?: string;
  children: React.ReactNode;
}

/**
 * Wraps a resume bullet and adds a visual highlight ring and optional context annotation.
 *
 * - `referenced`: blue glow ring (cross-reference from recognition statement)
 * - `strengthened`: green-tinted background with "Updated" badge
 * - `added`:        green-tinted background with "New" badge
 *
 * When `contextSnippet` is provided an info icon appears that reveals a tooltip on hover.
 */
export function ResumeHighlight({ highlightType, contextSnippet, children }: ResumeHighlightProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const tooltipId = useId();

  const isGreen = highlightType === 'strengthened' || highlightType === 'added';
  const badgeLabel = highlightType === 'strengthened' ? 'Updated' : highlightType === 'added' ? 'New' : null;

  return (
    <span
      className={cn(
        'relative flex items-start gap-1.5 rounded transition-all duration-500',
        highlightType === 'referenced' && 'ring-1 ring-blue-400/30 bg-blue-400/5 px-2',
        isGreen && 'ring-1 ring-green-400/30 bg-green-400/5 px-2',
      )}
    >
      <span className="flex-1">{children}</span>

      {/* Badge for strengthened / added */}
      {badgeLabel && (
        <span
          className={cn(
            'shrink-0 self-center rounded-sm px-1 py-px text-[0.6rem] font-bold uppercase tracking-wide',
            'bg-green-400/15 text-green-400',
          )}
          aria-label={badgeLabel}
        >
          {badgeLabel}
        </span>
      )}

      {/* Context info icon + tooltip */}
      {contextSnippet && (
        <span
          className="relative shrink-0 self-center"
          onMouseEnter={() => setTooltipVisible(true)}
          onMouseLeave={() => setTooltipVisible(false)}
          onFocus={() => setTooltipVisible(true)}
          onBlur={() => setTooltipVisible(false)}
        >
          <Info
            className={cn(
              'h-3 w-3 cursor-help transition-colors duration-150',
              highlightType === 'referenced' ? 'text-blue-400/60 hover:text-blue-400' : 'text-green-400/60 hover:text-green-400',
            )}
            aria-label="Show context about this bullet"
            aria-expanded={tooltipVisible}
            aria-describedby={tooltipVisible ? tooltipId : undefined}
            tabIndex={0}
            role="button"
          />
          {tooltipVisible && (
            <span
              id={tooltipId}
              role="tooltip"
              className={cn(
                'absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2',
                'w-56 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-3)] px-3 py-2',
                'text-xs leading-snug text-[var(--text-muted)] shadow-lg',
                'pointer-events-none',
              )}
            >
              {contextSnippet}
              {/* Caret */}
              <span
                className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[var(--line-soft)]"
                aria-hidden="true"
              />
            </span>
          )}
        </span>
      )}
    </span>
  );
}
