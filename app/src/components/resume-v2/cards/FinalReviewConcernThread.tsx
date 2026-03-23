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

function isGenericConcernQuestion(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return (
    /what additional detail can you share/.test(normalized)
    || /what proof can you add here truthfully/.test(normalized)
    || /what concrete truthful detail would address this concern/.test(normalized)
    || /what truthful detail would address this concern/.test(normalized)
    || /what proof can you add here/.test(normalized)
  );
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
  fallbackQuestion,
}: {
  message: GapChatMessage;
  concernId: string;
  isEditing?: boolean;
  isAccepted: boolean;
  onReviewEdit: (concernId: string, language: string, candidateInputUsed?: boolean) => void;
  fallbackQuestion?: string;
}) {
  const [draftValue, setDraftValue] = useState(message.suggestedLanguage ?? '');
  const disabled = isEditing || isAccepted;
  const visibleQuestion = isGenericConcernQuestion(message.currentQuestion)
    ? (fallbackQuestion ?? message.currentQuestion)
    : message.currentQuestion;

  useEffect(() => {
    setDraftValue(message.suggestedLanguage ?? '');
  }, [message.suggestedLanguage]);

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] space-y-2">
        <div className="rounded-md border border-[#afc4ff]/12 bg-[#afc4ff]/[0.05] px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
          <p className="text-sm leading-6 text-white/76">{message.content}</p>
          {visibleQuestion && (
            <p className="mt-2 text-xs italic text-[#f0d99f]/85">
              Next question: {visibleQuestion}
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
                {isEditing ? 'Sending to Review...' : 'Send to Review'}
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
  const [starterDraftValue, setStarterDraftValue] = useState(context.suggestedResumeEdit ?? '');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastSentRef = useRef('');

  useEffect(() => {
    setStarterDraftValue(context.suggestedResumeEdit ?? '');
  }, [context.suggestedResumeEdit]);

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
    const focus = context.clarifyingQuestion ?? context.fixStrategy;
    sendQuickMessage(
      `Using this final review concern, do three things in plain language: ` +
      `1) say what the current resume already proves, ` +
      `2) name the single missing detail that would make this concern safer, and ` +
      `3) ask exactly one short question to get that detail. ` +
      `Focus especially on this: ${focus}`,
    );
  }, [context.clarifyingQuestion, context.fixStrategy, sendQuickMessage]);

  const requestDraft = useCallback(() => {
    const startingPoint = starterDraftValue.trim()
      ? `Start from this draft and improve it if needed: "${starterDraftValue.trim()}"`
      : context.suggestedResumeEdit
        ? `Start from this draft and improve it if needed: "${context.suggestedResumeEdit}"`
        : 'Draft the strongest truthful fix you can from what we already know.';
    sendQuickMessage(
      `${startingPoint} Keep it natural, specific, and believable. ` +
      `If one essential detail is still missing, say what detail is missing first and then ask exactly one short question.`,
    );
  }, [context.suggestedResumeEdit, sendQuickMessage, starterDraftValue]);

  const requestAlternative = useCallback(() => {
    const startingPoint = starterDraftValue.trim()
      ? `Try a different truthful version than this one: "${starterDraftValue.trim()}"`
      : context.suggestedResumeEdit
        ? `Try a different truthful version than this one: "${context.suggestedResumeEdit}"`
        : 'Try one different truthful version that takes another angle without sounding inflated.';
    sendQuickMessage(
      `${startingPoint} Keep the meaning grounded in the actual concern and resume evidence, not just a wording swap.`,
    );
  }, [context.suggestedResumeEdit, sendQuickMessage, starterDraftValue]);

  const handleStarterApply = useCallback(() => {
    const trimmed = starterDraftValue.trim();
    if (!trimmed || isEditing) return;
    onReviewEdit(concernId, trimmed, false);
  }, [concernId, isEditing, onReviewEdit, starterDraftValue]);

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
      {messages.length === 0 && (
        <div className="space-y-3 border-b border-white/[0.06] px-4 py-4">
          <div className="rounded-md border border-white/[0.08] bg-white/[0.03] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/42">
              What needs to be fixed
            </p>
            <p className="mt-2 text-base leading-7 text-white/82">
              {context.relatedRequirement ?? context.observation}
            </p>
          </div>

          <div className="rounded-md border border-[#afc4ff]/12 bg-[#afc4ff]/[0.05] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#afc4ff]">
              Best next detail to add
            </p>
            <p className="mt-2 text-sm leading-6 text-white/76">
              {context.clarifyingQuestion ?? context.fixStrategy}
            </p>
          </div>

          {context.suggestedResumeEdit && (
            <div className="rounded-md border border-[#b5dec2]/20 bg-[#b5dec2]/[0.05] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#b5dec2]">
                Suggested rewrite to start from
              </p>
              <p className="mt-1 text-xs leading-5 text-white/58">
                Start here if this sounds close. Edit it until it says exactly what you mean, then send it to review.
              </p>
              <textarea
                value={starterDraftValue}
                onChange={(event) => setStarterDraftValue(event.target.value)}
                rows={5}
                aria-label="Edit the suggested final review rewrite"
                className="mt-3 min-h-[150px] w-full resize-y rounded-md border border-white/[0.12] bg-white/[0.05] px-3 py-3 text-sm leading-6 text-white/88 outline-none transition-colors focus:border-white/[0.24]"
              />
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={handleStarterApply}
                  disabled={isEditing || !starterDraftValue.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#b5dec2]/25 bg-[#b5dec2]/10 px-3 py-2 text-xs font-medium uppercase tracking-[0.12em] text-[#b5dec2] transition-colors hover:bg-[#b5dec2]/18 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {isEditing ? 'Sending to Review...' : 'Send to Review'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
                  fallbackQuestion={context.clarifyingQuestion}
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
            ? (context.clarifyingQuestion ?? context.fixStrategy ?? 'Add one concrete detail here and AI will turn it into a stronger draft...')
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
