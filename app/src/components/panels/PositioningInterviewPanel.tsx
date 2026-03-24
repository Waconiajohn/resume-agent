import { useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronDown, GitBranch, MessageSquare, Sparkles } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { ProcessStepGuideCard } from '@/components/shared/ProcessStepGuideCard';
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
  editedText?: string;
  onEditText?: (text: string) => void;
  onClick: () => void;
}

function SuggestionCard({ label, description, source, isSelected, editedText, onEditText, onClick }: SuggestionCardProps) {
  const sourceBadge = {
    resume: {
      label: 'From Resume',
      className: 'border border-[var(--line-strong)] bg-[var(--accent-muted)] text-[var(--text-muted)]',
    },
    inferred: {
      label: 'Inferred',
      className: 'bg-[var(--accent-muted)] text-[var(--text-soft)] border border-[var(--line-soft)]',
    },
    jd: {
      label: 'From JD',
      className: 'bg-[#afc4ff]/[0.18] text-[#afc4ff] border border-[#afc4ff]/[0.25]',
    },
  }[source];

  return (
    <GlassCard
      role="checkbox"
      aria-checked={isSelected}
      tabIndex={0}
      className={cn(
        'p-3.5 cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/45',
        isSelected
          ? 'border-[var(--line-strong)] bg-[var(--accent-muted)] shadow-[0_0_20px_-10px_rgba(255,255,255,0.4)]'
          : 'hover:border-[var(--line-strong)] hover:bg-[var(--accent-muted)]',
      )}
      onClick={onClick}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox indicator */}
        <div
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 rounded border-2 transition-all duration-200 flex items-center justify-center',
            isSelected
              ? 'border-[#9eb8ff]/80 bg-[#9eb8ff]/30'
              : 'border-[var(--line-strong)] bg-transparent',
          )}
          aria-hidden="true"
        >
          {isSelected && (
            <svg className="h-2.5 w-2.5 text-[var(--text-strong)]" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                'text-sm font-medium leading-snug',
                isSelected ? 'text-[var(--text-strong)]' : 'text-[var(--text-strong)]',
              )}
            >
              {label}
            </span>
            {/* Source badge */}
            <span
              className={cn(
                'shrink-0 rounded-md px-2 py-1 text-[12px] font-semibold uppercase tracking-wider',
                sourceBadge.className,
              )}
            >
              {sourceBadge.label}
            </span>
          </div>
          {description && (
            <p className="mt-1 text-xs text-[var(--text-soft)] leading-relaxed">{description}</p>
          )}

          {/* Inline edit textarea — shown when selected */}
          {isSelected && onEditText && (
            <textarea
              value={editedText ?? ''}
              onChange={(e) => onEditText(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              rows={2}
              aria-label={`Edit suggestion: ${label}`}
              className={cn(
                'mt-2 w-full resize-none rounded-lg border bg-[var(--accent-muted)] px-3 py-2',
                'text-xs text-[var(--text-strong)] placeholder:text-[var(--text-soft)]',
                'backdrop-blur-xl transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-[#afc4ff]/40',
                'border-[var(--line-strong)] focus:border-[var(--line-strong)]',
              )}
              placeholder="Edit this suggestion or leave as-is..."
            />
          )}
        </div>

        {/* Selected checkmark */}
        {isSelected && (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
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
                'shrink-0 rounded-md px-2.5 py-1 text-[12px] font-semibold uppercase tracking-wider whitespace-nowrap',
                isComplete
                  ? 'bg-[#b5dec2]/20 text-[#b5dec2] border border-[#b5dec2]/25'
                  : 'bg-[var(--accent-muted)] text-[var(--text-soft)] border border-[var(--line-soft)]',
              )}
            >
              {cat.label}
            </span>
            {/* Progress track */}
            <div
              className="flex-1 h-1.5 overflow-hidden bg-[var(--accent-muted)]"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${cat.label}: ${cat.answered} of ${cat.total}`}
            >
              <div
                className={cn(
                  'h-full transition-all duration-500 ease-out',
                  isComplete ? 'bg-[#b5dec2]/70' : 'bg-[#b5c9ff]/60',
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            {/* Count */}
            <span className="shrink-0 text-[12px] text-[var(--text-soft)] tabular-nums">
              {cat.answered}/{cat.total}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Why This Question ───────────────────────────────────────────────────────

function WhyThisQuestion({ requirements }: { requirements: string[] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 text-[13px] text-[var(--text-soft)] transition-colors hover:text-[var(--text-muted)]"
      >
        <ChevronDown className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-180')} />
        Why we're asking
      </button>
      {isOpen && (
        <GlassCard className="mt-2 px-3 py-2.5">
          <p className="text-xs text-[var(--text-soft)] leading-relaxed">
            This question helps us address: <span className="text-[var(--text-muted)]">{requirements.join(', ')}</span>.
            A strong answer here will strengthen your positioning for this role.
          </p>
        </GlassCard>
      )}
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
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [editedTexts, setEditedTexts] = useState<Map<number, string>>(new Map());
  const [customText, setCustomText] = useState('');

  const suggestions = question.suggestions ?? [];

  function getDefaultText(index: number): string {
    const s = suggestions[index];
    return `${s.label}: ${s.description}`;
  }

  function getSuggestionText(index: number): string {
    return editedTexts.get(index) ?? getDefaultText(index);
  }

  function isEdited(index: number): boolean {
    const edited = editedTexts.get(index);
    return edited !== undefined && edited !== getDefaultText(index);
  }

  // Determine whether the submit button should be enabled
  const hasSelection = selectedIndices.size > 0;
  const hasCustomText = customText.trim().length > 0;

  // Inferred/JD suggestions need either an inline edit or custom text below to confirm
  const needsElaboration = hasSelection && Array.from(selectedIndices).some(i => {
    const s = suggestions[i];
    if (s.source === 'resume') return false;
    return !isEdited(i) && !hasCustomText;
  });

  const canSubmit = needsElaboration ? false : (hasSelection || hasCustomText);

  function handleSuggestionClick(index: number) {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
        // Clean up edited text on deselect
        setEditedTexts(prev2 => {
          const next2 = new Map(prev2);
          next2.delete(index);
          return next2;
        });
      } else {
        next.add(index);
        // Pre-fill edited text with default
        setEditedTexts(prev2 => {
          if (prev2.has(index)) return prev2;
          const next2 = new Map(prev2);
          next2.set(index, getDefaultText(index));
          return next2;
        });
      }
      return next;
    });
  }

  function handleSuggestionEdit(index: number, text: string) {
    setEditedTexts(prev => {
      const next = new Map(prev);
      next.set(index, text);
      return next;
    });
  }

  function handleSubmit() {
    if (!canSubmit) return;

    const parts: string[] = [];
    const labels: string[] = [];

    // Compose selected suggestions
    const sortedIndices = Array.from(selectedIndices).sort((a, b) => a - b);
    for (const i of sortedIndices) {
      const s = suggestions[i];
      labels.push(s.label);
      if (isEdited(i)) {
        parts.push(getSuggestionText(i));
      } else if (s.source === 'resume') {
        parts.push(`${s.label}: ${s.description}`);
      } else {
        parts.push(`[Selected suggestion] ${s.label}: ${s.description}`);
      }
    }

    // Append custom text if present
    if (hasCustomText) {
      parts.push(customText.trim());
    }

    const answer = parts.join('\n\n');
    const suggestionLabel = labels.length > 0 ? labels.join(', ') : undefined;

    onSubmit(answer, suggestionLabel);
  }

  const textareaPlaceholder = hasSelection
    ? 'Add more context or a custom answer (optional)...'
    : 'Or type your own answer...';

  return (
    <div className="space-y-3">
      {/* Encouraging message from previous answer */}
      {encouragingText && (
        <div className="flex items-start gap-2.5 rounded-xl border border-[#b5dec2]/[0.20] bg-[#b5dec2]/[0.08] px-3.5 py-2.5">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#b5dec2]/80" aria-hidden="true" />
          <p className="text-xs text-[#b5dec2]/90 leading-relaxed">{encouragingText}</p>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-[#afc4ff]/20 bg-[#afc4ff]/[0.08] px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#afc4ff]/90">
              Select Your Answer
            </span>
            <span className="text-[13px] text-[var(--text-soft)]">
              Select one or more suggestions. Click to edit any selection.
            </span>
          </div>
          <div
            className="space-y-2"
            role="group"
            aria-label="Answer suggestions"
          >
          {suggestions.map((s, i) => (
            <SuggestionCard
              key={i}
              label={s.label}
              description={s.description}
              source={s.source}
              isSelected={selectedIndices.has(i)}
              editedText={editedTexts.get(i)}
              onEditText={(text) => handleSuggestionEdit(i, text)}
              onClick={() => handleSuggestionClick(i)}
            />
          ))}
          </div>
        </div>
      )}

      {/* Custom answer textarea */}
      <div className="relative">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            Your Answer
          </span>
          <span className="text-[13px] text-[var(--text-soft)]">
            {hasSelection
              ? 'Add extra context or leave blank to submit selected suggestions.'
              : 'Type your own answer, or select suggestions above.'}
          </span>
        </div>
        <textarea
          value={customText}
          onChange={e => setCustomText(e.target.value)}
          placeholder={textareaPlaceholder}
          rows={3}
          aria-label="Custom answer"
          className={cn(
            'w-full resize-none rounded-xl border bg-[var(--accent-muted)] px-3.5 py-2.5',
            'text-sm text-[var(--text-strong)] placeholder:text-[var(--text-soft)]',
            'backdrop-blur-xl transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-[#afc4ff]/40',
            hasSelection
              ? 'border-[var(--line-strong)] focus:border-[var(--line-strong)]'
              : 'border-[var(--line-soft)] focus:border-[var(--line-strong)]',
          )}
        />
      </div>

      {/* Elaboration hint for inferred/JD suggestions */}
      {needsElaboration && (
        <p className="text-xs text-[#f0d99f]/70">
          Please edit the selected suggestion or add a specific example below to confirm this applies to your experience.
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
      <div className="border-b border-[var(--line-soft)] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-[#afc4ff]" />
            <span className="text-sm font-medium text-[var(--text-strong)]">Why Me Interview</span>
          </div>
          {/* Show simple counter only when no category progress */}
          {questions_total > 0 && !hasCategoryProgress && (
            <span className="text-xs font-medium text-[var(--text-soft)]" aria-label={`Question ${displayedIndex} of ${questions_total}`}>
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
              className="mt-2 h-1.5 w-full overflow-hidden bg-[var(--accent-muted)]"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${progressPct}% complete`}
            >
              <div
                className="h-full bg-[#b5c9ff] transition-all duration-500 ease-out"
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
            <ProcessStepGuideCard
              step="positioning"
              tone="action"
              compact
              userDoesOverride="Answer this question in this panel. Suggestions help you start faster, but add specifics when needed."
              nextOverride="After enough strong evidence is collected, the system builds the gap map."
            />

            {/* Follow-up indicator */}
            {current_question.is_follow_up && (
              <div className="flex items-center gap-2">
                <div className="w-0.5 self-stretch rounded-full bg-[#afc4ff]/50" aria-hidden="true" />
                <div className="flex items-center gap-1.5">
                  <GitBranch className="h-3 w-3 text-[#afc4ff]/70" aria-hidden="true" />
                  <span className="text-[12px] font-medium uppercase tracking-wider text-[#afc4ff]/70">
                    Follow-up
                  </span>
                </div>
              </div>
            )}

            {/* Question text — indented slightly when it's a follow-up */}
            <div className={cn(current_question.is_follow_up && 'pl-3 border-l border-[#afc4ff]/25')}>
              <p className="text-base font-medium text-[var(--text-strong)] leading-snug">
                {current_question.question_text}
              </p>

              {/* JD requirement map badges */}
              {Array.isArray(current_question.requirement_map) && current_question.requirement_map.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Helps address">
                  <span className="text-[12px] text-[var(--text-soft)] self-center">Helps address:</span>
                  {current_question.requirement_map.map((req) => (
                    <span
                      key={req}
                      className="rounded-md bg-[#afc4ff]/[0.14] border border-[#afc4ff]/[0.22] px-2.5 py-1 text-[12px] font-medium uppercase tracking-[0.08em] text-[#afc4ff]/80"
                    >
                      {req}
                    </span>
                  ))}
                </div>
              )}

              {/* Why we're asking — collapsible */}
              {Array.isArray(current_question.requirement_map) && current_question.requirement_map.length > 0 && (
                <WhyThisQuestion requirements={current_question.requirement_map} />
              )}
            </div>

            {/* Context helper */}
            {current_question.context && (
              <GlassCard className="px-3.5 py-2.5">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-[13px] text-[var(--text-soft)]">Context / guidance</span>
                </div>
                <p className="text-xs text-[var(--text-soft)] leading-relaxed">
                  {current_question.context}
                </p>
              </GlassCard>
            )}

            {/* Suggestions + input */}
            <QuestionBody
              key={current_question.id}
              question={current_question}
              encouragingText={encouraging_text}
              onSubmit={handleSubmit}
            />
          </>
        ) : (
          /* Empty state while question loads */
          <div className="flex h-full items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3 text-center">
              <MessageSquare className="h-8 w-8 text-[var(--text-soft)]" aria-hidden="true" />
              <p className="text-sm text-[var(--text-soft)]">
                Loading next question...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
