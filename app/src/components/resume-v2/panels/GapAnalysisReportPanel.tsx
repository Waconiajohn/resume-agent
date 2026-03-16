/**
 * GapAnalysisReportPanel — Mapping-first coaching panel.
 *
 * Each requirement card shows WHERE it's addressed in the resume FIRST,
 * then conversational AI coaching, with one-click actions to apply changes.
 *
 * Design rules:
 * - Mapping (resume location + bullet text) is the first thing below the requirement name
 * - AI coaching reads as prose — no labeled sections
 * - Suggested language has Apply button ON the language block
 * - Importance shown as subtle lowercase text, no colored pills
 * - Only gaps get a color accent; strong/partial are neutral
 * - Questions behind a toggle, only for gaps
 */

import { useState, useMemo, useCallback } from 'react';
import { ChevronRight, Eye, Sparkles, TrendingUp, BarChart3, MessageSquare } from 'lucide-react';
import type {
  JobIntelligence,
  PositioningAssessment,
  PositioningAssessmentEntry,
  GapAnalysis,
  GapCoachingCard,
  ResumeDraft,
  RequirementGap,
  GapStrategy,
  PreScores,
} from '@/types/resume-v2';
import type { EditAction, EditContext } from '@/hooks/useInlineEdit';
import {
  normalizeRequirement,
  findBulletForRequirement,
  buildEditContext,
  buildCoachingLookup,
} from '../utils/coaching-actions';
import { REPORT_COLORS, tierColor, tierBg, tierBorder, type Tier } from './report-colors';

// ─── Props ────────────────────────────────────────────────────────────────────

interface GapAnalysisReportPanelProps {
  jobIntelligence: JobIntelligence;
  positioningAssessment: PositioningAssessment | null;
  gapAnalysis: GapAnalysis;
  gapCoachingCards?: GapCoachingCard[] | null;
  activeRequirements: string[];
  onRequirementClick: (requirement: string) => void;
  onRequestEdit?: (selectedText: string, section: string, action: EditAction, customInstruction?: string, editContext?: EditContext) => void;
  currentResume?: ResumeDraft | null;
  isEditing?: boolean;
  preScores?: PreScores | null;
}

// ─── Merged requirement type ─────────────────────────────────────────────────

interface MergedRequirement {
  requirement: string;
  importance: 'must_have' | 'important' | 'nice_to_have';
  tier: Tier;
  evidence: string[];
  strategy?: GapStrategy;
  aiReasoning?: string;
  interviewQuestions?: Array<{ question: string; rationale: string; looking_for: string }>;
  inferredMetric?: string;
  inferenceRationale?: string;
  resumeStatus?: 'strong' | 'repositioned' | 'gap';
  addressedBy?: Array<{ section: string; bullet_text: string }>;
  strategyUsed?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
}

