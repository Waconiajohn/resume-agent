import { Briefcase } from 'lucide-react';
import type { JobIntelligence } from '@/types/resume-v2';

export function JobIntelligenceCard({ data }: { data: JobIntelligence }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Briefcase className="h-4 w-4 text-[#afc4ff]" />
        <h3 className="text-sm font-semibold text-white/90">What They're Looking For</h3>
        <span className="ml-auto text-xs text-white/40">{data.company_name} &middot; {data.role_title}</span>
      </div>

      {/* Core competencies */}
      <div>
        <h4 className="mb-2 text-xs font-medium text-white/60 uppercase tracking-wider">Key Requirements</h4>
        <div className="space-y-1.5">
          {data.core_competencies.map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <ImportanceBadge importance={c.importance} />
              <span className="text-white/80">{c.competency}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Business problems */}
      {data.business_problems.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-white/60 uppercase tracking-wider">Business Problems to Solve</h4>
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
          <h4 className="mb-2 text-xs font-medium text-white/60 uppercase tracking-wider">Hidden Hiring Signals</h4>
          <ul className="space-y-1">
            {data.hidden_hiring_signals.map((s, i) => (
              <li key={i} className="text-sm text-white/60 italic pl-3 relative before:absolute before:left-0 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-[#f0d99f]/50">{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ImportanceBadge({ importance }: { importance: string }) {
  const styles = {
    must_have: 'bg-[#f0b8b8]/15 text-[#f0b8b8]/80 border-[#f0b8b8]/20',
    important: 'bg-[#f0d99f]/15 text-[#f0d99f]/80 border-[#f0d99f]/20',
    nice_to_have: 'bg-white/[0.06] text-white/50 border-white/10',
  }[importance] ?? 'bg-white/[0.06] text-white/50 border-white/10';

  const label = {
    must_have: 'Must',
    important: 'Imp',
    nice_to_have: 'Nice',
  }[importance] ?? importance;

  return (
    <span className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium border ${styles}`}>
      {label}
    </span>
  );
}
