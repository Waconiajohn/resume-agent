import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { DiscoveryOutput, ExcavationResponse, ResumeUpdate } from '@/types/discovery';

interface ExcavationConversationProps {
  discovery: DiscoveryOutput;
  sessionId: string;
  initialConversation: Array<{ role: 'ai' | 'user'; content: string }>;
  correctionMode?: boolean;
  onExcavate: (sessionId: string, answer: string) => Promise<ExcavationResponse | null>;
  onResumeUpdate: (updates: ResumeUpdate[]) => void;
  onComplete: () => void;
  excavating: boolean;
}

interface Exchange {
  question: string;
  answer: string;
}

export function ExcavationConversation({
  discovery,
  sessionId,
  initialConversation,
  correctionMode = false,
  onExcavate,
  onResumeUpdate,
  onComplete,
  excavating,
}: ExcavationConversationProps) {
  const firstQuestion = discovery.excavation_questions[0]?.question ?? 'Tell me more about your experience.';
  const totalQuestions = discovery.excavation_questions.length || 5;

  const [currentQuestion, setCurrentQuestion] = useState<string>(() => {
    if (initialConversation.length > 0) {
      const lastAi = [...initialConversation].reverse().find((m) => m.role === 'ai');
      return lastAi?.content ?? firstQuestion;
    }
    if (correctionMode) {
      return "I may have gotten some things wrong. That's useful — help me understand what I missed or misread about your career. What felt off in what I said?";
    }
    return firstQuestion;
  });

  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [answer, setAnswer] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      pendingTimers.current.forEach(clearTimeout);
    };
  }, []);

  // Scroll to bottom when exchanges grow
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [exchanges, currentQuestion]);

  // Auto-focus textarea
  useEffect(() => {
    if (!excavating && !isComplete) {
      textareaRef.current?.focus();
    }
  }, [excavating, isComplete]);

  const handleSubmit = useCallback(async () => {
    const trimmed = answer.trim();
    if (!trimmed || excavating || isComplete) return;

    // Record the exchange
    const answeredQuestion = currentQuestion;
    setExchanges((prev) => [...prev, { question: answeredQuestion, answer: trimmed }]);
    setAnswer('');
    setCurrentQuestion('');

    const result = await onExcavate(sessionId, trimmed);
    if (!result) {
      setCurrentQuestion(answeredQuestion);
      return;
    }

    if (result.resume_updates.length > 0) {
      onResumeUpdate(result.resume_updates);
    }

    if (result.complete) {
      setCurrentQuestion("I think I understand who you are now. Here is the full picture.");
      setIsComplete(true);
      const t = setTimeout(() => onComplete(), 2500);
      pendingTimers.current.push(t);
    } else {
      // Show insight as a brief exchange note, then set next question
      if (result.next_question) {
        if (result.insight) {
          // Brief pause for the insight before showing the next question
          setCurrentQuestion('');
          const t = setTimeout(() => {
            setCurrentQuestion(result.next_question!);
          }, 800);
          pendingTimers.current.push(t);
        } else {
          setCurrentQuestion(result.next_question);
        }
      }
    }
  }, [answer, excavating, isComplete, onExcavate, sessionId, onResumeUpdate, onComplete, currentQuestion]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  const completedCount = exchanges.length;

  return (
    <div className="flex h-full w-full flex-col">
      {/* Top — purpose statement */}
      <div className="shrink-0 px-16 pt-8 pb-4">
        <p className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
          Building your CareerIQ profile
        </p>
      </div>

      {/* Middle — the conversation */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-16 py-4"
        aria-live="polite"
        aria-relevant="additions"
      >
        <div className="mx-auto max-w-2xl">
          {/* Previous exchanges — transcript style */}
          {exchanges.map((exchange, idx) => (
            <div key={idx} className="mb-8">
              <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                {exchange.question}
              </p>
              <p className="mt-3 pl-4 border-l-2 border-[var(--line-soft)] text-sm leading-relaxed text-[var(--text-soft)]">
                {exchange.answer}
              </p>
            </div>
          ))}

          {/* Current question — large, present, unboxed */}
          {currentQuestion && (
            <div className={cn('mt-4 transition-opacity duration-500', currentQuestion ? 'opacity-100' : 'opacity-0')}>
              <p
                className={cn(
                  'text-2xl font-light leading-relaxed text-[var(--text-strong)]',
                  isComplete && 'text-xl',
                )}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {currentQuestion}
              </p>
            </div>
          )}

          {/* Processing indicator */}
          {excavating && !currentQuestion && (
            <div className="mt-4 flex items-center gap-2">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-[var(--text-soft)] animate-[dot-bounce_1.4s_ease-in-out_infinite]"
                  style={{ animationDelay: `${i * 0.16}s` }}
                  aria-hidden="true"
                />
              ))}
            </div>
          )}

          {/* Progress signal */}
          {completedCount > 0 && !isComplete && (
            <p className="mt-6 text-xs text-[var(--text-muted)]">
              {completedCount} of {totalQuestions} questions complete —
              profile {Math.min(Math.round((completedCount / totalQuestions) * 100), 95)}% built
            </p>
          )}
        </div>
      </div>

      {/* Bottom — answer input */}
      {!isComplete && (
        <div className="shrink-0 border-t border-[var(--line-soft)] px-16 py-8">
          <div className="mx-auto max-w-2xl">
            <textarea
              ref={textareaRef}
              className={cn(
                'w-full bg-transparent text-base leading-relaxed text-[var(--text-strong)] resize-none outline-none',
                'placeholder:text-[var(--text-muted)] min-h-[80px]',
                excavating && 'opacity-40',
              )}
              placeholder="Your answer — press Enter to send, Shift+Enter for new line"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={excavating}
              aria-label="Your answer"
            />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-[var(--text-muted)]">
                {excavating ? 'Processing...' : 'Take your time. The more specific the better.'}
              </p>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!answer.trim() || excavating}
                className="text-xs text-[var(--link)] hover:text-[var(--link-hover)] disabled:opacity-30 transition-opacity"
              >
                Send &rarr;
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
