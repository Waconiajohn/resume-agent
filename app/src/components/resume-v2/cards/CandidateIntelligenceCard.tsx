import { User } from 'lucide-react';
import type { CandidateIntelligence } from '@/types/resume-v2';

export function CandidateIntelligenceCard({ data }: { data: CandidateIntelligence }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <User className="h-4 w-4 text-[#b5dec2]" />
        <h3 className="text-sm font-semibold text-white/90">What You Bring</h3>
        <span className="ml-auto text-xs text-white/40">{data.contact.name}</span>
      </div>

      {/* Career themes */}
      <div>
        <h4 className="mb-2 text-xs font-medium text-white/60 uppercase tracking-wider">Career Themes</h4>
        <div className="flex flex-wrap gap-1.5">
          {data.career_themes.map((theme, i) => (
            <span key={i} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/70">{theme}</span>
          ))}
        </div>
      </div>

      {/* Quantified outcomes */}
      {data.quantified_outcomes.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-white/60 uppercase tracking-wider">Quantified Impact</h4>
          <div className="grid grid-cols-2 gap-2">
            {data.quantified_outcomes.slice(0, 6).map((o, i) => (
              <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <div className="text-sm font-medium text-[#afc4ff]">{o.value}</div>
                <div className="text-xs text-white/50 line-clamp-2">{o.outcome}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Leadership scope + scale */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="mb-1 text-xs font-medium text-white/60 uppercase tracking-wider">Leadership</h4>
          <p className="text-sm text-white/70">{data.leadership_scope}</p>
        </div>
        <div>
          <h4 className="mb-1 text-xs font-medium text-white/60 uppercase tracking-wider">Scale</h4>
          <p className="text-sm text-white/70">{data.operational_scale}</p>
        </div>
      </div>

      {/* Hidden accomplishments */}
      {data.hidden_accomplishments.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-white/60 uppercase tracking-wider">Hidden Strengths We Found</h4>
          <ul className="space-y-1">
            {data.hidden_accomplishments.map((a, i) => (
              <li key={i} className="text-sm text-white/60 pl-3 relative before:absolute before:left-0 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-[#b5dec2]/50">{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
