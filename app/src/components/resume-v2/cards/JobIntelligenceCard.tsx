import { Briefcase } from 'lucide-react';
import type { JobIntelligence } from '@/types/resume-v2';

export function JobIntelligenceCard({ data }: { data: JobIntelligence }) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 space-y-4">
      <div className="flex items-center gap-2">
        <div className="bg-[#afc4ff]/10 p-2 rounded-full">
          <Briefcase className="h-4 w-4 text-[#afc4ff]" />
        </div>
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
          <div className="border border-dashed border-[#f0d99f]/20 bg-[#f0d99f]/[0.02] rounded-lg p-3">
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
    must_have: 'bg-[#f0b8b8]/15 text-[#f0b8b8] border border-[#f0b8b8]/20 px-2 py-0.5 rounded-full text-[10px]',
    important: 'bg-[#f0d99f]/15 text-[#f0d99f] border border-[#f0d99f]/20 px-2 py-0.5 rounded-full text-[10px]',
    nice_to_have: 'bg-white/10 text-white/50 border border-white/15 px-2 py-0.5 rounded-full text-[10px]',
  }[importance] ?? 'bg-white/10 text-white/50 border border-white/15 px-2 py-0.5 rounded-full text-[10px]';

  const label = {
    must_have: 'Must',
    important: 'Imp',
    nice_to_have: 'Nice',
  }[importance] ?? importance;

  return (
    <span className={`inline-flex shrink-0 items-center font-medium ${styles}`}>
      {label}
    </span>
  );
}
