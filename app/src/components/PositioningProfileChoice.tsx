import { Sparkles } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { GlassButton } from './GlassButton';

interface PositioningProfileChoiceProps {
  updatedAt: string;  // ISO date string when the profile was last updated
  onChoice: (choice: 'reuse' | 'update' | 'fresh') => void;
}

/** Format an ISO date string as "Mon DD, YYYY" (e.g., "Feb 15, 2026") */
function formatDate(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function PositioningProfileChoice({
  updatedAt,
  onChoice,
}: PositioningProfileChoiceProps) {
  return (
    <GlassCard className="mx-4 p-4">
      {/* Header row */}
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="h-4 w-4 flex-shrink-0 text-[var(--accent)]" />
        <p className="text-sm font-medium text-[var(--text-strong)]">Saved Positioning Profile Found</p>
        <span className="rounded-full border border-[var(--accent-strong)] bg-[var(--accent-muted)] px-2 py-0.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
          Step 3 of 7
        </span>
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        This is your previously saved Career Profile interview context (career story, strengths, and evidence). It only affects how Step 3 starts and can speed up this run.
      </p>
      <p className="mb-4 mt-1 text-xs text-[var(--text-soft)]">
        Last updated: {formatDate(updatedAt)}
      </p>

      {/* Choice buttons */}
      <div className="flex flex-wrap gap-2">
        <GlassButton
          variant="primary"
          onClick={() => onChoice('reuse')}
          className="flex-1 min-w-0"
        >
          <span className="truncate">
            Use Saved Profile
            <span className="ml-1 text-[12px] font-normal text-[var(--text-soft)]">(fastest)</span>
          </span>
        </GlassButton>

        <GlassButton
          variant="ghost"
          onClick={() => onChoice('update')}
          className="flex-1 min-w-0 border border-[var(--line-soft)]"
        >
          <span className="truncate">
            Update It
            <span className="ml-1 text-[12px] font-normal text-[var(--text-soft)]">(add/edit answers)</span>
          </span>
        </GlassButton>

        <GlassButton
          variant="ghost"
          onClick={() => onChoice('fresh')}
          className="flex-1 min-w-0 text-[var(--text-soft)] hover:text-[var(--text-muted)] border border-[var(--line-soft)]"
        >
          <span className="truncate">
            Start fresh
            <span className="ml-1 text-[12px] font-normal text-[var(--text-soft)]">(new interview)</span>
          </span>
        </GlassButton>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-soft)]">
        You can continue with the resume process either way. This choice only changes how the positioning interview starts.
      </p>
    </GlassCard>
  );
}
