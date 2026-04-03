import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Search,
  Sparkles,
  Target,
  Trophy,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { GlassCard } from '../../GlassCard';
import { cn } from '@/lib/utils';
import { FinalReviewConcernThread } from './FinalReviewConcernThread';
import type {
  HiringManagerConcern,
  HiringManagerReviewResult,
} from '@/hooks/useHiringManagerReview';
import type { FinalReviewChatContext } from '@/types/resume-v2';
import type { FinalReviewChatHook } from '@/hooks/useFinalReviewChat';
import type { FinalReviewTargetMatch } from '../utils/final-review-target';

export interface HiringManagerReviewCardProps {
  result: HiringManagerReviewResult | null;
  isLoading: boolean;
  error: string | null;
  companyName: string;
  roleTitle: string;
  onRequestReview: () => void;
  onApplyRecommendation?: (
    concern: HiringManagerConcern,
    languageOverride?: string,
    candidateInputUsed?: boolean,
  ) => void;
  isEditing?: boolean;
  resolvedConcernIds?: string[];
  finalReviewChat?: FinalReviewChatHook | null;
  buildFinalReviewChatContext?: (concern: HiringManagerConcern) => FinalReviewChatContext | null;
  resolveConcernTarget?: (concern: HiringManagerConcern) => FinalReviewTargetMatch | null;
  onPreviewConcernTarget?: (concern: HiringManagerConcern) => void;
}

const VERDICT_CONFIG = {
  strong_interview_candidate: {
    label: 'Strong Interview Candidate',
    color: 'var(--badge-green-text)',
    bg: 'var(--badge-green-bg)',
    border: 'color-mix(in srgb, var(--badge-green-text) 25%, transparent)',
  },
  possible_interview: {
    label: 'Possible Interview',
    color: 'var(--link)',
    bg: 'var(--badge-blue-bg)',
    border: 'color-mix(in srgb, var(--link) 25%, transparent)',
  },
  needs_improvement: {
    label: 'Needs Improvement',
    color: 'var(--badge-amber-text)',
    bg: 'var(--badge-amber-bg)',
    border: 'color-mix(in srgb, var(--badge-amber-text) 25%, transparent)',
  },
  likely_rejected: {
    label: 'Likely Rejected',
    color: 'var(--badge-red-text)',
    bg: 'var(--badge-red-bg)',
    border: 'color-mix(in srgb, var(--badge-red-text) 25%, transparent)',
  },
} as const;

const SCAN_CONFIG = {
  continue_reading: {
    label: 'Keep Reading',
    color: 'var(--badge-green-text)',
    bg: 'var(--badge-green-bg)',
    border: 'color-mix(in srgb, var(--badge-green-text) 25%, transparent)',
  },
  skip: {
    label: 'At Risk of Skip',
    color: 'var(--badge-red-text)',
    bg: 'var(--badge-red-bg)',
    border: 'color-mix(in srgb, var(--badge-red-text) 25%, transparent)',
  },
} as const;

const SEVERITY_CONFIG = {
  critical: { color: 'var(--badge-red-text)', bg: 'var(--badge-red-bg)', border: 'color-mix(in srgb, var(--badge-red-text) 25%, transparent)' },
  moderate: { color: 'var(--badge-amber-text)', bg: 'var(--badge-amber-bg)', border: 'color-mix(in srgb, var(--badge-amber-text) 25%, transparent)' },
  minor: { color: 'var(--link)', bg: 'var(--badge-blue-bg)', border: 'color-mix(in srgb, var(--link) 25%, transparent)' },
} as const;

const ASSESSMENT_CONFIG = {
  strong: { label: 'Strong', color: 'var(--badge-green-text)', bg: 'var(--badge-green-bg)', border: 'color-mix(in srgb, var(--badge-green-text) 25%, transparent)' },
  moderate: { label: 'Moderate', color: 'var(--badge-amber-text)', bg: 'var(--badge-amber-bg)', border: 'color-mix(in srgb, var(--badge-amber-text) 25%, transparent)' },
  weak: { label: 'Weak', color: 'var(--badge-red-text)', bg: 'var(--badge-red-bg)', border: 'color-mix(in srgb, var(--badge-red-text) 25%, transparent)' },
} as const;

