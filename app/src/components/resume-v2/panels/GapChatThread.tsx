/**
 * GapChatThread — Per-item coaching conversation UI
 *
 * Renders chat messages, suggested language blocks, input bar.
 * Lives inside a RequirementCard in the GapAnalysisReportPanel.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import type { GapChatMessage, GapChatContext } from '@/types/resume-v2';
import { MAX_TURNS } from '@/hooks/useGapChat';
import { REPORT_COLORS } from './report-colors';

interface GapChatThreadProps {
  requirement: string;
  classification: 'partial' | 'missing' | 'strong';
  messages: GapChatMessage[];
  isLoading: boolean;
  error: string | null;
  resolvedLanguage: string | null;
  onSendMessage: (requirement: string, message: string, context: GapChatContext, classification: 'partial' | 'missing' | 'strong') => void;
  onAcceptLanguage: (requirement: string, language: string, candidateInputUsed?: boolean) => void;
  context: GapChatContext;
  /** Whether the parent is currently running an inline edit */
  isEditing?: boolean;
  onSkip?: () => void;
  sourceLabel?: string;
  sourceExcerpt?: string | null;
  initialQuestion?: string | null;
  initialSuggestedLanguage?: string | null;
  promptHint?: string | null;
}

function isGenericPromptQuestion(question: string | null | undefined): boolean {
  if (typeof question !== 'string') return true;
  const trimmed = question.trim();
  if (!trimmed) return true;

  return /^(tell me about|can you walk me through your experience|what experience do you have|share any experience|describe your experience)\b/i.test(trimmed)
    || /\brelated to\b/i.test(trimmed);
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div
        className="rounded-xl px-4 py-2.5 max-w-[85%]"
        style={{
          backgroundColor: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.10)',
        }}
      >
        <p style={{ fontSize: 14, lineHeight: 1.6, color: REPORT_COLORS.heading }}>
          {content}
        </p>
      </div>
    </div>
  );
}

