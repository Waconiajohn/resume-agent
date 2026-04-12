import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { FramingGuardrail, NextBestAction, ProofLevel, ResumeReviewState, RequirementSource, GapChatContext } from '@/types/resume-v2';
import type { GapChatHook } from '@/hooks/useGapChat';
import type { EnhanceResult } from '@/hooks/useBulletEnhance';
import { CustomEditArea } from './bullet-coaching/CustomEditArea';
import type { OptimisticResumeEditMetadata } from '@/lib/resume-edit-progress';
import type { SectionType } from '@/lib/section-enhance-config';
import { getEnhanceActionsForSection } from '@/lib/section-enhance-config';

// ─── Types ────────────────────────────────────────────────────────────────────

export type { EnhanceResult };

export interface BulletCoachingPanelProps {
  bulletText: string;
  section: string;
  bulletIndex: number;
  requirements: string[];
  reviewState: ResumeReviewState;
  requirementSource?: RequirementSource;
  evidenceFound: string;
  sourceEvidence?: string;
  proofLevel?: ProofLevel;
  framingGuardrail?: FramingGuardrail;
  nextBestAction?: NextBestAction;
  gapChat: GapChatHook;
  chatContext: GapChatContext;
  onApplyToResume: (section: string, index: number, newText: string, metadata?: OptimisticResumeEditMetadata) => void;
  onRemoveBullet: (section: string, index: number) => void;
  onClose: () => void;
  /** Skip this item and advance to the next flagged item */
  onSkip?: () => void;
  canRemove?: boolean;
  initialReuseClarificationId?: string;
  /** @deprecated no longer used — kept for call-site backward compat */
  showCloseButton?: boolean;
  /** @deprecated no longer used — kept for call-site backward compat */
  isAIEnhanced?: boolean;
  /** @deprecated no longer used — kept for call-site backward compat */
  suggestionScore?: unknown;
  /** @deprecated no longer used — kept for call-site backward compat */
  queueSuggestedDraft?: string;
  /** Section type for context-aware enhancement actions */
  sectionType?: SectionType;
  onBulletEnhance?: (
    action: string,
    bulletText: string,
    requirement: string,
    evidence?: string,
    context?: Partial<GapChatContext>,
  ) => Promise<EnhanceResult | null>;
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
  sourceEvidence,
  proofLevel,
  framingGuardrail,
  nextBestAction,
  gapChat: _gapChat,
  chatContext,
  onApplyToResume,
  onRemoveBullet,
  onClose,
  onSkip,
  canRemove = true,
  initialReuseClarificationId: _initialReuseClarificationId,
  sectionType = 'experience_bullet',
  onBulletEnhance,
}: BulletCoachingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Internal state ─────────────────────────────────────────────────────────
  const [editDraft, setEditDraft] = useState('');
  const [showCustomEdit, setShowCustomEdit] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [enhanceCache, setEnhanceCache] = useState<Map<string, EnhanceResult>>(new Map());
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);

  // ── Focus panel on mount ───────────────────────────────────────────────────
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // ── Cleanup confirm timeout ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    };
  }, []);

  // ── Escape to close ────────────────────────────────────────────────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (showCustomEdit) {
          setShowCustomEdit(false);
        } else {
          onClose();
        }
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, showCustomEdit]);

  // ── Reset enhance state when bullet changes ────────────────────────────────
  useEffect(() => {
    setEnhanceCache(new Map());
    setActiveTab(null);
    setIsEnhancing(false);
    setEnhanceError(null);
    setShowCustomEdit(false);
    setEditDraft('');
    setConfirmRemove(false);
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
  }, [bulletText, section, bulletIndex]);

  // ── Section display name ──────────────────────────────────────────────────
  const sectionDisplayName = chatContext.sectionLabel ?? section;

  // ── Metadata builder ──────────────────────────────────────────────────────
  const applyMetadata = useCallback(
    (overrides?: Partial<OptimisticResumeEditMetadata>): OptimisticResumeEditMetadata => ({
      requirement: requirements[0] ?? '',
      requirements,
      reviewState,
      requirementSource,
      evidenceFound,
      proofLevel,
      framingGuardrail,
      nextBestAction,
      ...overrides,
    }),
    [evidenceFound, framingGuardrail, nextBestAction, proofLevel, requirementSource, requirements, reviewState],
  );

  // ── Accept a suggestion ────────────────────────────────────────────────────
  // Only call onApplyToResume — the parent (handleCoachApplyToResume) handles
  // advancing to the next item. Do NOT call onClose here — that would clear
  // activeBullet and flash back to the overview, overriding the advance.
  const handleAcceptSuggestion = useCallback((text: string) => {
    onApplyToResume(section, bulletIndex, text, applyMetadata());
  }, [applyMetadata, onApplyToResume, section, bulletIndex]);

  // ── On-demand AI enhancement (with cache) ────────────────────────────────
  const handleEnhance = useCallback(async (action: string) => {
    // If already cached, just switch tab
    if (enhanceCache.has(action)) {
      setActiveTab(action);
      return;
    }

    if (!onBulletEnhance || isEnhancing) return;
    setIsEnhancing(true);
    setActiveTab(action);
    setEnhanceError(null);
    try {
      const result = await onBulletEnhance(
        action,
        bulletText,
        requirements[0] ?? '',
        evidenceFound,
        {
          lineKind: chatContext.lineKind,
          sectionKey: section,
          sectionLabel: chatContext.sectionLabel,
          sourceEvidence: sourceEvidence ?? evidenceFound,
          relatedRequirements: requirements,
        },
      );
      if (result) {
        setEnhanceCache(prev => new Map(prev).set(action, result));
      } else {
        setEnhanceError('No suggestion generated — try a different angle.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Enhancement failed';
      setEnhanceError(msg);
    } finally {
      setIsEnhancing(false);
    }
  }, [onBulletEnhance, isEnhancing, bulletText, requirements, evidenceFound, chatContext, section, sourceEvidence, enhanceCache]);

  // ── Apply from custom edit ────────────────────────────────────────────────
  // Only call onApplyToResume — the parent (handleCoachApplyToResume) handles
  // advancing to the next item. Do NOT call onClose here — that would clear
  // activeBullet and flash back to the overview, overriding the advance.
  const handleApplyEdit = useCallback(() => {
    const text = editDraft.trim();
    if (!text) return;
    onApplyToResume(section, bulletIndex, text, applyMetadata());
  }, [applyMetadata, editDraft, onApplyToResume, section, bulletIndex]);

  // ── Open edit area ────────────────────────────────────────────────────────
  const handleOpenEdit = useCallback((seed?: string) => {
    setEditDraft(seed ?? bulletText);
    setShowCustomEdit(true);
  }, [bulletText]);

  // ── Derive active result from cache ──────────────────────────────────────
  const activeResult = activeTab ? (enhanceCache.get(activeTab) ?? null) : null;
  const allAngleActions = getEnhanceActionsForSection(sectionType);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      ref={panelRef}
      data-testid="bullet-coaching-panel"
      tabIndex={-1}
      className="mt-3 rounded-2xl border border-[var(--line-soft)] bg-[var(--surface-elevated)] focus:outline-none"
      style={{ animation: 'fade-slide-in 200ms ease-out forwards' }}
    >
      {/* ── Current text ──────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3">
        <p className="text-xs font-semibold text-[var(--text-soft)] uppercase tracking-wide mb-2">
          {sectionDisplayName}
        </p>
        <p className="text-sm leading-relaxed text-[var(--text-strong)]">
          {bulletText}
        </p>
      </div>

      <hr className="border-0 border-t border-dashed border-[var(--line-soft)] mx-4" />

      {/* ── Suggestion area ────────────────────────────────────────────────── */}
      <div className="px-4 py-3 space-y-3">
        {showCustomEdit ? (
          <CustomEditArea
            value={editDraft}
            onChange={setEditDraft}
            onApply={handleApplyEdit}
            onReset={() => setEditDraft(bulletText)}
            originalSuggestion={bulletText}
          />
        ) : (
          <>
            {/* "Based on your resume" notice */}
            <p className="text-[11px] text-[var(--text-soft)] flex items-center gap-1 mb-2">
              <span>✦</span> Suggestions based on facts from your resume
            </p>

            {/* Angle tabs — always visible */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {allAngleActions.map((config) => (
                <button
                  key={config.action}
                  type="button"
                  onClick={() => handleEnhance(config.action)}
                  disabled={isEnhancing && activeTab !== config.action}
                  title={config.description}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    activeTab === config.action
                      ? 'border-[var(--link)] bg-[var(--surface-1)] text-[var(--text-strong)]'
                      : 'border-[var(--line-strong)] text-[var(--text-soft)] hover:bg-[var(--surface-1)] hover:text-[var(--text-strong)]',
                    enhanceCache.has(config.action) && activeTab !== config.action && 'border-[var(--badge-green-text)]/40',
                    isEnhancing && activeTab !== config.action && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  {config.label}
                  {enhanceCache.has(config.action) && <span className="ml-1 text-[9px]">✓</span>}
                </button>
              ))}
            </div>

            {/* Result area */}
            {isEnhancing && !activeResult ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-4 bg-[var(--surface-1)] rounded w-full" />
                <div className="h-4 bg-[var(--surface-1)] rounded w-5/6" />
                <div className="h-4 bg-[var(--surface-1)] rounded w-4/6" />
              </div>
            ) : activeResult ? (
              <p className="text-sm leading-relaxed text-[var(--text-strong)]">
                {activeResult.enhancedBullet}
              </p>
            ) : enhanceError ? (
              <p className="text-sm text-red-500">{enhanceError}</p>
            ) : null}
          </>
        )}
      </div>

      {/* ── Action buttons ─────────────────────────────────────────────────── */}
      {!showCustomEdit && (
        <div className={cn(
          'px-4 py-3 border-t border-[var(--line-soft)] flex items-center gap-3',
        )}>
          {activeResult ? (
            <>
              <button
                type="button"
                onClick={() => handleAcceptSuggestion(activeResult.enhancedBullet)}
                className="rounded-lg px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                Use This
              </button>
              <button
                type="button"
                onClick={() => handleOpenEdit(activeResult.enhancedBullet)}
                className="rounded-lg px-3 py-2 text-sm font-medium bg-[var(--surface-3)] hover:bg-[var(--surface-elevated)] text-[var(--text-soft)] transition-colors"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={onSkip ?? onClose}
                className="text-sm font-medium text-[var(--text-soft)] hover:text-[var(--text-strong)] transition-colors"
              >
                Skip
              </button>
            </>
          ) : !isEnhancing ? (
            <>
              <button
                type="button"
                onClick={() => handleOpenEdit(bulletText)}
                className="text-sm font-medium text-[var(--text-soft)] hover:text-[var(--text-strong)] transition-colors"
              >
                Edit Myself
              </button>
              <button
                type="button"
                onClick={onSkip ?? onClose}
                className="text-sm font-medium text-[var(--text-soft)] hover:text-[var(--text-strong)] transition-colors"
              >
                Skip
              </button>
            </>
          ) : null}
        </div>
      )}

      {/* ── Cancel custom edit ─────────────────────────────────────────────── */}
      {showCustomEdit && (
        <div className="border-t border-[var(--line-soft)] px-4 py-3">
          <button
            type="button"
            onClick={() => setShowCustomEdit(false)}
            className="rounded-lg px-3 py-2 text-sm font-medium bg-[var(--surface-3)] hover:bg-[var(--surface-elevated)] text-[var(--text-soft)] transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── Remove line ────────────────────────────────────────────────────── */}
      {canRemove && !showCustomEdit && (
        <div className="border-t border-[var(--line-soft)] px-4 py-2">
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
            aria-label={confirmRemove ? 'Confirm removal of this line' : 'Remove this line from the resume'}
            className={cn(
              'text-xs font-medium transition-colors',
              confirmRemove
                ? 'text-red-400 font-semibold'
                : 'text-[var(--text-soft)] hover:text-red-400',
            )}
          >
            {confirmRemove ? 'Confirm removal' : 'Remove this line'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Backward-compatibility alias ────────────────────────────────────────────

/**
 * Drop-in replacement for BulletConversationEditor.
 * ResumeDocumentCard imports this name — no change required in the parent.
 */
export { BulletCoachingPanel as BulletConversationEditor };
