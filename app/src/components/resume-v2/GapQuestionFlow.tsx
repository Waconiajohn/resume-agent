/**
 * GapQuestionFlow — AI-assisted positioning confirmation flow.
 *
 * Each card shows the AI's proposed positioning draft pre-filled in the
 * textarea. The user confirms, edits, or skips. When no proposed strategy
 * exists (true hard gap), falls back to the original empty-textarea mode.
 *
 * Converts GapCoachingCard data (existing SSE format) into a focused
 * one-card-at-a-time confirmation flow.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { GapAnalysis, GapCoachingCard, GapCoachingResponse, PreScores } from '@/types/resume-v2';
import { GapOverviewCard } from './cards/GapOverviewCard';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface GapQuestion {
  id: string;
  requirement: string;
  importance: 'critical' | 'important' | 'supporting';
  classification: 'partial' | 'missing';
  question: string;
  context: string;
  currentEvidence: string[];
  // AI-generated positioning data
  proposedStrategy?: string;
  aiReasoning?: string;
  inferredMetric?: string;
  inferenceRationale?: string;
}

export interface GapQuestionResponse {
  questionId: string;
  action: 'answered' | 'skipped';
  answer?: string;
}

interface GapQuestionFlowProps {
  questions: GapQuestion[];
  /** When provided, an overview card is shown before the first question (index -1). */
  gapAnalysis?: GapAnalysis | null;
  /** Pre-optimization ATS scores — merged into the overview card. */
  preScores?: PreScores | null;
  onComplete: (responses: GapQuestionResponse[]) => void;
  /** Optional: enables AI assist buttons on cards. Returns improved text or null. */
  onAssist?: (
    requirement: string,
    classification: string,
    action: 'strengthen' | 'add_metrics' | 'rewrite',
    currentDraft: string,
    evidence: string[],
    aiReasoning?: string,
    signal?: AbortSignal,
  ) => Promise<string | null>;
}

// ─── Conversion Helper ────────────────────────────────────────────────────────
// Converts the existing GapCoachingCard SSE format into GapQuestion shape.

export function coachingCardsToQuestions(cards: GapCoachingCard[]): GapQuestion[] {
  return cards
    .filter(
      (card): card is GapCoachingCard & { classification: 'partial' | 'missing' } =>
        card.classification === 'partial' || card.classification === 'missing',
    )
    .map((card, index) => {
      const importanceNormalized = normalizeImportance(card.importance);

      // Use the coaching_policy clarifying question if available; fall back to
      // the first interview question; last resort: generate a generic prompt.
      const question =
        card.coaching_policy?.clarifyingQuestion
        ?? card.interview_questions?.[0]?.question
        ?? `Do you have direct experience with "${card.requirement}"? If so, describe a specific example and the outcome.`;

      const context = buildContext(card);

      return {
        id: `gap-q-${index}`,
        requirement: card.requirement,
        importance: importanceNormalized,
        classification: card.classification,
        question,
        context,
        currentEvidence: card.evidence_found,
        proposedStrategy: card.proposed_strategy || undefined,
        aiReasoning: card.ai_reasoning || undefined,
        inferredMetric: card.inferred_metric,
        inferenceRationale: card.inference_rationale,
      };
    });
}

// Converts GapCoachingCard importance to the three-tier importance scheme.
function normalizeImportance(
  importance: GapCoachingCard['importance'],
): GapQuestion['importance'] {
  switch (importance) {
    case 'must_have': return 'critical';
    case 'important': return 'important';
    case 'nice_to_have': return 'supporting';
    default: return 'supporting';
  }
}

function buildContext(card: GapCoachingCard): string {
  const parts: string[] = [];

  if (card.classification === 'partial' && card.evidence_found.length > 0) {
    parts.push(
      'We found partial evidence in your resume but need more detail to position you strongly.',
    );
  } else if (card.classification === 'missing') {
    parts.push(
      'This requirement does not appear in your current resume. Any relevant experience here could strengthen your positioning.',
    );
  }

  if (card.coaching_policy?.lookingFor) {
    parts.push(`We are looking for: ${card.coaching_policy.lookingFor}`);
  } else if (card.interview_questions?.[0]?.looking_for) {
    parts.push(`We are looking for: ${card.interview_questions[0].looking_for}`);
  }

  return parts.join(' ');
}

