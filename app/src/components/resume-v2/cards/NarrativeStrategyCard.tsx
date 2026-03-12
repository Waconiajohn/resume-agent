import { Compass } from 'lucide-react';
import type { NarrativeStrategy } from '@/types/resume-v2';

export function NarrativeStrategyCard({ data }: { data: NarrativeStrategy }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Compass className="h-4 w-4 text-[#afc4ff]" />
        <h3 className="text-sm font-semibold text-white/90">Your Positioning</h3>
      </div>

      {/* Branded title */}
      <div className="rounded-lg border border-[#afc4ff]/15 bg-[#afc4ff]/[0.04] px-4 py-3 text-center">
        <div className="text-lg font-semibold text-white/90">{data.branded_title}</div>
        <div className="mt-1 text-sm text-[#afc4ff]/70">{data.primary_narrative}</div>
      </div>

      {/* Supporting themes */}
      <div className="flex flex-wrap gap-1.5">
        {data.supporting_themes.map((theme, i) => (
          <span key={i} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/60">{theme}</span>
        ))}
      </div>

      {/* Why Me story */}
      <div>
        <h4 className="mb-2 text-xs font-medium text-white/60 uppercase tracking-wider">Why You</h4>
        <p className="text-sm text-white/70 leading-relaxed">{data.why_me_concise}</p>
        {data.why_me_story && (
          <details className="mt-2">
            <summary className="text-xs text-white/40 cursor-pointer hover:text-white/60">Full positioning story</summary>
            <p className="mt-1 text-xs text-white/50 leading-relaxed">{data.why_me_story}</p>
          </details>
        )}
      </div>

      {/* Best line */}
      <div className="rounded-lg border border-[#b5dec2]/15 bg-[#b5dec2]/[0.04] px-4 py-3">
        <div className="text-xs font-medium text-[#b5dec2]/70 mb-1">Your Best Line</div>
        <p className="text-sm text-white/80 italic">&ldquo;{data.why_me_best_line}&rdquo;</p>
      </div>
    </div>
  );
}