function fuzzyLookup<T>(key: string, map: Map<string, T>): T | undefined {
  const exact = map.get(key);
  if (exact) return exact;

  const keyTokens = tokenize(key);
  if (keyTokens.length === 0) return undefined;

  let best: T | undefined;
  let bestOverlap = 0;

  for (const [mapKey, value] of map) {
    const mapTokens = tokenize(mapKey);
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
  if (assessmentStatus === 'strong') return 'strong';
  if (assessmentStatus === 'repositioned') return 'partial';
  if (assessmentStatus === 'gap') return 'gap';
  if (classification === 'strong') return 'strong';
  if (classification === 'partial') return 'partial';
  return 'gap';
}

/** Format importance as subtle lowercase text */
function importanceText(importance: string): string {
  switch (importance) {
    case 'must_have': return 'must have';
    case 'important': return 'important';
    case 'nice_to_have': return 'nice to have';
    default: return importance;
  }
}

/** Generate a requirement-specific context hint */
function contextHint(requirement: string): string {
  const lower = requirement.toLowerCase();
  if (lower.includes('cloud') || lower.includes('aws') || lower.includes('azure') || lower.includes('gcp')) {
    return `I also have cloud platform experience from...`;
  }
  if (lower.includes('kubernetes') || lower.includes('k8s') || lower.includes('container')) {
    return `I managed container orchestration at...`;
  }
  if (lower.includes('leadership') || lower.includes('team') || lower.includes('management')) {
    return `I led a team of X at...`;
  }
  if (lower.includes('budget') || lower.includes('financial') || lower.includes('p&l')) {
    return `I managed a $X budget at...`;
  }
  if (lower.includes('agile') || lower.includes('scrum') || lower.includes('devops')) {
    return `I implemented ${requirement.toLowerCase()} practices at...`;
  }
  return `I have ${requirement.toLowerCase()} experience from...`;
}

const TIER_CONFIG: Record<Tier, { label: string; icon: string; headerLabel: string }> = {
  strong: { label: 'Strong', icon: '\u2713', headerLabel: 'Strong Matches' },
  partial: { label: 'Partial', icon: '\u2192', headerLabel: 'Repositioned' },
  gap: { label: 'Gap', icon: '\u2717', headerLabel: 'Gaps' },
};

// ─── Summary Header ──────────────────────────────────────────────────────────

function SummaryHeader({
  strongCount,
  partialCount,
  gapCount,
  strengthSummary,
  roleTitle,
  companyName,
  preScoreAts,
}: {
  strongCount: number;
  partialCount: number;
  gapCount: number;
  strengthSummary: string;
  roleTitle?: string;
  companyName?: string;
  preScoreAts?: number | null;
}) {
  const total = strongCount + partialCount + gapCount;
  const addressedPct = total > 0 ? Math.round(((strongCount + partialCount) / total) * 100) : 0;

  return (
    <div className="px-5 pt-5 pb-4 space-y-4 shrink-0 border-b border-white/[0.06]">
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: REPORT_COLORS.heading, lineHeight: 1.3 }}>
          Gap Analysis Report
        </h2>
        {roleTitle && (
          <p style={{ fontSize: 13, color: REPORT_COLORS.secondary, marginTop: 2 }}>
            {roleTitle}{companyName ? ` \u2014 ${companyName}` : ''}
          </p>
        )}
      </div>

      {/* Score line: starting point → after */}
      <div className="flex items-baseline gap-2">
        {preScoreAts != null && (
          <span style={{ fontSize: 14, color: REPORT_COLORS.secondary }}>
            Your starting point: {preScoreAts}%
          </span>
        )}
        {preScoreAts != null && (
          <span style={{ fontSize: 14, color: REPORT_COLORS.tertiary }}>{'\u2192'}</span>
        )}
        <span style={{ fontSize: 14, fontWeight: 600, color: REPORT_COLORS.heading }}>
          {preScoreAts != null ? `After: ${addressedPct}%` : `Coverage: ${addressedPct}%`}
        </span>
        <span style={{ fontSize: 13, color: REPORT_COLORS.tertiary, marginLeft: 'auto' }}>
          {strongCount + partialCount} of {total} addressed
        </span>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="h-2 w-full rounded-full overflow-hidden flex" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
          {strongCount > 0 && (
            <div className="h-full transition-all duration-500" style={{ width: `${(strongCount / total) * 100}%`, backgroundColor: 'rgba(255,255,255,0.25)' }} />
          )}
          {partialCount > 0 && (
            <div className="h-full transition-all duration-500" style={{ width: `${(partialCount / total) * 100}%`, backgroundColor: 'rgba(255,255,255,0.15)' }} />
          )}
          {gapCount > 0 && (
            <div className="h-full transition-all duration-500" style={{ width: `${(gapCount / total) * 100}%`, backgroundColor: 'rgba(199,91,91,0.30)' }} />
          )}
        </div>
      )}

      {strengthSummary && (
        <p style={{ fontSize: 14, lineHeight: 1.65, color: REPORT_COLORS.body }}>
          {strengthSummary}
        </p>
      )}
    </div>
  );
}

// ─── Tier Section Header ─────────────────────────────────────────────────────

