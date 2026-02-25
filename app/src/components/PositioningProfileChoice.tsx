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
        <Sparkles className="h-4 w-4 flex-shrink-0 text-[#afc4ff]" />
        <p className="text-sm font-medium text-white/90">Saved Positioning Profile Found</p>
        <span className="rounded-full border border-sky-300/20 bg-sky-400/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-100/90">
          Step 3 of 7
        </span>
      </div>
      <p className="text-xs text-white/70">
        This is your previously saved "Why Me" interview profile (career story, strengths, and evidence). It only affects how Step 3 starts and can speed up this run.
      </p>
      <p className="mb-4 mt-1 text-xs text-white/55">
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
            <span className="ml-1 text-[10px] font-normal text-white/56">(fastest)</span>
          </span>
        </GlassButton>

        <GlassButton
          variant="ghost"
          onClick={() => onChoice('update')}
          className="flex-1 min-w-0 border border-white/[0.06]"
        >
          <span className="truncate">
            Update It
            <span className="ml-1 text-[10px] font-normal text-white/40">(add/edit answers)</span>
          </span>
        </GlassButton>

        <GlassButton
          variant="ghost"
          onClick={() => onChoice('fresh')}
          className="flex-1 min-w-0 text-white/40 hover:text-white/60 border border-white/[0.06]"
        >
          <span className="truncate">
            Start fresh
            <span className="ml-1 text-[10px] font-normal text-white/30">(new interview)</span>
          </span>
        </GlassButton>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-white/45">
        You can continue with the resume process either way. This choice only changes how the positioning interview starts.
      </p>
    </GlassCard>
  );
}
