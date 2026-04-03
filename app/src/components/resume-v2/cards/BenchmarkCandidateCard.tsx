import { Target } from 'lucide-react';
import type { BenchmarkCandidate } from '@/types/resume-v2';

export function BenchmarkCandidateCard({
  data,
  isLive = false,
}: {
  data: BenchmarkCandidate;
  isLive?: boolean;
}) {
  return (
    <div className="room-shell animate-[card-enter_500ms_ease-out_forwards] opacity-0 space-y-5">
      <div className="flex items-center gap-2">
        <div className="rounded-lg border border-[var(--badge-amber-text)]/18 bg-[var(--badge-amber-bg)] p-2.5">
          <Target className="h-4 w-4 text-[var(--badge-amber-text)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow-label">Benchmark expectations</p>
          <h3 className="mt-2 text-sm font-semibold text-[var(--text-strong)]">What a strong candidate usually shows</h3>
        </div>
        <span className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-2.5 py-1 text-[12px] uppercase tracking-[0.16em] text-[var(--text-soft)]">Used to fill in what the posting leaves out</span>
      </div>

      <div className="support-callout px-4 py-3">
        <p className="text-sm text-[var(--text-muted)] leading-relaxed">{data.ideal_profile_summary}</p>
      </div>

      {/* Expected achievements */}
      {((data.expected_achievements.length > 0) || (data.differentiators.length > 0)) && (
        isLive ? (
          <details>
            <summary className="text-xs font-medium text-[var(--text-soft)] cursor-pointer hover:text-[var(--text-muted)] uppercase tracking-wider select-none">
              More benchmark detail
            </summary>
            <div className="mt-3 space-y-4">
              {data.expected_achievements.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-medium text-[var(--text-soft)] uppercase tracking-[0.16em]">What stronger candidates usually prove</h4>
                  <div className="space-y-2">
                    {data.expected_achievements.map((a, i) => (
                      <div key={i} className="support-callout px-3 py-2">
                        <div className="text-sm font-medium text-[var(--text-strong)]">{a.area}</div>
                        <div className="text-xs text-[var(--text-soft)]">{a.description}</div>
                        <div className="mt-1 text-xs text-[var(--link)]/70">{a.typical_metrics}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {data.differentiators.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-medium text-[var(--text-soft)] uppercase tracking-[0.16em]">What often separates the strongest candidates</h4>
                  <div className="support-callout border border-dashed border-[var(--badge-amber-text)]/20 bg-[var(--badge-amber-bg)] p-3">
                    <ul className="space-y-1">
                      {data.differentiators.map((d, i) => (
                        <li key={i} className="text-sm text-[var(--text-soft)] pl-3 relative before:absolute before:left-0 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-[var(--badge-amber-text)]/50">{d}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </details>
        ) : (
          <>
            {data.expected_achievements.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-medium text-[var(--text-soft)] uppercase tracking-[0.16em]">What stronger candidates usually prove</h4>
                <div className="space-y-2">
                  {data.expected_achievements.map((a, i) => (
                    <div key={i} className="support-callout px-3 py-2">
                      <div className="text-sm font-medium text-[var(--text-strong)]">{a.area}</div>
                      <div className="text-xs text-[var(--text-soft)]">{a.description}</div>
                      <div className="mt-1 text-xs text-[#afc4ff]/70">{a.typical_metrics}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data.differentiators.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-medium text-[var(--text-soft)] uppercase tracking-[0.16em]">What often separates the strongest candidates</h4>
                <div className="support-callout border border-dashed border-[#f0d99f]/20 bg-[#f0d99f]/[0.02] p-3">
                  <ul className="space-y-1">
                    {data.differentiators.map((d, i) => (
                      <li key={i} className="text-sm text-[var(--text-soft)] pl-3 relative before:absolute before:left-0 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-[#f0d99f]/50">{d}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
