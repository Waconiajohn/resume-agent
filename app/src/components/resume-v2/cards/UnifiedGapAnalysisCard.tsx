import { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MessageSquare,
  Lightbulb,
  Ruler,
  SkipForward,
  ArrowRight,
  Minus,
  Shield,
  MapPin,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AiHelperHint } from '@/components/shared/AiHelperHint';
import { evidenceLooksDirectForRequirement } from '@/lib/requirement-evidence';
import { importanceLabel, importanceStyle } from './shared-badges';
import type {
  GapAnalysis,
  GapCoachingCard,
  GapCoachingAction,
  GapCoachingResponse,
  GapClassification,
  GapPlacementTarget,
  RequirementGap,
  ResumeDraft,
  PositioningAssessment,
} from '@/types/resume-v2';
import type { EditAction, EditContext } from '@/hooks/useInlineEdit';
import {
  normalizeRequirement,
  findBulletForRequirement,
  buildEditContext as buildEditContextUtil,
  buildCoachingLookup,
} from '../utils/coaching-actions';

// ─── Per-coaching-item state (mirrors GapCoachingCard pattern) ──────

interface CoachingState {
  action: GapCoachingAction | null;
  contextText: string;
  showContextInput: boolean;
  /** Per-question answers keyed by question index */
  questionAnswers: Record<number, string>;
  /** Show placement picker after clicking "Use this draft" */
  showPlacementPicker: boolean;
  /** User-selected section placement for approved strategies */
  target_section: GapPlacementTarget;
  /** For 'experience' placement — which company */
  target_company: string;
  /** Index of the selected alternative bullet, or null if none selected */
  selectedAlternativeIndex: number | null;
  /** Edit mode for alternative bullets */
  editMode: 'none' | 'edit-alternative' | 'write-own';
  /** Edited text when in edit mode */
  editedText: string;
}

// ─── Props ──────────────────────────────────────────────────────────

