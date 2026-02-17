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
        <Sparkles className="h-4 w-4 text-blue-400 flex-shrink-0" />
        <p className="text-sm font-medium text-white/90">Found Your Positioning Profile</p>
      </div>
      <p className="mb-4 text-xs text-white/60">
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
            Use it
            <span className="ml-1 text-[10px] font-normal text-blue-200/70">(faster)</span>
          </span>
        </GlassButton>

        <GlassButton
          variant="ghost"
          onClick={() => onChoice('update')}
          className="flex-1 min-w-0 border border-white/[0.06]"
        >
          <span className="truncate">
            Update
            <span className="ml-1 text-[10px] font-normal text-white/40">(review)</span>
          </span>
        </GlassButton>

        <GlassButton
          variant="ghost"
          onClick={() => onChoice('fresh')}
          className="flex-1 min-w-0 text-white/40 hover:text-white/60 border border-white/[0.06]"
        >
          <span className="truncate">
            Start fresh
            <span className="ml-1 text-[10px] font-normal text-white/30">(redo all)</span>
          </span>
        </GlassButton>
      </div>
    </GlassCard>
  );
}
