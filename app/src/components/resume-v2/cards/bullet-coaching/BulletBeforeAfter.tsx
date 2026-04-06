/**
 * BulletBeforeAfter — Original bullet dimmed, AI suggestion highlighted.
 *
 * Gives the user a clear visual diff between what's currently on their resume
 * and what the AI is proposing. The "before" is deliberately de-emphasized so
 * the candidate's focus lands on the suggested improvement.
 *
 * The left border color on the Suggested section tracks the reviewState:
 *   - code_red   → red accent
 *   - confirm_fit → blue accent
 *   - strengthen  → amber accent (default)
 */

import { cn } from '@/lib/utils';

export interface BulletBeforeAfterProps {
  original: string;
  suggestion: string | null;
  isLoading?: boolean;
  reviewState?: string;
}

export function BulletBeforeAfter({
  original,
  suggestion,
  isLoading = false,
  reviewState,
}: BulletBeforeAfterProps) {
  // Border color tracks reviewState (Fix 5)
  const borderColor =
    reviewState === 'code_red'
      ? 'var(--bullet-code-red)'
      : reviewState === 'confirm_fit'
        ? 'var(--bullet-confirm)'
        : 'var(--bullet-strengthen)';

  return (
    <div className="space-y-2">
      {/* Current / original */}
      <div>
        <p
          className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: 'var(--text-soft)' }}
        >
          Current
        </p>
        <p
          className="text-[12px] leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {original}
        </p>
      </div>

      {/* Visual separator between current and suggested (Fix 8) */}
      <div className="border-t" style={{ borderColor: 'var(--line-soft)' }} />

      {/* Suggested / AI result — aria-live for dynamic updates (Fix 12) */}
      <div
        aria-live="polite"
        className={cn(
          'rounded-lg p-3',
        )}
        style={{ background: 'var(--surface-1)' }}
      >
        <p
          className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: 'var(--text-muted)' }}
        >
          Suggested
        </p>

        {isLoading ? (
          /* Shimmer skeleton while AI is working */
          <div className="space-y-1.5" aria-label="Generating suggestion" role="status">
            <div
              className="h-3 w-full animate-pulse rounded"
              style={{ background: 'var(--line-soft)' }}
            />
            <div
              className="h-3 w-4/5 animate-pulse rounded"
              style={{ background: 'var(--line-soft)' }}
            />
            <div
              className="h-3 w-3/5 animate-pulse rounded"
              style={{ background: 'var(--line-soft)' }}
            />
          </div>
        ) : suggestion ? (
          <p
            className="border-l-2 pl-3 text-[13px] font-medium leading-relaxed"
            style={{
              borderLeftColor: borderColor,
              color: 'var(--text-strong)',
            }}
          >
            {suggestion}
          </p>
        ) : (
          <p
            className="text-[12px] italic"
            style={{ color: 'var(--text-soft)' }}
          >
            AI suggestions will appear here
          </p>
        )}
      </div>
    </div>
  );
}
