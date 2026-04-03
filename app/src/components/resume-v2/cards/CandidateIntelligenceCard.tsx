import { User } from 'lucide-react';
import type { CandidateIntelligence } from '@/types/resume-v2';

export function CandidateIntelligenceCard({
  data,
  isLive = false,
}: {
  data: CandidateIntelligence;
  isLive?: boolean;
}) {
  const visibleOutcomes = isLive ? data.quantified_outcomes.slice(0, 3) : data.quantified_outcomes.slice(0, 6);
  const hiddenOutcomes = isLive ? data.quantified_outcomes.slice(3) : [];

  return (
    <div className="room-shell animate-[card-enter_500ms_ease-out_forwards] opacity-0 space-y-5">
      <div className="flex items-center gap-2">
        <div className="rounded-lg border border-[var(--badge-green-text)]/18 bg-[var(--badge-green-text)]/10 p-2.5">
          <User className="h-4 w-4 text-[var(--badge-green-text)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow-label">Resume strengths</p>
          <h3 className="mt-2 text-sm font-semibold text-[var(--text-strong)]">What your resume already gives us</h3>
        </div>
        <span className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-2.5 py-1 text-[12px] uppercase tracking-[0.16em] text-[var(--text-soft)]">{data.contact.name}</span>
      </div>

      <div className="support-callout px-4 py-3">
        <p className="text-sm leading-6 text-[var(--text-muted)]">
          This is the strongest material already on the page. We use it to decide what proof to keep, what to promote, and where the next believable edits should come from.
        </p>
      </div>

      {/* Career themes */}
      <div>
        <h4 className="mb-2 text-xs font-medium text-[var(--text-soft)] uppercase tracking-[0.16em]">Patterns we can lean on</h4>
        <div className="flex flex-wrap gap-1.5">
          {data.career_themes.map((theme, i) => (
            <span key={i} className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">{theme}</span>
          ))}
        </div>
      </div>

      {/* Quantified outcomes */}
      {data.quantified_outcomes.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-[var(--text-soft)] uppercase tracking-[0.16em]">Proof already on the page</h4>
          <div className="grid grid-cols-2 gap-2">
            {visibleOutcomes.map((o, i) => (
              <div key={i} className="support-callout px-3 py-2">
                <div className="text-sm font-medium text-[var(--link)]">{o.value}</div>
                <div className="text-xs text-[var(--text-soft)] line-clamp-2">{o.outcome}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Leadership scope + scale */}
      <div className="grid grid-cols-2 gap-4">
        <div className="support-callout px-3 py-3">
          <h4 className="mb-1 text-xs font-medium text-[var(--text-soft)] uppercase tracking-[0.16em]">Leadership scope</h4>
          <p className="text-sm text-[var(--text-muted)]">{data.leadership_scope}</p>
        </div>
        <div className="support-callout px-3 py-3">
          <h4 className="mb-1 text-xs font-medium text-[var(--text-soft)] uppercase tracking-[0.16em]">Operating scale</h4>
          <p className="text-sm text-[var(--text-muted)]">{data.operational_scale}</p>
        </div>
      </div>

      {(hiddenOutcomes.length > 0 || data.hidden_accomplishments.length > 0) && (
        isLive ? (
          <details>
            <summary className="text-xs font-medium text-[var(--text-soft)] cursor-pointer hover:text-[var(--text-muted)] uppercase tracking-wider select-none">
              More resume detail
            </summary>
            <div className="mt-3 space-y-4">
              {hiddenOutcomes.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-medium text-[var(--text-soft)] uppercase tracking-[0.16em]">Additional proof already on the page</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {hiddenOutcomes.map((o, i) => (
                      <div key={i} className="support-callout px-3 py-2">
                        <div className="text-sm font-medium text-[var(--link)]">{o.value}</div>
                        <div className="text-xs text-[var(--text-soft)] line-clamp-2">{o.outcome}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {data.hidden_accomplishments.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-medium text-[var(--text-soft)] uppercase tracking-[0.16em]">Strengths we can surface more clearly</h4>
                  <div className="support-callout border border-dashed border-[var(--badge-green-text)]/20 bg-[var(--badge-green-text)]/[0.02] p-3">
                    <ul className="space-y-1">
                      {data.hidden_accomplishments.map((a, i) => (
                        <li key={i} className="text-sm text-[var(--text-soft)] pl-3 relative before:absolute before:left-0 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-[var(--badge-green-text)]/50">{a}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </details>
        ) : (
          data.hidden_accomplishments.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-medium text-[var(--text-soft)] uppercase tracking-[0.16em]">Strengths we can surface more clearly</h4>
              <div className="support-callout border border-dashed border-[var(--badge-green-text)]/20 bg-[var(--badge-green-text)]/[0.02] p-3">
                <ul className="space-y-1">
                  {data.hidden_accomplishments.map((a, i) => (
                    <li key={i} className="text-sm text-[var(--text-soft)] pl-3 relative before:absolute before:left-0 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-[var(--badge-green-text)]/50">{a}</li>
                  ))}
                </ul>
              </div>
            </div>
          )
        )
      )}
    </div>
  );
}
