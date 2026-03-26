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
    color: '#b5dec2',
    bg: 'rgba(181,222,194,0.10)',
    border: 'rgba(181,222,194,0.25)',
  },
  possible_interview: {
    label: 'Possible Interview',
    color: '#afc4ff',
    bg: 'rgba(175,196,255,0.10)',
    border: 'rgba(175,196,255,0.25)',
  },
  needs_improvement: {
    label: 'Needs Improvement',
    color: '#f0d99f',
    bg: 'rgba(240,217,159,0.10)',
    border: 'rgba(240,217,159,0.25)',
  },
  likely_rejected: {
    label: 'Likely Rejected',
    color: '#f0b8b8',
    bg: 'rgba(240,184,184,0.10)',
    border: 'rgba(240,184,184,0.25)',
  },
} as const;

const SCAN_CONFIG = {
  continue_reading: {
    label: 'Keep Reading',
    color: '#b5dec2',
    bg: 'rgba(181,222,194,0.10)',
    border: 'rgba(181,222,194,0.25)',
  },
  skip: {
    label: 'At Risk of Skip',
    color: '#f0b8b8',
    bg: 'rgba(240,184,184,0.10)',
    border: 'rgba(240,184,184,0.25)',
  },
} as const;

const SEVERITY_CONFIG = {
  critical: { color: '#f0b8b8', bg: 'rgba(240,184,184,0.12)', border: 'rgba(240,184,184,0.25)' },
  moderate: { color: '#f0d99f', bg: 'rgba(240,217,159,0.12)', border: 'rgba(240,217,159,0.25)' },
  minor: { color: '#afc4ff', bg: 'rgba(175,196,255,0.12)', border: 'rgba(175,196,255,0.25)' },
} as const;

