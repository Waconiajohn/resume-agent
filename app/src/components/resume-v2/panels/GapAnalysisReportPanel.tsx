/**
 * GapAnalysisReportPanel — Coaching panel with importance-based grouping.
 *
 * Design:
 * - Grouped by importance (Must Have → Important → Nice to Have)
 * - Within each group: gaps first, then partial, then strong
 * - Tier-specific colored accents (green/blue/red)
 * - Structured importance markers from shared-badges
 * - Benchmark context inline when available
 * - JD evidence as subtitle under requirement name
 * - Questions toggle for BOTH partial and gap tiers
 * - Post-Apply "ticked off" state with card collapse
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ChevronRight, Eye, Sparkles, TrendingUp, MessageSquare, MessagesSquare } from 'lucide-react';
import type {
  JobIntelligence,
  PositioningAssessment,
  PositioningAssessmentEntry,
  GapAnalysis,
  GapCoachingCard,
  GapChatTargetInput,
  RequirementCoverageBreakdown,
  RequirementSource,
  ResumeDraft,
  RequirementGap,
  GapStrategy,
  PreScores,
  BenchmarkCandidate,
} from '@/types/resume-v2';
import type { EditAction, EditContext } from '@/hooks/useInlineEdit';
import {
  tokenize as sharedTokenize,
  normalizeRequirement,
  findBulletForRequirement,
  buildEditContext,
  buildCoachingLookup,
  findBenchmarkContext,
} from '../utils/coaching-actions';
import { canonicalRequirementSignals } from '@/lib/resume-requirement-signals';
import { REPORT_COLORS, tierColor, tierBg, tierBorder, classificationToTier as baseClassificationToTier, type Tier } from './report-colors';
import { StatusBadge, importanceStyle, importanceLabel } from '../cards/shared-badges';
import { GapChatThread } from './GapChatThread';
import type { GapChatHook } from '@/hooks/useGapChat';
import type { GapChatContext } from '@/types/resume-v2';

// ─── Props ────────────────────────────────────────────────────────────────────

interface GapAnalysisReportPanelProps {
  jobIntelligence: JobIntelligence;
  positioningAssessment: PositioningAssessment | null;
  gapAnalysis: GapAnalysis;
  benchmarkCandidate?: BenchmarkCandidate | null;
  gapCoachingCards?: GapCoachingCard[] | null;
  activeRequirements: string[];
  onRequirementClick: (requirement: string) => void;
  onRequestEdit?: (selectedText: string, section: string, action: EditAction, customInstruction?: string, editContext?: EditContext) => void;
  currentResume?: ResumeDraft | null;
  isEditing?: boolean;
  preScores?: PreScores | null;
  /** Per-item coaching chat hook — enables conversational coaching on gap items */
  gapChat?: GapChatHook | null;
  /** Builds context for the gap chat endpoint */
  buildChatContext?: (target: string | GapChatTargetInput) => GapChatContext;
}

// ─── Merged requirement type ─────────────────────────────────────────────────

