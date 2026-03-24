/**
 * GapQuestionFlow — A clean, focused one-question-at-a-time gap collection UI.
 *
 * Appears as a separate step during processing, after the scoring report lands
 * and before resume generation begins. Replaces the 47KB UnifiedGapAnalysisCard
 * for the pre-generation question phase.
 *
 * The component converts GapCoachingCard data (the existing SSE format) into a
 * simplified question flow. One question per screen, progress dots, three actions.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { GapCoachingCard, GapCoachingResponse } from '@/types/resume-v2';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface GapQuestion {
  id: string;
  requirement: string;
  importance: 'critical' | 'important' | 'supporting';
  classification: 'partial' | 'missing';
  question: string;
  context: string;
  currentEvidence: string[];
}

export interface GapQuestionResponse {
  questionId: string;
  action: 'answered' | 'skipped';
  answer?: string;
}

interface GapQuestionFlowProps {
  questions: GapQuestion[];
  onComplete: (responses: GapQuestionResponse[]) => void;
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
  }[importance];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${config.className}`}
    >
      {config.label}
    </span>
  );
}

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

// ─── Main Component ───────────────────────────────────────────────────────────

export function GapQuestionFlow({ questions, onComplete }: GapQuestionFlowProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<GapQuestionResponse[]>([]);
  const [answer, setAnswer] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const isLastQuestion = currentIndex === totalQuestions - 1;

  // Focus the textarea when the question changes
  useEffect(() => {
    textareaRef.current?.focus();
  }, [currentIndex]);

  const advance = useCallback(
    (response: GapQuestionResponse) => {
      const updatedResponses = [...responses, response];
      setResponses(updatedResponses);
      setAnswer('');

      if (isLastQuestion) {
        onComplete(updatedResponses);
      } else {
        setCurrentIndex((prev) => prev + 1);
      }
    },
    [responses, isLastQuestion, onComplete],
  );

  const handleSubmit = useCallback(() => {
    if (!currentQuestion) return;
    const trimmed = answer.trim();
    advance({
      questionId: currentQuestion.id,
      action: trimmed.length > 0 ? 'answered' : 'skipped',
      answer: trimmed.length > 0 ? trimmed : undefined,
    });
  }, [currentQuestion, answer, advance]);

  const handleSkip = useCallback(() => {
    if (!currentQuestion) return;
    advance({ questionId: currentQuestion.id, action: 'skipped' });
  }, [currentQuestion, advance]);

  const handleSkipAll = useCallback(() => {
    // Build responses for all remaining questions as skipped
    const remaining = questions.slice(currentIndex);
    const skippedResponses: GapQuestionResponse[] = remaining.map((q) => ({
      questionId: q.id,
      action: 'skipped',
    }));
    const allResponses = [...responses, ...skippedResponses];
    onComplete(allResponses);
  }, [questions, currentIndex, responses, onComplete]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ctrl+Enter or Cmd+Enter submits
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  if (!currentQuestion) return null;

  const answeredCount = responses.filter((r) => r.action === 'answered').length;

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
              Before we write your resume, help us close a few gaps.
            </p>
          </div>
          <span className="shrink-0 text-[12px] font-medium text-neutral-400 tabular-nums">
            Question {currentIndex + 1}/{totalQuestions}
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
              &ldquo;{currentQuestion.requirement}&rdquo;
            </p>
            <PriorityBadge importance={currentQuestion.importance} />
          </div>
        </div>

        {/* Context explanation */}
        {currentQuestion.context && (
          <p className="text-[14px] text-neutral-500 leading-relaxed mb-4">
            {currentQuestion.context}
          </p>
        )}

        {/* Current evidence chips (partial classification only) */}
        {currentQuestion.classification === 'partial' && currentQuestion.currentEvidence.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-1.5">
              Evidence found so far
            </p>
            <div className="flex flex-wrap gap-1.5">
              {currentQuestion.currentEvidence.slice(0, 4).map((ev, i) => (
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

        {/* The question itself */}
        <div className="mb-4">
          <p className="text-[15px] font-medium text-neutral-800 leading-snug mb-3">
            {currentQuestion.question}
          </p>
          <textarea
            ref={textareaRef}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe a specific example, project, or outcome..."
            rows={4}
            className="w-full resize-none rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-[14px] text-neutral-800 placeholder-neutral-400 leading-relaxed focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors"
            aria-label={`Answer for: ${currentQuestion.requirement}`}
          />
          <p className="mt-1 text-[11px] text-neutral-400">
            Press Ctrl+Enter to submit
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-blue-700 active:bg-blue-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {answer.trim().length > 0 ? 'Submit Answer' : 'Skip This One'}
          </button>

          {answer.trim().length > 0 && (
            <button
              type="button"
              onClick={handleSkip}
              className="rounded-lg border border-neutral-200 px-4 py-2.5 text-[14px] font-medium text-neutral-600 hover:bg-neutral-50 hover:border-neutral-300 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
            >
              Skip This One
            </button>
          )}

          {totalQuestions > 1 && (
            <button
              type="button"
              onClick={handleSkipAll}
              className="ml-auto rounded-lg px-4 py-2.5 text-[13px] font-medium text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300"
            >
              Skip All &rarr;
            </button>
          )}
        </div>
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
