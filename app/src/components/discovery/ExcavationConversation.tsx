import { useEffect, useRef, useState, useCallback } from 'react';
import { LiveResume } from './LiveResume';
import type { DiscoveryOutput, ExcavationResponse, LiveResumeState, ResumeUpdate } from '@/types/discovery';

interface ConversationViewProps {
  discovery: DiscoveryOutput;
  sessionId: string;
  liveResume: LiveResumeState;
  highlightedSections: string[];
  onExcavate: (sessionId: string, answer: string) => Promise<ExcavationResponse | null>;
  onResumeUpdate: (updates: ResumeUpdate[]) => void;
  onComplete: () => void;
  excavating: boolean;
}

interface ConversationMessage {
  role: 'ai' | 'user';
  content: string;
}

export function ExcavationConversation({
  discovery,
  sessionId,
  liveResume,
  highlightedSections,
  onExcavate,
  onResumeUpdate,
  onComplete,
  excavating,
}: ConversationViewProps) {
  const totalQuestions = discovery.excavation_questions.length || 5;

  const openingMessage = [
    discovery.recognition.career_thread,
    discovery.recognition.role_fit,
    discovery.recognition.differentiator,
    '\n\nWhat I need to know is whether that lands — because everything we build from here depends on it. Is that an accurate read of your career, or is there something I\'m not seeing?',
  ]
    .filter(Boolean)
    .join(' ');

  const [messages, setMessages] = useState<ConversationMessage[]>([
    { role: 'ai', content: openingMessage },
  ]);
  const [answer, setAnswer] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [answeredCount, setAnsweredCount] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      pendingTimers.current.forEach(clearTimeout);
    };
  }, []);

  // Scroll to bottom on new messages or loading state change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, excavating]);

  // Auto-focus textarea when not loading and not complete
  useEffect(() => {
    if (!excavating && !isComplete) {
      textareaRef.current?.focus();
    }
  }, [excavating, isComplete]);

  const handleSubmit = useCallback(async () => {
    const trimmed = answer.trim();
    if (!trimmed || excavating || isComplete) return;

    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setAnswer('');

    const result = await onExcavate(sessionId, trimmed);
    if (!result) {
      // On failure, leave the user message in history but let the user try again
      return;
    }

    if (result.resume_updates.length > 0) {
      onResumeUpdate(result.resume_updates);
    }

    setAnsweredCount((c) => c + 1);

    if (result.complete) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          content:
            'I have what I need.\n\nGive me a moment — I\'m putting together your complete CareerIQ profile.',
        },
      ]);
      setIsComplete(true);
      const t = setTimeout(() => onComplete(), 2000);
      pendingTimers.current.push(t);
    } else if (result.next_question) {
      setMessages((prev) => [...prev, { role: 'ai', content: result.next_question! }]);
    }
  }, [answer, excavating, isComplete, onExcavate, sessionId, onResumeUpdate, onComplete]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  const completenessPercent = answeredCount > 0
    ? Math.min(Math.round((answeredCount / totalQuestions) * 100), 95)
    : null;

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Left column — conversation */}
      <div className="flex w-[58%] flex-col h-full">
        {/* Label */}
        <div className="shrink-0 px-12 pt-8 pb-6">
          <p className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
            Building your CareerIQ profile
          </p>
        </div>

        {/* Conversation scroll area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-12"
          aria-live="polite"
          aria-relevant="additions"
        >
          {messages.map((msg, idx) => {
            const isFirst = idx === 0;
            if (msg.role === 'ai') {
              return (
                <div
                  key={idx}
                  className={isFirst ? 'mb-8' : 'mb-8 animate-fade-in'}
                  style={isFirst ? undefined : { animationDuration: '400ms' }}
                >
                  <p
                    className="text-2xl font-light leading-relaxed text-[var(--text-strong)] whitespace-pre-line"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {msg.content}
                  </p>
                </div>
              );
            }
            return (
              <div key={idx} className="mb-8 animate-fade-in" style={{ animationDuration: '400ms' }}>
                <p className="text-sm leading-relaxed text-[var(--text-soft)] pl-4 border-l-2 border-[var(--line-soft)]">
                  {msg.content}
                </p>
              </div>
            );
          })}

          {/* Loading indicator — pulsing dot where next AI message will appear */}
          {excavating && (
            <div className="mb-8">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--link)] animate-pulse" />
            </div>
          )}
        </div>

        {/* Input pinned to bottom */}
        {!isComplete && (
          <div className="shrink-0 px-12 py-8 border-t border-[var(--line-soft)]">
            <textarea
              ref={textareaRef}
              className="w-full bg-transparent text-base leading-relaxed text-[var(--text-strong)] resize-none outline-none placeholder:text-[var(--text-muted)] min-h-[80px] border-b border-[var(--line-soft)] pb-3"
              placeholder={excavating ? 'Reading your answer...' : 'Your answer...'}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={excavating}
              aria-label="Your answer"
            />
            <div className="mt-3 flex items-center justify-between">
              {completenessPercent !== null ? (
                <p className="text-xs text-[var(--text-muted)]">
                  Profile {completenessPercent}% built
                </p>
              ) : (
                <span />
              )}
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
        )}
      </div>

      {/* Divider */}
      <div className="w-px shrink-0 bg-gray-800" />

      {/* Right column — live resume */}
      <div className="flex w-[42%] flex-col h-full bg-gray-900">
        <div className="shrink-0 px-10 pt-8 pb-4">
          <p className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
            Your resume — updating live
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-10 pb-10">
          <LiveResume
            resume={liveResume}
            highlightedSections={highlightedSections}
          />
        </div>
      </div>
    </div>
  );
}