const CONCERN_LABELS: Record<HiringManagerConcern['type'], string> = {
  missing_evidence: 'Missing Evidence',
  weak_positioning: 'Weak Positioning',
  missing_metric: 'Missing Metric',
  unclear_scope: 'Unclear Scope',
  benchmark_gap: 'Benchmark Gap',
  clarity_issue: 'Clarity Issue',
  credibility_risk: 'Credibility Risk',
};

const FALLBACK_VERDICT = VERDICT_CONFIG.needs_improvement;
const FALLBACK_SCAN = SCAN_CONFIG.skip;
const FINAL_REVIEW_META_ITEMS = ['Recruiter Skim', 'Manager Read', 'Benchmark Pressure', 'Fixes on Resume'] as const;

function getConcernReviewButtonLabel(concern: HiringManagerConcern): string {
  return concern.requires_candidate_input
    ? 'Review Suggested Fix on Resume'
    : 'Review Edit on Resume';
}

function ReviewCallout({
  title,
  titleClassName,
  children,
  className,
}: {
  title: string;
  titleClassName: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('support-callout final-review-callout', className)}>
      <p className={cn('final-review-callout__title', titleClassName)}>
        {title}
      </p>
      <div className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
        {children}
      </div>
    </div>
  );
}

function ReviewStagePill({ children }: { children: React.ReactNode }) {
  return <span className="final-review-stage-pill">{children}</span>;
}

function ReviewMetaChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <span className="final-review-meta-chip">
      <span className="final-review-meta-chip__label">{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Search;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-3 flex items-start gap-3">
      <div className="mt-0.5 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] p-2">
        <Icon className="h-4 w-4 text-[var(--text-soft)]" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">{title}</h3>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-soft)]">{description}</p>
        )}
      </div>
    </div>
  );
}

function ToneBadge({
  label,
  tone,
}: {
  label: string;
  tone: { color: string; bg: string; border: string };
}) {
  return (
    <span
      className="inline-flex border-l-2 px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.16em]"
      style={{ color: tone.color, backgroundColor: tone.bg, borderColor: tone.border }}
    >
      {label}
    </span>
  );
}

function AssessmentPill({
  label,
  value,
}: {
  label: string;
  value: 'strong' | 'moderate' | 'weak';
}) {
  const tone = ASSESSMENT_CONFIG[value];

  return (
    <div className="support-callout p-3">
      <p className="text-[13px] uppercase tracking-[0.18em] text-[var(--text-soft)]">{label}</p>
      <div className="mt-2">
        <ToneBadge label={tone.label} tone={tone} />
      </div>
    </div>
  );
}

function TextList({
  items,
  tone = 'neutral',
}: {
  items: string[];
  tone?: 'neutral' | 'good' | 'warning';
}) {
  const toneClass = tone === 'good'
    ? 'border-[var(--badge-green-text)]/15 bg-[var(--badge-green-bg)]'
    : tone === 'warning'
      ? 'border-[var(--badge-amber-text)]/15 bg-[var(--badge-amber-bg)]'
      : 'border-[var(--line-soft)] bg-[var(--accent-muted)]';

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={`${item}-${index}`} className={`rounded-lg border px-3 py-2 ${toneClass}`}>
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">{item}</p>
        </div>
      ))}
    </div>
  );
}

function truncatePreview(text: string, maxLength = 180): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