function AssistantBubble({ message, onAcceptLanguage, isEditing, requirement, isAccepted }: {
  message: GapChatMessage;
  onAcceptLanguage: (requirement: string, language: string, candidateInputUsed?: boolean) => void;
  isEditing?: boolean;
  requirement: string;
  isAccepted: boolean;
}) {
  const [draftValue, setDraftValue] = useState(message.suggestedLanguage ?? '');
  const disabled = isEditing || isAccepted;

  useEffect(() => {
    setDraftValue(message.suggestedLanguage ?? '');
  }, [message.suggestedLanguage]);

  const handleAccept = useCallback(() => {
    if (disabled || !message.suggestedLanguage) return;
    onAcceptLanguage(
      requirement,
      draftValue.trim() || message.suggestedLanguage,
      message.candidateInputUsed,
    );
  }, [disabled, draftValue, message.candidateInputUsed, message.suggestedLanguage, onAcceptLanguage, requirement]);

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] space-y-2">
        <div
          className="rounded-xl px-4 py-2.5"
          style={{
            backgroundColor: 'rgba(175,196,255,0.05)',
            border: '1px solid rgba(175,196,255,0.12)',
          }}
        >
          <p style={{ fontSize: 14, lineHeight: 1.65, color: REPORT_COLORS.body }}>
            {message.content}
          </p>
        </div>

        {message.suggestedLanguage && (
          <div
            className="rounded-lg px-4 py-3"
            style={{
              backgroundColor: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(181,222,194,0.20)',
            }}
          >
            <span
              className="text-[12px] font-semibold uppercase tracking-wide"
              style={{ color: '#b5dec2' }}
            >
              Resume line ready to review
            </span>
            <p style={{ fontSize: 12, lineHeight: 1.55, color: REPORT_COLORS.tertiary, marginTop: 6 }}>
              Work directly in this box, then send it to review when it says what you mean.
            </p>
            <textarea
              value={draftValue}
              onChange={(event) => setDraftValue(event.target.value)}
              rows={6}
              aria-label="Edit suggested resume language"
              className="mt-3 min-h-[160px] w-full resize-y rounded-lg border border-[var(--line-strong)] bg-[var(--surface-1)] px-3 py-3 text-sm leading-relaxed text-[var(--text-strong)] outline-none transition-colors focus:border-[var(--line-strong)]"
            />
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleAccept}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#b5dec2',
                  backgroundColor: 'rgba(181,222,194,0.08)',
                  border: '1px solid rgba(181,222,194,0.20)',
                }}
                data-testid="accept-language"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {isEditing ? 'Sending to Review...' : 'Send to Review'}
              </button>
            </div>
          </div>
        )}

        {message.followUpQuestion && !message.suggestedLanguage && (
          <p style={{ fontSize: 13, color: REPORT_COLORS.tertiary, fontStyle: 'italic', marginTop: 4 }}>
            {message.followUpQuestion}
          </p>
        )}

        {!message.suggestedLanguage && (message.currentQuestion || message.recommendedNextAction || message.needsCandidateInput) && (
          <div
            className="rounded-lg px-3 py-2"
            style={{
              backgroundColor: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {message.currentQuestion && (
              <p style={{ fontSize: 12, color: REPORT_COLORS.heading, lineHeight: 1.5 }}>
                Next question: {message.currentQuestion}
              </p>
            )}
            {message.recommendedNextAction && (
              <p style={{ fontSize: 11, color: REPORT_COLORS.tertiary, marginTop: message.currentQuestion ? 4 : 0 }}>
                Recommended next step: {message.recommendedNextAction.replaceAll('_', ' ')}
              </p>
            )}
            {message.needsCandidateInput && (
              <p style={{ fontSize: 11, color: '#f0d99f', marginTop: 4 }}>
                This gap still needs candidate detail before it should count as addressed.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingDots() {
  return (
    <div className="flex justify-start">
      <div
        className="rounded-xl px-4 py-3"
        style={{
          backgroundColor: 'rgba(175,196,255,0.05)',
          border: '1px solid rgba(175,196,255,0.08)',
        }}
      >
        <div className="flex items-center gap-1.5" role="status" aria-label="Thinking">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block h-1.5 w-1.5 rounded-full bg-[#afc4ff]/60 animate-[dot-bounce_1.4s_ease-in-out_infinite]"
              style={{ animationDelay: `${i * 0.16}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function GapChatThread({
  requirement,
  classification,
  messages,
  isLoading,
  error,
  resolvedLanguage,
  onSendMessage,
  onAcceptLanguage,
  context,
  isEditing,
  onSkip,
  sourceLabel,
  sourceExcerpt,
  initialQuestion,
  initialSuggestedLanguage,
  promptHint,
}: GapChatThreadProps) {
  const [inputValue, setInputValue] = useState('');
  const [starterDraftValue, setStarterDraftValue] = useState(initialSuggestedLanguage ?? '');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setStarterDraftValue(initialSuggestedLanguage ?? '');
  }, [initialSuggestedLanguage]);

  // Track last sent message for retry on error
  const lastSentRef = useRef<string>('');

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;
    lastSentRef.current = trimmed;
    setInputValue('');
    onSendMessage(requirement, trimmed, context, classification);
  }, [inputValue, isLoading, requirement, context, classification, onSendMessage]);

  const handleRetry = useCallback(() => {
    if (!lastSentRef.current || isLoading) return;
    onSendMessage(requirement, lastSentRef.current, context, classification);
  }, [isLoading, requirement, context, classification, onSendMessage]);

  const sendQuickMessage = useCallback((message: string) => {
    if (isLoading) return;
    lastSentRef.current = message;
    onSendMessage(requirement, message, context, classification);
  }, [classification, context, isLoading, onSendMessage, requirement]);

  const latestSuggestedLanguage = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant' && typeof message.suggestedLanguage === 'string' && message.suggestedLanguage.trim().length > 0)
    ?.suggestedLanguage;
  const activeRewriteSeed = starterDraftValue.trim() || latestSuggestedLanguage?.trim() || initialSuggestedLanguage?.trim() || '';
  const preferredInitialQuestion = !isGenericPromptQuestion(initialQuestion)
    ? initialQuestion?.trim()
    : context.coachingPolicy?.clarifyingQuestion?.trim()
      || initialQuestion?.trim()
      || null;

  const requestGuidance = useCallback(() => {
    const focus = preferredInitialQuestion ?? promptHint ?? 'Ask for the one concrete detail that would make this proof direct and believable.';
    const proofTarget = context.coachingPolicy?.lookingFor
      ? ` What would make this believable: ${context.coachingPolicy.lookingFor}`
      : '';
    sendQuickMessage(
      `Using the role requirement, the current evidence, and the candidate background summary, do three things in plain language: ` +
      `1) say what the current evidence already proves, ` +
      `2) name the single missing detail that would make the proof direct, and ` +
      `3) ask exactly one short question to get that detail. ` +
      `Focus especially on this: ${focus}.${proofTarget}`,
    );
  }, [context.coachingPolicy?.lookingFor, preferredInitialQuestion, promptHint, sendQuickMessage]);

  const requestDraft = useCallback(() => {
    const startingPoint = activeRewriteSeed
      ? `Start from this rewrite and improve it if needed: "${activeRewriteSeed}"`
      : 'Draft the strongest truthful resume line you can from what we already know.';
    sendQuickMessage(
      `${startingPoint} Return one resume-ready line that sounds natural, specific, and believable. ` +
      `If one essential detail is still missing, say what detail is missing first and then ask exactly one short question.`,
    );
  }, [activeRewriteSeed, sendQuickMessage]);

  const requestAlternative = useCallback(() => {
    const startingPoint = activeRewriteSeed
      ? `Try a different truthful rewrite than this one: "${activeRewriteSeed}"`
      : 'Try a different truthful rewrite that takes another angle.';
    sendQuickMessage(
      `${startingPoint} Keep it easy to believe, specific, and ready for a resume. ` +
      `Use a meaningfully different angle than the last version, not just word swaps.`,
    );
  }, [activeRewriteSeed, sendQuickMessage]);

  const handleStarterApply = useCallback(() => {
    const trimmed = starterDraftValue.trim();
    if (!trimmed || isEditing) return;
    onAcceptLanguage(requirement, trimmed, false);
  }, [isEditing, onAcceptLanguage, requirement, starterDraftValue]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Textarea auto-resize
  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  }, []);

  const userTurnCount = messages.filter(m => m.role === 'user').length;
  const atTurnLimit = userTurnCount >= MAX_TURNS;
  const isAccepted = resolvedLanguage !== null;
  const introSourceLabel = sourceLabel ?? 'What the role is asking for';
  const introSourceExcerpt = sourceExcerpt ?? context.jobDescriptionExcerpt;
  const introQuestion = preferredInitialQuestion ?? promptHint ?? 'Add one concrete detail so we can turn this into direct proof for the role.';

  if (resolvedLanguage) {
    return (
      <div
        className="rounded-lg px-4 py-3 mt-2"
        style={{
          backgroundColor: 'rgba(181,222,194,0.05)',
          border: '1px solid rgba(181,222,194,0.15)',
        }}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" style={{ color: '#b5dec2' }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: '#b5dec2' }}>
            Sent to review
          </span>
        </div>
        <p style={{ fontSize: 13, color: REPORT_COLORS.secondary, marginTop: 4, lineHeight: 1.5 }}>
          &ldquo;{resolvedLanguage}&rdquo;
        </p>
      </div>
    );
  }

  return (
    <div
      className="mt-3 rounded-xl overflow-hidden"
      style={{
        border: '1px solid rgba(175,196,255,0.12)',
        backgroundColor: 'rgba(0,0,0,0.15)',
      }}
      data-testid="gap-chat-thread"
    >
      {messages.length === 0 && !resolvedLanguage && (
        <div className="space-y-3 border-b border-[var(--line-soft)] px-4 py-4">
          <div
            className="rounded-lg px-4 py-3"
            style={{
              backgroundColor: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <p className="text-[13px] font-semibold uppercase tracking-[0.16em]" style={{ color: REPORT_COLORS.tertiary }}>
              {introSourceLabel}
            </p>
            <p className="mt-2" style={{ fontSize: 16, lineHeight: 1.7, color: REPORT_COLORS.heading }}>
              {introSourceExcerpt}
            </p>
          </div>

          <div
            className="rounded-lg px-4 py-3"
            style={{
              backgroundColor: 'rgba(175,196,255,0.05)',
              border: '1px solid rgba(175,196,255,0.12)',
            }}
          >
            <p className="text-[13px] font-semibold uppercase tracking-[0.16em]" style={{ color: '#afc4ff' }}>
              Best next detail to add
            </p>
            <p className="mt-2" style={{ fontSize: 15, lineHeight: 1.65, color: REPORT_COLORS.body }}>
              {introQuestion}
            </p>
            {context.coachingPolicy?.lookingFor && (
              <p className="mt-2" style={{ fontSize: 12, lineHeight: 1.55, color: REPORT_COLORS.tertiary }}>
                What to add next: {context.coachingPolicy.lookingFor}
              </p>
            )}
          </div>

          <div
            className="rounded-lg px-4 py-3"
            style={{
              backgroundColor: 'rgba(181,222,194,0.05)',
              border: '1px solid rgba(181,222,194,0.18)',
            }}
          >
            <p className="text-[13px] font-semibold uppercase tracking-[0.16em]" style={{ color: '#b5dec2' }}>
              Suggested rewrite to start from
            </p>
            {initialSuggestedLanguage ? (
              <>
                <p className="mt-2" style={{ fontSize: 13, lineHeight: 1.55, color: REPORT_COLORS.tertiary }}>
                  Start here if this sounds close. Edit it until it says exactly what you mean, then send it to review.
                </p>
                <textarea
                  value={starterDraftValue}
                  onChange={(event) => setStarterDraftValue(event.target.value)}
                  rows={5}
                  aria-label="Edit the suggested rewrite"
                  className="mt-3 min-h-[150px] w-full resize-y rounded-lg border border-[var(--line-strong)] bg-[var(--surface-1)] px-3 py-3 text-sm leading-relaxed text-[var(--text-strong)] outline-none transition-colors focus:border-[var(--line-strong)]"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleStarterApply}
                    disabled={isEditing || !starterDraftValue.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 transition-colors hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: '#b5dec2',
                      backgroundColor: 'rgba(181,222,194,0.08)',
                      border: '1px solid rgba(181,222,194,0.20)',
                    }}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {isEditing ? 'Sending to Review...' : 'Send to Review'}
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-2" style={{ fontSize: 15, lineHeight: 1.65, color: REPORT_COLORS.body }}>
                We do not have a safe rewrite yet. Add one concrete detail first, and we can turn it into a truthful resume line.
              </p>
            )}
          </div>
        </div>
      )}

      {messages.length > 0 && !resolvedLanguage && (
        <div className="space-y-2 border-b border-[var(--line-soft)] px-4 py-4">
          <div
            className="rounded-lg px-4 py-3"
            style={{
              backgroundColor: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <p className="text-[13px] font-semibold uppercase tracking-[0.16em]" style={{ color: REPORT_COLORS.tertiary }}>
              {introSourceLabel}
            </p>
            <p className="mt-2" style={{ fontSize: 14, lineHeight: 1.65, color: REPORT_COLORS.heading }}>
              {introSourceExcerpt}
            </p>
          </div>

          <div
            className="rounded-lg px-4 py-3"
            style={{
              backgroundColor: 'rgba(175,196,255,0.05)',
              border: '1px solid rgba(175,196,255,0.12)',
            }}
          >
            <p className="text-[13px] font-semibold uppercase tracking-[0.16em]" style={{ color: '#afc4ff' }}>
              Best next detail to add
            </p>
            <p className="mt-2" style={{ fontSize: 14, lineHeight: 1.65, color: REPORT_COLORS.body }}>
              {introQuestion}
            </p>
            {context.coachingPolicy?.lookingFor && (
              <p className="mt-2" style={{ fontSize: 12, lineHeight: 1.55, color: REPORT_COLORS.tertiary }}>
                What to add next: {context.coachingPolicy.lookingFor}
              </p>
            )}
            {activeRewriteSeed && (
              <p className="mt-2" style={{ fontSize: 12, lineHeight: 1.55, color: REPORT_COLORS.tertiary }}>
                The latest rewrite is ready below. Keep editing it there or ask for a stronger or different version.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Messages — accessible chat log */}
      {messages.length > 0 && (
        <div
          className="px-4 py-3 space-y-3 max-h-[400px] overflow-y-auto"
          role="log"
          aria-live="polite"
          aria-label={`Coaching conversation about: ${requirement}`}
        >
          {messages.map((msg, i) => {
            const renderedMessage = msg.role === 'assistant'
              && isGenericPromptQuestion(msg.currentQuestion)
              && context.coachingPolicy?.clarifyingQuestion
              ? {
                  ...msg,
                  currentQuestion: context.coachingPolicy.clarifyingQuestion,
                }
              : msg;

            return renderedMessage.role === 'user' ? (
              <UserBubble key={i} content={renderedMessage.content} />
            ) : (
              <AssistantBubble
                key={i}
                message={renderedMessage}
                onAcceptLanguage={onAcceptLanguage}
                isEditing={isEditing}
                requirement={requirement}
                isAccepted={isAccepted}
              />
            );
          })}
          {isLoading && <LoadingDots />}
          <div ref={messagesEndRef} />
        </div>
      )}

      {!resolvedLanguage && (
        <div
          className="flex flex-wrap gap-2 px-3 py-2.5"
          style={{ borderTop: messages.length > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
        >
          <button
            type="button"
            onClick={requestGuidance}
            disabled={isLoading}
            className="rounded-lg px-3 py-1.5 text-[13px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              color: '#afc4ff',
              backgroundColor: 'rgba(175,196,255,0.06)',
              border: '1px solid rgba(175,196,255,0.15)',
            }}
            >
            Tell Me What Is Missing
          </button>
          <button
            type="button"
            onClick={requestDraft}
            disabled={isLoading}
            className="rounded-lg px-3 py-1.5 text-[13px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              color: '#b5dec2',
              backgroundColor: 'rgba(181,222,194,0.08)',
              border: '1px solid rgba(181,222,194,0.20)',
            }}
            >
            Draft from What We Know
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={requestAlternative}
              disabled={isLoading}
              className="rounded-lg px-3 py-1.5 text-[13px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                color: REPORT_COLORS.secondary,
                backgroundColor: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.10)',
              }}
            >
              Show Another Rewrite
            </button>
          )}
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="rounded-lg px-3 py-1.5 text-[13px] transition-colors hover:opacity-80"
              style={{
                color: REPORT_COLORS.tertiary,
                backgroundColor: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              Skip for Now
            </button>
          )}
        </div>
      )}

      {!resolvedLanguage && (
        <div className="px-4 pb-1 text-xs leading-5 text-[var(--text-soft)]">
          Fastest path: add one concrete detail below, and we will rewrite from that instead of guessing.
        </div>
      )}

      {/* Error with retry */}
      {error && (
        <div className="px-4 py-2 flex items-center gap-2 text-xs" style={{ color: '#f0b8b8' }}>
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="flex-1">{error}</span>
          {lastSentRef.current && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={isLoading}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 hover:bg-[var(--surface-1)] transition-colors disabled:opacity-30"
              style={{ color: REPORT_COLORS.secondary, fontSize: 12 }}
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </button>
          )}
        </div>
      )}

      {/* Turn limit message */}
      {atTurnLimit && (
        <div className="px-4 py-2 text-xs" style={{ color: REPORT_COLORS.tertiary }}>
          Conversation limit reached. Send the current rewrite to review or skip for now.
        </div>
      )}

      {/* Input bar */}
      {!atTurnLimit && (
        <div
          className="flex items-end gap-2 px-3 py-2.5"
          style={{ borderTop: messages.length > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
        >
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={messages.length === 0
              ? 'Add one concrete detail here, like a metric, scope, reporting cadence, stakeholder group, or business result, and we will improve the rewrite.'
              : 'Add the next missing detail or ask for another rewrite...'
            }
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none rounded-lg px-3 py-2 focus:outline-none transition-colors disabled:opacity-50"
            style={{
              fontSize: 14,
              lineHeight: 1.5,
              color: REPORT_COLORS.heading,
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.10)',
              minHeight: 110,
              maxHeight: 220,
            }}
            aria-label={`Chat about: ${requirement}`}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            className="rounded-lg p-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--surface-1)]"
            style={{
              color: inputValue.trim() ? '#afc4ff' : REPORT_COLORS.tertiary,
            }}
            aria-label="Send message"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
