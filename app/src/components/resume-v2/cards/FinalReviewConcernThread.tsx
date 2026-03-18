import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import type { FinalReviewChatContext, GapChatMessage } from '@/types/resume-v2';
import type { FinalReviewChatHook } from '@/hooks/useFinalReviewChat';

const EVIDENCE_SHORTCUTS = [
  {
    label: 'Metrics',
    message: 'Ask me specifically about measurable business impact, percentages, cost savings, revenue impact, or cycle-time improvement for this concern.',
  },
  {
    label: 'Team Scope',
    message: 'Ask me about team size, reporting scope, stakeholders, or leadership scale that would strengthen this concern.',
  },
  {
    label: 'Budget',
    message: 'Ask me whether I owned a budget, P&L, vendor spend, or financial accountability relevant to this concern.',
  },
  {
    label: 'Customer Scale',
    message: 'Ask me about customer count, user scale, site count, geography, or operational footprint related to this concern.',
  },
  {
    label: 'Tools',
    message: 'Ask me about the platforms, systems, tools, or domain knowledge that would make this section more credible.',
  },
  {
    label: 'Ownership',
    message: 'Ask me about end-to-end ownership, authority, or decision rights that would help fix this concern.',
  },
];

const REWRITE_ANGLE_SHORTCUTS = [
  {
    label: 'Direct',
    message: 'Give me one direct, plainspoken rewrite that addresses this concern without embellishment.',
  },
  {
    label: 'Executive',
    message: 'Rewrite this concern in a sharper executive tone while staying fully truthful and credible.',
  },
  {
    label: 'Metrics-First',
    message: 'If possible, lead with measurable impact and give me a metrics-first rewrite for this concern.',
  },
];

const POSITIONING_SHORTCUTS = [
  {
    label: 'Conservative',
    message: 'Give me the most conservative version that stays very close to what is already clearly proven.',
  },
  {
    label: 'Balanced',
    message: 'Give me a balanced version that improves competitiveness without overstating anything.',
  },
  {
    label: 'Competitive',
    message: 'Give me the strongest truthful competitive version, using adjacent experience if needed without sounding inflated.',
  },
];

const PLACEMENT_SHORTCUTS = [
  {
    label: 'Bullet',
    message: 'Present the next fix as a resume bullet.',
  },
  {
    label: 'Summary Line',
    message: 'Present the next fix as a short executive-summary line.',
  },
  {
    label: 'Scope Statement',
    message: 'Present the next fix as a scope statement that frames the bullets below it.',
  },
];

interface FinalReviewConcernThreadProps {
  concernId: string;
  messages: GapChatMessage[];
  isLoading: boolean;
  error: string | null;
  resolvedLanguage: string | null;
  onSendMessage: FinalReviewChatHook['sendMessage'];
  onReviewEdit: (concernId: string, language: string, candidateInputUsed?: boolean) => void;
  context: FinalReviewChatContext;
  isEditing?: boolean;
  onCloseThread?: () => void;
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-xl border border-white/[0.10] bg-white/[0.06] px-4 py-2.5">
        <p className="text-sm leading-6 text-white/88">{content}</p>
      </div>
    </div>
  );
}

