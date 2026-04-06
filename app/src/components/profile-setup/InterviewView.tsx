import { useState, useEffect, useRef, useCallback } from 'react';
import type { IntakeAnalysis } from '@/types/profile-setup';

interface ConversationTurn {
  role: 'ai' | 'user';
  text: string;
}

interface InterviewViewProps {
  intake: IntakeAnalysis;
  currentQuestionIndex: number;
  onAnswer: (answer: string) => Promise<void>;
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
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [conversation]);

  const handleSend = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || answering || isComplete) return;

    const userTurn: ConversationTurn = { role: 'user', text: trimmed };
    setConversation((prev) => [...prev, userTurn]);
    setInputValue('');

    await onAnswer(trimmed);

    const nextIndex = currentQuestionIndex + 1;
    const isDone = nextIndex >= TOTAL_QUESTIONS;

    if (isDone) {
      setIsComplete(true);
      setConversation((prev) => [
        ...prev,
        {
          role: 'ai',
          text: 'I have what I need. Give me a moment — I am building your CareerIQ profile.',
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

  const displayQuestionNumber = Math.min(currentQuestionIndex + 1, TOTAL_QUESTIONS);

  return (
    <div className="flex h-full flex-col">
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto pb-48">
        <div className="max-w-2xl mx-auto px-8 py-16">
          {/* Why Me Draft */}
          <div className="mb-10">
            <p className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-4">
              Here is what we found
            </p>
            <p
              className="text-xl font-light leading-relaxed text-[var(--text-strong)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {intake.why_me_draft}
            </p>
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
            <textarea
              ref={textareaRef}
              rows={1}
              className="w-full bg-[var(--surface-1)] border border-[var(--line-soft)] rounded-lg px-4 py-3 text-sm text-[var(--text-strong)] leading-relaxed resize-none outline-none focus:border-[var(--link)] transition-colors placeholder:text-[var(--text-muted)] overflow-hidden"
              placeholder="Your answer..."
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