function TierSectionHeader({ tier, count }: { tier: Tier; count: number }) {
  const config = TIER_CONFIG[tier];
  const color = tierColor(tier);

  return (
    <div className="flex items-center gap-3 px-5 py-3 mt-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{ fontSize: 14, color }}>{config.icon}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: REPORT_COLORS.heading }}>{config.headerLabel}</span>
      <span
        className="rounded-full px-2 py-0.5"
        style={{ fontSize: 12, fontWeight: 600, color: REPORT_COLORS.secondary, backgroundColor: 'rgba(255,255,255,0.06)' }}
      >
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
}: {
  req: MergedRequirement;
  isActive: boolean;
  onRequirementClick: (requirement: string) => void;
  onRequestEdit?: GapAnalysisReportPanelProps['onRequestEdit'];
  currentResume?: ResumeDraft | null;
  positioningAssessment: PositioningAssessment | null;
  isEditing?: boolean;
}) {
  const [showContext, setShowContext] = useState(false);
  const [contextText, setContextText] = useState('');
  const [questionsExpanded, setQuestionsExpanded] = useState(false);

  const color = tierColor(req.tier);
  const config = TIER_CONFIG[req.tier];
  const canAct = onRequestEdit && currentResume && !isEditing;

  const handleApplyLanguage = useCallback(() => {
    if (!canAct || !req.strategy?.positioning) return;
    const target = findBulletForRequirement(req.requirement, positioningAssessment, currentResume!);
    if (!target) return;
    const label = req.tier === 'gap' ? 'safe resume language' : 'positioning';
    onRequestEdit!(
      target.text,
      target.section,
      'custom',
      `Naturally weave this ${label} into the text: "${req.strategy.positioning}". This addresses the job requirement: "${req.requirement}".`,
      buildEditContext(req.requirement, req.evidence, req.strategy.positioning),
    );
  }, [canAct, req, positioningAssessment, currentResume, onRequestEdit]);

  const handleStrengthen = useCallback(() => {
    if (!canAct) return;
    const target = findBulletForRequirement(req.requirement, positioningAssessment, currentResume!);
    if (!target) return;
    onRequestEdit!(target.text, target.section, 'strengthen', undefined, buildEditContext(req.requirement, req.evidence, req.strategy?.positioning));
  }, [canAct, req, positioningAssessment, currentResume, onRequestEdit]);

  const handleAddMetrics = useCallback(() => {
    if (!canAct) return;
    const target = findBulletForRequirement(req.requirement, positioningAssessment, currentResume!);
    if (!target) return;
    onRequestEdit!(target.text, target.section, 'add_metrics', undefined, buildEditContext(req.requirement, req.evidence, req.strategy?.positioning));
  }, [canAct, req, positioningAssessment, currentResume, onRequestEdit]);

  const handleSubmitContext = useCallback(() => {
    if (!canAct || !contextText.trim()) return;
    const target = findBulletForRequirement(req.requirement, positioningAssessment, currentResume!);
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
  }, [canAct, contextText, req, positioningAssessment, currentResume, onRequestEdit]);

  const handleViewInResume = useCallback(() => {
    onRequirementClick(req.requirement);
  }, [req.requirement, onRequirementClick]);

  const questions = req.interviewQuestions ?? [];
  const hasMapping = req.addressedBy && req.addressedBy.length > 0;
  const metric = req.inferredMetric ?? req.strategy?.inferred_metric;
  const metricRationale = req.inferenceRationale ?? req.strategy?.inference_rationale;

  const borderLeft = `3px solid ${tierBorder(req.tier)}`;
  const borderOther = isActive ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.06)';

  return (
    <div
      data-testid="requirement-card"
      data-requirement={req.requirement}
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
        {/* Header: requirement name + subtle importance text */}
        <div className="flex items-start gap-2.5">
          <span style={{ fontSize: 15, fontWeight: 500, color: REPORT_COLORS.heading, lineHeight: 1.5, flex: 1 }}>
            {req.requirement}
          </span>
          <span
            className="shrink-0 mt-1"
            style={{ fontSize: 13, color: REPORT_COLORS.tertiary }}
          >
            {importanceText(req.importance)}
          </span>
        </div>

        {/* MAPPING FIRST — where it's addressed in the resume */}
        {hasMapping ? (
          <div className="space-y-1.5">
            {req.addressedBy!.map((entry, i) => (
              <div key={`${entry.section}-${i}`} className="flex items-start gap-2">
                <span style={{ color, fontSize: 14, marginTop: 1, flexShrink: 0 }}>
                  {config.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: REPORT_COLORS.secondary }}>
                    {req.resumeStatus === 'repositioned' ? 'Repositioned in ' : ''}{entry.section}
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
              className="inline-flex items-center gap-1 ml-6 hover:opacity-80 transition-opacity"
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
            <span style={{ color: REPORT_COLORS.gap, fontSize: 14 }}>{'\u2717'}</span>
            <span style={{ fontSize: 14, color: REPORT_COLORS.gap }}>
              Not addressed in your resume
            </span>
          </div>
        )}

        {/* AI coaching as prose */}
        {req.aiReasoning && (
          <p style={{ fontSize: 14, lineHeight: 1.7, color: REPORT_COLORS.body }}>
            {req.aiReasoning}
            {/* Inferred metrics inline */}
            {metric && (
              <span style={{ color: REPORT_COLORS.secondary }}>
                {' '}{metric}{metricRationale ? ` \u2014 ${metricRationale}` : ''}
              </span>
            )}
          </p>
        )}

        {/* Inferred metric standalone (when no AI reasoning to attach to) */}
        {!req.aiReasoning && metric && (
          <p style={{ fontSize: 14, color: REPORT_COLORS.secondary }}>
            {metric}{metricRationale ? ` \u2014 ${metricRationale}` : ''}
          </p>
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
                If you have this experience, we can add it:
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
                  {req.tier === 'gap' ? 'Add to Resume' : 'Apply'}
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Questions toggle — only for gaps, collapsed by default */}
        {questions.length > 0 && req.tier === 'gap' && (
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
              {questionsExpanded ? 'Hide questions' : `${questions.length} question${questions.length !== 1 ? 's' : ''} to uncover evidence`}
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
              placeholder={contextHint(req.requirement)}
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
              <>
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
                  Strengthen
                </button>
                <button
                  type="button"
                  onClick={handleAddMetrics}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors hover:opacity-80"
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: REPORT_COLORS.secondary,
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  data-testid="action-add-metrics"
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  Add Metrics
                </button>
              </>
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
                Strengthen
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
                Add Context
              </button>
            )}
          </div>
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
  gapCoachingCards,
  activeRequirements,
  onRequirementClick,
  onRequestEdit,
  currentResume,
  isEditing,
  preScores,
}: GapAnalysisReportPanelProps) {
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

      const tier = classificationToTier(
        gapReq?.classification ?? 'missing',
        assessment?.status,
      );

      result.push({
        requirement: comp.competency,
        importance: comp.importance,
        tier,
        evidence: coaching?.evidence_found ?? gapReq?.evidence ?? [],
        strategy: gapReq?.strategy,
        aiReasoning: coaching?.ai_reasoning ?? gapReq?.strategy?.ai_reasoning,
        interviewQuestions: coaching?.interview_questions ?? gapReq?.strategy?.interview_questions,
        inferredMetric: coaching?.inferred_metric ?? gapReq?.strategy?.inferred_metric,
        inferenceRationale: coaching?.inference_rationale ?? gapReq?.strategy?.inference_rationale,
        resumeStatus: assessment?.status,
        addressedBy: assessment?.addressed_by,
        strategyUsed: assessment?.strategy_used,
      });
    }

    for (const req of gapAnalysis.requirements) {
      const normalizedKey = normalizeRequirement(req.requirement);
      if (seen.has(normalizedKey)) continue;
      if (req.classification !== 'missing') continue;

      const coaching = coachingLookup.get(normalizedKey)?.card;

      result.push({
        requirement: req.requirement,
        importance: req.importance,
        tier: 'gap',
        evidence: coaching?.evidence_found ?? req.evidence ?? [],
        strategy: req.strategy,
        aiReasoning: coaching?.ai_reasoning ?? req.strategy?.ai_reasoning,
        interviewQuestions: coaching?.interview_questions ?? req.strategy?.interview_questions,
        inferredMetric: coaching?.inferred_metric ?? req.strategy?.inferred_metric,
        inferenceRationale: coaching?.inference_rationale ?? req.strategy?.inference_rationale,
      });
    }

    return result;
  }, [jobIntelligence, gapAnalysis, coachingLookup, assessmentMap, gapReqLookup]);

  const tiers = useMemo(() => {
    const groups: Record<Tier, MergedRequirement[]> = { strong: [], partial: [], gap: [] };
    for (const req of merged) {
      groups[req.tier].push(req);
    }
    return groups;
  }, [merged]);

  const activeSet = useMemo(
    () => new Set(activeRequirements.map((r) => r.trim().toLowerCase())),
    [activeRequirements],
  );

  return (
    <div
      data-testid="gap-analysis-report"
      style={{
        background: 'rgba(10,12,20,0.85)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <SummaryHeader
        strongCount={tiers.strong.length}
        partialCount={tiers.partial.length}
        gapCount={tiers.gap.length}
        strengthSummary={gapAnalysis.strength_summary}
        roleTitle={jobIntelligence.role_title}
        companyName={jobIntelligence.company_name}
        preScoreAts={preScores?.ats_match}
      />

      <div className="pb-6">
        {(['strong', 'partial', 'gap'] as Tier[]).map((tier) => {
          const items = tiers[tier];
          if (items.length === 0) return null;

          return (
            <section key={tier} data-testid={`tier-${tier}`} aria-label={TIER_CONFIG[tier].headerLabel}>
              <TierSectionHeader tier={tier} count={items.length} />
              <div className="px-4 py-3 space-y-3">
                {items.map((req, idx) => (
                  <RequirementCard
                    key={`${req.requirement}-${idx}`}
                    req={req}
                    isActive={activeSet.has(req.requirement.trim().toLowerCase())}
                    onRequirementClick={onRequirementClick}
                    onRequestEdit={onRequestEdit}
                    currentResume={currentResume}
                    positioningAssessment={positioningAssessment}
                    isEditing={isEditing}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
