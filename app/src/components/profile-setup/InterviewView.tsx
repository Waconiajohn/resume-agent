import { useState, useEffect, useRef, useCallback } from 'react';
import type { IntakeAnalysis } from '@/types/profile-setup';

interface ConversationTurn {
  role: 'ai' | 'user';
  text: string;
}

interface InterviewViewProps {
  intake: IntakeAnalysis;
  currentQuestionIndex: number;
  onAnswer: (answer: string) => Promise<boolean>;
  onComplete: () => void;
  answering: boolean;
}

const TOTAL_QUESTIONS = 8;

export function InterviewView({
  intake,
  currentQuestionIndex,
  onAnswer,
  onComplete,
  answering,
}: InterviewViewProps) {
  const [inputValue, setInputValue] = useState('');
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [selectedStarters, setSelectedStarters] = useState<string[]>([]);
  const [whyMeExpanded, setWhyMeExpanded] = useState(false);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasInitialized = useRef(false);

  // Seed the conversation with the opening question on mount
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const openingQuestion =
      intake.interview_questions[0]?.question ??
      'Before we go further — does that land? And what is it missing?';

    setConversation([{ role: 'ai', text: openingQuestion }]);
  }, [intake.interview_questions]);

  // Scroll to bottom whenever conversation grows
  useEffect(() => {
    const scrollAnchor = scrollAnchorRef.current;
    if (typeof scrollAnchor?.scrollIntoView === 'function') {
      scrollAnchor.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [conversation]);

  // Reset chip state when question advances
  useEffect(() => {
    setSelectedStarters([]);
  }, [currentQuestionIndex]);

  const handleSend = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || answering || isComplete) return;

    const accepted = await onAnswer(trimmed);
    if (!accepted) return;

    setConversation((prev) => [...prev, { role: 'user', text: trimmed }]);
    setInputValue('');

    const nextIndex = currentQuestionIndex + 1;
    const isDone = nextIndex >= TOTAL_QUESTIONS;

    if (isDone) {
      setIsComplete(true);
      setConversation((prev) => [
        ...prev,
        {
          role: 'ai',
          text: 'I have what I need. Give me a moment — I am building your Benchmark Profile.',
        },
      ]);
      onComplete();
      return;
    }

    const nextQuestion = intake.interview_questions[nextIndex]?.question;
    if (nextQuestion) {
      setConversation((prev) => [...prev, { role: 'ai', text: nextQuestion }]);
    }
  }, [inputValue, answering, isComplete, onAnswer, currentQuestionIndex, intake.interview_questions, onComplete]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const handleStarterToggle = (starter: string) => {
    if (starter === 'Something else') {
      textareaRef.current?.focus();
      return;
    }

    const starterPrefix = `${starter} —`;
    const isSelected = selectedStarters.includes(starter);

    setSelectedStarters((prev) => (
      isSelected ? prev.filter((item) => item !== starter) : [...prev, starter]
    ));

    setInputValue((current) => {
      if (isSelected) {
        return current
          .split('\n')
          .filter((line) => !line.trimStart().startsWith(starterPrefix))
          .join('\n')
          .trim();
      }

      const trimmedCurrent = current.trimEnd();
      const nextLine = `${starterPrefix} `;
      return trimmedCurrent ? `${trimmedCurrent}\n${nextLine}` : nextLine;
    });

    setTimeout(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        resizeTextarea();
      }
    }, 0);
  };

  const COLLAPSED_LENGTH = 150;
  const whyMeText = intake.why_me_draft ?? '';
  const whyMeIsLong = whyMeText.length > COLLAPSED_LENGTH;
  const whyMeDisplayText = whyMeExpanded || !whyMeIsLong
    ? whyMeText
    : whyMeText.slice(0, COLLAPSED_LENGTH).trimEnd() + '…';

  const displayQuestionNumber = Math.min(currentQuestionIndex + 1, TOTAL_QUESTIONS);

  // Get suggested starters for the current question
  const currentQuestion = intake.interview_questions[currentQuestionIndex];
  const starters = currentQuestion?.suggested_starters ?? [];
  const showChips = starters.length > 0 && !answering && !isComplete;

  return (
    <div className="flex h-full flex-col">
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto pb-48">
        <div className="max-w-2xl mx-auto px-8 py-16">
          {/* Why-Me Draft — compact context card */}
          <div
            className="mb-10 rounded-lg px-4 py-3"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--line-soft)' }}
          >
            <p className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-2">
              Here is what we found
            </p>
            <p className="text-sm leading-relaxed text-[var(--text-muted)]">
              {whyMeDisplayText}
            </p>
            {whyMeIsLong && (
              <button
                type="button"
                onClick={() => setWhyMeExpanded((v) => !v)}
                className="mt-2 text-xs transition-colors"
                style={{ color: 'var(--link)' }}
              >
                {whyMeExpanded ? 'Show less' : 'Show full analysis'}
              </button>
            )}
          </div>

          {/* Divider */}
          <div
            className="mb-10 h-px w-full"
            style={{ background: 'var(--line-soft)' }}
            aria-hidden="true"
          />

          {/* Conversation */}
          <div className="space-y-8">
            {conversation.map((turn, i) => (
              <div key={i}>
                {turn.role === 'ai' ? (
                  <p
                    className="text-xl font-light leading-relaxed text-[var(--text-strong)]"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {turn.text}
                  </p>
                ) : (
                  <div
                    className="pl-5"
                    style={{ borderLeft: '2px solid var(--line-strong)' }}
                  >
                    <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                      {turn.text}
                    </p>
                  </div>
                )}
              </div>
            ))}

            {answering && (
              <div className="flex gap-1.5 items-center">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] animate-[dot-bounce_1.4s_ease-in-out_infinite]"
                    style={{ animationDelay: `${i * 0.16}s` }}
                    aria-hidden="true"
                  />
                ))}
              </div>
            )}
          </div>

          <div ref={scrollAnchorRef} aria-hidden="true" />
        </div>
      </div>

      {/* Fixed input at bottom */}
      {!isComplete && (
        <div
          className="fixed bottom-0 left-0 right-0 px-8 py-6"
          style={{
            borderTop: '1px solid var(--line-soft)',
            background: 'var(--bg-0)',
          }}
        >
          <div className="max-w-2xl mx-auto">
            {/* Suggestion chips */}
            {showChips && (
              <div className="mb-3 flex flex-wrap gap-2">
                {starters.map((starter) => (
                  <StarterChip
                    key={starter}
                    starter={starter}
                    selected={selectedStarters.includes(starter)}
                    onToggle={handleStarterToggle}
                  />
                ))}
              </div>
            )}

            <textarea
              ref={textareaRef}
              rows={1}
              className="w-full bg-[var(--surface-1)] border border-[var(--line-soft)] rounded-lg px-4 py-3 text-sm text-[var(--text-strong)] leading-relaxed resize-none outline-none focus:border-[var(--link)] transition-colors placeholder:text-[var(--text-muted)] overflow-hidden"
              placeholder={showChips ? 'Pick any starting points above, or type your own answer...' : 'Your answer...'}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={answering || isComplete}
              aria-label="Your answer"
              style={{ minHeight: '48px', maxHeight: '200px' }}
            />
            <div className="mt-3 flex justify-between items-center">
              <p className="text-xs text-[var(--text-muted)]">
                Enter to send · Shift+Enter for new line
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Question {displayQuestionNumber} of {TOTAL_QUESTIONS}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StarterChip({
  starter,
  selected,
  onToggle,
}: {
  starter: string;
  selected: boolean;
  onToggle: (starter: string) => void;
}) {
  const isFreeform = starter === 'Something else';

  return (
    <button
      type="button"
      onClick={() => onToggle(starter)}
      aria-pressed={isFreeform ? undefined : selected}
      className="rounded-full border px-4 py-2 text-xs transition-colors hover:border-[var(--link)] hover:text-[var(--text-strong)]"
      style={{
        borderColor: selected ? 'var(--link)' : 'var(--line-soft)',
        color: selected ? 'var(--text-strong)' : 'var(--text-muted)',
        background: selected
          ? 'color-mix(in srgb, var(--link) 10%, var(--surface-1))'
          : 'var(--surface-1)',
        boxShadow: selected ? 'inset 0 0 0 1px var(--link)' : undefined,
      }}
    >
      {starter}
    </button>
  );
}
