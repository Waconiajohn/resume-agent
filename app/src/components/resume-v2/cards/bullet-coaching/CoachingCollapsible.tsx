/**
 * CoachingCollapsible — Collapsible coaching tips section.
 *
 * Wraps the coaching text (or a custom children subtree) in a togglable panel.
 * For code_red bullets the parent expands this by default so critical guidance
 * is immediately visible. For lower-urgency states it starts collapsed to keep
 * the UI compact.
 */

import { useState, useId } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CoachingCollapsibleProps {
  defaultExpanded?: boolean;
  coachingText?: string;
  children?: React.ReactNode;
}

export function CoachingCollapsible({
  defaultExpanded = false,
  coachingText,
  children,
}: CoachingCollapsibleProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const collapsibleId = useId();

  const hasContent = coachingText || children;
  if (!hasContent) return null;

  return (
    <div
      className="rounded-lg border"
      style={{ borderColor: 'var(--line-soft)' }}
    >
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className={cn(
          'flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 rounded-lg',
          isExpanded && 'rounded-b-none',
        )}
        aria-expanded={isExpanded}
        aria-controls={collapsibleId}
        style={{
          background: isExpanded ? 'var(--surface-1)' : 'transparent',
        }}
      >
        <span
          className="text-[12px] font-semibold uppercase tracking-[0.1em]"
          style={{ color: 'var(--text-muted)' }}
        >
          Coach Tips
        </span>
        {isExpanded ? (
          <ChevronUp
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: 'var(--text-soft)' }}
            aria-hidden="true"
          />
        ) : (
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: 'var(--text-soft)' }}
            aria-hidden="true"
          />
        )}
      </button>

      {/* Collapsible body — smooth max-height animation */}
      <div
        id={collapsibleId}
        className={cn(
          'overflow-hidden transition-all duration-300 ease-in-out',
          isExpanded ? 'max-h-[800px]' : 'max-h-0',
        )}
      >
        <div
          className="border-t px-3 py-3"
          style={{
            borderTopColor: 'var(--line-soft)',
            background: 'var(--surface-1)',
          }}
        >
          {coachingText && (
            <p
              className="text-[13px] leading-relaxed whitespace-pre-line"
              style={{ color: 'var(--text-muted)' }}
            >
              {coachingText}
            </p>
          )}
          {children && <div className="mt-2">{children}</div>}
        </div>
      </div>
    </div>
  );
}
