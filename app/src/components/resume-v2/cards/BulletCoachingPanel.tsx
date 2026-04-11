import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
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
  const [showTryAnother, setShowTryAnother] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [enhanceResult, setEnhanceResult] = useState<EnhanceResult | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [usedAction, setUsedAction] = useState<string | null>(null);

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
        onClose();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // ── Reset enhance state when bullet changes ────────────────────────────────
  useEffect(() => {
    setEnhanceResult(null);
    setIsEnhancing(false);
    setUsedAction(null);
    setShowTryAnother(false);
  }, [bulletText, section, bulletIndex]);

  // ── Section display name ──────────────────────────────────────────────────
  const sectionDisplayName = chatContext.sectionLabel ?? section;

  // ── Metadata builder ──────────────────────────────────────────────────────
  const applyMetadata = useCallback(
    (overrides?: Partial<OptimisticResumeEditMetadata>): OptimisticResumeEditMetadata => ({
      requirement: requirements[0],
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
  const handleAcceptSuggestion = useCallback((text: string) => {
    onApplyToResume(section, bulletIndex, text, applyMetadata());
    onClose();
  }, [applyMetadata, onApplyToResume, onClose, section, bulletIndex]);

  // ── On-demand AI enhancement ──────────────────────────────────────────────
  const handleEnhance = useCallback(async (action: string) => {
    if (!onBulletEnhance || isEnhancing) return;
    setIsEnhancing(true);
    setUsedAction(action);
    setShowTryAnother(false);
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
        setEnhanceResult(result);
      }
    } finally {
      setIsEnhancing(false);
    }
  }, [onBulletEnhance, isEnhancing, bulletText, requirements, evidenceFound, chatContext.lineKind, chatContext.sectionLabel, section, sourceEvidence]);

  // ── Apply from custom edit ────────────────────────────────────────────────
  const handleApplyEdit = useCallback(() => {
    const text = editDraft.trim();
    if (!text) return;
    onApplyToResume(section, bulletIndex, text, applyMetadata());
    onClose();
  }, [applyMetadata, editDraft, onApplyToResume, onClose, section, bulletIndex]);

  // ── Open edit area ────────────────────────────────────────────────────────
  const handleOpenEdit = useCallback((seed?: string) => {
    setEditDraft(seed ?? bulletText);
    setShowCustomEdit(true);
  }, [bulletText]);

  // ── Angle actions ─────────────────────────────────────────────────────────
  const allAngleActions = getEnhanceActionsForSection(sectionType);
  const remainingAngleActions = usedAction
    ? allAngleActions.filter((c) => c.action !== usedAction)
    : allAngleActions;

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
        ) : isEnhancing ? (
          /* Shimmer */
          <div className="space-y-2 animate-pulse">
            <div className="h-4 bg-[var(--surface-1)] rounded w-full" />
            <div className="h-4 bg-[var(--surface-1)] rounded w-5/6" />
            <div className="h-4 bg-[var(--surface-1)] rounded w-4/6" />
          </div>
        ) : enhanceResult ? (
          /* AI result */
          <>
            <p className="text-sm leading-relaxed text-[var(--text-strong)]">
              {enhanceResult.enhancedBullet}
            </p>
            {enhanceResult.alternatives.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-[var(--text-soft)]">Other angles:</p>
                {enhanceResult.alternatives.slice(0, 3).map((alt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleAcceptSuggestion(alt.text)}
                    className="block w-full text-left text-xs text-[var(--text-soft)] hover:text-[var(--text-strong)] py-1 px-2 rounded hover:bg-[var(--surface-1)] transition-colors"
                  >
                    <span className="font-medium">{alt.angle}:</span>{' '}
                    {alt.text.slice(0, 80)}{alt.text.length > 80 ? '…' : ''}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          /* Angle selection — default state */
          <>
            <p className="text-sm text-[var(--text-soft)]">
              How should we strengthen this?
            </p>
            <div className="flex flex-wrap gap-2">
              {allAngleActions.map((config) => (
                <button
                  key={config.action}
                  type="button"
                  onClick={() => handleEnhance(config.action)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                  title={config.description}
                >
                  {config.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Action buttons ─────────────────────────────────────────────────── */}
      {!showCustomEdit && (
        <div className={cn(
          'px-4 py-3 border-t border-[var(--line-soft)] flex items-center gap-3',
        )}>
          {enhanceResult ? (
            <>
              <button
                type="button"
                onClick={() => handleAcceptSuggestion(enhanceResult.enhancedBullet)}
                className="rounded-lg px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                Use This
              </button>
              <button
                type="button"
                onClick={() => handleOpenEdit(enhanceResult.enhancedBullet)}
                className="rounded-lg px-3 py-2 text-sm font-medium bg-[var(--surface-3)] hover:bg-[var(--surface-elevated)] text-[var(--text-soft)] transition-colors"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={onClose}
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
                onClick={onClose}
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

      {/* ── Try a different angle (when result exists) ─────────────────────── */}
      {enhanceResult && !showCustomEdit && remainingAngleActions.length > 0 && (
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={() => setShowTryAnother((v) => !v)}
            className="flex items-center gap-1 text-xs text-[var(--text-soft)] hover:text-[var(--text-strong)] transition-colors"
          >
            {showTryAnother ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Try a different angle
          </button>
          {showTryAnother && (
            <div className="mt-2 flex flex-wrap gap-2">
              {remainingAngleActions.map((config) => (
                <button
                  key={config.action}
                  type="button"
                  onClick={() => handleEnhance(config.action)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium bg-[var(--surface-3)] hover:bg-[var(--surface-elevated)] text-[var(--text-soft)] border border-[var(--line-soft)] transition-colors"
                  title={config.description}
                >
                  {config.label}
                </button>
              ))}
            </div>
          )}
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
