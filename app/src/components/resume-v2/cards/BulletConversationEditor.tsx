/**
 * BulletConversationEditor — Focused conversation panel for resolving colored bullets.
 *
 * Opens inline below a bullet in the resume document.
 * One question per state, per-state quick-reply options, chat interface.
 * Reuses useGapChat infrastructure for conversation state.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, X, Sparkles } from 'lucide-react';
import type { ResumeReviewState, GapChatMessage, GapChatContext, RequirementSource } from '@/types/resume-v2';
import type { GapChatHook } from '@/hooks/useGapChat';
import { REVIEW_STATE_DISPLAY } from '../utils/review-state-labels';

interface BulletConversationEditorProps {
  bulletText: string;
  section: string;
  bulletIndex: number;
  requirements: string[];
  reviewState: ResumeReviewState;
  requirementSource?: RequirementSource;
  evidenceFound: string;
  gapChat: GapChatHook;
  chatContext: GapChatContext;
  onApplyToResume: (section: string, index: number, newText: string) => void;
  onClose: () => void;
}

// ─── Opening messages per state ──────────────────────────────────────────────

function getOpeningMessage(reviewState: ResumeReviewState, requirements: string[]): string {
  const reqLabel = requirements[0] ?? 'this requirement';
  switch (reviewState) {
    case 'code_red':
      return (
        `I wrote this bullet to address "${reqLabel}", but I couldn\u2019t find direct proof ` +
        `for it in your original resume. You can tell me the real story behind this claim, ` +
        `I can draft something from adjacent experience, or we remove it. What actually happened here?`
      );
    case 'confirm_fit':
      return (
        `This bullet comes from the benchmark profile for this type of role \u2014 it\u2019s what ` +
        `a strong candidate typically looks like. Does this actually describe your background? ` +
        `Answer honestly and I\u2019ll either keep it, adjust it to fit your real experience, or remove it.`
      );
    case 'strengthen':
      return (
        `You have real experience here \u2014 I can see it in your resume. But this bullet ` +
        `isn\u2019t connecting it clearly enough to what this employer needs. Can you add a ` +
        `specific metric, scope, or outcome to make it more concrete?`
      );
    default:
      return 'How would you like to improve this bullet?';
  }
}

// ─── Quick-reply configs per state ───────────────────────────────────────────

interface QuickReply {
  label: string;
  message: string;
}

function getQuickReplies(reviewState: ResumeReviewState): QuickReply[] {
  switch (reviewState) {
    case 'code_red':
      return [
        { label: 'I have the real story', message: 'Let me tell you what actually happened here.' },
        { label: 'Draft from adjacent experience', message: 'I have related experience. Draft something from what you can see in my resume and I\u2019ll refine it.' },
        { label: 'Remove this line', message: 'Remove this bullet \u2014 I don\u2019t have direct experience to back it up.' },
      ];
    case 'confirm_fit':
      return [
        { label: 'Yes, this fits me', message: 'Yes, this accurately describes my background. Keep it.' },
        { label: 'Adjust it to fit my real experience', message: 'This is close but not quite right. Let me tell you what I actually did so you can adjust it.' },
        { label: 'No, this isn\u2019t really me', message: 'This doesn\u2019t honestly describe my experience. What\u2019s closer to the truth is:' },
      ];
    case 'strengthen':
      return [
        { label: 'Add a metric', message: 'Help me add a concrete metric or measurable outcome to this bullet.' },
        { label: 'Make it more specific', message: 'Make this more specific \u2014 here\u2019s more context about what I actually did.' },
        { label: 'Draft a stronger version', message: 'Draft the strongest truthful version of this bullet from what you know.' },
      ];
    default:
      return [];
  }
}

// ─── Bubble components (light theme for resume context) ──────────────────────

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="rounded-xl px-4 py-2.5 max-w-[85%] bg-blue-50 border border-blue-100">
        <p className="text-[14px] leading-relaxed text-neutral-700">{content}</p>
      </div>
    </div>
  );
}

function AssistantBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-start">
      <div className="rounded-xl px-4 py-2.5 max-w-[90%] bg-neutral-50 border border-neutral-200">
        <p className="text-[14px] leading-relaxed text-neutral-700">{content}</p>
      </div>
    </div>
  );
}

function LoadingDots() {
  return (
    <div className="flex justify-start">
      <div className="rounded-xl px-4 py-3 bg-neutral-50 border border-neutral-200">
        <div className="flex items-center gap-1.5" role="status" aria-label="Thinking">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block h-1.5 w-1.5 rounded-full bg-neutral-400 animate-[dot-bounce_1.4s_ease-in-out_infinite]"
              style={{ animationDelay: `${i * 0.16}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function BulletConversationEditor({
  bulletText,
  section,
  bulletIndex,
  requirements,
  reviewState,
  evidenceFound,
  gapChat,
  chatContext,
  onApplyToResume,
  onClose,
}: BulletConversationEditorProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastSentRef = useRef('');

  const chatKey = requirements[0] ?? bulletText;
  const itemState = gapChat.getItemState(chatKey);
  const messages = itemState?.messages ?? [];
  const isLoading = itemState?.isLoading ?? false;
  const resolvedLanguage = itemState?.resolvedLanguage ?? null;

  const display = REVIEW_STATE_DISPLAY[reviewState];
  const openingMessage = getOpeningMessage(reviewState, requirements);
  const quickReplies = getQuickReplies(reviewState);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;
    lastSentRef.current = trimmed;
    setInputValue('');
    gapChat.sendMessage(
      chatKey,
      trimmed,
      chatContext,
      reviewState === 'code_red' ? 'missing' : reviewState === 'confirm_fit' ? 'partial' : 'partial',
    );
  }, [inputValue, isLoading, chatKey, chatContext, reviewState, gapChat]);

  const handleQuickReply = useCallback((message: string) => {
    if (isLoading) return;
    lastSentRef.current = message;
    gapChat.sendMessage(
      chatKey,
      message,
      chatContext,
      reviewState === 'code_red' ? 'missing' : 'partial',
    );
  }, [isLoading, chatKey, chatContext, reviewState, gapChat]);

  // Suggested language handling
  const latestSuggestedLanguage = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.suggestedLanguage?.trim())
    ?.suggestedLanguage;

  const [draftValue, setDraftValue] = useState('');
  useEffect(() => {
    if (latestSuggestedLanguage) setDraftValue(latestSuggestedLanguage);
  }, [latestSuggestedLanguage]);

  const handleApply = useCallback(() => {
    const text = draftValue.trim() || latestSuggestedLanguage?.trim();
    if (!text) return;
    onApplyToResume(section, bulletIndex, text);
    onClose();
  }, [draftValue, latestSuggestedLanguage, section, bulletIndex, onApplyToResume, onClose]);

  return (
    <div
      className="mt-3 rounded-lg border border-neutral-200 bg-white shadow-lg overflow-hidden"
      role="dialog"
      aria-label="Edit bullet conversation"
    >
      {/* Header: bullet text + close */}
      <div className="flex items-start gap-3 px-4 py-3 border-b border-neutral-100 bg-neutral-50">
        <div className="flex-1 min-w-0">
          <span
            className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider mb-1.5"
            style={{
              color: display.colorHex,
              backgroundColor: `${display.colorHex}11`,
              border: `1px solid ${display.colorHex}33`,
            }}
          >
            {display.label}
          </span>
          <p className="text-[13px] leading-relaxed text-neutral-700 line-clamp-2">{bulletText}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          aria-label="Close editor"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Chat messages */}
      <div className="max-h-[360px] overflow-y-auto px-4 py-3 space-y-3">
        {/* Opening message (always first) */}
        <AssistantBubble content={openingMessage} />

        {/* Conversation messages */}
        {messages.map((msg, i) => (
          msg.role === 'user'
            ? <UserBubble key={i} content={msg.content} />
            : <AssistantBubble key={i} content={msg.content} />
        ))}

        {isLoading && <LoadingDots />}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested language block */}
      {latestSuggestedLanguage && !resolvedLanguage && (
        <div className="px-4 py-3 border-t border-neutral-100 bg-emerald-50/50">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
            Updated bullet ready to review
          </span>
          <textarea
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            rows={3}
            aria-label="Edit suggested bullet text"
            className="mt-2 w-full resize-y rounded-md border border-emerald-200 bg-white px-3 py-2 text-[13px] leading-relaxed text-neutral-800 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={handleApply}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-emerald-700 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Apply to Resume
            </button>
          </div>
        </div>
      )}

      {/* Quick replies — visible until the user sends their first message */}
      {!isLoading && messages.every(m => m.role === 'assistant') && (
        <div className="px-4 py-2 border-t border-neutral-100 flex flex-wrap gap-2">
          {quickReplies.map((qr) => (
            <button
              key={qr.label}
              type="button"
              onClick={() => handleQuickReply(qr.message)}
              className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[12px] font-medium text-neutral-600 hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
            >
              {qr.label}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      {!resolvedLanguage && (
        <div className="flex items-end gap-2 px-4 py-3 border-t border-neutral-100 bg-neutral-50">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type your response..."
            rows={1}
            className="flex-1 resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-700 placeholder:text-neutral-400 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            className="shrink-0 rounded-md bg-blue-600 p-2 text-white hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Send message"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