function AssistantBubble({
  message,
  concernId,
  isEditing,
  isAccepted,
  onReviewEdit,
}: {
  message: GapChatMessage;
  concernId: string;
  isEditing?: boolean;
  isAccepted: boolean;
  onReviewEdit: (concernId: string, language: string, candidateInputUsed?: boolean) => void;
}) {
  const disabled = isEditing || isAccepted;

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] space-y-2">
        <div className="rounded-xl border border-[#afc4ff]/12 bg-[#afc4ff]/[0.05] px-4 py-2.5">
          <p className="text-sm leading-6 text-white/76">{message.content}</p>
          {message.currentQuestion && (
            <p className="mt-2 text-xs italic text-[#f0d99f]/85">
              Next question: {message.currentQuestion}
            </p>
          )}
        </div>

        {message.suggestedLanguage && (
          <div className="rounded-lg border border-[#b5dec2]/20 bg-[#b5dec2]/[0.05] px-4 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#b5dec2]">
              Suggested Resume Language
            </span>
            <p className="mt-1 text-sm leading-6 text-white/88">&ldquo;{message.suggestedLanguage}&rdquo;</p>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!disabled) {
                    onReviewEdit(concernId, message.suggestedLanguage!, message.candidateInputUsed);
                  }
                }}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#b5dec2]/25 bg-[#b5dec2]/10 px-3 py-1.5 text-xs font-medium text-[#b5dec2] transition-colors hover:bg-[#b5dec2]/18 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {isEditing ? 'Preparing Edit...' : 'Review Edit'}
              </button>
            </div>
          </div>
        )}

        {!message.suggestedLanguage && message.recommendedNextAction && (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2">
            <p className="text-[11px] text-white/42">
              Recommended next step: <span className="text-white/60">{message.recommendedNextAction.replaceAll('_', ' ')}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingDots() {
  return (
    <div className="flex justify-start">
      <div className="rounded-xl border border-[#afc4ff]/10 bg-[#afc4ff]/[0.05] px-4 py-3">
        <div className="flex items-center gap-1.5" role="status" aria-label="Thinking">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="inline-block h-1.5 w-1.5 rounded-full bg-[#afc4ff]/60 animate-[dot-bounce_1.4s_ease-in-out_infinite]"
              style={{ animationDelay: `${dot * 0.16}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function FinalReviewConcernThread({
  concernId,
  messages,
  isLoading,
  error,
  resolvedLanguage,
  onSendMessage,
  onReviewEdit,
  context,
  isEditing,
  onCloseThread,
}: FinalReviewConcernThreadProps) {
  const [inputValue, setInputValue] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastSentRef = useRef('');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;
    lastSentRef.current = trimmed;
    setInputValue('');
    onSendMessage(concernId, trimmed, context);
  }, [concernId, context, inputValue, isLoading, onSendMessage]);

  const handleRetry = useCallback(() => {
    if (!lastSentRef.current || isLoading) return;
    onSendMessage(concernId, lastSentRef.current, context);
  }, [concernId, context, isLoading, onSendMessage]);

  const sendQuickMessage = useCallback((message: string) => {
    if (isLoading) return;
    lastSentRef.current = message;
    onSendMessage(concernId, message, context);
  }, [concernId, context, isLoading, onSendMessage]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  if (resolvedLanguage) {
    return (
      <div className="mt-2 rounded-lg border border-[#b5dec2]/15 bg-[#b5dec2]/[0.05] px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-[#b5dec2]" />
          <span className="text-sm font-medium text-[#b5dec2]">Accepted Final Review edit</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-white/70">&ldquo;{resolvedLanguage}&rdquo;</p>
      </div>
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-[#afc4ff]/12 bg-black/15" data-testid="final-review-thread">
      {messages.length > 0 && (
        <div className="max-h-[360px] space-y-3 overflow-y-auto px-4 py-3" role="log" aria-live="polite">
          {messages.map((message, index) => (
            message.role === 'user'
              ? <UserBubble key={index} content={message.content} />
              : (
                <AssistantBubble
                  key={index}
                  concernId={concernId}
                  message={message}
                  isEditing={isEditing}
                  isAccepted={resolvedLanguage !== null}
                  onReviewEdit={onReviewEdit}
                />
              )
          ))}
          {isLoading && <LoadingDots />}
          <div ref={messagesEndRef} />
        </div>
      )}

      {!resolvedLanguage && (
        <div className="flex flex-wrap gap-2 border-t border-white/[0.06] px-3 py-2.5">
          <button
            type="button"
            onClick={() => setShowAdvanced((previous) => !previous)}
            disabled={isLoading}
            className="rounded-lg border border-[#afc4ff]/16 bg-[#afc4ff]/[0.05] px-2.5 py-1 text-[11px] text-[#afc4ff] transition-colors hover:bg-[#afc4ff]/[0.10] disabled:opacity-40"
          >
            {showAdvanced ? 'Hide More Options' : 'More Options'}
          </button>
          {onCloseThread && (
            <button
              type="button"
              onClick={onCloseThread}
              className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[11px] text-white/48 transition-colors hover:bg-white/[0.05] hover:text-white/70"
            >
              Skip for Now
            </button>
          )}
        </div>
      )}

      {!resolvedLanguage && showAdvanced && (
        <div className="space-y-2 px-3 pb-2.5">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.08em] text-white/38">More ways to answer</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => sendQuickMessage('Please ask me one targeted follow-up question that would make this resume evidence stronger.')}
                disabled={isLoading}
                className="rounded-lg border border-[#afc4ff]/16 bg-[#afc4ff]/[0.05] px-2.5 py-1 text-[11px] text-[#afc4ff] transition-colors hover:bg-[#afc4ff]/[0.10] disabled:opacity-40"
              >
                Ask Another Question
              </button>
              <button
                type="button"
                onClick={() => sendQuickMessage('Please try another truthful angle for this concern and suggest different resume language.')}
                disabled={isLoading}
                className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/68 transition-colors hover:bg-white/[0.06] disabled:opacity-40"
              >
                Try Another Angle
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.08em] text-white/38">Evidence Shortcuts</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {EVIDENCE_SHORTCUTS.map((shortcut) => (
                <button
                  key={shortcut.label}
                  type="button"
                  onClick={() => sendQuickMessage(shortcut.message)}
                  disabled={isLoading}
                  className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/64 transition-colors hover:bg-white/[0.06] disabled:opacity-30"
                >
                  {shortcut.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[#afc4ff]/12 bg-[#afc4ff]/[0.04] px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.08em] text-[#afc4ff]/82">Rewrite Variants</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {REWRITE_ANGLE_SHORTCUTS.map((shortcut) => (
                <button
                  key={shortcut.label}
                  type="button"
                  onClick={() => sendQuickMessage(shortcut.message)}
                  disabled={isLoading}
                  className="rounded-lg border border-[#afc4ff]/12 bg-[#afc4ff]/[0.06] px-2.5 py-1 text-[11px] text-[#afc4ff] transition-colors hover:bg-[#afc4ff]/[0.12] disabled:opacity-40"
                >
                  {shortcut.label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {POSITIONING_SHORTCUTS.map((shortcut) => (
                <button
                  key={shortcut.label}
                  type="button"
                  onClick={() => sendQuickMessage(shortcut.message)}
                  disabled={isLoading}
                  className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/68 transition-colors hover:bg-white/[0.06] disabled:opacity-40"
                >
                  {shortcut.label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {PLACEMENT_SHORTCUTS.map((shortcut) => (
                <button
                  key={shortcut.label}
                  type="button"
                  onClick={() => sendQuickMessage(shortcut.message)}
                  disabled={isLoading}
                  className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/68 transition-colors hover:bg-white/[0.06] disabled:opacity-40"
                >
                  {shortcut.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs text-[#f0b8b8]">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="flex-1">{error}</span>
          {lastSentRef.current && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={isLoading}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[#afc4ff] transition-colors hover:bg-white/[0.06] disabled:opacity-30"
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </button>
          )}
        </div>
      )}

      <div className="flex items-end gap-2 border-t border-white/[0.06] px-3 py-2.5">
        <textarea
          ref={inputRef}
          value={inputValue}
          onChange={(event) => {
            setInputValue(event.target.value);
            event.target.style.height = 'auto';
            event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
          }}
          onKeyDown={handleKeyDown}
          placeholder={messages.length === 0
            ? 'Answer the missing detail or ask for another angle...'
            : 'Share the next detail you want the AI to use...'}
          rows={1}
          disabled={isLoading}
          className="min-h-[36px] max-h-[120px] flex-1 resize-none rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-2 text-sm leading-6 text-white/86 transition-colors focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!inputValue.trim() || isLoading}
          className="rounded-lg p-2 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Send message"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-[#afc4ff]" /> : <Send className="h-4 w-4 text-[#afc4ff]" />}
        </button>
      </div>
    </div>
  );
}
