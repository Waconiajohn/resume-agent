import { useState } from 'react';
import { Building2, Target, UserCheck, Pencil, Check } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassSkeletonCard } from '../GlassSkeleton';
import { ProcessStepGuideCard } from '@/components/shared/ProcessStepGuideCard';
import { cleanText, stripMarkdown } from '@/lib/clean-text';
import type { ResearchDashboardData, BenchmarkSkill } from '@/types/panels';

interface ResearchDashboardPanelProps {
  data: ResearchDashboardData;
}

function importanceBadge(importance: BenchmarkSkill['importance']) {
  const styles = {
    critical: 'border-[var(--line-strong)] bg-[var(--accent-muted)] text-[var(--text-muted)]',
    important: 'border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-muted)]',
    nice_to_have: 'border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)]',
  };
  const labels = { critical: 'Critical', important: 'Important', nice_to_have: 'Nice to have' };
  return (
    <span className={`rounded-md border px-2.5 py-1 text-[12px] font-medium uppercase tracking-[0.12em] ${styles[importance]}`}>
      {labels[importance]}
    </span>
  );
}

function formatAssumptionLabel(key: string) {
  return key.replace(/_/g, ' ');
}

function renderAssumptionValue(value: unknown): string {
  if (typeof value === 'string') return value.trim() || 'Not available';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'Not available';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string | number => typeof item === 'string' || typeof item === 'number');
    return items.length > 0 ? items.slice(0, 4).join(', ') : 'Not available';
  }
  return 'Not available';
}