const ASSESSMENT_CONFIG = {
  strong: { label: 'Strong', color: '#b5dec2', bg: 'rgba(181,222,194,0.10)', border: 'rgba(181,222,194,0.25)' },
  moderate: { label: 'Moderate', color: '#f0d99f', bg: 'rgba(240,217,159,0.10)', border: 'rgba(240,217,159,0.25)' },
  weak: { label: 'Weak', color: '#f0b8b8', bg: 'rgba(240,184,184,0.10)', border: 'rgba(240,184,184,0.25)' },
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
    ? 'border-[#b5dec2]/15 bg-[#b5dec2]/[0.04]'
    : tone === 'warning'
      ? 'border-[#f0d99f]/15 bg-[#f0d99f]/[0.04]'
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
          <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#afc4ff]" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-[var(--text-strong)]">Final Review</h3>
            <p className="mt-1 text-sm leading-relaxed text-[var(--text-soft)]">
              Combine a six-second recruiter scan with a deeper hiring manager critique before you export.
              This stage tells the user what is obvious immediately, what still weakens interview odds,
              and which fixes are worth making now.
            </p>
            <div className="room-meta-strip mt-4 text-[13px]">
              <div className="room-meta-item">Recruiter Scan</div>
              <div className="room-meta-item">Hiring Manager Verdict</div>
              <div className="room-meta-item">Benchmark Comparison</div>
              <div className="room-meta-item">Concrete Fixes</div>
            </div>
            <button
              type="button"
              onClick={onRequestReview}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#afc4ff]/20 bg-[#afc4ff]/10 px-4 py-2.5 text-sm font-medium text-[#afc4ff] transition-colors hover:bg-[#afc4ff]/20"
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
          <Loader2 className="h-5 w-5 text-[#afc4ff] motion-safe:animate-spin" />
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-strong)]">Running Final Review...</h3>
            <p className="mt-0.5 text-xs text-[var(--text-soft)]">
              Simulating the recruiter skim and the {roleTitle} hiring manager at {companyName}
            </p>
          </div>
        </div>
      </GlassCard>
    );
  }

  if (error) {
    return (
      <GlassCard className="p-5">
        <div className="flex items-center gap-2 text-sm text-[#f0b8b8]/80">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
        <button
          type="button"
          onClick={onRequestReview}
          className="mt-3 text-xs text-[#afc4ff] transition-colors hover:text-[#afc4ff]/80"
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
    <GlassCard className="p-5 animate-[card-enter_500ms_ease-out_forwards]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 shrink-0 text-[#afc4ff]" />
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">Final Review</h2>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-soft)]">
            Job-description fit drives the verdict. Benchmark alignment shows how competitive the resume looks against stronger peers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToneBadge label={recruiterTone.label} tone={recruiterTone} />
          <ToneBadge label={verdictTone.label} tone={verdictTone} />
        </div>
      </div>

      <div className="space-y-6">
        <section>
          <SectionHeader
            icon={Search}
            title="6-Second Recruiter Scan"
            description={`This is the top-third skim test for ${companyName}. If the strongest signals are not obvious immediately, the candidate is at risk before the deeper review even starts.`}
          />
          <div className="shell-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="max-w-3xl text-sm leading-relaxed text-[var(--text-muted)]">
                {result.six_second_scan.reason}
              </p>
              <ToneBadge label={recruiterTone.label} tone={recruiterTone} />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="support-callout border border-[#b5dec2]/15 bg-[#b5dec2]/[0.04] p-3">
                <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#b5dec2]">
                  Signals Seen
                </p>
                <div className="mt-3 space-y-3">
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
              </div>

              <div className="support-callout border border-[#f0d99f]/15 bg-[#f0d99f]/[0.04] p-3">
                <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#f0d99f]">
                  Still Missing
                </p>
                <div className="mt-3 space-y-3">
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
              </div>
            </div>
          </div>
        </section>

        <section>
          <SectionHeader
            icon={Target}
            title="Hiring Manager Verdict"
            description={`This is the deeper interview-readiness view for the ${roleTitle} role.`}
          />
          <div className="shell-panel p-4">
            <p className="text-sm leading-relaxed text-[var(--text-muted)]">{result.hiring_manager_verdict.summary}</p>
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
              description="These are the strongest reasons to interview the candidate. If they are not prominent enough, the resume should be restructured before export."
            />
            <div className="space-y-3">
              {result.top_wins.map((win, index) => (
                <div key={`${win.win}-${index}`} className="shell-panel p-4">
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
                  <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">{win.why_powerful}</p>
                  {!win.prominent_enough && (
                    <div className="support-callout mt-3 border border-[#f0d99f]/15 bg-[#f0d99f]/[0.04] px-3 py-2">
                      <p className="text-xs text-[var(--text-muted)]">{win.repositioning_recommendation}</p>
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
              description="These are the issues most likely to change the interview decision. Apply fixes directly from here when the recommendation is solid."
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
                      <div className="space-y-3 border-t border-[var(--line-soft)] px-3 pb-4 pt-3">
                        <p className="text-sm leading-relaxed text-[var(--text-soft)]">{concern.why_it_hurts}</p>

                        {(concern.target_section || concern.related_requirement) && (
                          <div className="room-meta-strip gap-2 text-[13px] text-[var(--text-soft)]">
                            {concern.target_section && (
                              <span className="room-meta-item">
                                Section: {concern.target_section}
                              </span>
                            )}
                            {concern.related_requirement && (
                              <span className="room-meta-item">
                                Requirement: {concern.related_requirement}
                              </span>
                            )}
                          </div>
                        )}

                        {resolvedTarget && (
                          <div className="support-callout border border-[#afc4ff]/15 bg-[#afc4ff]/[0.04] p-3">
                            <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#afc4ff]">
                              Will revise on the resume
                            </p>
                            <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--text-soft)]">
                              {resolvedTarget.section}
                            </p>
                            <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                              &ldquo;{truncatePreview(resolvedTarget.text)}&rdquo;
                            </p>
                          </div>
                        )}

                        <div className="support-callout border border-[#afc4ff]/15 bg-[#afc4ff]/[0.04] p-3">
                          <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#afc4ff]">
                            Fix Strategy
                          </p>
                          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{concern.fix_strategy}</p>
                        </div>

                        {concern.suggested_resume_edit && (
                          <div className="support-callout border border-[#b5dec2]/15 bg-[#b5dec2]/[0.04] p-3">
                            <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#b5dec2]">
                              Sample Language
                            </p>
                            <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{concern.suggested_resume_edit}</p>
                          </div>
                        )}

                        {concern.clarifying_question && (
                          <div className="support-callout border border-[#f0d99f]/15 bg-[#f0d99f]/[0.04] p-3">
                            <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#f0d99f]">
                              Candidate Question
                            </p>
                            <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{concern.clarifying_question}</p>
                          </div>
                        )}

                        {isResolved && (
                          <div className="support-callout border border-[#b5dec2]/18 bg-[#b5dec2]/[0.05] px-3 py-2 text-xs text-[var(--text-muted)]">
                            This concern already has an accepted edit on the resume. If you undo that change, it will show up as unresolved again.
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {resolvedTarget && onPreviewConcernTarget && (
                            <button
                              type="button"
                              onClick={() => onPreviewConcernTarget(concern)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#afc4ff]/20 bg-[#afc4ff]/10 px-3 py-2 text-[13px] font-medium text-[#afc4ff] transition-colors hover:bg-[#afc4ff]/20"
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
                              {concern.requires_candidate_input
                                ? 'Review Suggested Fix on Resume'
                                : 'Review Edit on Resume'}
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
            title="Benchmark Comparison"
            description="Benchmark gaps should not override solid job fit, but they do show where the candidate may look less competitive against stronger peers."
          />
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="support-callout border border-[#b5dec2]/15 bg-[#b5dec2]/[0.04] p-4">
              <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#b5dec2]">
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

            <div className="rounded-xl border border-[#f0d99f]/15 bg-[#f0d99f]/[0.04] p-4">
              <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#f0d99f]">
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

            <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
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
              title="Improvement Summary"
              description="These are the highest-value moves left before export."
            />
            <TextList items={result.improvement_summary} />
          </section>
        )}
      </div>
    </GlassCard>
  );
}
