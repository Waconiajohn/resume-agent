import { Briefcase } from 'lucide-react';
import { IMPORTANCE_LABELS } from './shared-badges';
import type { JobIntelligence } from '@/types/resume-v2';

export function JobIntelligenceCard({ data }: { data: JobIntelligence }) {
  return (
    <div className="room-shell animate-[card-enter_500ms_ease-out_forwards] opacity-0 space-y-5">
      <div className="flex items-center gap-2">
        <div className="rounded-lg border border-[#afc4ff]/18 bg-[#afc4ff]/10 p-2.5">
          <Briefcase className="h-4 w-4 text-[#afc4ff]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow-label">Role signal</p>
          <h3 className="mt-2 text-sm font-semibold text-white/90">What They&apos;re Looking For</h3>
        </div>
        <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/42">{data.company_name} · {data.role_title}</span>
      </div>

      {/* Core competencies */}
      <div>
        <h4 className="mb-2 text-xs font-medium text-white/60 uppercase tracking-[0.16em]">Key Requirements</h4>
        <div className="space-y-1.5">
          {data.core_competencies.map((c, i) => (
            <div key={i} className="support-callout flex items-start gap-3 px-3 py-2.5 text-sm">
              <ImportanceBadge importance={c.importance} />
              <span className="text-white/80 leading-6">{c.competency}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Business problems */}
      {data.business_problems.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-white/60 uppercase tracking-[0.16em]">Business Problems to Solve</h4>
          <ul className="space-y-1">
            {data.business_problems.map((p, i) => (
              <li key={i} className="text-sm text-white/70 pl-3 relative before:absolute before:left-0 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-white/30">{p}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Hidden signals */}
      {data.hidden_hiring_signals.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-white/60 uppercase tracking-[0.16em]">Hidden Hiring Signals</h4>
          <div className="support-callout border border-dashed border-[#f0d99f]/20 bg-[#f0d99f]/[0.02] p-3">
            <ul className="space-y-1">
              {data.hidden_hiring_signals.map((s, i) => (
                <li key={i} className="text-sm text-white/60 italic pl-3 relative before:absolute before:left-0 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-[#f0d99f]/50">{s}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function ImportanceBadge({ importance }: { importance: string }) {
  const styles = {
    must_have: 'bg-[#f0b8b8]/10 text-[#f0b8b8] border border-[#f0b8b8]/20 px-2.5 py-1 rounded-md text-[10px] tracking-[0.12em] border-l-2 border-l-[#f0b8b8]/40',
    important: 'bg-[#f0d99f]/10 text-[#f0d99f] border border-[#f0d99f]/20 px-2.5 py-1 rounded-md text-[10px] tracking-[0.12em] border-l-2 border-l-[#f0d99f]/40',
    nice_to_have: 'bg-white/10 text-white/50 border border-white/15 px-2.5 py-1 rounded-md text-[10px] tracking-[0.12em] border-l-2 border-l-white/20',
  }[importance] ?? 'bg-white/10 text-white/50 border border-white/15 px-2.5 py-1 rounded-md text-[10px] tracking-[0.12em] border-l-2 border-l-white/20';

  return (
    <span className={`inline-flex shrink-0 items-center font-semibold uppercase ${styles}`}>
      {IMPORTANCE_LABELS[importance] ?? importance}
    </span>
  );
}
