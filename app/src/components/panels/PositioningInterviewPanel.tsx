import { useState } from 'react';
import { ArrowRight, CheckCircle2, GitBranch, MessageSquare, Sparkles } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { cn } from '@/lib/utils';
import type { PositioningInterviewData } from '@/types/panels';
import type { CategoryProgress, PositioningQuestion } from '@/types/session';

interface PositioningInterviewPanelProps {
  data: PositioningInterviewData;
  onRespond?: (questionId: string, answer: string, selectedSuggestion?: string) => void;
}

interface SuggestionCardProps {
  label: string;
  description: string;
  source: 'resume' | 'inferred' | 'jd';
  isSelected: boolean;
  onClick: () => void;
}

function SuggestionCard({ label, description, source, isSelected, onClick }: SuggestionCardProps) {
  const sourceBadge = {
    resume: {
      label: 'From Resume',
      className: 'border border-white/[0.14] bg-white/[0.06] text-white/76',
    },
    inferred: {
      label: 'Inferred',
      className: 'bg-white/[0.08] text-white/50 border border-white/10',
    },
    jd: {
      label: 'From JD',
      className: 'bg-blue-500/[0.18] text-blue-300 border border-blue-400/[0.25]',
    },
  }[source];

  return (
    <GlassCard
      className={cn(
        'p-3.5 cursor-pointer transition-all duration-200',
        isSelected
          ? 'border-white/[0.2] bg-white/[0.08] shadow-[0_0_20px_-10px_rgba(255,255,255,0.4)]'
          : 'hover:border-white/20 hover:bg-white/[0.10]',
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Radio indicator */}
        <div
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition-all duration-200 flex items-center justify-center',
            isSelected
              ? 'border-white/70 bg-white/70'
              : 'border-white/30 bg-transparent',
          )}
          aria-hidden="true"
        >
          {isSelected && (
            <div className="h-1.5 w-1.5 rounded-full bg-white" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                'text-sm font-medium leading-snug',
                isSelected ? 'text-white' : 'text-white/85',
              )}
            >
              {label}
            </span>
            {/* Source badge */}
            <span
              className={cn(
                'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
                sourceBadge.className,
              )}
            >
              {sourceBadge.label}
            </span>
          </div>
          {description && (
            <p className="mt-1 text-xs text-white/60 leading-relaxed">{description}</p>
          )}
        </div>

        {/* Selected checkmark */}
        {isSelected && (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-white/74" aria-hidden="true" />
        )}
      </div>
    </GlassCard>
  );
}

// ─── Category Progress Bars ──────────────────────────────────────────────────

interface CategoryProgressBarProps {
  categories: CategoryProgress[];
}

