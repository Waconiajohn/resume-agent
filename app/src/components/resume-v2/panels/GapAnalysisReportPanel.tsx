/**
 * GapAnalysisReportPanel — Rich coaching report replacing RequirementsChecklistPanel.
 *
 * Organized into three tiers (Strong / Partial / Gap) with the full analysis chain:
 * Target → Benchmark → You → Gap → Action.
 *
 * Design rules:
 * - 14px minimum for anything the user reads. 11px only for badge labels.
 * - Accent colors for dots, borders, and card bg tints only — never body text.
 * - All coaching content visible without clicking. Only questions behind a click.
 *
 * Note on tier mapping:
 * - PositioningAssessment has 3 statuses: 'strong', 'repositioned', 'gap'.
 * - This panel maps 'repositioned' → 'partial' tier intentionally, since
 *   partial matches and repositioned items both represent "close but not exact"
 *   and share the same coaching workflow (apply/refine positioning language).
 */

import { useState, useMemo, useCallback, type ReactNode } from 'react';
import { ChevronRight, MessageSquare, Sparkles, TrendingUp, BarChart3, Eye, HelpCircle } from 'lucide-react';
import type {
  JobIntelligence,
  BenchmarkCandidate,
  PositioningAssessment,
  PositioningAssessmentEntry,
  GapAnalysis,
  GapCoachingCard,
  ResumeDraft,
  RequirementGap,
  GapStrategy,
} from '@/types/resume-v2';
import type { EditAction, EditContext } from '@/hooks/useInlineEdit';
import { importanceLabel } from '../cards/shared-badges';
import {
  normalizeRequirement,
  findBulletForRequirement,
  buildEditContext,
  buildCoachingLookup,
} from '../utils/coaching-actions';
import { REPORT_COLORS, tierColor, tierBg, tierBorder, importanceBadgeStyle, type Tier } from './report-colors';

// ─── Props (drop-in replacement for RequirementsChecklistPanel) ───────────────

interface GapAnalysisReportPanelProps {
  jobIntelligence: JobIntelligence;
  benchmarkCandidate: BenchmarkCandidate | null;
  positioningAssessment: PositioningAssessment | null;
  gapAnalysis: GapAnalysis;
  gapCoachingCards?: GapCoachingCard[] | null;
  activeRequirements: string[];
  onRequirementClick: (requirement: string) => void;
  onRequestEdit?: (selectedText: string, section: string, action: EditAction, customInstruction?: string, editContext?: EditContext) => void;
  currentResume?: ResumeDraft | null;
  isEditing?: boolean;
}

// ─── Merged requirement type ──────────────────────────────────────────────────

interface MergedRequirement {
  requirement: string;
  importance: 'must_have' | 'important' | 'nice_to_have';
  evidenceFromJd: string;
  benchmarkDescription?: string;
  benchmarkMetrics?: string;
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

// ─── Helpers (placed before component for readability and hoisting safety) ────

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
}

/** Fuzzy lookup: find the best matching entry by token overlap (≥2 tokens, >50% score) */
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

function findBenchmarkMatch(
  requirement: string,
  achievements: BenchmarkCandidate['expected_achievements'],
): { description: string; typical_metrics: string } | null {
  const needleTokens = tokenize(requirement);
  const match = achievements.find((a) => {
    const areaTokens = tokenize(a.area);
    const overlap = areaTokens.filter((t) => needleTokens.includes(t)).length;
    return overlap >= 2 || a.area.toLowerCase() === requirement.toLowerCase();
  });
  return match ? { description: match.description, typical_metrics: match.typical_metrics } : null;
}

/**
 * Maps gap classification + positioning assessment status to a display tier.
 * 'repositioned' → 'partial': both represent "close but not exact match" and
 * share the same coaching workflow (apply/refine positioning language).
 */
function classificationToTier(classification: string, assessmentStatus?: string): Tier {
  if (assessmentStatus === 'strong') return 'strong';
  if (assessmentStatus === 'repositioned') return 'partial';
  if (assessmentStatus === 'gap') return 'gap';
  if (classification === 'strong') return 'strong';
  if (classification === 'partial') return 'partial';
  return 'gap';
}

/** Status icon for the "In Your Resume" section — explicitly handles all statuses */
function resumeStatusIcon(status?: string): { icon: string; color: string } {
  if (status === 'strong') return { icon: '✓', color: REPORT_COLORS.strong };
  if (status === 'repositioned') return { icon: '→', color: REPORT_COLORS.partial };
  return { icon: '✗', color: REPORT_COLORS.gap };
}

