/**
 * LinkedInAuditReport — Renders the structured LinkedInAuditReport JSON
 * produced by the Writer agent's assemble_report tool.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Check, Copy, ChevronDown, ChevronRight, Star } from 'lucide-react';
import type { LinkedInAuditReport } from '@/hooks/useLinkedInOptimizer';

interface LinkedInAuditReportProps {
  report: LinkedInAuditReport;
}

// ─── Copy button ─────────────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        'flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-medium transition-colors',
        copied
          ? 'text-[var(--badge-green-text)] bg-[var(--badge-green-bg)]'
          : 'text-[var(--text-soft)] hover:text-[var(--text-muted)] bg-[var(--surface-0)] hover:bg-[var(--surface-1)] border border-[var(--line-soft)]',
      )}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {label && <span>{copied ? 'Copied!' : label}</span>}
      {!label && (copied ? 'Copied!' : 'Copy')}
    </button>
  );
}

// ─── Score bar ───────────────────────────────────────────────────────────────

function ScoreBar({ label, score }: { label: string; score: number }) {
  const clampedScore = Math.max(1, Math.min(10, Math.round(score)));
  const percentage = (clampedScore / 10) * 100;

  const colorClass =
    clampedScore <= 4 ? 'bg-red-500' :
    clampedScore <= 6 ? 'bg-amber-500' :
    clampedScore <= 8 ? 'bg-emerald-500' :
    'bg-blue-500';

  const textColorClass =
    clampedScore <= 4 ? 'text-red-400' :
    clampedScore <= 6 ? 'text-amber-400' :
    clampedScore <= 8 ? 'text-emerald-400' :
    'text-blue-400';

  return (
    <div className="flex items-center gap-3">
      <span className="text-[13px] text-[var(--text-soft)] w-[180px] flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-[var(--line-soft)] overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', colorClass)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className={cn('text-[13px] font-semibold w-6 text-right', textColorClass)}>
        {clampedScore}
      </span>
    </div>
  );
}

// ─── Collapsible section ─────────────────────────────────────────────────────

function Collapsible({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-[var(--line-soft)] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left bg-[var(--surface-1)] hover:bg-[var(--surface-0)] transition-colors"
      >
        <span className="text-[13px] font-semibold text-[var(--text-strong)]">{title}</span>
        {open ? <ChevronDown size={14} className="text-[var(--text-soft)]" /> : <ChevronRight size={14} className="text-[var(--text-soft)]" />}
      </button>
      {open && (
        <div className="px-4 py-4 bg-[var(--surface-0)]">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Section container ───────────────────────────────────────────────────────

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <h3 className="text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}

// ─── Pill tags ───────────────────────────────────────────────────────────────

function PillTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-[var(--surface-1)] border border-[var(--line-soft)] text-[var(--text-soft)]">
      {children}
    </span>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function LinkedInAuditReportRenderer({ report }: LinkedInAuditReportProps) {
  const overallScore = report.audit_scores.overall_score;
  const overallColorClass =
    overallScore <= 4 ? 'text-red-400' :
    overallScore <= 6 ? 'text-amber-400' :
    overallScore <= 8 ? 'text-emerald-400' :
    'text-blue-400';

  return (
    <div className="flex flex-col gap-6">

      {/* Overall score banner */}
      <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] px-5 py-4 flex items-center gap-4">
        <div className="flex flex-col items-center justify-center w-16 h-16 rounded-full border-2 border-[var(--line-soft)] flex-shrink-0">
          <span className={cn('text-2xl font-bold', overallColorClass)}>{overallScore}</span>
          <span className="text-[10px] text-[var(--text-soft)] uppercase tracking-wide">/ 10</span>
        </div>
        <div>
          <p className="text-[15px] font-semibold text-[var(--text-strong)]">Overall LinkedIn Score</p>
          <p className="text-[13px] text-[var(--text-soft)] mt-0.5">{report.positioning_summary.value_proposition}</p>
        </div>
      </div>

      {/* Positioning summary */}
      <Section title="Positioning Summary">
        <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-4 flex flex-col gap-3">
          <div>
            <p className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider mb-1">Core Identity</p>
            <p className="text-[14px] text-[var(--text-strong)] leading-relaxed">{report.positioning_summary.core_identity}</p>
          </div>
          <div>
            <p className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider mb-1">Value Proposition</p>
            <p className="text-[14px] text-[var(--text-strong)] leading-relaxed">{report.positioning_summary.value_proposition}</p>
          </div>
          {report.positioning_summary.differentiators.length > 0 && (
            <div>
              <p className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider mb-2">Differentiators</p>
              <div className="flex flex-wrap gap-1.5">
                {report.positioning_summary.differentiators.map((d) => (
                  <PillTag key={d}>{d}</PillTag>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider mb-1">Target Market Fit</p>
            <p className="text-[13px] text-[var(--text-soft)] leading-relaxed">{report.positioning_summary.target_market_fit}</p>
          </div>
        </div>
      </Section>

      {/* Audit scores */}
      <Section title="Audit Scores">
        <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-4 flex flex-col gap-3">
          <ScoreBar label="Five-Second Test" score={report.audit_scores.five_second_test} />
          <ScoreBar label="Headline Strength" score={report.audit_scores.headline_strength} />
          <ScoreBar label="About Hook" score={report.audit_scores.about_hook_strength} />
          <ScoreBar label="Proof Strength" score={report.audit_scores.proof_strength} />
          <ScoreBar label="Differentiation" score={report.audit_scores.differentiation_strength} />
          <ScoreBar label="Executive Presence" score={report.audit_scores.executive_presence} />
          <ScoreBar label="Keyword Effectiveness" score={report.audit_scores.keyword_effectiveness} />
        </div>
      </Section>

      {/* Diagnostic findings */}
      <Section title="Diagnostic Findings">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {report.diagnostic_findings.what_is_working.length > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
              <p className="text-[12px] font-medium text-emerald-400 uppercase tracking-wider mb-2">What is working</p>
              <ul className="flex flex-col gap-1">
                {report.diagnostic_findings.what_is_working.map((item) => (
                  <li key={item} className="text-[13px] text-[var(--text-soft)] leading-relaxed flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5 flex-shrink-0">+</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.diagnostic_findings.what_is_weak.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3">
              <p className="text-[12px] font-medium text-amber-400 uppercase tracking-wider mb-2">What is weak</p>
              <ul className="flex flex-col gap-1">
                {report.diagnostic_findings.what_is_weak.map((item) => (
                  <li key={item} className="text-[13px] text-[var(--text-soft)] leading-relaxed flex items-start gap-2">
                    <span className="text-amber-400 mt-0.5 flex-shrink-0">!</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.diagnostic_findings.what_is_missing.length > 0 && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-3">
              <p className="text-[12px] font-medium text-red-400 uppercase tracking-wider mb-2">What is missing</p>
              <ul className="flex flex-col gap-1">
                {report.diagnostic_findings.what_is_missing.map((item) => (
                  <li key={item} className="text-[13px] text-[var(--text-soft)] leading-relaxed flex items-start gap-2">
                    <span className="text-red-400 mt-0.5 flex-shrink-0">x</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.diagnostic_findings.where_profile_undersells_candidate.length > 0 && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-3">
              <p className="text-[12px] font-medium text-blue-400 uppercase tracking-wider mb-2">Where profile undersells you</p>
              <ul className="flex flex-col gap-1">
                {report.diagnostic_findings.where_profile_undersells_candidate.map((item) => (
                  <li key={item} className="text-[13px] text-[var(--text-soft)] leading-relaxed flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5 flex-shrink-0">^</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Section>

      {/* Headline recommendations */}
      <Section title="Headline Recommendations">
        <div className="flex flex-col gap-3">
          {report.headline_recommendations.options.map((opt, idx) => {
            const isRecommended = opt.headline === report.headline_recommendations.recommended_headline
              || idx === 0 && !report.headline_recommendations.options.some(
                (o) => o.headline === report.headline_recommendations.recommended_headline,
              );
            return (
              <div
                key={opt.label}
                className={cn(
                  'rounded-xl border p-4',
                  isRecommended
                    ? 'border-[var(--link)]/30 bg-[var(--link)]/[0.04]'
                    : 'border-[var(--line-soft)] bg-[var(--surface-1)]',
                )}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium text-[var(--text-soft)] uppercase tracking-wider">{opt.label}</span>
                    {isRecommended && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--link)]/10 text-[var(--link)]">
                        <Star size={10} />
                        Recommended
                      </span>
                    )}
                  </div>
                  <CopyButton text={opt.headline} />
                </div>
                <p className="text-[15px] font-medium text-[var(--text-strong)] leading-snug mb-2">{opt.headline}</p>
                {opt.why_it_works && (
                  <p className="text-[12px] text-[var(--text-soft)] leading-relaxed">{opt.why_it_works}</p>
                )}
              </div>
            );
          })}
          {report.headline_recommendations.recommended_headline_rationale && (
            <p className="text-[13px] text-[var(--text-soft)] italic px-1 leading-relaxed">
              {report.headline_recommendations.recommended_headline_rationale}
            </p>
          )}
        </div>
      </Section>

      {/* About section rewrite */}
      <Section title="About Section Rewrite">
        <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-4 flex flex-col gap-4">
          {report.about_section_rewrite.five_second_hook_analysis && (
            <div>
              <p className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider mb-1.5">Five-Second Test Assessment</p>
              <p className="text-[13px] text-[var(--text-soft)] leading-relaxed">{report.about_section_rewrite.five_second_hook_analysis}</p>
            </div>
          )}
          {report.about_section_rewrite.recommended_opening && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider">Recommended Opening</p>
                <CopyButton text={report.about_section_rewrite.recommended_opening} />
              </div>
              <div className="rounded-lg border border-[var(--link)]/20 bg-[var(--link)]/[0.03] px-3 py-2.5">
                <p className="text-[14px] text-[var(--text-strong)] leading-relaxed italic">{report.about_section_rewrite.recommended_opening}</p>
              </div>
            </div>
          )}
          {report.about_section_rewrite.full_rewritten_about && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider">Full Rewrite</p>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[var(--text-soft)]">
                    {report.about_section_rewrite.full_rewritten_about.length} chars
                  </span>
                  <CopyButton text={report.about_section_rewrite.full_rewritten_about} />
                </div>
              </div>
              <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-0)] px-3 py-3 max-h-64 overflow-y-auto">
                <p className="text-[13px] text-[var(--text-soft)] leading-relaxed whitespace-pre-wrap">{report.about_section_rewrite.full_rewritten_about}</p>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Experience alignment */}
      {(
        report.experience_alignment.resume_strengths_to_surface_more.length > 0 ||
        report.experience_alignment.claims_that_need_stronger_proof.length > 0 ||
        report.experience_alignment.recommended_experience_reframing.length > 0
      ) && (
        <Section title="Experience Alignment">
          <div className="flex flex-col gap-2">
            {report.experience_alignment.resume_strengths_to_surface_more.length > 0 && (
              <Collapsible title="Strengths to surface more" defaultOpen={true}>
                <ul className="flex flex-col gap-1.5">
                  {report.experience_alignment.resume_strengths_to_surface_more.map((item) => (
                    <li key={item} className="text-[13px] text-[var(--text-soft)] leading-relaxed flex items-start gap-2">
                      <span className="text-emerald-400 mt-0.5 flex-shrink-0">+</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </Collapsible>
            )}
            {report.experience_alignment.claims_that_need_stronger_proof.length > 0 && (
              <Collapsible title="Claims that need stronger proof">
                <ul className="flex flex-col gap-1.5">
                  {report.experience_alignment.claims_that_need_stronger_proof.map((item) => (
                    <li key={item} className="text-[13px] text-[var(--text-soft)] leading-relaxed flex items-start gap-2">
                      <span className="text-amber-400 mt-0.5 flex-shrink-0">!</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </Collapsible>
            )}
            {report.experience_alignment.recommended_experience_reframing.length > 0 && (
              <Collapsible title="Recommended reframing suggestions">
                <ul className="flex flex-col gap-2">
                  {report.experience_alignment.recommended_experience_reframing.map((item, idx) => (
                    <li key={item} className="text-[13px] text-[var(--text-soft)] leading-relaxed flex items-start gap-2">
                      <span className="text-[var(--link)] font-semibold flex-shrink-0">{idx + 1}.</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </Collapsible>
            )}
          </div>
        </Section>
      )}

      {/* Skills and featured */}
      <Section title="Skills and Featured">
        <div className="flex flex-col gap-3">
          {report.skills_and_featured_recommendations.top_skills_to_pin.length > 0 && (
            <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-4">
              <p className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider mb-2">Top skills to pin</p>
              <div className="flex flex-wrap gap-1.5">
                {report.skills_and_featured_recommendations.top_skills_to_pin.map((skill) => (
                  <PillTag key={skill}>{skill}</PillTag>
                ))}
              </div>
            </div>
          )}
          {report.skills_and_featured_recommendations.skills_to_add_or_emphasize.length > 0 && (
            <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-4">
              <p className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider mb-2">Skills to add or emphasize</p>
              <div className="flex flex-wrap gap-1.5">
                {report.skills_and_featured_recommendations.skills_to_add_or_emphasize.map((skill) => (
                  <PillTag key={skill}>{skill}</PillTag>
                ))}
              </div>
            </div>
          )}
          {report.skills_and_featured_recommendations.featured_section_recommendations.length > 0 && (
            <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-4">
              <p className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider mb-2">Featured section ideas</p>
              <ol className="flex flex-col gap-1.5">
                {report.skills_and_featured_recommendations.featured_section_recommendations.map((item, idx) => (
                  <li key={item} className="text-[13px] text-[var(--text-soft)] leading-relaxed flex items-start gap-2">
                    <span className="text-[var(--link)] font-semibold flex-shrink-0">{idx + 1}.</span>
                    {item}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </Section>

      {/* Benchmark assessment */}
      <Section title="Benchmark Assessment">
        <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-4 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <span className={cn(
                'inline-flex items-center px-2.5 py-1 rounded-full text-[13px] font-bold',
                report.final_benchmark_assessment.confidence >= 0.8 ? 'bg-emerald-500/10 text-emerald-400' :
                report.final_benchmark_assessment.confidence >= 0.6 ? 'bg-amber-500/10 text-amber-400' :
                'bg-red-500/10 text-red-400',
              )}>
                {Math.round(report.final_benchmark_assessment.confidence * 100)}% confidence
              </span>
            </div>
            <p className="text-[13px] text-[var(--text-soft)] leading-relaxed flex-1">
              {report.final_benchmark_assessment.benchmark_candidate_summary}
            </p>
          </div>
          {report.final_benchmark_assessment.key_caveats.length > 0 && (
            <div>
              <p className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider mb-1.5">Key caveats</p>
              <ul className="flex flex-col gap-1">
                {report.final_benchmark_assessment.key_caveats.map((c) => (
                  <li key={c} className="text-[12px] text-[var(--text-soft)] leading-relaxed flex items-start gap-1.5">
                    <span className="text-[var(--text-soft)] mt-0.5 flex-shrink-0">-</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Section>

    </div>
  );
}