export function HiringManagerReviewCard({
  result,
  isLoading,
  error,
  companyName,
  roleTitle,
  onRequestReview,
  onApplyRecommendation,
  isEditing = false,
  resolvedConcernIds = [],
  finalReviewChat,
  buildFinalReviewChatContext,
  resolveConcernTarget,
  onPreviewConcernTarget,
}: HiringManagerReviewCardProps) {
  const [expandedConcern, setExpandedConcern] = useState<string | null>(null);
  const [threadConcernId, setThreadConcernId] = useState<string | null>(null);

  if (!result && !isLoading && !error) {
    return (
      <GlassCard className="p-5 animate-[card-enter_500ms_ease-out_forwards]">
        <div className="flex items-start gap-3">
          <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--link)]" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-[var(--text-strong)]">Final Review</h3>
            <p className="mt-1 text-sm leading-relaxed text-[var(--text-soft)]">
              Run one last recruiter skim and hiring-manager read before export.
              This tells you what is obvious immediately, what still weakens interview odds,
              and which fixes are worth making now.
            </p>
            <div className="final-review-stage-strip mt-4">
              {FINAL_REVIEW_META_ITEMS.map((item) => (
                <ReviewStagePill key={item}>{item}</ReviewStagePill>
              ))}
            </div>
            <button
              type="button"
              onClick={onRequestReview}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--link)]/20 bg-[var(--badge-blue-bg)] px-4 py-2.5 text-sm font-medium text-[var(--link)] transition-colors hover:bg-[var(--link)]/20"
            >
              <UserCheck className="h-4 w-4" />
              Run Final Review
            </button>
          </div>
        </div>
      </GlassCard>
    );
  }

  if (isLoading) {
    return (
      <GlassCard className="p-5 animate-[card-enter_500ms_ease-out_forwards]">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 text-[var(--link)] motion-safe:animate-spin" />
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-strong)]">Running Final Review...</h3>
            <p className="mt-0.5 text-xs text-[var(--text-soft)]">
              Checking the recruiter skim and the {roleTitle} hiring-manager read for {companyName}
            </p>
          </div>
        </div>
      </GlassCard>
    );
  }

  if (error) {
    return (
      <GlassCard className="p-5">
        <div className="flex items-center gap-2 text-sm text-[var(--badge-red-text)]/80">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
        <button
          type="button"
          onClick={onRequestReview}
          className="mt-3 text-xs text-[var(--link)] transition-colors hover:text-[var(--link)]/80"
        >
          Try again
        </button>
      </GlassCard>
    );
  }

  if (!result) return null;

  const verdictTone = result.hiring_manager_verdict?.rating
    ? VERDICT_CONFIG[result.hiring_manager_verdict.rating] ?? FALLBACK_VERDICT
    : FALLBACK_VERDICT;
  const recruiterTone = result.six_second_scan?.decision
    ? SCAN_CONFIG[result.six_second_scan.decision] ?? FALLBACK_SCAN
    : FALLBACK_SCAN;

  return (
    <GlassCard className="p-4 animate-[card-enter_500ms_ease-out_forwards]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 shrink-0 text-[var(--link)]" />
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">Final Review</h2>
          </div>
          <p className="mt-1 text-[13px] leading-5 text-[var(--text-soft)]">
            Job-description fit drives the verdict. Benchmark alignment shows where stronger competitive proof would still help.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToneBadge label={recruiterTone.label} tone={recruiterTone} />
          <ToneBadge label={verdictTone.label} tone={verdictTone} />
        </div>
      </div>

      <div className="space-y-5">
        <section>
          <SectionHeader
            icon={Search}
            title="Recruiter Skim"
            description={`Top-third skim for ${companyName}. If the strongest signals are not obvious immediately, the deeper review may never happen.`}
          />
          <div className="shell-panel p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="max-w-3xl text-[13px] leading-5 text-[var(--text-muted)]">
                {result.six_second_scan.reason}
              </p>
              <ToneBadge label={recruiterTone.label} tone={recruiterTone} />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <ReviewCallout
                title="Signals Seen"
                titleClassName="text-[var(--badge-green-text)]"
                className="border border-[var(--badge-green-text)]/15 bg-[var(--badge-green-bg)]"
              >
                <div className="space-y-3">
                  {result.six_second_scan.top_signals_seen.length > 0 ? (
                    result.six_second_scan.top_signals_seen.map((signal, index) => (
                      <div key={`${signal.signal}-${index}`} className="text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[var(--text-muted)]">{signal.signal}</p>
                          <ToneBadge
                            label={signal.visible_in_top_third ? 'Top Third' : 'Too Low'}
                            tone={signal.visible_in_top_third ? SCAN_CONFIG.continue_reading : ASSESSMENT_CONFIG.moderate}
                          />
                        </div>
                        <p className="mt-1 text-[var(--text-soft)]">{signal.why_it_matters}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-[var(--text-soft)]">No clear strengths were surfaced in the recruiter skim.</p>
                  )}
                </div>
              </ReviewCallout>

              <ReviewCallout
                title="Still Missing"
                titleClassName="text-[var(--badge-amber-text)]"
                className="border border-[var(--badge-amber-text)]/15 bg-[var(--badge-amber-bg)]"
              >
                <div className="space-y-3">
                  {result.six_second_scan.important_signals_missing.length > 0 ? (
                    result.six_second_scan.important_signals_missing.map((signal, index) => (
                      <div key={`${signal.signal}-${index}`} className="text-xs">
                        <p className="text-[var(--text-muted)]">{signal.signal}</p>
                        <p className="mt-1 text-[var(--text-soft)]">{signal.why_it_matters}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-[var(--text-soft)]">No major top-of-page omissions were flagged.</p>
                  )}
                </div>
              </ReviewCallout>
            </div>
          </div>
        </section>

        <section>
          <SectionHeader
            icon={Target}
            title="Hiring Manager Read"
            description={`Deeper interview-readiness read for the ${roleTitle} role.`}
          />
          <div className="shell-panel p-3.5">
            <p className="text-[13px] leading-5 text-[var(--text-muted)]">{result.hiring_manager_verdict.summary}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <AssessmentPill label="Job Description Fit" value={result.fit_assessment.job_description_fit} />
              <AssessmentPill label="Benchmark Alignment" value={result.fit_assessment.benchmark_alignment} />
              <AssessmentPill label="Business Impact" value={result.fit_assessment.business_impact} />
              <AssessmentPill label="Clarity & Credibility" value={result.fit_assessment.clarity_and_credibility} />
            </div>
          </div>
        </section>

        {result.top_wins.length > 0 && (
          <section>
            <SectionHeader
              icon={Trophy}
              title="Top Wins"
              description="These are the strongest reasons to interview the candidate. If they are buried, move them higher before export."
            />
            <div className="space-y-3">
              {result.top_wins.map((win, index) => (
                <div key={`${win.win}-${index}`} className="shell-panel p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-strong)]">{win.win}</p>
                      <p className="mt-1 text-xs text-[var(--text-soft)]">Supports: {win.aligned_requirement}</p>
                    </div>
                    <ToneBadge
                      label={win.prominent_enough ? 'Placed Well' : 'Move Higher'}
                      tone={win.prominent_enough ? ASSESSMENT_CONFIG.strong : ASSESSMENT_CONFIG.moderate}
                    />
                  </div>
                  <p className="mt-2.5 text-[13px] leading-5 text-[var(--text-muted)]">{win.why_powerful}</p>
                  {!win.prominent_enough && (
                    <div className="support-callout mt-2.5 border border-[var(--badge-amber-text)]/15 bg-[var(--badge-amber-bg)] px-3 py-2">
                      <p className="text-[12px] leading-5 text-[var(--text-muted)]">{win.repositioning_recommendation}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {result.concerns.length > 0 && (
          <section>
            <SectionHeader
              icon={Sparkles}
              title="Priority Fixes"
              description="These are the issues most likely to change the interview decision."
            />
            <div className="space-y-2">
              {result.concerns.map((concern) => {
                const severityTone = SEVERITY_CONFIG[concern.severity];
                const isExpanded = expandedConcern === concern.id;
                const isResolved = resolvedConcernIds.includes(concern.id);
                const isThreadOpen = threadConcernId === concern.id;
                const chatState = finalReviewChat?.getItemState(concern.id);
                const chatContext = buildFinalReviewChatContext?.(concern) ?? null;
                const resolvedTarget = resolveConcernTarget?.(concern) ?? null;

                return (
                  <div
                    key={concern.id}
                    className="overflow-hidden rounded-xl border"
                    style={{ borderColor: severityTone.border }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (isExpanded) {
                          setExpandedConcern(null);
                          if (threadConcernId === concern.id) {
                            setThreadConcernId(null);
                          }
                          return;
                        }
                        setExpandedConcern(concern.id);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-[var(--accent-muted)]"
                      aria-expanded={isExpanded}
                    >
                      <ChevronDown
                        className={cn(
                          'h-3.5 w-3.5 shrink-0 text-[var(--text-soft)] transition-transform duration-200',
                          isExpanded ? 'rotate-0' : '-rotate-90',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-[var(--text-muted)]">{concern.observation}</p>
                        <p className="mt-1 text-[13px] uppercase tracking-[0.18em] text-[var(--text-soft)]">
                          {CONCERN_LABELS[concern.type]}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isResolved && (
                          <ToneBadge label="Resolved on Resume" tone={ASSESSMENT_CONFIG.strong} />
                        )}
                        <ToneBadge label={concern.severity} tone={severityTone} />
                      </div>
                    </button>

                    <div
                      className={cn(
                        'overflow-hidden transition-all duration-300',
                        isExpanded ? 'max-h-[1400px] opacity-100' : 'max-h-0 opacity-0',
                      )}
                    >
                      <div className="final-review-concern-body border-t border-[var(--line-soft)] px-3 pb-3.5 pt-3">
                        <div className="final-review-note">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-soft)]">
                            Why this matters
                          </p>
                          <p className="mt-2 text-sm leading-relaxed text-[var(--text-soft)]">{concern.why_it_hurts}</p>
                        </div>

                        {(concern.target_section || concern.related_requirement) && (
                          <div className="final-review-meta-strip">
                            {concern.target_section && (
                              <ReviewMetaChip label="Section" value={concern.target_section} />
                            )}
                            {concern.related_requirement && (
                              <ReviewMetaChip label="Requirement" value={concern.related_requirement} />
                            )}
                          </div>
                        )}

                        <div className="final-review-callout-grid">
                          {resolvedTarget && (
                            <ReviewCallout
                              title="Resume line to edit"
                              titleClassName="text-[var(--link)]"
                              className="border border-[var(--link)]/15 bg-[var(--badge-blue-bg)]"
                            >
                              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--text-soft)]">
                                {resolvedTarget.section}
                              </p>
                              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                                &ldquo;{truncatePreview(resolvedTarget.text)}&rdquo;
                              </p>
                            </ReviewCallout>
                          )}

                          <ReviewCallout
                            title="What to change"
                            titleClassName="text-[var(--link)]"
                            className="border border-[var(--link)]/15 bg-[var(--badge-blue-bg)]"
                          >
                            {concern.fix_strategy}
                          </ReviewCallout>
                        </div>

                        {concern.suggested_resume_edit && (
                          <ReviewCallout
                            title="Suggested wording"
                            titleClassName="text-[var(--badge-green-text)]"
                            className="border border-[var(--badge-green-text)]/15 bg-[var(--badge-green-bg)]"
                          >
                            {concern.suggested_resume_edit}
                          </ReviewCallout>
                        )}

                        {concern.clarifying_question && (
                          <ReviewCallout
                            title="Question to answer"
                            titleClassName="text-[var(--badge-amber-text)]"
                            className="border border-[var(--badge-amber-text)]/15 bg-[var(--badge-amber-bg)]"
                          >
                            {concern.clarifying_question}
                          </ReviewCallout>
                        )}

                        {isResolved && (
                          <div className="support-callout final-review-status-note border border-[var(--badge-green-text)]/18 bg-[var(--badge-green-bg)] px-3 py-2 text-xs text-[var(--text-muted)]">
                            This concern already has an accepted resume edit. If you undo that change, it will show up as unresolved again.
                          </div>
                        )}

                        <div className="final-review-actions">
                          {resolvedTarget && onPreviewConcernTarget && (
                            <button
                              type="button"
                              onClick={() => onPreviewConcernTarget(concern)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--link)]/20 bg-[var(--badge-blue-bg)] px-3 py-2 text-[13px] font-medium text-[var(--link)] transition-colors hover:bg-[var(--link)]/20"
                            >
                              <Target className="h-3 w-3" />
                              Show on Resume
                            </button>
                          )}

                          {onApplyRecommendation && (
                            <button
                              type="button"
                              onClick={() => onApplyRecommendation(concern)}
                              disabled={isEditing}
                              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors"
                              style={{
                                color: severityTone.color,
                                backgroundColor: severityTone.bg,
                                border: `1px solid ${severityTone.border}`,
                              }}
                            >
                              <Wrench className="h-3 w-3" />
                              {getConcernReviewButtonLabel(concern)}
                            </button>
                          )}

                          {finalReviewChat && chatContext && (
                            <button
                              type="button"
                              onClick={() => setThreadConcernId(isThreadOpen ? null : concern.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-[13px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-strong)]"
                            >
                              <Sparkles className="h-3 w-3" />
                              {isThreadOpen ? 'Hide Coaching Thread' : concern.requires_candidate_input ? 'Open Coaching Thread' : 'Brainstorm Another Fix'}
                            </button>
                          )}
                        </div>

                        {finalReviewChat && chatContext && isThreadOpen && (
                          <FinalReviewConcernThread
                            concernId={concern.id}
                            messages={chatState?.messages ?? []}
                            isLoading={chatState?.isLoading ?? false}
                            error={chatState?.error ?? null}
                            resolvedLanguage={isResolved ? (chatState?.resolvedLanguage ?? null) : null}
                            onSendMessage={finalReviewChat.sendMessage}
                            onReviewEdit={(concernId, language, candidateInputUsed) => {
                              if (concernId !== concern.id || !onApplyRecommendation) return;
                              onApplyRecommendation(concern, language, Boolean(candidateInputUsed));
                            }}
                            context={chatContext}
                            isEditing={isEditing}
                            onCloseThread={() => setThreadConcernId(null)}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {result.structure_recommendations.length > 0 && (
          <section>
            <SectionHeader
              icon={Target}
              title="Structure Recommendations"
              description="Use these when the strongest material exists, but it is buried or sequenced poorly."
            />
            <div className="space-y-2">
              {result.structure_recommendations.map((recommendation, index) => (
                <div key={`${recommendation.issue}-${index}`} className="shell-panel p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium text-[var(--text-strong)]">{recommendation.issue}</p>
                    <ToneBadge
                      label={`${recommendation.priority} priority`}
                      tone={recommendation.priority === 'high'
                        ? ASSESSMENT_CONFIG.weak
                        : recommendation.priority === 'medium'
                          ? ASSESSMENT_CONFIG.moderate
                          : ASSESSMENT_CONFIG.strong}
                    />
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-soft)]">{recommendation.recommendation}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionHeader
            icon={CheckCircle2}
            title="Benchmark Pressure Test"
            description="These signals do not override solid job fit, but they do show where the resume may still look less competitive against stronger peers."
          />
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="support-callout border border-[var(--badge-green-text)]/15 bg-[var(--badge-green-bg)] p-3.5">
              <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[var(--badge-green-text)]">
                Advantages
              </p>
              {result.benchmark_comparison.advantages_vs_benchmark.length > 0 ? (
                <div className="mt-3">
                  <TextList items={result.benchmark_comparison.advantages_vs_benchmark} tone="good" />
                </div>
              ) : (
                <p className="mt-3 text-xs text-[var(--text-soft)]">No clear advantages were called out versus the benchmark.</p>
              )}
            </div>

            <div className="rounded-xl border border-[var(--badge-amber-text)]/15 bg-[var(--badge-amber-bg)] p-3.5">
              <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[var(--badge-amber-text)]">
                Competitive Gaps
              </p>
              {result.benchmark_comparison.gaps_vs_benchmark.length > 0 ? (
                <div className="mt-3">
                  <TextList items={result.benchmark_comparison.gaps_vs_benchmark} tone="warning" />
                </div>
              ) : (
                <p className="mt-3 text-xs text-[var(--text-soft)]">No major benchmark gaps were highlighted.</p>
              )}
            </div>

            <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-3.5">
              <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[var(--text-soft)]">
                Reframing Opportunities
              </p>
              {result.benchmark_comparison.reframing_opportunities.length > 0 ? (
                <div className="mt-3">
                  <TextList items={result.benchmark_comparison.reframing_opportunities} />
                </div>
              ) : (
                <p className="mt-3 text-xs text-[var(--text-soft)]">No additional reframing opportunities were suggested.</p>
              )}
            </div>
          </div>
        </section>

        {result.improvement_summary.length > 0 && (
          <section>
            <SectionHeader
              icon={Sparkles}
              title="Last Tune-Ups"
              description="These are the highest-value moves still worth making before export."
            />
            <TextList items={result.improvement_summary} />
          </section>
        )}
      </div>
    </GlassCard>
  );
}
