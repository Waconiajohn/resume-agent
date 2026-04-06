/**
 * BulletCoachingPanel — AI-first suggestion-driven bullet coaching interface.
 *
 * Replaces BulletConversationEditor with a structured coaching flow:
 *   1. Context header   — what requirement this bullet is proving
 *   2. Before / after   — current text vs selected suggestion
 *   3. Suggestion cards — 2-3 AI-drafted alternatives to pick from
 *   4. Enhance bar      — one-click transformations (metrics / impact / specific)
 *   5. Coaching tips    — collapsible coaching text (expanded by default for code_red)
 *   6. Action bar       — Apply / Edit / Write My Own / Remove
 *
 * For code_red without existing evidence, suggestions are suppressed and the
 * coaching section expands with a context-gathering textarea rendered ABOVE
 * the collapsible (not inside it).
 *
 * Backward-compatible export: also exported as `BulletConversationEditor`
 * so the parent ResumeDocumentCard requires no changes.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Trash2, PencilLine, Sparkles, Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResumeReviewState, RequirementSource, GapChatContext } from '@/types/resume-v2';
import type { GapChatHook } from '@/hooks/useGapChat';
import type { EnhanceResult } from '@/hooks/useBulletEnhance';
import { BulletContextHeader } from './bullet-coaching/BulletContextHeader';
import { BulletBeforeAfter } from './bullet-coaching/BulletBeforeAfter';
import { AISuggestionCards } from './bullet-coaching/AISuggestionCards';
import { EnhanceButtonBar } from './bullet-coaching/EnhanceButtonBar';
import type { EnhanceAction } from './bullet-coaching/EnhanceButtonBar';
import { CoachingCollapsible } from './bullet-coaching/CoachingCollapsible';
import { CustomEditArea } from './bullet-coaching/CustomEditArea';

// ─── Types ────────────────────────────────────────────────────────────────────

export type { EnhanceResult };

export interface BulletCoachingPanelProps {
  // Existing props preserved from BulletConversationEditor
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
  // New: optional AI enhancement handler
  onBulletEnhance?: (
    action: string,
    bulletText: string,
    requirement: string,
    evidence?: string,
  ) => Promise<EnhanceResult | null>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Derive the coaching text the collapsible should display.
 * Falls back gracefully when no strategy coaching policy is available.
 */