// ─── Converts GapQuestionResponse[] back to GapCoachingResponse[] for the pipeline ─

export function questionResponsesToCoachingResponses(
  responses: GapQuestionResponse[],
  questions: GapQuestion[],
): GapCoachingResponse[] {
  return responses.map((r) => {
    const question = questions.find((q) => q.id === r.questionId);
    if (!question) return { requirement: r.questionId, action: 'skip' };

    if (r.action === 'skipped') {
      return { requirement: question.requirement, action: 'skip' };
    }

    return {
      requirement: question.requirement,
      action: 'context',
      user_context: r.answer,
    };
  });
}

// ─── Priority Badge ───────────────────────────────────────────────────────────

function PriorityBadge({ importance }: { importance: GapQuestion['importance'] }) {
  const config = {
    critical: { label: 'Critical', className: 'bg-red-50 text-red-700 border-red-200' },
    important: { label: 'Important', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    supporting: { label: 'Supporting', className: 'bg-neutral-100 text-neutral-600 border-neutral-200' },
  }[importance] ?? { label: importance, className: 'bg-neutral-100 text-neutral-600 border-neutral-200' };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${config.className}`}
    >
      {config.label}
    </span>
  );
}

// ─── Importance Explanations ──────────────────────────────────────────────────

const IMPORTANCE_EXPLANATIONS: Record<string, string> = {
  critical: 'This is a must-have requirement. Missing it may disqualify your application.',
  must_have: 'This is a must-have requirement. Missing it may disqualify your application.',
  important: 'This requirement is important to the hiring manager. Addressing it significantly strengthens your candidacy.',
  nice_to_have: 'This is a nice-to-have. Addressing it gives you an edge over other candidates.',
  supporting: 'This is a supporting requirement. Addressing it gives you an edge over other candidates.',
};

// ─── Progress Dots ────────────────────────────────────────────────────────────

function ProgressDots({
  total,
  currentIndex,
  responses,
}: {
  total: number;
  currentIndex: number;
  responses: GapQuestionResponse[];
}) {
  return (
    <div className="flex items-center gap-1.5" aria-label="Question progress" role="status">
      {Array.from({ length: total }, (_, i) => {
        const response = responses[i];
        const isDone = response !== undefined;
        const isCurrent = i === currentIndex;
        const wasAnswered = isDone && response.action === 'answered';
        const wasSkipped = isDone && response.action === 'skipped';

        let dotClass = 'h-2 w-2 rounded-full flex-shrink-0 ';
        let label: string;

        if (wasAnswered) {
          dotClass += 'bg-emerald-500';
          label = `Question ${i + 1}: answered`;
        } else if (wasSkipped) {
          dotClass += 'bg-neutral-300';
          label = `Question ${i + 1}: skipped`;
        } else if (isCurrent) {
          dotClass += 'bg-blue-500 ring-2 ring-blue-300 ring-offset-1';
          label = `Question ${i + 1}: current`;
        } else {
          dotClass += 'border border-neutral-300 bg-white';
          label = `Question ${i + 1}: pending`;
        }

        return (
          <span
            key={i}
            className={dotClass}
            aria-label={label}
          />
        );
      })}
    </div>
  );
}

// ─── AI-Assisted Card ─────────────────────────────────────────────────────────
// Rendered when proposedStrategy is present.

interface AIAssistedCardProps {
  question: GapQuestion;
  currentIndex: number;
  totalQuestions: number;
  responses: GapQuestionResponse[];
  onUseThis: (text: string) => void;
  onSkip: () => void;
  onSkipAll: () => void;
  onAssist?: (
    requirement: string,
    classification: string,
    action: 'strengthen' | 'add_metrics' | 'rewrite',
    currentDraft: string,
    evidence: string[],
    aiReasoning?: string,
    signal?: AbortSignal,
  ) => Promise<string | null>;
}

function AIAssistedCard({
  question,
  currentIndex,
  totalQuestions,
  responses,
  onUseThis,
  onSkip,
  onSkipAll,
  onAssist,
}: AIAssistedCardProps) {
  const [draftText, setDraftText] = useState(question.proposedStrategy ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset draft and assist state when question changes
  useEffect(() => {
    setDraftText(question.proposedStrategy ?? '');
    setAssistError(false);
    textareaRef.current?.focus();
  }, [question.id, question.proposedStrategy]);

  const isUnmodified = draftText.trim() === (question.proposedStrategy ?? '').trim();
  const answeredCount = responses.filter((r) => r.action === 'answered').length;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onUseThis(draftText.trim());
      }
    },
    [draftText, onUseThis],
  );

  // AI assist state
  const [isAssistLoading, setIsAssistLoading] = useState(false);
  const [assistAction, setAssistAction] = useState<'strengthen' | 'add_metrics' | 'rewrite' | null>(null);
  const [assistError, setAssistError] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Abort in-flight AI assist when question changes or component unmounts
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, [question.id]);

  const handleAssist = useCallback(
    async (action: 'strengthen' | 'add_metrics' | 'rewrite') => {
      if (!onAssist || isAssistLoading) return;
      // Abort any previous in-flight request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsAssistLoading(true);
      setAssistAction(action);
      setAssistError(false);
      try {
        const result = await onAssist(
          question.requirement,
          question.classification,
          action,
          draftText,
          question.currentEvidence,
          question.aiReasoning,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (result) {
          setDraftText(result);
        } else {
          setAssistError(true);
        }
      } catch {
        if (controller.signal.aborted) return;
        setAssistError(true);
      } finally {
        if (!controller.signal.aborted) {
          setIsAssistLoading(false);
          setAssistAction(null);
        }
      }
    },
    [onAssist, isAssistLoading, draftText, question],
  );

  return (
    <div
      className="bg-white rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.35)] overflow-hidden"
      role="main"
      aria-label={`Positioning draft ${currentIndex + 1} of ${totalQuestions}`}
    >
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-neutral-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-1">
              We've drafted positioning for your top gaps — confirm or strengthen each one
            </p>
          </div>
          <span className="shrink-0 text-[12px] font-medium text-neutral-400 tabular-nums">
            {currentIndex + 1} of {totalQuestions}
          </span>
        </div>
      </div>

      {/* Card body */}
      <div className="px-6 py-5 space-y-4">
        {/* Requirement label */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-1.5">
            Requirement
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-semibold text-neutral-800 leading-snug">
              &ldquo;{question.requirement}&rdquo;
            </p>
            <PriorityBadge importance={question.importance} />
          </div>
          {IMPORTANCE_EXPLANATIONS[question.importance] && (
            <p className="text-[12px] text-neutral-500 mt-1 leading-relaxed">
              {IMPORTANCE_EXPLANATIONS[question.importance]}
            </p>
          )}
        </div>

        {/* What we found */}
        {question.currentEvidence.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-1.5">
              What we found
            </p>
            <div className="bg-neutral-50 border border-neutral-200 rounded-lg px-4 py-3">
              {question.currentEvidence.slice(0, 3).map((ev, i) => (
                <p key={i} className="text-[13px] text-neutral-600 leading-relaxed italic">
                  {i > 0 && <span className="block h-1.5" />}
                  &ldquo;{ev}&rdquo;
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Why this was flagged */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-1.5">
            Why this was flagged
          </p>
          <p className="text-[13px] text-neutral-600 leading-relaxed">
            {question.classification === 'partial'
              ? 'We found related experience in your resume, but it doesn\'t fully demonstrate this requirement. Our AI identified adjacent skills that can strengthen your positioning.'
              : 'This requirement doesn\'t appear directly in your resume. However, we found transferable experience in your background that can be positioned to address it.'}
          </p>
        </div>

        {/* Our suggested positioning */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-1.5">
            Our suggested positioning
          </p>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
            <p className="text-[13px] text-emerald-800 leading-relaxed font-medium">
              {question.proposedStrategy}
            </p>
          </div>
          <p className="text-[11px] text-neutral-400 leading-relaxed mt-2">
            When you confirm, this positioning will be woven naturally into your resume bullets — it won&apos;t appear as a separate section or footnote.
          </p>
        </div>

        {/* AI assist buttons */}
        {onAssist && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mr-1">
              AI Assist
            </span>
            {(['strengthen', 'add_metrics', 'rewrite'] as const).map((action) => {
              const labels: Record<string, string> = {
                strengthen: 'Strengthen',
                add_metrics: 'Add Metrics',
                rewrite: 'Rewrite',
              };
              const isActive = isAssistLoading && assistAction === action;
              return (
                <button
                  key={action}
                  type="button"
                  disabled={isAssistLoading}
                  onClick={() => handleAssist(action)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${
                    isActive
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : isAssistLoading
                        ? 'border-neutral-200 bg-neutral-50 text-neutral-300 cursor-not-allowed'
                        : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:border-neutral-300'
                  }`}
                >
                  {isActive && (
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
                  )}
                  {labels[action]}
                </button>
              );
            })}
          </div>
        )}
        {assistError && (
          <p className="text-[12px] text-red-500">
            AI assist didn&apos;t return a result. Try again or edit manually.
          </p>
        )}

        {/* Why */}
        {question.aiReasoning && (
          <div className="flex gap-2">
            <span className="shrink-0 text-[13px] text-amber-500 mt-0.5" aria-hidden="true">
              &#9888;
            </span>
            <p className="text-[12px] text-neutral-500 leading-relaxed italic">
              <span className="font-semibold not-italic text-neutral-600">Why: </span>
              {question.aiReasoning}
            </p>
          </div>
        )}

        {/* Inferred metric notice */}
        {question.inferredMetric && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex gap-2.5 items-start">
            <span className="shrink-0 text-blue-500 text-[13px] mt-0.5" aria-hidden="true">&#9432;</span>
            <p className="text-[12px] text-blue-700 leading-relaxed">
              <span className="font-semibold">We inferred {question.inferredMetric}</span> from
              your experience
              {question.inferenceRationale ? ` (${question.inferenceRationale})` : ''}.
              {' '}Confirm this is accurate, or update the number below.
            </p>
          </div>
        )}

        {/* Edit or confirm textarea */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-1.5">
            Edit or confirm
          </p>
          <textarea
            ref={textareaRef}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={4}
            className="w-full resize-none rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-[14px] text-neutral-800 leading-relaxed focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors"
            aria-label={`Positioning text for: ${question.requirement}`}
          />
          {question.inferredMetric ? (
            <p className="mt-1 text-[11px] text-neutral-400">
              If you have exact numbers (incident rates, hours, certifications), update them above to make this even stronger.
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-neutral-400">
              If you have specific numbers or details, add them above to make this even stronger.
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 flex-wrap pt-1">
          {isUnmodified ? (
            <button
              type="button"
              onClick={() => onUseThis(draftText.trim())}
              disabled={draftText.trim().length === 0 || isAssistLoading}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-40"
            >
              Use This
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onUseThis(draftText.trim())}
                disabled={draftText.trim().length === 0 || isAssistLoading}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-blue-700 active:bg-blue-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-40"
              >
                Edit &amp; Submit
              </button>
              <button
                type="button"
                onClick={() => onUseThis((question.proposedStrategy ?? '').trim())}
                className="rounded-lg border border-neutral-200 px-4 py-2.5 text-[14px] font-medium text-neutral-500 hover:bg-neutral-50 hover:border-neutral-300 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
              >
                Use Original
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onSkip}
            className="rounded-lg border border-neutral-200 px-4 py-2.5 text-[14px] font-medium text-neutral-500 hover:bg-neutral-50 hover:border-neutral-300 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
          >
            Skip
          </button>

          {totalQuestions > 1 && (
            <button
              type="button"
              onClick={onSkipAll}
              className="ml-auto rounded-lg px-4 py-2.5 text-[13px] font-medium text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300"
            >
              Skip All &rarr;
            </button>
          )}
        </div>

        <p className="text-[11px] text-neutral-400 mt-3 pt-3 border-t border-neutral-100">
          All choices apply to this resume only. Your master resume is never modified.
        </p>
      </div>

      {/* Footer — progress */}
      <div className="px-6 py-4 border-t border-neutral-100 flex items-center justify-between gap-4">
        <ProgressDots
          total={totalQuestions}
          currentIndex={currentIndex}
          responses={responses}
        />

        {answeredCount > 0 && (
          <p className="text-[12px] text-neutral-400 shrink-0">
            {answeredCount} confirmed
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Fallback Card ────────────────────────────────────────────────────────────
// Rendered when no proposedStrategy exists (hard gap / truly missing skill).

interface FallbackCardProps {
  question: GapQuestion;
  currentIndex: number;
  totalQuestions: number;
  responses: GapQuestionResponse[];
  onSubmit: (text: string | undefined) => void;
  onSkip: () => void;
  onSkipAll: () => void;
}

function FallbackCard({
  question,
  currentIndex,
  totalQuestions,
  responses,
  onSubmit,
  onSkip,
  onSkipAll,
}: FallbackCardProps) {
  const [answer, setAnswer] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setAnswer('');
    textareaRef.current?.focus();
  }, [question.id]);

  const answeredCount = responses.filter((r) => r.action === 'answered').length;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        const trimmed = answer.trim();
        onSubmit(trimmed.length > 0 ? trimmed : undefined);
      }
    },
    [answer, onSubmit],
  );

  return (
    <div
      className="bg-white rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.35)] overflow-hidden"
      role="main"
      aria-label={`Gap question ${currentIndex + 1} of ${totalQuestions}`}
    >
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-neutral-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-1">
              We need your help with this one
            </p>
          </div>
          <span className="shrink-0 text-[12px] font-medium text-neutral-400 tabular-nums">
            {currentIndex + 1} of {totalQuestions}
          </span>
        </div>
      </div>

      {/* Question body */}
      <div className="px-6 py-5">
        {/* Requirement label */}
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-1.5">
            Requirement
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-semibold text-neutral-800 leading-snug">
              &ldquo;{question.requirement}&rdquo;
            </p>
            <PriorityBadge importance={question.importance} />
          </div>
          {IMPORTANCE_EXPLANATIONS[question.importance] && (
            <p className="text-[12px] text-neutral-500 mt-1 leading-relaxed">
              {IMPORTANCE_EXPLANATIONS[question.importance]}
            </p>
          )}
        </div>

        {/* Context explanation */}
        {question.context && (
          <p className="text-[14px] text-neutral-500 leading-relaxed mb-4">
            {question.context}
          </p>
        )}

        {/* Current evidence chips (partial classification only) */}
        {question.classification === 'partial' && question.currentEvidence.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-1.5">
              Evidence found so far
            </p>
            <div className="flex flex-wrap gap-1.5">
              {question.currentEvidence.slice(0, 4).map((ev, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-[12px] text-blue-700"
                >
                  {ev.length > 60 ? `${ev.slice(0, 60)}...` : ev}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Why this was flagged */}
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-1.5">
            Why this was flagged
          </p>
          <p className="text-[13px] text-neutral-600 leading-relaxed">
            We could not find adjacent experience to auto-draft positioning for this requirement. Your direct input will help us create effective positioning.
          </p>
        </div>

        {/* The question itself */}
        <div className="mb-4">
          <p className="text-[15px] font-medium text-neutral-800 leading-snug mb-3">
            {question.question}
          </p>
          <textarea
            ref={textareaRef}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe a specific example, project, or outcome..."
            rows={4}
            className="w-full resize-none rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-[14px] text-neutral-800 placeholder-neutral-400 leading-relaxed focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors"
            aria-label={`Answer for: ${question.requirement}`}
          />
          <p className="mt-1 text-[11px] text-neutral-400">
            Press Ctrl+Enter to submit
          </p>
          <p className="text-[11px] text-neutral-400 leading-relaxed mt-2">
            When you confirm, this positioning will be woven naturally into your resume bullets — it won&apos;t appear as a separate section or footnote.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => {
              const trimmed = answer.trim();
              onSubmit(trimmed.length > 0 ? trimmed : undefined);
            }}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-blue-700 active:bg-blue-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {answer.trim().length > 0 ? 'Submit Answer' : 'Skip This One'}
          </button>

          {answer.trim().length > 0 && (
            <button
              type="button"
              onClick={onSkip}
              className="rounded-lg border border-neutral-200 px-4 py-2.5 text-[14px] font-medium text-neutral-600 hover:bg-neutral-50 hover:border-neutral-300 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
            >
              Skip This One
            </button>
          )}

          {totalQuestions > 1 && (
            <button
              type="button"
              onClick={onSkipAll}
              className="ml-auto rounded-lg px-4 py-2.5 text-[13px] font-medium text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300"
            >
              Skip All &rarr;
            </button>
          )}
        </div>

        <p className="text-[11px] text-neutral-400 mt-3 pt-3 border-t border-neutral-100">
          All choices apply to this resume only. Your master resume is never modified.
        </p>
      </div>

      {/* Footer — progress */}
      <div className="px-6 py-4 border-t border-neutral-100 flex items-center justify-between gap-4">
        <ProgressDots
          total={totalQuestions}
          currentIndex={currentIndex}
          responses={responses}
        />

        {answeredCount > 0 && (
          <p className="text-[12px] text-neutral-400 shrink-0">
            {answeredCount} answered
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function GapQuestionFlow({ questions, gapAnalysis, preScores, onComplete, onAssist }: GapQuestionFlowProps) {
  const [currentIndex, setCurrentIndex] = useState(gapAnalysis ? -1 : 0);
  const [responses, setResponses] = useState<GapQuestionResponse[]>([]);
  const [overviewCollapsed, setOverviewCollapsed] = useState(false);

  const isReviewing = currentIndex >= 0;
  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const isLastQuestion = currentIndex === totalQuestions - 1;

  // Auto-collapse overview when the first question starts
  useEffect(() => {
    if (isReviewing) setOverviewCollapsed(true);
  }, [isReviewing]);

  const advance = useCallback(
    (response: GapQuestionResponse) => {
      const updatedResponses = [...responses, response];
      setResponses(updatedResponses);

      if (isLastQuestion) {
        onComplete(updatedResponses);
      } else {
        setCurrentIndex((prev) => prev + 1);
      }
    },
    [responses, isLastQuestion, onComplete],
  );

  const handleUseThis = useCallback(
    (text: string) => {
      if (!currentQuestion) return;
      advance({
        questionId: currentQuestion.id,
        action: 'answered',
        answer: text,
      });
    },
    [currentQuestion, advance],
  );

  const handleFallbackSubmit = useCallback(
    (text: string | undefined) => {
      if (!currentQuestion) return;
      advance({
        questionId: currentQuestion.id,
        action: text ? 'answered' : 'skipped',
        answer: text,
      });
    },
    [currentQuestion, advance],
  );

  const handleSkip = useCallback(() => {
    if (!currentQuestion) return;
    advance({ questionId: currentQuestion.id, action: 'skipped' });
  }, [currentQuestion, advance]);

  const handleSkipAll = useCallback(() => {
    const remaining = questions.slice(currentIndex);
    const skippedResponses: GapQuestionResponse[] = remaining.map((q) => ({
      questionId: q.id,
      action: 'skipped',
    }));
    const allResponses = [...responses, ...skippedResponses];
    onComplete(allResponses);
  }, [questions, currentIndex, responses, onComplete]);

  // Build question card (null when still on overview at index -1)
  let questionCard: React.ReactNode = null;
  if (isReviewing && currentQuestion) {
    if (currentQuestion.proposedStrategy) {
      questionCard = (
        <AIAssistedCard
          question={currentQuestion}
          currentIndex={currentIndex}
          totalQuestions={totalQuestions}
          responses={responses}
          onUseThis={handleUseThis}
          onSkip={handleSkip}
          onSkipAll={handleSkipAll}
          onAssist={onAssist}
        />
      );
    } else {
      questionCard = (
        <FallbackCard
          question={currentQuestion}
          currentIndex={currentIndex}
          totalQuestions={totalQuestions}
          responses={responses}
          onSubmit={handleFallbackSubmit}
          onSkip={handleSkip}
          onSkipAll={handleSkipAll}
        />
      );
    }
  }

  return (
    <div className="space-y-4">
      {gapAnalysis && (
        <GapOverviewCard
          gapAnalysis={gapAnalysis}
          preScores={preScores}
          questionCount={questions.length}
          onBeginReview={() => setCurrentIndex(0)}
          collapsed={overviewCollapsed}
          onToggleCollapse={() => setOverviewCollapsed((prev) => !prev)}
          isReviewing={isReviewing}
        />
      )}
      {questionCard}
    </div>
  );
}