const TIER_CONFIG: Record<Tier, { label: string; icon: string; headerLabel: string }> = {
  strong: { label: 'Strong', icon: '\u25CF', headerLabel: 'Highly Qualified' },   // ● (solid circle, universal)
  partial: { label: 'Partial', icon: '\u25D1', headerLabel: 'Partially Qualified' }, // ◑ (right half circle, better font coverage than ◐)
  gap: { label: 'Gap', icon: '\u2715', headerLabel: 'True Gaps' },                // ✕ (multiplication X)
};

// ─── Summary Header ──────────────────────────────────────────────────────────

function SummaryHeader({
  strongCount,
  partialCount,
  gapCount,
  strengthSummary,
  roleTitle,
  companyName,
}: {
  strongCount: number;
  partialCount: number;
  gapCount: number;
  strengthSummary: string;
  roleTitle?: string;
  companyName?: string;
}) {
  const total = strongCount + partialCount + gapCount;
  const addressedPct = total > 0 ? Math.round(((strongCount + partialCount) / total) * 100) : 0;

  return (
    <div className="px-5 pt-5 pb-4 space-y-4 shrink-0 border-b border-white/[0.06]">
      {/* Title */}
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: REPORT_COLORS.heading, lineHeight: 1.3 }}>
          Gap Analysis Report
        </h2>
        {roleTitle && (
          <p style={{ fontSize: 13, color: REPORT_COLORS.secondary, marginTop: 2 }}>
            {roleTitle}{companyName ? ` — ${companyName}` : ''}
          </p>
        )}
      </div>

      {/* Stat boxes */}
      <div className="flex gap-3">
        {[
          { count: strongCount, label: 'Strong', color: REPORT_COLORS.strong },
          { count: partialCount, label: 'Partial', color: REPORT_COLORS.partial },
          { count: gapCount, label: 'Gaps', color: REPORT_COLORS.gap },
        ].map(({ count, label, color }) => (
          <div
            key={label}
            className="flex-1 rounded-lg px-3 py-2 text-center"
            style={{ backgroundColor: `${color}0A`, border: `1px solid ${color}20` }}
          >
            <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1.1 }}>{count}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: REPORT_COLORS.secondary, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span style={{ fontSize: 13, color: REPORT_COLORS.secondary, fontWeight: 500 }}>
              Coverage: {addressedPct}%
            </span>
            <span style={{ fontSize: 13, color: REPORT_COLORS.tertiary }}>
              {strongCount + partialCount} of {total} addressed
            </span>
          </div>
          <div className="h-2 w-full rounded-full overflow-hidden flex" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
            {strongCount > 0 && (
              <div className="h-full transition-all duration-500" style={{ width: `${(strongCount / total) * 100}%`, backgroundColor: REPORT_COLORS.strong }} />
            )}
            {partialCount > 0 && (
              <div className="h-full transition-all duration-500" style={{ width: `${(partialCount / total) * 100}%`, backgroundColor: REPORT_COLORS.partial }} />
            )}
            {gapCount > 0 && (
              <div className="h-full transition-all duration-500" style={{ width: `${(gapCount / total) * 100}%`, backgroundColor: `${REPORT_COLORS.gap}66` }} />
            )}
          </div>
        </div>
      )}

      {/* Strength summary */}
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

// ─── Section Label (small uppercase) ─────────────────────────────────────────