function CategoryProgressBars({ categories }: CategoryProgressBarProps) {
  if (!categories || categories.length === 0) return null;

  return (
    <div className="mt-3 flex flex-col gap-1.5" aria-label="Category progress">
      {categories.map((cat) => {
        const pct = cat.total > 0 ? Math.round((cat.answered / cat.total) * 100) : 0;
        const isComplete = cat.answered >= cat.total;
        return (
          <div key={cat.category} className="flex items-center gap-2">
            {/* Label pill */}
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider whitespace-nowrap',
                isComplete
                  ? 'bg-green-500/20 text-green-300 border border-green-400/25'
                  : 'bg-white/[0.06] text-white/45 border border-white/[0.10]',
              )}
            >
              {cat.label}
            </span>
            {/* Progress track */}
            <div
              className="flex-1 h-0.5 rounded-full bg-white/[0.08] overflow-hidden"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${cat.label}: ${cat.answered} of ${cat.total}`}
            >
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500 ease-out',
                  isComplete ? 'bg-green-400/70' : 'bg-[#b5c9ff]/60',
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            {/* Count */}
            <span className="shrink-0 text-[10px] text-white/35 tabular-nums">
              {cat.answered}/{cat.total}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Question Body ───────────────────────────────────────────────────────────

interface QuestionBodyProps {
  question: PositioningQuestion;
  encouragingText?: string;
  onSubmit: (answer: string, selectedSuggestion?: string) => void;
}

function QuestionBody({ question, encouragingText, onSubmit }: QuestionBodyProps) {
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number | null>(null);
  const [customText, setCustomText] = useState('');

  const suggestions = question.suggestions ?? [];
  const selectedSuggestion = selectedSuggestionIndex !== null ? suggestions[selectedSuggestionIndex] : null;

  // Determine whether the submit button should be enabled
  const hasSelection = selectedSuggestionIndex !== null;
  const hasCustomText = customText.trim().length > 0;
  // Inferred/JD suggestions require custom text to ensure truth-bound answers
  const needsElaboration = hasSelection && !hasCustomText && selectedSuggestion?.source !== 'resume';
  const canSubmit = needsElaboration ? false : (hasSelection || hasCustomText);

  function handleSuggestionClick(index: number) {
    setSelectedSuggestionIndex(prev => (prev === index ? null : index));
  }

  function handleSubmit() {
    if (!canSubmit) return;

    let answer: string;
    let suggestionLabel: string | undefined;

    if (hasCustomText && selectedSuggestion) {
      // Both selected + typed: typed text is the answer, suggestion is context
      answer = customText.trim();
      suggestionLabel = selectedSuggestion.label;
    } else if (selectedSuggestion && !hasCustomText) {
      // Only suggestion selected — tag inferred/jd suggestions so downstream
      // agents know this wasn't user-authored detail
      if (selectedSuggestion.source === 'resume') {
        answer = `${selectedSuggestion.label}: ${selectedSuggestion.description}`;
      } else {
        answer = `[Selected suggestion] ${selectedSuggestion.label}: ${selectedSuggestion.description}`;
      }
      suggestionLabel = selectedSuggestion.label;
    } else {
      // Only custom text
      answer = customText.trim();
      suggestionLabel = undefined;
    }

    onSubmit(answer, suggestionLabel);
  }

  const textareaPlaceholder = selectedSuggestion
    ? selectedSuggestion.source === 'resume'
      ? `Selected: "${selectedSuggestion.label}" — add more detail (optional)...`
      : `Selected: "${selectedSuggestion.label}" — add a specific example to strengthen this (recommended)...`
    : 'Or type your own answer...';

  return (
    <div className="space-y-3">
      {/* Encouraging message from previous answer */}
      {encouragingText && (
        <div className="flex items-start gap-2.5 rounded-xl border border-green-400/[0.20] bg-green-500/[0.08] px-3.5 py-2.5">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-400/80" aria-hidden="true" />
          <p className="text-xs text-green-300/90 leading-relaxed">{encouragingText}</p>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-2" role="radiogroup" aria-label="Answer suggestions">
          {suggestions.map((s, i) => (
            <SuggestionCard
              key={i}
              label={s.label}
              description={s.description}
              source={s.source}
              isSelected={selectedSuggestionIndex === i}
              onClick={() => handleSuggestionClick(i)}
            />
          ))}
        </div>
      )}

      {/* Custom answer textarea */}
      <div className="relative">
        <textarea
          value={customText}
          onChange={e => setCustomText(e.target.value)}
          placeholder={textareaPlaceholder}
          rows={3}
          aria-label="Custom answer"
          className={cn(
            'w-full resize-none rounded-xl border bg-white/[0.06] px-3.5 py-2.5',
            'text-sm text-white/85 placeholder:text-white/35',
            'backdrop-blur-xl transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-blue-400/40',
            selectedSuggestion
              ? 'border-white/[0.2] focus:border-white/[0.26]'
              : 'border-white/[0.12] focus:border-white/25',
          )}
        />
      </div>

      {/* Elaboration hint for inferred/JD suggestions */}
      {needsElaboration && (
        <p className="text-xs text-amber-300/70">
          Please add a specific example above to confirm this applies to your experience.
        </p>
      )}

      {/* Submit button */}
      <div className="flex justify-end pt-1">
        <GlassButton
          variant="primary"
          disabled={!canSubmit}
          onClick={handleSubmit}
          aria-label="Submit answer and continue"
          className="gap-1.5"
        >
          Continue
          <ArrowRight className="h-3.5 w-3.5" />
        </GlassButton>
      </div>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export function PositioningInterviewPanel({ data, onRespond }: PositioningInterviewPanelProps) {
  const {
    current_question,
    questions_total,
    questions_answered,
    category_progress,
    encouraging_text,
  } = data;

  // Progress calculations — answered + 1 represents the current question being shown
  const displayedIndex = questions_answered + 1;
  const progressPct = questions_total > 0
    ? Math.round((questions_answered / questions_total) * 100)
    : 0;

  // Determine whether to show category bars or simple counter
  const hasCategoryProgress = Array.isArray(category_progress) && category_progress.length > 0;

  function handleSubmit(answer: string, selectedSuggestion?: string) {
    if (!current_question || !onRespond) return;
    onRespond(current_question.id, answer, selectedSuggestion);
  }

  return (
    <div data-panel-root className="flex h-full flex-col">
      {/* Panel header */}
      <div className="border-b border-white/[0.12] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-[#afc4ff]" />
            <span className="text-sm font-medium text-white/85">Why Me Interview</span>
          </div>
          {/* Show simple counter only when no category progress */}
          {questions_total > 0 && !hasCategoryProgress && (
            <span className="text-xs font-medium text-white/50" aria-label={`Question ${displayedIndex} of ${questions_total}`}>
              {displayedIndex} / {questions_total}
            </span>
          )}
        </div>

        {/* Category progress bars — shown when category data is available */}
        {hasCategoryProgress ? (
          <CategoryProgressBars categories={category_progress!} />
        ) : (
          /* Fallback: simple overall progress bar */
          questions_total > 0 && (
            <div
              className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-white/[0.10]"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${progressPct}% complete`}
            >
              <div
                className="h-full rounded-full bg-[#b5c9ff] transition-all duration-500 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )
        )}
      </div>

      {/* Scrollable body */}
      <div data-panel-scroll className="flex-1 overflow-y-auto p-4 space-y-4">
        {current_question ? (
          <>
            {/* Follow-up indicator */}
            {current_question.is_follow_up && (
              <div className="flex items-center gap-2">
                <div className="w-0.5 self-stretch rounded-full bg-indigo-400/50" aria-hidden="true" />
                <div className="flex items-center gap-1.5">
                  <GitBranch className="h-3 w-3 text-indigo-400/70" aria-hidden="true" />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-indigo-300/70">
                    Follow-up
                  </span>
                </div>
              </div>
            )}

            {/* Question text — indented slightly when it's a follow-up */}
            <div className={cn(current_question.is_follow_up && 'pl-3 border-l border-indigo-400/25')}>
              <p className="text-base font-medium text-white leading-snug">
                {current_question.question_text}
              </p>

              {/* JD requirement map badges */}
              {Array.isArray(current_question.requirement_map) && current_question.requirement_map.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Helps address">
                  <span className="text-[10px] text-white/40 self-center">Helps address:</span>
                  {current_question.requirement_map.map((req) => (
                    <span
                      key={req}
                      className="rounded-full bg-blue-500/[0.14] border border-blue-400/[0.22] px-2 py-0.5 text-[10px] font-medium text-blue-300/80"
                    >
                      {req}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Context helper */}
            {current_question.context && (
              <GlassCard className="px-3.5 py-2.5">
                <p className="text-xs text-white/55 leading-relaxed">
                  {current_question.context}
                </p>
              </GlassCard>
            )}

            {/* Suggestions + input */}
            <QuestionBody
              question={current_question}
              encouragingText={encouraging_text}
              onSubmit={handleSubmit}
            />
          </>
        ) : (
          /* Empty state while question loads */
          <div className="flex h-full items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3 text-center">
              <MessageSquare className="h-8 w-8 text-white/20" aria-hidden="true" />
              <p className="text-sm text-white/40">
                Loading next question...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
