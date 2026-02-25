import { useState, useCallback, useEffect } from 'react';
import { ArrowLeft, ArrowRight, SkipForward } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { GlassTextarea } from '../GlassInput';
import { cn } from '@/lib/utils';
import type { QuestionnaireData } from '@/types/panels';
import type { QuestionnaireResponse, QuestionnaireSubmission } from '@/types/session';
import { QuestionnaireOption } from './questionnaire/QuestionnaireOption';
import { RatingInput } from './questionnaire/RatingInput';
import { ProgressHeader } from './questionnaire/ProgressHeader';

interface QuestionnairePanelProps {
  data: QuestionnaireData;
  onComplete: (submission: QuestionnaireSubmission) => void;
}

// ─── Dependency check ────────────────────────────────────────────────────────

function shouldShowQuestion(
  questionIndex: number,
  questions: QuestionnaireData['questions'],
  responses: QuestionnaireResponse[],
): boolean {
  const question = questions[questionIndex];
  if (!question.depends_on) return true;

  const { question_id, condition, value } = question.depends_on;
  const dep = responses.find((r) => r.question_id === question_id);
  // Do not show dependent questions until the parent question has a response.
  if (!dep) return false;

  const answered = dep.selected_option_ids.includes(value) || dep.custom_text === value;
  return condition === 'equals' ? answered : !answered;
}