interface MergedRequirement {
  requirement: string;
  source?: RequirementSource;
  importance: 'must_have' | 'important' | 'nice_to_have';
  tier: Tier;
  evidence: string[];
  evidenceFromJd?: string;
  sourceEvidence?: string;
  benchmarkContext?: string;
  strategy?: GapStrategy;
  coachingPolicy?: GapStrategy['coaching_policy'];
  aiReasoning?: string;
  interviewQuestions?: Array<{ question: string; rationale: string; looking_for: string }>;
  inferredMetric?: string;
  inferenceRationale?: string;
  resumeStatus?: 'strong' | 'repositioned' | 'gap';
  addressedBy?: Array<{ section: string; bullet_text: string }>;
  strategyUsed?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const IMPORTANCE_ORDER: Array<'must_have' | 'important' | 'nice_to_have'> = [
  'must_have',
  'important',
  'nice_to_have',
];

const TIER_SORT_ORDER: Record<Tier, number> = { gap: 0, partial: 1, strong: 2 };

const TIER_CONFIG: Record<Tier, { label: string; icon: string }> = {
  strong: { label: 'Already Covered', icon: '\u2713' },
  partial: { label: 'Needs More Evidence', icon: '\u2192' },
  gap: { label: 'Not Addressed', icon: '\u2717' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fuzzyLookup<T>(key: string, map: Map<string, T>): T | undefined {
  const exact = map.get(key);
  if (exact) return exact;

  const keyTokens = sharedTokenize(key);
  if (keyTokens.length === 0) return undefined;

  let best: T | undefined;
  let bestOverlap = 0;

  for (const [mapKey, value] of map) {
    const mapTokens = sharedTokenize(mapKey);
    const overlap = keyTokens.filter((t) => mapTokens.includes(t)).length;
    const score = overlap / Math.max(keyTokens.length, mapTokens.length);
    if (overlap >= 2 && score > 0.5 && overlap > bestOverlap) {
      bestOverlap = overlap;
      best = value;
    }
  }

  return best;
}

function classificationToTier(classification: string, assessmentStatus?: string): Tier {
  // PositioningAssessment status takes priority when present (post-pipeline context)
  if (assessmentStatus === 'strong') return 'strong';
  if (assessmentStatus === 'repositioned') return 'partial';
  if (assessmentStatus === 'gap') return 'gap';
  // Fall back to canonical GapClassification → Tier mapping
  return baseClassificationToTier(classification as 'strong' | 'partial' | 'missing');
}

function tierStatusLabel(tier: Tier): 'strong' | 'repositioned' | 'gap' {
  if (tier === 'strong') return 'strong';
  if (tier === 'partial') return 'repositioned';
  return 'gap';
}

function coachingQuestions(req: MergedRequirement): Array<{ question: string; rationale: string; looking_for: string }> {
  if (req.coachingPolicy?.clarifyingQuestion) {
    return [{
      question: req.coachingPolicy.clarifyingQuestion,
      rationale: req.coachingPolicy.rationale ?? '',
      looking_for: req.coachingPolicy.lookingFor ?? '',
    }];
  }

  if (req.interviewQuestions && req.interviewQuestions.length > 0) {
    return req.interviewQuestions;
  }

  return [];
}

// ─── Summary Header ──────────────────────────────────────────────────────────

function SummaryHeader({
  importanceCounts,
  total,
  strengthSummary,
  roleTitle,
  companyName,
  preScoreAts,
  scoreBreakdown,
  strongCount,
  partialCount,
  gapCount,
}: {
  importanceCounts: Record<string, { total: number; addressed: number }>;
  total: number;
  strengthSummary: string;
  roleTitle?: string;
  companyName?: string;
  preScoreAts?: number | null;
  scoreBreakdown?: {
    job_description: RequirementCoverageBreakdown;
    benchmark: RequirementCoverageBreakdown;
  } | null;
  strongCount: number;
  partialCount: number;
  gapCount: number;
}) {
  const addressedCount = strongCount + partialCount;
  const addressedPct = total > 0 ? Math.round((addressedCount / total) * 100) : 0;
  const jdCoverage = scoreBreakdown?.job_description?.coverage_score ?? addressedPct;
  const benchmarkCoverage = scoreBreakdown?.benchmark?.coverage_score ?? null;

  return (
    <div className="px-5 pt-5 pb-4 space-y-4 shrink-0 border-b border-[var(--line-soft)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: REPORT_COLORS.heading, lineHeight: 1.3 }}>
            Requirement Coverage
          </h2>
          {roleTitle && (
            <p style={{ fontSize: 13, color: REPORT_COLORS.secondary, marginTop: 2 }}>
              {roleTitle}{companyName ? ` \u2014 ${companyName}` : ''}
            </p>
          )}
        </div>
        {preScoreAts != null && (
          <div className="text-right shrink-0">
            <span style={{ fontSize: 20, fontWeight: 700, color: REPORT_COLORS.heading }}>
              {preScoreAts}% <span style={{ fontSize: 14, fontWeight: 400, color: REPORT_COLORS.tertiary }}>{'\u2192'}</span> {jdCoverage}%
            </span>
          </div>
        )}
      </div>

      {/* Progress bar — colored by tier */}
      {total > 0 && (
        <div className="h-2 w-full rounded-full overflow-hidden flex" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
          {strongCount > 0 && (
            <div className="h-full transition-all duration-500" style={{ width: `${(strongCount / total) * 100}%`, backgroundColor: 'rgba(181,222,194,0.40)' }} />
          )}
          {partialCount > 0 && (
            <div className="h-full transition-all duration-500" style={{ width: `${(partialCount / total) * 100}%`, backgroundColor: 'rgba(175,196,255,0.40)' }} />
          )}
          {gapCount > 0 && (
            <div className="h-full transition-all duration-500" style={{ width: `${(gapCount / total) * 100}%`, backgroundColor: 'rgba(240,184,184,0.30)' }} />
          )}
        </div>
      )}

      {strengthSummary && (
        <p style={{ fontSize: 14, lineHeight: 1.65, color: REPORT_COLORS.body }}>
          {strengthSummary}
        </p>
      )}

      <div
        className="rounded-xl px-4 py-3 space-y-3"
        style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <p style={{ fontSize: 13, lineHeight: 1.6, color: REPORT_COLORS.body }}>
          We check every job description requirement first, then compare you to a benchmark candidate so weak postings do not produce weak resumes.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div
            className="rounded-lg px-3 py-2"
            style={{ backgroundColor: 'rgba(175,196,255,0.08)', border: '1px solid rgba(175,196,255,0.14)' }}
          >
            <p style={{ fontSize: 11, color: REPORT_COLORS.tertiary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Job Description Fit
            </p>
            <p style={{ fontSize: 13, color: REPORT_COLORS.heading, marginTop: 4 }}>
              {scoreBreakdown?.job_description.addressed ?? addressedCount}/{scoreBreakdown?.job_description.total ?? total} addressed ({jdCoverage}%)
            </p>
            <p style={{ fontSize: 12, color: REPORT_COLORS.secondary, marginTop: 4 }}>
              This is the ATS-critical score.
            </p>
          </div>
          <div
            className="rounded-lg px-3 py-2"
            style={{ backgroundColor: 'rgba(240,217,159,0.08)', border: '1px solid rgba(240,217,159,0.14)' }}
          >
            <p style={{ fontSize: 11, color: REPORT_COLORS.tertiary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Benchmark Alignment
            </p>
            <p style={{ fontSize: 13, color: REPORT_COLORS.heading, marginTop: 4 }}>
              {scoreBreakdown?.benchmark.addressed ?? 0}/{scoreBreakdown?.benchmark.total ?? 0} addressed ({benchmarkCoverage ?? 0}%)
            </p>
            <p style={{ fontSize: 12, color: REPORT_COLORS.secondary, marginTop: 4 }}>
              This shows where we can strengthen positioning.
            </p>
          </div>
        </div>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: REPORT_COLORS.tertiary }}>
          Green means the resume already supports the requirement. Blue means it is only partly covered or still needs stronger proof. Red means it is not addressed yet.
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.6, color: REPORT_COLORS.tertiary }}>
          1. Confirm the green items. 2. For blue or red items, add detail or coach the AI. 3. Nothing counts as addressed until you approve the edit on the resume.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <span style={{ fontSize: 13, color: REPORT_COLORS.secondary }}>
            {addressedCount} of {total} addressed
          </span>
          <span style={{ fontSize: 11, color: REPORT_COLORS.tertiary }}>{'\u00b7'}</span>
          {IMPORTANCE_ORDER.map((imp) => {
            const counts = importanceCounts[imp];
            if (!counts || counts.total === 0) return null;
            return (
              <span key={imp} style={{ fontSize: 12, color: REPORT_COLORS.tertiary }}>
                {importanceLabel(imp)}: {counts.addressed}/{counts.total}
              </span>
            );
          })}
          {!preScoreAts && total > 0 && (
            <>
              <span style={{ fontSize: 11, color: REPORT_COLORS.tertiary }}>{'\u00b7'}</span>
              <span style={{ fontSize: 12, color: REPORT_COLORS.tertiary }}>
                Coverage: {jdCoverage}%
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Importance Group Header ─────────────────────────────────────────────────

function ImportanceGroupHeader({ importance, count }: { importance: string; count: number }) {
  const style = importanceStyle(importance);

  return (
    <div className="flex items-center gap-2 px-5 py-3 mt-2" style={{ borderBottom: `1px solid ${style.borderColor}` }}>
      <span
        className="rounded-md px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.12em] shrink-0"
        style={style}
        data-testid="importance-pill"
      >
        {importanceLabel(importance)}
      </span>
      <div className="flex-1 h-px" style={{ backgroundColor: style.borderColor }} />
      <span className="text-[12px] tabular-nums" style={{ color: REPORT_COLORS.tertiary }}>
        {count}
      </span>
    </div>
  );
}

// ─── Requirement Card (mapping-first layout) ─────────────────────────────────

function RequirementCard({
  req,
  isActive,
  onRequirementClick,
  onRequestEdit,
  currentResume,
  positioningAssessment,
  isEditing,
  gapChat,
  buildChatContext,
}: {
  req: MergedRequirement;
  isActive: boolean;
  onRequirementClick: (requirement: string) => void;
  onRequestEdit?: GapAnalysisReportPanelProps['onRequestEdit'];
  currentResume?: ResumeDraft | null;
  positioningAssessment: PositioningAssessment | null;
  isEditing?: boolean;
  gapChat?: GapChatHook | null;
  buildChatContext?: (target: string | GapChatTargetInput) => GapChatContext;
}) {
  const [showContext, setShowContext] = useState(false);
  const [contextText, setContextText] = useState('');
  const [questionsExpanded, setQuestionsExpanded] = useState(false);
  const [showChat, setShowChat] = useState(false);

  // Chat state for this item — computed once, used in button gate + thread render
  const chatState = gapChat?.getItemState(req.requirement);
  const chatResolved = chatState?.resolvedLanguage != null;
  const chatCtx = showChat && buildChatContext ? buildChatContext(req.requirement) : undefined;

  const color = tierColor(req.tier);
  const config = TIER_CONFIG[req.tier];
  const canAct = onRequestEdit && currentResume && !isEditing;
  const resolveEditTarget = useCallback(() => {
    const mapped = findBulletForRequirement(req.requirement, positioningAssessment, currentResume!);
    if (mapped) return mapped;

    const firstExperience = currentResume?.professional_experience[0];
    const firstBullet = firstExperience?.bullets[0];
    if (firstExperience && firstBullet) {
      return {
        text: firstBullet.text,
        section: `Professional Experience - ${firstExperience.company}`,
      };
    }

    return null;
  }, [currentResume, positioningAssessment, req.requirement]);
  const hasMapping = req.addressedBy && req.addressedBy.length > 0;
  const statusLabel = req.tier === 'strong'
    ? 'Already Covered'
    : req.tier === 'partial'
      ? hasMapping ? 'Partially Covered' : 'Needs More Evidence'
      : 'Not Addressed';
  const policyGuidance = req.coachingPolicy?.proofActionRequiresInput;

  const handleApplyLanguage = useCallback(() => {
    if (!canAct || !req.strategy?.positioning) return;
    const target = resolveEditTarget();
    if (!target) return;
    const label = req.tier === 'gap' ? 'safe resume language' : 'positioning';
    onRequestEdit!(
      target.text,
      target.section,
      'custom',
      `Naturally weave this ${label} into the text: "${req.strategy.positioning}". This addresses the job requirement: "${req.requirement}".`,
      buildEditContext(req.requirement, req.evidence, req.strategy.positioning),
    );
  }, [canAct, onRequestEdit, req, resolveEditTarget]);

  const handleStrengthen = useCallback(() => {
    if (!canAct) return;
    const target = resolveEditTarget();
    if (!target) return;
    onRequestEdit!(target.text, target.section, 'strengthen', undefined, buildEditContext(req.requirement, req.evidence, req.strategy?.positioning));
  }, [canAct, onRequestEdit, req, resolveEditTarget]);

  const handleSubmitContext = useCallback(() => {
    if (!canAct || !contextText.trim()) return;
    const target = resolveEditTarget();
    if (!target) return;
    onRequestEdit!(
      target.text,
      target.section,
      'custom',
      `The user provided this additional context about their experience for the requirement "${req.requirement}": "${contextText.trim()}". Rewrite this bullet to naturally incorporate this context.`,
      buildEditContext(req.requirement, req.evidence, req.strategy?.positioning),
    );
    setContextText('');
    setShowContext(false);
  }, [canAct, contextText, onRequestEdit, req, resolveEditTarget]);

  const handleViewInResume = useCallback(() => {
    onRequirementClick(req.requirement);
  }, [req.requirement, onRequirementClick]);

  const questions = coachingQuestions(req);
  const metric = req.inferredMetric ?? req.strategy?.inferred_metric;
  const metricRationale = req.inferenceRationale ?? req.strategy?.inference_rationale;

  const borderLeft = `3px solid ${tierBorder(req.tier)}`;
  const borderOther = isActive ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.06)';

  return (
    <div
      data-testid="requirement-card"
      data-requirement={req.requirement}
      data-tier={req.tier}
      role="article"
      tabIndex={0}
      aria-label={`${config.label}: ${req.requirement}`}
      aria-current={isActive ? 'true' : undefined}
      className="rounded-xl overflow-hidden transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRequirementClick(req.requirement);
        }
      }}
      style={{
        backgroundColor: tierBg(req.tier),
        borderLeft,
        borderTop: borderOther,
        borderRight: borderOther,
        borderBottom: borderOther,
        boxShadow: isActive ? '0 0 0 1px rgba(255,255,255,0.12)' : undefined,
      }}
    >
      <div className="px-4 py-4 space-y-3">
        {/* Header: requirement name + source */}
        <div className="flex items-start gap-2.5">
          <span style={{ color, fontSize: 15, marginTop: 2, flexShrink: 0 }}>
            {config.icon}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 flex-wrap">
              <span style={{ fontSize: 15, fontWeight: 500, color: REPORT_COLORS.heading, lineHeight: 1.5, flex: 1 }}>
                {req.requirement}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              {req.source && (
                <>
                  <span style={{ fontSize: 11, color: REPORT_COLORS.tertiary }}>
                    Source: {req.source === 'job_description' ? 'Job description' : 'Benchmark standard'}
                  </span>
                  <span style={{ fontSize: 11, color: REPORT_COLORS.tertiary }}>{'\u00b7'}</span>
                </>
              )}
              <span style={{ fontSize: 11, color: REPORT_COLORS.tertiary }}>
                {importanceLabel(req.importance)}
              </span>
            </div>
            {/* JD evidence subtitle */}
            {req.evidenceFromJd && (
              <p style={{ fontSize: 13, color: REPORT_COLORS.tertiary, marginTop: 2, lineHeight: 1.4 }} data-testid="jd-evidence">
                &ldquo;{req.evidenceFromJd}&rdquo;
              </p>
            )}
            {!req.evidenceFromJd && req.sourceEvidence && (
              <p style={{ fontSize: 13, color: REPORT_COLORS.tertiary, marginTop: 2, lineHeight: 1.4 }}>
                {req.sourceEvidence}
              </p>
            )}
          </div>
        </div>

        {/* Status badge */}
        <div>
          <StatusBadge status={tierStatusLabel(req.tier)} labelOverride={statusLabel} />
        </div>

        {/* Benchmark context */}
        {req.benchmarkContext && (
          <div
            className="rounded-lg px-3 py-2"
            style={{
              borderLeft: `2px solid ${tierBorder(req.tier)}`,
              backgroundColor: 'rgba(255,255,255,0.02)',
            }}
            data-testid="benchmark-context"
          >
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.05em', color: REPORT_COLORS.tertiary, textTransform: 'uppercase' }}>
              Benchmark
            </span>
            <p style={{ fontSize: 13, color: REPORT_COLORS.secondary, marginTop: 2, lineHeight: 1.5 }}>
              {req.benchmarkContext}
            </p>
          </div>
        )}

        {/* MAPPING — where it's addressed in the resume */}
        {hasMapping ? (
          <div className="space-y-1.5">
            <p style={{ fontSize: 12, color: REPORT_COLORS.secondary }}>
              Already supported in your resume:
            </p>
            {req.addressedBy!.map((entry, i) => (
              <div key={`${entry.section}-${i}`} className="flex items-start gap-2">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: REPORT_COLORS.secondary }}>
                    {req.resumeStatus === 'repositioned' ? 'Partially covered in ' : ''}{entry.section}
                  </span>
                  <p style={{ fontSize: 14, color: REPORT_COLORS.body, marginTop: 2, lineHeight: 1.5 }}>
                    &ldquo;{entry.bullet_text.length > 140 ? entry.bullet_text.slice(0, 140).trimEnd() + '...' : entry.bullet_text}&rdquo;
                  </p>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={handleViewInResume}
              className="inline-flex items-center gap-1 hover:opacity-80 transition-opacity"
              style={{ fontSize: 13, fontWeight: 500, color: REPORT_COLORS.secondary }}
              data-testid="view-in-resume"
            >
              <Eye className="h-3.5 w-3.5" />
              View in Resume
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span style={{ color: tierColor('gap'), fontSize: 14 }}>{'\u2717'}</span>
            <span style={{ fontSize: 14, color: tierColor('gap') }}>
              Not yet proven in your resume
            </span>
          </div>
        )}

        {/* AI coaching as prose */}
        {req.aiReasoning && (
          <p style={{ fontSize: 14, lineHeight: 1.7, color: REPORT_COLORS.body }}>
            {req.aiReasoning}
            {metric && (
              <span style={{ color: REPORT_COLORS.secondary }}>
                {' '}{metric}{metricRationale ? ` \u2014 ${metricRationale}` : ''}
              </span>
            )}
          </p>
        )}

        {/* Inferred metric standalone */}
        {!req.aiReasoning && metric && (
          <p style={{ fontSize: 14, color: REPORT_COLORS.secondary }}>
            {metric}{metricRationale ? ` \u2014 ${metricRationale}` : ''}
          </p>
        )}

        {/* Evidence chips for strong matches without AI coaching */}
        {!req.aiReasoning && req.tier === 'strong' && req.evidence.length > 0 && (
          <div className="flex flex-wrap gap-1.5" data-testid="evidence-chips">
            {req.evidence.map((e, i) => (
              <span
                key={i}
                className="rounded-md px-2.5 py-1 text-xs"
                style={{
                  color: REPORT_COLORS.secondary,
                  backgroundColor: 'rgba(181,222,194,0.08)',
                  border: '1px solid rgba(181,222,194,0.15)',
                }}
              >
                {e}
              </span>
            ))}
          </div>
        )}

        {req.tier !== 'strong' && (
          <div
            className="rounded-lg px-3.5 py-3"
            style={{ backgroundColor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p style={{ fontSize: 13, lineHeight: 1.6, color: REPORT_COLORS.body }}>
              {policyGuidance ?? (
                req.tier === 'partial'
                  ? 'You are at least partly qualified here. Tighten the wording or add missing detail before you count this as covered.'
                  : 'This requirement still needs proof. Add real detail, brainstorm adjacent experience, or leave it marked as only partially addressed.'
              )}
            </p>
          </div>
        )}

        {/* Suggested language block with Apply button ON it */}
        {req.strategy?.positioning && (
          <div
            className="rounded-lg px-4 py-3 relative"
            style={{
              backgroundColor: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
          >
            {req.tier === 'gap' && (
              <p style={{ fontSize: 13, color: REPORT_COLORS.tertiary, marginBottom: 6 }}>
                Use this only if it is true and you can support it:
              </p>
            )}
            {req.tier !== 'gap' && (
              <p style={{ fontSize: 13, color: REPORT_COLORS.tertiary, marginBottom: 6 }}>
                Suggested resume wording:
              </p>
            )}
            <p style={{ fontSize: 14, lineHeight: 1.65, color: REPORT_COLORS.heading }}>
              &ldquo;{req.strategy.positioning}&rdquo;
            </p>
            {canAct && (
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={handleApplyLanguage}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors hover:opacity-80"
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: REPORT_COLORS.heading,
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                  }}
                  data-testid="action-apply-language"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Review Edit
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Questions toggle — for partial AND gap tiers */}
        {questions.length > 0 && (req.tier === 'gap' || req.tier === 'partial') && (
          <div>
            <button
              type="button"
              onClick={() => setQuestionsExpanded(!questionsExpanded)}
              className="inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity"
              style={{ fontSize: 13, color: REPORT_COLORS.secondary }}
              aria-expanded={questionsExpanded}
              data-testid="toggle-questions"
            >
              <ChevronRight
                className="h-3 w-3 transition-transform duration-200"
                style={{ transform: questionsExpanded ? 'rotate(90deg)' : 'none' }}
              />
              {questionsExpanded
                ? 'Hide questions'
                : `${questions.length} question${questions.length !== 1 ? 's' : ''} to ${req.tier === 'gap' ? 'uncover evidence' : 'dig deeper'}`}
            </button>
            {questionsExpanded && (
              <div className="mt-2 space-y-2 ml-5">
                {questions.map((q, i) => (
                  <div
                    key={`q-${i}`}
                    className="rounded-lg px-3.5 py-2.5"
                    style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <p style={{ fontSize: 14, fontWeight: 500, color: REPORT_COLORS.heading, lineHeight: 1.5 }}>
                      {q.question}
                    </p>
                    {q.looking_for && (
                      <p style={{ fontSize: 13, color: REPORT_COLORS.tertiary, marginTop: 2 }}>
                        Looking for: {q.looking_for}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Context input */}
        {showContext && (
          <div className="space-y-2">
            <textarea
              value={contextText}
              onChange={(e) => setContextText(e.target.value)}
              placeholder={policyGuidance ?? 'Add one concrete detail that makes this requirement believable, such as the scope, environment, or result involved.'}
              rows={3}
              className="w-full rounded-lg px-3.5 py-2.5 resize-none focus:outline-none transition-colors"
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: REPORT_COLORS.heading,
                backgroundColor: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
              aria-label={`Additional context for: ${req.requirement}`}
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!contextText.trim() || isEditing}
                onClick={handleSubmitContext}
                className="rounded-lg px-3 py-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: REPORT_COLORS.heading,
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
                data-testid="submit-context"
              >
                Submit &amp; Rewrite
              </button>
              <button
                type="button"
                onClick={() => { setShowContext(false); setContextText(''); }}
                style={{ fontSize: 13, color: REPORT_COLORS.tertiary }}
                className="px-2 hover:opacity-80 transition-opacity"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {canAct && (
          <div className="flex items-center gap-2 flex-wrap" data-testid="card-actions">
            {req.tier === 'strong' && (
              <button
                type="button"
                onClick={handleStrengthen}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors hover:opacity-80"
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: REPORT_COLORS.secondary,
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
                data-testid="action-strengthen"
              >
                <TrendingUp className="h-3.5 w-3.5" />
                Refine Wording
              </button>
            )}
            {req.tier === 'partial' && !req.strategy?.positioning && (
              <button
                type="button"
                onClick={handleStrengthen}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors hover:opacity-80"
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: REPORT_COLORS.secondary,
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
                data-testid="action-strengthen"
              >
                <TrendingUp className="h-3.5 w-3.5" />
                Refine Wording
              </button>
            )}
            {!showContext && req.tier !== 'strong' && (
              <button
                type="button"
                onClick={() => setShowContext(true)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors hover:opacity-80"
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: REPORT_COLORS.secondary,
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
                data-testid="action-add-context"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Share Details
              </button>
            )}
            {gapChat && buildChatContext && req.tier !== 'strong' && !showChat && !chatResolved && (
              <button
                type="button"
                onClick={() => setShowChat(true)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors hover:opacity-80"
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--link)',
                  backgroundColor: 'var(--badge-blue-bg)',
                  border: '1px solid color-mix(in srgb, var(--link) 15%, transparent)',
                }}
                data-testid="action-coach-me"
              >
                <MessagesSquare className="h-3.5 w-3.5" />
                Ask Another Question
              </button>
            )}
          </div>
        )}

        {/* Gap coaching chat thread */}
        {showChat && gapChat && buildChatContext && req.tier !== 'strong' && (
          <GapChatThread
            requirement={req.requirement}
            classification={req.tier === 'partial' ? 'partial' : 'missing'}
            messages={chatState?.messages ?? []}
            isLoading={chatState?.isLoading ?? false}
            error={chatState?.error ?? null}
            resolvedLanguage={chatState?.resolvedLanguage ?? null}
            onSendMessage={gapChat.sendMessage}
            onAcceptLanguage={(requirement, language, candidateInputUsed) => {
              // Find a target bullet before accepting — prevent silent no-op
              if (!canAct) return;
              const target = findBulletForRequirement(req.requirement, positioningAssessment, currentResume!);
              // Fallback: first experience bullet if no direct mapping exists
              const fallbackTarget = !target && currentResume?.professional_experience[0]?.bullets[0]
                ? { text: currentResume.professional_experience[0].bullets[0].text, section: `Professional Experience - ${currentResume.professional_experience[0].company}` }
                : null;
              const editTarget = target ?? fallbackTarget;
              if (!editTarget) return; // No resume content to edit — don't fake "Applied"

              onRequestEdit!(
                editTarget.text,
                editTarget.section,
                'custom',
                `Naturally integrate this coached resume language into the text: "${language}". This addresses the job requirement: "${req.requirement}".`,
                buildEditContext(req.requirement, req.evidence, language, {
                  origin: 'gap',
                  candidateInputUsed,
                  scoreDomain: 'job_description',
                }),
              );
            }}
            context={chatCtx!}
            isEditing={isEditing}
            onSkip={() => setShowChat(false)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function GapAnalysisReportPanel({
  jobIntelligence,
  positioningAssessment,
  gapAnalysis,
  benchmarkCandidate,
  gapCoachingCards,
  activeRequirements,
  onRequirementClick,
  onRequestEdit,
  currentResume,
  isEditing,
  preScores,
  gapChat,
  buildChatContext,
}: GapAnalysisReportPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const coachingLookup = useMemo(
    () => buildCoachingLookup(gapCoachingCards ?? null),
    [gapCoachingCards],
  );

  const assessmentMap = useMemo(() => {
    const map = new Map<string, PositioningAssessmentEntry>();
    if (!positioningAssessment?.requirement_map) return map;
    for (const entry of positioningAssessment.requirement_map) {
      map.set(entry.requirement.trim().toLowerCase(), entry);
    }
    return map;
  }, [positioningAssessment]);

  const gapReqLookup = useMemo(() => {
    const map = new Map<string, RequirementGap>();
    for (const req of gapAnalysis.requirements) {
      map.set(normalizeRequirement(req.requirement), req);
    }
    return map;
  }, [gapAnalysis]);

  const liveResumeMap = useMemo(() => {
    const map = new Map<string, Array<{ section: string; bullet_text: string }>>();
    if (!currentResume) return map;

    const addEntry = (requirement: string, entry: { section: string; bullet_text: string }) => {
      const key = normalizeRequirement(requirement);
      const existing = map.get(key) ?? [];
      if (!existing.some((item) => item.section === entry.section && item.bullet_text === entry.bullet_text)) {
        map.set(key, [...existing, entry]);
      }
    };

    currentResume.selected_accomplishments.forEach((accomplishment) => {
      canonicalRequirementSignals(
        accomplishment.primary_target_requirement,
        accomplishment.addresses_requirements,
      ).forEach((requirement) => {
        addEntry(requirement, {
          section: 'Selected Accomplishments',
          bullet_text: accomplishment.content,
        });
      });
    });

    currentResume.professional_experience.forEach((experience) => {
      experience.bullets.forEach((bullet) => {
        canonicalRequirementSignals(
          bullet.primary_target_requirement,
          bullet.addresses_requirements,
        ).forEach((requirement) => {
          addEntry(requirement, {
            section: `${experience.title} at ${experience.company}`,
            bullet_text: bullet.text,
          });
        });
      });
    });

    return map;
  }, [currentResume]);

  const merged = useMemo(() => {
    const seen = new Set<string>();
    const result: MergedRequirement[] = [];

    for (const comp of jobIntelligence.core_competencies) {
      const normalizedKey = normalizeRequirement(comp.competency);
      seen.add(normalizedKey);

      const gapReq = gapReqLookup.get(normalizedKey);
      const coaching = coachingLookup.get(normalizedKey)?.card;
      const rawKey = comp.competency.trim().toLowerCase();
      const assessment = assessmentMap.get(rawKey) ?? fuzzyLookup(rawKey, assessmentMap);
      const liveAddressedBy = liveResumeMap.get(normalizedKey) ?? fuzzyLookup(normalizedKey, liveResumeMap);
      const effectiveStatus = assessment?.status ?? (liveAddressedBy?.length ? (gapReq?.classification === 'strong' ? 'strong' : 'repositioned') : undefined);

      const tier = classificationToTier(
        gapReq?.classification ?? 'missing',
        effectiveStatus,
      );

      const benchCtx = benchmarkCandidate
        ? findBenchmarkContext(comp.competency, benchmarkCandidate.expected_achievements)
        : null;

      result.push({
        requirement: comp.competency,
        source: 'job_description',
        importance: comp.importance,
        tier,
        evidence: coaching?.evidence_found ?? gapReq?.evidence ?? [],
        evidenceFromJd: comp.evidence_from_jd || undefined,
        sourceEvidence: gapReq?.source_evidence ?? comp.evidence_from_jd ?? undefined,
        benchmarkContext: benchCtx ?? undefined,
        strategy: gapReq?.strategy,
        coachingPolicy: coaching?.coaching_policy ?? gapReq?.strategy?.coaching_policy,
        aiReasoning: coaching?.ai_reasoning ?? gapReq?.strategy?.ai_reasoning,
        interviewQuestions: coaching?.interview_questions ?? gapReq?.strategy?.interview_questions,
        inferredMetric: coaching?.inferred_metric ?? gapReq?.strategy?.inferred_metric,
        inferenceRationale: coaching?.inference_rationale ?? gapReq?.strategy?.inference_rationale,
        resumeStatus: effectiveStatus,
        addressedBy: mergeAddressedBy(assessment?.addressed_by, liveAddressedBy),
        strategyUsed: assessment?.strategy_used,
      });
    }

    // Include gap-analysis-only requirements (no classification filter — show all)
    for (const req of gapAnalysis.requirements) {
      const normalizedKey = normalizeRequirement(req.requirement);
      if (seen.has(normalizedKey)) continue;

      const coaching = coachingLookup.get(normalizedKey)?.card;
      const assessment = assessmentMap.get(normalizedKey) ?? fuzzyLookup(normalizedKey, assessmentMap);
      const liveAddressedBy = liveResumeMap.get(normalizedKey) ?? fuzzyLookup(normalizedKey, liveResumeMap);
      const effectiveStatus = assessment?.status ?? (liveAddressedBy?.length ? (req.classification === 'strong' ? 'strong' : 'repositioned') : undefined);
      const benchCtx = benchmarkCandidate
        ? findBenchmarkContext(req.requirement, benchmarkCandidate.expected_achievements)
        : null;

      result.push({
        requirement: req.requirement,
        source: req.source,
        importance: req.importance,
        tier: classificationToTier(req.classification, effectiveStatus),
        evidence: coaching?.evidence_found ?? req.evidence ?? [],
        sourceEvidence: req.source_evidence,
        benchmarkContext: benchCtx ?? undefined,
        strategy: req.strategy,
        coachingPolicy: coaching?.coaching_policy ?? req.strategy?.coaching_policy,
        aiReasoning: coaching?.ai_reasoning ?? req.strategy?.ai_reasoning,
        interviewQuestions: coaching?.interview_questions ?? req.strategy?.interview_questions,
        inferredMetric: coaching?.inferred_metric ?? req.strategy?.inferred_metric,
        inferenceRationale: coaching?.inference_rationale ?? req.strategy?.inference_rationale,
        resumeStatus: effectiveStatus,
        addressedBy: mergeAddressedBy(assessment?.addressed_by, liveAddressedBy),
        strategyUsed: assessment?.strategy_used,
      });
    }

    return result;
  }, [jobIntelligence, gapAnalysis, coachingLookup, assessmentMap, gapReqLookup, benchmarkCandidate, liveResumeMap]);

  // Group by importance, sort gaps first within each group
  const groupedByImportance = useMemo(() => {
    const groups: Record<string, MergedRequirement[]> = {
      must_have: [],
      important: [],
      nice_to_have: [],
    };

    for (const req of merged) {
      const bucket = groups[req.importance] ?? groups.nice_to_have;
      bucket.push(req);
    }

    // Sort within each group: gaps first, partials second, strongs last
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => TIER_SORT_ORDER[a.tier] - TIER_SORT_ORDER[b.tier]);
    }

    return groups;
  }, [merged]);

  // Tier counts for progress bar
  const tierCounts = useMemo(() => {
    let strong = 0, partial = 0, gap = 0;
    for (const req of merged) {
      if (req.tier === 'strong') strong++;
      else if (req.tier === 'partial') partial++;
      else gap++;
    }
    return { strong, partial, gap };
  }, [merged]);

  // Importance counts for header breakdown
  const importanceCounts = useMemo(() => {
    const counts: Record<string, { total: number; addressed: number }> = {};
    for (const req of merged) {
      if (!counts[req.importance]) counts[req.importance] = { total: 0, addressed: 0 };
      counts[req.importance].total++;
      if (req.tier === 'strong' || req.tier === 'partial') {
        counts[req.importance].addressed++;
      }
    }
    return counts;
  }, [merged]);

  const activeSet = useMemo(
    () => new Set(activeRequirements.map((r) => r.trim().toLowerCase())),
    [activeRequirements],
  );

  // Auto-scroll to active requirement
  useEffect(() => {
    if (activeRequirements.length === 0 || !containerRef.current) return;
    const activeKey = activeRequirements[0];
    const card = containerRef.current.querySelector(`[data-requirement="${CSS.escape(activeKey)}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeRequirements]);

  return (
    <div
      ref={containerRef}
      data-testid="gap-analysis-report"
      style={{
        background: 'rgba(10,12,20,0.85)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <SummaryHeader
        importanceCounts={importanceCounts}
        total={merged.length}
        strengthSummary={gapAnalysis.strength_summary}
        roleTitle={jobIntelligence.role_title}
        companyName={jobIntelligence.company_name}
        preScoreAts={preScores?.ats_match}
        scoreBreakdown={gapAnalysis.score_breakdown ?? null}
        strongCount={tierCounts.strong}
        partialCount={tierCounts.partial}
        gapCount={tierCounts.gap}
      />

      <div className="pb-6">
        {IMPORTANCE_ORDER.map((importance) => {
          const items = groupedByImportance[importance];
          if (!items || items.length === 0) return null;

          return (
            <section key={importance} data-testid={`importance-${importance}`} aria-label={importanceLabel(importance)}>
              <ImportanceGroupHeader importance={importance} count={items.length} />
              <div className="px-4 py-3 space-y-3">
                {items.map((req, idx) => {
                  return (
                    <RequirementCard
                      key={`${req.requirement}-${idx}`}
                      req={req}
                      isActive={activeSet.has(req.requirement.trim().toLowerCase())}
                      onRequirementClick={onRequirementClick}
                      onRequestEdit={onRequestEdit}
                      currentResume={currentResume}
                      positioningAssessment={positioningAssessment}
                      isEditing={isEditing}
                      gapChat={gapChat}
                      buildChatContext={buildChatContext}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function mergeAddressedBy(
  assessmentEntries?: Array<{ section: string; bullet_text: string }>,
  liveEntries?: Array<{ section: string; bullet_text: string }>,
): Array<{ section: string; bullet_text: string }> | undefined {
  const merged = [...(assessmentEntries ?? []), ...(liveEntries ?? [])];
  if (merged.length === 0) return undefined;

  const deduped: Array<{ section: string; bullet_text: string }> = [];
  for (const entry of merged) {
    if (!deduped.some((item) => item.section === entry.section && item.bullet_text === entry.bullet_text)) {
      deduped.push(entry);
    }
  }
  return deduped;
}
