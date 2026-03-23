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
}

// ─── Helpers ────────────────────────────────────────────────────────

function classificationIcon(c: GapClassification) {
  if (c === 'strong') return <CheckCircle2 className="h-3.5 w-3.5 text-[#b5dec2] shrink-0" />;
  if (c === 'partial') return <AlertTriangle className="h-3.5 w-3.5 text-[#f0d99f] shrink-0" />;
  return <XCircle className="h-3.5 w-3.5 text-[#f0b8b8] shrink-0" />;
}

const SECTION_CONFIG = {
  strong: {
    accent: '#b5dec2',
    label: 'Already covered',
    icon: CheckCircle2,
  },
  partial: {
    accent: '#afc4ff',
    label: 'Needs stronger proof',
    icon: AlertTriangle,
  },
  missing: {
    accent: '#f0b8b8',
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
}

function RequirementRow({
  req, coaching, coachingState, onCoachingChange,
  onRequestEdit, currentResume, isComplete, classification, disabled,
  positioningAssessment,
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
      approve: { dot: <span className="h-2 w-2 bg-[#b5dec2] shrink-0" />, label: 'Draft queued', color: 'text-[#b5dec2]' },
      context: { dot: <MessageSquare className="h-3 w-3 text-[#afc4ff] shrink-0" />, label: 'More context added', color: 'text-[#afc4ff]' },
      skip: { dot: <Minus className="h-3 w-3 text-white/30 shrink-0" />, label: 'Left as-is', color: 'text-white/35' },
    }[coachingState!.action!];

    return (
      <div
        className="support-callout px-3 py-2.5 flex items-center gap-3 transition-all duration-300"
        data-coaching-requirement={req.requirement}
      >
        {statusConfig.dot}
        <span className="flex-1 min-w-0 text-sm text-white/50 truncate">{req.requirement}</span>
        <span className={cn('text-xs font-medium shrink-0', statusConfig.color)}>{statusConfig.label}</span>
        <ChevronRight className="h-3.5 w-3.5 text-white/20 shrink-0" />
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
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
        aria-expanded={expanded}
      >
        <ChevronDown
          className={cn(
            'h-3 w-3 text-white/30 shrink-0 transition-transform duration-200',
            expanded ? 'rotate-0' : '-rotate-90',
          )}
          aria-hidden="true"
        />
        {classificationIcon(classification)}
        <div className="min-w-0 flex-1">
          <span className="block text-base text-white/84 leading-snug truncate">{req.requirement}</span>
          <span className="mt-1 block text-sm leading-6 text-white/50">
            {classification === 'strong'
              ? 'This requirement already has solid proof on the current resume.'
              : classification === 'partial'
                ? 'There is some proof on the resume, but it needs a stronger story.'
                : 'This requirement still needs a believable bridge from your experience.'}
          </span>
        </div>
        <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/45 shrink-0">
          {requirementSourceLabel(req.source)}
        </span>
        <span
          className="inline-flex items-center rounded-md px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase shrink-0"
          style={importanceStyle(req.importance)}
        >
          {importanceLabel(req.importance)}
        </span>
        {coaching?.previously_approved && (
          <span className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase bg-[#b5dec2]/20 text-[#b5dec2] border border-[#b5dec2]/30 shrink-0">
            <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
            Previously approved
          </span>
        )}
      </button>

      {/* Expanded content */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-300',
          expanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="px-4 pb-4">
          <div className="support-callout border-white/[0.08] bg-white/[0.03] px-4 py-4">
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-white/42">What still needs to be clearer</p>
                <p className="mt-2 text-base leading-7 text-white/78">{issueText}</p>
              </div>

              {(bestEvidence || relatedEvidence.length > 0) && (
                <div className="border-t border-white/[0.06] pt-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/42">Best evidence on your resume</p>
                  {bestEvidence ? (
                    <>
                      {bestEvidenceSection && (
                        <p className="mt-2 text-xs leading-5 text-white/42">{bestEvidenceSection}</p>
                      )}
                      <p className="mt-1 text-base leading-7 text-white/76">{bestEvidence}</p>
                    </>
                  ) : (
                    <p className="mt-2 text-base leading-7 text-white/58">
                      We do not have a strong line on the resume for this yet.
                    </p>
                  )}

                  {relatedEvidence.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs uppercase tracking-[0.14em] text-white/34">Other related evidence</p>
                      {relatedEvidence.map((evidence, index) => (
                        <p key={`${evidence}-${index}`} className="text-sm leading-6 text-white/58">
                          {evidence}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {req.strategy && (
                <div
                  className="relative overflow-hidden rounded-lg border border-[#afc4ff]/18 bg-[#afc4ff]/[0.04] pl-4 pr-4 py-4"
                  style={{ borderColor: `${accentColor}22` }}
                >
                  <div
                    className="absolute left-0 inset-y-0 w-[3px] rounded-l-lg"
                    style={{ background: `linear-gradient(to bottom, ${accentColor}, transparent)` }}
                  />
                  <div className="flex items-center gap-1.5">
                    <Lightbulb className="h-3.5 w-3.5 shrink-0" style={{ color: `${accentColor}C0` }} />
                    <span
                      className="text-xs font-semibold uppercase tracking-[0.14em]"
                      style={{ color: `${accentColor}C0` }}
                    >
                      Draft to start from
                    </span>
                  </div>
                  <p className="mt-3 text-lg leading-8 text-white/84">{req.strategy.positioning}</p>

                  {req.strategy.inferred_metric && (
                    <div className="mt-3 flex items-start gap-1.5 border-t border-white/[0.06] pt-3">
                      <Ruler className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f0d99f]/70" />
                      <div className="text-sm leading-6">
                        <span className="text-[#f0d99f]/84">{req.strategy.inferred_metric}</span>
                        {req.strategy.inference_rationale && (
                          <span className="ml-1.5 text-white/36">— {req.strategy.inference_rationale}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Coaching context: structured questions or generic textarea */}
          {hasCoaching && coachingState.showContextInput && (
            <div className="mt-3 space-y-3">
              {questions.length > 0 ? (
                /* Structured interview questions */
                questions.map((q, qi) => (
                  <div key={qi} className="rounded-lg border border-[#afc4ff]/15 bg-[#afc4ff]/[0.03] px-3 py-2.5">
                    <p className="text-sm text-white/80 leading-relaxed mb-1.5">{q.question}</p>
                    <p className="text-[10px] text-white/30 mb-2 italic">{q.looking_for}</p>
                    <textarea
                      value={coachingState.questionAnswers[qi] ?? ''}
                      onChange={e => onCoachingChange({
                        questionAnswers: { ...coachingState.questionAnswers, [qi]: e.target.value },
                      })}
                      disabled={disabled}
                      placeholder="Your answer..."
                      rows={2}
                      className="w-full rounded-md border border-[#afc4ff]/20 bg-white/[0.03] px-2.5 py-1.5 text-sm text-white/80 placeholder-white/20 resize-none focus:outline-none focus:border-[#afc4ff]/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                  className="w-full rounded-lg border border-[#afc4ff]/20 bg-[#afc4ff]/[0.04] px-3 py-2 text-sm text-white/80 placeholder-white/25 resize-none focus:outline-none focus:border-[#afc4ff]/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                  className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium uppercase tracking-[0.12em] bg-[#b5dec2]/10 text-[#b5dec2] border border-[#b5dec2]/20 hover:bg-[#b5dec2]/20 transition-colors"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Strengthen
                </button>
                <button
                  type="button"
                  onClick={handleAddMetrics}
                  className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium uppercase tracking-[0.12em] bg-[#f0d99f]/10 text-[#f0d99f] border border-[#f0d99f]/20 hover:bg-[#f0d99f]/20 transition-colors"
                >
                  <Ruler className="h-3.5 w-3.5" />
                  Add Metrics
                </button>
              </>
            )}

            {/* Coaching action buttons (partial/missing items) */}
            {hasCoaching && !isResponded && (
              <>
                {/* Approve */}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onCoachingChange({ action: 'approve', showContextInput: false })}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium bg-[#afc4ff]/10 text-[#afc4ff] border border-[#afc4ff]/20 hover:bg-[#afc4ff]/20 hover:border-[#afc4ff]/35 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={`Approve strategy for: ${req.requirement}`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Use this draft
                </button>

                {/* Context toggle/submit */}
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
                      ? 'bg-[#afc4ff]/15 text-[#afc4ff] border-[#afc4ff]/30 hover:bg-[#afc4ff]/25'
                      : 'bg-white/[0.04] text-white/60 border-white/[0.08] hover:bg-white/[0.07] hover:text-white/80',
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
                    : 'Tell AI one more detail'}
                </button>

                {/* Cancel context */}
                {coachingState.showContextInput && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onCoachingChange({ showContextInput: false, contextText: '', questionAnswers: {} })}
                    className="text-xs text-white/35 hover:text-white/55 transition-colors disabled:opacity-40 disabled:cursor-not-allowed px-1"
                    aria-label="Cancel adding context"
                  >
                    Cancel
                  </button>
                )}

                {/* Skip */}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onCoachingChange({ action: 'skip', showContextInput: false })}
                  title="This gap won't be addressed on your resume."
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white/35 border border-transparent hover:text-white/55 hover:border-white/[0.06] transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                    !coachingState.showContextInput && 'ml-auto',
                  )}
                  aria-label={`Skip gap for: ${req.requirement}`}
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  Skip
                </button>

              </>
            )}

            {/* Post-completion "Apply to Resume" for partial/missing (after pipeline done, if no coaching) */}
            {!hasCoaching && isComplete && onRequestEdit && currentResume && req.strategy && classification !== 'strong' && (
              <button
                type="button"
                onClick={handleApplyToResume}
                className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium uppercase tracking-[0.12em] bg-[#afc4ff]/10 text-[#afc4ff] border border-[#afc4ff]/20 hover:bg-[#afc4ff]/20 transition-colors"
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
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/44">
                {group.title}
              </span>
              <span className="text-[10px] text-white/30">({group.items.length})</span>
            </div>
            <p className="text-sm leading-6 text-white/56">{group.description}</p>
          </div>

          <div className="space-y-2">
            {group.items.map((item) => {
              const mappedEvidence = currentResume
                ? findBulletForRequirement(item.requirement, positioningAssessment, currentResume)
                : null;

              return (
                <div
                  key={`${group.key}:${item.requirement}`}
                  className="support-callout px-3 py-3 transition-colors hover:bg-white/[0.05]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium leading-6 text-white/84">{item.requirement}</span>
                        <span
                          className="rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]"
                          style={importanceStyle(item.importance)}
                        >
                          {importanceLabel(item.importance)}
                        </span>
                        <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/48">
                          {requirementSourceLabel(item.source)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-white/50">
                        {mappedEvidence
                          ? `Currently shown in ${mappedEvidence.section}: ${shortenText(mappedEvidence.text)}`
                          : 'Not clearly mapped to a specific line in the current resume yet.'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          'rounded-md border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]',
                          item.classification === 'strong'
                            ? 'border-[#b5dec2]/20 bg-[#b5dec2]/[0.07] text-[#b5dec2]/85'
                            : item.classification === 'partial'
                              ? 'border-[#afc4ff]/20 bg-[#afc4ff]/[0.08] text-[#afc4ff]/88'
                              : 'border-[#f0b8b8]/20 bg-[#f0b8b8]/[0.08] text-[#f0b8b8]/88',
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
}) {
  if (requirements.length === 0) return null;

  const config = SECTION_CONFIG[classification];
  const Icon = config.icon;

  return (
    <section className="space-y-3">
      <div className="room-meta-strip">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: config.accent }} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: config.accent }}>
          {config.label}
        </span>
        <span className="text-[10px] text-white/30">({requirements.length})</span>
      </div>
      <p className="text-sm leading-6 text-white/54">
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
}: UnifiedGapAnalysisCardProps) {
  const strong = useMemo(() => gapAnalysis.requirements.filter(r => r.classification === 'strong'), [gapAnalysis]);
  const partial = useMemo(() => gapAnalysis.requirements.filter(r => r.classification === 'partial'), [gapAnalysis]);
  const missing = useMemo(() => gapAnalysis.requirements.filter(r => r.classification === 'missing'), [gapAnalysis]);

  // Build coaching lookup by normalized requirement name (tolerates whitespace/case variance)
  const coachingLookup = useMemo(() => buildCoachingLookup(gapCoachingCards), [gapCoachingCards]);

  // Coaching state tracking — reset is handled by `key` prop at call site
  const [coachingStates, setCoachingStates] = useState<CoachingState[]>(() =>
      (gapCoachingCards ?? []).map(() => ({ action: null, contextText: '', showContextInput: false, questionAnswers: {} })),
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
      if (s.action === 'context') {
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
            <h3 className="text-lg font-semibold tracking-tight text-white/90">{title}</h3>
          </div>
          <div className="support-callout min-w-[120px] px-4 py-3 text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Coverage</div>
            <span className="text-3xl font-semibold tracking-tight text-white/90">{gapAnalysis.coverage_score}%</span>
          </div>
        </div>
        <p className="text-sm text-white/60 mb-3">{gapAnalysis.strength_summary}</p>

        {/* Stacked bar */}
        {gapAnalysis.requirements.length > 0 && (
          <div className="h-2.5 w-full overflow-hidden flex bg-white/[0.06]">
            {strong.length > 0 && (
              <div
                className="h-full bg-[#b5dec2] transition-all duration-700"
                style={{ width: `${(strong.length / gapAnalysis.requirements.length) * 100}%` }}
              />
            )}
            {partial.length > 0 && (
              <div
                className="h-full bg-[#afc4ff] transition-all duration-700"
                style={{ width: `${(partial.length / gapAnalysis.requirements.length) * 100}%` }}
              />
            )}
            {missing.length > 0 && (
              <div
                className="h-full bg-[#f0b8b8] transition-all duration-700"
                style={{ width: `${(missing.length / gapAnalysis.requirements.length) * 100}%` }}
              />
            )}
          </div>
        )}

        {/* Legend */}
        <div className="room-meta-strip mt-2 gap-3 text-xs">
          <span className="flex items-center gap-1 text-[#b5dec2]"><CheckCircle2 className="h-3 w-3" /> {strong.length} strong match{strong.length !== 1 ? 'es' : ''}</span>
          <span className="flex items-center gap-1 text-[#afc4ff]"><AlertTriangle className="h-3 w-3" /> {partial.length} to strengthen</span>
          <span className="flex items-center gap-1 text-[#f0b8b8]"><XCircle className="h-3 w-3" /> {missing.length} gap{missing.length !== 1 ? 's' : ''}</span>
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
            <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Review Progress</span>
            <span className="text-xs text-white/40">{respondedCount} / {gapCoachingCards!.length} reviewed</span>
          </div>
          <div className="h-1 w-full overflow-hidden bg-white/[0.06]">
            <div
              className="h-full bg-gradient-to-r from-[#afc4ff] to-[#b5dec2] transition-all duration-500"
              style={{ width: gapCoachingCards!.length > 0 ? `${(respondedCount / gapCoachingCards!.length) * 100}%` : '0%' }}
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
      />

      {/* Section E: Critical Gaps */}
      {gapAnalysis.critical_gaps.length > 0 && (
        <div className="space-y-3">
          <div className="room-meta-strip">
            <Shield className="h-3.5 w-3.5 text-[#f0b8b8] shrink-0" />
            <span className="text-[10px] font-semibold text-[#f0b8b8] uppercase tracking-[0.16em]">
              Critical Gaps
            </span>
            <span className="text-[10px] text-white/30 ml-1">({gapAnalysis.critical_gaps.length})</span>
          </div>
          <div className="space-y-1.5">
            {gapAnalysis.critical_gaps.map((gap, i) => (
              <div
                key={i}
                className="support-callout border-[#f0b8b8]/20 bg-[#f0b8b8]/[0.04] px-3 py-2.5 text-sm text-white/60"
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
                ? 'bg-[#afc4ff]/10 text-[#afc4ff] border border-[#afc4ff]/20 hover:bg-[#afc4ff]/20 hover:border-[#afc4ff]/35'
                : 'border border-white/[0.06] text-white/30',
            )}
            aria-disabled={!allResponded || disabled}
            aria-label="Continue to resume writing"
          >
            Continue to resume drafting
            <ArrowRight className="h-4 w-4" />
          </button>
          {!allResponded && (
            <p className="text-center text-xs text-white/30 mt-2">
              Review all {gapCoachingCards!.length} items to continue
            </p>
          )}
          {allResponded && coachingStates.every(s => s.action === 'skip') && (
            <div className="support-callout mt-3 px-4 py-3">
              <p className="text-sm text-white/60">
                Your resume will highlight your direct matches — no inferred positioning will be used.
              </p>
              <p className="text-xs text-white/35 mt-1">
                You can add context anytime to unlock new strategies.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
