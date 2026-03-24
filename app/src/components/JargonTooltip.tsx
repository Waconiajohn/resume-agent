/**
 * JargonTooltip — Hover tooltip that explains platform-specific terminology.
 *
 * Targeted at 55+ executives who may be unfamiliar with career-tech jargon.
 * Renders a lightweight inline `<span>` with a dotted underline and an
 * accessible tooltip on hover/focus.
 *
 * Usage:
 *   <JargonTooltip term="ATS">resume text</JargonTooltip>
 *   <JargonTooltip definition="How we frame your experience...">Positioning</JargonTooltip>
 */

import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// Built-in definitions for common platform terms.
const BUILT_IN_DEFINITIONS: Record<string, string> = {
  'Career Profile':
    'Your professional identity — the story that drives every tool in the workspace.',
  'Gap Analysis':
    'How your experience compares to what a specific job requires, so we know exactly where to focus.',
  ATS: 'Applicant Tracking System — software that companies use to filter resumes before a human sees them.',
  Positioning:
    'How we frame your experience and story to match what this specific employer is looking for.',
  Blueprint:
    'The strategic plan for your resume — what to emphasise and how to tell your story — before we start writing.',
  'Benchmark Candidate':
    'The ideal candidate a hiring team pictures when they write the job description. Our goal is to show you as that person.',
  'Evidence Items':
    'Specific accomplishments, results, and examples from your career that prove you can do the job.',
  Narrative:
    'The overarching story that connects your career history and makes your resume feel coherent, not like a list of jobs.',
  'Adversarial Review':
    "A simulated hiring manager's critical read of your resume, looking for weaknesses before real employers do.",
  Humanise:
    'The process of removing AI-sounding language so your resume reads like a real person wrote it.',
};

interface JargonTooltipProps {
  /** The term to look up in the built-in dictionary. If provided with no `definition`, the built-in definition is used. */
  term?: keyof typeof BUILT_IN_DEFINITIONS | (string & Record<never, never>);
  /** An explicit tooltip definition, overrides the built-in dictionary. */
  definition?: string;
  /** The visible text to underline. Defaults to `term` if omitted. */
  children?: React.ReactNode;
  className?: string;
}

export function JargonTooltip({
  term,
  definition,
  children,
  className,
}: JargonTooltipProps) {
  const tooltipId = useId();
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  const resolvedDefinition = definition ?? (term ? BUILT_IN_DEFINITIONS[term] : undefined);

  // Close on Escape
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVisible(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [visible]);

  // Close on outside click
  useEffect(() => {
    if (!visible) return;
    const handler = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [visible]);

  if (!resolvedDefinition) {
    // No definition available — render children as plain text
    return <span className={className}>{children ?? term}</span>;
  }

  return (
    <span
      ref={containerRef}
      className={cn('relative inline-block', className)}
      style={{ isolation: 'isolate' }}
    >
      <span
        role="button"
        tabIndex={0}
        aria-describedby={tooltipId}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="cursor-help border-b border-dashed border-[var(--text-soft)] text-inherit transition-colors hover:border-[var(--accent)]"
        style={{ outline: 'none' }}
      >
        {children ?? term}
      </span>

      {visible && (
        <span
          id={tooltipId}
          role="tooltip"
          style={{
            background: 'var(--surface-elevated)',
            border: '1px solid var(--line-strong)',
            borderRadius: '10px',
            bottom: 'calc(100% + 8px)',
            boxShadow: '0 12px 32px -12px rgba(0,0,0,0.6)',
            color: 'var(--text-muted)',
            fontSize: '13px',
            left: '50%',
            lineHeight: 1.6,
            maxWidth: '260px',
            padding: '10px 14px',
            pointerEvents: 'none',
            position: 'absolute',
            transform: 'translateX(-50%)',
            whiteSpace: 'normal',
            width: 'max-content',
            zIndex: 8000,
          }}
        >
          {resolvedDefinition}
          {/* Arrow */}
          <span
            aria-hidden="true"
            style={{
              borderColor: 'var(--surface-elevated) transparent transparent transparent',
              borderStyle: 'solid',
              borderWidth: '5px 6px 0',
              bottom: '-5px',
              left: '50%',
              position: 'absolute',
              transform: 'translateX(-50%)',
            }}
          />
        </span>
      )}
    </span>
  );
}
