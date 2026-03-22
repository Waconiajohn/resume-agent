import { User } from 'lucide-react';
import type { CandidateIntelligence } from '@/types/resume-v2';

export function CandidateIntelligenceCard({ data }: { data: CandidateIntelligence }) {
  return (
    <div className="room-shell animate-[card-enter_500ms_ease-out_forwards] opacity-0 space-y-5">
      <div className="flex items-center gap-2">
        <div className="rounded-lg border border-[#b5dec2]/18 bg-[#b5dec2]/10 p-2.5">
          <User className="h-4 w-4 text-[#b5dec2]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow-label">Candidate signal</p>
          <h3 className="mt-2 text-sm font-semibold text-white/90">What You Bring</h3>
        </div>
        <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/42">{data.contact.name}</span>
      </div>

      {/* Career themes */}
      <div>
        <h4 className="mb-2 text-xs font-medium text-white/60 uppercase tracking-[0.16em]">Career Themes</h4>
        <div className="flex flex-wrap gap-1.5">
          {data.career_themes.map((theme, i) => (
            <span key={i} className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-white/66">{theme}</span>
          ))}
        </div>
      </div>

      {/* Quantified outcomes */}
      {data.quantified_outcomes.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-white/60 uppercase tracking-[0.16em]">Quantified Impact</h4>
          <div className="grid grid-cols-2 gap-2">
            {data.quantified_outcomes.slice(0, 6).map((o, i) => (
              <div key={i} className="support-callout px-3 py-2">
                <div className="text-sm font-medium text-[#afc4ff]">{o.value}</div>
                <div className="text-xs text-white/50 line-clamp-2">{o.outcome}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Leadership scope + scale */}
      <div className="grid grid-cols-2 gap-4">
        <div className="support-callout px-3 py-3">
          <h4 className="mb-1 text-xs font-medium text-white/60 uppercase tracking-[0.16em]">Leadership</h4>
          <p className="text-sm text-white/70">{data.leadership_scope}</p>
        </div>
        <div className="support-callout px-3 py-3">
          <h4 className="mb-1 text-xs font-medium text-white/60 uppercase tracking-[0.16em]">Scale</h4>
          <p className="text-sm text-white/70">{data.operational_scale}</p>
        </div>
      </div>

      {/* Hidden accomplishments */}
      {data.hidden_accomplishments.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-white/60 uppercase tracking-[0.16em]">Hidden Strengths We Found</h4>
          <div className="support-callout border border-dashed border-[#b5dec2]/20 bg-[#b5dec2]/[0.02] p-3">
            <ul className="space-y-1">
              {data.hidden_accomplishments.map((a, i) => (
                <li key={i} className="text-sm text-white/60 pl-3 relative before:absolute before:left-0 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-[#b5dec2]/50">{a}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