// Build the ordered list of visible question indices given current responses
function getVisibleIndices(
  questions: QuestionnaireData['questions'],
  responses: QuestionnaireResponse[],
): number[] {
  return questions.reduce<number[]>((acc, _, i) => {
    if (shouldShowQuestion(i, questions, responses)) acc.push(i);
    return acc;
  }, []);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildEmptyResponse(questionId: string): QuestionnaireResponse {
  return { question_id: questionId, selected_option_ids: [], skipped: false };
}

export function QuestionnairePanel({ data, onComplete }: QuestionnairePanelProps) {
  const { questions, questionnaire_id, schema_version, stage, title, subtitle } = data;

  // Track responses keyed by question id
  const [responses, setResponses] = useState<QuestionnaireResponse[]>(() =>
    questions.map((q) => buildEmptyResponse(q.id)),
  );

  // Visible question indices (accounts for depends_on branching)
  const visibleIndices = getVisibleIndices(questions, responses);

  // currentVisiblePos is the index within visibleIndices (not the question array index)
  const [currentVisiblePos, setCurrentVisiblePos] = useState(() => {
    const startQIdx = Math.max(0, Math.min(data.current_index, questions.length - 1));
    const pos = visibleIndices.indexOf(startQIdx);
    return pos >= 0 ? pos : 0;
  });

  // Keep current position within bounds when branching changes the visible set.
  useEffect(() => {
    setCurrentVisiblePos((prev) => {
      if (visibleIndices.length === 0) return 0;
      return Math.min(prev, visibleIndices.length - 1);
    });
  }, [visibleIndices.length]);

  // Slide direction for animation
  const [slideDir, setSlideDir] = useState<'forward' | 'back' | null>(null);

  const currentQuestionIdx = visibleIndices[currentVisiblePos] ?? 0;
  const currentQuestion = questions[currentQuestionIdx];
  const currentResponse = responses[currentQuestionIdx] ?? buildEmptyResponse(currentQuestion?.id ?? '');

  const isFirst = currentVisiblePos === 0;
  const isLast = currentVisiblePos === visibleIndices.length - 1;

  // ─── Response mutation helpers ─────────────────────────────────────────────

  const updateResponse = useCallback((questionId: string, patch: Partial<QuestionnaireResponse>) => {
    setResponses((prev) =>
      prev.map((r) => (r.question_id === questionId ? { ...r, ...patch } : r)),
    );
  }, []);

  function handleOptionClick(optionId: string) {
    if (!currentQuestion) return;
    const mode = currentQuestion.input_type;

    if (mode === 'single_choice') {
      const already = currentResponse.selected_option_ids[0] === optionId;
      updateResponse(currentQuestion.id, {
        selected_option_ids: already ? [] : [optionId],
        skipped: false,
      });
    } else if (mode === 'multi_choice') {
      const prev = currentResponse.selected_option_ids;
      const next = prev.includes(optionId)
        ? prev.filter((id) => id !== optionId)
        : [...prev, optionId];
      updateResponse(currentQuestion.id, { selected_option_ids: next, skipped: false });
    }
  }

  function handleRatingChange(value: string) {
    if (!currentQuestion) return;
    updateResponse(currentQuestion.id, {
      selected_option_ids: [value],
      skipped: false,
    });
  }

  function handleCustomTextChange(text: string) {
    if (!currentQuestion) return;
    updateResponse(currentQuestion.id, { custom_text: text, skipped: false });
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  function canContinue(): boolean {
    if (!currentQuestion) return false;
    const hasOption = currentResponse.selected_option_ids.length > 0;
    const hasCustom = (currentResponse.custom_text ?? '').trim().length > 0;
    return hasOption || hasCustom;
  }

  function navigate(direction: 'forward' | 'back') {
    setSlideDir(direction);
    // Small delay so the exit animation starts before we swap content
    setTimeout(() => {
      setCurrentVisiblePos((prev) =>
        direction === 'forward'
          ? Math.min(prev + 1, visibleIndices.length - 1)
          : Math.max(prev - 1, 0),
      );
      setSlideDir(null);
    }, 150);
  }

  function handleContinue() {
    if (!canContinue()) return;
    if (isLast) {
      submitQuestionnaire();
    } else {
      navigate('forward');
    }
  }

  function handleSkip() {
    if (!currentQuestion) return;
    updateResponse(currentQuestion.id, { skipped: true, selected_option_ids: [], custom_text: undefined });
    if (isLast) {
      submitQuestionnaire();
    } else {
      navigate('forward');
    }
  }

  function handleBack() {
    if (!isFirst) navigate('back');
  }

  function submitQuestionnaire() {
    const visibleQuestionById = new Map(
      visibleIndices
        .map((idx) => questions[idx])
        .filter((q): q is QuestionnaireData['questions'][number] => Boolean(q))
        .map((q) => [q.id, q]),
    );
    const submission: QuestionnaireSubmission = {
      questionnaire_id,
      schema_version,
      stage,
      responses: responses
        .filter((r) => {
          // Only include responses for visible questions
          return visibleQuestionById.has(r.question_id);
        })
        .map((r) => {
          const question = visibleQuestionById.get(r.question_id);
          return {
            ...r,
            ...(question?.impact_tier ? { impact_tag: question.impact_tier } : {}),
            ...(typeof question?.payoff_hint === 'string' && question.payoff_hint.trim()
              ? { payoff_hint: question.payoff_hint.trim().slice(0, 240) }
              : {}),
            ...(Array.isArray(question?.topic_keys) && question.topic_keys.length > 0
              ? { topic_keys: question.topic_keys.filter((k): k is string => typeof k === 'string' && k.trim().length > 0).slice(0, 8) }
              : {}),
            ...(typeof question?.benchmark_edit_version === 'number'
              ? { benchmark_edit_version: question.benchmark_edit_version }
              : (question?.benchmark_edit_version === null ? { benchmark_edit_version: null } : {})),
          };
        }),
      submitted_at: new Date().toISOString(),
    };
    onComplete(submission);
  }

  if (!currentQuestion) {
    return (
      <div data-panel-root className="flex h-full flex-col">
        <ProgressHeader title={title} currentStep={1} totalSteps={0} />
        <div data-panel-scroll className="flex-1 overflow-y-auto flex items-center justify-center p-8">
          <p className="text-sm text-white/40">No questions available.</p>
        </div>
      </div>
    );
  }

  const slideExitClass =
    slideDir === 'forward'
      ? '-translate-x-4 opacity-0'
      : slideDir === 'back'
        ? 'translate-x-4 opacity-0'
        : '';

  return (
    <div data-panel-root className="flex h-full flex-col">
      {/* Progress header */}
      <ProgressHeader
        title={title}
        currentStep={currentVisiblePos + 1}
        totalSteps={visibleIndices.length}
      />

      {/* Scrollable body */}
      <div data-panel-scroll className="flex-1 overflow-y-auto p-4 space-y-4">
        <div
          className={cn(
            'space-y-4 transition-all duration-300',
            slideExitClass,
          )}
        >
          {/* Subtitle (shown only on first question) */}
          {currentVisiblePos === 0 && subtitle && (
            <p className="text-xs text-white/50 leading-relaxed">{subtitle}</p>
          )}

          {(currentQuestion.impact_tier || currentQuestion.payoff_hint) && (
            <div className="flex flex-wrap items-center gap-2">
              {currentQuestion.impact_tier && (
                <span
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                    currentQuestion.impact_tier === 'high'
                      ? 'border-rose-300/20 bg-rose-400/[0.08] text-rose-100/85'
                      : currentQuestion.impact_tier === 'medium'
                        ? 'border-sky-300/20 bg-sky-400/[0.07] text-sky-100/85'
                        : 'border-white/[0.1] bg-white/[0.03] text-white/60',
                  )}
                >
                  {currentQuestion.impact_tier === 'high' ? 'High Impact' : currentQuestion.impact_tier === 'medium' ? 'Medium Impact' : 'Low Impact'}
                </span>
              )}
              {currentQuestion.payoff_hint && (
                <span className="text-[11px] text-white/62">{currentQuestion.payoff_hint}</span>
              )}
            </div>
          )}

          {/* Question text */}
          <div>
            <p className="text-base font-medium text-white leading-snug">
              {currentQuestion.question_text}
            </p>
          </div>

          {/* Context card */}
          {currentQuestion.context && (
            <GlassCard className="px-3.5 py-2.5">
              <p className="text-xs text-white/55 leading-relaxed">{currentQuestion.context}</p>
            </GlassCard>
          )}

          {/* Input area */}
          {currentQuestion.input_type === 'rating' ? (
            <RatingInput
              value={currentResponse.selected_option_ids[0] ?? null}
              onChange={handleRatingChange}
            />
          ) : (
            /* single_choice or multi_choice */
            currentQuestion.options && currentQuestion.options.length > 0 && (
              <div
                className="space-y-2"
                role={currentQuestion.input_type === 'single_choice' ? 'radiogroup' : 'group'}
                aria-label="Options"
              >
                {currentQuestion.options.map((opt) => (
                  <QuestionnaireOption
                    key={opt.id}
                    option={opt}
                    isSelected={currentResponse.selected_option_ids.includes(opt.id)}
                    selectionMode={currentQuestion.input_type === 'single_choice' ? 'single' : 'multi'}
                    onClick={() => handleOptionClick(opt.id)}
                  />
                ))}
              </div>
            )
          )}

          {/* Custom text input */}
          {currentQuestion.allow_custom && (
            <div className="space-y-1">
              <label className="text-xs text-white/50 pl-0.5">
                {currentResponse.selected_option_ids.length > 0
                  ? 'Add detail (optional)'
                  : 'Or type your own answer'}
              </label>
              <GlassTextarea
                rows={3}
                value={currentResponse.custom_text ?? ''}
                onChange={(e) => handleCustomTextChange(e.target.value)}
                placeholder={
                  currentResponse.selected_option_ids.length > 0
                    ? 'Add more detail...'
                    : 'Type your answer here...'
                }
                aria-label="Custom answer"
              />
            </div>
          )}
        </div>
      </div>

      {/* Pinned action bar */}
      <div className="border-t border-white/[0.1] px-4 py-3 flex items-center gap-2">
        {/* Back */}
        <GlassButton
          variant="ghost"
          disabled={isFirst}
          onClick={handleBack}
          aria-label="Go back to previous question"
          className="gap-1.5 px-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </GlassButton>

        <div className="flex-1" />

        {/* Skip */}
        {currentQuestion.allow_skip && (
          <GlassButton
            variant="ghost"
            onClick={handleSkip}
            aria-label="Skip this question"
            className="gap-1.5 px-3"
          >
            Skip
            <SkipForward className="h-3.5 w-3.5" />
          </GlassButton>
        )}

        {/* Continue / Submit */}
        <GlassButton
          variant="primary"
          disabled={!canContinue()}
          onClick={handleContinue}
          aria-label={isLast ? 'Submit questionnaire' : 'Continue to next question'}
          className="gap-1.5"
        >
          {isLast ? 'Submit' : 'Continue'}
          <ArrowRight className="h-3.5 w-3.5" />
        </GlassButton>
      </div>
    </div>
  );
}
