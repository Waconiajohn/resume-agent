import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import type { FinalReviewChatContext, GapChatMessage } from '@/types/resume-v2';
import type { FinalReviewChatHook } from '@/hooks/useFinalReviewChat';

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
      <div className="max-w-[85%] rounded-md border border-white/[0.10] bg-white/[0.06] px-4 py-2.5 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
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
  const [draftValue, setDraftValue] = useState(message.suggestedLanguage ?? '');
  const disabled = isEditing || isAccepted;

  useEffect(() => {
    setDraftValue(message.suggestedLanguage ?? '');
  }, [message.suggestedLanguage]);

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] space-y-2">
        <div className="rounded-md border border-[#afc4ff]/12 bg-[#afc4ff]/[0.05] px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
          <p className="text-sm leading-6 text-white/76">{message.content}</p>
          {message.currentQuestion && (
            <p className="mt-2 text-xs italic text-[#f0d99f]/85">
              Next question: {message.currentQuestion}
            </p>
          )}
        </div>

        {message.suggestedLanguage && (
          <div className="rounded-md border border-[#b5dec2]/20 bg-[#b5dec2]/[0.05] px-4 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#b5dec2]">
              Suggested Resume Language
            </span>
            <p className="mt-1 text-xs leading-5 text-white/58">
              Work directly in this box, then apply the draft when it says what you mean.
            </p>
            <textarea
              value={draftValue}
              onChange={(event) => setDraftValue(event.target.value)}
              rows={6}
              aria-label="Edit final review draft"
              className="mt-3 min-h-[160px] w-full resize-y rounded-md border border-white/[0.12] bg-white/[0.05] px-3 py-3 text-sm leading-6 text-white/88 outline-none transition-colors focus:border-white/[0.24]"
            />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!disabled) {
                    onReviewEdit(
                      concernId,
                      draftValue.trim() || message.suggestedLanguage!,
                      message.candidateInputUsed,
                    );
                  }
                }}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#b5dec2]/25 bg-[#b5dec2]/10 px-3 py-2 text-xs font-medium uppercase tracking-[0.12em] text-[#b5dec2] transition-colors hover:bg-[#b5dec2]/18 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {isEditing ? 'Preparing Edit...' : 'Apply Draft'}
              </button>
            </div>
          </div>
        )}

        {!message.suggestedLanguage && message.recommendedNextAction && (
          <div className="rounded-md border border-white/[0.06] bg-white/[0.025] px-3 py-2">
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
      <div className="rounded-md border border-[#afc4ff]/10 bg-[#afc4ff]/[0.05] px-4 py-3">
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

  const requestGuidance = useCallback(() => {
    sendQuickMessage('Ask me the single most useful question you need answered to strengthen this concern truthfully.');
  }, [sendQuickMessage]);

  const requestDraft = useCallback(() => {
    sendQuickMessage('Draft the strongest truthful fix you can from what we already know, and keep it natural and believable.');
  }, [sendQuickMessage]);

  const requestAlternative = useCallback(() => {
    sendQuickMessage('Try one different truthful version that takes another angle without sounding inflated.');
  }, [sendQuickMessage]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  if (resolvedLanguage) {
    return (
      <div className="support-callout mt-2 border-[#b5dec2]/15 bg-[#b5dec2]/[0.05] px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-[#b5dec2]" />
          <span className="text-sm font-medium text-[#b5dec2]">Accepted Final Review edit</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-white/70">&ldquo;{resolvedLanguage}&rdquo;</p>
      </div>
    );
  }

  return (
    <div className="room-shell mt-3 overflow-hidden border-[#afc4ff]/12 bg-black/15" data-testid="final-review-thread">
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
            onClick={requestGuidance}
            disabled={isLoading}
            className="rounded-md border border-[#afc4ff]/16 bg-[#afc4ff]/[0.05] px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-[#afc4ff] transition-colors hover:bg-[#afc4ff]/[0.10] disabled:opacity-40"
          >
            Ask AI What Detail Is Missing
          </button>
          <button
            type="button"
            onClick={requestDraft}
            disabled={isLoading}
            className="rounded-md border border-[#b5dec2]/25 bg-[#b5dec2]/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-[#b5dec2] transition-colors hover:bg-[#b5dec2]/18 disabled:opacity-40"
          >
            Draft Stronger Version
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={requestAlternative}
              disabled={isLoading}
              className="rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-white/68 transition-colors hover:bg-white/[0.06] disabled:opacity-40"
            >
              Try Another Version
            </button>
          )}
          {onCloseThread && (
            <button
              type="button"
              onClick={onCloseThread}
              className="rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-white/48 transition-colors hover:bg-white/[0.05] hover:text-white/70"
            >
              Skip for Now
            </button>
          )}
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
            ? 'Add one concrete detail here and AI will turn it into a stronger draft...'
            : 'Add the next detail or ask AI for a stronger version...'}
          rows={1}
          disabled={isLoading}
          className="min-h-[36px] max-h-[120px] flex-1 resize-none rounded-md border border-white/[0.10] bg-white/[0.04] px-3 py-2 text-sm leading-6 text-white/86 transition-colors focus:outline-none disabled:opacity-50"
          style={{ minHeight: 110, maxHeight: 220 }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!inputValue.trim() || isLoading}
          className="rounded-md border border-[#afc4ff]/16 bg-[#afc4ff]/[0.05] p-2.5 transition-colors hover:bg-[#afc4ff]/[0.10] disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Send message"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-[#afc4ff]" /> : <Send className="h-4 w-4 text-[#afc4ff]" />}
        </button>
      </div>
    </div>
  );
}