function SectionLabel({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: color ?? REPORT_COLORS.tertiary,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

// ─── Action Button ───────────────────────────────────────────────────────────

function ActionButton({
  icon,
  label,
  color,
  onClick,
  testId,
  subtle,
}: {
  icon: ReactNode;
  label: string;
  color: string;
  onClick: () => void;
  testId: string;
  subtle?: boolean;
}) {
  const textColor = subtle ? REPORT_COLORS.secondary : color;
  const bgColor = subtle ? 'rgba(255,255,255,0.04)' : `${color}12`;
  const borderColor = subtle ? 'rgba(255,255,255,0.08)' : `${color}25`;

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors hover:opacity-80"
      style={{
        fontSize: 13,
        fontWeight: 500,
        color: textColor,
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
      }}
      data-testid={testId}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── Requirement Card ────────────────────────────────────────────────────────

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

  // H-2 fix: only call onRequirementClick (parent already calls scrollToBullet)
  const handleViewInResume = useCallback(() => {
    onRequirementClick(req.requirement);
  }, [req.requirement, onRequirementClick]);

  const badgeStyle = importanceBadgeStyle(req.importance);
  const questions = req.interviewQuestions ?? [];

  // C-1 fix: use individual border properties instead of mixing shorthand with longhand
  const borderLeft = `3px solid ${tierBorder(req.tier)}`;
  const borderTop = isActive ? `1px solid ${color}66` : '1px solid rgba(255,255,255,0.06)';
  const borderRight = borderTop;
  const borderBottom = borderTop;

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
        borderTop,
        borderRight,
        borderBottom,
        boxShadow: isActive ? `0 0 0 1px ${color}33` : undefined,
      }}
    >
      <div className="px-4 py-4 space-y-4">
        {/* Header: icon + requirement + importance badge */}
        <div className="flex items-start gap-2.5">
          <span style={{ fontSize: 14, color, marginTop: 2, lineHeight: 1, flexShrink: 0 }} aria-hidden="true">{config.icon}</span>
          <span style={{ fontSize: 15, fontWeight: 500, color: REPORT_COLORS.heading, lineHeight: 1.5, flex: 1 }}>
            {req.requirement}
          </span>
          <span
            className="rounded-full px-2 py-0.5 shrink-0"
            style={{ fontSize: 11, fontWeight: 600, ...badgeStyle }}
          >
            {importanceLabel(req.importance)}
          </span>
        </div>

        {/* WHAT THE JOB REQUIRES */}
        {req.evidenceFromJd && (
          <div>
            <SectionLabel>What the Job Requires</SectionLabel>
            <p style={{ fontSize: 14, lineHeight: 1.65, color: REPORT_COLORS.body }}>
              &ldquo;{req.evidenceFromJd}&rdquo;
            </p>
          </div>
        )}

        {/* THE BENCHMARK */}
        {req.benchmarkDescription && (
          <div>
            <SectionLabel>The Benchmark</SectionLabel>
            <p style={{ fontSize: 14, lineHeight: 1.65, color: REPORT_COLORS.body }}>
              {req.benchmarkDescription}
            </p>
            {req.benchmarkMetrics && (
              <p style={{ fontSize: 14, color: REPORT_COLORS.secondary, marginTop: 4 }}>
                Typical: {req.benchmarkMetrics}
              </p>
            )}
          </div>
        )}

        {/* YOUR EVIDENCE */}
        <div>
          <SectionLabel>Your Evidence</SectionLabel>
          {req.evidence.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {req.evidence.map((e) => (
                <span
                  key={e}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1"
                  style={{
                    fontSize: 14,
                    color: REPORT_COLORS.body,
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.10)',
                  }}
                >
                  <span style={{ color: REPORT_COLORS.strong, fontSize: 11 }} aria-hidden="true">&#x2713;</span>
                  {e}
                </span>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 14, color: REPORT_COLORS.secondary, fontStyle: 'italic' }}>
              No direct evidence found in resume.
            </p>
          )}
        </div>

        {/* AI ANALYSIS / WHY PARTIAL / WHY THIS IS A GAP */}
        {req.aiReasoning && (
          <div>
            <SectionLabel color={`${color}99`}>
              {req.tier === 'strong' ? 'AI Analysis' : req.tier === 'partial' ? 'Why Partial' : 'Why This Is a Gap'}
            </SectionLabel>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: REPORT_COLORS.body }}>
              {req.aiReasoning}
            </p>
          </div>
        )}

        {/* SUGGESTED LANGUAGE / SAFE LANGUAGE */}
        {req.strategy?.positioning && (
          <div>
            <SectionLabel color={`${color}99`}>
              {req.tier === 'gap' ? 'Safe Language (if you can confirm experience)' : 'Suggested Language'}
            </SectionLabel>
            <div
              className="rounded-lg px-4 py-3"
              style={{
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: `1px dashed ${color}33`,
              }}
            >
              <p style={{ fontSize: 14, lineHeight: 1.65, color: REPORT_COLORS.heading, fontStyle: 'italic' }}>
                &ldquo;{req.strategy.positioning}&rdquo;
              </p>
            </div>
          </div>
        )}

        {/* INFERRED METRIC */}
        {(req.inferredMetric || req.strategy?.inferred_metric) && (
          <div>
            <SectionLabel>Inferred Metric</SectionLabel>
            <div className="flex items-start gap-2">
              <BarChart3 className="h-4 w-4 shrink-0 mt-0.5" style={{ color: REPORT_COLORS.partial }} />
              <div>
                <span style={{ fontSize: 14, color: REPORT_COLORS.body }}>
                  {req.inferredMetric ?? req.strategy?.inferred_metric}
                </span>
                {(req.inferenceRationale || req.strategy?.inference_rationale) && (
                  <span style={{ fontSize: 14, color: REPORT_COLORS.secondary }}>
                    {' '}&mdash; {req.inferenceRationale ?? req.strategy?.inference_rationale}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* IN YOUR RESUME */}
        <div>
          <SectionLabel>In Your Resume</SectionLabel>
          {req.addressedBy && req.addressedBy.length > 0 ? (
            <div className="space-y-2">
              {req.addressedBy.map((entry, i) => {
                const statusVis = resumeStatusIcon(req.resumeStatus);
                return (
                  <div key={`${entry.section}-${i}`} className="flex items-start gap-2">
                    <span style={{ color: statusVis.color, fontSize: 14, marginTop: 1 }}>
                      {statusVis.icon}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span
                        className="rounded px-1.5 py-0.5"
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: REPORT_COLORS.secondary,
                          backgroundColor: 'rgba(255,255,255,0.06)',
                        }}
                      >
                        {entry.section}
                      </span>
                      <p style={{ fontSize: 14, color: REPORT_COLORS.body, marginTop: 4, lineHeight: 1.5 }}>
                        &ldquo;{entry.bullet_text.length > 120 ? entry.bullet_text.slice(0, 120).trimEnd() + '...' : entry.bullet_text}&rdquo;
                      </p>
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={handleViewInResume}
                className="inline-flex items-center gap-1 mt-1 hover:opacity-80 transition-opacity"
                style={{ fontSize: 14, fontWeight: 500, color }}
                data-testid="view-in-resume"
              >
                <Eye className="h-3.5 w-3.5" />
                View in Resume
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <p style={{ fontSize: 14, color: REPORT_COLORS.gap }}>
              &#x2717; Not currently addressed
            </p>
          )}
        </div>

        {/* QUESTIONS (behind a click) */}
        {questions.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setQuestionsExpanded(!questionsExpanded)}
              className="inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity"
              style={{ fontSize: 14, fontWeight: 500, color: REPORT_COLORS.secondary }}
              aria-expanded={questionsExpanded}
              data-testid="toggle-questions"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              {questionsExpanded ? 'Hide' : `${questions.length} question${questions.length !== 1 ? 's' : ''} to close this gap`}
              <ChevronRight
                className="h-3 w-3 transition-transform duration-200"
                style={{ transform: questionsExpanded ? 'rotate(90deg)' : 'none' }}
              />
            </button>
            {questionsExpanded && (
              <div className="mt-3 space-y-3">
                {questions.map((q, i) => (
                  <div
                    key={`q-${i}`}
                    className="rounded-lg px-3.5 py-3"
                    style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <p style={{ fontSize: 14, fontWeight: 500, color: REPORT_COLORS.heading, lineHeight: 1.5 }}>
                      {q.question}
                    </p>
                    {q.looking_for && (
                      <p style={{ fontSize: 14, color: REPORT_COLORS.tertiary, marginTop: 4 }}>
                        Looking for: {q.looking_for}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Context input (revealed on click) */}
        {showContext && (
          <div className="space-y-2">
            <textarea
              value={contextText}
              onChange={(e) => setContextText(e.target.value)}
              placeholder="Share relevant experience, projects, or context not in your resume..."
              rows={3}
              className="w-full rounded-lg px-3.5 py-2.5 resize-none focus:outline-none transition-colors"
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: REPORT_COLORS.heading,
                backgroundColor: 'rgba(255,255,255,0.04)',
                border: `1px solid ${color}33`,
                caretColor: color,
              }}
              aria-label={`Additional context for: ${req.requirement}`}
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!contextText.trim() || isEditing}
                onClick={handleSubmitContext}
                className="rounded-lg px-3 py-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ fontSize: 14, fontWeight: 500, color, backgroundColor: `${color}1A`, border: `1px solid ${color}33` }}
                data-testid="submit-context"
              >
                Submit &amp; Rewrite
              </button>
              <button
                type="button"
                onClick={() => { setShowContext(false); setContextText(''); }}
                style={{ fontSize: 14, color: REPORT_COLORS.tertiary }}
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
                <ActionButton icon={<TrendingUp className="h-3.5 w-3.5" />} label="Strengthen" color={REPORT_COLORS.strong} onClick={handleStrengthen} testId="action-strengthen" />
                <ActionButton icon={<BarChart3 className="h-3.5 w-3.5" />} label="Add Metrics" color={REPORT_COLORS.partial} onClick={handleAddMetrics} testId="action-add-metrics" />
              </>
            )}
            {req.tier === 'partial' && (
              <>
                {req.strategy?.positioning && (
                  <ActionButton icon={<Sparkles className="h-3.5 w-3.5" />} label="Apply Language" color={color} onClick={handleApplyLanguage} testId="action-apply-language" />
                )}
                {/* M-6 fix: fallback Strengthen for partial items without positioning strategy */}
                {!req.strategy?.positioning && (
                  <ActionButton icon={<TrendingUp className="h-3.5 w-3.5" />} label="Strengthen" color={REPORT_COLORS.strong} onClick={handleStrengthen} testId="action-strengthen" />
                )}
              </>
            )}
            {req.tier === 'gap' && req.strategy?.positioning && (
              <ActionButton icon={<Sparkles className="h-3.5 w-3.5" />} label="Apply Safe Language" color={color} onClick={handleApplyLanguage} testId="action-apply-language" />
            )}
            {!showContext && (
              <ActionButton
                icon={<MessageSquare className="h-3.5 w-3.5" />}
                label="Add My Context"
                color={REPORT_COLORS.secondary}
                onClick={() => setShowContext(true)}
                testId="action-add-context"
                subtle
              />
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
  benchmarkCandidate,
  positioningAssessment,
  gapAnalysis,
  gapCoachingCards,
  activeRequirements,
  onRequirementClick,
  onRequestEdit,
  currentResume,
  isEditing,
}: GapAnalysisReportPanelProps) {
  // Build lookups
  const coachingLookup = useMemo(
    () => buildCoachingLookup(gapCoachingCards ?? null),
    [gapCoachingCards],
  );

  // C-2 fix: use explicit PositioningAssessmentEntry type instead of conditional type
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

  // Merge all data sources into MergedRequirement[]
  const merged = useMemo(() => {
    // H-4 fix: use normalizeRequirement for dedup (handles trailing punctuation)
    const seen = new Set<string>();
    const result: MergedRequirement[] = [];

    // Primary source: core_competencies from JobIntelligence
    for (const comp of jobIntelligence.core_competencies) {
      const normalizedKey = normalizeRequirement(comp.competency);
      seen.add(normalizedKey);

      const gapReq = gapReqLookup.get(normalizedKey);
      const coaching = coachingLookup.get(normalizedKey)?.card;
      const rawKey = comp.competency.trim().toLowerCase();
      const assessment = assessmentMap.get(rawKey) ?? fuzzyLookup(rawKey, assessmentMap);
      const benchmark = benchmarkCandidate
        ? findBenchmarkMatch(comp.competency, benchmarkCandidate.expected_achievements)
        : null;

      const tier = classificationToTier(
        gapReq?.classification ?? 'missing',
        assessment?.status,
      );

      result.push({
        requirement: comp.competency,
        importance: comp.importance,
        evidenceFromJd: comp.evidence_from_jd ?? '',
        benchmarkDescription: benchmark?.description,
        benchmarkMetrics: benchmark?.typical_metrics,
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

    // Additional gaps from gap analysis not in core_competencies
    for (const req of gapAnalysis.requirements) {
      // H-4 fix: use normalizeRequirement for dedup (consistent with seen set)
      const normalizedKey = normalizeRequirement(req.requirement);
      if (seen.has(normalizedKey)) continue;
      if (req.classification !== 'missing') continue;

      const coaching = coachingLookup.get(normalizedKey)?.card;

      result.push({
        requirement: req.requirement,
        importance: req.importance,
        evidenceFromJd: '',
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
  }, [jobIntelligence, gapAnalysis, coachingLookup, assessmentMap, gapReqLookup, benchmarkCandidate]);

  // Group by tier
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
      className="h-full overflow-y-auto"
      data-testid="gap-analysis-report"
      style={{
        background: 'rgba(10,12,20,0.85)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Summary header */}
      <SummaryHeader
        strongCount={tiers.strong.length}
        partialCount={tiers.partial.length}
        gapCount={tiers.gap.length}
        strengthSummary={gapAnalysis.strength_summary}
        roleTitle={jobIntelligence.role_title}
        companyName={jobIntelligence.company_name}
      />

      {/* Tier sections */}
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
