import { Target } from 'lucide-react';
import type { BenchmarkCandidate } from '@/types/resume-v2';

export function BenchmarkCandidateCard({ data }: { data: BenchmarkCandidate }) {
  return (
    <div className="room-shell animate-[card-enter_500ms_ease-out_forwards] opacity-0 space-y-5">
      <div className="flex items-center gap-2">
        <div className="rounded-lg border border-[#f0d99f]/18 bg-[#f0d99f]/10 p-2.5">
          <Target className="h-4 w-4 text-[#f0d99f]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow-label">Benchmark expectations</p>
          <h3 className="mt-2 text-sm font-semibold text-white/90">What a strong candidate usually shows</h3>
        </div>
        <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/42">Used to fill in what the posting leaves out</span>
      </div>

      <div className="support-callout px-4 py-3">
        <p className="text-sm text-white/70 leading-relaxed">{data.ideal_profile_summary}</p>
      </div>

      {/* Expected achievements */}
      {data.expected_achievements.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-white/60 uppercase tracking-[0.16em]">What stronger candidates usually prove</h4>
          <div className="space-y-2">
            {data.expected_achievements.map((a, i) => (
              <div key={i} className="support-callout px-3 py-2">
                <div className="text-sm font-medium text-white/80">{a.area}</div>
                <div className="text-xs text-white/50">{a.description}</div>
                <div className="mt-1 text-xs text-[#afc4ff]/70">{a.typical_metrics}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Differentiators */}
      {data.differentiators.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-white/60 uppercase tracking-[0.16em]">What often separates the strongest candidates</h4>
          <div className="support-callout border border-dashed border-[#f0d99f]/20 bg-[#f0d99f]/[0.02] p-3">
            <ul className="space-y-1">
              {data.differentiators.map((d, i) => (
                <li key={i} className="text-sm text-white/60 pl-3 relative before:absolute before:left-0 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-[#f0d99f]/50">{d}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
