import { Briefcase } from 'lucide-react';
import { IMPORTANCE_LABELS } from './shared-badges';
import type { JobIntelligence } from '@/types/resume-v2';

export function JobIntelligenceCard({
  data,
  isLive = false,
}: {
  data: JobIntelligence;
  isLive?: boolean;
}) {
  return (
    <div className="room-shell animate-[card-enter_500ms_ease-out_forwards] opacity-0 space-y-5">
      <div className="flex items-center gap-2">
        <div className="rounded-lg border border-[var(--link)]/18 bg-[var(--link)]/10 p-2.5">
          <Briefcase className="h-4 w-4 text-[var(--link)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow-label">Role requirements</p>
          <h3 className="mt-2 text-sm font-semibold text-[var(--text-strong)]">What this role needs from the resume</h3>
        </div>
        <span className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1 text-[12px] uppercase tracking-[0.16em] text-[var(--text-soft)]">{data.company_name} · {data.role_title}</span>
      </div>

      <div className="support-callout px-4 py-3">
        <p className="text-sm leading-6 text-[var(--text-muted)]">
          These are the direct signals the resume needs to cover. This is the clearest view of what the posting is asking for before we compare it against your current proof.
        </p>
      </div>

      {/* Core competencies */}
      <div>
        <h4 className="mb-2 text-xs font-medium text-[var(--text-soft)] uppercase tracking-[0.16em]">Direct requirements from the posting</h4>
        <div className="space-y-1.5">
          {data.core_competencies.map((c, i) => (
            <div key={i} className="support-callout flex items-start gap-3 px-3 py-2.5 text-sm">
              <ImportanceBadge importance={c.importance} />
              <span className="text-[var(--text-strong)] leading-6">{c.competency}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Business problems */}
      {(data.business_problems.length > 0 || data.hidden_hiring_signals.length > 0) && (
        isLive ? (
          <details>
            <summary className="text-xs font-medium text-[var(--text-soft)] cursor-pointer hover:text-[var(--text-muted)] uppercase tracking-wider select-none">
              More role context
            </summary>
            <div className="mt-3 space-y-4">
              {data.business_problems.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-medium text-[var(--text-soft)] uppercase tracking-[0.16em]">Problems this hire is expected to solve</h4>
                  <ul className="space-y-1">
                    {data.business_problems.map((p, i) => (
                      <li key={i} className="text-sm text-[var(--text-muted)] pl-3 relative before:absolute before:left-0 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-[var(--line-strong)]">{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {data.hidden_hiring_signals.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-medium text-[var(--text-soft)] uppercase tracking-[0.16em]">Signals the posting implies but does not state clearly</h4>
                  <div className="support-callout border border-dashed border-[var(--badge-amber-text)]/20 bg-[var(--badge-amber-text)]/[0.02] p-3">
                    <ul className="space-y-1">
                      {data.hidden_hiring_signals.map((s, i) => (
                        <li key={i} className="text-sm text-[var(--text-soft)] italic pl-3 relative before:absolute before:left-0 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-[var(--badge-amber-text)]/50">{s}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </details>
        ) : (
          <>
            {data.business_problems.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-medium text-[var(--text-soft)] uppercase tracking-[0.16em]">Problems this hire is expected to solve</h4>
                <ul className="space-y-1">
                  {data.business_problems.map((p, i) => (
                    <li key={i} className="text-sm text-[var(--text-muted)] pl-3 relative before:absolute before:left-0 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-[var(--line-strong)]">{p}</li>
                  ))}
                </ul>
              </div>
            )}
            {data.hidden_hiring_signals.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-medium text-[var(--text-soft)] uppercase tracking-[0.16em]">Signals the posting implies but does not state clearly</h4>
                <div className="support-callout border border-dashed border-[var(--badge-amber-text)]/20 bg-[var(--badge-amber-text)]/[0.02] p-3">
                  <ul className="space-y-1">
                    {data.hidden_hiring_signals.map((s, i) => (
                      <li key={i} className="text-sm text-[var(--text-soft)] italic pl-3 relative before:absolute before:left-0 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-[var(--badge-amber-text)]/50">{s}</li>
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

function ImportanceBadge({ importance }: { importance: string }) {
  const styles = {
    must_have: 'bg-[var(--badge-red-text)]/10 text-[var(--badge-red-text)] border border-[var(--badge-red-text)]/20 px-2.5 py-1 rounded-md text-[12px] tracking-[0.12em] border-l-2 border-l-[var(--badge-red-text)]/40',
    important: 'bg-[var(--badge-amber-text)]/10 text-[var(--badge-amber-text)] border border-[var(--badge-amber-text)]/20 px-2.5 py-1 rounded-md text-[12px] tracking-[0.12em] border-l-2 border-l-[var(--badge-amber-text)]/40',
    nice_to_have: 'bg-[var(--surface-1)] text-[var(--text-soft)] border border-[var(--line-soft)] px-2.5 py-1 rounded-md text-[12px] tracking-[0.12em] border-l-2 border-l-[var(--line-strong)]',
  }[importance] ?? 'bg-[var(--surface-1)] text-[var(--text-soft)] border border-[var(--line-soft)] px-2.5 py-1 rounded-md text-[12px] tracking-[0.12em] border-l-2 border-l-[var(--line-strong)]';

  return (
    <span className={`inline-flex shrink-0 items-center font-semibold uppercase ${styles}`}>
      {IMPORTANCE_LABELS[importance] ?? importance}
    </span>
  );
}
