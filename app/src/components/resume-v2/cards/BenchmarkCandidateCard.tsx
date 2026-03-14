import { Target } from 'lucide-react';
import type { BenchmarkCandidate } from '@/types/resume-v2';

export function BenchmarkCandidateCard({ data }: { data: BenchmarkCandidate }) {
  return (
    <div className="animate-[card-enter_500ms_ease-out_forwards] opacity-0 space-y-4">
      <div className="flex items-center gap-2">
        <div className="bg-[#f0d99f]/10 p-2 rounded-full">
          <Target className="h-4 w-4 text-[#f0d99f]" />
        </div>
        <h3 className="text-sm font-semibold text-white/90">The Benchmark</h3>
        <span className="ml-auto text-xs text-white/40">What the hiring manager pictures</span>
      </div>

      <p className="text-sm text-white/70 leading-relaxed">{data.ideal_profile_summary}</p>

      {/* Expected achievements */}
      {data.expected_achievements.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-white/60 uppercase tracking-wider">Expected Achievements</h4>
          <div className="space-y-2">
            {data.expected_achievements.map((a, i) => (
              <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
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
          <h4 className="mb-2 text-xs font-medium text-white/60 uppercase tracking-wider">What Sets the Best Apart</h4>
          <div className="border border-dashed border-[#f0d99f]/20 bg-[#f0d99f]/[0.02] rounded-lg p-3">
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
