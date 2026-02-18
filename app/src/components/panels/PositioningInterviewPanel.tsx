import { useState } from 'react';
import { ArrowRight, CheckCircle2, MessageSquare } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { cn } from '@/lib/utils';
import type { PositioningInterviewData } from '@/types/panels';
import type { PositioningQuestion } from '@/types/session';

interface PositioningInterviewPanelProps {
  data: PositioningInterviewData;
  onRespond?: (questionId: string, answer: string, selectedSuggestion?: string) => void;
}

interface SuggestionCardProps {
  label: string;
  description: string;
  source: 'resume' | 'inferred';
  isSelected: boolean;
  onClick: () => void;
}

function SuggestionCard({ label, description, source, isSelected, onClick }: SuggestionCardProps) {
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
                source === 'resume'
                  ? 'border border-white/[0.14] bg-white/[0.06] text-white/76'
                  : 'bg-white/[0.08] text-white/50 border border-white/10',
              )}
            >
              {source === 'resume' ? 'From Resume' : 'Inferred'}
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

interface QuestionBodyProps {
  question: PositioningQuestion;
  onSubmit: (answer: string, selectedSuggestion?: string) => void;
}

function QuestionBody({ question, onSubmit }: QuestionBodyProps) {
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number | null>(null);
  const [customText, setCustomText] = useState('');

  const suggestions = question.suggestions ?? [];
  const selectedSuggestion = selectedSuggestionIndex !== null ? suggestions[selectedSuggestionIndex] : null;

  // Determine whether the submit button should be enabled
  const hasSelection = selectedSuggestionIndex !== null;
  const hasCustomText = customText.trim().length > 0;
  const canSubmit = hasSelection || hasCustomText;

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
      // Only suggestion selected
      answer = `${selectedSuggestion.label}: ${selectedSuggestion.description}`;
      suggestionLabel = selectedSuggestion.label;
    } else {
      // Only custom text
      answer = customText.trim();
      suggestionLabel = undefined;
    }

    onSubmit(answer, suggestionLabel);
  }

  const textareaPlaceholder = selectedSuggestion
    ? `Selected: "${selectedSuggestion.label}" — add more detail (optional)...`
    : 'Or type your own answer...';

  return (
    <div className="space-y-3">
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

export function PositioningInterviewPanel({ data, onRespond }: PositioningInterviewPanelProps) {
  const { current_question, questions_total, questions_answered } = data;

  // Progress calculations — answered + 1 represents the current question being shown
  const displayedIndex = questions_answered + 1;
  const progressPct = questions_total > 0
    ? Math.round((questions_answered / questions_total) * 100)
    : 0;

  function handleSubmit(answer: string, selectedSuggestion?: string) {
    if (!current_question || !onRespond) return;
    onRespond(current_question.id, answer, selectedSuggestion);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Panel header */}
      <div className="border-b border-white/[0.12] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-[#afc4ff]" />
            <span className="text-sm font-medium text-white/85">Why Me Interview</span>
          </div>
          {questions_total > 0 && (
            <span className="text-xs font-medium text-white/50" aria-label={`Question ${displayedIndex} of ${questions_total}`}>
              {displayedIndex} / {questions_total}
            </span>
          )}
        </div>

        {/* Progress bar */}
        {questions_total > 0 && (
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
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {current_question ? (
          <>
            {/* Question text */}
            <div>
              <p className="text-base font-medium text-white leading-snug">
                {current_question.question_text}
              </p>
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
