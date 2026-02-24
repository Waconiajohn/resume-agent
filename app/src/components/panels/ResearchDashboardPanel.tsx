import { Building2, Target, UserCheck } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassSkeletonCard } from '../GlassSkeleton';
import { cleanText, stripMarkdown } from '@/lib/clean-text';
import type { ResearchDashboardData, BenchmarkSkill } from '@/types/panels';

interface ResearchDashboardPanelProps {
  data: ResearchDashboardData;
}

function importanceBadge(importance: BenchmarkSkill['importance']) {
  const styles = {
    critical: 'border-white/[0.14] bg-white/[0.05] text-white/82',
    important: 'border-white/[0.12] bg-white/[0.04] text-white/76',
    nice_to_have: 'border-white/[0.1] bg-white/[0.03] text-white/68',
  };
  const labels = { critical: 'Critical', important: 'Important', nice_to_have: 'Nice to have' };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles[importance]}`}>
      {labels[importance]}
    </span>
  );
}

export function ResearchDashboardPanel({ data }: ResearchDashboardPanelProps) {
  const company = data.company ?? {};
  const jd_requirements = data.jd_requirements ?? {};
  const benchmark = data.benchmark ?? { required_skills: [], language_keywords: [] };
  const benchmarkSummary = benchmark.ideal_candidate_summary || benchmark.ideal_profile || '';
  const sectionExpectations = benchmark.section_expectations ?? {};
  const sectionExpectationEntries = Object.entries(sectionExpectations).filter(([, value]) => typeof value === 'string' && value.trim());

  return (
    <div data-panel-root className="flex h-full flex-col">
      <div className="border-b border-white/[0.12] px-4 py-3">
        <span className="text-sm font-medium text-white/85">Research Dashboard</span>
      </div>

      <div data-panel-scroll className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Company Card */}
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4 text-[#afc4ff]" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">
              Company
            </h3>
          </div>
          {!company.company_name && !company.culture && (
            <GlassSkeletonCard lines={3} />
          )}
          {company.company_name && (
            <p className="text-sm font-medium text-white mb-2">{company.company_name}</p>
          )}
          {company.culture && (
            <p className="text-xs text-white/70 mb-2">Culture: {cleanText(company.culture)}</p>
          )}
          {company.values && company.values.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {company.values.map((v, i) => (
                <span
                  key={`company-value-${v}-${i}`}
                  className="rounded-full border border-white/[0.12] bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/75"
                >
                  {v}
                </span>
              ))}
            </div>
          )}
          {company.language_style && (
            <p className="text-xs text-white/60">Voice: {cleanText(company.language_style)}</p>
          )}
        </GlassCard>

        {/* JD Requirements */}
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-[#afc4ff]" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">
              JD Requirements
            </h3>
          </div>

          {!jd_requirements.must_haves?.length && !jd_requirements.nice_to_haves?.length && (
            <GlassSkeletonCard lines={4} />
          )}

          {jd_requirements.seniority_level && (
            <span className="mb-3 inline-block rounded-full border border-white/[0.12] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/76">
              {jd_requirements.seniority_level}
            </span>
          )}

          {jd_requirements.must_haves && jd_requirements.must_haves.length > 0 && (
            <div className="mb-3">
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-white/58">
                Must-Haves
              </span>
              <div className="space-y-1">
                {jd_requirements.must_haves.map((req, i) => (
                  <div key={`must-have-${req.slice(0, 40)}-${i}`} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/42" />
                    <span className="text-xs text-white/85">{stripMarkdown(req)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {jd_requirements.nice_to_haves && jd_requirements.nice_to_haves.length > 0 && (
            <div>
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-white/58">
                Nice-to-Haves
              </span>
              <div className="space-y-1">
                {jd_requirements.nice_to_haves.map((req, i) => (
                  <div key={`nice-to-have-${req.slice(0, 40)}-${i}`} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/32" />
                    <span className="text-xs text-white/85">{stripMarkdown(req)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </GlassCard>

        {/* Benchmark Profile */}
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <UserCheck className="h-4 w-4 text-[#afc4ff]" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">
              Benchmark Profile
            </h3>
          </div>

          {!benchmark.required_skills?.length && !benchmarkSummary && (
            <GlassSkeletonCard lines={3} />
          )}

          {benchmarkSummary && (
            <p className="text-sm text-white/90 leading-relaxed mb-3">
              {cleanText(benchmarkSummary)}
            </p>
          )}

          {benchmark.required_skills?.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {benchmark.required_skills.map((skill, i) => (
                <div key={`skill-${skill.requirement.slice(0, 40)}-${i}`} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-white/85 truncate">{stripMarkdown(skill.requirement)}</span>
                  {importanceBadge(skill.importance)}
                </div>
              ))}
            </div>
          )}

          {benchmark.language_keywords?.length > 0 && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50 mb-1.5 block">
                Keywords to Echo
              </span>
              <div className="flex flex-wrap gap-1">
                {benchmark.language_keywords.map((kw, i) => (
                  <span
                    key={`kw-${kw}-${i}`}
                    className="rounded border border-white/10 bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-white/70"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {sectionExpectationEntries.length > 0 && (
            <div className="mt-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50 mb-1.5 block">
                Section Expectations
              </span>
              <div className="space-y-1.5">
                {sectionExpectationEntries.map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-2">
                    <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">{key.replace(/_/g, ' ')}</div>
                    <div className="mt-1 text-xs text-white/80">{cleanText(String(value))}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
