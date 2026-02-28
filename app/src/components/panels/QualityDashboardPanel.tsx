import { useState } from 'react';
import {
  ShieldCheck,
  ScanSearch,
  AlertTriangle,
  Flag,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Bot,
  GitBranch,
} from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { ProcessStepGuideCard } from '@/components/shared/ProcessStepGuideCard';
import { ScoreRing } from '@/components/shared/ScoreRing';
import { cleanText } from '@/lib/clean-text';
import type { QualityDashboardData } from '@/types/panels';

interface QualityDashboardPanelProps {
  data: QualityDashboardData;
}

function scoreColor(score: number): string {
  if (score >= 70) return 'text-[#b5dec2]';
  if (score >= 50) return 'text-[#dfc797]';
  return 'text-[#e0abab]';
}

interface CollapsibleSectionProps {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleSection({ icon, title, count, children, defaultOpen = false }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <GlassCard className="p-4">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        {icon}
        <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60 flex-1">
          {title}
        </h3>
        <span className="text-[10px] text-white/50 mr-2">
          {count} {count === 1 ? 'item' : 'items'}
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-white/40 shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-white/40 shrink-0" />
        )}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </GlassCard>
  );
}

export function QualityDashboardPanel({ data }: QualityDashboardPanelProps) {
  const {
    hiring_manager,
    ats_score,
    keyword_coverage,
    authenticity_score,
    evidence_integrity,
    blueprint_compliance,
    narrative_coherence,
    risk_flags,
    age_bias_risks,
    overall_assessment,
    ats_findings,
    humanize_issues,
    coherence_issues,
  } = data;

  const highRiskCount = Array.isArray(risk_flags)
    ? risk_flags.filter((rf) => rf?.severity === 'high').length
    : 0;
  const hasAgeRisks = Array.isArray(age_bias_risks) && age_bias_risks.length > 0;
  const hasActionableRisks = highRiskCount > 0 || hasAgeRisks;

  const atsFindingsCount = Array.isArray(ats_findings) ? ats_findings.length : 0;
  const humanizeIssuesCount = Array.isArray(humanize_issues) ? humanize_issues.length : 0;
  const coherenceIssuesCount = Array.isArray(coherence_issues) ? coherence_issues.length : 0;

  // Separate primary rings (always-present checks) from secondary rings (optional checks)
  const primaryRings = [
    hiring_manager != null
      ? {
          score: hiring_manager.checklist_total ?? 0,
          max: hiring_manager.checklist_max ?? 50,
          label: 'Hiring Mgr',
          color: hiring_manager.pass ? 'text-[#b5dec2]' : 'text-[#e0abab]',
        }
      : null,
    ats_score != null
      ? { score: ats_score, max: 100, label: 'ATS', color: scoreColor(ats_score) }
      : null,
    authenticity_score != null
      ? {
          score: authenticity_score,
          max: 100,
          label: 'Authenticity',
          color: scoreColor(authenticity_score),
        }
      : null,
  ].filter(Boolean) as Array<{ score: number; max: number; label: string; color: string }>;

  const secondaryRings = [
    evidence_integrity != null
      ? {
          score: evidence_integrity,
          max: 100,
          label: 'Evidence',
          color: scoreColor(evidence_integrity),
        }
      : null,
    blueprint_compliance != null
      ? {
          score: blueprint_compliance,
          max: 100,
          label: 'Blueprint',
          color: scoreColor(blueprint_compliance),
        }
      : null,
    narrative_coherence != null
      ? {
          score: narrative_coherence,
          max: 100,
          label: 'Coherence',
          color: scoreColor(narrative_coherence),
        }
      : null,
  ].filter(Boolean) as Array<{ score: number; max: number; label: string; color: string }>;

  const allRings = [...primaryRings, ...secondaryRings];

  return (
    <div data-panel-root className="flex h-full flex-col">
      <div className="border-b border-white/[0.12] px-4 py-3">
        <span className="text-sm font-medium text-white/85">Quality Dashboard</span>
      </div>

      <div data-panel-scroll className="flex-1 overflow-y-auto p-4 space-y-4">
        <ProcessStepGuideCard
          step="quality_review"
          tone="review"
          userDoesOverride="Use this as the final quality gate. Review any high-risk flags before exporting."
          nextOverride="If quality looks good, export and optionally save this as a reusable base resume."
        />

        <GlassCard className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-sky-300/20 bg-sky-400/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-100/90">
              What To Do In This Panel
            </span>
            <span className="text-[11px] text-white/62">
              Check the final scores, then review any high-risk flags before exporting.
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-white/55">
              Info only: scores and assessment summaries
            </span>
            <span className={`rounded-full border px-2 py-0.5 ${
              hasActionableRisks
                ? 'border-amber-300/18 bg-amber-400/[0.06] text-amber-100/85'
                : 'border-emerald-300/18 bg-emerald-400/[0.06] text-emerald-100/85'
            }`}>
              {hasActionableRisks
                ? 'Action required: review risk sections before export'
                : 'Next step: move to export'}
            </span>
          </div>
        </GlassCard>

        {/* Score rings — flex-wrap so 3+3 or any count flows naturally */}
        {allRings.length > 0 && (
          <GlassCard className="p-4">
            <div className="flex flex-wrap items-center justify-around gap-y-4">
              {allRings.map((ring) => (
                <ScoreRing
                  key={ring.label}
                  score={ring.score}
                  max={ring.max}
                  label={ring.label}
                  color={ring.color}
                />
              ))}
            </div>

            {keyword_coverage != null && (
              <div className="mt-3 flex items-center justify-between text-xs border-t border-white/[0.08] pt-3">
                <span className="text-white/60">Keyword Coverage</span>
                <span className="text-white/85">{keyword_coverage}%</span>
              </div>
            )}
          </GlassCard>
        )}

        {/* Hiring Manager Checklist — grouped by strength */}
        {hiring_manager?.checklist_scores && Object.keys(hiring_manager.checklist_scores).length > 0 && (() => {
          const entries = Object.entries(hiring_manager.checklist_scores);
          const needsWork = entries.filter(([, s]) => s <= 3);
          const strong = entries.filter(([, s]) => s >= 4);
          return (
            <GlassCard className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="h-3.5 w-3.5 text-[#afc4ff]" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">
                  Checklist Breakdown
                </h3>
                <span className="ml-auto text-[10px] text-white/50">
                  {hiring_manager.checklist_total ?? 0} / {hiring_manager.checklist_max ?? 50}
                </span>
              </div>
              {needsWork.length > 0 && (
                <div className="mb-3">
                  <span className="block mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/58">
                    Needs Improvement
                  </span>
                  <div className="space-y-1.5">
                    {needsWork.map(([key, score]) => (
                      <div key={key} className="flex items-center justify-between rounded border border-white/[0.1] bg-white/[0.03] px-2 py-1">
                        <span className="text-xs text-white/70 capitalize">{key.replace(/_/g, ' ')}</span>
                        <span className="text-xs font-medium text-[#e0abab]">{score}/5</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {strong.length > 0 && (
                <div>
                  <span className="block mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/58">
                    Strong
                  </span>
                  <div className="space-y-1.5">
                    {strong.map(([key, score]) => (
                      <div key={key} className="flex items-center justify-between rounded border border-white/[0.1] bg-white/[0.03] px-2 py-1">
                        <span className="text-xs text-white/70 capitalize">{key.replace(/_/g, ' ')}</span>
                        <span className="text-xs font-medium text-[#b5dec2]">{score}/5</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </GlassCard>
          );
        })()}

        {/* Overall Assessment */}
        {overall_assessment && (
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/48">
                Info only
              </span>
              <ScanSearch className="h-3.5 w-3.5 text-[#afc4ff]" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">
                Assessment
              </h3>
            </div>
            <p className="text-xs text-white/85 leading-relaxed">
              {typeof overall_assessment === 'string'
                ? cleanText(overall_assessment)
                : JSON.stringify(overall_assessment)}
            </p>
          </GlassCard>
        )}

        {/* ATS Findings — collapsible */}
        {atsFindingsCount > 0 && (
          <CollapsibleSection
            icon={<ClipboardList className="h-3.5 w-3.5 text-[#afc4ff]" />}
            title="ATS Findings"
            count={atsFindingsCount}
          >
            <div className="space-y-1.5">
              {ats_findings!.map((finding, i) => {
                const priorityStyles: Record<string, string> = {
                  high: 'border-red-500/25 bg-red-500/10 text-red-300/90',
                  medium: 'border-amber-500/25 bg-amber-500/10 text-amber-300/90',
                  low: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300/90',
                };
                const badgeStyle =
                  priorityStyles[finding.priority?.toLowerCase()] ??
                  'border-white/[0.1] bg-white/[0.04] text-white/60';
                return (
                  <div
                    key={`ats-finding-${i}`}
                    className="flex items-start gap-2 rounded border border-white/[0.08] bg-white/[0.02] px-2.5 py-2"
                  >
                    <span
                      className={`mt-0.5 shrink-0 rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider ${badgeStyle}`}
                    >
                      {finding.priority ?? 'low'}
                    </span>
                    <span className="text-xs text-white/75 leading-relaxed">
                      {cleanText(finding.issue)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>
        )}

        {/* Humanize Issues — collapsible */}
        {humanizeIssuesCount > 0 && (
          <CollapsibleSection
            icon={<Bot className="h-3.5 w-3.5 text-[#afc4ff]" />}
            title="AI Pattern Issues"
            count={humanizeIssuesCount}
          >
            <div className="space-y-1.5">
              {humanize_issues!.map((issue, i) => (
                <div key={`humanize-${i}`} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/38" />
                  <span className="text-xs text-white/70 leading-relaxed">
                    {cleanText(issue)}
                  </span>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Coherence Issues — collapsible */}
        {coherenceIssuesCount > 0 && (
          <CollapsibleSection
            icon={<GitBranch className="h-3.5 w-3.5 text-[#afc4ff]" />}
            title="Narrative Coherence Issues"
            count={coherenceIssuesCount}
          >
            <div className="space-y-1.5">
              {coherence_issues!.map((issue, i) => (
                <div key={`coherence-${i}`} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/38" />
                  <span className="text-xs text-white/70 leading-relaxed">
                    {cleanText(issue)}
                  </span>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Risk Flags */}
        {risk_flags && risk_flags.length > 0 && (
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${
                highRiskCount > 0
                  ? 'border-amber-300/20 bg-amber-400/[0.08] text-amber-100/85'
                  : 'border-white/[0.08] bg-white/[0.02] text-white/48'
              }`}>
                {highRiskCount > 0 ? 'Action required' : 'Review'}
              </span>
              <Flag className="h-3.5 w-3.5 text-white/62" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">
                Risk Flags
              </h3>
            </div>
            <div className="space-y-2">
              {risk_flags.map((rf, i) => {
                const severityColor = ({
                  low: 'border-emerald-500/20 bg-emerald-500/10',
                  medium: 'border-amber-500/20 bg-amber-500/10',
                  high: 'border-red-500/20 bg-red-500/10',
                } as Record<string, string>)[rf.severity] ?? 'border-white/[0.1] bg-white/[0.04]';
                return (
                  <div key={`risk-flag-${rf.flag.slice(0, 30)}-${i}`} className={`rounded-lg border p-2.5 ${severityColor}`}>
                    <p className="text-xs text-white/85">{cleanText(rf.flag)}</p>
                    <p className="mt-1 text-[10px] text-white/60">{cleanText(rf.recommendation)}</p>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}

        {/* Age Bias Risks */}
        {age_bias_risks && age_bias_risks.length > 0 && (
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="rounded-full border border-amber-300/20 bg-amber-400/[0.08] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-amber-100/85">
                Action required
              </span>
              <AlertTriangle className="h-3.5 w-3.5 text-white/62" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">
                Age-Bias Risks
              </h3>
            </div>
            <div className="space-y-1.5">
              {age_bias_risks.map((risk, i) => (
                <div key={`age-bias-${risk.slice(0, 30)}-${i}`} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/38" />
                  <span className="text-xs text-white/70">{cleanText(risk)}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

      </div>
    </div>
  );
}
