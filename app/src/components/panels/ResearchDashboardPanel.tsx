import { Building2, Target, UserCheck } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import type { ResearchDashboardData, BenchmarkSkill } from '@/types/panels';

interface ResearchDashboardPanelProps {
  data: ResearchDashboardData;
}

function importanceBadge(importance: BenchmarkSkill['importance']) {
  const styles = {
    critical: 'border-red-500/30 bg-red-500/10 text-red-400',
    important: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    nice_to_have: 'border-white/10 bg-white/[0.04] text-white/50',
  };
  const labels = { critical: 'Critical', important: 'Important', nice_to_have: 'Nice to have' };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles[importance]}`}>
      {labels[importance]}
    </span>
  );
}

export function ResearchDashboardPanel({ data }: ResearchDashboardPanelProps) {
  const { company, jd_requirements, benchmark } = data;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <span className="text-sm font-medium text-white/70">Research Dashboard</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Company Card */}
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4 text-blue-400/70" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
              Company
            </h3>
          </div>
          {company.company_name && (
            <p className="text-sm font-medium text-white/90 mb-2">{company.company_name}</p>
          )}
          {company.culture && (
            <p className="text-xs text-white/50 mb-2">Culture: {company.culture}</p>
          )}
          {company.values && company.values.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {company.values.map((v, i) => (
                <span
                  key={i}
                  className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-300"
                >
                  {v}
                </span>
              ))}
            </div>
          )}
          {company.language_style && (
            <p className="text-xs text-white/40">Voice: {company.language_style}</p>
          )}
        </GlassCard>

        {/* JD Requirements */}
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-blue-400/70" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
              JD Requirements
            </h3>
          </div>

          {jd_requirements.seniority_level && (
            <span className="mb-3 inline-block rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-300">
              {jd_requirements.seniority_level}
            </span>
          )}

          {jd_requirements.must_haves && jd_requirements.must_haves.length > 0 && (
            <div className="mb-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400/70 mb-1.5 block">
                Must-Haves
              </span>
              <div className="space-y-1">
                {jd_requirements.must_haves.map((req, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400/60" />
                    <span className="text-xs text-white/70">{req}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {jd_requirements.nice_to_haves && jd_requirements.nice_to_haves.length > 0 && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/70 mb-1.5 block">
                Nice-to-Haves
              </span>
              <div className="space-y-1">
                {jd_requirements.nice_to_haves.map((req, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/60" />
                    <span className="text-xs text-white/70">{req}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </GlassCard>

        {/* Benchmark Profile */}
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <UserCheck className="h-4 w-4 text-blue-400/70" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
              Benchmark Profile
            </h3>
          </div>

          {benchmark.ideal_candidate_summary && (
            <p className="text-sm text-white/80 leading-relaxed mb-3">
              {benchmark.ideal_candidate_summary}
            </p>
          )}

          {benchmark.required_skills.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {benchmark.required_skills.map((skill, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-white/70 truncate">{skill.requirement}</span>
                  {importanceBadge(skill.importance)}
                </div>
              ))}
            </div>
          )}

          {benchmark.language_keywords.length > 0 && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-1.5 block">
                Keywords to Echo
              </span>
              <div className="flex flex-wrap gap-1">
                {benchmark.language_keywords.map((kw, i) => (
                  <span
                    key={i}
                    className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/50"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