function buildCoachingText(
  reviewState: ResumeReviewState,
  requirements: string[],
  evidenceFound: string,
): string {
  const req = requirements[0] ?? 'this requirement';
  const evidence = evidenceFound.trim();

  switch (reviewState) {
    case 'code_red':
      return evidence
        ? `I found related experience in your resume: "${evidence}".\n\nIf there's a specific project or outcome behind this, share it and we'll rewrite accurately. Or we can remove this line if it truly doesn't fit.`
        : `We need proof for "${req}" before this bullet can stay on your resume.\n\nTell us what you've actually done in this area — even on a smaller scale or under a different title counts.`;
    case 'confirm_fit':
      return evidence
        ? `This comes from the benchmark for this role. We found "${evidence}" in your background that's related. Does this honestly describe how you've worked?`
        : `This comes from the benchmark for this role — not directly from your background. Confirm it honestly describes you, or tell us what the real story is.`;
    case 'strengthen':
      return `You have real experience here. The bullet needs to connect it more clearly to "${req}".\n\nCan you quantify the outcome? Even an estimate works. Was there a notable scope or scale? A specific result you remember?`;
    default:
      return '';
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BulletCoachingPanel({
  bulletText,
  section,
  bulletIndex,
  requirements,
  reviewState,
  requirementSource,
  evidenceFound,
  gapChat,
  chatContext,
  onApplyToResume,
  onRemoveBullet,
  onClose,
  onBulletEnhance,
}: BulletCoachingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Internal state ─────────────────────────────────────────────────────────
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(null);
  const [enhanceAction, setEnhanceAction] = useState<string | null>(null);
  const [enhanceResult, setEnhanceResult] = useState<EnhanceResult | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [showCustomEdit, setShowCustomEdit] = useState(false);
  // code_red context-gathering input
  const [codeRedContext, setCodeRedContext] = useState('');
  const [isSubmittingContext, setIsSubmittingContext] = useState(false);
  // Remove confirmation state
  const [confirmRemove, setConfirmRemove] = useState(false);

  // ── Focus panel on mount (Fix 10) ─────────────────────────────────────────
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // ── Cleanup confirmRemove timeout on unmount ───────────────────────────────
  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    };
  }, []);

  // ── Derive chat state from the gap-chat hook ───────────────────────────────
  const chatKey = requirements[0] ?? bulletText;
  const itemState = gapChat.getItemState(chatKey);
  const isChatLoading = itemState?.isLoading ?? false;

  // ── Alternative bullets — prefer enhance results, fall back to chatContext ─
  const chatAlternatives = chatContext.alternativeBullets ?? [];
  const alternatives = enhanceResult?.alternatives ?? chatAlternatives;

  // ── Determine the currently displayed suggestion ───────────────────────────
  const primarySuggestion =
    selectedSuggestion !== null && alternatives[selectedSuggestion]
      ? alternatives[selectedSuggestion].text
      : enhanceResult?.enhancedBullet ?? null;

  // ── When new alternatives arrive, auto-select the first ───────────────────
  const prevAlternativesRef = useRef(alternatives);
  useEffect(() => {
    if (alternatives !== prevAlternativesRef.current) {
      prevAlternativesRef.current = alternatives;
      if (alternatives.length > 0) {
        setSelectedSuggestion(0);
      }
    }
  }, [alternatives]);

  // ── Escape to close ────────────────────────────────────────────────────────
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

  // ── Enhance handler ────────────────────────────────────────────────────────
  const handleEnhance = useCallback(async (action: EnhanceAction) => {
    if (!onBulletEnhance || isEnhancing) return;
    setEnhanceAction(action);
    setIsEnhancing(true);
    setEnhanceError(null);
    try {
      const result = await onBulletEnhance(
        action,
        bulletText,
        requirements[0] ?? '',
        evidenceFound,
      );
      if (result) {
        setEnhanceResult(result);
        setEnhanceError(null);
        setSelectedSuggestion(result.alternatives.length > 0 ? 0 : null);
      } else {
        setEnhanceError('Enhancement failed. Please try again.');
        setIsEnhancing(false);
        setEnhanceAction(null);
      }
    } finally {
      setIsEnhancing(false);
      setEnhanceAction(null);
    }
  }, [onBulletEnhance, isEnhancing, bulletText, requirements, evidenceFound]);

  // ── Accept suggestion shortcut ─────────────────────────────────────────────
  const handleAcceptSuggestion = useCallback((text: string) => {
    onApplyToResume(section, bulletIndex, text);
    onClose();
  }, [onApplyToResume, onClose, section, bulletIndex]);

  // ── Apply from custom edit area ────────────────────────────────────────────
  const handleApplyEdit = useCallback(() => {
    const text = editDraft.trim();
    if (!text) return;
    onApplyToResume(section, bulletIndex, text);
    onClose();
  }, [editDraft, onApplyToResume, onClose, section, bulletIndex]);

  // ── Open "Edit" — pre-populate with selected suggestion ───────────────────
  const handleOpenEdit = useCallback(() => {
    setEditDraft(primarySuggestion ?? bulletText);
    setShowCustomEdit(true);
  }, [primarySuggestion, bulletText]);

  // ── Open "Write My Own" — pre-populate with current bullet text ───────────
  const handleWriteMyOwn = useCallback(() => {
    setEditDraft(bulletText);
    setShowCustomEdit(true);
  }, [bulletText]);

  // ── code_red context submit — sends to gap-chat for rewrite ───────────────
  const handleSubmitCodeRedContext = useCallback(() => {
    const text = codeRedContext.trim();
    if (!text || isChatLoading) return;
    setIsSubmittingContext(true);
    const classification = 'missing';
    gapChat.sendMessage(chatKey, text, chatContext, classification).finally(() => {
      setIsSubmittingContext(false);
      setCodeRedContext('');
    });
  }, [codeRedContext, isChatLoading, gapChat, chatKey, chatContext]);

  // ── Derived display flags ─────────────────────────────────────────────────
  const isCodeRedNoEvidence =
    reviewState === 'code_red' && !evidenceFound.trim() && alternatives.length === 0;
  const coachingText = buildCoachingText(reviewState, requirements, evidenceFound);
  const coachingExpandedDefault = reviewState === 'code_red';
  const primaryRequirement = requirements[0];

  // ── Plain-language explanation of why this bullet is being coached ─────────
  const explanationText: string = {
    code_red:
      "This bullet needs proof — we couldn't find evidence for this claim in your resume.",
    confirm_fit:
      'This comes from the benchmark profile for this role — confirm it matches your experience.',
    strengthen:
      'This addresses a job requirement but could be more specific and impactful.',
    supported: 'This bullet is backed by your resume. No changes needed.',
    supported_rewrite: 'This bullet is backed by your resume. No changes needed.',
  }[reviewState] ?? '';

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="mt-3 space-y-3 rounded-xl border p-4 focus:outline-none"
      style={{
        background: 'var(--surface-elevated)',
        borderColor: 'var(--line-soft)',
        animation: 'fade-slide-in 200ms ease-out forwards',
      }}
    >
      {/* ── Close button ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: 'var(--text-soft)' }}
        >
          Bullet Coach
        </p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2"
          style={{ color: 'var(--text-soft)' }}
          aria-label="Close bullet coach"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 1a. Plain-language explanation of why this bullet is flagged */}
      {explanationText && (
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {explanationText}
        </p>
      )}

      {/* 1b. Job / benchmark requirement callout */}
      {requirements.length > 0 && (
        <div
          className="rounded-lg px-3 py-2"
          style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--line-soft)',
          }}
        >
          <p
            className="text-[10px] uppercase tracking-wider mb-1"
            style={{ color: 'var(--text-soft)' }}
          >
            {reviewState === 'confirm_fit' ? 'Benchmark requirement' : 'Job requirement'}
          </p>
          <p className="text-sm" style={{ color: 'var(--text-strong)' }}>
            {requirements[0]}
          </p>
        </div>
      )}

      {/* 1c. Context header */}
      {primaryRequirement && (
        <BulletContextHeader
          requirement={primaryRequirement}
          requirementSource={requirementSource}
          evidenceFound={evidenceFound}
          reviewState={reviewState}
        />
      )}

      {/* 2. Before / after — suppressed for code_red with no evidence */}
      {!isCodeRedNoEvidence && (
        <BulletBeforeAfter
          original={bulletText}
          suggestion={primarySuggestion}
          isLoading={isEnhancing}
          reviewState={reviewState}
        />
      )}

      {/* 3. AI suggestion cards */}
      {!isCodeRedNoEvidence && alternatives.length > 0 && (
        <AISuggestionCards
          alternatives={alternatives}
          selectedIndex={selectedSuggestion}
          onSelect={(i) => setSelectedSuggestion(i)}
          onAccept={handleAcceptSuggestion}
          disabled={isEnhancing || isChatLoading}
        />
      )}

      {/* 4. Enhance button bar — suppressed for code_red with no evidence */}
      {!isCodeRedNoEvidence && onBulletEnhance && (
        <EnhanceButtonBar
          onEnhance={handleEnhance}
          isEnhancing={isEnhancing}
          activeAction={enhanceAction}
          disabled={isChatLoading}
        />
      )}

      {/* 4a. Enhance error message */}
      {enhanceError && (
        <div className="mx-4 mb-3 rounded-lg border border-[var(--badge-red-border)] bg-[var(--badge-red-bg)] px-3 py-2">
          <p className="text-xs text-[var(--badge-red-text)]">{enhanceError}</p>
        </div>
      )}

      {/* 5a. code_red context input — rendered directly, NOT inside collapsible (Fix 4) */}
      {isCodeRedNoEvidence && (
        <div className="space-y-2">
          <p
            className="text-[12px] leading-relaxed"
            style={{ color: 'var(--text-muted)' }}
          >
            Tell us about your experience with{' '}
            <span
              className="font-medium"
              style={{ color: 'var(--text-strong)' }}
            >
              {primaryRequirement ?? 'this requirement'}
            </span>
            . Even a small-scale or adjacent example gives us something to work with.
          </p>
          <div className="flex items-end gap-2">
            <textarea
              value={codeRedContext}
              onChange={(e) => setCodeRedContext(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitCodeRedContext();
                }
              }}
              placeholder="Describe what you've actually done in this area…"
              rows={3}
              disabled={isChatLoading || isSubmittingContext}
              aria-label="Provide context about your experience"
              className={cn(
                'flex-1 resize-none rounded-lg border px-3 py-2 text-[13px] leading-relaxed',
                'transition-colors duration-150 focus:outline-none',
                (isChatLoading || isSubmittingContext) && 'opacity-50 cursor-not-allowed',
              )}
              style={{
                background: 'var(--surface-1)',
                borderColor: 'var(--line-soft)',
                color: 'var(--text-strong)',
              }}
            />
            <button
              type="button"
              onClick={handleSubmitCodeRedContext}
              disabled={!codeRedContext.trim() || isChatLoading || isSubmittingContext}
              className={cn(
                'shrink-0 min-h-[44px] rounded-lg px-3 py-2 transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2',
                (!codeRedContext.trim() || isChatLoading || isSubmittingContext) &&
                  'opacity-40 cursor-not-allowed',
              )}
              style={{
                background: 'var(--badge-blue-bg)',
                color: 'var(--badge-blue-text)',
                border: '1px solid var(--badge-blue-text)',
              }}
              aria-label="Submit context to coach"
            >
              {isChatLoading || isSubmittingContext ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* 5b. Coaching collapsible — no children for code_red (context moved above) */}
      <CoachingCollapsible
        defaultExpanded={coachingExpandedDefault}
        coachingText={coachingText}
      />

      {/* 6. Custom edit area (conditional) */}
      {showCustomEdit && (
        <CustomEditArea
          value={editDraft}
          onChange={setEditDraft}
          onApply={handleApplyEdit}
          onReset={() => setEditDraft(primarySuggestion ?? bulletText)}
          originalSuggestion={primarySuggestion ?? bulletText}
          disabled={isEnhancing || isChatLoading}
        />
      )}

      {/* 7. Action bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"
        style={{ borderTopColor: 'var(--line-soft)' }}
      >
        {/* Left: primary actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Apply to Resume — shown whenever there is a suggestion and no custom edit open */}
          {primarySuggestion && !showCustomEdit && (
            <button
              type="button"
              onClick={() => handleAcceptSuggestion(primarySuggestion)}
              disabled={isEnhancing || isChatLoading}
              className={cn(
                'inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold',
                'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2',
                (isEnhancing || isChatLoading) && 'opacity-50 cursor-not-allowed',
              )}
              style={{
                background: 'var(--btn-primary-bg)',
                border: '1px solid var(--btn-primary-border)',
                color: 'var(--btn-primary-text)',
              }}
              aria-label="Apply selected suggestion to resume"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Apply to Resume
            </button>
          )}

          {/* Edit — opens custom edit area with the selected suggestion */}
          {primarySuggestion && !showCustomEdit && (
            <button
              type="button"
              onClick={handleOpenEdit}
              disabled={isEnhancing || isChatLoading}
              className={cn(
                'inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium',
                'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2',
                (isEnhancing || isChatLoading) && 'opacity-50 cursor-not-allowed',
              )}
              style={{
                borderColor: 'var(--line-soft)',
                color: 'var(--text-muted)',
                background: 'transparent',
              }}
              aria-label="Edit the selected suggestion"
            >
              <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
              Edit
            </button>
          )}

          {/* Write My Own — opens custom edit area with original bullet */}
          {!showCustomEdit && (
            <button
              type="button"
              onClick={handleWriteMyOwn}
              disabled={isEnhancing || isChatLoading}
              className={cn(
                'inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium',
                'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2',
                (isEnhancing || isChatLoading) && 'opacity-50 cursor-not-allowed',
              )}
              style={{
                borderColor: 'var(--line-soft)',
                color: 'var(--text-soft)',
                background: 'transparent',
              }}
              aria-label="Write a custom bullet from scratch"
            >
              Write My Own
            </button>
          )}

          {/* Cancel custom edit */}
          {showCustomEdit && (
            <button
              type="button"
              onClick={() => setShowCustomEdit(false)}
              className="inline-flex min-h-[44px] items-center rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2"
              style={{
                borderColor: 'var(--line-soft)',
                color: 'var(--text-soft)',
                background: 'transparent',
              }}
              aria-label="Cancel editing"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Right: destructive action with confirmation (Fix 6) */}
        <button
          type="button"
          onClick={() => {
            if (confirmRemove) {
              onRemoveBullet(section, bulletIndex);
              onClose();
            } else {
              setConfirmRemove(true);
              confirmTimeoutRef.current = setTimeout(() => setConfirmRemove(false), 3000);
            }
          }}
          disabled={isEnhancing || isChatLoading}
          className={cn(
            'inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] font-medium',
            'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2',
            (isEnhancing || isChatLoading) && 'opacity-50 cursor-not-allowed',
            confirmRemove
              ? 'border'
              : '',
          )}
          style={
            confirmRemove
              ? {
                  background: 'var(--badge-red-bg)',
                  color: 'var(--badge-red-text)',
                  borderColor: 'var(--bullet-code-red-border)',
                }
              : { color: 'var(--text-soft)' }
          }
          onMouseEnter={(e) => {
            if (!confirmRemove) {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--badge-red-text)';
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--badge-red-bg)';
            }
          }}
          onMouseLeave={(e) => {
            if (!confirmRemove) {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-soft)';
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }
          }}
          aria-label={confirmRemove ? 'Confirm removal of this bullet' : 'Remove this bullet from the resume'}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          {confirmRemove ? 'Confirm removal' : 'Remove this bullet'}
        </button>
      </div>
    </div>
  );
}

// ─── Backward-compatibility alias ────────────────────────────────────────────

/**
 * Drop-in replacement for BulletConversationEditor.
 * ResumeDocumentCard imports this name — no change required in the parent.
 */
export { BulletCoachingPanel as BulletConversationEditor };