interface UnifiedGapAnalysisCardProps {
  gapAnalysis: GapAnalysis;
  gapCoachingCards: GapCoachingCard[] | null;
  companyName?: string;
  roleTitle?: string;
  onRespondGapCoaching: (responses: GapCoachingResponse[]) => void;
  onRequestEdit?: (selectedText: string, section: string, action: EditAction, customInstruction?: string, editContext?: EditContext) => void;
  currentResume?: ResumeDraft | null;
  isComplete?: boolean;
  disabled?: boolean;
  /** Assembly positioning assessment — used to find the correct bullet for each requirement */
  positioningAssessment?: PositioningAssessment | null;
  /** Company names from candidate experience — used for placement dropdown */
  experienceCompanies?: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────

function classificationIcon(c: GapClassification) {
  if (c === 'strong') return <CheckCircle2 className="h-3.5 w-3.5 text-[var(--badge-green-text)] shrink-0" />;
  if (c === 'partial') return <AlertTriangle className="h-3.5 w-3.5 text-[var(--badge-amber-text)] shrink-0" />;
  return <XCircle className="h-3.5 w-3.5 text-[var(--badge-red-text)] shrink-0" />;
}

const SECTION_CONFIG = {
  strong: {
    accent: 'var(--badge-green-text)',
    label: 'Already covered',
    icon: CheckCircle2,
  },
  partial: {
    accent: 'var(--link)',
    label: 'Needs stronger proof',
    icon: AlertTriangle,
  },
  missing: {
    accent: 'var(--badge-red-text)',
    label: 'Not yet covered',
    icon: XCircle,
  },
} as const;

function requirementSourceLabel(source: RequirementGap['source']): string {
  return source === 'benchmark' ? 'Benchmark' : 'Job Description';
}

function requirementStatusLabel(classification: GapClassification): string {
  if (classification === 'strong') return 'Covered';
  if (classification === 'partial') return 'Partially Covered';
  return 'Not Yet Covered';
}

function shortenText(text: string | undefined, max = 120): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function sourceDescription(source: 'job_description' | 'benchmark'): string {
  return source === 'benchmark'
    ? 'These are ideal executive signals the benchmark expects, even when the job description does not spell them out directly.'
    : 'These are the direct requirements we pulled from the job description and need to account for honestly.';
}

function coachingQuestions(card: GapCoachingCard | undefined) {
  if (card?.coaching_policy?.clarifyingQuestion) {
    return [{
      question: card.coaching_policy.clarifyingQuestion,
      rationale: card.coaching_policy.rationale ?? '',
      looking_for: card.coaching_policy.lookingFor ?? '',
    }];
  }

  if (card?.interview_questions && card.interview_questions.length > 0) {
    return card.interview_questions;
  }

  return [];
}

// ─── Expandable requirement row ─────────────────────────────────────

interface RequirementRowProps {
  req: RequirementGap;
  coaching: GapCoachingCard | undefined;
  coachingState: CoachingState | undefined;
  onCoachingChange: ((patch: Partial<CoachingState>) => void) | undefined;
  onRequestEdit?: UnifiedGapAnalysisCardProps['onRequestEdit'];
  currentResume?: ResumeDraft | null;
  isComplete?: boolean;
  classification: GapClassification;
  disabled?: boolean;
  positioningAssessment?: PositioningAssessment | null;
  experienceCompanies?: string[];
}

function RequirementRow({
  req, coaching, coachingState, onCoachingChange,
  onRequestEdit, currentResume, isComplete, classification, disabled,
  positioningAssessment, experienceCompanies = [],
}: RequirementRowProps) {
  const [expanded, setExpanded] = useState(classification !== 'strong');
  const hasCoaching = coaching && coachingState && onCoachingChange;
  const isResponded = coachingState?.action !== null && coachingState?.action !== undefined;
  const mappedEvidence = currentResume
    ? findBulletForRequirement(req.requirement, positioningAssessment, currentResume)
    : null;
  const relevantEvidence = req.evidence.filter((entry) => evidenceLooksDirectForRequirement(req.requirement, entry));
  const bestEvidence = mappedEvidence?.text ?? relevantEvidence[0] ?? null;
  const bestEvidenceSection = mappedEvidence?.section ?? null;
  const relatedEvidence = relevantEvidence.filter((entry) => entry !== bestEvidence).slice(0, 2);
  const questions = coachingQuestions(coaching);
  const coachingPrompt = coaching?.coaching_policy?.proofActionRequiresInput;
  const issueText = coaching?.ai_reasoning
    ?? req.source_evidence
    ?? (classification === 'missing'
      ? 'We do not have clear proof of this requirement on the current resume yet.'
      : classification === 'partial'
        ? 'The resume gets close to this requirement, but the proof is still indirect or too weak.'
        : 'The current resume already addresses this requirement.');

  const editContext = (): EditContext =>
    buildEditContextUtil(req.requirement, req.evidence, req.strategy?.positioning);

  const handleApplyToResume = () => {
    if (!onRequestEdit || !currentResume || !req.strategy) return;
    const target = findBulletForRequirement(req.requirement, positioningAssessment, currentResume);
    if (!target) return;
    const label = classification === 'missing' ? 'safe resume language' : 'positioning';
    onRequestEdit(
      target.text,
      target.section,
      'custom',
      `Naturally weave this ${label} into the text: "${req.strategy.positioning}". This addresses the job requirement: "${req.requirement}".`,
      editContext(),
    );
  };

  const handleStrengthen = () => {
    if (!onRequestEdit || !currentResume) return;
    const target = findBulletForRequirement(req.requirement, positioningAssessment, currentResume);
    if (!target) return;
    onRequestEdit(target.text, target.section, 'strengthen', undefined, editContext());
  };

  const handleAddMetrics = () => {
    if (!onRequestEdit || !currentResume) return;
    const target = findBulletForRequirement(req.requirement, positioningAssessment, currentResume);
    if (!target) return;
    onRequestEdit(target.text, target.section, 'add_metrics', undefined, editContext());
  };

  const accentColor = SECTION_CONFIG[classification].accent;

  // Collapsed responded state for coaching items
  if (hasCoaching && isResponded) {
    const statusConfig = {
      approve: { dot: <span className="h-2 w-2 bg-[var(--badge-green-text)] shrink-0" />, label: 'Draft queued', color: 'text-[var(--badge-green-text)]' },
      context: { dot: <MessageSquare className="h-3 w-3 text-[var(--link)] shrink-0" />, label: 'More context added', color: 'text-[var(--link)]' },
      skip: { dot: <Minus className="h-3 w-3 text-[var(--text-soft)] shrink-0" />, label: 'Left as-is', color: 'text-[var(--text-soft)]' },
    }[coachingState.action!];

    return (
      <div
        className="support-callout px-3 py-2.5 flex items-center gap-3 transition-all duration-300"
        data-coaching-requirement={req.requirement}
      >
        {statusConfig.dot}
        <span className="flex-1 min-w-0 text-sm text-[var(--text-soft)] truncate">{req.requirement}</span>
        <span className={cn('text-xs font-medium shrink-0', statusConfig.color)}>{statusConfig.label}</span>
        <ChevronRight className="h-3.5 w-3.5 text-[var(--text-soft)] shrink-0" />
      </div>
    );
  }

  return (
    <div
      className="room-shell overflow-hidden transition-all duration-300"
      data-coaching-requirement={req.requirement}
    >
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[var(--accent-muted)] transition-colors"
        aria-expanded={expanded}
      >
        <ChevronDown
          className={cn(
            'h-3 w-3 text-[var(--text-soft)] shrink-0 transition-transform duration-200',
            expanded ? 'rotate-0' : '-rotate-90',
          )}
          aria-hidden="true"
        />
        {classificationIcon(classification)}
        <div className="min-w-0 flex-1">
          <span className="block text-base text-[var(--text-strong)] leading-snug truncate">{req.requirement}</span>
          <span className="mt-1 block text-sm leading-6 text-[var(--text-soft)]">
            {classification === 'strong'
              ? 'This requirement already has solid proof on the current resume.'
              : classification === 'partial'
                ? 'There is some proof on the resume, but it needs a stronger story.'
                : 'This requirement still needs a believable bridge from your experience.'}
          </span>
        </div>
        <span className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2 py-0.5 text-[12px] uppercase tracking-[0.12em] text-[var(--text-soft)] shrink-0">
          {requirementSourceLabel(req.source)}
        </span>
        <span
          className="inline-flex items-center rounded-md px-2.5 py-1 text-[12px] font-semibold tracking-[0.12em] uppercase shrink-0"
          style={importanceStyle(req.importance)}
        >
          {importanceLabel(req.importance)}
        </span>
        {coaching?.previously_approved && (
          <span className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-semibold tracking-[0.12em] uppercase bg-[var(--badge-green-bg)] text-[var(--badge-green-text)] border border-[var(--badge-green-text)]/30 shrink-0">
            <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
            Previously approved
          </span>
        )}
      </button>

      {/* Expanded content */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-300',
          expanded ? 'max-h-[1200px] opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="px-4 pb-4">
          <div className="support-callout border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-4">
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-soft)]">What still needs to be clearer</p>
                <p className="mt-2 text-base leading-7 text-[var(--text-muted)]">{issueText}</p>
              </div>

              {(bestEvidence || relatedEvidence.length > 0) && (
                <div className="border-t border-[var(--line-soft)] pt-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-soft)]">Best evidence on your resume</p>
                  {bestEvidence ? (
                    <>
                      {bestEvidenceSection && (
                        <p className="mt-2 text-xs leading-5 text-[var(--text-soft)]">{bestEvidenceSection}</p>
                      )}
                      <p className="mt-1 text-base leading-7 text-[var(--text-muted)]">{bestEvidence}</p>
                    </>
                  ) : (
                    <p className="mt-2 text-base leading-7 text-[var(--text-soft)]">
                      We do not have a strong line on the resume for this yet.
                    </p>
                  )}

                  {relatedEvidence.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-soft)]">Other related evidence</p>
                      {relatedEvidence.map((evidence, index) => (
                        <p key={`${evidence}-${index}`} className="text-sm leading-6 text-[var(--text-soft)]">
                          {evidence}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {req.strategy && (
                <div
                  className="relative overflow-hidden rounded-lg border pl-4 pr-4 py-4"
                  style={{
                    borderColor: `color-mix(in srgb, ${accentColor} 13%, transparent)`,
                    backgroundColor: `color-mix(in srgb, ${accentColor} 4%, transparent)`,
                  }}
                >
                  <div
                    className="absolute left-0 inset-y-0 w-[3px] rounded-l-lg"
                    style={{ background: `linear-gradient(to bottom, ${accentColor}, transparent)` }}
                  />
                  <div className="flex items-center gap-1.5">
                    <Lightbulb
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: `color-mix(in srgb, ${accentColor} 75%, transparent)` }}
                    />
                    <span
                      className="text-xs font-semibold uppercase tracking-[0.14em]"
                      style={{ color: `color-mix(in srgb, ${accentColor} 75%, transparent)` }}
                    >
                      Draft to start from
                    </span>
                  </div>
                  <p className="mt-3 text-lg leading-8 text-[var(--text-strong)]">{req.strategy.positioning}</p>

                  {req.strategy.inferred_metric && (
                    <div className="mt-3 flex items-start gap-1.5 border-t border-[var(--line-soft)] pt-3">
                      <Ruler className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--badge-amber-text)]/70" />
                      <div className="text-sm leading-6">
                        <span className="text-[var(--badge-amber-text)]/84">{req.strategy.inferred_metric}</span>
                        {req.strategy.inference_rationale && (
                          <span className="ml-1.5 text-[var(--text-soft)]">— {req.strategy.inference_rationale}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* JD / benchmark source evidence — shown when coaching card has it */}
          {hasCoaching && coaching.source_evidence && (
            <div className="mt-3 rounded-[12px] border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3.5 py-2.5">
              <div className="text-[12px] font-bold text-[var(--text-soft)] uppercase tracking-widest mb-1">
                {req.source === 'benchmark' ? 'From the benchmark profile' : req.source === 'job_description' ? 'From the job description' : 'Why this matters'}
              </div>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed italic">&ldquo;{coaching.source_evidence}&rdquo;</p>
            </div>
          )}

          {/* Alternative bullet phrasing picker */}
          {hasCoaching && coaching.alternative_bullets && coaching.alternative_bullets.length > 0 && (
            <div className="mt-3">
              <div className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider mb-2">
                Alternative phrasings
              </div>
              <div className="space-y-1.5">
                {coaching.alternative_bullets.map((alt, altIdx) => (
                  <button
                    key={altIdx}
                    type="button"
                    disabled={disabled}
                    onClick={() => onCoachingChange({
                      selectedAlternativeIndex: coachingState.selectedAlternativeIndex === altIdx ? null : altIdx,
                      editMode: 'none',
                      editedText: '',
                    })}
                    className={cn(
                      'w-full text-left rounded-[10px] border px-3 py-2 transition-colors',
                      coachingState.selectedAlternativeIndex === altIdx
                        ? 'border-[var(--link)]/40 bg-[var(--badge-blue-bg)]'
                        : 'border-[var(--line-soft)] bg-[var(--surface-1)] hover:border-[var(--line-strong)]',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className={cn(
                        'mt-1 h-3 w-3 shrink-0 rounded-full border-2 transition-colors',
                        coachingState.selectedAlternativeIndex === altIdx
                          ? 'border-[var(--link)] bg-[var(--link)]'
                          : 'border-[var(--text-soft)]',
                      )} />
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                          {alt.angle}
                        </span>
                        <p className="text-sm text-[var(--text-muted)] leading-relaxed mt-0.5">{alt.text}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Edit textarea for selected alternative */}
              <div
                className={cn(
                  'overflow-hidden transition-all duration-300',
                  coachingState.editMode !== 'none' ? 'max-h-40 mt-2 opacity-100' : 'max-h-0 mt-0 opacity-0',
                )}
              >
                <textarea
                  value={coachingState.editedText}
                  onChange={e => onCoachingChange({ editedText: e.target.value })}
                  disabled={disabled}
                  placeholder={coachingState.editMode === 'write-own' ? 'Write your own bullet…' : 'Edit the selected alternative…'}
                  rows={3}
                  className="w-full rounded-[12px] border border-[var(--link)]/20 bg-[var(--badge-blue-bg)] px-3 py-2 text-sm text-[var(--text-strong)] placeholder-[var(--text-soft)] resize-none focus:outline-none focus:border-[var(--link)]/40 transition-colors"
                  aria-label={`Edit bullet for: ${req.requirement}`}
                />
              </div>
            </div>
          )}

          {/* Coaching context: structured questions or generic textarea */}
          {hasCoaching && coachingState.showContextInput && (
            <div className="mt-3 space-y-3">
              {questions.length > 0 ? (
                /* Structured interview questions */
                questions.map((q, qi) => (
                  <div key={qi} className="rounded-lg border border-[var(--link)]/15 bg-[var(--badge-blue-bg)] px-3 py-2.5">
                    <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-1.5">{q.question}</p>
                    <p className="text-[12px] text-[var(--text-soft)] mb-2 italic">{q.looking_for}</p>
                    <textarea
                      value={coachingState.questionAnswers[qi] ?? ''}
                      onChange={e => onCoachingChange({
                        questionAnswers: { ...coachingState.questionAnswers, [qi]: e.target.value },
                      })}
                      disabled={disabled}
                      placeholder="Your answer..."
                      rows={2}
                      className="w-full rounded-md border border-[var(--link)]/20 bg-[var(--surface-1)] px-2.5 py-1.5 text-sm text-[var(--text-muted)] placeholder-[var(--text-soft)] resize-none focus:outline-none focus:border-[var(--link)]/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label={`Answer for: ${q.question}`}
                    />
                  </div>
                ))
              ) : (
                /* Fallback: generic textarea */
                <textarea
                  value={coachingState.contextText}
                  onChange={e => onCoachingChange({ contextText: e.target.value })}
                  disabled={disabled}
                  placeholder={coachingPrompt ?? "Share any relevant experience, projects, or context that wasn't in your resume..."}
                  rows={3}
                  className="w-full rounded-lg border border-[var(--link)]/20 bg-[var(--badge-blue-bg)] px-3 py-2 text-sm text-[var(--text-muted)] placeholder-[var(--text-soft)] resize-none focus:outline-none focus:border-[var(--link)]/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={`Additional context for: ${req.requirement}`}
                />
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            {/* Post-completion edit buttons (strong items) */}
            {classification === 'strong' && isComplete && onRequestEdit && currentResume && (
              <>
                <button
                  type="button"
                  onClick={handleStrengthen}
                  className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium uppercase tracking-[0.12em] bg-[var(--badge-green-bg)] text-[var(--badge-green-text)] border border-[var(--badge-green-text)]/20 hover:border-[var(--badge-green-text)]/40 transition-colors"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Strengthen
                </button>
                <button
                  type="button"
                  onClick={handleAddMetrics}
                  className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium uppercase tracking-[0.12em] bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)] border border-[var(--badge-amber-text)]/20 hover:border-[var(--badge-amber-text)]/40 transition-colors"
                >
                  <Ruler className="h-3.5 w-3.5" />
                  Add Metrics
                </button>
              </>
            )}

            {/* Coaching action buttons (partial/missing items) */}
            {hasCoaching && !isResponded && (
              <>
                {/* Use selected alternative */}
                {coachingState.selectedAlternativeIndex !== null && coachingState.editMode === 'none' && !coachingState.showPlacementPicker && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      const alt = coaching.alternative_bullets?.[coachingState.selectedAlternativeIndex!];
                      onCoachingChange({ action: 'approve', editedText: alt?.text ?? '', showContextInput: false, showPlacementPicker: false });
                    }}
                    className="flex items-center gap-1.5 rounded-[12px] px-3 py-2 text-xs font-medium bg-[var(--badge-green-bg)] text-[var(--badge-green-text)] border border-[var(--badge-green-text)]/25 hover:border-[var(--badge-green-text)]/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label={`Use selected alternative for: ${req.requirement}`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Use this one
                  </button>
                )}

                {/* Edit selected alternative */}
                {coachingState.selectedAlternativeIndex !== null && coachingState.editMode === 'none' && !coachingState.showPlacementPicker && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      const alt = coaching.alternative_bullets?.[coachingState.selectedAlternativeIndex!];
                      onCoachingChange({ editMode: 'edit-alternative', editedText: alt?.text ?? '' });
                    }}
                    className="flex items-center gap-1.5 rounded-[12px] px-3 py-2 text-xs font-medium bg-[var(--surface-1)] text-[var(--text-soft)] border border-[var(--line-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--text-muted)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Edit
                  </button>
                )}

                {/* Submit edited text */}
                {coachingState.editMode !== 'none' && !coachingState.showPlacementPicker && (
                  <>
                    <button
                      type="button"
                      disabled={disabled || !coachingState.editedText.trim()}
                      onClick={() => onCoachingChange({ action: 'approve', showContextInput: false, showPlacementPicker: false })}
                      className="flex items-center gap-1.5 rounded-[12px] px-3 py-2 text-xs font-medium bg-[var(--badge-blue-bg)] text-[var(--link)] border border-[var(--link)]/30 hover:bg-[var(--link)]/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {coachingState.editedText.trim() ? 'Use this' : 'Type above…'}
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onCoachingChange({ editMode: 'none', editedText: '' })}
                      className="text-xs text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors px-1"
                    >
                      Cancel
                    </button>
                  </>
                )}

                {/* Placement picker — shown after clicking "Use this draft" */}
                {coachingState.showPlacementPicker && (
                  <div className="w-full mb-2 rounded-lg border border-[var(--link)]/20 bg-[var(--badge-blue-bg)] px-3 py-2.5 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 text-[var(--link)]/70 shrink-0" />
                      <span className="text-[12px] font-semibold text-[var(--link)]/70 uppercase tracking-wider">
                        Where should this appear?
                      </span>
                    </div>
                    <select
                      value={coachingState.target_section === 'experience' && coachingState.target_company
                        ? `experience:${coachingState.target_company}`
                        : coachingState.target_section}
                      onChange={e => {
                        const val = e.target.value;
                        if (val.startsWith('experience:')) {
                          onCoachingChange({ target_section: 'experience', target_company: val.slice('experience:'.length) });
                        } else {
                          onCoachingChange({ target_section: val as GapPlacementTarget, target_company: '' });
                        }
                      }}
                      disabled={disabled}
                      className="w-full rounded-md border border-[var(--link)]/20 bg-[var(--surface-1)] px-2.5 py-1.5 text-sm text-[var(--text-strong)] focus:outline-none focus:border-[var(--link)]/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label="Choose placement section"
                    >
                      <option value="auto">Auto (recommended)</option>
                      <option value="summary">Executive Summary</option>
                      <option value="competencies">Core Competencies</option>
                      <option value="accomplishments">Selected Accomplishments</option>
                      {experienceCompanies.length > 0
                        ? experienceCompanies.map(company => (
                            <option key={company} value={`experience:${company}`}>
                              Experience — {company}
                            </option>
                          ))
                        : <option value="experience">Experience (most recent role)</option>
                      }
                    </select>
                    <div className="flex items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onCoachingChange({ action: 'approve', showPlacementPicker: false, showContextInput: false })}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium bg-[var(--badge-blue-bg)] text-[var(--link)] border border-[var(--link)]/30 hover:bg-[var(--link)]/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label={`Confirm strategy placement for: ${req.requirement}`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Confirm
                      </button>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onCoachingChange({ showPlacementPicker: false })}
                        className="text-xs text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed px-1"
                        aria-label="Cancel placement selection"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Approve — opens placement picker */}
                {!coachingState.showPlacementPicker && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onCoachingChange({ showPlacementPicker: true, showContextInput: false })}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium bg-[var(--badge-blue-bg)] text-[var(--link)] border border-[var(--link)]/20 hover:bg-[var(--link)]/20 hover:border-[var(--link)]/35 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label={`Approve strategy for: ${req.requirement}`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Use this draft
                  </button>
                )}

                {/* Context toggle/submit — hidden when placement picker is open */}
                {!coachingState.showPlacementPicker && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (coachingState.showContextInput) {
                        // Check for answers: structured questions or fallback textarea
                        const hasAnswers = Object.values(coachingState.questionAnswers).some(a => a.trim());
                        const hasText = coachingState.contextText.trim();
                        if (hasAnswers || hasText) {
                          onCoachingChange({ action: 'context', showContextInput: false });
                        }
                      } else {
                        onCoachingChange({ showContextInput: true });
                      }
                    }}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium uppercase tracking-[0.12em] border transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                      coachingState.showContextInput
                        ? 'bg-[var(--badge-blue-bg)] text-[var(--link)] border-[var(--link)]/30 hover:bg-[var(--link)]/25'
                        : 'bg-[var(--accent-muted)] text-[var(--text-soft)] border-[var(--line-soft)] hover:bg-[var(--surface-1)] hover:text-[var(--text-muted)]',
                    )}
                    aria-label={
                      coachingState.showContextInput
                        ? `Submit context for: ${req.requirement}`
                        : `Add context for: ${req.requirement}`
                    }
                    aria-expanded={coachingState.showContextInput}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    {coachingState.showContextInput
                      ? (Object.values(coachingState.questionAnswers).some(a => a.trim()) || coachingState.contextText.trim())
                        ? 'Submit context'
                        : 'Answer above...'
                        : 'Tell us one more detail'}
                  </button>
                )}

                {/* Cancel context */}
                {coachingState.showContextInput && !coachingState.showPlacementPicker && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onCoachingChange({ showContextInput: false, contextText: '', questionAnswers: {} })}
                    className="text-xs text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed px-1"
                    aria-label="Cancel adding context"
                  >
                    Cancel
                  </button>
                )}

                {/* Skip — hidden when placement picker is open */}
                {!coachingState.showPlacementPicker && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onCoachingChange({ action: 'skip', showContextInput: false })}
                    title="This gap won't be addressed on your resume."
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-[var(--text-soft)] border border-transparent hover:text-[var(--text-muted)] hover:border-[var(--line-soft)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                      !coachingState.showContextInput && 'ml-auto',
                    )}
                    aria-label={`Skip gap for: ${req.requirement}`}
                  >
                    <SkipForward className="h-3.5 w-3.5" />
                    Skip
                  </button>
                )}

              </>
            )}

            {/* Post-completion "Apply to Resume" for partial/missing (after pipeline done, if no coaching) */}
            {!hasCoaching && isComplete && onRequestEdit && currentResume && req.strategy && classification !== 'strong' && (
              <button
                type="button"
                onClick={handleApplyToResume}
                className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium uppercase tracking-[0.12em] bg-[var(--badge-blue-bg)] text-[var(--link)] border border-[var(--link)]/20 hover:bg-[var(--link)]/20 transition-colors"
              >
                <Lightbulb className="h-3.5 w-3.5" />
                Use this draft
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RequirementInventory({
  requirements,
  currentResume,
  positioningAssessment,
}: {
  requirements: RequirementGap[];
  currentResume?: ResumeDraft | null;
  positioningAssessment?: PositioningAssessment | null;
}) {
  const groups = [
    {
      key: 'job_description' as const,
      title: 'Job Description Requirements',
      description: sourceDescription('job_description'),
      items: requirements.filter((item) => (item.source ?? 'job_description') === 'job_description'),
    },
    {
      key: 'benchmark' as const,
      title: 'Benchmark Requirements',
      description: sourceDescription('benchmark'),
      items: requirements.filter((item) => item.source === 'benchmark'),
    },
  ].filter((group) => group.items.length > 0);

  if (groups.length === 0) return null;

  return (
    <div className="space-y-4">
      <AiHelperHint
        title="What You’re Matching"
        body="This is the full inventory of what we found. Start here to see what came directly from the job description, what came from the benchmark, what is already covered, and what still needs stronger proof."
        tip="Start by reviewing what came from the job description and what came from the benchmark. Then move into guided editing to strengthen the highest-value gaps one at a time."
      />

      {groups.map((group) => (
        <div key={group.key} className="room-shell space-y-3 px-4 py-4">
          <div className="space-y-1">
            <div className="room-meta-strip">
              <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--text-soft)]">
                {group.title}
              </span>
              <span className="text-[12px] text-[var(--text-soft)]">({group.items.length})</span>
            </div>
            <p className="text-sm leading-6 text-[var(--text-soft)]">{group.description}</p>
          </div>

          <div className="space-y-2">
            {group.items.map((item) => {
              const mappedEvidence = currentResume
                ? findBulletForRequirement(item.requirement, positioningAssessment, currentResume)
                : null;

              return (
                <div
                  key={`${group.key}:${item.requirement}`}
                  className="support-callout px-3 py-3 transition-colors hover:bg-[var(--surface-1)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium leading-6 text-[var(--text-strong)]">{item.requirement}</span>
                        <span
                          className="rounded-md border px-2 py-0.5 text-[12px] uppercase tracking-[0.12em]"
                          style={importanceStyle(item.importance)}
                        >
                          {importanceLabel(item.importance)}
                        </span>
                        <span className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2 py-0.5 text-[12px] uppercase tracking-[0.12em] text-[var(--text-soft)]">
                          {requirementSourceLabel(item.source)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[var(--text-soft)]">
                        {mappedEvidence
                          ? `Currently shown in ${mappedEvidence.section}: ${shortenText(mappedEvidence.text)}`
                          : 'Not clearly mapped to a specific line in the current resume yet.'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          'rounded-md border px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.12em]',
                          item.classification === 'strong'
                            ? 'border-[var(--badge-green-text)]/20 bg-[var(--badge-green-bg)] text-[var(--badge-green-text)]/85'
                            : item.classification === 'partial'
                              ? 'border-[var(--link)]/20 bg-[var(--badge-blue-bg)] text-[var(--link)]/88'
                              : 'border-[var(--badge-red-text)]/20 bg-[var(--badge-red-bg)] text-[var(--badge-red-text)]/88',
                        )}
                      >
                        {requirementStatusLabel(item.classification)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Section group ──────────────────────────────────────────────────

function SectionGroup({
  classification,
  requirements,
  coachingLookup,
  coachingStates,
  onCoachingChange,
  onRequestEdit,
  currentResume,
  isComplete,
  disabled,
  positioningAssessment,
  experienceCompanies,
}: {
  classification: GapClassification;
  requirements: RequirementGap[];
  coachingLookup: Map<string, { card: GapCoachingCard; index: number }>;
  coachingStates: CoachingState[];
  onCoachingChange: (index: number, patch: Partial<CoachingState>) => void;
  onRequestEdit?: UnifiedGapAnalysisCardProps['onRequestEdit'];
  currentResume?: ResumeDraft | null;
  isComplete?: boolean;
  disabled?: boolean;
  positioningAssessment?: PositioningAssessment | null;
  experienceCompanies?: string[];
}) {
  if (requirements.length === 0) return null;

  const config = SECTION_CONFIG[classification];
  const Icon = config.icon;

  return (
    <section className="space-y-3">
      <div className="room-meta-strip">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: config.accent }} />
        <span className="text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: config.accent }}>
          {config.label}
        </span>
        <span className="text-[12px] text-[var(--text-soft)]">({requirements.length})</span>
      </div>
      <p className="text-sm leading-6 text-[var(--text-soft)]">
        {classification === 'strong'
          ? 'These requirements are already represented well enough on the current resume.'
          : classification === 'partial'
            ? 'These are the best places to improve next because the resume is close, but the proof still needs to be clearer.'
            : 'These requirements are not clearly covered yet. Use the suggested draft carefully and keep it honest.'}
      </p>
      <div className="space-y-2">
        {requirements.map((req, i) => {
          const match = coachingLookup.get(normalizeRequirement(req.requirement));
          return (
            <RequirementRow
              key={`${classification}-${i}`}
              req={req}
              coaching={match?.card}
              coachingState={match ? coachingStates[match.index] : undefined}
              onCoachingChange={match ? (patch) => onCoachingChange(match.index, patch) : undefined}
              onRequestEdit={onRequestEdit}
              currentResume={currentResume}
              isComplete={isComplete}
              classification={classification}
              disabled={disabled}
              positioningAssessment={positioningAssessment}
              experienceCompanies={experienceCompanies}
            />
          );
        })}
      </div>
    </section>
  );
}

// ─── Main component ─────────────────────────────────────────────────

export function UnifiedGapAnalysisCard({
  gapAnalysis,
  gapCoachingCards,
  companyName,
  roleTitle,
  onRespondGapCoaching,
  onRequestEdit,
  currentResume,
  isComplete,
  disabled = false,
  positioningAssessment,
  experienceCompanies = [],
}: UnifiedGapAnalysisCardProps) {
  const strong = useMemo(() => gapAnalysis.requirements.filter(r => r.classification === 'strong'), [gapAnalysis]);
  const partial = useMemo(() => gapAnalysis.requirements.filter(r => r.classification === 'partial'), [gapAnalysis]);
  const missing = useMemo(() => gapAnalysis.requirements.filter(r => r.classification === 'missing'), [gapAnalysis]);

  // Build coaching lookup by normalized requirement name (tolerates whitespace/case variance)
  const coachingLookup = useMemo(() => buildCoachingLookup(gapCoachingCards), [gapCoachingCards]);

  // Coaching state tracking — reset is handled by `key` prop at call site
  const [coachingStates, setCoachingStates] = useState<CoachingState[]>(() =>
      (gapCoachingCards ?? []).map(() => ({
        action: null,
        contextText: '',
        showContextInput: false,
        questionAnswers: {},
        showPlacementPicker: false,
        target_section: 'auto' as GapPlacementTarget,
        target_company: '',
        selectedAlternativeIndex: null,
        editMode: 'none' as const,
        editedText: '',
      })),
  );

  const hasCoaching = gapCoachingCards !== null && gapCoachingCards.length > 0;
  const allResponded = hasCoaching && coachingStates.every(s => s.action !== null);
  const respondedCount = coachingStates.filter(s => s.action !== null).length;

  function patchCoachingState(index: number, patch: Partial<CoachingState>) {
    setCoachingStates(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function handleContinue() {
    if (!gapCoachingCards) return;
    const responses: GapCoachingResponse[] = gapCoachingCards.map((card, i) => {
      const s = coachingStates[i];
      const resp: GapCoachingResponse = {
        requirement: card.requirement,
        action: s.action ?? 'skip',
      };
      if (s.action === 'approve') {
        // If user selected or edited an alternative bullet, pass the text as user_context
        if (s.editMode !== 'none' && s.editedText.trim()) {
          resp.user_context = s.editedText.trim();
        } else if (s.selectedAlternativeIndex !== null) {
          const alt = card.alternative_bullets?.[s.selectedAlternativeIndex];
          if (alt?.text) resp.user_context = alt.text;
        }
        if (s.target_section && s.target_section !== 'auto') {
          resp.target_section = s.target_section;
          if (s.target_section === 'experience' && s.target_company) {
            resp.target_company = s.target_company;
          }
        }
      } else if (s.action === 'context') {
        // Build context from structured Q&A pairs when available
        const questions = coachingQuestions(card);
        const qaParts: string[] = [];
        for (const [idx, answer] of Object.entries(s.questionAnswers)) {
          if (answer.trim()) {
            const q = questions[Number(idx)];
            qaParts.push(`Q: ${q?.question ?? 'Additional context'}\nA: ${answer.trim()}`);
          }
        }
        if (qaParts.length > 0) {
          resp.user_context = qaParts.join('\n\n');
        } else if (s.contextText.trim()) {
          resp.user_context = s.contextText.trim();
        }
      }
      return resp;
    });
    onRespondGapCoaching(responses);
  }

  const title = companyName && roleTitle
    ? `Your Alignment with ${companyName} — ${roleTitle}`
    : 'Gap Analysis';

  return (
    <div className="room-shell space-y-6 px-5 py-5">
      {/* Section A: Score Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="eyebrow-label">Requirement Coverage</div>
            <h3 className="text-lg font-semibold tracking-tight text-[var(--text-strong)]">{title}</h3>
          </div>
          <div className="support-callout min-w-[120px] px-4 py-3 text-right">
            <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--text-soft)]">Coverage</div>
            <span className="text-3xl font-semibold tracking-tight text-[var(--text-strong)]">{gapAnalysis.coverage_score}%</span>
          </div>
        </div>
        <p className="text-sm text-[var(--text-soft)] mb-3">{gapAnalysis.strength_summary}</p>

        {/* Stacked bar */}
        {gapAnalysis.requirements.length > 0 && (
          <div className="h-2.5 w-full overflow-hidden flex bg-[var(--surface-1)]">
            {strong.length > 0 && (
              <div
                className="h-full bg-[var(--badge-green-text)] transition-all duration-700"
                style={{ width: `${(strong.length / gapAnalysis.requirements.length) * 100}%` }}
              />
            )}
            {partial.length > 0 && (
              <div
                className="h-full bg-[var(--link)] transition-all duration-700"
                style={{ width: `${(partial.length / gapAnalysis.requirements.length) * 100}%` }}
              />
            )}
            {missing.length > 0 && (
              <div
                className="h-full bg-[var(--badge-red-text)] transition-all duration-700"
                style={{ width: `${(missing.length / gapAnalysis.requirements.length) * 100}%` }}
              />
            )}
          </div>
        )}

        {/* Legend */}
        <div className="room-meta-strip mt-2 gap-3 text-xs">
          <span className="flex items-center gap-1 text-[var(--badge-green-text)]"><CheckCircle2 className="h-3 w-3" /> {strong.length} strong match{strong.length !== 1 ? 'es' : ''}</span>
          <span className="flex items-center gap-1 text-[var(--link)]"><AlertTriangle className="h-3 w-3" /> {partial.length} to strengthen</span>
          <span className="flex items-center gap-1 text-[var(--badge-red-text)]"><XCircle className="h-3 w-3" /> {missing.length} gap{missing.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <RequirementInventory
        requirements={gapAnalysis.requirements}
        currentResume={currentResume}
        positioningAssessment={positioningAssessment}
      />

      {/* Coaching progress bar */}
      {hasCoaching && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">Review Progress</span>
            <span className="text-xs text-[var(--text-soft)]">{respondedCount} / {gapCoachingCards.length} reviewed</span>
          </div>
          <div className="h-1 w-full overflow-hidden bg-[var(--surface-1)]">
            <div
              className="h-full bg-gradient-to-r from-[var(--link)] to-[var(--badge-green-text)] transition-all duration-500"
              style={{ width: gapCoachingCards.length > 0 ? `${(respondedCount / gapCoachingCards.length) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* Section B: Strong */}
      <SectionGroup
        classification="strong"
        requirements={strong}
        coachingLookup={coachingLookup}
        coachingStates={coachingStates}
        onCoachingChange={patchCoachingState}
        onRequestEdit={onRequestEdit}
        currentResume={currentResume}
        isComplete={isComplete}
        disabled={disabled}
        positioningAssessment={positioningAssessment}
        experienceCompanies={experienceCompanies}
      />

      {/* Section C: Partial */}
      <SectionGroup
        classification="partial"
        requirements={partial}
        coachingLookup={coachingLookup}
        coachingStates={coachingStates}
        onCoachingChange={patchCoachingState}
        onRequestEdit={onRequestEdit}
        currentResume={currentResume}
        isComplete={isComplete}
        disabled={disabled}
        positioningAssessment={positioningAssessment}
        experienceCompanies={experienceCompanies}
      />

      {/* Section D: Missing */}
      <SectionGroup
        classification="missing"
        requirements={missing}
        coachingLookup={coachingLookup}
        coachingStates={coachingStates}
        onCoachingChange={patchCoachingState}
        onRequestEdit={onRequestEdit}
        currentResume={currentResume}
        isComplete={isComplete}
        disabled={disabled}
        positioningAssessment={positioningAssessment}
        experienceCompanies={experienceCompanies}
      />

      {/* Section E: Critical Gaps */}
      {gapAnalysis.critical_gaps.length > 0 && (
        <div className="space-y-3">
          <div className="room-meta-strip">
            <Shield className="h-3.5 w-3.5 text-[var(--badge-red-text)] shrink-0" />
            <span className="text-[12px] font-semibold text-[var(--badge-red-text)] uppercase tracking-[0.16em]">
              Critical Gaps
            </span>
            <span className="text-[12px] text-[var(--text-soft)] ml-1">({gapAnalysis.critical_gaps.length})</span>
          </div>
          <div className="space-y-1.5">
            {gapAnalysis.critical_gaps.map((gap, i) => (
              <div
                key={i}
                className="support-callout border-[var(--badge-red-text)]/20 bg-[var(--badge-red-bg)] px-3 py-2.5 text-sm text-[var(--text-soft)]"
              >
                {gap}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Continue button (coaching gate) */}
      {hasCoaching && (
        <div className="pt-2">
          <button
            type="button"
            disabled={!allResponded || disabled}
            onClick={handleContinue}
            className={cn(
              'w-full flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium uppercase tracking-[0.12em] transition-all disabled:opacity-30 disabled:cursor-not-allowed',
              allResponded && !disabled
                ? 'bg-[var(--badge-blue-bg)] text-[var(--link)] border border-[var(--link)]/20 hover:bg-[var(--link)]/20 hover:border-[var(--link)]/35'
                : 'border border-[var(--line-soft)] text-[var(--text-soft)]',
            )}
            aria-disabled={!allResponded || disabled}
            aria-label="Continue to resume writing"
          >
            Continue to resume drafting
            <ArrowRight className="h-4 w-4" />
          </button>
          {!allResponded && (
            <p className="text-center text-xs text-[var(--text-soft)] mt-2">
              Review all {gapCoachingCards.length} items to continue
            </p>
          )}
          {allResponded && coachingStates.every(s => s.action === 'skip') && (
            <div className="support-callout mt-3 px-4 py-3">
              <p className="text-sm text-[var(--text-soft)]">
                Your resume will highlight your direct matches — no inferred positioning will be used.
              </p>
              <p className="text-xs text-[var(--text-soft)] mt-1">
                You can add context anytime to unlock new strategies.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
