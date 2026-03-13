import { MapPin } from 'lucide-react';
import type { GapPositioningMapEntry } from '@/types/resume-v2';

interface StrategyPlacementCardProps {
  positioningMap: GapPositioningMapEntry[];
}

export function StrategyPlacementCard({ positioningMap }: StrategyPlacementCardProps) {
  if (!positioningMap || positioningMap.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-[#b5dec2]" />
        <h3 className="text-sm font-semibold text-white/90">Strategy Placement Preview</h3>
      </div>

      <p className="text-xs text-white/50">
        Here&apos;s where your approved strategies will appear in the resume
      </p>

      <div className="space-y-2">
        {positioningMap.map((entry, i) => (
          <PlacementRow key={i} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function PlacementRow({ entry }: { entry: GapPositioningMapEntry }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-white/80 flex-1 min-w-0 truncate">{entry.requirement}</span>
        <span className="text-white/25 shrink-0 select-none">&rarr;</span>
        <span className="text-sm font-medium text-[#b5dec2]/80 shrink-0">{entry.where_to_feature}</span>
      </div>

      <details className="mt-1.5">
        <summary className="text-[10px] font-medium uppercase tracking-wider text-white/30 cursor-pointer select-none hover:text-white/50 transition-colors">
          How it&apos;s framed
        </summary>
        <div className="mt-2 space-y-2 pl-1">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-[#b5dec2]/50 mb-0.5">
              Positioning
            </div>
            <p className="text-sm text-white/70 leading-relaxed">{entry.narrative_positioning}</p>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-white/30 mb-0.5">
              Why this placement works
            </div>
            <p className="text-sm text-white/50 leading-relaxed">{entry.narrative_justification}</p>
          </div>
        </div>
      </details>
    </div>
  );
}
