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
import { cn } from '@/lib/utils';
import type { QualityDashboardData } from '@/types/panels';

interface QualityDashboardPanelProps {
  data: QualityDashboardData;
}

function scoreColor(score: number): string {
  if (score >= 70) return 'text-[#b5dec2]';
  if (score >= 50) return 'text-[#f0d99f]';
  return 'text-[#f0b8b8]';
}

function secondaryScoreColor(score: number): string {
  if (score >= 80) return 'text-[#b5dec2]';
  if (score >= 60) return 'text-[#f0d99f]';
  return 'text-[#f0b8b8]';
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
        aria-label={`${title}: ${count} ${count === 1 ? 'item' : 'items'}`}
      >
        {icon}
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)] flex-1" id={`section-${title.replace(/\s+/g, '-').toLowerCase()}`}>
          {title}
        </h3>
        <span className="text-[12px] text-[var(--text-soft)] mr-2">
          {count} {count === 1 ? 'item' : 'items'}
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-[var(--text-soft)] shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-[var(--text-soft)] shrink-0" />
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

  const primaryRings = [
    hiring_manager != null
      ? {
          score: hiring_manager.checklist_total ?? 0,
          max: hiring_manager.checklist_max ?? 50,
          label: 'Hiring Manager',
          color: hiring_manager.pass ? 'text-[#b5dec2]' : 'text-[#f0b8b8]',
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

  const secondaryMetrics = [
    evidence_integrity != null
      ? { label: 'Proof Strength', score: evidence_integrity }
      : null,
    blueprint_compliance != null
      ? { label: 'Plan Alignment', score: blueprint_compliance }
      : null,
    narrative_coherence != null
      ? { label: 'Story Consistency', score: narrative_coherence }
      : null,
  ].filter(Boolean) as Array<{ label: string; score: number }>;

  return (
    <div data-panel-root className="flex h-full flex-col">
      <div className="border-b border-[var(--line-soft)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--text-strong)]">Quality Scores</span>
          <span className="rounded-md border border-amber-400/20 bg-amber-400/[0.08] px-2 py-1 text-[12px] uppercase tracking-[0.12em] text-amber-400/60">Estimated</span>
        </div>
      </div>
      <span className="sr-only" aria-live="polite">
        {primaryRings.length > 0
          ? primaryRings.map((r) => `${r.label}: ${r.score} out of ${r.max}`).join(', ')
          : ''}
      </span>

      <div data-panel-scroll className="flex-1 overflow-y-auto p-4 space-y-4">
        <ProcessStepGuideCard
          step="quality_review"
          tone="review"
          userDoesOverride={hasActionableRisks ? 'Review the items flagged below before downloading.' : 'Scores look good — your resume is ready to download.'}
          nextOverride={hasActionableRisks ? 'Review the flagged items, then download your resume.' : 'Download your resume, or save it for future applications.'}
        />

        {/* Primary score rings — 3 rings: Hiring Mgr, ATS, Authenticity */}
        {(primaryRings.length > 0 || secondaryMetrics.length > 0 || keyword_coverage != null) && (
          <GlassCard className="p-4">
            {primaryRings.length > 0 && (
              <div className="flex items-center justify-around gap-y-4">
                {primaryRings.map((ring) => (
                  <div key={ring.label} title="Estimated score based on pattern analysis — not a guarantee of outcome">
                    <ScoreRing
                      score={ring.score}
                      max={ring.max}
                      label={ring.label}
                      color={ring.color}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Secondary metrics as text rows */}
            {secondaryMetrics.length > 0 && (
              <div className={cn('space-y-2', primaryRings.length > 0 && 'mt-4 border-t border-[var(--line-soft)] pt-4')}>
                {secondaryMetrics.map((metric) => (
                  <div key={metric.label} className="flex items-center justify-between text-xs" title="Estimated score based on pattern analysis — not a guarantee of outcome">
                    <span className="text-[var(--text-soft)]">{metric.label}</span>
                    <span className={cn('font-medium', secondaryScoreColor(metric.score))}>
                      {metric.score}%
                    </span>
                  </div>
                ))}
              </div>
            )}

            {keyword_coverage != null && (
              <div className={cn(
                'flex items-center justify-between text-xs border-t border-[var(--line-soft)] pt-3',
                (primaryRings.length > 0 || secondaryMetrics.length > 0) ? 'mt-3' : '',
              )}>
                <span className="text-[var(--text-soft)]">Key Requirements Matched</span>
                <span className="text-[var(--text-strong)]">{keyword_coverage}%</span>
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
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                  Score Details
                </h3>
                <span className="ml-auto text-[12px] text-[var(--text-soft)]">
                  {hiring_manager.checklist_total ?? 0} / {hiring_manager.checklist_max ?? 50}
                </span>
              </div>
              {needsWork.length > 0 && (
                <div className="mb-3">
                  <span className="block mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                    Needs Improvement
                  </span>
                  <div className="space-y-1.5">
                    {needsWork.map(([key, score]) => (
                      <div key={key} className="flex items-center justify-between rounded border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2 py-1">
                        <span className="text-xs text-[var(--text-muted)] capitalize">{key.replace(/_/g, ' ')}</span>
                        <span className="text-xs font-medium text-[#f0b8b8]">{score}/5</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {strong.length > 0 && (
                <div>
                  <span className="block mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                    Strong
                  </span>
                  <div className="space-y-1.5">
                    {strong.map(([key, score]) => (
                      <div key={key} className="flex items-center justify-between rounded border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2 py-1">
                        <span className="text-xs text-[var(--text-muted)] capitalize">{key.replace(/_/g, ' ')}</span>
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
              <ScanSearch className="h-3.5 w-3.5 text-[#afc4ff]" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                Assessment
              </h3>
            </div>
            <p className="text-xs text-[var(--text-strong)] leading-relaxed">
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
            title="Hiring System Findings"
            count={atsFindingsCount}
          >
            <div className="space-y-1.5">
              {ats_findings!.map((finding, i) => {
                const priorityStyles: Record<string, string> = {
                  high: 'border-[#f0b8b8]/25 bg-[#f0b8b8]/10 text-[#f0b8b8]/90',
                  medium: 'border-[#f0d99f]/25 bg-[#f0d99f]/10 text-[#f0d99f]/90',
                  low: 'border-[#b5dec2]/25 bg-[#b5dec2]/10 text-[#b5dec2]/90',
                };
                const badgeStyle =
                  priorityStyles[finding.priority?.toLowerCase()] ??
                  'border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)]';
                return (
                  <div
                    key={`ats-finding-${i}`}
                    className="flex items-start gap-2 rounded border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-2"
                  >
                    <span
                      className={`mt-0.5 shrink-0 rounded-md border px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wider ${badgeStyle}`}
                    >
                      {finding.priority ?? 'low'}
                    </span>
                    <span className="text-xs text-[var(--text-muted)] leading-relaxed">
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
            title="Naturalness Check"
            count={humanizeIssuesCount}
          >
            <div className="space-y-1.5">
              {humanize_issues!.map((issue, i) => (
                <div key={`humanize-${i}`} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--line-strong)]" />
                  <span className="text-xs text-[var(--text-muted)] leading-relaxed">
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
            title="Story Consistency"
            count={coherenceIssuesCount}
          >
            <div className="space-y-1.5">
              {coherence_issues!.map((issue, i) => (
                <div key={`coherence-${i}`} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--line-strong)]" />
                  <span className="text-xs text-[var(--text-muted)] leading-relaxed">
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
              <span className={`rounded-md border px-2.5 py-1 text-[12px] uppercase tracking-[0.12em] ${
                highRiskCount > 0
                  ? 'border-[#f0d99f]/20 bg-[#f0d99f]/[0.08] text-[#f0d99f]/85'
                  : 'border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)]'
              }`}>
                {highRiskCount > 0 ? 'Action required' : 'Review'}
              </span>
              <Flag className="h-3.5 w-3.5 text-[var(--text-soft)]" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                Items to Review
              </h3>
            </div>
            <div className="space-y-2">
              {risk_flags.map((rf, i) => {
                const severityColor = ({
                  low: 'border-[#b5dec2]/20 bg-[#b5dec2]/10',
                  medium: 'border-[#f0d99f]/20 bg-[#f0d99f]/10',
                  high: 'border-[#f0b8b8]/20 bg-[#f0b8b8]/10',
                } as Record<string, string>)[rf.severity] ?? 'border-[var(--line-soft)] bg-[var(--accent-muted)]';
                return (
                  <div key={`risk-flag-${rf.flag.slice(0, 30)}-${i}`} className={`rounded-lg border p-2.5 ${severityColor}`}>
                    <p className="text-xs text-[var(--text-strong)]">{cleanText(rf.flag)}</p>
                    <p className="mt-1 text-[12px] text-[var(--text-soft)]">{cleanText(rf.recommendation)}</p>
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
              <span className="rounded-md border border-[#f0d99f]/20 bg-[#f0d99f]/[0.08] px-2.5 py-1 text-[12px] uppercase tracking-[0.12em] text-[#f0d99f]/85">
                Action required
              </span>
              <AlertTriangle className="h-3.5 w-3.5 text-[var(--text-soft)]" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                Age-Bias Risks
              </h3>
            </div>
            <div className="space-y-1.5">
              {age_bias_risks.map((risk, i) => (
                <div key={`age-bias-${risk.slice(0, 30)}-${i}`} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--line-strong)]" />
                  <span className="text-xs text-[var(--text-muted)]">{cleanText(risk)}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

      </div>
    </div>
  );
}
