/**
 * BulletConversationEditor — Coaching conversation for resolving colored bullets.
 *
 * Opens inline below a bullet in the resume document. The AI coaches the
 * executive through surfacing their real story, then produces a rewrite
 * grounded in truth. Uses useGapChat for the conversation engine.
 *
 * Three states, three conversations:
 *   code_red   — "We need your story" — surface proof or remove
 *   confirm_fit — "Does this honestly describe you?" — verify or rewrite
 *   strengthen — "Here's a stronger version" — refine or accept
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, X, Sparkles, Trash2 } from 'lucide-react';
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
  onRemoveBullet: (section: string, index: number) => void;
  onClose: () => void;
}

// ─── State-specific opening messages ─────────────────────────────────────────

function getOpeningMessage(reviewState: ResumeReviewState, requirements: string[]): string {
  const req = requirements[0] ?? 'this requirement';
  switch (reviewState) {
    case 'code_red':
      return (
        `I wrote this bullet to address "${req}" but I couldn\u2019t find the real experience ` +
        `behind it in your resume. Before we decide what to do with it, tell me \u2014 have you ` +
        `actually done this? Even in a different context or a different role?`
      );
    case 'confirm_fit':
      return (
        `This line comes from what the ideal candidate for this role looks like \u2014 not ` +
        `directly from your background. Does this honestly describe you? Tell me where it ` +
        `fits or where it doesn\u2019t.`
      );
    case 'strengthen':
      return (
        `You have real experience here \u2014 I can see it. But this bullet isn\u2019t making ` +
        `the connection obvious enough to a hiring manager. Here\u2019s what I think would land ` +
        `harder. What do you think \u2014 does this feel true to what you did?`
      );
    default:
      return 'How would you like to improve this bullet?';
  }
}

// ─── Border color per state ──────────────────────────────────────────────────

function stateBorderClass(reviewState: ResumeReviewState): string {
  switch (reviewState) {
    case 'code_red': return 'border-l-[#8f2d2d]';
    case 'confirm_fit': return 'border-l-[#2563eb]';
    case 'strengthen': return 'border-l-[#b45309]';
    default: return 'border-l-neutral-300';
  }
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
  onRemoveBullet,
  onClose,
}: BulletConversationEditorProps) {
  const [inputValue, setInputValue] = useState('');
  const [applyDraft, setApplyDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const chatKey = requirements[0] ?? bulletText;
  const itemState = gapChat.getItemState(chatKey);
  const messages = itemState?.messages ?? [];
  const isLoading = itemState?.isLoading ?? false;

  const classification: 'missing' | 'partial' | 'strong' =
    reviewState === 'code_red' ? 'missing' : 'partial';

  const openingMessage = getOpeningMessage(reviewState, requirements);

  // Find the latest AI-suggested rewrite
  const latestRewrite = [...messages]
    .reverse()
    .find(m => m.role === 'assistant' && m.suggestedLanguage?.trim())
    ?.suggestedLanguage ?? null;

  // Sync apply draft when a new rewrite arrives
  useEffect(() => {
    if (latestRewrite) setApplyDraft(latestRewrite);
  }, [latestRewrite]);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const sendMessage = useCallback((text: string) => {
    if (!text.trim() || isLoading) return;
    setInputValue('');
    gapChat.sendMessage(chatKey, text.trim(), chatContext, classification);
  }, [isLoading, chatKey, chatContext, classification, gapChat]);

  const handleSubmit = useCallback(() => {
    sendMessage(inputValue);
  }, [inputValue, sendMessage]);

  const handleApply = useCallback(() => {
    const text = applyDraft.trim() || latestRewrite?.trim();
    if (!text) return;
    onApplyToResume(section, bulletIndex, text);
    onClose();
  }, [applyDraft, latestRewrite, section, bulletIndex, onApplyToResume, onClose]);

  const handleRemove = useCallback(() => {
    onRemoveBullet(section, bulletIndex);
    onClose();
  }, [section, bulletIndex, onRemoveBullet, onClose]);

  return (
    <div
      ref={editorRef}
      className={`mt-3 rounded-lg border border-l-4 ${stateBorderClass(reviewState)} border-neutral-200 bg-white shadow-lg overflow-hidden`}
    >
      {/* Bullet text header */}
      <div className="flex items-start gap-3 px-5 pt-4 pb-3">
        <p className="flex-1 text-[13px] leading-relaxed text-neutral-600 italic">
          &ldquo;{bulletText}&rdquo;
        </p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          aria-label="Close editor"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Conversation */}
      <div className="max-h-[400px] overflow-y-auto px-5 pb-3 space-y-4">
        {/* AI opening */}
        <div className="text-[14px] leading-relaxed text-neutral-800">
          {openingMessage}
        </div>

        {/* Strengthen: show suggested rewrite immediately if no conversation yet */}
        {reviewState === 'strengthen' && messages.length === 0 && !latestRewrite && (
          <div className="rounded-md border border-amber-200 bg-amber-50/50 px-4 py-3">
            <p className="text-[13px] leading-relaxed text-neutral-700">
              {chatContext.currentStrategy || 'A stronger version of this bullet would connect your experience more directly to what this employer needs.'}
            </p>
          </div>
        )}

        {/* Conversation turns */}
        {messages.map((msg, i) => (
          <div key={i} className={msg.role === 'user' ? 'pl-6' : ''}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
              {msg.role === 'user' ? 'You' : 'Coach'}
            </p>
            <p className="text-[14px] leading-relaxed text-neutral-800">
              {msg.content}
            </p>
          </div>
        ))}

        {isLoading && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
              Coach
            </p>
            <div className="flex items-center gap-1.5" role="status" aria-label="Thinking">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="inline-block h-1.5 w-1.5 rounded-full bg-neutral-400 animate-[dot-bounce_1.4s_ease-in-out_infinite]"
                  style={{ animationDelay: `${i * 0.16}s` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Rewrite card — shown when AI produces a suggested rewrite */}
        {latestRewrite && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/50 px-4 py-3 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
              Rewritten bullet
            </p>
            <textarea
              value={applyDraft}
              onChange={e => setApplyDraft(e.target.value)}
              rows={3}
              aria-label="Edit rewritten bullet"
              className="w-full resize-y rounded-md border border-emerald-200 bg-white px-3 py-2 text-[13px] leading-relaxed text-neutral-800 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleApply}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-emerald-700 transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Apply to Resume
              </button>
              <button
                type="button"
                onClick={() => sendMessage("That's not quite right. Let me tell you more.")}
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-[13px] font-medium text-neutral-600 hover:bg-neutral-50 transition-colors"
              >
                Keep talking
              </button>
            </div>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Input area + action buttons */}
      <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-3 space-y-3">
        {/* Text input */}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Tell me what actually happened..."
            rows={2}
            className="flex-1 resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-700 placeholder:text-neutral-400 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!inputValue.trim() || isLoading}
            className="shrink-0 rounded-md bg-neutral-800 p-2 text-white hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Send"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Remove bullet — always available */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleRemove}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium text-neutral-400 hover:text-[#8f2d2d] hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-3 w-3" />
            Remove this bullet
          </button>
        </div>
      </div>
    </div>
  );
}
