import { useEffect, useRef, useState, useCallback } from 'react';
import { Send } from 'lucide-react';
import { GlassButton } from '@/components/GlassButton';
import { LiveResume } from './LiveResume';
import { cn } from '@/lib/utils';
import type { DiscoveryOutput, ExcavationResponse, LiveResumeState, ResumeUpdate } from '@/types/discovery';

interface ConversationMessage {
  role: 'ai' | 'user';
  content: string;
}

interface ExcavationConversationProps {
  discovery: DiscoveryOutput;
  sessionId: string;
  resume: LiveResumeState;
  initialConversation: ConversationMessage[];
  onExcavate: (sessionId: string, answer: string) => Promise<ExcavationResponse | null>;
  onResumeUpdate: (updates: ResumeUpdate[]) => void;
  onComplete: () => void;
  excavating: boolean;
}

export function ExcavationConversation({
  discovery,
  sessionId,
  resume,
  initialConversation,
  onExcavate,
  onResumeUpdate,
  onComplete,
  excavating,
}: ExcavationConversationProps) {
  const firstQuestion = discovery.excavation_questions[0]?.question ?? 'Tell me more about your experience.';

  const [conversation, setConversation] = useState<ConversationMessage[]>(() => {
    if (initialConversation.length > 0) return initialConversation;
    return [{ role: 'ai', content: firstQuestion }];
  });
  const [answer, setAnswer] = useState('');
  const [highlightedSections, setHighlightedSections] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      pendingTimers.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  useEffect(() => {
    if (!excavating && !isComplete) {
      textareaRef.current?.focus();
    }
  }, [excavating, isComplete]);

  const handleSubmit = useCallback(async () => {
    const trimmed = answer.trim();
    if (!trimmed || excavating || isComplete) return;

    setConversation((prev) => [...prev, { role: 'user', content: trimmed }]);
    setAnswer('');

    const result = await onExcavate(sessionId, trimmed);
    if (!result) return;

    if (result.resume_updates.length > 0) {
      onResumeUpdate(result.resume_updates);
      setHighlightedSections(result.resume_updates.map((u) => u.section));
      // Clear highlight glow after 3s
      const t1 = setTimeout(() => setHighlightedSections([]), 3000);
      pendingTimers.current.push(t1);
    }

    if (result.complete) {
      setConversation((prev) => [
        ...prev,
        { role: 'ai', content: result.insight },
        {
          role: 'ai',
          content: "I think I understand who you are now.\nHere is the full picture.",
        },
      ]);
      setIsComplete(true);
      // Wait a moment then transition
      const t2 = setTimeout(() => onComplete(), 2500);
      pendingTimers.current.push(t2);
    } else {
      const messages: ConversationMessage[] = [];
      if (result.insight) {
        messages.push({ role: 'ai', content: result.insight });
      }
      if (result.next_question) {
        messages.push({ role: 'ai', content: result.next_question });
      }
      if (messages.length > 0) {
        setConversation((prev) => [...prev, ...messages]);
      }
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

  return (
    <div className="flex h-full gap-0">
      {/* Left — conversation */}
      <div className="flex w-[55%] flex-col border-r border-[var(--line-soft)]">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="flex flex-col gap-4" aria-live="polite" aria-relevant="additions">
            {conversation.map((msg, idx) => (
              <ChatMessage key={idx} message={msg} />
            ))}
            {excavating && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input area */}
        {!isComplete && (
          <div className="border-t border-[var(--line-soft)] px-8 py-5">
            <div className="flex gap-3">
              <textarea
                ref={textareaRef}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Your answer — press Enter to send, Shift+Enter for new line"
                disabled={excavating}
                rows={3}
                className={cn(
                  'flex-1 resize-none rounded-xl border border-[var(--line-soft)] bg-[var(--surface-2)] px-4 py-3',
                  'text-sm text-[var(--text-strong)] placeholder:text-[var(--text-soft)]',
                  'focus:border-[var(--line-strong)] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)]',
                  'transition-colors duration-200',
                  excavating && 'opacity-50',
                )}
                aria-label="Your answer"
              />
              <GlassButton
                onClick={() => void handleSubmit()}
                disabled={!answer.trim() || excavating}
                loading={excavating}
                size="md"
                aria-label="Send answer"
                className="self-end"
              >
                <Send className="h-4 w-4" />
              </GlassButton>
            </div>
          </div>
        )}
      </div>

      {/* Right — live resume */}
      <div className="flex w-[45%] flex-col px-8 py-8">
        <p className="mb-4 text-xs font-bold uppercase tracking-widest text-[var(--text-soft)]">
          Your resume — updating live
        </p>
        <div className="flex-1 overflow-hidden">
          <LiveResume
            resume={resume}
            highlightedSections={highlightedSections}
          />
        </div>
      </div>
    </div>
  );
}

function ChatMessage({ message }: { message: ConversationMessage }) {
  const isAi = message.role === 'ai';
  return (
    <div
      className={cn(
        'flex animate-[fade-in_300ms_ease-out_forwards]',
        isAi ? 'justify-start' : 'justify-end',
      )}
    >
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isAi
            ? 'border-l-2 border-[var(--link)] bg-[var(--surface-2)] text-[var(--text-strong)]'
            : 'bg-[var(--surface-3)] text-[var(--text-strong)]',
        )}
        style={{ whiteSpace: 'pre-wrap' }}
      >
        {message.content}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1.5 rounded-2xl border-l-2 border-[var(--link)] bg-[var(--surface-2)] px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-[var(--text-soft)] animate-[dot-bounce_1.4s_ease-in-out_infinite]"
            style={{ animationDelay: `${i * 0.16}s` }}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}