export function ResearchDashboardPanel({ data }: ResearchDashboardPanelProps) {
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [editedSummary, setEditedSummary] = useState('');

  const company = data.company ?? {};
  const jd_requirements = data.jd_requirements ?? {};
  const benchmark = data.benchmark ?? { required_skills: [], language_keywords: [] };
  const benchmarkSummary = benchmark.ideal_candidate_summary || benchmark.ideal_profile || '';
  const sectionExpectations = benchmark.section_expectations ?? {};
  const sectionExpectationEntries = Object.entries(sectionExpectations).filter(([, value]) => typeof value === 'string' && value.trim());
  const benchmarkAssumptions = benchmark.assumptions && typeof benchmark.assumptions === 'object' ? benchmark.assumptions : {};
  const assumptionEntries = Object.entries(benchmarkAssumptions)
    .filter(([_, value]) => value != null && renderAssumptionValue(value) !== 'Not available')
    .slice(0, 8);
  const researchStatusTone = data.loading_state === 'running'
    ? 'border-[var(--link)]/20 bg-[var(--badge-blue-bg)] text-[var(--link)]/90'
    : data.loading_state === 'background_running'
      ? 'border-[var(--badge-amber-text)]/20 bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)]/90'
      : 'border-[var(--badge-green-text)]/20 bg-[var(--badge-green-bg)] text-[var(--badge-green-text)]/90';

  return (
    <div data-panel-root className="flex h-full flex-col">
      <div className="border-b border-[var(--line-soft)] px-4 py-3">
        <span className="text-sm font-medium text-[var(--text-strong)]">Role Research</span>
      </div>

      <div data-panel-scroll className="flex-1 overflow-y-auto p-4 space-y-4">
        <ProcessStepGuideCard
          step="research"
          tone="review"
          userDoesOverride={
            data.loading_state === 'complete'
              ? 'Confirm benchmark assumptions before continuing. Edit any that are off.'
              : 'Review the JD requirements and benchmark assumptions as they arrive. Research is still running.'
          }
        />

        {(data.status_note || data.next_expected || data.loading_state) && (
          <GlassCard className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-md border px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.12em] ${researchStatusTone}`}>
                {data.loading_state === 'running'
                  ? 'Research running'
                  : data.loading_state === 'background_running'
                    ? 'Researching in the background'
                    : 'Research ready'}
              </span>
              {data.status_note && (
                <span className="text-[13px] text-[var(--text-muted)]">{data.status_note}</span>
              )}
            </div>
            {data.next_expected && (
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-soft)]">
                Next: {data.next_expected}
              </p>
            )}
          </GlassCard>
        )}

        {/* Company Card */}
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4 text-[var(--link)]" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
              Company
            </h3>
          </div>
          {!company.company_name && !company.culture && (
            <GlassSkeletonCard lines={3} />
          )}
          {company.company_name && (
            <p className="text-sm font-medium text-[var(--text-strong)] mb-2">{company.company_name}</p>
          )}
          {company.culture && (
            <p className="text-xs text-[var(--text-muted)] mb-2">Culture: {cleanText(company.culture)}</p>
          )}
          {company.values && company.values.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {company.values.map((v, i) => (
                <span
                  key={`company-value-${v}-${i}`}
                  className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1 text-[12px] uppercase tracking-[0.08em] text-[var(--text-muted)]"
                >
                  {v}
                </span>
              ))}
            </div>
          )}
          {company.language_style && (
            <p className="text-xs text-[var(--text-soft)]">Voice: {cleanText(company.language_style)}</p>
          )}
        </GlassCard>

        {/* JD Requirements */}
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-[var(--link)]" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
              Job Requirements
            </h3>
          </div>

          {!jd_requirements.must_haves?.length && !jd_requirements.nice_to_haves?.length && (
            <GlassSkeletonCard lines={4} />
          )}

          {jd_requirements.seniority_level && (
            <span className="mb-3 inline-block rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1 text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
              {jd_requirements.seniority_level}
            </span>
          )}

          {jd_requirements.must_haves && jd_requirements.must_haves.length > 0 && (
            <div className="mb-3">
              <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                Must-Haves
              </span>
              <div className="space-y-1">
                {jd_requirements.must_haves.map((req, i) => (
                  <div key={`must-have-${req.slice(0, 40)}-${i}`} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--line-strong)]" />
                    <span className="text-xs text-[var(--text-strong)]">{stripMarkdown(req)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {jd_requirements.nice_to_haves && jd_requirements.nice_to_haves.length > 0 && (
            <div>
              <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                Nice-to-Haves
              </span>
              <div className="space-y-1">
                {jd_requirements.nice_to_haves.map((req, i) => (
                  <div key={`nice-to-have-${req.slice(0, 40)}-${i}`} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--line-soft)]" />
                    <span className="text-xs text-[var(--text-strong)]">{stripMarkdown(req)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </GlassCard>

        {/* Career Vault */}
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <UserCheck className="h-4 w-4 text-[var(--link)]" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
              Career Vault
            </h3>
          </div>

          {!benchmark.required_skills?.length && !benchmarkSummary && (
            <GlassSkeletonCard lines={3} />
          )}

          {benchmarkSummary && (
            <div className="mb-3">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[12px] text-[var(--badge-amber-text)] bg-[var(--badge-amber-bg)] border border-[var(--badge-amber-text)]/25 rounded px-1.5 py-0.5">Estimated summary</span>
                <button
                  type="button"
                  onClick={() => {
                    if (!isEditingSummary) {
                      setEditedSummary(editedSummary || cleanText(benchmarkSummary));
                    }
                    setIsEditingSummary(!isEditingSummary);
                  }}
                  className="flex items-center gap-1 text-[12px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors"
                >
                  {isEditingSummary ? (
                    <>
                      <Check className="h-3 w-3" />
                      Done
                    </>
                  ) : (
                    <>
                      <Pencil className="h-3 w-3" />
                      Edit
                    </>
                  )}
                </button>
              </div>
              {isEditingSummary ? (
                <>
                  <textarea
                    value={editedSummary}
                    onChange={(e) => setEditedSummary(e.target.value)}
                    className="w-full rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-sm text-[var(--text-strong)] leading-relaxed resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--line-strong)]"
                    rows={4}
                  />
                  <p className="text-[12px] text-[var(--text-soft)] mt-1">This edit is for your reference — it does not change the pipeline analysis.</p>
                </>
              ) : (
                <p className="text-sm text-[var(--text-strong)] leading-relaxed">
                  {editedSummary || cleanText(benchmarkSummary)}
                </p>
              )}
            </div>
          )}

          {assumptionEntries.length > 0 && (
            <div className="mb-3">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)] mb-1.5 block">
                Benchmark Assumptions
              </span>
              <div className="space-y-1">
                {assumptionEntries.map(([key, value]) => {
                  const currentText = renderAssumptionValue(value);
                  return (
                    <div key={key} className="flex items-start justify-between gap-3 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-2">
                      <span className="text-[12px] uppercase tracking-[0.12em] text-[var(--text-soft)] shrink-0">
                        {formatAssumptionLabel(key)}
                      </span>
                      <span className="text-xs text-[var(--text-strong)] text-right">{cleanText(currentText)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {benchmark.required_skills?.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {benchmark.required_skills.map((skill, i) => (
                <div key={`skill-${skill.requirement.slice(0, 40)}-${i}`} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[var(--text-strong)] truncate">{stripMarkdown(skill.requirement)}</span>
                  {importanceBadge(skill.importance)}
                </div>
              ))}
            </div>
          )}

          {benchmark.language_keywords?.length > 0 && (
            <div>
              <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)] mb-1.5 block">
                Keywords to Echo
              </span>
              <div className="flex flex-wrap gap-1">
                {benchmark.language_keywords.map((kw, i) => (
                  <span
                    key={`kw-${kw}-${i}`}
                    className="rounded border border-[var(--line-soft)] bg-[var(--accent-muted)] px-1.5 py-0.5 text-[12px] text-[var(--text-muted)]"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {sectionExpectationEntries.length > 0 && (
            <div className="mt-3">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)] mb-1.5 block">
                Section Expectations
              </span>
              <div className="space-y-1.5">
                {sectionExpectationEntries.map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-2">
                    <div className="text-[12px] uppercase tracking-[0.12em] text-[var(--text-soft)]">{key.replace(/_/g, ' ')}</div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">{cleanText(String(value))}</div>
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
